const jsonCache = new Map<string, unknown>()
const jsonRequests = new Map<string, Promise<unknown>>()
let jsonCacheGeneration = 0

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

export function getCachedJson<T>(path: string) {
  return jsonCache.get(path) as T | undefined
}

export function setCachedJson<T>(path: string, payload: T) {
  jsonCache.set(path, payload)
}

export function fetchCachedJson<T>(path: string): Promise<T> {
  if (jsonCache.has(path)) return Promise.resolve(jsonCache.get(path) as T)
  const existing = jsonRequests.get(path) as Promise<T> | undefined
  if (existing) return existing

  const generation = jsonCacheGeneration
  const request = fetchJson<T>(path)
    .then(payload => {
      if (generation === jsonCacheGeneration) jsonCache.set(path, payload)
      return payload
    })
    .finally(() => {
      if (jsonRequests.get(path) === request) jsonRequests.delete(path)
    })
  jsonRequests.set(path, request)
  return request
}

export function clearJsonCache() {
  jsonCacheGeneration += 1
  jsonCache.clear()
  jsonRequests.clear()
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
