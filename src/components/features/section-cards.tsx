import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatMoney } from "@/utils"

type SectionCardsProps = {
  users: number
  activeUsers: number
  bills: number
  income: number
  monthlyIncome: number
  dailyIncome: number
  monthlyIncomeGrowth: number
  activeUserRate: number
}

function formatSignedPercent(value: number) {
  return `${Math.round(Math.abs(value))}%`
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

function growthClassName(value: number) {
  if (value > 0) return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-400"
  if (value < 0) return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-400"
  return "text-muted-foreground"
}

function GrowthBadge({ value }: { value: number }) {
  const Icon = value >= 0 ? IconTrendingUp : IconTrendingDown

  return (
    <Badge variant="outline" className={growthClassName(value)}>
      <Icon />
      {formatSignedPercent(value)}
    </Badge>
  )
}

export function SectionCards({
  users,
  activeUsers,
  bills,
  income,
  monthlyIncome,
  dailyIncome,
  monthlyIncomeGrowth,
  activeUserRate,
}: SectionCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:shadow-xs md:grid-cols-2 lg:px-6 xl:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>累计收入</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatMoney(income)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 font-medium">有效账单 {bills} 笔</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>本月收入</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatMoney(monthlyIncome)}
          </CardTitle>
          <CardAction>
            <GrowthBadge value={monthlyIncomeGrowth} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 font-medium">本日收入 {formatMoney(dailyIncome)}</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>总客户数</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {users}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 font-medium">累计客户 {users} 位</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>活跃客户</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {activeUsers}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 font-medium">占总用户 {formatPercent(activeUserRate)}</div>
        </CardFooter>
      </Card>
    </div>
  )
}
