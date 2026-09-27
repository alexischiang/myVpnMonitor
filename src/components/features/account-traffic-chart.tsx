import * as React from "react"
import { Bar, BarChart, CartesianGrid, Rectangle, XAxis, YAxis, type BarShapeProps } from "recharts"

import { CardContent } from "@/components/ui/card"
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Separator } from "@/components/ui/separator"
import { BentoCard, type BentoRowSpan, type BentoSpan } from "@/components/features/bento-card"
import { formatBytes } from "@/utils"

export type AccountNodeUsage = {
  days: Array<{ date: string; usedBytes: number; nodes: Record<string, number> }>
  nodes: Array<{ key: string; name: string; usedBytes: number }>
}

// Series colors follow the node's slot (fixed order by usage); the folded "other" series stays neutral.
function seriesColor(key: string) {
  return key === "other" ? "var(--series-other)" : `var(--series-${key.replace("node", "")})`
}

// Below sm the bars keep this width each and scroll sideways (only a few fit on screen) while the
// y axis stays fixed in its own column (w-18). Both charts plot the same stacked data, so their
// automatic domains and ticks match.
const MOBILE_BAR_WIDTH = 32
const Y_AXIS_WIDTH = 72

function dayLabel(date: string) {
  return date.slice(5).replace("-", "/")
}

export function AccountTrafficChart({ usage, span = 8, rowSpan = 3, className }: { usage: AccountNodeUsage; span?: BentoSpan; rowSpan?: BentoRowSpan; className?: string }) {
  const total = usage.nodes.reduce((sum, node) => sum + node.usedBytes, 0)
  const keys = usage.nodes.map(node => node.key)
  const config = Object.fromEntries(usage.nodes.map(node => [node.key, { label: node.name, color: seriesColor(node.key) }])) satisfies ChartConfig
  // Flatten each day's nodes into bar keys and note the top non-empty segment, which gets the rounded end.
  const chartData = usage.days.map(day => ({
    date: day.date,
    label: dayLabel(day.date),
    ...day.nodes,
    topKey: [...keys].reverse().find(key => day.nodes[key]) || "",
  }))
  // Start scrolled to the newest day on narrow screens.
  const scrollRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollLeft = element.scrollWidth
  }, [chartData.length])

  return <BentoCard span={span} rowSpan={rowSpan} className={className} title="近 30 天流量明细">
    <CardContent className="grid flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,16rem)]">
      <section className="grid min-w-0 content-start gap-3" aria-label="每日用量图表">
        <p className="text-xs text-muted-foreground">北京时间 · 按节点倍率计算 · 合计 <span className="font-medium text-foreground tabular-nums">{formatBytes(total)}</span></p>
        {total ? <div className="flex min-w-0">
          <ChartContainer config={config} className="aspect-auto h-60 w-18 shrink-0" aria-hidden>
            <BarChart data={chartData} margin={{ left: 0, right: 0 }}>
              <XAxis dataKey="label" tick={false} tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} tickFormatter={value => formatBytes(Number(value))} width={Y_AXIS_WIDTH} />
              {/* Invisible copies of the bars: recharts only draws axis ticks for charts that plot data. */}
              {keys.map(key => <Bar key={key} dataKey={key} stackId="usage" fill="transparent" isAnimationActive={false} />)}
            </BarChart>
          </ChartContainer>
          <div ref={scrollRef} role="region" tabIndex={0} aria-label="每日用量图表，小屏可左右滑动查看" className="min-w-0 flex-1 overflow-x-auto rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
          <div className="min-w-(--chart-min-width) sm:min-w-0" style={{ "--chart-min-width": `${chartData.length * MOBILE_BAR_WIDTH}px` } as React.CSSProperties}>
          <ChartContainer config={config} className="aspect-auto h-60 w-full">
          <BarChart accessibilityLayer data={chartData} margin={{ left: 0, right: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
            <YAxis hide />
            <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltipContent
              labelFormatter={(_, payload) => payload?.[0]?.payload?.date?.replaceAll("-", "/") ?? ""}
              formatter={(value, name) => <>
                <span className="size-2.5 shrink-0 rounded-xs" style={{ background: seriesColor(String(name)) }} />
                <span className="flex-1 text-muted-foreground">{config[String(name)]?.label ?? name}</span>
                <span className="font-medium text-foreground tabular-nums">{formatBytes(Number(value))}</span>
              </>}
            />} />
            {keys.map(key => <Bar key={key} dataKey={key} stackId="usage" fill={`var(--color-${key})`} stroke="var(--color-bento-surface)" strokeWidth={1}
              shape={(props: BarShapeProps) => <Rectangle {...props} radius={props.payload?.topKey === key ? [4, 4, 0, 0] : 0} />} />)}
          </BarChart>
          </ChartContainer>
          </div>
          </div>
        </div> : <p className="grid h-60 place-items-center rounded-2xl bg-background text-sm text-muted-foreground">近 30 天暂无流量记录</p>}
      </section>
      <Separator orientation="vertical" className="hidden xl:block" />
      <Separator className="xl:hidden" />
      <section className="grid min-w-0 content-start gap-3" aria-labelledby="node-usage-title">
        <h3 id="node-usage-title" className="text-sm font-medium">节点用量</h3>
        {usage.nodes.length ? <ul className="grid gap-2">
          {usage.nodes.map(node => {
            const share = total ? node.usedBytes / total * 100 : 0
            return <li key={node.key} className="grid gap-1">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <span className="size-2.5 shrink-0 rounded-xs" style={{ background: seriesColor(node.key) }} aria-hidden />
                <span className="min-w-0 flex-1 truncate" title={node.name}>{node.name}</span>
                <span className="font-medium tabular-nums">{formatBytes(node.usedBytes)}</span>
                <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{Math.round(share)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full" style={{ width: `${share}%`, background: seriesColor(node.key) }} /></div>
            </li>
          })}
        </ul> : <p className="text-sm text-muted-foreground">近 30 天暂无节点用量</p>}
      </section>
    </CardContent>
  </BentoCard>
}
