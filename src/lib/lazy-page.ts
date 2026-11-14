import { lazy, type ComponentType, type LazyExoticComponent } from "react"

import { trackLoading } from "@/api"

const loaders = new WeakMap<object, () => Promise<unknown>>()

/**
 * A route page loaded on first use. The router holds the current page while the next one downloads (React Router wraps every
 * navigation in a transition), so the download shows on the page progress bar instead of looking like the tap did nothing.
 */
export function lazyPage<T extends ComponentType<never>>(load: () => Promise<{ default: T }>): LazyExoticComponent<T> {
  const page = lazy(() => trackLoading(load))
  loaders.set(page, load)
  return page
}

// Safari has no requestIdleCallback.
function whenIdle(run: () => void) {
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 4000 })
  else window.setTimeout(run, 1500)
}

/** Downloads the given pages one by one while the browser is idle, so moving to them later does not wait on the network. */
export function prefetchPages(pages: object[]) {
  let cancelled = false
  const queue = pages.map(page => loaders.get(page)).filter((load): load is () => Promise<unknown> => Boolean(load))
  const next = () => {
    const load = queue.shift()
    if (cancelled || !load) return
    // A failed download is retried by the page itself when it is opened.
    load().catch(() => undefined).finally(() => whenIdle(next))
  }
  whenIdle(next)
  return () => { cancelled = true }
}
