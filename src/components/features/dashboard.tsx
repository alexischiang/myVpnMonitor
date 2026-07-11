import { Users } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartAreaInteractive, DailyIncomeChart, UserGrowthChart } from "@/components/features/chart-area-interactive"
import { useData } from "@/components/features/data-provider"
import { SectionCards } from "@/components/features/section-cards"
import { EmptyState, StatusBadge } from "@/components/features/shared"
import { formatDate, userStatus } from "@/utils"

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

      <div className="px-4 lg:px-6">
        <ChartAreaInteractive bills={activeBills} />
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
