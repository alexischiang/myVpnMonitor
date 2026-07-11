import * as React from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from "recharts"

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
import type { Bill, User } from "@/types"
import { formatMoney } from "@/utils"

const monthlyIncomeConfig = {
  income: {
    label: "收入",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

const dailyIncomeConfig = {
  income: {
    label: "日收入",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

const userGrowthConfig = {
  newUsers: {
    label: "新增用户",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function monthKey(value?: string) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ""
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function buildRecentDays(length: number) {
  const now = new Date()

  return Array.from({ length }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (length - 1 - index))
    return {
      date,
      day: dateKey(date),
      label: date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }),
    }
  })
}

function buildMonthlyIncomeData(bills: Bill[]) {
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

function buildDailyIncomeData(bills: Bill[]) {
  const days = buildRecentDays(14).map(item => ({ ...item, income: 0 }))
  const dayMap = new Map(days.map(item => [item.day, item]))

  bills
    .filter(item => !item.reversedAt)
    .forEach(item => {
      if (!item.occurredAt) return
      const occurredAt = new Date(item.occurredAt)
      if (Number.isNaN(occurredAt.getTime())) return

      const target = dayMap.get(dateKey(occurredAt))
      if (target) target.income += Number(item.amount) || 0
    })

  return days
}

function buildUserGrowthData(users: User[]) {
  const days = buildRecentDays(14).map(item => ({ ...item, newUsers: 0 }))
  const dayMap = new Map(days.map(item => [item.day, item]))

  users.forEach(user => {
    if (!user.purchasedAt) return
    const purchasedAt = new Date(user.purchasedAt)
    if (Number.isNaN(purchasedAt.getTime())) return

    const target = dayMap.get(dateKey(purchasedAt))
    if (target) target.newUsers += 1
  })

  return days
}

function formatAxisMoney(value: number) {
  return formatMoney(value).replace(".00", "")
}

function formatAxisCount(value: number) {
  return `${Math.round(value)}`
}

function formatMoneyLabel(value: unknown) {
  return formatAxisMoney(Number(value) || 0)
}

function formatCountLabel(value: unknown) {
  return formatAxisCount(Number(value) || 0)
}

export function ChartAreaInteractive({ bills }: { bills: Bill[] }) {
  const data = React.useMemo(() => buildMonthlyIncomeData(bills), [bills])

  return (
    <Card>
      <CardHeader>
        <CardTitle>收入趋势</CardTitle>
        <CardDescription>
          最近 6 个月有效账单收入
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={monthlyIncomeConfig} className="aspect-auto h-64">
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
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={formatAxisMoney}
              width={72}
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
            >
              <LabelList
                dataKey="income"
                position="top"
                offset={8}
                formatter={formatMoneyLabel}
                fill="var(--foreground)"
              />
            </Area>
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function DailyIncomeChart({ bills }: { bills: Bill[] }) {
  const data = React.useMemo(() => buildDailyIncomeData(bills), [bills])

  return (
    <Card>
      <CardHeader>
        <CardTitle>日收入</CardTitle>
        <CardDescription>
          最近 14 天有效账单收入
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={dailyIncomeConfig} className="aspect-auto h-64">
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={formatAxisMoney}
              width={72}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Bar dataKey="income" fill="var(--color-income)" radius={4}>
              <LabelList
                dataKey="income"
                position="top"
                offset={8}
                formatter={formatMoneyLabel}
                fill="var(--foreground)"
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function UserGrowthChart({ users }: { users: User[] }) {
  const data = React.useMemo(() => buildUserGrowthData(users), [users])

  return (
    <Card>
      <CardHeader>
        <CardTitle>用户增长</CardTitle>
        <CardDescription>
          最近 14 天新增用户数
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={userGrowthConfig} className="aspect-auto h-64">
          <LineChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={formatAxisCount}
              width={40}
              allowDecimals={false}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Line
              dataKey="newUsers"
              type="monotone"
              stroke="var(--color-newUsers)"
              strokeWidth={2}
              dot
            >
              <LabelList
                dataKey="newUsers"
                position="top"
                offset={8}
                formatter={formatCountLabel}
                fill="var(--foreground)"
              />
            </Line>
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
