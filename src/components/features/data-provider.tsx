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

type Collection = Exclude<keyof DataState, "loading" | "error" | "busy" | "reload" | "runAsync">

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

const DataContext = React.createContext<DataState>({
  ...initialState,
  reload: async () => undefined,
  runAsync: async task => task(),
})

export function DataProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [state, setState] = React.useState(initialState)
  const [busy, setBusy] = React.useState("")

  const reload = React.useCallback(async (collections?: Collection[], { silent = false } = {}) => {
    const keys = collections || (["subscriptions", "users", "bills", "meta"] as Collection[])
    setState(current => ({ ...current, loading: !collections && !silent, error: silent ? current.error : "" }))
    try {
      const results = await Promise.all(keys.map(key => fetchJson(apis[key])))
      setState(current => {
        const patch: Partial<DataState> = {}
        keys.forEach((key, index) => {
          ;(patch as Record<string, unknown>)[key] = results[index]
        })
        return { ...current, ...patch, loading: silent ? current.loading : false, error: silent ? current.error : "" }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载失败"
      if (silent) return
      setState(current => ({ ...current, loading: false, error: message }))
    }
  }, [])

  React.useEffect(() => {
    fetchJson<{ account?: string }>("/api/auth/me")
      .then(me => setState(current => ({ ...current, account: me.account || "" })))
      .catch(() => navigate("/login", { replace: true }))
    reload().then(() => reload(["vendors", "presets", "placeholderNodes", "embyUsers", "embyVendors", "pricing"], { silent: true }))
  }, [navigate, reload])

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
