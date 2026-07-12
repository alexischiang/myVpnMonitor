import * as React from "react"
import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom"
import { CheckCircle2, Clock3, Copy, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { fetchJson, putJson } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate, formatMoney } from "@/utils"

type PaymentOrder = { id: string; merOrderTid: string; planName: string; optionLabel: string; amount: number; status: string; statusText: string; payUrl?: string; createdAt: string; expiresAt: string; paidAt?: string }
type Subscription = { status: string; activeGroup: string; expiresAt: string; purchasedAt: string; duration: string; traffic: string; devices: number | string; subscriptionUrl: string }
type Overview = { email: string; createdAt: string; subscription: Subscription | null; orders: PaymentOrder[] }

function useOverview() {
  const [data, setData] = React.useState<Overview | null>(null)
  const [error, setError] = React.useState("")
  React.useEffect(() => { fetchJson<Overview>("/api/account/overview").then(setData).catch(error => setError(error.message)) }, [])
  return { data, error }
}

function PageLoading() {
  return <div className="grid gap-4 px-4 lg:px-6"><Skeleton className="h-36" /><Skeleton className="h-72" /></div>
}

function CopySubscription({ value }: { value: string }) {
  return <Button variant="outline" onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("订阅链接已复制"))}><Copy />复制订阅链接</Button>
}

export function AccountOverviewPage() {
  const { data, error } = useOverview()
  if (!data) return error ? <p className="px-4 text-sm text-destructive lg:px-6">{error}</p> : <PageLoading />
  const subscription = data.subscription
  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4"><div><CardDescription>当前订阅</CardDescription><CardTitle className="mt-1 text-2xl">{subscription ? subscription.activeGroup.toUpperCase() : "暂无订阅"}</CardTitle></div><Badge variant={subscription?.status === "active" ? "default" : "secondary"}>{subscription?.status === "active" ? "使用中" : "未开通"}</Badge></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Metric label="到期时间" value={subscription ? formatDate(subscription.expiresAt) : "-"} />
          <Metric label="流量" value={subscription?.traffic || "-"} />
          <Metric label="可绑定设备" value={subscription ? `${subscription.devices} 台` : "-"} />
          <div className="flex flex-wrap gap-2 md:col-span-3"><Button asChild><Link to="/account/plans">{subscription ? "续费或更换套餐" : "购买套餐"}</Link></Button>{subscription?.subscriptionUrl ? <CopySubscription value={subscription.subscriptionUrl} /> : null}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>最近订单</CardTitle><CardDescription>最近五笔支付订单</CardDescription></CardHeader>
        <CardContent>{data.orders.length ? <OrdersTable orders={data.orders} /> : <p className="text-sm text-muted-foreground">暂无订单</p>}</CardContent>
      </Card>
    </div>
  )
}

export function AccountSubscriptionPage() {
  const { data, error } = useOverview()
  if (!data) return error ? <p className="px-4 text-sm text-destructive lg:px-6">{error}</p> : <PageLoading />
  if (!data.subscription) return <div className="px-4 lg:px-6"><Card><CardHeader><CardTitle>尚未开通订阅</CardTitle><CardDescription>购买套餐后，订阅信息会显示在这里。</CardDescription></CardHeader><CardContent><Button asChild><Link to="/account/plans">查看套餐</Link></Button></CardContent></Card></div>
  const item = data.subscription
  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck />{item.activeGroup.toUpperCase()}</CardTitle><CardDescription>当前有效订阅</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Metric label="生效时间" value={formatDate(item.purchasedAt)} /><Metric label="到期时间" value={formatDate(item.expiresAt)} /><Metric label="流量说明" value={item.traffic} /><Metric label="可绑定设备" value={`${item.devices} 台`} /></CardContent></Card>
      <Card><CardHeader><CardTitle>订阅链接</CardTitle><CardDescription>请勿将订阅链接分享给其他人。</CardDescription></CardHeader><CardContent className="grid gap-3"><Input readOnly value={item.subscriptionUrl} /><div className="flex flex-wrap gap-2"><CopySubscription value={item.subscriptionUrl} /><Button asChild variant="outline"><a href={`shadowrocket://add/${encodeURIComponent(item.subscriptionUrl)}`}><ExternalLink />导入 Shadowrocket</a></Button></div></CardContent></Card>
    </div>
  )
}

