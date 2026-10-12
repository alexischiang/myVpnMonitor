import { MetricCard } from "@/components/arc/metric-card/metric-card"

type UsersSummaryCardProps = {
  total: number
  active: number
  addedToday: number
  expiring: number
}

export function UsersSummaryCard({ total, active, addedToday, expiring }: UsersSummaryCardProps) {
  return (
    <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="总用户数" value={total} />
      <MetricCard label="活跃用户" value={active} />
      <MetricCard label="本日新增用户" value={addedToday} />
      <MetricCard label="即将过期用户" value={expiring} />
    </div>
  )
}
