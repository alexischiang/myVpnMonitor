import * as React from "react"
import { ArrowRight, Mail, RefreshCw } from "lucide-react"
import { Link } from "react-router-dom"
import { toast } from "@/components/features/toast"

import { fetchJson, postJson } from "@/api"
import { Progress } from "@/components/arc/progress/progress"
import { useServiceHealth } from "@/components/features/app-shell"
import { useData } from "@/components/features/data-provider"
import { SectionCards } from "@/components/features/section-cards"
import { MetricCard } from "@/components/arc/metric-card/metric-card"
import { EmptyState, StatusBadge } from "@/components/features/shared"
import { formatBytes, formatDate, formatDateTime, userStatus } from "@/utils"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Skeleton } from "@/components/arc/skeleton/skeleton"

const ChartAreaInteractive = React.lazy(() => import("@/components/features/chart-area-interactive").then(module => ({ default: module.ChartAreaInteractive })))
const DailyIncomeChart = React.lazy(() => import("@/components/features/chart-area-interactive").then(module => ({ default: module.DailyIncomeChart })))
const UserGrowthChart = React.lazy(() => import("@/components/features/chart-area-interactive").then(module => ({ default: module.UserGrowthChart })))

// Desktop (xl) rows are a 12-column grid and each card spans what its content needs: the one-number cards stack in a column beside
// the trend chart, the two ranked lists and the two 14-day charts pair up at half width, and the short expiry and service lists share
// the last row. Tablets use two columns; phones stack.
const dashboardRow = "grid grid-cols-1 gap-4 px-4 md:grid-cols-2 lg:px-6 xl:grid-cols-12"
// Grid cells stretch to the row; the card inside fills its cell so both cards of a row end on the same line.
const fillCell = "min-w-0 [&>*]:h-full"

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

// Work waiting on the admin: paid add-ons to deliver and tickets awaiting a support reply.
function PendingWorkCards() {
  const [summary, setSummary] = React.useState<{ pendingDeliveries: number; pendingTickets: number } | null>(null)
  const [error, setError] = React.useState(false)
  React.useEffect(() => { fetchJson<{ pendingDeliveries: number; pendingTickets: number }>("/api/admin/work-summary").then(setSummary).catch(() => setError(true)) }, [])
  const cards = [
    { label: "待交付服务", value: summary?.pendingDeliveries, detail: "已付款、等待人工交付的附加服务", to: "/deliveries", action: "去交付" },
    { label: "待处理工单", value: summary?.pendingTickets, detail: "等待客服回复的工单", to: "/tickets", action: "去处理" },
  ]
  return <>
    {cards.map(card => <MetricCard key={card.to} density="compact" label={card.label}
      value={summary ? card.value ?? 0 : null}
      context={error ? "暂时无法加载，请刷新页面重试" : card.detail}
      action={<Button asChild variant={summary && card.value ? "primary" : "secondary"} size="sm"><Link to={card.to}>{card.action}<ArrowRight /></Link></Button>} />)}
  </>
}

function ServiceMonitor() {
  const { services, checkedAt, loading, error, refresh } = useServiceHealth()
  const [sendingMail, setSendingMail] = React.useState(false)

  async function sendTestMail() {
    setSendingMail(true)
    try {
      const result = await postJson<{ to: string }>("/api/alerts/test-mail")
      toast({ type: "success", title: `测试邮件已发送至 ${result.to}` })
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "测试邮件发送失败" })
    } finally {
      setSendingMail(false)
    }
  }

  return <Card title="服务监控" description={checkedAt ? `最后检测：${formatDateTime(checkedAt)}` : "尚未检测"} headerAction={<Button variant="secondary" size="sm" onClick={refresh} disabled={loading}><RefreshCw className={loading ? "animate-spin" : undefined} />刷新</Button>}>
    {services ? <div className="grid">{([{ key: "database", name: "数据库" }, { key: "subconverter", name: "Subconverter" }, { key: "telegram", name: "Telegram API" }, { key: "resend", name: "Resend" }] as const).filter(({ key }) => key !== "database" || services.database.kind !== "json").map(({ key, name }) => {
      const service = services[key]
      return <div key={key} className="flex min-h-12 items-center justify-between gap-3 border-b py-2 last:border-b-0">
        <div className="flex items-center gap-1"><span className="text-sm font-medium">{name}</span>{key === "resend" ? <Button variant="ghost" size="icon-sm" onClick={sendTestMail} aria-label="发送测试邮件" title="发送测试邮件" loading={sendingMail}><Mail /></Button> : null}</div>
        <span className="text-sm tabular-nums text-muted-foreground">{service.latency === undefined ? "-" : `${service.latency} ms`}</span>
      </div>
    })}</div> : <p className="text-sm text-muted-foreground">{error || "正在检测服务..."}</p>}
  </Card>
}

