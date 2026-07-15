import * as React from "react"
import { Link, Navigate, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom"
import { AlertCircle, ArrowLeft, BadgeCheck, BookOpen, Check, CheckCircle2, Clock3, Copy, ExternalLink, Eye, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { clearJsonCache, fetchCachedJson, fetchJson, getCachedJson, putJson } from "@/api"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { type CarouselApi, Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { VipBadge } from "@/components/features/vip-badge"
import { formatDate, formatDateTime, formatMoney } from "@/utils"

type PaymentOrder = { id: string; merOrderTid: string; planName: string; optionLabel: string; amount: number; status: string; statusText: string; vipSpendAmount?: number; vipSpendBefore?: number; vipSpendAfter?: number; payUrl?: string; paymentError?: string; fulfillmentError?: string; createdAt: string; expiresAt: string; paidAt?: string }
type Subscription = { status: string; activeGroup: string; expiresAt: string; purchasedAt: string; duration: string; cashValue: number; traffic: string; devices: number | string; subscriptionUrl: string; vipLevel?: string }
type Announcement = { id: string; title: string; content: string; publishedAt: string }
type Overview = { email: string; createdAt: string; vipLevel: string; vipSpend: number; vipDiscountPercent: number; subscription: Subscription | null; orders: PaymentOrder[]; announcements: Announcement[] }

const clientGuides = [
  { client: "Shadowrocket", platform: "iPhone / iPad", resources: [{ label: "点击查看教程👉https://pan.baidu.com/s/1EfxrUShiOj5Zmx9TEMIdlw?pwd=nT76", href: "https://pan.baidu.com/s/1EfxrUShiOj5Zmx9TEMIdlw?pwd=nT76", suffix: " [美区账号请联系右下角客服获取]" }] },
  { client: "Sparkle", platform: "Windows / macOS", resources: [{ label: "mac👉 https://oka.lanzouu.com/iVJA93lp0mre", href: "https://oka.lanzouu.com/iVJA93lp0mre" }, { label: "win👉https://oka.lanzouu.com/ijFzd39od4sh", href: "https://oka.lanzouu.com/ijFzd39od4sh" }] },
  { client: "Clash", platform: "Android", resources: [{ label: "点击查看教程👉https://oka.lanzouy.com/iq07G2xbb65e", href: "https://oka.lanzouy.com/iq07G2xbb65e" }] },
] as const

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

function useCachedAccountData<T>(path: string) {
  const [data, setData] = React.useState<T | null>(() => getCachedJson<T>(path) ?? null)
  const [error, setError] = React.useState("")
  React.useEffect(() => {
    let active = true
    fetchCachedJson<T>(path)
      .then(data => { if (active) setData(data) })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [path])
  return { data, error }
}

function useOverview() {
  return useCachedAccountData<Overview>("/api/account/overview")
}

function PageLoading() {
  return <div className="grid gap-4 px-4 lg:px-6"><Skeleton className="h-36" /><Skeleton className="h-72" /></div>
}

function CopySubscription({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false)
  const resetTimer = React.useRef<number>()

  React.useEffect(() => () => window.clearTimeout(resetTimer.current), [])

  async function copySubscription() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.clearTimeout(resetTimer.current)
      resetTimer.current = window.setTimeout(() => setCopied(false), 2000)
      toast.success("订阅链接已复制")
    } catch {
      toast.error("复制失败，请手动复制")
    }
  }

  return <Button variant={copied ? "success" : "outline"} aria-label={copied ? "订阅链接已复制" : "复制订阅链接"} onClick={copySubscription}><span className={copied ? "motion-safe:animate-[copy-success_180ms_ease-out]" : ""}>{copied ? <Check /> : <Copy />}</span>{copied ? "复制订阅成功" : "复制订阅链接"}</Button>
}

export function AccountOverviewPage() {
  const { data, error } = useOverview()
  const [announcementOpen, setAnnouncementOpen] = React.useState(false)
  const [selectedAnnouncement, setSelectedAnnouncement] = React.useState<Announcement | null>(null)
  const [reminderDialog, setReminderDialog] = React.useState(false)
  const [muteToday, setMuteToday] = React.useState(false)
  const [carouselApi, setCarouselApi] = React.useState<CarouselApi>()
  const [carouselIndex, setCarouselIndex] = React.useState(0)
  const latestAnnouncement = data?.announcements[0]
  const currentAnnouncement = data?.announcements[carouselIndex] || latestAnnouncement

  React.useEffect(() => {
    if (!data || !latestAnnouncement) return
    const shouldRemind = localStorage.getItem(`account-announcement-muted:${data.email}`) !== todayKey()
    setSelectedAnnouncement(latestAnnouncement)
    setReminderDialog(shouldRemind)
    setMuteToday(false)
    setAnnouncementOpen(shouldRemind)
  }, [data?.email, latestAnnouncement?.id])

  React.useEffect(() => {
    if (!carouselApi) return
    const select = () => setCarouselIndex(carouselApi.selectedScrollSnap())
    select()
    carouselApi.on("select", select)
    return () => { carouselApi.off("select", select) }
  }, [carouselApi])

  function changeAnnouncementOpen(open: boolean) {
    if (!open && reminderDialog && muteToday && data) localStorage.setItem(`account-announcement-muted:${data.email}`, todayKey())
    if (!open) setReminderDialog(false)
    setAnnouncementOpen(open)
  }

  function viewAnnouncement(announcement: Announcement) {
    setSelectedAnnouncement(announcement)
    setReminderDialog(false)
    setMuteToday(false)
    setAnnouncementOpen(true)
  }

  if (!data) return error ? <p className="px-4 text-sm text-destructive lg:px-6">{error}</p> : <PageLoading />
  const subscription = data.subscription
  const vipSpend = data.vipSpend
  const vipTarget = vipSpend < 360 ? { level: "VIP 2", start: 0, amount: 360 } : vipSpend < 900 ? { level: "VIP 3", start: 360, amount: 900 } : null
  const vipProgress = vipTarget ? Math.min(100, Math.max(0, (vipSpend - vipTarget.start) / (vipTarget.amount - vipTarget.start) * 100)) : 100
  return (
    <>
      <div className="grid gap-4 px-4 lg:px-6">
        {data.announcements.length ? <Card>
          <CardHeader><CardTitle>网站公告</CardTitle><CardDescription>最新服务动态与使用提醒</CardDescription></CardHeader>
          <CardContent>
            <Carousel opts={{ loop: data.announcements.length > 1 }} setApi={setCarouselApi} aria-label="网站公告">
              <CarouselContent>
                {data.announcements.map(announcement => <CarouselItem key={announcement.id}><Item asChild variant="muted"><article className="grid gap-3"><header className="grid gap-1"><h3 className="font-medium">{announcement.title}</h3><time className="text-sm text-muted-foreground" dateTime={announcement.publishedAt}>{formatDateTime(announcement.publishedAt)}</time></header><p className="line-clamp-2 whitespace-pre-wrap text-sm leading-6">{announcement.content}</p></article></Item></CarouselItem>)}
              </CarouselContent>
              <div className="mt-4 flex items-center justify-between gap-2">
                <Button variant="outline" size="sm" onClick={() => { if (currentAnnouncement) viewAnnouncement(currentAnnouncement) }}><Eye />查看公告</Button>
                {data.announcements.length > 1 ? <div className="flex gap-2"><CarouselPrevious className="static translate-y-0" /><CarouselNext className="static translate-y-0" /></div> : null}
              </div>
            </Carousel>
          </CardContent>
        </Card> : null}
        <Card>
          <CardHeader><CardTitle>个人信息</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar size="lg" className="data-[size=lg]:size-15"><AvatarFallback className="bg-slate-600 text-lg font-semibold text-white dark:bg-slate-500">{data.email.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
              <div className="grid min-w-0 flex-1 gap-2">
                <p className="truncate text-sm font-medium">{data.email}</p>
                <div className="flex flex-wrap items-center gap-2"><VipBadge level={data.vipLevel} /><span className="text-xs text-muted-foreground">专属折扣 {data.vipDiscountPercent}%</span></div>
              </div>
            </div>
            <div className="grid gap-1.5"><div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground"><span>{vipTarget ? `距离 ${vipTarget.level}` : "已达到最高等级"}</span><span>{vipTarget ? `还差 ${formatMoney(vipTarget.amount - vipSpend)}` : "100%"}</span></div><Progress value={vipProgress} aria-label={`VIP 消费进度 ${Math.round(vipProgress)}%`} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4"><div><CardDescription>当前订阅</CardDescription><CardTitle className="mt-1 text-2xl">{subscription ? subscription.activeGroup.toUpperCase() : "暂无订阅"}</CardTitle></div><Badge variant={subscription?.status === "active" ? "success" : subscription?.status === "expired" ? "destructive" : "warning"}>{subscription?.status === "active" ? <><BadgeCheck />生效中</> : subscription?.status === "expired" ? "已过期" : "未开通"}</Badge></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Metric label="到期时间" value={subscription ? formatDate(subscription.expiresAt) : "-"} />
            <Metric label="流量" value={subscription?.traffic || "-"} />
            <Metric label="可绑定设备" value={subscription ? `${subscription.devices} 台` : "-"} />
            <Metric label="剩余现金价值" value={subscription ? formatMoney(subscription.cashValue) : "-"} />
            <div className="col-span-2 flex flex-wrap gap-2 xl:col-span-4"><Button asChild><Link to="/account/plans">{subscription ? "续费或更换套餐" : "购买套餐"}</Link></Button></div>
            {subscription ? <><Separator className="col-span-2 xl:col-span-4" /><Field className="col-span-2 xl:col-span-4"><FieldLabel htmlFor="subscription-url">订阅链接</FieldLabel><FieldDescription>请勿将订阅链接分享给其他人。</FieldDescription><Input id="subscription-url" readOnly value={subscription.subscriptionUrl} /><div className="grid gap-2 sm:flex sm:flex-wrap [&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-auto"><CopySubscription value={subscription.subscriptionUrl} /><Button asChild variant="outline"><a href={`shadowrocket://add/${encodeURIComponent(subscription.subscriptionUrl)}`}><ExternalLink />导入 Shadowrocket</a></Button><Button asChild variant="outline"><Link to="/account/docs"><BookOpen />查看使用教程</Link></Button></div></Field></> : null}
          </CardContent>
        </Card>
      </div>
      <Dialog open={announcementOpen} onOpenChange={changeAnnouncementOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selectedAnnouncement?.title}</DialogTitle><DialogDescription>{formatDateTime(selectedAnnouncement?.publishedAt)}</DialogDescription></DialogHeader>
          <p className="whitespace-pre-wrap text-sm leading-6">{selectedAnnouncement?.content}</p>
          <DialogFooter>
            {reminderDialog ? <label className="flex items-center gap-2 text-sm sm:mr-auto"><Checkbox checked={muteToday} onCheckedChange={checked => setMuteToday(checked === true)} />今日不再提醒</label> : null}
            <DialogClose asChild><Button variant={reminderDialog ? "default" : "outline"}>{reminderDialog ? "我知道了" : "关闭"}</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function AccountDocsPage() {
  const { data, error } = useOverview()
  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <Card>
        <CardHeader><CardTitle>客户端使用文档</CardTitle><CardDescription>选择你正在使用的客户端，查看对应教程或下载地址。</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {data?.subscription ? <CopySubscription value={data.subscription.subscriptionUrl} /> : <Button asChild><Link to="/account/plans">查看套餐</Link></Button>}
          <Button asChild variant="outline"><Link to="/account">返回总览</Link></Button>
          {error ? <p className="w-full text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>选择客户端</CardTitle><CardDescription>不同系统的菜单名称可能略有差异，导入时使用同一条订阅链接。</CardDescription></CardHeader>
        <CardContent>
          <Accordion type="single" collapsible>
            {clientGuides.map(guide => (
              <AccordionItem key={guide.client} value={guide.client}>
                <AccordionTrigger><span className="flex min-w-0 flex-wrap items-center gap-2"><span>{guide.client}</span><Badge variant="secondary">{guide.platform}</Badge></span></AccordionTrigger>
                <AccordionContent><div className="grid gap-2">{guide.resources.map(resource => <p key={resource.href}><a className="text-primary underline underline-offset-4" href={resource.href} target="_blank" rel="noreferrer">{resource.label}</a>{"suffix" in resource ? resource.suffix : ""}</p>)}</div></AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  )
}

export function AccountOrdersPage() {
  const { data: orders, error } = useCachedAccountData<PaymentOrder[]>("/api/account/orders")
  if (!orders) return error ? <p className="px-4 text-sm text-destructive lg:px-6">{error}</p> : <PageLoading />
  return <div className="px-4 lg:px-6"><Card><CardHeader><CardTitle>订单记录</CardTitle><CardDescription>所有购买、续费和换套餐订单</CardDescription></CardHeader><CardContent>{orders.length ? <OrdersTable orders={orders} /> : <p className="text-sm text-muted-foreground">仅展示2026年7月15日后的订单</p>}</CardContent></Card></div>
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
      if (order?.status === "pending" && nextOrder.status !== "pending") window.dispatchEvent(new Event("payment-order-updated"))
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
    <div className="px-4 lg:px-6">
      <Card className="mx-auto max-w-3xl">
        <CardHeader className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="grid gap-1"><CardTitle className="text-2xl">订单详情</CardTitle><CardDescription className="font-mono">订单号 {order.merOrderTid}</CardDescription></div>
          <Badge className="w-fit sm:justify-self-end" variant={order.status === "paid" ? "success" : order.status === "pending" ? "warning" : "destructive"}>{order.statusText}</Badge>
        </CardHeader>
        <CardContent className="grid gap-5">
          {order.status === "pending" ? <Alert variant="warning"><Clock3 /><AlertDescription className="block">请在 <strong className="font-mono text-foreground">{countdown}</strong> 内完成付款，超时后订单将自动关闭。</AlertDescription></Alert> : null}
          {order.paymentError || order.fulfillmentError ? <Alert variant="error"><AlertCircle /><AlertTitle>支付处理失败</AlertTitle><AlertDescription>{order.paymentError || order.fulfillmentError}</AlertDescription></Alert> : null}
          <Separator />
          <div className="grid gap-3 sm:grid-cols-2">
            <OrderInfo label="套餐" value={`${order.planName} / ${order.optionLabel}`} />
            <OrderInfo label="订单金额" value={formatMoney(order.amount)} emphasis />
            <OrderInfo label="创建时间" value={formatDateTime(order.createdAt)} />
            <OrderInfo label="支付时间" value={order.paidAt ? formatDateTime(order.paidAt) : "尚未支付"} />
          </div>
        </CardContent>
        <CardFooter className="grid gap-2 sm:flex sm:flex-wrap">
          {order.status === "pending" && order.payUrl ? <Button asChild className="w-full sm:w-auto"><a href={order.payUrl} target="_blank" rel="noreferrer"><ExternalLink />打开支付页面</a></Button> : null}
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => refresh(true)} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}检测支付状态</Button>
          <Button asChild className="w-full sm:ml-auto sm:w-auto" variant="ghost"><Link to="/account/orders"><ArrowLeft />返回订单列表</Link></Button>
        </CardFooter>
      </Card>
    </div>
  )
}

function OrderInfo({ label, value, emphasis = false }: { label: string; value: React.ReactNode; emphasis?: boolean }) {
  return <Item variant="muted"><ItemContent><ItemDescription>{label}</ItemDescription><ItemTitle className={emphasis ? "text-lg" : "text-base"}>{value}</ItemTitle></ItemContent></Item>
}

export function AccountSettingsPage() {
  const navigate = useNavigate()
  const { email } = useOutletContext<{ email: string }>()
  const { data } = useOverview()
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
      clearJsonCache()
      toast.success("密码已修改，请重新登录")
      navigate("/login", { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "修改失败")
    } finally { setLoading(false) }
  }
  return <div className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6"><Card><CardHeader><CardTitle>账户资料</CardTitle><CardDescription>邮箱是你的唯一登录账号。</CardDescription></CardHeader><CardContent className="grid gap-4"><div className="grid gap-2"><Label htmlFor="profile-email">邮箱</Label><Input id="profile-email" value={email} disabled /></div><Metric label="注册时间" value={data ? formatDate(data.createdAt) : "-"} /></CardContent></Card><Card><CardHeader><CardTitle>修改密码</CardTitle><CardDescription>修改成功后当前设备需要重新登录，其他设备保持登录。</CardDescription></CardHeader><CardContent><form className="grid gap-4" onSubmit={submit}><div className="grid gap-2"><Label htmlFor="current-password">当前密码</Label><Input id="current-password" type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="new-password">新密码</Label><Input id="new-password" type="password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="confirm-password">确认新密码</Label><Input id="confirm-password" type="password" minLength={8} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></div><Button disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : null}保存密码</Button></form></CardContent></Card></div>
}

export function PaymentResultPage() {
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get("paymentOrder") || ""
  const [order, setOrder] = React.useState<PaymentOrder | null>(null)
  const [loading, setLoading] = React.useState(false)
  async function refresh() {
    if (!orderId) return
    setLoading(true)
    try {
      const nextOrder = await fetchJson<PaymentOrder>(`/api/payments/orders/${encodeURIComponent(orderId)}`)
      setOrder(nextOrder)
      if (order?.status === "pending" && nextOrder.status !== "pending") window.dispatchEvent(new Event("payment-order-updated"))
    } catch (error) { toast.error(error instanceof Error ? error.message : "查询失败") } finally { setLoading(false) }
  }
  React.useEffect(() => { void refresh() }, [orderId])
  if (!orderId) return <Navigate to="/account/orders" replace />
  const error = order?.paymentError || order?.fulfillmentError
  const paid = order?.status === "paid" && !error
  const failed = order && !["pending", "paid"].includes(order.status)
  if (paid && order) return (
    <div className="px-4 lg:px-6">
      <Card className="mx-auto max-w-xl overflow-hidden py-0">
        <CardContent className="grid justify-items-center gap-5 py-6 text-center">
          <span className="relative flex size-16 items-center justify-center rounded-full border border-primary/30 bg-primary/10 shadow-sm">
            <span className="absolute inset-2 rounded-full border-2 border-primary/30 motion-safe:animate-ping" />
            <CheckCircle2 className="relative size-10 text-emerald-600 dark:text-emerald-500" />
          </span>
          <header className="grid gap-2"><h1 className="text-2xl font-semibold tracking-tight">支付成功 🎉</h1><p className="text-sm text-muted-foreground">您的套餐已成功开通</p></header>
          <section className="grid gap-1" aria-label="支付信息"><strong className="text-4xl font-semibold tracking-tight">{formatMoney(order.amount)}</strong><p className="text-xs text-muted-foreground">已支付 · {order.planName} / {order.optionLabel}</p></section>
          <PaymentVipProgress order={order} />
          <Button asChild size="lg" className="w-full"><Link to="/account">开始畅游网络 →</Link></Button>
        </CardContent>
      </Card>
    </div>
  )
  return <div className="px-4 lg:px-6"><Card className="mx-auto max-w-xl"><CardHeader className="text-center">{failed || error ? <AlertCircle className="mx-auto size-10" /> : <Clock3 className="mx-auto size-10" />}<CardTitle>{order?.statusText || "正在确认支付"}</CardTitle><CardDescription>{order?.optionLabel || "正在确认订单状态"}</CardDescription></CardHeader><CardContent className="grid gap-4">{error ? <Alert variant="error"><AlertCircle /><AlertTitle>支付处理失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}<div className="flex justify-center gap-2"><Button onClick={refresh} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : null}刷新状态</Button><Button asChild variant="outline"><Link to="/account/orders">查看订单</Link></Button></div></CardContent></Card></div>
}

function PaymentVipProgress({ order }: { order: PaymentOrder }) {
  const before = Math.max(Number(order.vipSpendBefore) || 0, 0)
  const after = Math.max(Number(order.vipSpendAfter) || before, before)
  const [spend, setSpend] = React.useState(before)
  const tier = after >= 900
    ? { level: "vip3", start: 0, target: 900, label: "已达到最高等级" }
    : after >= 360
      ? { level: "vip2", start: 360, target: 900, label: "距离 VIP 3" }
      : { level: "vip1", start: 0, target: 360, label: "距离 VIP 2" }
  const progress = Math.min(100, Math.max(0, (spend - tier.start) / (tier.target - tier.start) * 100))

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => setSpend(after))
    return () => window.cancelAnimationFrame(frame)
  }, [after])

  return (
    <>
      <Separator className="w-full" />
      <section className="grid w-full gap-3 text-left" aria-label="成长进度">
        <header className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><VipBadge level={tier.level} /><span className="text-sm font-medium">成长进度</span></span><span className="text-xs text-muted-foreground">{tier.label}</span></header>
        <Progress value={progress} className="[&_[data-slot=progress-indicator]]:duration-1000 motion-reduce:[&_[data-slot=progress-indicator]]:transition-none" aria-label={`VIP 累计消费 ${formatMoney(after)}`} />
        <footer className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>本次消费 +{formatMoney(order.vipSpendAmount || 0)}</span><span>{formatMoney(after)} / {formatMoney(tier.target)}</span></footer>
      </section>
    </>
  )
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="grid gap-1"><span className="text-sm text-muted-foreground">{label}</span><strong className="text-sm font-medium">{value}</strong></div>
}

function OrdersTable({ orders }: { orders: PaymentOrder[] }) {
  return <Table><TableHeader><TableRow><TableHead>订单</TableHead><TableHead>套餐</TableHead><TableHead>金额</TableHead><TableHead>状态</TableHead><TableHead>创建时间</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{orders.map(order => <TableRow key={order.id}><TableCell className="font-mono text-xs">{order.merOrderTid}</TableCell><TableCell>{order.planName} / {order.optionLabel}</TableCell><TableCell>{formatMoney(order.amount)}</TableCell><TableCell><Badge variant={order.status === "paid" ? "default" : "secondary"}>{order.statusText}</Badge></TableCell><TableCell>{formatDate(order.createdAt)}</TableCell><TableCell className="text-right"><Button asChild size="sm" variant="outline"><Link to={`/account/orders/${encodeURIComponent(order.id)}`}>查看详情</Link></Button></TableCell></TableRow>)}</TableBody></Table>
}
