import { MetricCard } from "@/components/arc/metric-card/metric-card"
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

/** A signed percentage; the metric card colours it by its sign. */
function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : "-"}${Math.round(Math.abs(value))}%`
}

export function SectionCards({ users, activeUsers, bills, income, monthlyIncome, dailyIncome, monthlyIncomeGrowth, activeUserRate }: SectionCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 md:grid-cols-2 lg:px-6 xl:grid-cols-4">
      <MetricCard label="累计收入" value={income} prefix="¥" decimals={2} context={`有效账单 ${bills} 笔`} />
      <MetricCard label="本月收入" value={monthlyIncome} prefix="¥" decimals={2} change={formatSignedPercent(monthlyIncomeGrowth)} context={`本日收入 ${formatMoney(dailyIncome)}`} />
      <MetricCard label="总客户数" value={users} context={`累计客户 ${users} 位`} />
      <MetricCard label="活跃客户" value={activeUsers} context={`占总用户 ${Math.round(activeUserRate)}%`} />
    </div>
  )
}
