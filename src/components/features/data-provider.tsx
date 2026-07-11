import * as React from "react"
import { useNavigate } from "react-router-dom"

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
  reload: (collections?: Collection[], options?: { silent?: boolean }) => Promise<void>
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
const supplementalCollections: Collection[] = ["vendors", "presets", "placeholderNodes", "embyUsers", "embyVendors", "pricing"]
const loadedCollections = new Set<Collection>()
const collectionRequests = new Map<Collection, Promise<unknown>>()

let cachedState: Omit<DataState, "reload" | "runAsync"> | null = null
let accountLoaded = false
let accountRequest: Promise<{ account?: string }> | null = null

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

  const reload = React.useCallback(async (collections?: Collection[], { silent = false } = {}) => {
    const keys = collections || defaultCollections
    commitState(current => ({ ...current, loading: !collections && !silent, error: silent ? current.error : "" }))
    try {
      const results = await Promise.all(keys.map(fetchCollection))
      keys.forEach(key => loadedCollections.add(key))
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
    if (!accountLoaded) {
      accountRequest = accountRequest || fetchJson<{ account?: string }>("/api/auth/me").finally(() => {
        accountRequest = null
      })
      accountRequest
        .then(me => {
          accountLoaded = true
          commitState(current => ({ ...current, account: me.account || "" }))
        })
        .catch(() => navigate("/login", { replace: true }))
    }

    const hasDefaultData = defaultCollections.every(key => loadedCollections.has(key))
    const missingSupplemental = supplementalCollections.filter(key => !loadedCollections.has(key))

    if (!hasDefaultData) {
      reload().then(() => {
        const nextMissingSupplemental = supplementalCollections.filter(key => !loadedCollections.has(key))
        if (nextMissingSupplemental.length) void reload(nextMissingSupplemental, { silent: true })
      })
      return
    }

    commitState(current => ({ ...current, loading: false, error: "" }))
    if (missingSupplemental.length) void reload(missingSupplemental, { silent: true })
  }, [commitState, navigate, reload])

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
