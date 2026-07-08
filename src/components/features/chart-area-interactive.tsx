import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { Bill } from "@/types"

const chartConfig = {
  income: {
    label: "收入",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

function monthKey(value?: string) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ""
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function buildChartData(bills: Bill[]) {
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1)
    const key = monthKey(date.toISOString())
    return {
      month: key,
      label: date.toLocaleDateString("zh-CN", { month: "short" }),
      income: 0,
    }
  })

  const monthMap = new Map(months.map(item => [item.month, item]))
  bills
    .filter(item => !item.reversedAt)
    .forEach(item => {
      const target = monthMap.get(monthKey(item.occurredAt))
      if (target) target.income += Number(item.amount) || 0
    })

  return months
}

export function ChartAreaInteractive({ bills }: { bills: Bill[] }) {
  const data = React.useMemo(() => buildChartData(bills), [bills])

  return (
    <Card>
      <CardHeader>
        <CardTitle>收入趋势</CardTitle>
        <CardDescription>
          最近 6 个月有效账单收入
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="fillIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-income)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-income)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Area
              dataKey="income"
              type="natural"
              fill="url(#fillIncome)"
              stroke="var(--color-income)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
