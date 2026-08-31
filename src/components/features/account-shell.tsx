import * as React from "react"
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
import { AlertCircle, ArrowRight, BookOpen, CreditCard, Gauge, Gift, LifeBuoy, ReceiptText, UserRound, WalletCards } from "lucide-react"
import { useTheme } from "next-themes"

import { apiFetch, clearJsonCache, fetchJson, setCachedJson } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AppLayout } from "@/components/features/app-layout"
import { AppSidebar } from "@/components/features/app-sidebar"

const accountNav = [
  { title: "总览", url: "/account", icon: Gauge, exact: true },
  { title: "购买服务", url: "/account/plans", icon: CreditCard },
  { title: "使用文档", url: "/account/docs", icon: BookOpen },
  { title: "工单服务", url: "/account/tickets", icon: LifeBuoy },
  { title: "账户余额", url: "/account/wallet", icon: WalletCards },
  { title: "邀请返利", url: "/account/referrals", icon: Gift },
  { title: "订单记录", url: "/account/orders", icon: ReceiptText },
  { title: "账户设置", url: "/account/settings", icon: UserRound },
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
    <AppLayout
      title={current.title}
      dark={dark}
      onToggleTheme={() => setTheme(dark ? "light" : "dark")}
      onLogout={logout}
      sidebar={<AppSidebar variant="inset" items={accountNav.map(item => item.url === "/account/docs" ? { ...item, href: "/docs/", external: true } : item)} homeUrl="/account" accountName={email || "加载中"} accountDescription="User account" accountUrl="/account/settings" accountLabel="账户设置" onLogout={logout} />}
    >
            {pendingOrderId && location.pathname !== `/account/orders/${encodeURIComponent(pendingOrderId)}` ? <div className="px-4 pb-4 lg:px-6"><Alert variant="warning"><AlertCircle /><AlertDescription className="flex w-full items-center justify-between gap-4"><span>你有一笔订单等待付款。</span><Button asChild variant="link" size="sm"><Link to={`/account/orders/${encodeURIComponent(pendingOrderId)}`}>去支付<ArrowRight /></Link></Button></AlertDescription></Alert></div> : null}
            {email ? <Outlet context={{ email }} /> : <div className="grid gap-4 px-4 lg:px-6"><Skeleton className="h-36" /><Skeleton className="h-72" /></div>}
    </AppLayout>
  )
}
