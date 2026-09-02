import * as React from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, LabelList, Pie, PieChart, XAxis, YAxis } from "recharts"
import type { DateRange } from "react-day-picker"
import { IconArrowDownRight, IconArrowUpRight, IconCalendar, IconCash, IconDiscount, IconReceipt, IconUsers } from "@tabler/icons-react"

import { fetchJson } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useData } from "@/components/features/data-provider"
import { salesAmount, salesDateKey, salesDateRange, salesMonthRange, unlinkedSalesBills, type SalesPeriod } from "@/components/features/sales-analytics-logic"
import { formatMoney, userStatus } from "@/utils"

type SalesOrder = {
  id: string
  userId?: string
  planId?: string
  planName?: string
  optionLabel?: string
  purpose?: string
  purchaseAction?: string
  purchaseCountBefore?: number
  status: string
  amount?: number
  totalAmount?: number
  realCashAmount?: number
  originalAmount?: number
  discountAmount?: number
  vipDiscountAmount?: number
  couponCode?: string
  channelCode?: string
  paidAt?: string
  createdAt: string
  reversedAt?: string
}

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

const months = Array.from({ length: 12 }, (_, index) => index + 1)

function money(order: SalesOrder) {
  return salesAmount(order)
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

function shortPeriodLabel(value: string) {
  const [, month, day] = value.match(/^\d{4}-(\d{2})(?:-(\d{2}))?$/) || []
  return day ? `${Number(month)}/${Number(day)}` : month ? `${Number(month)}月` : value
}

function fullPeriodLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return day ? `${year}年${month}月${day}日` : `${year}年${month}月`
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
  const [period, setPeriod] = React.useState<SalesPeriod>("90")
  const [dateRange, setDateRange] = React.useState<DateRange>()
  const [calendarOpen, setCalendarOpen] = React.useState(false)
  const [selectedMonth, setSelectedMonth] = React.useState("")
  const [plan, setPlan] = React.useState("all")

  React.useEffect(() => {
    void fetchJson<SalesOrder[]>("/api/admin/orders").then(setOrders)
  }, [])

  const report = React.useMemo(() => {
    const now = new Date()
    const { start, end, previousStart, monthly } = salesDateRange(period, dateRange, now)
    const usersById = new Map(users.map(user => [user.id, user]))
    const manualSales = unlinkedSalesBills(orders, bills).map(bill => {
      // ponytail: legacy bills lack product snapshots; use the current group until the ledger stores historical product IDs.
      const group = usersById.get(bill.userId || "")?.activeGroup || ""
      return {
        id: `bill:${bill.id}`,
        userId: bill.userId,
        planId: group,
        planName: group ? group.toUpperCase() : "人工销售",
        purpose: "plan",
        purchaseAction: bill.type === "initial" ? "initial" : "extend",
        purchaseCountBefore: bill.type === "initial" ? 0 : 1,
        status: "paid",
        amount: Number(bill.amount),
        totalAmount: Number(bill.amount),
        realCashAmount: Number(bill.amount),
        channelCode: "manual",
        paidAt: bill.occurredAt,
        createdAt: bill.occurredAt || "",
      } satisfies SalesOrder
    })
    const commercial = [...orders, ...manualSales].filter(isCommercialPlan)
    const inPlan = (order: SalesOrder) => plan === "all" || (order.planId || order.planName || "").toLowerCase().includes(plan)
    const current = commercial.filter(order => inPlan(order) && (!start || orderDate(order) >= start) && orderDate(order) <= end)
    const previous = previousStart && start ? commercial.filter(order => inPlan(order) && orderDate(order) >= previousStart && orderDate(order) < start) : []
    const isReturning = (order: SalesOrder) => Number(order.purchaseCountBefore) >= 1
    const sum = (items: SalesOrder[]) => items.reduce((total, order) => total + money(order), 0)
    const sales = sum(current)
    const previousSales = sum(previous)
    const returning = current.filter(isReturning)
    const newCustomer = current.filter(order => !isReturning(order))
    const discounts = current.reduce((total, order) => total + discount(order), 0)
    const original = current.reduce((total, order) => total + (Number(order.originalAmount) || money(order)), 0)
    const previousAov = previous.length ? previousSales / previous.length : 0

    const trend = new Map<string, { period: string; newCustomer: number; returningCustomer: number }>()
    current.forEach(order => {
      const date = orderDate(order)
      const key = salesDateKey(date, monthly)
      const row = trend.get(key) || { period: key, newCustomer: 0, returningCustomer: 0 }
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

    const planUsers = users.filter(user => !user.registeredOnly)
    const activeUsers = planUsers.filter(user => userStatus(user) !== "expired").length
    const expiring30 = planUsers.filter(user => {
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
      expiredUsers: planUsers.length - activeUsers,
      activeUserShare: planUsers.length ? activeUsers / planUsers.length * 100 : 0,
      expiring30,
    }
  }, [bills, dateRange, orders, period, plan, users])

  const rangeLabel = dateRange?.from && dateRange.to
    ? `${dateRange.from.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })} 至 ${dateRange.to.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}`
    : "日期范围"

  return <div className="grid gap-4 px-4 lg:px-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">销售统计</h1>
        <p className="text-sm text-muted-foreground">套餐销售、客户复购与优惠表现</p>
      </section>
      <section className="flex flex-wrap gap-2 sm:justify-end" aria-label="统计筛选">
        <Tabs value={period} onValueChange={value => { setPeriod(value as SalesPeriod); setDateRange(undefined); setSelectedMonth("") }}>
          <TabsList>
            <TabsTrigger value="30">30天</TabsTrigger>
            <TabsTrigger value="90">90天</TabsTrigger>
            <TabsTrigger value="365">一年</TabsTrigger>
            <TabsTrigger value="all">全部</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={selectedMonth} onValueChange={value => {
          setSelectedMonth(value)
          setDateRange(salesMonthRange(Number(value)))
          setPeriod("custom")
        }}>
          <SelectTrigger aria-label={`按 ${new Date().getFullYear()} 年月份筛选`}><SelectValue placeholder="月份" /></SelectTrigger>
          <SelectContent>{months.map(month => <SelectItem key={month} value={`${month}`} disabled={month > new Date().getMonth() + 1}>{month}月</SelectItem>)}</SelectContent>
        </Select>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" aria-label="选择统计日期范围"><IconCalendar />{period === "custom" ? rangeLabel : "日期范围"}</Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              selected={dateRange}
              disabled={{ after: new Date() }}
              onSelect={setDateRange}
            />
            <footer className="flex justify-end border-t p-3">
              <Button
                disabled={!dateRange?.from || !dateRange.to}
                onClick={() => {
                  setSelectedMonth("")
                  setPeriod("custom")
                  setCalendarOpen(false)
                }}
              >应用日期</Button>
            </footer>
          </PopoverContent>
        </Popover>
        <Select value={plan} onValueChange={setPlan}>
          <SelectTrigger aria-label="筛选套餐"><SelectValue /></SelectTrigger>
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
      <MetricCard title="套餐销售额" value={formatMoney(report.sales)} detail={`${report.orders} 笔成交记录`} change={period === "all" ? undefined : report.salesChange} icon={IconCash} />
      <MetricCard title="成交数" value={`${report.orders}`} detail="支付订单与人工账单" change={period === "all" ? undefined : report.orderChange} icon={IconReceipt} />
      <MetricCard title="平均客单价" value={formatMoney(report.aov)} detail="销售额 ÷ 成交数" change={period === "all" ? undefined : report.aovChange} icon={IconUsers} />
      <MetricCard title="优惠成本" value={formatMoney(report.discounts)} detail={`综合优惠率 ${percent(report.discountRate)}`} icon={IconDiscount} />
    </section>

    <section className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader><CardTitle>销售趋势</CardTitle><CardDescription>新客成交与老客复购分布</CardDescription></CardHeader>
        <CardContent>
          <ChartContainer config={salesChartConfig} className="h-72 w-full">
            <AreaChart data={report.trend}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={shortPeriodLabel} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={value => `¥${Math.round(value)}`} width={64} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" labelFormatter={value => fullPeriodLabel(String(value))} formatter={(value, name, item) => {
                const key = String(item.dataKey)
                return <><span className="text-muted-foreground">{salesChartConfig[key as keyof typeof salesChartConfig]?.label ?? name}</span><span className="ml-auto font-mono font-medium tabular-nums">{formatMoney(Number(item.payload?.[key] ?? value))}</span></>
              }} />} />
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
            <BarChart data={report.products} layout="vertical" margin={{ left: 8, right: 96 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={value => `¥${Math.round(value)}`} />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={88} />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="sales" fill="var(--color-sales)" radius={4}>
                <LabelList dataKey="sales" position="right" formatter={value => formatMoney(Number(value))} className="fill-foreground text-xs tabular-nums" />
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>客户状态</CardTitle><CardDescription>当前全部套餐客户</CardDescription></CardHeader>
        <CardContent className="grid place-items-center gap-4">
          <ChartContainer config={customerChartConfig} className="h-44 w-full">
            <PieChart><Pie data={[{ name: "active", value: report.activeUsers }, { name: "expired", value: report.expiredUsers }]} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} strokeWidth={4}>{["var(--color-active)", "var(--color-expired)"].map(color => <Cell key={color} fill={color} />)}<Label content={({ viewBox }) => viewBox && "cx" in viewBox && "cy" in viewBox ? <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle"><tspan x={viewBox.cx} dy="-0.5em" className="fill-foreground text-xs font-semibold tabular-nums">{percent(report.activeUserShare)} 活跃</tspan><tspan x={viewBox.cx} dy="1.5em" className="fill-muted-foreground text-xs tabular-nums">{percent(100 - report.activeUserShare)} 过期</tspan></text> : null} /></Pie><ChartTooltip content={<ChartTooltipContent hideLabel />} /></PieChart>
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
  </div>
}
