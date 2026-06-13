export async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-cache",
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { "content-type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  if (response.status === 401 && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }

  return response;
}

export async function fetchJson(path, options = {}) {
  const response = await apiFetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
  return payload;
}

export function postJson(path, payload) {
  return fetchJson(path, {
    method: "POST",
    body: JSON.stringify(payload || {})
  });
}

export function putJson(path, payload) {
  return fetchJson(path, {
    method: "PUT",
    body: JSON.stringify(payload || {})
  });
}

export async function deleteJson(path) {
  return fetchJson(path, { method: "DELETE" });
}
