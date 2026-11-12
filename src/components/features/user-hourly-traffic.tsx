import * as React from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { fetchJson } from "@/api"
import { ActivityHeatmap } from "@/components/arc/activity-heatmap/activity-heatmap"
import { Alert } from "@/components/arc/alert/alert"
import { Card } from "@/components/arc/card/card"
import { DatePicker } from "@/components/arc/date-picker/date-picker"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { EmptyState } from "@/components/features/shared"
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { formatBytes } from "@/utils"

export type HourlyUsageCell = { date: string; hour: number; up: number; down: number; topNode: string }
export type HourlyUsage = {
  dates: string[]
  cells: HourlyUsageCell[]
  profile: Array<{ hour: number; up: number; down: number }>
}

// Hourly rows are kept 90 days (server retention), so the last selectable end date still has a full 7-day window.
const RETENTION_DAYS = 90
const WINDOW_DAYS = 7
const TRAFFIC_UNIT = { one: "流量", other: "流量" }

const profileConfig = {
  down: { label: "下载", color: "var(--series-1)" },
  up: { label: "上传", color: "var(--series-2)" },
} satisfies ChartConfig

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function shortDay(key: string) {
  return `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`
}

function hourRange(hour: number) {
  return `${String(hour).padStart(2, "0")}:00–${String(hour + 1).padStart(2, "0")}:00`
}

// Square-root scale against the busiest cell: one huge hour doesn't wash every other cell out,
// and light hours still stay visibly lighter than heavy ones. Level n tops out at max·(n/4)².
function sqrtThresholds(max: number): [number, number, number] {
  return [Math.max(1, max / 16), Math.max(2, max / 4), Math.max(3, max * 9 / 16)]
}

export function UserHourlyTraffic({ userId }: { userId: string }) {
  // The window always spans 7 days; the picker chooses its last day (today by default).
  const today = React.useMemo(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()) }, [])
  const earliestEnd = React.useMemo(() => new Date(today.getFullYear(), today.getMonth(), today.getDate() - (RETENTION_DAYS - WINDOW_DAYS)), [today])
  const [end, setEnd] = React.useState<Date>(today)
  const endKey = dateKey(end)
  const [usage, setUsage] = React.useState<HourlyUsage | null>(null)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    let current = true
    setUsage(null)
    setError("")
    fetchJson<HourlyUsage>(`/api/users/${userId}/hourly-traffic?end=${endKey}`)
      .then(data => { if (current) setUsage(data) })
      .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : "读取失败") })
    return () => { current = false }
  }, [userId, endKey])

  const byKey = React.useMemo(() => new Map((usage?.cells || []).map(cell => [`${cell.date} ${cell.hour}`, cell])), [usage])
  const max = React.useMemo(() => Math.max(0, ...(usage?.cells || []).map(cell => cell.up + cell.down)), [usage])
  const thresholds = React.useMemo(() => sqrtThresholds(max), [max])
  // One entry per (day, hour); the first day is always present so the grid spans the whole range even before traffic starts.
  const heatmapDays = React.useMemo(() => {
    if (!usage) return []
    const entries = usage.cells.map(cell => ({ date: cell.date, hour: cell.hour, count: cell.up + cell.down }))
    const edges = [usage.dates[0], usage.dates[usage.dates.length - 1]].filter(Boolean).map(date => ({ date, hour: 0, count: 0 }))
    return [...edges, ...entries]
  }, [usage])
  const describe = React.useCallback((date: string, hour?: number) => {
    const cell = byKey.get(`${date} ${hour}`)
    if (!cell) return ""
    return [`下载 ${formatBytes(cell.down)}`, `上传 ${formatBytes(cell.up)}`, cell.topNode].filter(Boolean).join(" · ")
  }, [byKey])
  const peak = React.useMemo(() => (usage?.cells || []).reduce<HourlyUsageCell | null>((best, cell) => !best || cell.up + cell.down > best.up + best.down ? cell : best, null), [usage])
  const totals = (usage?.profile || []).reduce((sum, hour) => ({ up: sum.up + hour.up, down: sum.down + hour.down }), { up: 0, down: 0 })
  const busiestHour = (usage?.profile || []).reduce<{ hour: number; bytes: number } | null>((best, hour) => !best || hour.up + hour.down > best.bytes ? { hour: hour.hour, bytes: hour.up + hour.down } : best, null)

  return <Card title="流量时段" description="北京时间 · 按节点倍率折算后的计费流量" headerAction={<DatePicker label="截止日期" hideLabel value={end} onChange={date => { if (date) setEnd(date) }} minDate={earliestEnd} maxDate={today} showToday align="end" />}>
    {error ? <Alert tone="danger" title="读取流量时段失败">{error}</Alert>
      : !usage ? <Skeleton lines={1} className="h-72" />
      : !usage.cells.length ? <EmptyState title="暂无小时流量记录" description="小时流量从启用按小时记录后开始积累，该用户在所选范围内还没有记录。" />
      : <div className="grid gap-6">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div><dt className="text-muted-foreground">下载</dt><dd className="font-medium tabular-nums">{formatBytes(totals.down)}</dd></div>
          <div><dt className="text-muted-foreground">上传</dt><dd className="font-medium tabular-nums">{formatBytes(totals.up)}</dd></div>
          <div><dt className="text-muted-foreground">最忙时段</dt><dd className="font-medium tabular-nums">{busiestHour ? hourRange(busiestHour.hour) : "-"}</dd></div>
          <div><dt className="text-muted-foreground">单小时峰值</dt><dd className="font-medium tabular-nums">{peak ? formatBytes(peak.up + peak.down) : "-"}</dd></div>
        </dl>

        <ActivityHeatmap hourly days={heatmapDays} label="每日各小时流量热力图" period={usage.dates.length ? `${shortDay(usage.dates[0])} – ${shortDay(usage.dates[usage.dates.length - 1])}` : ""}
          unit={TRAFFIC_UNIT} thresholds={thresholds} formatCount={formatBytes} describe={describe} />

        <section className="grid min-w-0 gap-3" aria-label="24 小时流量分布">
          <h3 className="text-sm font-medium">24 小时分布</h3>
          <ChartContainer config={profileConfig} className="aspect-auto h-56 w-full">
            <BarChart accessibilityLayer data={usage.profile} margin={{ left: 0, right: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} interval={2} />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} width={64} tickFormatter={value => formatBytes(Number(value))} />
              <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltipContent
                labelFormatter={(_, payload) => hourRange(Number(payload?.[0]?.payload?.hour ?? 0))}
                formatter={(value, name) => <>
                  <span className="size-2.5 shrink-0 rounded-xs" style={{ background: `var(--color-${name})` }} />
                  <span className="flex-1 text-muted-foreground">{profileConfig[name as keyof typeof profileConfig]?.label ?? name}</span>
                  <span className="font-medium text-foreground tabular-nums">{formatBytes(Number(value))}</span>
                </>}
              />} />
              <Bar dataKey="down" stackId="traffic" fill="var(--color-down)" />
              <Bar dataKey="up" stackId="traffic" fill="var(--color-up)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </section>
      </div>}
  </Card>
}