export function AccountOrdersPage() {
  const [orders, setOrders] = React.useState<PaymentOrder[] | null>(null)
  React.useEffect(() => { fetchJson<PaymentOrder[]>("/api/account/orders").then(setOrders).catch(error => toast.error(error.message)) }, [])
  if (!orders) return <PageLoading />
  return <div className="px-4 lg:px-6"><Card><CardHeader><CardTitle>订单记录</CardTitle><CardDescription>所有购买、续费和换套餐订单</CardDescription></CardHeader><CardContent>{orders.length ? <OrdersTable orders={orders} /> : <p className="text-sm text-muted-foreground">暂无订单</p>}</CardContent></Card></div>
}

export function AccountOrderDetailPage() {
  const { id = "" } = useParams()
  const [order, setOrder] = React.useState<PaymentOrder | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [now, setNow] = React.useState(Date.now())
  async function refresh(showToast = false) {
    setLoading(true)
    try {
      const nextOrder = await fetchJson<PaymentOrder>(`/api/payments/orders/${encodeURIComponent(id)}`)
      setOrder(nextOrder)
      if (nextOrder.status !== "pending") window.dispatchEvent(new Event("payment-order-updated"))
      if (showToast) nextOrder.status === "paid" ? toast.success("支付成功") : toast.info(`当前状态：${nextOrder.statusText}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "查询订单失败")
    } finally {
      setLoading(false)
    }
  }
  React.useEffect(() => { void refresh() }, [id])
  React.useEffect(() => {
    if (order?.status !== "pending") return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [order?.status])
  const remainingSeconds = order?.status === "pending" ? Math.max(0, Math.ceil((new Date(order.expiresAt).getTime() - now) / 1000)) : 0
  React.useEffect(() => {
    if (order?.status === "pending" && remainingSeconds === 0) void refresh()
  }, [order?.status, remainingSeconds])
  if (!order) return <PageLoading />
  const countdown = `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`
  return (
    <div className="grid gap-6 px-4 lg:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">订单详情</h2>
          <p className="font-mono text-sm text-muted-foreground">{order.merOrderTid}</p>
        </div>
        <div className="grid justify-items-start gap-2 sm:justify-items-end">
          <Badge variant={order.status === "paid" ? "default" : "secondary"}>{order.statusText}</Badge>
          {order.status === "pending" ? <p className="text-sm text-muted-foreground">请在 <span className="font-mono font-medium text-foreground">{countdown}</span> 内完成付款</p> : null}
        </div>
      </div>
      <Separator />
      <div className="grid gap-6 sm:grid-cols-2">
        <Metric label="套餐" value={`${order.planName} / ${order.optionLabel}`} />
        <Metric label="订单金额" value={formatMoney(order.amount)} />
        <Metric label="创建时间" value={formatDate(order.createdAt)} />
        <Metric label="支付时间" value={order.paidAt ? formatDate(order.paidAt) : "-"} />
      </div>
      <Separator />
      <div className="flex flex-wrap gap-2">
        {order.status === "pending" && order.payUrl ? <Button asChild><a href={order.payUrl} target="_blank" rel="noreferrer">打开支付页面</a></Button> : null}
        <Button variant="outline" onClick={() => refresh(true)} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}检测支付状态</Button>
        <Button asChild variant="ghost"><Link to="/account/orders">返回订单列表</Link></Button>
      </div>
    </div>
  )
}

export function AccountProfilePage() {
  const { email } = useOutletContext<{ email: string }>()
  const { data } = useOverview()
  return <div className="px-4 lg:px-6"><Card className="max-w-2xl"><CardHeader><CardTitle>账户资料</CardTitle><CardDescription>邮箱是你的唯一登录账号。</CardDescription></CardHeader><CardContent className="grid gap-4"><div className="grid gap-2"><Label htmlFor="profile-email">邮箱</Label><Input id="profile-email" value={email} readOnly /></div><Metric label="注册时间" value={data ? formatDate(data.createdAt) : "-"} /></CardContent></Card></div>
}

export function AccountSecurityPage() {
  const [currentPassword, setCurrentPassword] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (password !== confirmPassword) return toast.error("两次输入的密码不一致")
    setLoading(true)
    try {
      await putJson("/api/auth/password", { currentPassword, password })
      setCurrentPassword(""); setPassword(""); setConfirmPassword("")
      toast.success("密码已修改")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "修改失败")
    } finally { setLoading(false) }
  }
  return <div className="px-4 lg:px-6"><Card className="max-w-2xl"><CardHeader><CardTitle>修改密码</CardTitle><CardDescription>允许多个设备同时登录，修改密码不会退出其他设备。</CardDescription></CardHeader><CardContent><form className="grid gap-4" onSubmit={submit}><div className="grid gap-2"><Label htmlFor="current-password">当前密码</Label><Input id="current-password" type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="new-password">新密码</Label><Input id="new-password" type="password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="confirm-password">确认新密码</Label><Input id="confirm-password" type="password" minLength={8} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></div><Button className="w-fit" disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : null}保存密码</Button></form></CardContent></Card></div>
}

export function PaymentResultPage() {
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get("paymentOrder") || ""
  const [order, setOrder] = React.useState<PaymentOrder | null>(null)
  const [loading, setLoading] = React.useState(false)
  async function refresh() {
    if (!orderId) return
    setLoading(true)
    try { setOrder(await fetchJson<PaymentOrder>(`/api/payments/orders/${encodeURIComponent(orderId)}`)) } catch (error) { toast.error(error instanceof Error ? error.message : "查询失败") } finally { setLoading(false) }
  }
  React.useEffect(() => { void refresh() }, [orderId])
  const paid = order?.status === "paid"
  return <div className="px-4 lg:px-6"><Card className="mx-auto max-w-xl"><CardHeader className="text-center">{paid ? <CheckCircle2 className="mx-auto size-10" /> : <Clock3 className="mx-auto size-10" />}<CardTitle>{paid ? "支付成功" : "等待支付"}</CardTitle><CardDescription>{order?.optionLabel || "正在确认订单状态"}</CardDescription></CardHeader><CardContent className="flex justify-center gap-2"><Button onClick={refresh} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : null}刷新状态</Button><Button asChild variant="outline"><Link to={paid ? "/account/subscription" : "/account/orders"}>{paid ? "查看订阅" : "查看订单"}</Link></Button></CardContent></Card></div>
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="grid gap-1"><span className="text-sm text-muted-foreground">{label}</span><strong className="text-sm font-medium">{value}</strong></div>
}

function OrdersTable({ orders }: { orders: PaymentOrder[] }) {
  return <Table><TableHeader><TableRow><TableHead>订单</TableHead><TableHead>套餐</TableHead><TableHead>金额</TableHead><TableHead>状态</TableHead><TableHead>创建时间</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{orders.map(order => <TableRow key={order.id}><TableCell className="font-mono text-xs">{order.merOrderTid}</TableCell><TableCell>{order.planName} / {order.optionLabel}</TableCell><TableCell>{formatMoney(order.amount)}</TableCell><TableCell><Badge variant={order.status === "paid" ? "default" : "secondary"}>{order.statusText}</Badge></TableCell><TableCell>{formatDate(order.createdAt)}</TableCell><TableCell className="text-right"><Button asChild size="sm" variant="outline"><Link to={`/account/orders/${encodeURIComponent(order.id)}`}>查看详情</Link></Button></TableCell></TableRow>)}</TableBody></Table>
}
