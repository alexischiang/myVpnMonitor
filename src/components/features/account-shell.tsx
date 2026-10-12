import * as React from "react"
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
import { Activity, ArrowRight, BookOpen, CreditCard, Gift, LifeBuoy, ReceiptText, UserRound, WalletCards } from "lucide-react"
import { useTheme } from "next-themes"

import { apiFetch, clearJsonCache, fetchJson, setCachedJson } from "@/api"
import { UserAlert } from "@/components/features/shared"
import { DOCS_URL } from "@/lib/docs-site"
import type { UserAlertSetting } from "@/types"
import { Alert } from "@/components/arc/alert/alert"
import { SiteHeader, type SiteHeaderItem } from "@/components/arc/blocks/site-header/site-header"
import { Button } from "@/components/arc/button/button"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { UserMenu } from "@/components/arc/user-menu/user-menu"

const ICON = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const

// The user centre's destinations, grouped for the top bar. A group opens a panel; 总览 is a plain link.
// Account settings, the theme and signing out live in the account menu at the end of the bar.
function accountNav(hasActiveNodeAccess: boolean): SiteHeaderItem[] {
  return [
    { value: "overview", label: "总览", href: "/account" },
    {
      value: "service", label: "服务",
      links: [
        { label: "购买服务", description: "选择或续费套餐", href: "/account/plans", icon: <CreditCard {...ICON} /> },
        ...(hasActiveNodeAccess ? [{ label: "节点状态", description: "查看套餐内节点的探测结果", href: "/account/nodes", icon: <Activity {...ICON} /> }] : []),
      ],
    },
    {
      value: "billing", label: "账务",
      links: [
        { label: "账户余额", description: "充值与余额明细", href: "/account/wallet", icon: <WalletCards {...ICON} /> },
        { label: "订单记录", description: "所有商品订单", href: "/account/orders", icon: <ReceiptText {...ICON} /> },
        { label: "邀请返利", description: "邀请链接与返利记录", href: "/account/referrals", icon: <Gift {...ICON} /> },
      ],
    },
    {
      value: "help", label: "帮助",
      links: [
        { label: "使用文档", description: "各平台客户端的使用教程", href: DOCS_URL, external: true, icon: <BookOpen {...ICON} /> },
        { label: "工单服务", description: "向客服提交问题", href: "/account/tickets", icon: <LifeBuoy {...ICON} /> },
      ],
    },
  ]
}

/** The group a path belongs to, so sub-pages such as an order's detail keep their group marked. */
function currentGroup(pathname: string) {
  if (pathname === "/account") return "overview"
  if (/^\/account\/(plans|nodes|subscription)(\/|$)/.test(pathname)) return "service"
  if (/^\/account\/(wallet|orders|referrals|payment)(\/|$)/.test(pathname)) return "billing"
  if (/^\/account\/(tickets|docs)(\/|$)/.test(pathname)) return "help"
  return ""
}

export function AccountShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { resolvedTheme, setTheme, theme } = useTheme()
  const [email, setEmail] = React.useState("")
  const [hasActiveNodeAccess, setHasActiveNodeAccess] = React.useState(false)
  const [pendingOrderId, setPendingOrderId] = React.useState("")
  const [userAlerts, setUserAlerts] = React.useState<UserAlertSetting[]>([])
  const dark = (theme ?? resolvedTheme) === "dark"
  const navItems = React.useMemo(() => accountNav(hasActiveNodeAccess), [hasActiveNodeAccess])

  React.useEffect(() => {
    fetchJson<{ role: string; email?: string; hasActiveNodeAccess?: boolean }>("/api/auth/me")
      .then(me => { if (me.role === "user") { setEmail(me.email || ""); setHasActiveNodeAccess(Boolean(me.hasActiveNodeAccess)) } else navigate("/dashboard", { replace: true }) })
      .catch(() => navigate("/login", { replace: true }))
  }, [navigate])

  React.useEffect(() => { fetchJson<{ userAlerts: UserAlertSetting[] }>("/api/public/sales-settings").then(data => setUserAlerts(data.userAlerts || [])).catch(() => undefined) }, [])

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
    const refreshOrders = (background = false) => fetchJson<Array<{ id: string; status: string }>>("/api/account/orders", { background })
      .then(orders => {
        setCachedJson("/api/account/orders", orders)
        setPendingOrderId(orders.find(order => order.status === "pending")?.id || "")
      })
      .catch(() => undefined)
    void refreshOrders()
    const timer = window.setInterval(() => void refreshOrders(true), 180_000)
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
    <div className="min-h-svh bg-background">
      <SiteHeader
        variant="mega"
        label="用户中心导航"
        brand={{ name: "NEXORA", href: "/account", mark: <></> }}
        items={navItems}
        current={currentGroup(location.pathname)}
        onNavigate={destination => { if (destination.href?.startsWith("/")) navigate(destination.href) }}
        endSlot={<UserMenu
          user={{ name: email ? email.split("@")[0] : "加载中", email }}
          theme={dark ? "dark" : "light"}
          onThemeChange={next => setTheme(next === "dark" ? "dark" : "light")}
          items={[{ label: "账户设置", icon: <UserRound size={16} />, onSelect: () => navigate("/account/settings") }]}
          onSignOut={logout}
          align="end"
        />}
      />
      <main className="@container/main mx-auto w-full max-w-[1440px] p-4 md:p-6 [&>div]:!px-0 [&>div]:lg:!px-0">
            <div className="grid gap-3 pb-2">{userAlerts.filter(item => item.page === (location.pathname.includes("/plans/checkout") ? "checkout" : location.pathname === "/account" ? "account" : location.pathname === "/account/plans" ? "pricing" : "")).map(item => <UserAlert key={item.id} item={item} />)}{pendingOrderId && location.pathname !== `/account/orders/${encodeURIComponent(pendingOrderId)}` ? <Alert tone="warning" title="请注意"><span>你有一笔订单等待付款。</span><Button asChild variant="link" size="sm"><Link to={`/account/orders/${encodeURIComponent(pendingOrderId)}`}>去支付<ArrowRight /></Link></Button></Alert> : null}</div>
            {email ? <Outlet context={{ email }} /> : <div className="grid gap-4 px-4 lg:px-6"><Skeleton lines={4} /><Skeleton lines={6} /></div>}
      </main>
    </div>
  )
}
