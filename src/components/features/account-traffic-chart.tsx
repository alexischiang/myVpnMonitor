import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { CardContent } from "@/components/ui/card"
import { BentoCard, type BentoRowSpan, type BentoSpan } from "@/components/features/bento-card"
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { formatBytes } from "@/utils"

const chartConfig = {
  usedBytes: { label: "使用流量", color: "var(--chart-1)" },
} satisfies ChartConfig

export function AccountTrafficChart({ data, span = 8, rowSpan = 3, className }: { data: Array<{ date: string; usedBytes: number }>; span?: BentoSpan; rowSpan?: BentoRowSpan; className?: string }) {
  const chartData = data.map(item => ({ ...item, label: item.date.slice(5).replace("-", "/") }))
  const total = data.reduce((sum, item) => sum + item.usedBytes, 0)

  return <BentoCard span={span} rowSpan={rowSpan} className={className} title="近 7 天流量明细">
    <CardContent className="grid gap-3">
      <p className="text-xs text-muted-foreground">北京时间 · 上传与下载合计 {formatBytes(total)}</p>
      <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
        <BarChart accessibilityLayer data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} tickMargin={8} tickFormatter={value => formatBytes(Number(value))} width={72} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" formatter={value => formatBytes(Number(value))} />} />
          <Bar dataKey="usedBytes" fill="var(--color-usedBytes)" radius={4} />
        </BarChart>
      </ChartContainer>
    </CardContent>
  </BentoCard>
}
