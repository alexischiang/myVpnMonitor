const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "subscriptions.json");
const DATA_DIR = path.dirname(DATA_FILE);
const USERS_FILE = process.env.USERS_FILE || path.join(DATA_DIR, "users.json");
const BILLS_FILE = process.env.BILLS_FILE || path.join(DATA_DIR, "bills.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS || 30 * 60 * 1000);
const LOW_TRAFFIC_BYTES = Number(process.env.LOW_TRAFFIC_BYTES || 50 * 1024 * 1024 * 1024);
const EXPIRING_SOON_DAYS = Number(process.env.EXPIRING_SOON_DAYS || 3);
const REQUEST_PROFILES = [
  {
    name: "shadowrocket",
    headers: {
      "User-Agent": "Shadowrocket/2.2.48 CFNetwork/1496.0.7 Darwin/23.5.0",
      "Accept": "*/*",
      "Accept-Language": "zh-CN,zh-Hans;q=0.9,en;q=0.8"
    }
  },
  {
    name: "clash",
    headers: {
      "User-Agent": "ClashforWindows/0.20.39",
      "Accept": "text/plain, application/yaml, */*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
    }
  },
  {
    name: "clash-meta",
    headers: {
      "User-Agent": "clash.meta",
      "Accept": "text/plain, application/yaml, */*"
    }
  },
  {
    name: "stash",
    headers: {
      "User-Agent": "Stash/2.5.11",
      "Accept": "*/*",
      "Accept-Language": "zh-Hans-CN;q=1"
    }
  },
  {
    name: "surge",
    headers: {
      "User-Agent": "Surge iOS/2998",
      "Accept": "*/*",
      "Accept-Language": "zh-CN,zh-Hans;q=0.9,en;q=0.8"
    }
  },
  {
    name: "quantumult-x",
    headers: {
      "User-Agent": "Quantumult%20X/1.0.30",
      "Accept": "*/*"
    }
  },
  {
    name: "sing-box",
    headers: {
      "User-Agent": "SFA/1.11.0",
      "Accept": "text/plain, application/yaml, */*"
    }
  },
  {
    name: "default",
    headers: {
      "User-Agent": "VPNSubscriptionMonitor/1.0",
      "Accept": "text/plain, application/octet-stream, application/yaml, */*"
    }
  }
];

let subscriptions = [];
let users = [];
let bills = [];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    subscriptions = JSON.parse(raw);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    subscriptions = [];
    await saveData();
  }

  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    users = JSON.parse(raw);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    users = [];
    await saveUsers();
  }

  try {
    const raw = await fs.readFile(BILLS_FILE, "utf8");
    bills = JSON.parse(raw);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    bills = initialBillsFromUsers();
    await saveBills();
  }
}

async function saveData() {
  await fs.writeFile(DATA_FILE, JSON.stringify(subscriptions, null, 2));
}

