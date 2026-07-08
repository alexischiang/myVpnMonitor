import * as React from "react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { AlertCircle, RefreshCw } from "lucide-react"

import { apiFetch } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/features/app-sidebar"
import { useData } from "@/components/features/data-provider"
import { getPageTitle } from "@/components/features/navigation"
import { SiteHeader } from "@/components/features/site-header"

export function AppShell({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const data = useData()
  const pageTitle = getPageTitle(location.pathname)

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" })
    navigate("/login", { replace: true })
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" onLogout={logout} />
      <SidebarInset>
        <SiteHeader title={pageTitle} dark={dark} onToggleTheme={onToggleTheme} onLogout={logout} />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
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
          </div>
        </div>
      </SidebarInset>

      {data.busy && (
        <div className="fixed right-4 bottom-4 z-50">
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-sm">
            <RefreshCw className="size-4 animate-spin" />
            {data.busy}
          </div>
        </div>
      )}
    </SidebarProvider>
  )
}
