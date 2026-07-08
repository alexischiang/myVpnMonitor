import * as React from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { ThemeProvider } from "next-themes"

import "./styles.css"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { DataProvider } from "@/components/features/data-provider"
import { AppShell } from "@/components/features/app-shell"
import { DashboardPage } from "@/components/features/dashboard"
import { SubscriptionsPage } from "@/components/features/subscriptions"
import { UsersPage } from "@/components/features/users"
import { BillsPage } from "@/components/features/bills"
import { SubscriptionDetailPage, UserDetailPage } from "@/components/features/details"
import { EmbyPage } from "@/components/features/emby"
import { SubconverterPage } from "@/components/features/subconverter"
import { DeliveryPage, PricingPage } from "@/components/features/public-pages"
import { apiFetch } from "@/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function LoginPage() {
  const [account, setAccount] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [remember, setRemember] = React.useState(true)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError("")
    try {
      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ account, password, remember }),
      })
      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error || "登录失败")
        return
      }
      window.location.href = "/dashboard"
    } catch {
      setError("无法连接登录服务")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">myVpnMonitor</CardTitle>
          <p className="text-sm text-muted-foreground">订阅运营控制台</p>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submit}>
            <div className="grid gap-2">
              <Label htmlFor="account">账号</Label>
              <Input id="account" autoFocus autoComplete="username" value={account} onChange={event => setAccount(event.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">密码</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={remember} onCheckedChange={checked => setRemember(Boolean(checked))} />
              记住我，30 天内免登录
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading}>{loading ? "登录中..." : "登录"}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}

function ProtectedApp() {
  const [dark, setDark] = React.useState(() => localStorage.getItem("themeMode") === "dark")

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    localStorage.setItem("themeMode", dark ? "dark" : "light")
  }, [dark])

  return (
    <DataProvider>
      <AppShell dark={dark} onToggleTheme={() => setDark(value => !value)} />
    </DataProvider>
  )
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/delivery/:token" element={<DeliveryPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/buy" element={<PricingPage />} />
            <Route path="/" element={<ProtectedApp />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="urls" element={<SubscriptionsPage />} />
              <Route path="urls/detail/:id" element={<SubscriptionDetailPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="users/detail/:id" element={<UserDetailPage />} />
              <Route path="bills" element={<BillsPage />} />
              <Route path="emby" element={<EmbyPage />} />
              <Route path="subconverter" element={<SubconverterPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
