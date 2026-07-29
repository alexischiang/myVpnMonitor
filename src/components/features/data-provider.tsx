import * as React from "react"
import { useLocation, useNavigate } from "react-router-dom"

import { fetchJson } from "@/api"
import type { AppMeta, Bill, EmbyUser, EmbyVendor, PlaceholderNode, Preset, PricingRow, Subscription, User, Vendor } from "@/types"

type DataState = {
  account: string
  subscriptions: Subscription[]
  users: User[]
  bills: Bill[]
  vendors: Vendor[]
  presets: Preset[]
  placeholderNodes: PlaceholderNode[]
  embyUsers: EmbyUser[]
  embyVendors: EmbyVendor[]
  pricing: PricingRow[]
  meta: AppMeta | null
  loading: boolean
  error: string
  busy: string
  reload: (collections?: Collection[], options?: { silent?: boolean; loading?: boolean }) => Promise<void>
  runAsync: <T>(task: () => Promise<T>, label?: string) => Promise<T>
}

type Collection = Exclude<keyof DataState, "account" | "loading" | "error" | "busy" | "reload" | "runAsync">

const apis: Record<Collection, string> = {
  subscriptions: "/api/subscriptions",
  users: "/api/users",
  bills: "/api/bills",
  vendors: "/api/vendors",
  presets: "/api/presets",
  placeholderNodes: "/api/placeholder-nodes",
  embyUsers: "/api/emby-users",
  embyVendors: "/api/emby-vendors",
  pricing: "/api/pricing",
  meta: "/api/app-meta",
}

const initialState: Omit<DataState, "reload" | "runAsync"> = {
  account: "",
  subscriptions: [],
  users: [],
  bills: [],
  vendors: [],
  presets: [],
  placeholderNodes: [],
  embyUsers: [],
  embyVendors: [],
  pricing: [],
  meta: null,
  loading: true,
  error: "",
  busy: "",
}

const defaultCollections: Collection[] = ["subscriptions", "users", "bills", "meta"]
const pageCollections: [string, Collection[]][] = [
  ["/users/detail/", ["users", "subscriptions", "bills"]],
  ["/users", ["users", "subscriptions", "pricing"]],
  ["/urls/detail/", ["subscriptions", "users"]],
  ["/urls", ["subscriptions", "vendors"]],
  ["/dashboard", ["users", "bills"]],
  ["/pricing-settings", ["pricing"]],
  ["/emby", ["embyUsers", "embyVendors"]],
  ["/subconverter", ["presets", "subscriptions", "vendors", "placeholderNodes"]],
]
const focusRefreshIntervalMs = 60_000
const loadedCollections = new Set<Collection>()
const collectionRequests = new Map<Collection, Promise<unknown>>()

let cachedState: Omit<DataState, "reload" | "runAsync"> | null = null
let accountRequest: Promise<{ account?: string; role?: string }> | null = null
let lastLoadedAt = 0

function fetchCollection(key: Collection) {
  const existing = collectionRequests.get(key)
  if (existing) return existing

  const request = fetchJson(apis[key]).finally(() => {
    collectionRequests.delete(key)
  })
  collectionRequests.set(key, request)
  return request
}

const DataContext = React.createContext<DataState>({
  ...initialState,
  reload: async () => undefined,
  runAsync: async task => task(),
})

export function DataProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const mountedRef = React.useRef(true)
  const [state, setState] = React.useState<Omit<DataState, "reload" | "runAsync">>(() => {
    if (!cachedState) return initialState
    return { ...cachedState, loading: false, error: "" }
  })
  const [busy, setBusy] = React.useState("")

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const commitState = React.useCallback((updater: (current: Omit<DataState, "reload" | "runAsync">) => Omit<DataState, "reload" | "runAsync">) => {
    if (!mountedRef.current) {
      cachedState = updater(cachedState || initialState)
      return
    }

    setState(current => {
      const next = updater(current)
      cachedState = next
      return next
    })
  }, [])

  const reload = React.useCallback(async (collections?: Collection[], { silent = false, loading = !collections && !silent } = {}) => {
    const keys = collections || defaultCollections
    commitState(current => ({ ...current, loading, error: silent ? current.error : "" }))
    try {
      const results = await Promise.all(keys.map(fetchCollection))
      keys.forEach(key => loadedCollections.add(key))
      lastLoadedAt = Date.now()
      commitState(current => {
        const patch: Partial<DataState> = {}
        keys.forEach((key, index) => {
          ;(patch as Record<string, unknown>)[key] = results[index]
        })
        return { ...current, ...patch, loading: silent ? current.loading : false, error: silent ? current.error : "" }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载失败"
      if (silent) return
      commitState(current => ({ ...current, loading: false, error: message }))
    }
  }, [commitState])

  React.useEffect(() => {
    accountRequest = accountRequest || fetchJson<{ account?: string; role?: string }>("/api/auth/me")
    const requiredCollections = pageCollections.find(([path]) => location.pathname.startsWith(path))?.[1] || []
    const missingCollections = requiredCollections.filter(key => !loadedCollections.has(key))
    const initialRequest = missingCollections.length ? reload(missingCollections, { loading: true }) : Promise.resolve()

    Promise.all([accountRequest, initialRequest]).then(async ([me]) => {
      if (me.role !== "admin") {
        navigate("/account", { replace: true })
        return
      }
      commitState(current => ({ ...current, account: me.account || "" }))

      commitState(current => ({ ...current, loading: false, error: "" }))
    }).catch(() => navigate("/login", { replace: true }))
  }, [commitState, location.pathname, navigate, reload])

  React.useEffect(() => {
    const refresh = () => {
      if (Date.now() - lastLoadedAt >= focusRefreshIntervalMs) void reload(defaultCollections, { silent: true })
    }
    window.addEventListener("focus", refresh)
    return () => window.removeEventListener("focus", refresh)
  }, [reload])

  const runAsync = React.useCallback(async <T,>(task: () => Promise<T>, label = "处理中...") => {
    setBusy(label)
    try {
      return await task()
    } finally {
      setBusy("")
    }
  }, [])

  const value = React.useMemo(() => ({ ...state, busy, reload, runAsync }), [state, busy, reload, runAsync])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  return React.useContext(DataContext)
}
