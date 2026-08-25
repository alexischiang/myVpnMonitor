const crypto = require("crypto");
const express = require("express");
const defaultLogger = require("./logger");
const { withRedisLock } = require("./redis");
const { assertXuiRequestAllowed } = require("./xui-client");

const METHODS = new Set(["GET", "POST", "PUT", "DELETE"]);

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function panelLockKey(baseUrl) {
  return `xui:panel-write:${crypto.createHash("sha256").update(baseUrl).digest("hex").slice(0, 16)}`;
}

function trafficResetKey(userId, reason, reference) {
  const idempotencyKey = reason === "paid" ? `${reason}:${reference}` : `${userId}:${reason}:${reference}`;
  return `traffic-reset:${crypto.createHash("sha256").update(idempotencyKey).digest("hex")}`;
}

function validateTrafficReset(payload = {}) {
  const reason = String(payload.reason || "");
  const reference = String(reason === "calendar_month" ? payload.month || "" : payload.paymentOrderId || "").trim();
  if (!new Set(["calendar_month", "paid"]).has(reason)) throw Object.assign(new Error("流量重置原因无效。"), { statusCode: 400 });
  if (reason === "calendar_month" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(reference)) throw Object.assign(new Error("自然月必须使用 YYYY-MM 格式。"), { statusCode: 400 });
  if (reason === "paid" && (!reference || reference.length > 128)) throw Object.assign(new Error("付费重置必须提供支付订单号。"), { statusCode: 400 });
  return { reason, reference };
}

function validateRequest(payload = {}, config) {
  const baseUrl = String(payload.baseUrl || config.baseUrl || "").replace(/\/+$/, "");
  const apiToken = String(payload.apiToken || config.apiToken || "");
  const apiPath = String(payload.apiPath || "");
  const method = String(payload.method || "GET").toUpperCase();
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw new Error("3x-ui 地址无效。"); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("3x-ui 地址必须使用 HTTP 或 HTTPS。");
  if (!apiToken) throw new Error("3x-ui API Token 未配置。");
  if (!apiPath.startsWith("/") || apiPath.startsWith("//")) throw new Error("3x-ui API 路径无效。");
  if (!METHODS.has(method)) throw new Error("不支持该 3x-ui 请求方法。");
  return { baseUrl, apiToken, apiPath, method, body: payload.body };
}

async function callPanel(request, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${request.baseUrl}${request.apiPath}`, {
      method: request.method,
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${request.apiToken}`,
        ...(request.body === undefined ? {} : { "content-type": "application/json" })
      },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) })
    });
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; } catch { throw new Error(`3x-ui 返回了无效响应（HTTP ${response.status}）。`); }
    if (!response.ok || payload.success !== true) {
      const error = new Error(payload.msg || payload.error || `3x-ui 请求失败（HTTP ${response.status}）。`);
      error.statusCode = response.status;
      throw error;
    }
    return payload.obj;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("3x-ui 请求超时。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function persistXuiAudit(store, logger, entry) {
  if (!store.appendXuiAuditLog) return;
  try {
    await store.appendXuiAuditLog(entry);
  } catch (error) {
    logger.error?.({ error: error.message }, "Failed to persist 3x-ui audit log");
  }
}

