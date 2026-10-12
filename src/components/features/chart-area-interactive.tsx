import * as React from "react"

import { BarChart } from "@/components/arc/bar-chart/bar-chart"
import { LineChart } from "@/components/arc/line-chart/line-chart"
import type { Bill, User } from "@/types"
import { formatMoney } from "@/utils"
import { Card } from "@/components/arc/card/card"

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

export function ChartAreaInteractive({ bills }: { bills: Bill[] }) {
  const data = React.useMemo(() => buildMonthlyIncomeData(bills), [bills])

  return (
    <Card title="收入趋势" description="最近 6 个月有效账单收入">
      <LineChart
        label="月收入"
        height={256}
        data={data.map(item => ({ key: item.month, label: item.label, axisLabel: item.label, values: { income: item.income } }))}
        series={[{ key: "income", label: "收入" }]}
        formatValue={value => formatMoney(value)}
        formatTick={formatAxisMoney}
      />
    </Card>
  )
}

export function DailyIncomeChart({ bills }: { bills: Bill[] }) {
  const data = React.useMemo(() => buildDailyIncomeData(bills), [bills])

  return (
    <Card title="日收入" description="最近 14 天有效账单收入">
      <BarChart
        label="日收入"
        period="最近 14 天"
        averageLabel="日均收入"
        valueLabel="当日收入"
        height={200}
        data={data.map(item => ({ key: item.day, label: item.label, axisLabel: item.label, value: item.income }))}
        formatValue={value => formatMoney(value)}
      />
    </Card>
  )
}

export function UserGrowthChart({ users }: { users: User[] }) {
  const data = React.useMemo(() => buildUserGrowthData(users), [users])

  return (
    <Card title="用户增长" description="最近 14 天新增用户数">
      <LineChart
        label="新增用户"
        height={256}
        data={data.map(item => ({ key: item.day, label: item.label, axisLabel: item.label, values: { newUsers: item.newUsers } }))}
        series={[{ key: "newUsers", label: "新增用户" }]}
        formatValue={value => formatAxisCount(value)}
        formatTick={formatAxisCount}
      />
    </Card>
  )
}
