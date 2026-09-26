import * as React from "react"
import { Link, Navigate, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom"
import { ArrowRight, ArrowUpRight, BadgeCheck, BookOpen, Check, CircleHelp, Clock3, Coins, Copy, ExternalLink, Eye, Gift, Info, Loader2, PackagePlus, Percent, Users, WalletCards, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { clearJsonCache, fetchCachedJson, fetchJson, getCachedJson, postJson, putJson } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { type CarouselApi, Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AccountVerificationIcon } from "@/components/features/account-verification-icon"
import { BentoButton } from "@/components/features/bento-button"
import { BentoCard, BentoGrid, bentoSpanClass, type BentoRowSpan, type BentoSpan } from "@/components/features/bento-card"
import { DataTableRowActions } from "@/components/features/data-table"
import { MarkdownContent } from "@/components/features/markdown-content"
import { OrderMobileItem } from "@/components/features/order-mobile-item"
import { VipBadge } from "@/components/features/vip-badge"
import { cn } from "@/lib/utils"
import { formatDate, formatDateTime, formatMoney, purchasedPlanName } from "@/utils"

import type { PaymentOrder } from "@/components/features/cashier-types"
type Subscription = { status: string; activeGroup: string; lineType?: "upstream" | "self_hosted"; planExpiresAt?: string; expiresAt: string; giftedDays?: number; purchasedAt: string; duration: string; traffic: string; planTrafficBytes?: number; unlimited?: boolean; trafficTier?: number; purchasedTrafficGb?: number; currentProductSnapshot?: Record<string, unknown>; devices: number | string; subscriptionUrl: string; vipLevel?: string }
type SelfHostedTraffic = { status: string; usedBytes: number; totalBytes: number; remainingBytes: number | null; usagePercent: number | null; connectedIpCount: number | null; ipLimit: number; nextResetAt: string; lastSyncedAt: string; dailyUsage: Array<{ date: string; usedBytes: number }>; stale?: boolean; error?: string }
type NodeStatusSummary = { configured: boolean; totalNodes: number; onlineNodes: number; offlineNodes: number; checkedAt: string }
type IpInfo = { ip: string; asn?: number; asOrganization?: string; country?: string; countryCode?: string; region?: string; regionCode?: string; city?: string; timezone?: string; fraudScore?: number; isResidential?: boolean; isBroadcast?: boolean }
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

  return <BentoButton variant={copied ? "success" : "outline"} aria-label={copied ? "订阅链接已复制" : "复制订阅链接"} onClick={copySubscription}><span className={copied ? "motion-safe:animate-[copy-success_180ms_ease-out]" : ""}>{copied ? <Check /> : <Copy />}</span>{copied ? "复制订阅成功" : "复制订阅链接"}</BentoButton>
}

function PersonalInfoCard({ account, span, rowSpan }: { account: Overview; span: BentoSpan; rowSpan: BentoRowSpan }) {
  const accountType = account.isSuperAccount ? "super" : account.isBusiness ? "business" : account.isFamilyFriend ? "family" : "regular"
  const vipTarget = account.vipSpend < 360 ? { level: "VIP 2", start: 0, amount: 360 } : account.vipSpend < 900 ? { level: "VIP 3", start: 360, amount: 900 } : null
  const vipProgress = vipTarget ? Math.min(100, Math.max(0, (account.vipSpend - vipTarget.start) / (vipTarget.amount - vipTarget.start) * 100)) : 100

  return <BentoCard span={span} rowSpan={rowSpan} title="个人信息" action={<Badge variant="outline" className="tabular-nums">ID #{account.customerID}</Badge>}>
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
  </BentoCard>
}

function NodeStatusCard({ status, error, span, rowSpan }: { status: NodeStatusSummary | null; error: string; span: BentoSpan; rowSpan: BentoRowSpan }) {
  const available = Boolean(status?.configured && status.checkedAt)
  const note = error ? "状态暂不可用" : !status ? "" : !status.configured ? "节点监控未配置" : "等待首次检测"
  return <BentoCard span={span} rowSpan={rowSpan} title="节点状态">
    <CardContent className="grid flex-1 content-end">
      {available ? <p className="flex flex-wrap items-baseline gap-x-1.5" title={status?.checkedAt ? `最近检测 ${formatDateTime(status.checkedAt)}` : undefined}><strong className="text-3xl font-semibold tabular-nums">{status?.onlineNodes}</strong><span className="text-sm text-muted-foreground tabular-nums">/ {status?.totalNodes} 在线 · 离线 {status?.offlineNodes}</span></p> : !status && !error ? <Skeleton className="h-9 w-24" /> : <p className="flex items-baseline gap-1.5"><strong className="text-3xl font-semibold">-</strong><span className="text-sm text-muted-foreground">{note}</span></p>}
    </CardContent>
  </BentoCard>
}

function DeviceLimitCard({ subscription, traffic, span, rowSpan }: { subscription: Subscription; traffic: SelfHostedTraffic | null; span: BentoSpan; rowSpan: BentoRowSpan }) {
  return <BentoCard span={span} rowSpan={rowSpan} title="可使用设备数">
    <CardContent className="grid flex-1 content-end">
      {traffic ? <p className="flex flex-wrap items-baseline gap-x-1.5"><strong className="text-3xl font-semibold tabular-nums">{traffic.connectedIpCount ?? "-"}</strong><span className="text-sm text-muted-foreground tabular-nums">/ {traffic.ipLimit || "不限"} 台在线</span></p>
        : <p className="flex items-baseline gap-1.5"><strong className="text-3xl font-semibold tabular-nums">{subscription.devices}</strong><span className="text-sm text-muted-foreground">台上限</span></p>}
    </CardContent>
  </BentoCard>
}

function IpInfoCard({ info, error, span, rowSpan }: { info: IpInfo | null; error: string; span: BentoSpan; rowSpan: BentoRowSpan }) {
  if (info) {
    const organization = info.asOrganization || ""
    const translatedOrganization = /(?:CHINANET|CHINA TELECOM|TELECOM)/i.test(organization)
      ? "中国电信"
      : /(?:CMNET|CHINA MOBILE|MOBILE)/i.test(organization)
        ? "中国移动"
        : /(?:CHINA UNICOM|UNICOM)/i.test(organization)
          ? "中国联通"
          : organization || "-"
    const countryNames: Record<string, string> = { CN: "中国", JP: "日本", US: "美国", HK: "中国香港", MO: "中国澳门", TW: "中国台湾", SG: "新加坡", KR: "韩国", GB: "英国", DE: "德国", FR: "法国", CA: "加拿大", AU: "澳大利亚" }
    const chinaRegions: Record<string, string> = { BJ: "北京市", SH: "上海市", GD: "广东省", ZJ: "浙江省", JS: "江苏省", SC: "四川省", HN: "湖南省", HB: "湖北省", SD: "山东省", FJ: "福建省" }
    const cityNames: Record<string, string> = { Tokyo: "东京", Shenzhen: "深圳", Guangzhou: "广州", Beijing: "北京", Shanghai: "上海", Singapore: "新加坡", Seoul: "首尔", London: "伦敦", Paris: "巴黎", Frankfurt: "法兰克福", "Los Angeles": "洛杉矶", "San Francisco": "旧金山", "New York": "纽约" }
    info = { ...info, asOrganization: translatedOrganization, country: info.countryCode ? countryNames[info.countryCode] || "" : "", region: info.countryCode === "CN" ? chinaRegions[info.regionCode || ""] || "" : "", city: info.city ? cityNames[info.city] || "" : "" }
  }
  return <BentoCard span={span} rowSpan={rowSpan} title="访问 IP">
    <CardContent>
      {error ? <Alert variant="warning"><Info /><AlertDescription>{error}</AlertDescription></Alert> : info ? <ItemGroup className="grid gap-2 sm:grid-cols-2">
        <Item variant="muted"><ItemContent><ItemDescription>IP 地址</ItemDescription><ItemTitle className="font-mono text-base">{info.ip}</ItemTitle></ItemContent></Item>
        <Item variant="muted"><ItemContent><ItemDescription>网络组织</ItemDescription><ItemTitle>{info.asOrganization || "-"}</ItemTitle></ItemContent></Item>
        <Item variant="muted"><ItemContent><ItemDescription>位置</ItemDescription><ItemTitle>{[info.country, info.region, info.city].filter(Boolean).join(" · ") || "-"}</ItemTitle></ItemContent></Item>
        <Item variant="muted"><ItemContent><ItemDescription>风险评分</ItemDescription><ItemTitle className="tabular-nums">{Number.isFinite(info.fraudScore) ? info.fraudScore : "-"}</ItemTitle></ItemContent></Item>
      </ItemGroup> : <div className="grid gap-2 sm:grid-cols-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}
    </CardContent>
  </BentoCard>
}

type PlanView = { subscription: Subscription | null; status: "active" | "expired" | "depleted" | "inactive"; trafficTotal: string; trafficUsed: string; usagePercent: number | null; remainingPercent: number | null }

function planView(subscription: Subscription | null, traffic: SelfHostedTraffic | null): PlanView {
  const usagePercent = subscription?.lineType === "self_hosted" ? traffic?.usagePercent ?? null : null
  const status = !subscription ? "inactive" : subscription.status === "expired" ? "expired" : traffic?.status === "depleted" ? "depleted" : "active"
  return {
    subscription: subscription?.status === "active" ? subscription : null,
    status,
    trafficTotal: traffic ? `${(traffic.totalBytes / 1024 ** 3).toFixed(0)} GB` : subscription?.traffic || "-",
    trafficUsed: traffic ? `${(traffic.usedBytes / 1024 ** 3).toFixed(2)} GB` : "-",
    usagePercent,
    remainingPercent: usagePercent == null ? null : Math.max(0, 100 - usagePercent),
  }
}

function PlanDetailsCard({ account, plan, span, rowSpan }: { account: Overview; plan: PlanView; span: BentoSpan; rowSpan: BentoRowSpan }) {
  const { subscription, status } = plan
  // Plan-only figures: traffic packs and admin gifts show in the traffic usage card, not here.
  const planTrafficGb = subscription?.planTrafficBytes ? Number((subscription.planTrafficBytes / 1024 ** 3).toFixed(2)) : 0
  const planQuota = subscription?.unlimited ? "不限" : planTrafficGb ? `${planTrafficGb}GB${subscription?.duration === "lifetime" ? "" : "/月"}` : subscription?.traffic || "-"
  const canBuyHomeIp = account.homeIp?.enabled && status === "active" && subscription?.duration !== "lifetime"
  const homeIpStartingPrice = Math.min(...(account.homeIp?.regions || []).map(region => Number(region.price)).filter(Number.isFinite))
  const expiresAtTime = Date.parse(subscription?.expiresAt || "")
  const remainingDays = Number.isFinite(expiresAtTime) ? Math.max(0, Math.ceil((expiresAtTime - Date.now()) / 86400000)) : null

  return <BentoCard id="subscription" tone="yellow" span={span} rowSpan={rowSpan} className="scroll-mt-16" title="套餐详情">
    <CardContent className="flex flex-1 flex-col justify-between gap-4">
      <p className="-mt-4 truncate text-3xl font-semibold">{subscription ? purchasedPlanName(subscription, [], subscription.planTrafficBytes || null) : "暂无套餐"}</p>
      {subscription ? <div className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          {subscription.duration === "lifetime" ? <p className="text-4xl font-semibold">永久有效</p> : <p className="flex items-baseline gap-2"><strong className="text-4xl font-semibold tabular-nums">{remainingDays ?? "-"}</strong><span className="text-sm">天后到期</span></p>}
          <div className="grid text-sm text-muted-foreground tabular-nums sm:text-right">
            <p>到期日期 {formatDate(subscription.expiresAt)}{subscription.giftedDays ? `（已赠送 ${subscription.giftedDays} 天）` : ""}</p>
            <p>流量配额 {planQuota}</p>
          </div>
        </div>
        {canBuyHomeIp ? <BentoButton asChild size="lg" className="h-auto w-full justify-between py-3 whitespace-normal"><Link to="/account/plans/checkout?product=home-ip"><span className="text-left">AI被降智？定制纯净家宽 IP{Number.isFinite(homeIpStartingPrice) ? ` · ${formatMoney(homeIpStartingPrice)} 起` : ""}</span><ArrowUpRight className="size-5 text-white" strokeWidth={2.5} aria-hidden /></Link></BentoButton> : null}
      </div> : <div className="grid gap-4">
        <p className="text-sm">开通套餐后，这里会显示到期时间、流量配额和可使用设备数。</p>
        <BentoButton asChild size="lg" className="w-fit"><Link to="/account/plans"><PackagePlus />购买服务</Link></BentoButton>
      </div>}
    </CardContent>
  </BentoCard>
}

function TrafficUsageCard({ plan, trafficLoading, trafficError, nextResetAt, span, rowSpan }: { plan: PlanView; trafficLoading: boolean; trafficError: string; nextResetAt?: string; span: BentoSpan; rowSpan: BentoRowSpan }) {
  const { subscription, usagePercent, remainingPercent, trafficTotal, trafficUsed } = plan
  const remaining = <p className="flex items-baseline gap-1.5"><strong className="text-3xl font-semibold tabular-nums">{remainingPercent == null ? subscription?.unlimited ? "不限" : trafficLoading ? "同步中" : "-" : `${Math.round(remainingPercent)}%`}</strong>{remainingPercent == null || subscription?.unlimited ? null : <span className="text-sm text-muted-foreground">剩余</span>}</p>
  return <BentoCard tone="green" span={span} rowSpan={rowSpan} title="流量使用" action={remaining}>
    <CardContent className="grid flex-1 content-end gap-2">
      <Progress value={usagePercent ?? 0} aria-label={usagePercent == null ? "流量用量暂不可用" : `已使用流量 ${Math.round(usagePercent)}%`} />
      {trafficError ? <p className="truncate text-xs text-muted-foreground" title={trafficError}>流量同步暂不可用：{trafficError}</p>
        : <p className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground"><span className="tabular-nums">已用 {trafficUsed} / {subscription?.unlimited ? "不限" : trafficTotal}</span>{nextResetAt ? <span>{formatDate(nextResetAt)} 重置</span> : null}</p>}
    </CardContent>
  </BentoCard>
}

function SubscriptionLinkCard({ subscriptionUrl, onImportClient, span, rowSpan }: { subscriptionUrl: string; onImportClient: (client: ImportClient) => void; span: BentoSpan; rowSpan: BentoRowSpan }) {
  return <BentoCard span={span} rowSpan={rowSpan} title="订阅链接">
    <CardContent>
      <Field>
        <FieldLabel htmlFor="subscription-url">订阅地址</FieldLabel>
        <span className="block rounded-4xl bg-[linear-gradient(90deg,var(--chart-1),var(--chart-2),var(--chart-3),var(--chart-4),var(--chart-5))] p-0.5"><Input id="subscription-url" className="h-11 rounded-4xl border-0 bg-background px-4 font-semibold shadow-none dark:bg-background" readOnly value={subscriptionUrl} /></span>
        <FieldDescription>请勿将订阅链接分享给其他人。</FieldDescription>
        <div className="grid gap-2 sm:flex sm:flex-wrap [&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-auto">
          <CopySubscription value={subscriptionUrl} />
          <BentoButton variant="outline" onClick={() => onImportClient("shadowrocket")}><ExternalLink />导入 Shadowrocket</BentoButton>
          <BentoButton variant="outline" onClick={() => onImportClient("sparkle")}><ExternalLink />导入 Sparkle</BentoButton>
          <BentoButton variant="outline" onClick={() => onImportClient("clash-meta")}><ExternalLink />导入 Clash Meta</BentoButton>
          <BentoButton variant="outline" onClick={() => onImportClient("clash-verge")}><ExternalLink />导入 Clash Verge</BentoButton>
          <BentoButton asChild variant="outline"><Link to="/account/docs"><BookOpen />查看使用教程</Link></BentoButton>
        </div>
      </Field>
    </CardContent>
  </BentoCard>
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
  const [ipInfo, setIpInfo] = React.useState<IpInfo | null>(null)
  const [ipInfoError, setIpInfoError] = React.useState("")
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

  React.useEffect(() => {
    let active = true
    fetchJson<IpInfo>("/api/account/ip-info")
      .then(value => { if (active) { setIpInfo(value); setIpInfoError("") } })
      .catch(error => { if (active) setIpInfoError(error instanceof Error ? error.message : "IP 信息获取失败") })
    return () => { active = false }
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

  if (!data) return error ? <p className="text-sm text-destructive">{error}</p> : <PageLoading />
  const subscription = data.subscription
  const hasTrafficDetails = subscription?.lineType === "self_hosted"
  const plan = planView(subscription, selfHostedTraffic)
  const hasAnnouncements = data.announcements.length > 0
  // With a plan: plan 4x2 on the left; traffic 4x1 on the right above devices 2x1 and nodes 2x1.
  const nodeSpan: BentoSpan = plan.subscription ? 2 : 4
  const subscriptionLinkSpan: BentoSpan = hasAnnouncements ? 5 : 8
  const announcementSpan: BentoSpan = plan.subscription ? 3 : 8
  const [emailLocal, emailDomain] = data.email.split(/@(.*)/)
  const importConfig = importClient ? importClients[importClient] : null
  const importUrl = subscription && importConfig ? `${importConfig.scheme}${encodeURIComponent(subscription.subscriptionUrl)}` : ""
  return (
    <>
      <div className="grid gap-4">
        <Alert variant="warning"><CircleHelp /><AlertDescription className="flex w-full flex-row flex-wrap items-center justify-between gap-3"><span>遇到问题？发送工单联系客服吧！</span><Button asChild variant="link" size="sm" className="h-auto shrink-0 p-0 underline underline-offset-4"><Link to="/account/tickets/new">发送工单</Link></Button></AlertDescription></Alert>
        <BentoGrid>
          <section className={cn(bentoSpanClass(8, 2), "flex min-w-0 flex-col justify-center gap-6 py-4")} aria-labelledby="account-greeting">
            <h2 id="account-greeting" className="text-4xl font-semibold tracking-tight wrap-anywhere lg:text-5xl">hello, {emailLocal}{emailDomain ? <><wbr />@{emailDomain}</> : null}!</h2>
            <div className="flex flex-wrap gap-2">
              <BentoButton asChild size="lg"><Link to="/account/plans">购买服务<ArrowRight /></Link></BentoButton>
              <BentoButton asChild size="lg" variant="outline"><Link to="/account/docs"><BookOpen />查看使用教程</Link></BentoButton>
            </div>
          </section>
          <PlanDetailsCard account={data} plan={plan} span={4} rowSpan={2} />
          {plan.subscription ? <>
            <TrafficUsageCard plan={plan} trafficLoading={trafficLoading} trafficError={trafficError} nextResetAt={selfHostedTraffic?.nextResetAt} span={4} rowSpan={1} />
            <DeviceLimitCard subscription={plan.subscription} traffic={selfHostedTraffic} span={2} rowSpan={1} />
          </> : null}
          <NodeStatusCard status={nodeStatus} error={nodeStatusError} span={nodeSpan} rowSpan={plan.subscription ? 1 : 2} />
          <PersonalInfoCard account={data} span={4} rowSpan={2} />
          <IpInfoCard info={ipInfo} error={ipInfoError} span={4} rowSpan={2} />
          {plan.subscription ? <SubscriptionLinkCard subscriptionUrl={plan.subscription.subscriptionUrl} onImportClient={setImportClient} span={subscriptionLinkSpan} rowSpan={3} /> : null}
          {hasAnnouncements ? <BentoCard span={announcementSpan} rowSpan={3} className="md:col-span-8" title="网站公告">
            <CardContent>
              <Carousel opts={{ loop: data.announcements.length > 1 }} setApi={setCarouselApi} aria-label="网站公告">
                <CarouselContent>
                  {data.announcements.map(announcement => <CarouselItem key={announcement.id}><Item asChild variant="muted"><article role="button" tabIndex={0} className="grid cursor-pointer gap-3 hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" onClick={() => viewAnnouncement(announcement)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); viewAnnouncement(announcement) } }}><header className="grid gap-1"><h3 className="font-medium">{announcement.title}</h3><time className="text-sm text-muted-foreground" dateTime={announcement.publishedAt}>{formatDateTime(announcement.publishedAt)}</time></header><MarkdownContent content={announcement.content} className="line-clamp-2 max-h-14 overflow-hidden" /></article></Item></CarouselItem>)}
                </CarouselContent>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <BentoButton variant="outline" onClick={() => { if (currentAnnouncement) viewAnnouncement(currentAnnouncement) }}><Eye />查看公告</BentoButton>
                  {data.announcements.length > 1 ? <div className="flex gap-2"><CarouselPrevious className="static translate-y-0" /><CarouselNext className="static translate-y-0" /></div> : null}
                </div>
              </Carousel>
            </CardContent>
          </BentoCard> : null}
          {hasTrafficDetails ? selfHostedTraffic ? <React.Suspense fallback={<Skeleton className={cn(bentoSpanClass(8, 3), "h-72 rounded-4xl xl:h-auto")} />}><AccountTrafficChart span={8} rowSpan={3} data={selfHostedTraffic.dailyUsage} /></React.Suspense> : <Skeleton className={cn(bentoSpanClass(8, 3), "h-72 rounded-4xl xl:h-auto")} /> : null}
        </BentoGrid>
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
  const [paying, setPaying] = React.useState(false)

  async function recharge() {
    const value = Number(amount)
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || value <= 0 || value > 10000) {
      toast.error("请输入 0.01 至 10,000.00 元，最多两位小数")
      return
    }
    setPaying(true)
    try {
      const order = await postJson<PaymentOrder>("/api/wallet/recharge", { amount: value })
      clearJsonCache()
      window.dispatchEvent(new CustomEvent("payment-order-updated", { detail: { id: order.id, status: order.status } }))
      navigate(`/cashier/${encodeURIComponent(order.id)}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建充值订单失败")
      setPaying(false)
    }
  }

  if (!data) return error ? <p className="px-4 text-sm text-destructive lg:px-6">{error}</p> : <PageLoading />
  return (
    <div className="grid gap-4">
      <section className="grid gap-4 md:grid-cols-3" aria-label="钱包余额">
        <Card><CardHeader><CardDescription className="flex items-center gap-2"><Coins className="size-4" />充值余额<Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="充值余额说明"><CircleHelp /></Button></TooltipTrigger><TooltipContent className="max-w-64">用户主动充值所得；充值时累计 VIP，购买套餐时最后抵扣。</TooltipContent></Tooltip></CardDescription><CardTitle>{formatMoney(data.cashBalance)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription className="flex items-center gap-2"><Gift className="size-4" />赠送余额<Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="赠送余额说明"><CircleHelp /></Button></TooltipTrigger><TooltipContent className="max-w-64">后台赠送所得，不累计 VIP 和返利；购买套餐时优先抵扣。</TooltipContent></Tooltip></CardDescription><CardTitle>{formatMoney(data.giftBalance)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription className="flex items-center gap-2"><Percent className="size-4" />返利余额<Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="返利余额说明"><CircleHelp /></Button></TooltipTrigger><TooltipContent className="max-w-64">已结算的邀请返利，无需划转；购买套餐时在赠送余额之后抵扣。</TooltipContent></Tooltip></CardDescription><CardTitle>{formatMoney(data.referralBalance)}</CardTitle></CardHeader></Card>
      </section>
      {data.heldBalance ? <p className="text-sm text-muted-foreground">可用总额 {formatMoney(data.availableBalance)}，订单冻结中 {formatMoney(data.heldBalance)}</p> : null}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><WalletCards />充值余额</CardTitle><CardDescription>支持任意金额充值，充值成功后立即累计 VIP 成长值。</CardDescription></CardHeader>
        <CardContent><Field><FieldLabel htmlFor="recharge-amount">充值金额</FieldLabel><Input id="recharge-amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={event => setAmount(event.target.value)} disabled={paying} /><FieldDescription>单次充值范围 ¥0.01–¥10,000.00，下一步在收银台选择支付宝或微信付款。</FieldDescription><Button type="button" className="min-h-11 sm:w-fit" onClick={() => void recharge()} disabled={paying || !(data.paymentMethods.alipay || data.paymentMethods.wechat)}>{paying ? <Loader2 className="animate-spin" /> : null}{data.paymentMethods.alipay || data.paymentMethods.wechat ? "去付款" : "在线充值维护中"}</Button></Field></CardContent>
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

// Every order is paid and tracked in the cashier; these routes keep old links working.
export function AccountOrderDetailPage() {
  const { id = "" } = useParams()
  return <Navigate to={`/cashier/${encodeURIComponent(id)}`} replace />
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
  return <Navigate to={orderId ? `/cashier/${encodeURIComponent(orderId)}` : "/account/orders"} replace />
}

function Metric({ label, value, description }: { label: string; value: React.ReactNode; description?: string }) {
  return <div className="grid gap-1"><span className="flex items-center gap-1 text-sm text-muted-foreground">{label}{description ? <Tooltip><TooltipTrigger aria-label={`${label}说明`}><CircleHelp className="size-3.5" /></TooltipTrigger><TooltipContent>{description}</TooltipContent></Tooltip> : null}</span><strong className="text-sm font-medium">{value}</strong></div>
}

function OrdersTable({ orders }: { orders: PaymentOrder[] }) {
  return <><ItemGroup className="md:hidden">{orders.map(order => <OrderMobileItem key={order.id} amount={formatMoney(order.totalAmount ?? order.amount)} createdAt={order.createdAt} detailUrl={`/account/orders/${encodeURIComponent(order.id)}`} orderNumber={order.merOrderTid} product={`${order.planName} / ${order.optionLabel}`} status={order.statusText} statusVariant={order.status === "paid" ? "success" : order.status === "pending" ? "warning" : order.status === "failed" ? "destructive" : "secondary"} />)}</ItemGroup><div className="hidden md:block"><Table><TableHeader><TableRow><TableHead>订单</TableHead><TableHead>套餐</TableHead><TableHead>金额</TableHead><TableHead>状态</TableHead><TableHead>创建时间</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{orders.map(order => <TableRow key={order.id}><TableCell className="font-mono text-xs">{order.merOrderTid}</TableCell><TableCell>{order.planName} / {order.optionLabel}</TableCell><TableCell>{formatMoney(order.totalAmount ?? order.amount)}</TableCell><TableCell><Badge variant={order.status === "paid" ? "default" : "secondary"}>{order.statusText}</Badge></TableCell><TableCell>{formatDate(order.createdAt)}</TableCell><TableCell><div className="flex justify-end"><DataTableRowActions detail={<Button asChild variant="ghost" size="icon"><Link to={`/account/orders/${encodeURIComponent(order.id)}`} aria-label="查看订单详情"><Eye /></Link></Button>} /></div></TableCell></TableRow>)}</TableBody></Table></div></>
}
