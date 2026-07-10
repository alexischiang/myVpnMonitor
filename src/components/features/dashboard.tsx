import * as React from "react"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { ArrowRight, Cable, Users, WalletCards } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartAreaInteractive } from "@/components/features/chart-area-interactive"
import { DataTable, DataTableColumnHeader } from "@/components/features/data-table"
import { useData } from "@/components/features/data-provider"
import { SectionCards } from "@/components/features/section-cards"
import { EmptyState, StatusBadge, TrafficProgress } from "@/components/features/shared"
import type { Subscription } from "@/types"
import { formatDate, formatMoney, userStatus } from "@/utils"

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
  const { subscriptions, users, bills } = useData()
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
  const recentSubs = subscriptions.slice(0, 6)

  const subscriptionColumns = React.useMemo<ColumnDef<Subscription>[]>(() => [
    {
      id: "subscription",
      accessorFn: item => `${item.email || item.name || ""} ${item.serviceProvider || item.provider || ""}`,
      header: DataTableColumnHeader({ title: "订阅" }),
      meta: { label: "订阅" },
      cell: ({ row }) => (
        <div className="grid gap-1">
          <div className="truncate font-medium">{row.original.email || row.original.name || "未命名订阅"}</div>
          <div className="truncate text-sm text-muted-foreground">{row.original.serviceProvider || row.original.provider || "Provider"}</div>
        </div>
      ),
    },
    {
      id: "traffic",
      header: "流量",
      meta: { label: "流量" },
      cell: ({ row }) => (
        <TrafficProgress
          remaining={row.original.metrics?.remainingBytes}
          total={row.original.metrics?.totalBytes}
        />
      ),
      enableSorting: false,
    },
    {
      accessorFn: item => item.metrics?.expireAt || "",
      id: "expires",
      header: DataTableColumnHeader({ title: "到期" }),
      meta: { label: "到期" },
      cell: ({ row }) => formatDate(row.original.metrics?.expireAt),
    },
    {
      accessorKey: "status",
      header: DataTableColumnHeader({ title: "状态" }),
      meta: { label: "状态" },
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ], [])

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

      <div className="grid gap-4 px-4 lg:grid-cols-3 lg:px-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cable />
              订阅池健康度
            </CardTitle>
            <CardDescription>查看最近订阅池的流量、到期时间和状态。</CardDescription>
            <CardAction>
              <Button asChild variant="outline" size="sm">
                <Link to="/urls">
                  管理订阅
                  <ArrowRight />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={subscriptionColumns}
              data={recentSubs}
              searchKey="subscription"
              searchPlaceholder="搜索订阅..."
              emptyTitle="暂无订阅池"
              emptyDescription="创建第一个订阅后，这里会显示健康度。"
              pageSize={6}
            />
          </CardContent>
          <CardFooter className="text-sm text-muted-foreground">
            显示最近 {recentSubs.length} 个订阅池，共 {subscriptions.length} 个。
          </CardFooter>
        </Card>

        <div className="grid gap-4">
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <WalletCards />
                最近账单
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeBills.slice(0, 5).map(bill => (
                <div key={bill.id} className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0">
                  <div>
                    <p className="text-sm font-medium">{bill.user?.userId || bill.description || "账单"}</p>
                    <p className="text-sm text-muted-foreground">{formatDate(bill.occurredAt)}</p>
                  </div>
                  <div className="text-sm font-medium">{formatMoney(bill.amount)}</div>
                </div>
              ))}
              {!activeBills.length && <EmptyState title="暂无账单" />}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