type XuiDashboardData = {
  configured: boolean
  onlineEmails?: string[]
  dailyTraffic?: {
    date: string
    nodes: Record<string, { usedBytes: number }>
    users?: Record<string, { usedBytes: number }>
  }
  nodeNames?: Record<string, string>
}

// Presence and today's traffic from 3x-ui, polled every 30 seconds; the online count and both ranked lists read the same snapshot.
function useXuiPresence() {
  const [data, setData] = React.useState<XuiDashboardData | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)

  const refresh = React.useCallback((background = false) => {
    void fetchJson<XuiDashboardData>("/api/xui-presence", { background }).then(next => { setData(next); setFailed(false) }).catch(() => setFailed(true))
  }, [])

  const forceRefresh = React.useCallback(() => {
    setRefreshing(true)
    void postJson<XuiDashboardData>("/api/xui-presence/refresh", {})
      .then(result => { setData(result); toast({ type: "success", title: "已立即刷新流量数据" }) })
      .catch(() => toast({ type: "error", title: "刷新失败，请稍后重试" }))
      .finally(() => setRefreshing(false))
  }, [])

  React.useEffect(() => {
    refresh()
    const timer = window.setInterval(() => refresh(true), 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  return { data, failed, refreshing, forceRefresh }
}

/** Ranked rows with a bar scaled to the largest value, for today's traffic by node or by user. */
function TrafficRanking({ rows, emptyText }: { rows: Array<{ key: string; label: string; bytes: number }>; emptyText: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{emptyText}</p>
  const max = rows[0]!.bytes || 1
  return <ol className="grid gap-3">
    {rows.map((row, index) => <li key={row.key} className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2"><span className="w-4 flex-none text-right tabular-nums text-muted-foreground">{index + 1}</span><span className="truncate">{row.label}</span></span>
        <span className="flex-none tabular-nums text-muted-foreground">{formatBytes(row.bytes)}</span>
      </div>
      <Progress value={Math.max(3, row.bytes / max * 100)} />
    </li>)}
  </ol>
}

function trafficDate(data: XuiDashboardData | null) {
  return data?.dailyTraffic?.date ? `${data.dailyTraffic.date}（北京时间）` : "等待流量采集"
}

function NodeTrafficCard({ data, refreshing, onRefresh }: { data: XuiDashboardData | null; refreshing: boolean; onRefresh: () => void }) {
  const rows = Object.entries(data?.dailyTraffic?.nodes || {})
    .sort(([, left], [, right]) => right.usedBytes - left.usedBytes)
    .slice(0, 6)
    .map(([guid, item]) => ({ key: guid, label: data?.nodeNames?.[guid] || guid, bytes: item.usedBytes }))
  return <Card title="今日节点使用流量" description={trafficDate(data)} headerAction={<Button variant="secondary" size="sm" onClick={onRefresh} title="立即执行一次流量同步并获取最新数据" loading={refreshing}><RefreshCw />立即刷新</Button>}>
    <TrafficRanking rows={rows} emptyText="暂无今日流量数据" />
  </Card>
}

function UserTrafficCard({ data, users }: { data: XuiDashboardData | null; users: ReturnType<typeof useData>["users"] }) {
  const usersByEmail = new Map(users.filter(user => user.xuiClientEmail).map(user => [user.xuiClientEmail!.toLowerCase(), user]))
  const rows = Object.entries(data?.dailyTraffic?.users || {})
    .sort(([, left], [, right]) => right.usedBytes - left.usedBytes)
    .slice(0, 5)
    .map(([email, item]) => { const user = usersByEmail.get(email); return { key: email, label: user?.userId || user?.wechatName || user?.email || email, bytes: item.usedBytes } })
  return <Card title="今日用户流量 Top 5" description={trafficDate(data)}>
    <TrafficRanking rows={rows} emptyText="暂无今日用户流量数据" />
  </Card>
}

export function DashboardPage() {
  const { users, bills } = useData()
  const xui = useXuiPresence()
  const activeBills = bills.filter(item => !item.reversedAt)
  const totalIncome = activeBills.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  const activeUsers = users.filter(item => userStatus(item) !== "expired")
  const expiring = users.filter(item => userStatus(item) === "warning").sort((left, right) => String(left.expiresAt || "").localeCompare(String(right.expiresAt || "")))
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

      <div className={dashboardRow}>
        <div className={`${fillCell} md:col-span-2 xl:col-span-8`}>
          <React.Suspense fallback={<Skeleton lines={6} />}>
            <ChartAreaInteractive bills={activeBills} />
          </React.Suspense>
        </div>
        <div className="grid min-w-0 gap-4 md:col-span-2 md:grid-cols-3 xl:col-span-4 xl:grid-cols-1 xl:auto-rows-fr">
          <PendingWorkCards />
          <MetricCard density="compact" label="当前在线人数" value={xui.data?.configured ? xui.data.onlineEmails?.length ?? 0 : null} context={!xui.data ? xui.failed ? "暂时无法读取 3x-ui 在线状态" : "正在读取 3x-ui 在线状态" : xui.data.configured ? "按 3x-ui 在线客户端去重" : "3x-ui 尚未配置"} />
        </div>
      </div>

      <div className={dashboardRow}>
        <div className={`${fillCell} xl:col-span-6`}><NodeTrafficCard data={xui.data} refreshing={xui.refreshing} onRefresh={xui.forceRefresh} /></div>
        <div className={`${fillCell} xl:col-span-6`}><UserTrafficCard data={xui.data} users={users} /></div>
      </div>

      <div className={dashboardRow}>
        <React.Suspense fallback={<><Skeleton lines={6} className="xl:col-span-6" /><Skeleton lines={6} className="xl:col-span-6" /></>}>
          <div className={`${fillCell} xl:col-span-6`}><DailyIncomeChart bills={activeBills} /></div>
          <div className={`${fillCell} xl:col-span-6`}><UserGrowthChart users={users} /></div>
        </React.Suspense>
      </div>

      <div className={dashboardRow}>
        <div className={`${fillCell} xl:col-span-8`}>
          <Card title="到期提醒" description={expiring.length ? `${expiring.length} 位客户即将到期${expiring.length > 5 ? "，显示最早到期的 5 位" : ""}` : "近期没有即将到期的客户"}>
            {expiring.length ? <div className="grid">{expiring.slice(0, 5).map(user => (
              <div key={user.id} className="flex min-h-12 items-center justify-between gap-3 border-b py-2 last:border-b-0">
                <div className="grid min-w-0 gap-0.5">
                  <p className="truncate text-sm font-medium">{user.userId || user.wechatName || user.email || "未命名客户"}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">{formatDate(user.expiresAt)} 到期</p>
                </div>
                <StatusBadge status="warning" />
              </div>
            ))}</div> : <EmptyState title="暂无临期客户" />}
          </Card>
        </div>
        <div className={`${fillCell} xl:col-span-4`}><ServiceMonitor /></div>
      </div>
    </>
  )
}