function createXuiApp({ redis, store, token, baseUrl = "", apiToken = "", readOnly = false, timeoutMs = 15000, fetchImpl = fetch, logger = defaultLogger }) {
  if (!redis) throw new Error("Redis connection is required.");
  if (!store) throw new Error("3x-ui PostgreSQL store is required.");
  if (!token) throw new Error("XUI_SERVICE_TOKEN is required.");
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", async (_req, res) => {
    try {
      await Promise.all([redis.ping(), store.ping()]);
      res.json({ ok: true, redis: "ok", database: "ok" });
    } catch (error) {
      res.status(503).json({ ok: false, error: error.message });
    }
  });

  app.use("/internal", (req, res, next) => {
    const authorization = String(req.headers.authorization || "");
    if (!safeEqual(authorization, `Bearer ${token}`)) return res.status(401).json({ ok: false, error: "Unauthorized." });
    next();
  });

  app.post("/internal/request", async (req, res) => {
    const requestId = String(req.headers["x-request-id"] || crypto.randomUUID());
    const startedAt = Date.now();
    let request;
    res.setHeader("x-request-id", requestId);
    try {
      request = validateRequest(req.body, { baseUrl, apiToken });
      assertXuiRequestAllowed(readOnly, request.method, request.apiPath);
      const operation = () => callPanel(request, fetchImpl, timeoutMs);
      const data = request.method === "GET"
        ? await operation()
        // ponytail: one lock per panel is enough until measured write throughput requires per-client locks.
        : await withRedisLock(redis, panelLockKey(request.baseUrl), operation, { ttlMs: timeoutMs + 5000, waitMs: timeoutMs });
      const entry = { event: "xui.request", requestId, level: "info", transport: "proxy", method: request.method, apiPath: request.apiPath, panelHost: new URL(request.baseUrl).host, readOnly, allowed: true, statusCode: 200, durationMs: Date.now() - startedAt };
      logger.info(entry, "3x-ui request completed");
      await persistXuiAudit(store, logger, entry);
      res.json({ ok: true, data });
    } catch (error) {
      const entry = { event: "xui.request", requestId, level: "warn", transport: "proxy", method: request?.method || req.body?.method, apiPath: request?.apiPath || req.body?.apiPath, panelHost: request ? new URL(request.baseUrl).host : undefined, readOnly, allowed: error.code !== "XUI_READ_ONLY", statusCode: error.statusCode || 502, durationMs: Date.now() - startedAt, error: error.message };
      logger.warn(entry, error.code === "XUI_READ_ONLY" ? "3x-ui request blocked" : "3x-ui request failed");
      await persistXuiAudit(store, logger, entry);
      res.status(error.statusCode || 502).json({ ok: false, error: error.message, code: error.code });
    }
  });

  app.get("/internal/state/:key", async (req, res) => {
    try {
      res.json({ ok: true, data: await store.getState(req.params.key) });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.put("/internal/state/:key", async (req, res) => {
    try {
      await store.setState(req.params.key, req.body);
      res.json({ ok: true, data: req.body });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get("/internal/clients/:userId", async (req, res) => {
    try {
      res.json({ ok: true, data: await store.getClient(req.params.userId) });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.put("/internal/clients/:userId", async (req, res) => {
    try {
      await store.setClient(req.params.userId, req.body);
      res.json({ ok: true, data: req.body });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get("/internal/logs", async (req, res) => {
    try {
      if (!store.listXuiAuditLogs) throw Object.assign(new Error("3x-ui 日志存储尚未配置。"), { statusCode: 503 });
      res.json({ ok: true, data: await store.listXuiAuditLogs(req.query) });
    } catch (error) {
      res.status(error.statusCode || 500).json({ ok: false, error: error.message });
    }
  });

  app.post("/internal/clients/:userId/traffic-reset", async (req, res) => {
    const requestId = String(req.headers["x-request-id"] || crypto.randomUUID());
    const startedAt = Date.now();
    const userId = String(req.params.userId || "");
    res.setHeader("x-request-id", requestId);
    try {
      const { reason, reference } = validateTrafficReset(req.body);
      assertXuiRequestAllowed(readOnly, "POST", "/panel/api/clients/resetTraffic/:email");
      const key = trafficResetKey(userId, reason, reference);
      const operation = async () => {
        const previous = await store.getState(key);
        if (previous?.userId && previous.userId !== userId) throw Object.assign(new Error("该支付订单已用于其他用户重置流量。"), { statusCode: 409 });
        if (previous) return { ...previous, replayed: true };
        const client = await store.getClient(userId);
        const email = String(client?.email || "").trim().toLowerCase();
        if (!email) throw Object.assign(new Error("用户尚未关联 3x-ui Client。"), { statusCode: 404 });
        const request = validateRequest({ apiPath: `/panel/api/clients/resetTraffic/${encodeURIComponent(email)}`, method: "POST" }, { baseUrl, apiToken });
        await callPanel(request, fetchImpl, timeoutMs);

        const billing = await store.getState("billing");
        if (billing?.users?.[email]) {
          billing.users[email] = { ...billing.users[email], nodes: {}, rawBytes: 0, weightedBytes: 0, disabled: false, updatedAt: new Date().toISOString() };
          await store.setState("billing", billing);
        }
        const result = { userId, email, reason, reference, resetAt: new Date().toISOString(), replayed: false };
        await store.setState(key, result);
        return result;
      };
      const data = await withRedisLock(redis, `xui:traffic-reset:${crypto.createHash("sha256").update(key).digest("hex").slice(0, 16)}`, operation, { ttlMs: timeoutMs + 5000, waitMs: timeoutMs });
      const entry = { event: "xui.request", requestId, level: "info", transport: "proxy", method: "POST", apiPath: "/panel/api/clients/resetTraffic/:email", userId, readOnly, allowed: true, statusCode: 200, durationMs: Date.now() - startedAt };
      logger.info(entry, "3x-ui request completed");
      await persistXuiAudit(store, logger, entry);
      res.json({ ok: true, data });
    } catch (error) {
      const entry = { event: "xui.request", requestId, level: "warn", transport: "proxy", method: "POST", apiPath: "/panel/api/clients/resetTraffic/:email", userId, readOnly, allowed: error.code !== "XUI_READ_ONLY", statusCode: error.statusCode || 502, durationMs: Date.now() - startedAt, error: error.message };
      logger.warn(entry, error.code === "XUI_READ_ONLY" ? "3x-ui request blocked" : "3x-ui request failed");
      await persistXuiAudit(store, logger, entry);
      res.status(error.statusCode || 502).json({ ok: false, error: error.message, code: error.code });
    }
  });

  return app;
}

module.exports = { createXuiApp, validateRequest, validateTrafficReset };
