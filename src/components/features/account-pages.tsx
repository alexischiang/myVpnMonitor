import * as React from "react"
import { Link, Navigate, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom"
import { AlertCircle, BadgeCheck, BookOpen, Check, CheckCircle2, CircleHelp, Clock3, Coins, Copy, ExternalLink, Eye, Gift, HardDrive, HousePlug, Info, Loader2, PackagePlus, Percent, RefreshCw, Star, Users, WalletCards, XCircle, Zap, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { clearJsonCache, deleteJson, fetchCachedJson, fetchJson, getCachedJson, postJson, putJson } from "@/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { type CarouselApi, Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { BackButton } from "@/components/features/back-button"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AccountVerificationIcon } from "@/components/features/account-verification-icon"
import { DataTableRowActions } from "@/components/features/data-table"
import { MarkdownContent } from "@/components/features/markdown-content"
import { OrderMobileItem } from "@/components/features/order-mobile-item"
import { VipBadge } from "@/components/features/vip-badge"
import { formatDate, formatDateTime, formatMoney, purchasedPlanName } from "@/utils"

type OrderAddOn = { id: string; optionId: string; name: string; regionName?: string; amount: number; durationDays?: number; deliveryMode?: string; deliveryDescription?: string }
type PaymentOrder = { id: string; merOrderTid: string; purpose?: "plan" | "recharge" | "traffic_pack" | "addon"; planName: string; optionLabel: string; amount: number; totalAmount?: number; baseAmount?: number; originalAmount?: number; discountAmount?: number; vipDiscountAmount?: number; subtotal?: number; taxAmount?: number; addOnAmount?: number; addOnSnapshots?: OrderAddOn[]; trafficTier?: number; trafficBaseGb?: number; trafficGb?: number | null; trafficTierMarkupPercent?: number; walletAmount?: number; walletCashAmount?: number; walletGiftAmount?: number; walletReferralAmount?: number; realCashAmount?: number; virtualCashAmount?: number; status: string; statusText: string; paymentProvider?: string; channelCode?: string; couponCode?: string; purchaseAction?: string; fulfillmentStatus?: string; fulfillmentStartedAt?: string; fulfilledAt?: string; vipSpendAmount?: number; vipSpendBefore?: number; vipSpendAfter?: number; payUrl?: string; paymentError?: string; fulfillmentError?: string; createdAt: string; updatedAt?: string; expiresAt: string; paidAt?: string }
type Subscription = { status: string; activeGroup: string; lineType?: "upstream" | "self_hosted"; planExpiresAt?: string; expiresAt: string; giftedDays?: number; purchasedAt: string; duration: string; traffic: string; unlimited?: boolean; trafficTier?: number; purchasedTrafficGb?: number; currentProductSnapshot?: Record<string, unknown>; devices: number | string; subscriptionUrl: string; vipLevel?: string }
type SelfHostedTraffic = { status: string; usedBytes: number; totalBytes: number; remainingBytes: number | null; usagePercent: number | null; connectedIpCount: number | null; ipLimit: number; nextResetAt: string; lastSyncedAt: string; dailyUsage: Array<{ date: string; usedBytes: number }>; stale?: boolean; error?: string }
type NodeStatusSummary = { configured: boolean; totalNodes: number; onlineNodes: number; offlineNodes: number; checkedAt: string }
type Announcement = { id: string; title: string; content: string; publishedAt: string }
type AccountService = { id: string; orderId: string; name: string; regionName?: string; amount: number; durationDays?: number; startedAt: string; expiresAt?: string; status: "pending" | "processing" | "active" | "expired"; deliveryNote?: string }
type Overview = { customerID: number; email: string; createdAt: string; isBusiness: boolean; isFamilyFriend: boolean; isSuperAccount: boolean; vipLevel: string; vipSpend: number; vipDiscountPercent: number; wallet: Omit<WalletData, "entries">; subscription: Subscription | null; services: AccountService[]; trafficPack?: { trafficGb: number; price: number; enabled: boolean }; homeIp?: { enabled: boolean; regions: Array<{ id: string; name: string; price: number }> }; orders: PaymentOrder[]; announcements: Announcement[] }
type WalletEntry = { id: string; type: string; cashDelta: number; giftDelta: number; referralDelta: number; realCashDelta?: number; virtualCashDelta?: number; vipDelta: number; balance: number; description: string; createdAt: string }
type WalletData = { balance: number; cashBalance: number; giftBalance: number; referralBalance: number; realCashBalance?: number; virtualCashBalance?: number; availableRealCashBalance?: number; availableVirtualCashBalance?: number; availableBalance: number; heldBalance: number; vipSpend: number; paymentMethods: { alipay: boolean; wechat: boolean }; entries: WalletEntry[] }
type ImportClient = "shadowrocket" | "sparkle" | "clash-meta" | "clash-verge"

const AccountTrafficChart = React.lazy(() => import("@/components/features/account-traffic-chart").then(module => ({ default: module.AccountTrafficChart })))

const importClients: Record<ImportClient, { name: string; app: string; scheme: string }> = {
  shadowrocket: { name: "Shadowrocket", app: "小火箭", scheme: "shadowrocket://add/" },
  sparkle: { name: "Sparkle", app: "Sparkle", scheme: "mihomo://install-config?url=" },
  "clash-meta": { name: "Clash Meta for Android", app: "Clash Meta", scheme: "clash://install-config?url=" },
  "clash-verge": { name: "Clash Verge Rev", app: "Clash Verge Rev", scheme: "clash://install-config?url=" },
}

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

  return <Button className="min-h-11" variant={copied ? "success" : "outline"} aria-label={copied ? "订阅链接已复制" : "复制订阅链接"} onClick={copySubscription}><span className={copied ? "motion-safe:animate-[copy-success_180ms_ease-out]" : ""}>{copied ? <Check /> : <Copy />}</span>{copied ? "复制订阅成功" : "复制订阅链接"}</Button>
}

function PersonalInfoCard({ account }: { account: Overview }) {
  const accountType = account.isSuperAccount ? "super" : account.isBusiness ? "business" : account.isFamilyFriend ? "family" : "regular"
  const vipTarget = account.vipSpend < 360 ? { level: "VIP 2", start: 0, amount: 360 } : account.vipSpend < 900 ? { level: "VIP 3", start: 360, amount: 900 } : null
  const vipProgress = vipTarget ? Math.min(100, Math.max(0, (account.vipSpend - vipTarget.start) / (vipTarget.amount - vipTarget.start) * 100)) : 100

  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2">个人信息<Badge variant="outline" className="tabular-nums">ID #{account.customerID}</Badge></CardTitle></CardHeader>
    <CardContent className="grid gap-4">
      <div className="flex min-w-0 items-center gap-4">
        <Avatar size="lg" className="data-[size=lg]:size-15"><AvatarFallback className="bg-slate-600 text-lg font-semibold text-white dark:bg-slate-500">{account.email.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
        <div className="grid min-w-0 flex-1 gap-2">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium"><span className="truncate">{account.email}</span><AccountVerificationIcon type={accountType} /></p>
          <div className="flex flex-wrap items-center gap-2"><VipBadge level={account.vipLevel} /><span className="flex items-center gap-1 text-xs text-muted-foreground">专属折扣 {account.vipDiscountPercent}%<Tooltip><TooltipTrigger aria-label="查看各级 VIP 折扣"><CircleHelp className="size-3.5" /></TooltipTrigger><TooltipContent>VIP 1：0% · VIP 2：5% · VIP 3：10%</TooltipContent></Tooltip></span></div>
        </div>
      </div>
      <div className="grid gap-1.5"><div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground"><span>{vipTarget ? `距离 ${vipTarget.level}` : "已达到最高等级"}</span><span>{vipTarget ? `还差 ${formatMoney(vipTarget.amount - account.vipSpend)}` : "100%"}</span></div><Progress value={vipProgress} aria-label={`VIP 消费进度 ${Math.round(vipProgress)}%`} /></div>
    </CardContent>
  </Card>
}

function NodeStatusCard({ status, error }: { status: NodeStatusSummary | null; error: string }) {
  const available = Boolean(status?.configured && status.checkedAt)
  const value = (count: number | undefined) => available ? count : !status && !error ? <Skeleton className="h-7 w-8" /> : "-"
  return <Card>
    <CardHeader>
      <CardTitle>节点状态</CardTitle>
      <CardDescription>{error ? "状态暂不可用" : !status ? "正在获取检测结果" : !status.configured ? "节点监控未配置" : status.checkedAt ? `最近检测 ${formatDateTime(status.checkedAt)}` : "等待首次检测"}</CardDescription>
    </CardHeader>
    <CardContent>
      <ItemGroup className="grid-cols-3">
        <Item variant="muted"><ItemContent><ItemDescription>总节点</ItemDescription><ItemTitle className="text-xl tabular-nums">{value(status?.totalNodes)}</ItemTitle></ItemContent></Item>
        <Item variant="muted"><ItemContent><ItemDescription>在线节点</ItemDescription><ItemTitle className="text-xl tabular-nums">{value(status?.onlineNodes)}</ItemTitle></ItemContent></Item>
        <Item variant="muted"><ItemContent><ItemDescription>离线节点</ItemDescription><ItemTitle className="text-xl tabular-nums">{value(status?.offlineNodes)}</ItemTitle></ItemContent></Item>
      </ItemGroup>
    </CardContent>
  </Card>
}

function PlanStatusCard({ account, subscription, traffic, trafficLoading, trafficError, onImportClient }: { account: Overview; subscription: Subscription | null; traffic: SelfHostedTraffic | null; trafficLoading: boolean; trafficError: string; onImportClient: (client: ImportClient) => void }) {
  const usagePercent = subscription?.lineType === "self_hosted" ? traffic?.usagePercent : null
  const remainingPercent = usagePercent == null ? null : Math.max(0, 100 - usagePercent)
  const trafficTotal = traffic ? `${(traffic.totalBytes / 1024 ** 3).toFixed(0)} GB` : subscription?.traffic || "-"
  const trafficUsed = traffic ? `${(traffic.usedBytes / 1024 ** 3).toFixed(2)} GB` : "-"
  const status = !subscription ? "inactive" : subscription.status === "expired" ? "expired" : traffic?.status === "depleted" ? "depleted" : "active"
  const canBuyHomeIp = account.homeIp?.enabled && status === "active" && subscription?.duration !== "lifetime"
  const homeIpStartingPrice = Math.min(...(account.homeIp?.regions || []).map(region => Number(region.price)).filter(Number.isFinite))
  const expiresAtTime = Date.parse(subscription?.expiresAt || "")
  const remainingDays = Number.isFinite(expiresAtTime) ? Math.max(0, Math.ceil((expiresAtTime - Date.now()) / 86400000)) : null

  return <Card id="subscription" className="scroll-mt-16 xl:col-span-8">
    <CardHeader>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar size="lg"><AvatarFallback><Zap className="size-5" /></AvatarFallback></Avatar>
        <div className="grid min-w-0 gap-1">
          <CardTitle className="truncate text-lg">{subscription ? purchasedPlanName(subscription, [], traffic?.totalBytes) : "暂无套餐"}</CardTitle>
          <Badge variant={status === "active" ? "success" : status === "inactive" ? "warning" : "destructive"}>{status === "active" ? <><CheckCircle2 />生效中</> : status === "expired" ? "已过期" : status === "depleted" ? "流量耗尽" : "未开通"}</Badge>
        </div>
      </div>
    </CardHeader>
    <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
      <section className="grid content-start gap-4" aria-labelledby="traffic-usage-title">
        <header className="grid gap-2">
          <p id="traffic-usage-title" className="flex items-center gap-2 text-sm font-medium"><HardDrive className="size-4" />流量使用</p>
          <p className="flex items-baseline gap-2"><strong className="text-3xl font-semibold tabular-nums">{remainingPercent == null ? subscription?.unlimited ? "不限" : trafficLoading ? "同步中" : "-" : `${Math.round(remainingPercent)}%`}</strong>{remainingPercent == null || subscription?.unlimited ? null : <span className="text-sm text-muted-foreground">剩余</span>}</p>
        </header>
        <Progress value={usagePercent ?? 0} aria-label={usagePercent == null ? "流量用量暂不可用" : `已使用流量 ${Math.round(usagePercent)}%`} />
        <p className="flex justify-between gap-3 text-xs text-muted-foreground"><span>已用 {trafficUsed} / {subscription?.unlimited ? "不限" : trafficTotal}</span>{traffic?.nextResetAt ? <span>{formatDate(traffic.nextResetAt)} 重置</span> : null}</p>
        {trafficError ? <Alert variant="warning"><Info /><AlertTitle>流量同步暂不可用</AlertTitle><AlertDescription>{trafficError}</AlertDescription></Alert> : null}
      </section>

      <section className="grid content-start gap-4" aria-labelledby="plan-details-title">
        <header className="flex items-center justify-between gap-3">
          <h3 id="plan-details-title" className="flex items-center gap-2 text-sm font-medium"><Star className="size-4 text-primary" />套餐详情</h3>
          <strong className="text-sm">{remainingDays === null ? "-" : `剩余 ${remainingDays} 天`}</strong>
        </header>
        <ItemGroup className="sm:grid-cols-2 lg:grid-cols-3">
          <Item variant="muted"><ItemContent><ItemDescription>到期日期</ItemDescription><ItemTitle>{subscription ? formatDate(subscription.expiresAt) : "-"}</ItemTitle>{subscription?.giftedDays ? <ItemDescription>原到期日 {formatDate(subscription.planExpiresAt)}，已赠送 {subscription.giftedDays} 天</ItemDescription> : null}</ItemContent></Item>
          <Item variant="muted"><ItemContent><ItemDescription>流量配额</ItemDescription><ItemTitle>{subscription?.unlimited ? "不限" : trafficTotal}</ItemTitle></ItemContent></Item>
          <Item variant="muted"><ItemContent><ItemDescription>{traffic ? "在线IP限制" : "可绑定设备"}</ItemDescription><ItemTitle>{traffic ? `${traffic.connectedIpCount ?? "-"} / ${traffic.ipLimit || "不限"}` : subscription ? `${subscription.devices} 台` : "-"}</ItemTitle></ItemContent></Item>
        </ItemGroup>
        <div className="grid gap-2 sm:grid-cols-2">
          {canBuyHomeIp ? <Button asChild className="min-h-11 text-sm sm:col-span-2"><Link to="/account/plans/checkout?product=home-ip"><HousePlug />AI被降智？定制纯净家宽 IP{Number.isFinite(homeIpStartingPrice) ? ` · ${formatMoney(homeIpStartingPrice)} 起` : ""}</Link></Button> : null}
          {subscription ? null : <Button asChild variant="outline" className="min-h-11"><Link to="/account/plans"><PackagePlus />购买服务</Link></Button>}
        </div>
      </section>
    </CardContent>
    {subscription ? <><Separator /><CardHeader><CardTitle>订阅链接</CardTitle><CardDescription>请勿将订阅链接分享给其他人。</CardDescription></CardHeader><CardContent><Field><FieldLabel htmlFor="subscription-url">订阅地址</FieldLabel><span className="block rounded-md bg-[linear-gradient(90deg,var(--chart-1),var(--chart-2),var(--chart-3),var(--chart-4),var(--chart-5))] p-0.5"><Input id="subscription-url" className="border-0 bg-background font-semibold shadow-none dark:bg-background" readOnly value={subscription.subscriptionUrl} /></span><div className="grid gap-2 sm:flex sm:flex-wrap [&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:text-base [&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-auto"><CopySubscription value={subscription.subscriptionUrl} /><Button variant="outline" onClick={() => onImportClient("shadowrocket")}><ExternalLink />导入 Shadowrocket</Button><Button variant="outline" onClick={() => onImportClient("sparkle")}><ExternalLink />导入 Sparkle</Button><Button variant="outline" onClick={() => onImportClient("clash-meta")}><ExternalLink />导入 Clash Meta</Button><Button variant="outline" onClick={() => onImportClient("clash-verge")}><ExternalLink />导入 Clash Verge</Button><Button asChild variant="outline"><Link to="/account/docs"><BookOpen />查看使用教程</Link></Button></div></Field></CardContent></> : null}
  </Card>
}

export function AccountOverviewPage() {
  const { data, error } = useOverview()
  const [importClient, setImportClient] = React.useState<ImportClient | null>(null)
  const [announcementOpen, setAnnouncementOpen] = React.useState(false)
  const [selectedAnnouncement, setSelectedAnnouncement] = React.useState<Announcement | null>(null)
  const [reminderDialog, setReminderDialog] = React.useState(false)
  const [muteToday, setMuteToday] = React.useState(false)
  const [carouselApi, setCarouselApi] = React.useState<CarouselApi>()
  const [carouselIndex, setCarouselIndex] = React.useState(0)
  const [selfHostedTraffic, setSelfHostedTraffic] = React.useState<SelfHostedTraffic | null>(null)
  const [trafficLoading, setTrafficLoading] = React.useState(false)
  const [trafficError, setTrafficError] = React.useState("")
  const [nodeStatus, setNodeStatus] = React.useState<NodeStatusSummary | null>(null)
  const [nodeStatusError, setNodeStatusError] = React.useState("")
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

  React.useEffect(() => {
    if (data && window.location.hash === "#subscription") document.getElementById("subscription")?.scrollIntoView()
  }, [data?.email])

  React.useEffect(() => {
    if (data?.subscription?.lineType !== "self_hosted") {
      setSelfHostedTraffic(null)
      setTrafficError("")
      return
    }
    let active = true
    setTrafficLoading(true)
    fetchJson<SelfHostedTraffic>("/api/account/self-hosted-traffic")
        .then(value => {
          if (!active) return
          setSelfHostedTraffic(value)
          setTrafficError(value.error || "")
        })
        .catch(error => { if (active) setTrafficError(error instanceof Error ? error.message : "流量同步失败") })
        .finally(() => { if (active) setTrafficLoading(false) })
    return () => { active = false }
  }, [data?.subscription?.lineType])

  React.useEffect(() => {
    let active = true
    const refresh = () => fetchJson<NodeStatusSummary>("/api/account/node-status")
      .then(value => { if (active) { setNodeStatus(value); setNodeStatusError("") } })
      .catch(error => { if (active) setNodeStatusError(error instanceof Error ? error.message : "节点状态获取失败") })
    void refresh()
    const timer = window.setInterval(refresh, 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

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
  const hasTrafficDetails = subscription?.lineType === "self_hosted"
  const importConfig = importClient ? importClients[importClient] : null
  const importUrl = subscription && importConfig ? `${importConfig.scheme}${encodeURIComponent(subscription.subscriptionUrl)}` : ""
  return (
    <>
      <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-12">
        <Alert variant="warning" className="xl:col-span-12"><CircleHelp /><AlertDescription className="flex w-full flex-row items-center justify-between gap-3"><span>遇到问题？发送工单联系客服吧！</span><Button asChild variant="link" size="sm" className="h-auto shrink-0 p-0 underline underline-offset-4"><Link to="/account/tickets/new">发送工单</Link></Button></AlertDescription></Alert>
        <PlanStatusCard account={data} subscription={subscription} traffic={selfHostedTraffic} trafficLoading={trafficLoading} trafficError={trafficError} onImportClient={setImportClient} />
        <section className="grid content-start gap-4 xl:col-span-4" aria-label="账户与节点概览">
          <PersonalInfoCard account={data} />
          <NodeStatusCard status={nodeStatus} error={nodeStatusError} />
        </section>
        {data.announcements.length ? <Card className={hasTrafficDetails ? "xl:col-span-6" : "xl:col-span-12"}>
          <CardHeader><CardTitle>网站公告</CardTitle><CardDescription>最新服务动态与使用提醒</CardDescription></CardHeader>
          <CardContent>
            <Carousel opts={{ loop: data.announcements.length > 1 }} setApi={setCarouselApi} aria-label="网站公告">
              <CarouselContent>
                {data.announcements.map(announcement => <CarouselItem key={announcement.id}><Item asChild variant="muted"><article role="button" tabIndex={0} className="grid cursor-pointer gap-3 hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" onClick={() => viewAnnouncement(announcement)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); viewAnnouncement(announcement) } }}><header className="grid gap-1"><h3 className="font-medium">{announcement.title}</h3><time className="text-sm text-muted-foreground" dateTime={announcement.publishedAt}>{formatDateTime(announcement.publishedAt)}</time></header><MarkdownContent content={announcement.content} className="line-clamp-2 max-h-14 overflow-hidden" /></article></Item></CarouselItem>)}
              </CarouselContent>
              <div className="mt-4 flex items-center justify-between gap-2">
                <Button variant="outline" size="sm" onClick={() => { if (currentAnnouncement) viewAnnouncement(currentAnnouncement) }}><Eye />查看公告</Button>
                {data.announcements.length > 1 ? <div className="flex gap-2"><CarouselPrevious className="static translate-y-0" /><CarouselNext className="static translate-y-0" /></div> : null}
              </div>
            </Carousel>
          </CardContent>
        </Card> : null}
        {hasTrafficDetails ? selfHostedTraffic ? <React.Suspense fallback={<Skeleton className={`h-72 ${data.announcements.length ? "xl:col-span-6" : "xl:col-span-12"}`} />}><AccountTrafficChart className={data.announcements.length ? "xl:col-span-6" : "xl:col-span-12"} data={selfHostedTraffic.dailyUsage} /></React.Suspense> : <Skeleton className={`h-72 ${data.announcements.length ? "xl:col-span-6" : "xl:col-span-12"}`} /> : null}
      </div>
      <Dialog open={announcementOpen} onOpenChange={changeAnnouncementOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selectedAnnouncement?.title}</DialogTitle><DialogDescription>{formatDateTime(selectedAnnouncement?.publishedAt)}</DialogDescription></DialogHeader>
          {selectedAnnouncement ? <MarkdownContent content={selectedAnnouncement.content} /> : null}
          <DialogFooter>
            {reminderDialog ? <label className="flex items-center gap-2 text-sm sm:mr-auto"><Checkbox checked={muteToday} onCheckedChange={checked => setMuteToday(checked === true)} />今日不再提醒</label> : null}
            <DialogClose asChild><Button variant={reminderDialog ? "default" : "outline"}>{reminderDialog ? "我知道了" : "关闭"}</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={importClient !== null} onOpenChange={open => { if (!open) setImportClient(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>导入 {importConfig?.name}</AlertDialogTitle>
            <AlertDialogDescription>{`⚠️请先关闭${importConfig?.app || "客户端"}的连接开关。`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { window.location.href = importUrl }}>导入 {importConfig?.name}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function AccountDocsPage() {
  React.useEffect(() => { window.location.replace("/docs/") }, [])
  return <PageLoading />
}

export function AccountWalletPage() {
  const navigate = useNavigate()
  const { data, error } = useCachedAccountData<WalletData>("/api/account/wallet")
  const [amount, setAmount] = React.useState("")
  const [paying, setPaying] = React.useState("")

  async function recharge(channelCode: "100" | "200") {
    const value = Number(amount)
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || value <= 0 || value > 10000) {
      toast.error("请输入 0.01 至 10,000.00 元，最多两位小数")
      return
    }
    setPaying(channelCode)
    try {
      const order = await postJson<PaymentOrder>("/api/wallet/recharge", {
        amount: value,
        channelCode,
        returnUrl: `${window.location.origin}/account/payment/result`,
      })
      clearJsonCache()
      if (order.status === "pending") window.dispatchEvent(new CustomEvent("payment-order-updated", { detail: { id: order.id, status: order.status } }))
      navigate(`/account/orders/${encodeURIComponent(order.id)}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建充值订单失败")
      setPaying("")
    }
  }

  if (!data) return error ? <p className="px-4 text-sm text-destructive lg:px-6">{error}</p> : <PageLoading />
  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <section className="grid gap-4 md:grid-cols-3" aria-label="钱包余额">
        <Card><CardHeader><CardDescription className="flex items-center gap-2"><Coins className="size-4" />充值余额<Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="充值余额说明"><CircleHelp /></Button></TooltipTrigger><TooltipContent className="max-w-64">用户主动充值所得；充值时累计 VIP，购买套餐时最后抵扣。</TooltipContent></Tooltip></CardDescription><CardTitle>{formatMoney(data.cashBalance)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription className="flex items-center gap-2"><Gift className="size-4" />赠送余额<Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="赠送余额说明"><CircleHelp /></Button></TooltipTrigger><TooltipContent className="max-w-64">后台赠送所得，不累计 VIP 和返利；购买套餐时优先抵扣。</TooltipContent></Tooltip></CardDescription><CardTitle>{formatMoney(data.giftBalance)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription className="flex items-center gap-2"><Percent className="size-4" />返利余额<Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="返利余额说明"><CircleHelp /></Button></TooltipTrigger><TooltipContent className="max-w-64">已结算的邀请返利，无需划转；购买套餐时在赠送余额之后抵扣。</TooltipContent></Tooltip></CardDescription><CardTitle>{formatMoney(data.referralBalance)}</CardTitle></CardHeader></Card>
      </section>
      {data.heldBalance ? <p className="text-sm text-muted-foreground">可用总额 {formatMoney(data.availableBalance)}，订单冻结中 {formatMoney(data.heldBalance)}</p> : null}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><WalletCards />充值余额</CardTitle><CardDescription>支持任意金额充值，充值成功后立即累计 VIP 成长值。</CardDescription></CardHeader>
        <CardContent><Field><FieldLabel htmlFor="recharge-amount">充值金额</FieldLabel><Input id="recharge-amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={event => setAmount(event.target.value)} disabled={Boolean(paying)} /><FieldDescription>单次充值范围 ¥0.01–¥10,000.00</FieldDescription><div className="flex flex-col gap-2 sm:flex-row"><Button type="button" onClick={() => recharge("100")} disabled={Boolean(paying) || !data.paymentMethods.alipay}>{paying === "100" ? <Loader2 className="animate-spin" /> : null}{data.paymentMethods.alipay ? "支付宝充值" : "支付宝维护中"}</Button><Button type="button" variant="outline" onClick={() => recharge("200")} disabled={Boolean(paying) || !data.paymentMethods.wechat}>{paying === "200" ? <Loader2 className="animate-spin" /> : null}{data.paymentMethods.wechat ? "微信充值" : "微信支付维护中"}</Button></div></Field></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>余额流水</CardTitle><CardDescription>充值、赠送、消费和返利都会保留不可删除的记录。</CardDescription></CardHeader>
        <CardContent>{data.entries.length ? <Table><TableHeader><TableRow><TableHead>时间</TableHead><TableHead>类型</TableHead><TableHead>说明</TableHead><TableHead>余额变动</TableHead><TableHead className="text-right">余额</TableHead></TableRow></TableHeader><TableBody>{data.entries.map(entry => { const delta = entry.cashDelta + entry.giftDelta + entry.referralDelta; return <TableRow key={entry.id}><TableCell>{formatDateTime(entry.createdAt)}</TableCell><TableCell><Badge variant="outline">{entry.type === "recharge" ? "充值" : entry.type === "purchase" ? "消费" : entry.type === "reward" ? "赠送" : entry.type === "referral" ? "返利" : entry.type === "reversal" ? "撤销" : "其他"}</Badge></TableCell><TableCell>{entry.description || "-"}</TableCell><TableCell className={delta >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-foreground"}>{delta >= 0 ? "+" : ""}{formatMoney(delta)}</TableCell><TableCell className="text-right">{formatMoney(entry.balance)}</TableCell></TableRow> })}</TableBody></Table> : <p className="text-sm text-muted-foreground">暂无余额流水</p>}</CardContent>
      </Card>
    </div>
  )
}

type ReferralReward = { id: string; sourceOrderId: string; rewardAmount: number; baseAmount: number; status: string; availableAt: string; createdAt: string }

function ReferralMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: React.ReactNode }) {
  return <Card><CardContent className="flex items-stretch gap-3"><span className="flex self-stretch min-w-12 items-center justify-center rounded-md bg-muted"><Icon className="size-6" /></span><span className="grid min-w-0 content-center gap-1"><span className="text-xs text-muted-foreground">{label}</span><strong className="text-base font-semibold">{value}</strong></span></CardContent></Card>
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false)
  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
    toast.success(`${label}已复制`)
  }
  return <div className="grid gap-2"><Label>{label}</Label><div className="flex gap-2"><Input value={value} readOnly /><Button type="button" variant="outline" onClick={() => void copy()}>{copied ? "已复制" : "复制"}</Button></div></div>
}

export function AccountReferralPage() {
  const [data, setData] = React.useState<{ code: string; invitedCount: number; referralBalance: number; pendingAmount: number; earnedAmount: number; referralRate: number; recurringReferral: boolean; rewards: ReferralReward[] } | null>(null)
  const load = React.useCallback(() => fetchJson<typeof data>("/api/account/referrals").then(setData), [])
  React.useEffect(() => { void load() }, [load])
  if (!data) return <PageLoading />
  const inviteUrl = `${window.location.origin}/register?ref=${data.code}`
  return <div className="grid gap-4 px-4 lg:px-6">
    <section className="grid gap-4 sm:grid-cols-2" aria-label="邀请返利统计">
      <ReferralMetric icon={Users} label="已注册用户数" value={`${data.invitedCount} 人`} />
      <ReferralMetric icon={Percent} label="佣金比例" value={`${data.referralRate}%`} />
      <ReferralMetric icon={Clock3} label="确认中的佣金" value={formatMoney(data.pendingAmount)} />
      <ReferralMetric icon={Coins} label="累计获得佣金" value={formatMoney(data.earnedAmount)} />
    </section>
    <Card><CardContent className="grid gap-4 pt-6 sm:grid-cols-2"><CopyValue label="邀请码" value={data.code} /><CopyValue label="邀请链接" value={inviteUrl} /></CardContent></Card>
    <Card><CardHeader><CardTitle>邀请返利</CardTitle><CardDescription>分享邀请码，邀请好友购买套餐后获得返利。</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-3"><Metric label="我的邀请码" value={data.code} /><Metric label="返利比例" value={`${data.referralRate}%${data.recurringReferral ? "（循环返利）" : "（首次购买）"}`} /><Metric label="返利余额" value={formatMoney(data.referralBalance)} description="已到账返利可在购买套餐时直接抵扣，无需划转。" /></CardContent></Card>
    <Card><CardHeader><CardTitle>返利明细</CardTitle></CardHeader><CardContent>{data.rewards.length ? <Table><TableHeader><TableRow><TableHead>来源订单</TableHead><TableHead>实际投入</TableHead><TableHead>返利金额</TableHead><TableHead>状态</TableHead><TableHead>到账时间</TableHead></TableRow></TableHeader><TableBody>{data.rewards.map(item => <TableRow key={item.id}><TableCell className="font-mono text-xs">{item.sourceOrderId}</TableCell><TableCell>{formatMoney(item.baseAmount)}</TableCell><TableCell>{formatMoney(item.rewardAmount)}</TableCell><TableCell><Badge variant={item.status === "available" ? "success" : "secondary"}>{item.status === "available" ? "已到账" : item.status === "pending" ? "审核中" : item.status}</Badge></TableCell><TableCell>{formatDateTime(item.availableAt)}</TableCell></TableRow>)}</TableBody></Table> : <p className="text-sm text-muted-foreground">暂无返利记录</p>}</CardContent></Card>
  </div>
}

export function AccountOrdersPage() {
  const { data: orders, error } = useCachedAccountData<PaymentOrder[]>("/api/account/orders")
  if (!orders) return error ? <p className="px-4 text-sm text-destructive lg:px-6">{error}</p> : <PageLoading />
  return <div className="px-4 lg:px-6"><Card className="contents md:flex"><CardHeader className="hidden md:grid"><CardTitle>订单记录</CardTitle><CardDescription>所有商品订单</CardDescription></CardHeader><CardContent className="px-0 md:px-6">{orders.length ? <OrdersTable orders={orders} /> : <p className="text-sm text-muted-foreground">仅展示2026年7月15日后的订单</p>}</CardContent></Card></div>
}

export function AccountOrderDetailPage() {
  const { id = "" } = useParams()
  const [order, setOrder] = React.useState<PaymentOrder | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [cancelling, setCancelling] = React.useState(false)
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [testOpen, setTestOpen] = React.useState(false)
  const [testStatus, setTestStatus] = React.useState("paid")
  const [settingTestStatus, setSettingTestStatus] = React.useState(false)
  const [now, setNow] = React.useState(Date.now())
  async function refresh(showToast = false) {
    setLoading(true)
    try {
      const nextOrder = await fetchJson<PaymentOrder>(`/api/payments/orders/${encodeURIComponent(id)}`)
      setOrder(nextOrder)
      if (nextOrder.paymentProvider === "test" && nextOrder.status === "pending") setTestOpen(true)
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
  async function cancelOrder() {
    setCancelling(true)
    try {
      const nextOrder = await deleteJson<PaymentOrder>(`/api/payments/orders/${encodeURIComponent(id)}`)
      setOrder(nextOrder)
      clearJsonCache()
      window.dispatchEvent(new Event("payment-order-updated"))
      toast.success("订单已关闭")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取消订单失败")
      await refresh()
    } finally {
      setCancelling(false)
      setCancelOpen(false)
    }
  }
  async function setLocalPaymentStatus() {
    setSettingTestStatus(true)
    try {
      const nextOrder = await putJson<PaymentOrder>(`/api/payments/orders/${encodeURIComponent(id)}/test-status`, { status: testStatus })
      setOrder(nextOrder)
      setTestOpen(false)
      clearJsonCache()
      window.dispatchEvent(new Event("payment-order-updated"))
      toast.success(`测试订单已设为${nextOrder.statusText}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试付款状态设置失败")
    } finally {
      setSettingTestStatus(false)
    }
  }
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
          {order.paymentError || order.fulfillmentError ? <PaymentOrderErrorAlert order={order} /> : null}
          <Separator />
          <div className="grid gap-3 sm:grid-cols-2">
            <OrderInfo label="套餐" value={`${order.planName} / ${order.optionLabel}`} />
            <OrderInfo label="订单金额" value={formatMoney(order.totalAmount ?? order.amount)} emphasis />
            {order.walletAmount ? <OrderInfo label="余额支付" value={formatMoney(order.walletAmount)} /> : null}
            {order.walletGiftAmount ? <OrderInfo label="赠送余额" value={formatMoney(order.walletGiftAmount)} /> : null}
            {order.walletReferralAmount ? <OrderInfo label="返利余额" value={formatMoney(order.walletReferralAmount)} /> : null}
            {order.walletCashAmount ? <OrderInfo label="充值余额" value={formatMoney(order.walletCashAmount)} /> : null}
            {order.walletAmount ? <OrderInfo label="第三方支付" value={formatMoney(order.amount)} /> : null}
            <OrderInfo label="创建时间" value={formatDateTime(order.createdAt)} />
            <OrderInfo label="支付时间" value={order.paidAt ? formatDateTime(order.paidAt) : "尚未支付"} />
          </div>
          {order.purpose !== "recharge" ? <>
            <Separator />
            <section className="grid gap-3"><h3 className="font-medium">商品快照</h3><ItemGroup className="sm:grid-cols-2">
              <OrderInfo label="购买类型" value={order.purchaseAction === "replace" ? "覆盖套餐" : order.purchaseAction === "extend" ? "续费" : order.purchaseAction === "add_on" ? "附加服务" : "新购"} />
              <OrderInfo label="基础商品" value={`${order.planName} / ${order.optionLabel}`} />
              {order.trafficGb ? <OrderInfo label="流量规格" value={`每月 ${order.trafficGb} GB`} /> : null}
              {order.trafficTierMarkupPercent && (order.trafficTier || 1) > 1 ? <OrderInfo label="流量定制计价" value={`每增加 ${order.trafficBaseGb} GB，加收周期原价的 ${order.trafficTierMarkupPercent}%`} /> : null}
              {(order.addOnSnapshots || []).map(addOn => <OrderInfo key={addOn.optionId} label="附加服务" value={`${addOn.name}${addOn.regionName ? ` · ${addOn.regionName}` : ""} · ${formatMoney(addOn.amount)}${addOn.durationDays ? ` / ${addOn.durationDays} 天` : ""}`} />)}
            </ItemGroup></section>
            <Separator />
            <section className="grid gap-3"><h3 className="font-medium">金额明细</h3><ItemGroup className="sm:grid-cols-2">
              <OrderInfo label="套餐基础价" value={formatMoney(order.baseAmount ?? order.originalAmount ?? order.totalAmount ?? order.amount)} />
              {(order.originalAmount || 0) > (order.baseAmount || order.originalAmount || 0) ? <OrderInfo label="流量定制加价" value={`+${formatMoney((order.originalAmount || 0) - (order.baseAmount || 0))}`} /> : null}
              {order.discountAmount ? <OrderInfo label={`优惠码${order.couponCode ? ` ${order.couponCode}` : ""}`} value={`-${formatMoney(order.discountAmount)}`} /> : null}
              {order.vipDiscountAmount ? <OrderInfo label="VIP 折扣" value={`-${formatMoney(order.vipDiscountAmount)}`} /> : null}
              {order.taxAmount ? <OrderInfo label="税费" value={`+${formatMoney(order.taxAmount)}`} /> : null}
              {order.addOnAmount ? <OrderInfo label="附加服务合计" value={`+${formatMoney(order.addOnAmount)}`} /> : null}
              <OrderInfo label="订单支付合计" value={formatMoney(order.totalAmount ?? order.amount)} emphasis />
            </ItemGroup></section>
            <Separator />
            <section className="grid gap-3"><h3 className="font-medium">处理记录</h3><ItemGroup className="sm:grid-cols-2">
              <OrderInfo label="创建订单" value={formatDateTime(order.createdAt)} />
              <OrderInfo label="支付确认" value={order.paidAt ? formatDateTime(order.paidAt) : "等待支付"} />
              <OrderInfo label="套餐发放" value={order.fulfilledAt ? formatDateTime(order.fulfilledAt) : order.fulfillmentStatus === "manual_pending" ? "基础套餐已发放，附加服务待人工交付" : order.fulfillmentStatus || "等待处理"} />
              <OrderInfo label="最后更新" value={order.updatedAt ? formatDateTime(order.updatedAt) : "-"} />
            </ItemGroup></section>
          </> : null}
        </CardContent>
        <CardFooter className="grid gap-2 sm:flex sm:flex-wrap">
          {order.status === "pending" && order.payUrl ? <Button asChild className="w-full sm:w-auto"><a href={order.payUrl} target="_blank" rel="noreferrer"><ExternalLink />打开支付页面</a></Button> : null}
          {order.status === "pending" && order.paymentProvider === "test" ? <Button className="w-full sm:w-auto" onClick={() => setTestOpen(true)}>设置测试付款状态</Button> : null}
          {order.status === "pending" ? <Button className="w-full sm:w-auto" variant="outline" onClick={() => refresh(true)} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}检测支付状态</Button> : null}
          {order.status === "pending" ? <Button className="w-full sm:w-auto" variant="destructive" onClick={() => setCancelOpen(true)} disabled={cancelling}><XCircle />取消订单</Button> : null}
          <BackButton fallback="/account/orders" className="w-full sm:ml-auto sm:w-auto" />
        </CardFooter>
      </Card>
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>取消这个订单？</AlertDialogTitle><AlertDialogDescription>订单将立即关闭，已冻结的账户余额会被释放。支付平台无法关闭旧支付链接，请勿再通过该链接付款。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={cancelling}>保留订单</AlertDialogCancel><AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={() => void cancelOrder()} disabled={cancelling}>{cancelling ? <Loader2 className="animate-spin" /> : <XCircle />}确认取消</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>测试付款</DialogTitle><DialogDescription>仅更新本地订单，不会向线上支付平台创建订单或扣款。</DialogDescription></DialogHeader>
          <RadioGroup value={testStatus} onValueChange={setTestStatus}>
            <Label className="flex items-center gap-3"><RadioGroupItem value="paid" />已支付</Label>
            <Label className="flex items-center gap-3"><RadioGroupItem value="failed" />支付失败</Label>
            <Label className="flex items-center gap-3"><RadioGroupItem value="closed" />已关闭</Label>
          </RadioGroup>
          <DialogFooter><DialogClose asChild><Button variant="outline" disabled={settingTestStatus}>取消</Button></DialogClose><Button onClick={() => void setLocalPaymentStatus()} disabled={settingTestStatus}>{settingTestStatus ? <Loader2 className="animate-spin" /> : null}确认状态</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function OrderInfo({ label, value, emphasis = false }: { label: string; value: React.ReactNode; emphasis?: boolean }) {
  return <Item variant="muted"><ItemContent><ItemDescription>{label}</ItemDescription><ItemTitle className={emphasis ? "text-lg" : "text-base"}>{value}</ItemTitle></ItemContent></Item>
}

function PaymentOrderErrorAlert({ order }: { order: PaymentOrder }) {
  if (order.fulfillmentError) return <Alert variant="error"><AlertCircle /><AlertTitle>{order.purpose === "recharge" ? "充值处理失败" : order.purpose === "traffic_pack" ? "流量包发放失败" : order.purpose === "addon" ? "附加服务处理失败" : "套餐发放失败"}</AlertTitle><AlertDescription><strong>支付已成功，款项已经扣除。</strong> <strong>{order.fulfillmentError}</strong> <strong>请勿再次下单。</strong> 请联系网页右下角的 <strong>在线客服</strong> 处理。</AlertDescription></Alert>
  return <Alert variant="error"><AlertCircle /><AlertTitle>支付处理失败</AlertTitle><AlertDescription>{order.paymentError}</AlertDescription></Alert>
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
  return <div className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6"><Card><CardHeader><CardTitle>账户资料</CardTitle><CardDescription>邮箱是你的唯一登录账号。</CardDescription></CardHeader><CardContent className="grid gap-4"><div className="grid gap-2"><Label htmlFor="profile-email">邮箱</Label><Input id="profile-email" value={email} disabled /></div><Metric label="注册时间" value={data ? formatDate(data.createdAt) : "-"} /></CardContent></Card><Card><CardHeader><CardTitle>修改密码</CardTitle><CardDescription>修改成功后当前设备需要重新登录，其他设备保持登录。</CardDescription></CardHeader><CardContent><form className="grid gap-4" onSubmit={submit} noValidate><div className="grid gap-2"><Label htmlFor="current-password">当前密码</Label><Input id="current-password" type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="new-password">新密码</Label><Input id="new-password" type="password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="confirm-password">确认新密码</Label><Input id="confirm-password" type="password" minLength={8} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></div><Button disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : null}保存密码</Button></form></CardContent></Card></div>
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
          <header className="grid gap-2"><h1 className="text-2xl font-semibold tracking-tight">支付成功 🎉</h1><p className="text-sm text-muted-foreground">{order.purpose === "recharge" ? "充值金额已存入账户余额" : order.purpose === "traffic_pack" ? "流量已加入当前周期" : order.purpose === "addon" ? "订单已进入人工交付流程" : "您的套餐已成功开通"}</p></header>
          <section className="grid gap-1" aria-label="支付信息"><strong className="text-4xl font-semibold tracking-tight">{formatMoney(order.totalAmount ?? order.amount)}</strong><p className="text-xs text-muted-foreground">已支付 · {order.planName} / {order.optionLabel}</p></section>
          <PaymentVipProgress order={order} />
          <Button asChild size="lg" className="w-full"><Link to={order.purpose === "recharge" ? "/account/wallet" : "/account"}>{order.purpose === "recharge" ? "查看账户余额 →" : order.purpose === "traffic_pack" ? "查看当前流量 →" : order.purpose === "addon" ? "查看附加服务 →" : "开始畅游网络 →"}</Link></Button>
        </CardContent>
      </Card>
    </div>
  )
  return <div className="px-4 lg:px-6"><Card className="mx-auto max-w-xl"><CardHeader className="text-center">{failed || error ? <AlertCircle className="mx-auto size-10" /> : <Clock3 className="mx-auto size-10" />}<CardTitle>{order?.statusText || "正在确认支付"}</CardTitle><CardDescription>{order?.optionLabel || "正在确认订单状态"}</CardDescription></CardHeader><CardContent className="grid gap-4">{order && error ? <PaymentOrderErrorAlert order={order} /> : null}<div className="flex justify-center gap-2"><Button onClick={refresh} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : null}刷新状态</Button><Button asChild variant="outline"><Link to="/account/orders">查看订单</Link></Button></div></CardContent></Card></div>
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

function Metric({ label, value, description }: { label: string; value: React.ReactNode; description?: string }) {
  return <div className="grid gap-1"><span className="flex items-center gap-1 text-sm text-muted-foreground">{label}{description ? <Tooltip><TooltipTrigger aria-label={`${label}说明`}><CircleHelp className="size-3.5" /></TooltipTrigger><TooltipContent>{description}</TooltipContent></Tooltip> : null}</span><strong className="text-sm font-medium">{value}</strong></div>
}

function OrdersTable({ orders }: { orders: PaymentOrder[] }) {
  return <><ItemGroup className="md:hidden">{orders.map(order => <OrderMobileItem key={order.id} amount={formatMoney(order.totalAmount ?? order.amount)} createdAt={order.createdAt} detailUrl={`/account/orders/${encodeURIComponent(order.id)}`} orderNumber={order.merOrderTid} product={`${order.planName} / ${order.optionLabel}`} status={order.statusText} statusVariant={order.status === "paid" ? "success" : order.status === "pending" ? "warning" : order.status === "failed" ? "destructive" : "secondary"} />)}</ItemGroup><div className="hidden md:block"><Table><TableHeader><TableRow><TableHead>订单</TableHead><TableHead>套餐</TableHead><TableHead>金额</TableHead><TableHead>状态</TableHead><TableHead>创建时间</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{orders.map(order => <TableRow key={order.id}><TableCell className="font-mono text-xs">{order.merOrderTid}</TableCell><TableCell>{order.planName} / {order.optionLabel}</TableCell><TableCell>{formatMoney(order.totalAmount ?? order.amount)}</TableCell><TableCell><Badge variant={order.status === "paid" ? "default" : "secondary"}>{order.statusText}</Badge></TableCell><TableCell>{formatDate(order.createdAt)}</TableCell><TableCell><div className="flex justify-end"><DataTableRowActions detail={<Button asChild variant="ghost" size="icon"><Link to={`/account/orders/${encodeURIComponent(order.id)}`} aria-label="查看订单详情"><Eye /></Link></Button>} /></div></TableCell></TableRow>)}</TableBody></Table></div></>
}