async function saveUsers() {
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

async function saveBills() {
  await fs.writeFile(BILLS_FILE, JSON.stringify(bills, null, 2));
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function normalizeSubscription(input, existing = {}) {
  const rawUrl = String(input.url || existing.url || "").trim();
  const email = String(input.email || existing.email || "").trim();
  const generatedName = email || safeHostName(rawUrl) || existing.name || "";
  const name = String(input.name || generatedName).trim();
  const url = String(input.url || existing.url || "").trim();
  const customer = String(input.customer || existing.customer || "").trim();
  const note = String(input.note || existing.note || "").trim();

  if (!url || !/^https?:\/\//i.test(url)) throw new Error("请填写 http 或 https 开头的订阅 URL。");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("请填写该 URL 绑定的有效邮箱。");

  return {
    ...existing,
    name,
    url,
    email,
    customer,
    note,
    updatedAt: new Date().toISOString()
  };
}

function safeHostName(value) {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}

function durationMonths(duration) {
  const values = {
    monthly: 1,
    quarterly: 3,
    half_yearly: 6,
    yearly: 12
  };
  return values[duration] || null;
}

function calculateExpiry(purchasedAt, duration) {
  const months = durationMonths(duration);
  const start = new Date(purchasedAt);
  if (!months || Number.isNaN(start.getTime())) return null;

  const expiresAt = new Date(start.getTime());
  const day = expiresAt.getDate();
  expiresAt.setDate(1);
  expiresAt.setMonth(expiresAt.getMonth() + months);
  const lastDay = new Date(expiresAt.getFullYear(), expiresAt.getMonth() + 1, 0).getDate();
  expiresAt.setDate(Math.min(day, lastDay));
  return expiresAt.toISOString();
}

function normalizeUser(input, existing = {}) {
  const userId = String(input.userId || existing.userId || "").trim();
  const wechatName = String(input.wechatName || existing.wechatName || "").trim();
  const imessageId = String(input.imessageId || existing.imessageId || "").trim();
  const purchasedAt = String(input.purchasedAt || existing.purchasedAt || new Date().toISOString()).trim();
  const duration = String(input.duration || existing.duration || "monthly").trim();
  const subscriptionId = String(input.subscriptionId || existing.subscriptionId || "").trim();
  const actualPaid = normalizePaymentAmount(input.actualPaid ?? existing.actualPaid ?? "");
  const subscription = subscriptions.find(item => item.id === subscriptionId);
  const expiresAt = calculateExpiry(purchasedAt, duration);

  if (!userId) throw new Error("请填写用户 ID。");
  if (!subscription) throw new Error("请选择已添加的 URL。");
  if (!durationMonths(duration)) throw new Error("请选择购买时长。");
  if (!expiresAt) throw new Error("购买时间格式不正确。");
  if (actualPaid === null) throw new Error("请填写正确的实付款金额。");

  return {
    ...existing,
    userId,
    wechatName,
    imessageId,
    purchasedAt: new Date(purchasedAt).toISOString(),
    duration,
    actualPaid,
    subscriptionId,
    expiresAt,
    updatedAt: new Date().toISOString()
  };
}

function normalizePaymentAmount(value) {
  const raw = String(value).trim();
  if (!raw) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

function billUserLabel(user) {
  return user.userId || user.wechatName || user.imessageId || "未知用户";
}

function makeBill({ user, type, amount, occurredAt, duration, beforeExpiresAt = null, afterExpiresAt = null, description = "" }) {
  return {
    id: crypto.randomUUID(),
    type,
    userId: user.id,
    userLabel: billUserLabel(user),
    userSnapshot: {
      id: user.id,
      userId: user.userId || "",
      wechatName: user.wechatName || "",
      imessageId: user.imessageId || ""
    },
    amount: Math.round(Number(amount || 0) * 100) / 100,
    occurredAt,
    duration: duration || user.duration || "",
    beforeExpiresAt,
    afterExpiresAt,
    description,
    createdAt: new Date().toISOString(),
    reversedAt: null
  };
}

function initialBillsFromUsers() {
  return users
    .map(user => {
      const amount = Number(user.actualPaid);
      if (!Number.isFinite(amount) || amount === 0) return null;
      return makeBill({
        user,
        type: "initial",
        amount,
        occurredAt: user.purchasedAt || user.createdAt || new Date().toISOString(),
        duration: user.duration,
        afterExpiresAt: user.expiresAt || null,
        description: "用户初始购买"
      });
    })
    .filter(Boolean);
}

function reverseBill(bill) {
  if (bill.reversedAt) return bill;
  bill.reversedAt = new Date().toISOString();

  const user = users.find(entry => entry.id === bill.userId);
  if (user) {
    const currentPaid = Number(user.actualPaid) || 0;
    user.actualPaid = Math.max(Math.round((currentPaid - (Number(bill.amount) || 0)) * 100) / 100, 0);
    if (bill.type === "renewal" && bill.beforeExpiresAt && user.expiresAt === bill.afterExpiresAt) {
      user.expiresAt = bill.beforeExpiresAt;
    }
    user.updatedAt = new Date().toISOString();
  }

  return bill;
}

function renewUser(user, input) {
  const duration = String(input.duration || "monthly").trim();
  const actualPaid = normalizePaymentAmount(input.actualPaid ?? "");
  const renewedAt = new Date(input.purchasedAt || new Date().toISOString());
  const currentExpiry = user.expiresAt ? new Date(user.expiresAt) : null;
  const previousPaid = Number(user.actualPaid) || 0;

  if (!durationMonths(duration)) throw new Error("请选择续费时长。");
  if (Number.isNaN(renewedAt.getTime())) throw new Error("续费时间格式不正确。");
  if (actualPaid === null) throw new Error("请填写正确的实付款金额。");

  const baseTime = currentExpiry && currentExpiry.getTime() > renewedAt.getTime() ? currentExpiry : renewedAt;
  const expiresAt = calculateExpiry(baseTime.toISOString(), duration);
  if (!expiresAt) throw new Error("续费时间格式不正确。");

  Object.assign(user, {
    purchasedAt: renewedAt.toISOString(),
    duration,
    actualPaid: Math.round((previousPaid + actualPaid) * 100) / 100,
    expiresAt,
    updatedAt: new Date().toISOString()
  });

  return { user, amount: actualPaid, renewedAt: renewedAt.toISOString(), beforeExpiresAt: currentExpiry?.toISOString() || null, afterExpiresAt: expiresAt };
}

function parseSubscriptionUserInfo(value) {
  if (!value) return null;
  const pairs = {};
  for (const segment of value.split(";")) {
    const [key, rawValue] = segment.trim().split("=");
    if (!key || rawValue === undefined) continue;
    const numericValue = Number(rawValue.trim());
    if (Number.isFinite(numericValue)) pairs[key.trim().toLowerCase()] = numericValue;
  }

  const upload = pairs.upload || 0;
  const download = pairs.download || 0;
  const total = pairs.total || null;
  const expire = pairs.expire || null;
  const used = upload + download;

  if (!total && !expire) return null;

  return {
    uploadBytes: upload,
    downloadBytes: download,
    usedBytes: used,
    totalBytes: total,
    remainingBytes: total ? Math.max(total - used, 0) : null,
    expireAt: expire ? new Date(expire * 1000).toISOString() : null,
    source: "subscription-userinfo"
  };
}

function parseBodyHints(text) {
  const source = normalizeSubscriptionBody(text);
  const statusMatch = source.match(/STATUS\s*=([^\r\n]*)/i);
  if (!statusMatch) return null;

  const statusText = statusMatch[1];
  const uploadMatch = statusText.match(/↑\s*:?\s*(\d+(?:\.\d+)?)\s*(tb|gb|mb|kb|tib|gib|mib|kib)?/i);
  const downloadMatch = statusText.match(/↓\s*:?\s*(\d+(?:\.\d+)?)\s*(tb|gb|mb|kb|tib|gib|mib|kib)?/i);
  const totalMatch = statusText.match(/TOT\s*:?\s*(\d+(?:\.\d+)?)\s*(tb|gb|mb|kb|tib|gib|mib|kib)?/i);
  const expireMatch = statusText.match(/Expires\s*:?\s*(\d{10,13}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/i);

  if (!uploadMatch || !downloadMatch || !totalMatch || !expireMatch) return null;

  const uploadBytes = toBytes(Number(uploadMatch[1]), uploadMatch[2] || "gb");
  const downloadBytes = toBytes(Number(downloadMatch[1]), downloadMatch[2] || "gb");
  const totalBytes = toBytes(Number(totalMatch[1]), totalMatch[2] || "gb");
  const usedBytes = uploadBytes + downloadBytes;
  const rawExpire = expireMatch[1];
  const timestamp = Number(rawExpire);

  return {
    uploadBytes,
    downloadBytes,
    usedBytes,
    totalBytes,
    remainingBytes: Math.max(totalBytes - usedBytes, 0),
    expireAt: Number.isFinite(timestamp)
      ? new Date(String(rawExpire).length === 13 ? timestamp : timestamp * 1000).toISOString()
      : new Date(rawExpire.replace(/[/.]/g, "-")).toISOString(),
    source: "status-field"
  };
}

function parseAccountUnavailable(text) {
  for (const variant of decodeBodyVariants(text)) {
    try {
      const parsed = JSON.parse(variant);
      if (String(parsed?.message || "").trim().toLowerCase() === "account unavailable") {
        return {
          uploadBytes: null,
          downloadBytes: null,
          usedBytes: null,
          totalBytes: null,
          remainingBytes: null,
          expireAt: new Date(0).toISOString(),
          unavailable: true,
          source: "account-unavailable"
        };
      }
    } catch {
      // Ignore non-JSON subscription bodies.
    }
  }

  return null;
}

function normalizeSubscriptionBody(text) {
  const raw = String(text || "");
  const candidates = [raw];
  const compact = raw.replace(/\s+/g, "");

  if (/^[A-Za-z0-9+/=_-]+$/.test(compact) && compact.length > 20) {
    for (const value of [compact, compact.replace(/-/g, "+").replace(/_/g, "/")]) {
      try {
        candidates.push(Buffer.from(value, "base64").toString("utf8"));
      } catch {
        // Ignore malformed base64 bodies.
      }
    }
  }

  try {
    candidates.push(decodeURIComponent(raw));
  } catch {
    // Ignore malformed URI-encoded bodies.
  }

  return candidates
    .filter(Boolean)
    .join("\n")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function toBytes(value, unit) {
  const units = {
    kb: 1024,
    kib: 1024,
    mb: 1024 ** 2,
    mib: 1024 ** 2,
    gb: 1024 ** 3,
    gib: 1024 ** 3,
    tb: 1024 ** 4,
    tib: 1024 ** 4
  };
  return Math.round(value * (units[String(unit).toLowerCase()] || 1));
}

function statusFor(item, customerCount = 0) {
  if (item.metrics?.unavailable) return "expired";
  if (item.lastError) return "warning";
  if (!item.metrics) return "unknown";

  const now = Date.now();
  const expiresAt = item.metrics.expireAt ? new Date(item.metrics.expireAt).getTime() : null;
  if (expiresAt && expiresAt < now) return "expired";

  const remaining = item.metrics.remainingBytes;
  if (remaining !== null && remaining !== undefined && remaining <= 0) return "depleted";

  const daysLeft = expiresAt ? (expiresAt - now) / 86400000 : null;
  if ((remaining !== null && remaining < LOW_TRAFFIC_BYTES) || (daysLeft !== null && daysLeft < EXPIRING_SOON_DAYS)) {
    return "warning";
  }
  if (customerCount >= 8) return "warning";

  return "ok";
}

function metricScore(metrics) {
  if (!metrics) return 0;
  if (metrics.unavailable) return 1000;

  let score = 0;
  if (metrics.expireAt) score += 40;
  if (metrics.totalBytes !== null && metrics.totalBytes !== undefined) score += 50;
  if (metrics.remainingBytes !== null && metrics.remainingBytes !== undefined) score += 50;
  if (metrics.usedBytes !== null && metrics.usedBytes !== undefined) score += 50;
  if (metrics.uploadBytes !== null && metrics.uploadBytes !== undefined) score += 25;
  if (metrics.downloadBytes !== null && metrics.downloadBytes !== undefined) score += 25;

  if (metrics.totalBytes !== undefined && metrics.usedBytes !== undefined && metrics.remainingBytes !== undefined) score += 60;
  if (metrics.totalBytes !== undefined && metrics.uploadBytes !== undefined && metrics.downloadBytes !== undefined) score += 40;

  return score;
}

function publicItem(item) {
  const customerCount = users.filter(user => user.subscriptionId === item.id).length;
  return {
    ...item,
    customerCount,
    status: statusFor(item, customerCount)
  };
}

function publicUser(user) {
  const subscription = subscriptions.find(item => item.id === user.subscriptionId);
  return {
    ...user,
    subscription: subscription ? {
      id: subscription.id,
      url: subscription.url,
      email: subscription.email || "",
      name: subscription.name || ""
    } : null
  };
}

function publicBill(bill) {
  const user = users.find(item => item.id === bill.userId);
  return {
    ...bill,
    originalUserLabel: bill.userLabel || bill.userSnapshot?.userId || "",
    userLabel: user ? billUserLabel(user) : (bill.userLabel || bill.userSnapshot?.userId || "未知用户"),
    user: user ? {
      id: user.id,
      userId: user.userId,
      wechatName: user.wechatName || "",
      imessageId: user.imessageId || "",
      createdAt: user.createdAt || "",
      expiresAt: user.expiresAt
    } : null,
    isReversed: Boolean(bill.reversedAt)
  };
}

async function refreshSubscription(item) {
  const checkedAt = new Date().toISOString();
  const results = [];
  let lastError = null;

  for (const profile of REQUEST_PROFILES) {
    try {
      const result = await fetchSubscriptionMetrics(item.url, profile);
      result.score = metricScore(result.metrics);
      results.push(result);

      if (result.score >= 300) break;
    } catch (error) {
      lastError = error;
      results.push({ client: profile.name, status: null, metrics: null, score: 0, error: error.message });
    }
  }

  const bestResult = results
    .filter(result => result.metrics)
    .sort((a, b) => b.score - a.score)[0] || results[results.length - 1] || null;
  const existingScore = metricScore(item.metrics);
  const bestScore = metricScore(bestResult?.metrics);

  item.lastCheckedAt = checkedAt;
  item.lastRefreshResults = results.map(result => ({
    client: result.client,
    status: result.status,
    score: result.score || 0,
    hasExpire: Boolean(result.metrics?.expireAt),
    hasTotal: result.metrics?.totalBytes !== undefined && result.metrics?.totalBytes !== null,
    hasUsed: result.metrics?.usedBytes !== undefined && result.metrics?.usedBytes !== null,
    hasRemaining: result.metrics?.remainingBytes !== undefined && result.metrics?.remainingBytes !== null
  }));

  if (bestResult) {
    item.httpStatus = bestResult.status;
    item.lastClient = bestResult.client;

    if (bestResult.metrics && bestScore >= existingScore) {
      item.metrics = bestResult.metrics;
      item.lastError = null;
    } else if (bestResult.metrics && item.metrics) {
      item.lastError = null;
    } else {
      item.metrics = item.metrics || null;
      item.lastError = "已请求订阅，但未识别到流量或到期信息。请确认服务是否返回 subscription-userinfo，或正文是否包含剩余流量/到期时间。";
    }
  } else {
    item.lastError = lastError?.name === "AbortError" ? "检查超时。" : lastError?.message || "请求失败。";
  }

  return item;
}

function decodeBodyVariants(text) {
  const raw = String(text || "");
  const variants = [raw];
  const compact = raw.replace(/\s+/g, "");

  if (/^[A-Za-z0-9+/=_-]+$/.test(compact) && compact.length > 20) {
    for (const value of [compact, compact.replace(/-/g, "+").replace(/_/g, "/")]) {
      try {
        variants.push(Buffer.from(value, "base64").toString("utf8"));
      } catch {
        // Ignore malformed base64 bodies.
      }
    }
  }

  try {
    variants.push(decodeURIComponent(raw));
  } catch {
    // Ignore malformed URI-encoded bodies.
  }

  return [...new Set(variants)].filter(Boolean);
}

function sanitizeDebugText(value, limit = 4000) {
  return String(value || "")
    .replace(/https?:\/\/[^\s"'<>]+/g, "[url-redacted]")
    .replace(/(?:ss|ssr|vmess|vless|trojan|hysteria2?|tuic):\/\/[^\s"'<>]+/gi, "[node-redacted]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[token-redacted]")
    .slice(0, limit);
}

function interestingDebugLines(text) {
  return (String(text || "").match(/.{0,40}(剩余|流量|用量|已用|使用|总量|到期|过期|expire|traffic|upload|download|total|used|remain|left).{0,120}/gi) || [])
    .slice(0, 30)
    .map(line => sanitizeDebugText(line, 300));
}

function maybeParseJson(text) {
  try {
    const parsed = JSON.parse(text);
    return sanitizeDebugValue(parsed);
  } catch {
    return null;
  }
}

function sanitizeDebugValue(value) {
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeDebugValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 80).map(([key, val]) => [key, sanitizeDebugValue(val)]));
  }
  if (typeof value === "string") return sanitizeDebugText(value, 600);
  return value;
}

async function debugSubscription(url) {
  const results = [];

  for (const profile of REQUEST_PROFILES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          ...profile.headers,
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      });
      clearTimeout(timer);

      const body = await response.text();
      const variants = decodeBodyVariants(body);
      const headers = {};
      for (const [key, value] of response.headers) headers[key] = sanitizeDebugText(value, 1000);

      results.push({
        client: profile.name,
        status: response.status,
        statusText: response.statusText,
        headers,
        bodyLength: body.length,
        bodyVariants: variants.map((variant, index) => ({
          index,
          length: variant.length,
          parsedJson: maybeParseJson(variant),
          interestingLines: interestingDebugLines(variant),
          preview: sanitizeDebugText(variant, 2500)
        }))
      });
    } catch (error) {
      results.push({
        client: profile.name,
        error: error.name === "AbortError" ? "检查超时。" : error.message
      });
    }
  }

  return results;
}

async function fetchSubscriptionMetrics(url, profile) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        ...profile.headers,
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    const userInfo = response.headers.get("subscription-userinfo") || response.headers.get("Subscription-Userinfo");
    let metrics = parseSubscriptionUserInfo(userInfo);

    if (!metrics) {
      const body = await response.text();
      metrics = parseAccountUnavailable(body) || parseBodyHints(body);
    }

    return {
      status: response.status,
      client: profile.name,
      metrics
    };
  } finally {
    clearTimeout(timer);
  }
}

async function refreshAll() {
  for (const item of subscriptions) {
    await refreshSubscription(item);
  }
  await saveData();
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/health" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      subscriptions: subscriptions.length,
      users: users.length,
      refreshedEveryMs: REFRESH_INTERVAL_MS
    });
    return;
  }

  if (pathname === "/api/subscriptions" && req.method === "GET") {
    sendJson(res, 200, subscriptions.map(publicItem));
    return;
  }

  if (pathname === "/api/subscriptions" && req.method === "POST") {
    try {
      const payload = await readJson(req);
      const item = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        metrics: null,
        lastCheckedAt: null,
        lastError: null,
        httpStatus: null
      };
      const normalized = normalizeSubscription(payload, item);
      subscriptions.unshift(normalized);
      await refreshSubscription(normalized);
      await saveData();
      sendJson(res, 201, publicItem(normalized));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/users" && req.method === "GET") {
    sendJson(res, 200, users.map(publicUser));
    return;
  }

  if (pathname === "/api/bills" && req.method === "GET") {
    sendJson(res, 200, bills.map(publicBill).sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)));
    return;
  }

  if (pathname === "/api/users" && req.method === "POST") {
    try {
      const payload = await readJson(req);
      const item = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString()
      };
      const normalized = normalizeUser(payload, item);
      users.unshift(normalized);
      bills.unshift(makeBill({
        user: normalized,
        type: "initial",
        amount: normalized.actualPaid,
        occurredAt: normalized.purchasedAt,
        duration: normalized.duration,
        afterExpiresAt: normalized.expiresAt,
        description: "用户初始购买"
      }));
      await saveUsers();
      await saveBills();
      sendJson(res, 201, publicUser(normalized));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const billMatch = pathname.match(/^\/api\/bills\/([^/]+)\/reverse$/);
  if (billMatch) {
    const bill = bills.find(entry => entry.id === billMatch[1]);
    if (!bill) {
      sendJson(res, 404, { error: "没有找到这笔账单。" });
      return;
    }

    if (req.method === "POST") {
      reverseBill(bill);
      await saveBills();
      await saveUsers();
      sendJson(res, 200, publicBill(bill));
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  const match = pathname.match(/^\/api\/subscriptions\/([^/]+)(?:\/(refresh|debug))?$/);
  const userMatch = pathname.match(/^\/api\/users\/([^/]+)(?:\/(renew))?$/);
  if (userMatch) {
    const id = userMatch[1];
    const action = userMatch[2];
    const item = users.find(entry => entry.id === id);
    if (!item) {
      sendJson(res, 404, { error: "没有找到这个用户。" });
      return;
    }

    if (action === "renew" && req.method === "POST") {
      try {
        const payload = await readJson(req);
        const renewal = renewUser(item, payload);
        bills.unshift(makeBill({
          user: item,
          type: "renewal",
          amount: renewal.amount,
          occurredAt: renewal.renewedAt,
          duration: item.duration,
          beforeExpiresAt: renewal.beforeExpiresAt,
          afterExpiresAt: renewal.afterExpiresAt,
          description: "用户续费"
        }));
        await saveUsers();
        await saveBills();
        sendJson(res, 200, publicUser(item));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (action) {
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    if (req.method === "PUT") {
      try {
        const payload = await readJson(req);
        const previousPaid = Number(item.actualPaid) || 0;
        Object.assign(item, normalizeUser(payload, item));
        const nextPaid = Number(item.actualPaid) || 0;
        const diff = Math.round((nextPaid - previousPaid) * 100) / 100;
        if (diff !== 0) {
          bills.unshift(makeBill({
            user: item,
            type: "adjustment",
            amount: diff,
            occurredAt: new Date().toISOString(),
            duration: item.duration,
            afterExpiresAt: item.expiresAt,
            description: "用户实付款调整"
          }));
          await saveBills();
        }
        await saveUsers();
        sendJson(res, 200, publicUser(item));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === "DELETE") {
      users = users.filter(entry => entry.id !== id);
      await saveUsers();
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  if (!match) {
    sendJson(res, 404, { error: "Not found." });
    return;
  }

  const id = match[1];
  const item = subscriptions.find(entry => entry.id === id);
  if (!item) {
    sendJson(res, 404, { error: "没有找到这条订阅。" });
    return;
  }

  if (pathname.endsWith("/refresh") && req.method === "POST") {
    await refreshSubscription(item);
    await saveData();
    sendJson(res, 200, publicItem(item));
    return;
  }

  if (pathname.endsWith("/debug") && req.method === "GET") {
    sendJson(res, 200, await debugSubscription(item.url));
    return;
  }

  if (req.method === "PUT") {
    try {
      const payload = await readJson(req);
      const previousUrl = item.url;
      Object.assign(item, normalizeSubscription(payload, item));
      if (item.url !== previousUrl) await refreshSubscription(item);
      await saveData();
      sendJson(res, 200, publicItem(item));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === "DELETE") {
    subscriptions = subscriptions.filter(entry => entry.id !== id);
    await saveData();
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." });
}

async function serveStatic(res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

async function main() {
  await ensureDataFile();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url.pathname);
      } else {
        await serveStatic(res, url.pathname);
      }
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`VPN subscription monitor is running at http://localhost:${PORT}`);
  });

  setInterval(() => {
    refreshAll().catch(error => console.error("Refresh failed:", error));
  }, REFRESH_INTERVAL_MS);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  parseSubscriptionUserInfo,
  parseBodyHints,
  parseAccountUnavailable,
  calculateExpiry,
  statusFor,
  toBytes
};
