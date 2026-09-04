import * as React from "react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { AlertCircle, RefreshCw } from "lucide-react"
import { useTheme } from "next-themes"

import { apiFetch, fetchJson } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { AppLayout } from "@/components/features/app-layout"
import { AppSidebar } from "@/components/features/app-sidebar"
import { useData } from "@/components/features/data-provider"
import { getPageTitle, navItems } from "@/components/features/navigation"

export type ServiceHealth = { status: string; latency?: number; kind?: string; url?: string; message?: string }
export type HealthResponse = { services: { database: ServiceHealth; subconverter: ServiceHealth; telegram: ServiceHealth; resend: ServiceHealth } }
type HealthContextValue = { services: HealthResponse["services"] | null; checkedAt: string; loading: boolean; error: string; refresh: () => Promise<void> }

const HealthContext = React.createContext<HealthContextValue>({
  services: null,
  checkedAt: "",
  loading: false,
  error: "",
  refresh: async () => undefined,
})

export function useServiceHealth() {
  return React.useContext(HealthContext)
}

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const data = useData()
  const pageTitle = getPageTitle(location.pathname)
  const { resolvedTheme, setTheme, theme } = useTheme()
  const dark = (theme ?? resolvedTheme) === "dark"
  const [services, setServices] = React.useState<HealthResponse["services"] | null>(null)
  const [checkedAt, setCheckedAt] = React.useState("")
  const [healthLoading, setHealthLoading] = React.useState(false)
  const [healthError, setHealthError] = React.useState("")

  const refreshHealth = React.useCallback(async () => {
    setHealthLoading(true)
    try {
      const health = await fetchJson<HealthResponse>("/api/health")
      setServices(health.services)
      setCheckedAt(new Date().toISOString())
      setHealthError("")
    } catch (error) {
      setHealthError(error instanceof Error ? error.message : "服务检测失败")
    } finally {
      setHealthLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (location.pathname !== "/dashboard") return
    void refreshHealth()
    const timer = window.setInterval(refreshHealth, 180_000)
    return () => window.clearInterval(timer)
  }, [location.pathname, refreshHealth])

  const failedServices = services ? ([
    ["数据库", services.database],
    ["Subconverter", services.subconverter],
    ["Telegram API", services.telegram],
    ["Resend", services.resend],
  ] as const).filter(([, service]) => service.status === "error") : []
  const showHealthAlerts = location.pathname === "/dashboard" && (healthError || failedServices.length > 0)

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" })
    navigate("/login", { replace: true })
  }

  function toggleTheme() {
    setTheme(dark ? "light" : "dark")
  }

  return (
    <HealthContext.Provider value={{ services, checkedAt, loading: healthLoading, error: healthError, refresh: refreshHealth }}>
      <AppLayout
        title={pageTitle}
        dark={dark}
        onToggleTheme={toggleTheme}
        onLogout={logout}
        sidebar={<AppSidebar variant="inset" items={navItems} homeUrl="/dashboard" accountName={data.account || "admin"} accountDescription="Administrator" accountUrl="/dashboard" accountLabel="Dashboard" onLogout={logout} />}
      >
        <div className="flex min-w-0 flex-col gap-4 md:gap-6 [&>div]:!px-0">
              {showHealthAlerts ? (
                <div className="grid gap-2 px-4 lg:px-6">
                  {healthError && <Alert variant="error"><AlertCircle /><AlertDescription>服务监控 API 连接异常：{healthError}</AlertDescription></Alert>}
                  {failedServices.map(([name, service]) => <Alert key={name} variant="error"><AlertCircle /><AlertDescription>{name} 连接异常{service.message ? `：${service.message}` : ""}</AlertDescription></Alert>)}
                </div>
              ) : null}
              {data.error && (
                <div className="px-4 lg:px-6">
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertDescription>{data.error}</AlertDescription>
                  </Alert>
                </div>
              )}
              {data.loading ? (
                <div className="grid gap-4 px-4 lg:px-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {[1, 2, 3, 4].map(item => (
                      <Skeleton key={item} className="h-32" />
                    ))}
                  </div>
                  <Skeleton className="h-96" />
                </div>
              ) : (
                <Outlet />
              )}
        </div>
      </AppLayout>

      {data.busy && (
        <div className="fixed right-4 bottom-4 z-50">
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-sm">
            <RefreshCw className="size-4 animate-spin" />
            {data.busy}
          </div>
        </div>
      )}
    </HealthContext.Provider>
  )
}
