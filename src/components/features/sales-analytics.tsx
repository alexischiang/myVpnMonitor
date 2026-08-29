import * as React from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"
import { IconArrowDownRight, IconArrowUpRight, IconCash, IconDiscount, IconReceipt, IconUsers } from "@tabler/icons-react"

import { fetchJson } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useData } from "@/components/features/data-provider"
import { formatMoney, userStatus } from "@/utils"

type SalesOrder = {
  id: string
  userId?: string
  planId?: string
  planName?: string
  optionLabel?: string
  purpose?: string
  purchaseAction?: string
  status: string
  amount?: number
  totalAmount?: number
  originalAmount?: number
  discountAmount?: number
  vipDiscountAmount?: number
  couponCode?: string
  channelCode?: string
  paidAt?: string
  createdAt: string
  reversedAt?: string
}

type Period = "30" | "90" | "365" | "all"

const salesChartConfig = {
  newCustomer: { label: "新客销售", color: "var(--chart-2)" },
  returningCustomer: { label: "老客复购", color: "var(--chart-1)" },
} satisfies ChartConfig

const productChartConfig = {
  sales: { label: "销售额", color: "var(--chart-1)" },
} satisfies ChartConfig

const customerChartConfig = {
  active: { label: "活跃客户", color: "var(--chart-1)" },
  expired: { label: "已过期", color: "var(--muted)" },
} satisfies ChartConfig

function money(order: SalesOrder) {
  return Number(order.totalAmount ?? order.amount) || 0
}

function discount(order: SalesOrder) {
  return (Number(order.discountAmount) || 0) + (Number(order.vipDiscountAmount) || 0)
}

function orderDate(order: SalesOrder) {
  return new Date(order.paidAt || order.createdAt)
}

function isCommercialPlan(order: SalesOrder) {
  const label = `${order.planId || ""} ${order.planName || ""} ${order.optionLabel || ""}`
  return order.status === "paid" && !order.reversedAt && (order.purpose || "plan") === "plan" && order.purchaseAction !== "grant" && money(order) > 0 && !/test|测试|亲友永久/i.test(label)
}

function startForPeriod(period: Period, now = new Date()) {
  if (period === "all") return null
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - Number(period) + 1)
}

