export async function apiFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    cache: "no-cache",
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  })

  if (response.status === 401 && window.location.pathname !== "/login") {
    window.location.href = "/login"
  }

  return response
}

export async function fetchJson<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, options)
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`)
  return payload
}

export function postJson<T = unknown>(path: string, payload?: unknown) {
  return fetchJson<T>(path, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  })
}

export function putJson<T = unknown>(path: string, payload?: unknown) {
  return fetchJson<T>(path, {
    method: "PUT",
    body: JSON.stringify(payload || {}),
  })
}

export async function deleteJson<T = unknown>(path: string) {
  return fetchJson<T>(path, { method: "DELETE" })
}
