import * as React from "react"
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import { AlertCircle, ArrowRight, CreditCard, Gauge, KeyRound, LogOut, ReceiptText, ShieldCheck, UserRound } from "lucide-react"
import { useTheme } from "next-themes"

import { apiFetch, fetchJson } from "@/api"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { SiteHeader } from "@/components/features/site-header"

const accountNav = [
  { title: "总览", url: "/account", icon: Gauge, exact: true },
  { title: "我的订阅", url: "/account/subscription", icon: ShieldCheck },
  { title: "购买套餐", url: "/account/plans", icon: CreditCard },
  { title: "订单记录", url: "/account/orders", icon: ReceiptText },
  { title: "账户资料", url: "/account/profile", icon: UserRound },
  { title: "安全设置", url: "/account/security", icon: KeyRound },
]

export function AccountShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { resolvedTheme, setTheme, theme } = useTheme()
  const [email, setEmail] = React.useState("")
  const [pendingOrderId, setPendingOrderId] = React.useState("")
  const dark = (theme ?? resolvedTheme) === "dark"
  const current = accountNav.find(item => item.exact ? location.pathname === item.url : location.pathname.startsWith(item.url)) || accountNav[0]

  React.useEffect(() => {
    fetchJson<{ role: string; email?: string }>("/api/auth/me")
      .then(me => me.role === "user" ? setEmail(me.email || "") : navigate("/dashboard", { replace: true }))
      .catch(() => navigate("/login", { replace: true }))
  }, [navigate])

  React.useEffect(() => {
    if (!email) return
    const refreshOrders = () => fetchJson<Array<{ id: string; status: string }>>("/api/account/orders")
      .then(orders => setPendingOrderId(orders.find(order => order.status === "pending")?.id || ""))
      .catch(() => undefined)
    void refreshOrders()
    const timer = window.setInterval(refreshOrders, 180_000)
    window.addEventListener("payment-order-updated", refreshOrders)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("payment-order-updated", refreshOrders)
    }
  }, [email])

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" })
    navigate("/login", { replace: true })
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": "calc(var(--spacing) * 72)", "--header-height": "calc(var(--spacing) * 12)" } as React.CSSProperties}>
      <Sidebar variant="inset" collapsible="offcanvas">
        <SidebarHeader>
          <SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!"><Link to="/account"><ShieldCheck className="size-5" /><span className="text-base font-semibold">NEXORA</span></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup><SidebarGroupContent><SidebarMenu>{accountNav.map(item => (
            <SidebarMenuItem key={item.url}><SidebarMenuButton asChild tooltip={item.title} isActive={item.exact ? location.pathname === item.url : location.pathname.startsWith(item.url)}><NavLink to={item.url}><item.icon /><span>{item.title}</span></NavLink></SidebarMenuButton></SidebarMenuItem>
          ))}</SidebarMenu></SidebarGroupContent></SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu><SidebarMenuItem><DropdownMenu><DropdownMenuTrigger asChild><SidebarMenuButton size="lg"><Avatar className="size-8 rounded-lg"><AvatarFallback className="rounded-lg">{email.slice(0, 2).toUpperCase() || "U"}</AvatarFallback></Avatar><div className="grid flex-1 text-left text-sm"><span className="truncate font-medium">{email || "加载中"}</span><span className="text-xs text-muted-foreground">User account</span></div></SidebarMenuButton></DropdownMenuTrigger><DropdownMenuContent side="right" align="end" className="min-w-56"><DropdownMenuItem asChild><Link to="/account/profile"><UserRound />账户资料</Link></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={logout}><LogOut />退出登录</DropdownMenuItem></DropdownMenuContent></DropdownMenu></SidebarMenuItem></SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 overflow-x-hidden">
        <SiteHeader title={current.title} dark={dark} onToggleTheme={() => setTheme(dark ? "light" : "dark")} onLogout={logout} />
        <div className="flex min-w-0 flex-1 flex-col py-4 md:py-6">
          {pendingOrderId && <div className="px-4 pb-4 lg:px-6"><Alert variant="warning"><AlertCircle /><AlertDescription className="flex w-full items-center justify-between gap-4"><span>你有一笔订单等待付款。</span><Button asChild variant="link" size="sm"><Link to={`/account/orders/${encodeURIComponent(pendingOrderId)}`}>去支付<ArrowRight /></Link></Button></AlertDescription></Alert></div>}
          {email ? <Outlet context={{ email }} /> : <div className="grid gap-4 px-4 lg:px-6"><Skeleton className="h-36" /><Skeleton className="h-72" /></div>}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
