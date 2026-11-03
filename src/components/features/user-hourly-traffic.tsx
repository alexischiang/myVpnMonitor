import * as React from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { fetchJson } from "@/api"
import { Alert } from "@/components/arc/alert/alert"
import { Card } from "@/components/arc/card/card"
import SegmentedControl from "@/components/arc/segmented-control/segmented-control"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { EmptyState } from "@/components/features/shared"
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/utils"

export type HourlyUsageCell = { date: string; hour: number; up: number; down: number; topNode: string }
export type HourlyUsage = {
  dates: string[]
  cells: HourlyUsageCell[]
  profile: Array<{ hour: number; up: number; down: number }>
}

const RANGE_OPTIONS = [{ value: "7", label: "7 天" }, { value: "30", label: "30 天" }, { value: "90", label: "90 天" }]
// Row height shrinks with the range so 90 days still fit on one screen; labels thin out to weekly.
const ROW_CLASS: Record<string, string> = { "7": "h-6", "30": "h-3.5", "90": "h-1.5" }
const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21]
const LEVEL_MIX = [25, 50, 75, 100]

const profileConfig = {
  down: { label: "下载", color: "var(--series-1)" },
  up: { label: "上传", color: "var(--series-2)" },
} satisfies ChartConfig

function dayLabel(date: string) {
  return date.slice(5).replace("-", "/")
}

function hourRange(hour: number) {
  return `${String(hour).padStart(2, "0")}:00–${String(hour + 1).padStart(2, "0")}:00`
}

// Square-root scale against the busiest cell: one huge hour doesn't wash every other cell out,
// and light hours still stay visibly lighter than heavy ones.
function level(bytes: number, max: number) {
  if (!bytes || !max) return -1
  return Math.min(LEVEL_MIX.length - 1, Math.max(0, Math.ceil(Math.sqrt(bytes / max) * LEVEL_MIX.length) - 1))
}

function cellColor(value: number) {
  return value < 0 ? undefined : `color-mix(in oklab, var(--series-1) ${LEVEL_MIX[value]}%, var(--muted))`
}

export function UserHourlyTraffic({ userId }: { userId: string }) {
  const [range, setRange] = React.useState("30")
  const [usage, setUsage] = React.useState<HourlyUsage | null>(null)
  const [error, setError] = React.useState("")
  const [active, setActive] = React.useState<HourlyUsageCell | null>(null)

  React.useEffect(() => {
    let current = true
    setUsage(null)
    setError("")
    setActive(null)
    fetchJson<HourlyUsage>(`/api/users/${userId}/hourly-traffic?days=${range}`)
      .then(data => { if (current) setUsage(data) })
      .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : "读取失败") })
    return () => { current = false }
  }, [userId, range])

  const byKey = React.useMemo(() => new Map((usage?.cells || []).map(cell => [`${cell.date} ${cell.hour}`, cell])), [usage])
  const max = React.useMemo(() => Math.max(0, ...(usage?.cells || []).map(cell => cell.up + cell.down)), [usage])
  const peak = React.useMemo(() => (usage?.cells || []).reduce<HourlyUsageCell | null>((best, cell) => !best || cell.up + cell.down > best.up + best.down ? cell : best, null), [usage])
  const totals = (usage?.profile || []).reduce((sum, hour) => ({ up: sum.up + hour.up, down: sum.down + hour.down }), { up: 0, down: 0 })
  const busiestHour = (usage?.profile || []).reduce<{ hour: number; bytes: number } | null>((best, hour) => !best || hour.up + hour.down > best.bytes ? { hour: hour.hour, bytes: hour.up + hour.down } : best, null)
  const shown = active || peak
  const newestFirst = [...(usage?.dates || [])].reverse()

  return <Card title="流量时段" description="北京时间 · 原始流量，不按节点倍率折算" headerAction={<SegmentedControl label="时间范围" value={range} onValueChange={setRange} options={RANGE_OPTIONS} />}>
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

        <section className="grid min-w-0 gap-3" aria-label="每日各小时流量热力图">
          <p className="min-h-5 text-sm tabular-nums" aria-live="polite">{shown ? <>
            <span className="text-muted-foreground">{active ? "" : "峰值 · "}{dayLabel(shown.date)} {hourRange(shown.hour)}</span>
            {" · 下载 "}<span className="font-medium">{formatBytes(shown.down)}</span>
            {" · 上传 "}<span className="font-medium">{formatBytes(shown.up)}</span>
            {shown.topNode ? <span className="text-muted-foreground"> · {shown.topNode}</span> : null}
          </> : null}</p>
          <div className="overflow-x-auto overflow-y-hidden">
            <div className="grid min-w-96 grid-cols-[3rem_repeat(24,minmax(0,1fr))] gap-px" onPointerLeave={() => setActive(null)}>
              <span />
              {Array.from({ length: 24 }, (_, hour) => <span key={hour} className="text-xs text-muted-foreground tabular-nums">{HOUR_TICKS.includes(hour) ? hour : ""}</span>)}
              {newestFirst.map((date, index) => <React.Fragment key={date}>
                <span className="self-center text-xs leading-none text-muted-foreground tabular-nums">{range !== "90" || index % 7 === 0 ? dayLabel(date) : ""}</span>
                {Array.from({ length: 24 }, (_, hour) => {
                  const cell = byKey.get(`${date} ${hour}`)
                  const value = cell ? level(cell.up + cell.down, max) : -1
                  return <span key={hour}
                    className={cn("rounded-xs", ROW_CLASS[range], value < 0 && "bg-muted", active && cell === active && "ring-2 ring-foreground")}
                    style={{ background: cellColor(value) }}
                    onPointerEnter={() => setActive(cell || null)}
                    onClick={() => setActive(cell || null)} />
                })}
              </React.Fragment>)}
            </div>
          </div>
          <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground" aria-hidden>
            少<span className="size-3 rounded-xs bg-muted" />{LEVEL_MIX.map((_, value) => <span key={value} className="size-3 rounded-xs" style={{ background: cellColor(value) }} />)}多
          </div>
        </section>

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
