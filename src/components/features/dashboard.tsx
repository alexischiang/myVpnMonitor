import { Users } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartAreaInteractive } from "@/components/features/chart-area-interactive"
import { useData } from "@/components/features/data-provider"
import { SectionCards } from "@/components/features/section-cards"
import { EmptyState, StatusBadge } from "@/components/features/shared"
import { formatDate, userStatus } from "@/utils"

export function DashboardPage() {
  const { subscriptions, users, bills } = useData()
  const activeBills = bills.filter(item => !item.reversedAt)
  const totalIncome = activeBills.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  const activeUsers = users.filter(item => userStatus(item) !== "expired")
  const expiring = users.filter(item => userStatus(item) === "warning")
  const trafficTotal = subscriptions.reduce((sum, item) => sum + (item.metrics?.remainingBytes || 0), 0)

  return (
    <>
      <SectionCards
        subscriptions={subscriptions.length}
        healthySubscriptions={subscriptions.filter(item => item.status === "ok").length}
        users={users.length}
        activeUsers={activeUsers.length}
        bills={activeBills.length}
        income={totalIncome}
        trafficBytes={trafficTotal}
        expiringUsers={expiring.length}
      />

      <div className="px-4 lg:px-6">
        <ChartAreaInteractive bills={activeBills} />
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