function dateKey(date: Date, monthly: boolean) {
  return monthly
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function channelName(code = "") {
  if (["6666", "200", "wxpay"].includes(code)) return "微信支付"
  if (["666", "100", "alipay"].includes(code)) return "支付宝"
  if (code === "manual") return "人工收款"
  return "其他渠道"
}

function percent(value: number) {
  return `${value.toFixed(1)}%`
}

function delta(current: number, previous: number) {
  if (!previous) return current ? 100 : 0
  return (current - previous) / previous * 100
}

function MetricCard({ title, value, detail, change, icon: Icon }: { title: string; value: string; detail: string; change?: number; icon: typeof IconCash }) {
  const positive = (change || 0) >= 0
  return <Card>
    <CardHeader>
      <CardDescription>{title}</CardDescription>
      <CardAction><Icon className="size-5 text-muted-foreground" /></CardAction>
      <CardTitle className="text-2xl tabular-nums sm:text-3xl">{value}</CardTitle>
    </CardHeader>
    <CardContent className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{detail}</span>
      {change === undefined ? null : <Badge variant={positive ? "success" : "destructive"}>{positive ? <IconArrowUpRight /> : <IconArrowDownRight />}{percent(Math.abs(change))}</Badge>}
    </CardContent>
  </Card>
}

export function SalesAnalyticsPage() {
  const { users, bills } = useData()
  const [orders, setOrders] = React.useState<SalesOrder[]>([])
  const [period, setPeriod] = React.useState<Period>("90")
  const [plan, setPlan] = React.useState("all")

  React.useEffect(() => {
    void fetchJson<SalesOrder[]>("/api/admin/orders").then(setOrders)
  }, [])

  const report = React.useMemo(() => {
    const now = new Date()
    const start = startForPeriod(period, now)
    const periodDays = period === "all" ? 0 : Number(period)
    const previousStart = start && new Date(start.getFullYear(), start.getMonth(), start.getDate() - periodDays)
    const paidBillsByUser = new Map<string, number[]>()
    bills.filter(item => !item.reversedAt && item.userId && item.occurredAt).forEach(item => {
      const entries = paidBillsByUser.get(item.userId!) || []
      entries.push(new Date(item.occurredAt!).getTime())
      paidBillsByUser.set(item.userId!, entries)
    })

    const commercial = orders.filter(isCommercialPlan)
    const inPlan = (order: SalesOrder) => plan === "all" || (order.planId || order.planName || "").toLowerCase().includes(plan)
    const current = commercial.filter(order => inPlan(order) && (!start || orderDate(order) >= start) && orderDate(order) <= now)
    const previous = previousStart && start ? commercial.filter(order => inPlan(order) && orderDate(order) >= previousStart && orderDate(order) < start) : []
    const isReturning = (order: SalesOrder) => {
      const paidAt = orderDate(order).getTime()
      return Boolean(order.userId && paidBillsByUser.get(order.userId)?.some(time => time < paidAt - 60_000))
    }
    const sum = (items: SalesOrder[]) => items.reduce((total, order) => total + money(order), 0)
    const sales = sum(current)
    const previousSales = sum(previous)
    const returning = current.filter(isReturning)
    const newCustomer = current.filter(order => !isReturning(order))
    const discounts = current.reduce((total, order) => total + discount(order), 0)
    const original = current.reduce((total, order) => total + (Number(order.originalAmount) || money(order)), 0)
    const previousAov = previous.length ? previousSales / previous.length : 0

    const monthly = period === "365" || period === "all"
    const trend = new Map<string, { period: string; newCustomer: number; returningCustomer: number }>()
    current.forEach(order => {
      const date = orderDate(order)
      const key = dateKey(date, monthly)
      const row = trend.get(key) || { period: monthly ? `${date.getMonth() + 1}月` : `${date.getMonth() + 1}/${date.getDate()}`, newCustomer: 0, returningCustomer: 0 }
      row[isReturning(order) ? "returningCustomer" : "newCustomer"] += money(order)
      trend.set(key, row)
    })

    const products = new Map<string, { name: string; orders: number; sales: number; returning: number }>()
    current.forEach(order => {
      const name = order.planName || order.planId || "其他套餐"
      const row = products.get(name) || { name, orders: 0, sales: 0, returning: 0 }
      row.orders += 1
      row.sales += money(order)
      if (isReturning(order)) row.returning += 1
      products.set(name, row)
    })

    const coupons = new Map<string, { code: string; orders: number; sales: number; discount: number; returning: number }>()
    current.filter(order => order.couponCode).forEach(order => {
      const code = order.couponCode!
      const row = coupons.get(code) || { code, orders: 0, sales: 0, discount: 0, returning: 0 }
      row.orders += 1
      row.sales += money(order)
      row.discount += discount(order)
      if (isReturning(order)) row.returning += 1
      coupons.set(code, row)
    })

    const channels = new Map<string, { name: string; orders: number; sales: number }>()
    current.forEach(order => {
      const name = channelName(order.channelCode)
      const row = channels.get(name) || { name, orders: 0, sales: 0 }
      row.orders += 1
      row.sales += money(order)
      channels.set(name, row)
    })

    const activeUsers = users.filter(user => userStatus(user) !== "expired").length
    const expiring30 = users.filter(user => {
      const expiresAt = new Date(user.expiresAt || "").getTime()
      return expiresAt > now.getTime() && expiresAt <= now.getTime() + 30 * 864e5
    }).length

    return {
      sales,
      orders: current.length,
      aov: current.length ? sales / current.length : 0,
      returningSales: sum(returning),
      newSales: sum(newCustomer),
      discounts,
      discountRate: original ? discounts / original * 100 : 0,
      salesChange: delta(sales, previousSales),
      orderChange: delta(current.length, previous.length),
      aovChange: delta(current.length ? sales / current.length : 0, previousAov),
      returningShare: sales ? sum(returning) / sales * 100 : 0,
      trend: [...trend.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, row]) => row),
      products: [...products.values()].sort((left, right) => right.sales - left.sales),
      coupons: [...coupons.values()].sort((left, right) => right.sales - left.sales),
      channels: [...channels.values()].sort((left, right) => right.sales - left.sales),
      activeUsers,
      expiredUsers: users.length - activeUsers,
      expiring30,
    }
  }, [bills, orders, period, plan, users])

  return <main className="grid gap-4 px-4 lg:px-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">销售统计</h1>
        <p className="text-sm text-muted-foreground">套餐销售、客户复购与优惠表现</p>
      </section>
      <section className="flex flex-wrap gap-2" aria-label="统计筛选">
        <Tabs value={period} onValueChange={value => setPeriod(value as Period)}>
          <TabsList>
            <TabsTrigger value="30">30天</TabsTrigger>
            <TabsTrigger value="90">90天</TabsTrigger>
            <TabsTrigger value="365">一年</TabsTrigger>
            <TabsTrigger value="all">全部</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={plan} onValueChange={setPlan}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部套餐</SelectItem>
            <SelectItem value="basic">BASIC</SelectItem>
            <SelectItem value="pro">PRO</SelectItem>
            <SelectItem value="ultra">ULTRA</SelectItem>
          </SelectContent>
        </Select>
      </section>
    </header>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="核心销售指标">
      <MetricCard title="套餐销售额" value={formatMoney(report.sales)} detail={`${report.orders} 笔商业订单`} change={period === "all" ? undefined : report.salesChange} icon={IconCash} />
      <MetricCard title="订单数" value={`${report.orders}`} detail="已支付套餐订单" change={period === "all" ? undefined : report.orderChange} icon={IconReceipt} />
      <MetricCard title="平均客单价" value={formatMoney(report.aov)} detail="销售额 ÷ 订单数" change={period === "all" ? undefined : report.aovChange} icon={IconUsers} />
      <MetricCard title="优惠成本" value={formatMoney(report.discounts)} detail={`综合优惠率 ${percent(report.discountRate)}`} icon={IconDiscount} />
    </section>

    <section className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader><CardTitle>销售趋势</CardTitle><CardDescription>新客成交与老客复购分布</CardDescription></CardHeader>
        <CardContent>
          <ChartContainer config={salesChartConfig} className="h-72 w-full">
            <AreaChart data={report.trend}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={value => `¥${Math.round(value)}`} width={64} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Area dataKey="newCustomer" type="monotone" stackId="sales" fill="var(--color-newCustomer)" fillOpacity={0.25} stroke="var(--color-newCustomer)" />
              <Area dataKey="returningCustomer" type="monotone" stackId="sales" fill="var(--color-returningCustomer)" fillOpacity={0.5} stroke="var(--color-returningCustomer)" />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>客户贡献</CardTitle><CardDescription>老客户是私域销售基本盘</CardDescription></CardHeader>
        <CardContent className="grid gap-6">
          <section><p className="text-3xl font-semibold tabular-nums">{formatMoney(report.returningSales)}</p><p className="text-sm text-muted-foreground">老客复购销售额 · 占比 {percent(report.returningShare)}</p></section>
          <section className="grid grid-cols-2 gap-4 border-t pt-5">
            <article><p className="text-sm text-muted-foreground">新客销售</p><p className="text-xl font-semibold tabular-nums">{formatMoney(report.newSales)}</p></article>
            <article><p className="text-sm text-muted-foreground">30天内到期</p><p className="text-xl font-semibold tabular-nums">{report.expiring30} 人</p></article>
          </section>
          <Badge variant="secondary">仅统计付费套餐，不含附加产品</Badge>
        </CardContent>
      </Card>
    </section>

    <section className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>套餐表现</CardTitle><CardDescription>按实际成交金额排序</CardDescription></CardHeader>
        <CardContent>
          <ChartContainer config={productChartConfig} className="h-64 w-full">
            <BarChart data={report.products} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={value => `¥${Math.round(value)}`} />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={88} />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="sales" fill="var(--color-sales)" radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>客户状态</CardTitle><CardDescription>当前全部套餐客户</CardDescription></CardHeader>
        <CardContent className="grid place-items-center gap-4">
          <ChartContainer config={customerChartConfig} className="h-44 w-full">
            <PieChart><Pie data={[{ name: "active", value: report.activeUsers }, { name: "expired", value: report.expiredUsers }]} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} strokeWidth={4}>{["var(--color-active)", "var(--color-expired)"].map(color => <Cell key={color} fill={color} />)}</Pie><ChartTooltip content={<ChartTooltipContent hideLabel />} /></PieChart>
          </ChartContainer>
          <section className="grid w-full grid-cols-2 gap-4 border-t pt-4 text-center">
            <article><p className="text-2xl font-semibold tabular-nums">{report.activeUsers}</p><p className="text-sm text-muted-foreground">活跃客户</p></article>
            <article><p className="text-2xl font-semibold tabular-nums">{report.expiredUsers}</p><p className="text-sm text-muted-foreground">已过期</p></article>
          </section>
        </CardContent>
      </Card>
    </section>

    <section className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>优惠码表现</CardTitle><CardDescription>亲友码保留展示，但不与公开活动混淆</CardDescription></CardHeader>
        <CardContent><Table><TableHeader><TableRow><TableHead>优惠码</TableHead><TableHead className="text-right">订单</TableHead><TableHead className="text-right">销售额</TableHead><TableHead className="text-right">优惠</TableHead><TableHead className="text-right">老客</TableHead></TableRow></TableHeader><TableBody>{report.coupons.map(row => <TableRow key={row.code}><TableCell><Badge variant={/FRND|EUWN/i.test(row.code) ? "secondary" : "outline"}>{row.code}</Badge></TableCell><TableCell className="text-right tabular-nums">{row.orders}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(row.sales)}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(row.discount)}</TableCell><TableCell className="text-right tabular-nums">{row.returning}</TableCell></TableRow>)}</TableBody></Table></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>支付渠道</CardTitle><CardDescription>历史渠道代码已合并</CardDescription></CardHeader>
        <CardContent><Table><TableHeader><TableRow><TableHead>渠道</TableHead><TableHead className="text-right">订单</TableHead><TableHead className="text-right">销售额</TableHead><TableHead className="text-right">客单价</TableHead></TableRow></TableHeader><TableBody>{report.channels.map(row => <TableRow key={row.name}><TableCell className="font-medium">{row.name}</TableCell><TableCell className="text-right tabular-nums">{row.orders}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(row.sales)}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(row.sales / row.orders)}</TableCell></TableRow>)}</TableBody></Table></CardContent>
      </Card>
    </section>
  </main>
}
