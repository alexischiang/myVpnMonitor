const jsonCache = new Map<string, unknown>()
const jsonRequests = new Map<string, Promise<unknown>>()
let jsonCacheGeneration = 0
const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504])

function wait(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

export type ApiRequestOptions = RequestInit & {
  // Kept out of the page progress bar: timer-driven refreshes nobody is waiting on, and requests
  // that show step progress of their own.
  background?: boolean
}

// Requests the user is waiting on, for the page progress bar. `started` restarts with each burst,
// so (started - pending) / started is the share of the current burst that has finished.
export type RequestActivity = { pending: number; started: number }
let requestActivity: RequestActivity = { pending: 0, started: 0 }
const requestActivityListeners = new Set<() => void>()

function setRequestActivity(next: RequestActivity) {
  requestActivity = next
  requestActivityListeners.forEach(listener => listener())
}

export function subscribeRequestActivity(listener: () => void) {
  requestActivityListeners.add(listener)
  return () => { requestActivityListeners.delete(listener) }
}

export function getRequestActivity() {
  return requestActivity
}

function trackRequest<T>(run: () => Promise<T>, background?: boolean): Promise<T> {
  if (background) return run()
  setRequestActivity({ pending: requestActivity.pending + 1, started: requestActivity.pending ? requestActivity.started + 1 : 1 })
  return run().finally(() => setRequestActivity({ ...requestActivity, pending: requestActivity.pending - 1 }))
}

export function apiFetch(path: string, { background, ...options }: ApiRequestOptions = {}) {
  return trackRequest(() => sendRequest(path, options), background)
}

async function sendRequest(path: string, options: RequestInit) {
  const response = await fetch(path, {
    cache: "no-cache",
    credentials: "same-origin",
    ...options,
    headers: {
      ...(typeof options.body === "string" ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  })

  if (response.status === 401 && window.location.pathname !== "/login") {
    window.location.href = "/login"
  }

  return response
}

// Retries count as one request for the progress bar.
export function fetchJson<T = unknown>(path: string, { background, ...options }: ApiRequestOptions = {}): Promise<T> {
  return trackRequest(() => requestJson<T>(path, options), background)
}

async function requestJson<T>(path: string, options: RequestInit): Promise<T> {
  const method = String(options.method || "GET").toUpperCase()
  const attempts = method === "GET" ? 3 : 1
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response
    try {
      response = await sendRequest(path, options)
    } catch (error) {
      lastError = error
      if (attempt + 1 >= attempts) throw error
      await wait(300 * (attempt + 1))
      continue
    }

    if (retryableStatuses.has(response.status) && attempt + 1 < attempts) {
      await wait(300 * (attempt + 1))
      continue
    }

    try {
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`)
      return payload
    } catch (error) {
      lastError = error
      if (!response.ok || attempt + 1 >= attempts) throw error
      await wait(300 * (attempt + 1))
    }
  }

  throw lastError
}

// For endpoints that report step progress as NDJSON: every line before the last is handed to
// onStep as it arrives, and the last one carries the status and body of a plain JSON reply. A
// reply sent before the first step (a rejected request) is plain JSON and handled the same way.
export async function fetchJsonSteps<T, Step>(path: string, options: ApiRequestOptions, onStep: (step: Step) => void): Promise<T> {
  const response = await apiFetch(path, { ...options, headers: { ...(options.headers as Record<string, string> | undefined), accept: "application/x-ndjson" } })
  if (!response.body || !String(response.headers.get("content-type")).startsWith("application/x-ndjson")) {
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`)
    return payload
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffered = ""
  let final: { status: number; body: T & { error?: string } } | undefined
  for (;;) {
    const { done, value } = await reader.read()
    buffered += decoder.decode(value, { stream: !done })
    const lines = buffered.split("\n")
    buffered = done ? "" : lines.pop() || ""
    for (const line of lines) {
      if (!line) continue
      const message = JSON.parse(line)
      if ("body" in message) final = message
      else onStep(message)
    }
    if (done) break
  }
  if (!final) throw new Error("连接中断，未收到保存结果，请刷新页面确认。")
  if (final.status >= 400) throw new Error(final.body?.error || `Request failed: ${final.status}`)
  return final.body
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
