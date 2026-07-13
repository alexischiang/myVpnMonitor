import * as React from "react"
import { Mail, RefreshCw, Users } from "lucide-react"
import { toast } from "sonner"

import { postJson } from "@/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartAreaInteractive, DailyIncomeChart, UserGrowthChart } from "@/components/features/chart-area-interactive"
import { useServiceHealth } from "@/components/features/app-shell"
import { useData } from "@/components/features/data-provider"
import { SectionCards } from "@/components/features/section-cards"
import { EmptyState, StatusBadge } from "@/components/features/shared"
import { formatDate, formatDateTime, userStatus } from "@/utils"

function billIncomeForMonthDays(bills: Array<{ amount?: number; occurredAt?: string }>, date: Date, days: number) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const end = new Date(date.getFullYear(), date.getMonth(), Math.min(days, daysInMonth) + 1)

  return bills.reduce((sum, item) => {
    if (!item.occurredAt) return sum
    const occurredAt = new Date(item.occurredAt)
    if (Number.isNaN(occurredAt.getTime())) return sum
    if (occurredAt < start || occurredAt >= end) return sum
    return sum + (Number(item.amount) || 0)
  }, 0)
}

function billIncomeForDay(bills: Array<{ amount?: number; occurredAt?: string }>, date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)

  return bills.reduce((sum, item) => {
    if (!item.occurredAt) return sum
    const occurredAt = new Date(item.occurredAt)
    if (Number.isNaN(occurredAt.getTime())) return sum
    if (occurredAt < start || occurredAt >= end) return sum
    return sum + (Number(item.amount) || 0)
  }, 0)
}

function growthPercent(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

function ServiceMonitor() {
  const { services, checkedAt, loading, error, refresh } = useServiceHealth()
  const [sendingMail, setSendingMail] = React.useState(false)

  async function sendTestMail() {
    setSendingMail(true)
    try {
      const result = await postJson<{ to: string }>("/api/alerts/test-mail")
      toast.success(`测试邮件已发送至 ${result.to}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试邮件发送失败")
    } finally {
      setSendingMail(false)
    }
  }

  return <Card><CardHeader><div className="flex items-center justify-between gap-4"><CardTitle>服务监控</CardTitle><Button variant="outline" size="sm" onClick={refresh} disabled={loading}><RefreshCw className={loading ? "animate-spin" : undefined} />刷新</Button></div><CardDescription>{checkedAt ? `最后检测：${formatDateTime(checkedAt)}` : "尚未检测"}</CardDescription></CardHeader><CardContent className="grid auto-rows-fr">{services ? ([{ key: "database", name: "数据库" }, { key: "subconverter", name: "Subconverter" }, { key: "telegram", name: "Telegram API" }, { key: "resend", name: "Resend" }] as const).filter(({ key }) => key !== "database" || services.database.kind !== "json").map(({ key, name }) => { const service = services[key]; return <div key={key} className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0"><div className="flex items-center gap-1"><span className="text-sm font-medium">{name}</span>{key === "resend" ? <Button variant="ghost" size="icon-sm" onClick={sendTestMail} disabled={sendingMail} aria-label="发送测试邮件" title="发送测试邮件"><Mail className={sendingMail ? "animate-pulse" : undefined} /></Button> : null}</div><span className="text-sm font-medium">{service.latency === undefined ? "-" : `${service.latency} ms`}</span></div> }) : <p className="text-sm text-muted-foreground">{error || "正在检测服务..."}</p>}</CardContent></Card>
}

export function DashboardPage() {
  const { users, bills } = useData()
  const activeBills = bills.filter(item => !item.reversedAt)
  const totalIncome = activeBills.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  const activeUsers = users.filter(item => userStatus(item) !== "expired")
  const expiring = users.filter(item => userStatus(item) === "warning")
  const now = new Date()
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const elapsedDays = now.getDate()
  const monthlyIncome = billIncomeForMonthDays(activeBills, now, elapsedDays)
  const dailyIncome = billIncomeForDay(activeBills, now)
  const previousMonthIncome = billIncomeForMonthDays(activeBills, previousMonth, elapsedDays)
  const monthlyIncomeGrowth = growthPercent(monthlyIncome, previousMonthIncome)
  const activeUserRate = users.length ? (activeUsers.length / users.length) * 100 : 0

  return (
    <>
      <SectionCards
        users={users.length}
        activeUsers={activeUsers.length}
        bills={activeBills.length}
        income={totalIncome}
        monthlyIncome={monthlyIncome}
        dailyIncome={dailyIncome}
        monthlyIncomeGrowth={monthlyIncomeGrowth}
        activeUserRate={activeUserRate}
      />

      <div className="grid gap-4 px-4 lg:grid-cols-4 lg:px-6">
        <div className="min-w-0 lg:col-span-3"><ChartAreaInteractive bills={activeBills} /></div>
        <ServiceMonitor />
      </div>

      <div className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6">
        <DailyIncomeChart bills={activeBills} />
        <UserGrowthChart users={users} />
      </div>

      <div className="grid gap-4 px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users />
              到期提醒
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expiring.slice(0, 5).map(user => (
              <div key={user.id} className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0">
                <div>
                  <p className="text-sm font-medium">{user.userId || user.wechatName || user.email || "未命名客户"}</p>
                  <p className="text-sm text-muted-foreground">{formatDate(user.expiresAt)}</p>
                </div>
                <StatusBadge status="warning" />
              </div>
            ))}
            {!expiring.length && <EmptyState title="暂无临期客户" />}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
