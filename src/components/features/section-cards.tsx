import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { SummaryCard } from "@/components/features/summary-card"
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
      <SummaryCard label="累计收入" value={formatMoney(income)} detail={`有效账单 ${bills} 笔`} />
      <SummaryCard label="本月收入" value={formatMoney(monthlyIncome)} detail={`本日收入 ${formatMoney(dailyIncome)}`} action={<GrowthBadge value={monthlyIncomeGrowth} />} />
      <SummaryCard label="总客户数" value={users} detail={`累计客户 ${users} 位`} />
      <SummaryCard label="活跃客户" value={activeUsers} detail={`占总用户 ${formatPercent(activeUserRate)}`} />
    </div>
  )
}
