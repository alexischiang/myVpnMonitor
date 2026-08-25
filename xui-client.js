const XUI_READ_REQUESTS = new Set([
  "GET /panel/api/server/status",
  "GET /panel/api/nodes/list",
  "GET /panel/api/inbounds/list",
  "GET /panel/api/inbounds/list/slim",
  "GET /panel/api/inbounds/options",
  "GET /panel/api/clients/list",
  "POST /panel/api/clients/clientIpsByGuid",
  "POST /panel/api/clients/onlinesByGuid",
  "POST /panel/api/clients/lastOnline",
  "POST /panel/api/clients/activeInbounds"
]);

function assertXuiRequestAllowed(readOnly, method, apiPath) {
  if (!readOnly) return;
  let pathname;
  try { pathname = decodeURIComponent(new URL(apiPath, "http://xui.local").pathname); } catch {}
  const normalizedMethod = String(method || "GET").toUpperCase();
  if (XUI_READ_REQUESTS.has(`${normalizedMethod} ${pathname}`) || (normalizedMethod === "GET" && /^\/panel\/api\/clients\/get\/[^/]+$/.test(pathname))) return;
  throw Object.assign(new Error("测试环境为 3x-ui 只读模式，禁止执行此操作。"), { statusCode: 403, code: "XUI_READ_ONLY" });
}

async function requestXui({ serviceUrl, serviceToken, baseUrl, apiToken, apiPath, method = "GET", body, requestId, timeoutMs = 15000 }) {
  if (!serviceUrl) throw new Error("XUI_SERVICE_URL 未配置。");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${serviceUrl.replace(/\/+$/, "")}/internal/request`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${serviceToken}`,
        "content-type": "application/json",
        ...(requestId ? { "x-request-id": requestId } : {})
      },
      body: JSON.stringify({ baseUrl, apiToken, apiPath, method, body })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) {
      const error = new Error(payload.error || `3x-ui 服务请求失败（HTTP ${response.status}）。`);
      error.statusCode = response.status;
      error.code = payload.code;
      throw error;
    }
    return payload.data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("3x-ui 服务请求超时。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function requestXuiService({ serviceUrl, serviceToken, path, method = "GET", body, timeoutMs = 15000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${serviceUrl.replace(/\/+$/, "")}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${serviceToken}`,
        ...(body === undefined ? {} : { "content-type": "application/json" })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) {
      const error = new Error(payload.error || `3x-ui 服务请求失败（HTTP ${response.status}）。`);
      error.statusCode = response.status;
      error.code = payload.code;
      throw error;
    }
    return payload.data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("3x-ui 服务请求超时。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { assertXuiRequestAllowed, requestXui, requestXuiService };
