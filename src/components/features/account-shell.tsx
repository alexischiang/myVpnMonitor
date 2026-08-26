import * as React from "react"
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import { AlertCircle, ArrowRight, BookOpen, CreditCard, ExternalLink, Gauge, Gift, GraduationCap, LifeBuoy, LogOut, ReceiptText, ShieldCheck, UserRound, WalletCards } from "lucide-react"
import { useTheme } from "next-themes"

import { apiFetch, clearJsonCache, fetchJson, setCachedJson } from "@/api"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, useSidebar } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { SiteHeader } from "@/components/features/site-header"

const accountNav = [
  { title: "总览", url: "/account", icon: Gauge, exact: true },
  { title: "使用入门", url: "/onboarding?replay=1", icon: GraduationCap },
  { title: "购买服务", url: "/account/plans", icon: CreditCard },
  { title: "使用文档", url: "/account/docs", icon: BookOpen },
  { title: "工单支持", url: "/account/tickets", icon: LifeBuoy },
  { title: "账户余额", url: "/account/wallet", icon: WalletCards },
  { title: "邀请返利", url: "/account/referrals", icon: Gift },
  { title: "订单记录", url: "/account/orders", icon: ReceiptText },
  { title: "账户设置", url: "/account/settings", icon: UserRound },
]

function CloseMobileSidebarOnNavigation() {
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()
  React.useEffect(() => { setOpenMobile(false) }, [pathname, setOpenMobile])
  return null
}

export function AccountShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { resolvedTheme, setTheme, theme } = useTheme()
  const [email, setEmail] = React.useState("")
  const [pendingOrderId, setPendingOrderId] = React.useState("")
  const [onboardingEnabled, setOnboardingEnabled] = React.useState(false)
  const dark = (theme ?? resolvedTheme) === "dark"
  const current = accountNav.find(item => item.exact ? location.pathname === item.url : location.pathname.startsWith(item.url)) || accountNav[0]

  React.useEffect(() => {
    fetchJson<{ onboardingEnabled: boolean }>("/api/public/sales-settings").then(settings => setOnboardingEnabled(settings.onboardingEnabled)).catch(() => undefined)
    fetchJson<{ role: string; email?: string }>("/api/auth/me")
      .then(me => me.role === "user" ? setEmail(me.email || "") : navigate("/dashboard", { replace: true }))
      .catch(() => navigate("/login", { replace: true }))
  }, [navigate])

  React.useEffect(() => {
    if (!email) return
    const crispWindow = window as typeof window & { $crisp?: { push(command: ["do", "chat:show" | "chat:hide"] | ["set", "user:email", [string]]): number }; CRISP_WEBSITE_ID?: string }
    crispWindow.$crisp ||= []
    crispWindow.CRISP_WEBSITE_ID = "149a15d1-aa5b-471e-9da6-fa37c8b17f68"
    crispWindow.$crisp.push(["set", "user:email", [email]])
    crispWindow.$crisp.push(["do", "chat:show"])
    if (!document.querySelector('script[src="https://client.crisp.chat/l.js"]')) {
      const script = document.createElement("script")
      script.src = "https://client.crisp.chat/l.js"
      script.async = true
      document.head.appendChild(script)
    }
    return () => { crispWindow.$crisp?.push(["do", "chat:hide"]) }
  }, [email])

  React.useEffect(() => {
    if (!email) return
    const refreshOrders = () => fetchJson<Array<{ id: string; status: string }>>("/api/account/orders")
      .then(orders => {
        setCachedJson("/api/account/orders", orders)
        setPendingOrderId(orders.find(order => order.status === "pending")?.id || "")
      })
      .catch(() => undefined)
    void refreshOrders()
    const timer = window.setInterval(refreshOrders, 180_000)
    const handleOrderUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; status?: string }>).detail
      if (detail?.id && detail.status === "pending") setPendingOrderId(detail.id)
      clearJsonCache()
      void refreshOrders()
    }
    window.addEventListener("payment-order-updated", handleOrderUpdate)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("payment-order-updated", handleOrderUpdate)
    }
  }, [email])

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" })
    clearJsonCache()
    navigate("/login", { replace: true })
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": "calc(var(--spacing) * 72)", "--header-height": "calc(var(--spacing) * 12)" } as React.CSSProperties}>
      <CloseMobileSidebarOnNavigation />
      <Sidebar variant="inset" collapsible="offcanvas">
        <SidebarHeader>
          <SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!"><Link to="/account"><ShieldCheck className="size-5" /><span className="text-lg font-semibold">NEXORA</span><Badge variant="outline" className="h-4 self-baseline rounded-sm border-foreground bg-foreground px-1.5 py-0 text-[11px] text-background">beta</Badge></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup><SidebarGroupContent><SidebarMenu>{accountNav.filter(item => onboardingEnabled || !item.url.startsWith("/onboarding")).map(item => (
            <SidebarMenuItem key={item.url}><SidebarMenuButton asChild tooltip={item.title} isActive={item.exact ? location.pathname === item.url : location.pathname.startsWith(item.url)}><NavLink to={item.url === "/account/docs" ? "/docs/" : item.url} target={item.url === "/account/docs" ? "_blank" : undefined} rel={item.url === "/account/docs" ? "noopener noreferrer" : undefined}><item.icon /><span>{item.title}</span>{item.url === "/account/docs" ? <ExternalLink className="ml-auto" /> : null}</NavLink></SidebarMenuButton></SidebarMenuItem>
          ))}</SidebarMenu></SidebarGroupContent></SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu><SidebarMenuItem><DropdownMenu><DropdownMenuTrigger asChild><SidebarMenuButton size="lg"><Avatar className="size-8 rounded-lg"><AvatarFallback className="rounded-lg">{email.slice(0, 2).toUpperCase() || "U"}</AvatarFallback></Avatar><div className="grid flex-1 text-left text-sm"><span className="truncate font-medium">{email || "加载中"}</span><span className="text-xs text-muted-foreground">User account</span></div></SidebarMenuButton></DropdownMenuTrigger><DropdownMenuContent side="right" align="end" className="min-w-56"><DropdownMenuItem asChild><Link to="/account/settings"><UserRound />账户设置</Link></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={logout}><LogOut />退出登录</DropdownMenuItem></DropdownMenuContent></DropdownMenu></SidebarMenuItem></SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 overflow-x-clip">
        <SiteHeader title={current.title} dark={dark} onToggleTheme={() => setTheme(dark ? "light" : "dark")} onLogout={logout} />
        <div className="mx-auto flex w-full max-w-[1440px] min-w-0 flex-1 flex-col pt-6 pb-4 md:pt-8 md:pb-6">
          {pendingOrderId && location.pathname !== `/account/orders/${encodeURIComponent(pendingOrderId)}` ? <div className="px-4 pb-4 lg:px-6"><Alert variant="warning"><AlertCircle /><AlertDescription className="flex w-full items-center justify-between gap-4"><span>你有一笔订单等待付款。</span><Button asChild variant="link" size="sm"><Link to={`/account/orders/${encodeURIComponent(pendingOrderId)}`}>去支付<ArrowRight /></Link></Button></AlertDescription></Alert></div> : null}
          {email ? <Outlet context={{ email }} /> : <div className="grid gap-4 px-4 lg:px-6"><Skeleton className="h-36" /><Skeleton className="h-72" /></div>}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
