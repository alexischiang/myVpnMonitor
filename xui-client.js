async function requestXui({ serviceUrl, serviceToken, baseUrl, apiToken, apiPath, method = "GET", body, timeoutMs = 15000 }) {
  if (!serviceUrl) throw new Error("XUI_SERVICE_URL 未配置。");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${serviceUrl.replace(/\/+$/, "")}/internal/request`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${serviceToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ baseUrl, apiToken, apiPath, method, body })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) {
      const error = new Error(payload.error || `3x-ui 服务请求失败（HTTP ${response.status}）。`);
      error.statusCode = response.status;
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
    if (!response.ok || payload.ok !== true) throw new Error(payload.error || `3x-ui 服务请求失败（HTTP ${response.status}）。`);
    return payload.data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("3x-ui 服务请求超时。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { requestXui, requestXuiService };
