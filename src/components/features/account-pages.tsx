import * as React from "react"
import { Link, Navigate, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom"
import { ArrowRight, ArrowUpRight, BadgeCheck, Banknote, BookOpen, CalendarDays, Check, ChevronDown, CircleHelp, Clock3, Coins, Copy, ExternalLink, Eye, Gift, Globe, Loader2, MapPin, PackagePlus, Percent, RefreshCw, type LucideIcon } from "lucide-react"
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemGroup } from "@/components/ui/item"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AccountVerificationIcon } from "@/components/features/account-verification-icon"
import type { AccountNodeUsage } from "@/components/features/account-traffic-chart"
import { BentoButton, BentoIconLink } from "@/components/features/bento-button"
import { BentoCard, BentoCardBadge, BentoGrid, bentoSpanClass, type BentoRowSpan, type BentoSpan } from "@/components/features/bento-card"
import { DataTableRowActions } from "@/components/features/data-table"
import { MarkdownContent } from "@/components/features/markdown-content"
import { OrderMobileItem } from "@/components/features/order-mobile-item"
import { ProgressRing } from "@/components/features/progress-ring"
import { CopyButton, EmptyState } from "@/components/features/shared"
import { nextVipTier, vipLevelLabel, type VipTier } from "@/components/features/vip-badge"
import { DOCS_URL } from "@/lib/docs-site"
import { cn } from "@/lib/utils"
import { formatDate, formatDateTime, formatMoney, orderProductLabel, purchasedPlanParts } from "@/utils"

import type { PaymentOrder } from "@/components/features/cashier-types"
type Subscription = { status: string; activeGroup: string; lineGroupId?: string; lineType?: "upstream" | "self_hosted"; planExpiresAt?: string; expiresAt: string; giftedDays?: number; purchasedAt: string; duration: string; traffic: string; planTrafficBytes?: number; unlimited?: boolean; trafficTier?: number; purchasedTrafficGb?: number; currentProductSnapshot?: Record<string, unknown>; devices: number | string; subscriptionUrl: string; vipLevel?: string; productName?: string; renewal?: { optionId: string; trafficTier: number } | null }
type SelfHostedTraffic = { status: string; usedBytes: number; totalBytes: number; remainingBytes: number | null; usagePercent: number | null; connectedIpCount: number | null; ipLimit: number; nextResetAt: string; lastSyncedAt: string; nodeUsage: AccountNodeUsage; stale?: boolean; error?: string }
type NodeStatusSummary = { configured: boolean; totalNodes: number; onlineNodes: number; offlineNodes: number; checkedAt: string }
type IpInfo = { ip: string; asn?: number; asOrganization?: string; country?: string; countryCode?: string; region?: string; regionCode?: string; city?: string; timezone?: string; fraudScore?: number; isResidential?: boolean; isBroadcast?: boolean }
// Docs-site announcements carry `url`: `content` is then only their summary and the full text lives on the docs site.
type Announcement = { id: string; title: string; content: string; publishedAt: string; url?: string }
type AccountService = { id: string; orderId: string; name: string; regionName?: string; amount: number; durationDays?: number; startedAt: string; expiresAt?: string; status: "pending" | "processing" | "active" | "expired"; deliveryNote?: string }
type Overview = { customerID: number; email: string; createdAt: string; isBusiness: boolean; isFamilyFriend: boolean; isSuperAccount: boolean; vipLevel: string; vipSpend: number; vipDiscountPercent: number; vipTiers?: VipTier[]; wallet: Omit<WalletData, "entries">; referral: { rate: number; invitedCount: number }; subscription: Subscription | null; services: AccountService[]; trafficPack?: { trafficGb: number; price: number; enabled: boolean }; homeIp?: { enabled: boolean; regions: Array<{ id: string; name: string; price: number }> }; orders: PaymentOrder[]; announcements: Announcement[] }
type WalletEntry = { id: string; type: string; cashDelta: number; giftDelta: number; referralDelta: number; realCashDelta?: number; virtualCashDelta?: number; vipDelta: number; balance: number; description: string; createdAt: string }
type WalletData = { balance: number; cashBalance: number; giftBalance: number; referralBalance: number; realCashBalance?: number; virtualCashBalance?: number; availableRealCashBalance?: number; availableVirtualCashBalance?: number; availableBalance: number; heldBalance: number; vipSpend: number; paymentMethods: { alipay: boolean; wechat: boolean }; entries: WalletEntry[] }
// Local development cannot resolve a loopback address, so the overview shows this sample instead of an error.
const devSampleIpInfo: IpInfo = { ip: "203.0.113.42", asn: 4134, asOrganization: "CHINANET", countryCode: "CN", regionCode: "GD", city: "Shenzhen", timezone: "Asia/Shanghai" }
type ImportClient = "shadowrocket" | "sparkle" | "clash-meta" | "clash-verge"

const AccountTrafficChart = React.lazy(() => import("@/components/features/account-traffic-chart").then(module => ({ default: module.AccountTrafficChart })))

const importClients: Record<ImportClient, { name: string; app: string; label: string; platform: string; scheme: string }> = {
  shadowrocket: { name: "Shadowrocket", app: "小火箭", label: "Shadowrocket", platform: "iOS", scheme: "shadowrocket://add/" },
  sparkle: { name: "Sparkle", app: "Sparkle", label: "Sparkle", platform: "桌面端", scheme: "mihomo://install-config?url=" },
  "clash-meta": { name: "Clash Meta for Android", app: "Clash Meta", label: "Clash Meta", platform: "Android", scheme: "clash://install-config?url=" },
  "clash-verge": { name: "Clash Verge Rev", app: "Clash Verge Rev", label: "Clash Verge", platform: "桌面端", scheme: "clash://install-config?url=" },
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

  return <BentoButton variant={copied ? "success" : "default"} aria-label={copied ? "订阅链接已复制" : "复制订阅链接"} onClick={copySubscription}><span className={copied ? "motion-safe:animate-[copy-success_180ms_ease-out]" : ""}>{copied ? <Check /> : <Copy />}</span>{copied ? "复制订阅成功" : "复制订阅链接"}</BentoButton>
}

function ProfileCard({ account, ipInfo, ipInfoError, span, rowSpan, className }: { account: Overview; ipInfo: IpInfo | null; ipInfoError: string; span: BentoSpan; rowSpan: BentoRowSpan; className?: string }) {
  const accountType = account.isSuperAccount ? "super" : account.isBusiness ? "business" : account.isFamilyFriend ? "family" : "regular"
  const ipValue = (value: string) => ipInfo ? value : ipInfoError ? <span className="text-muted-foreground" title={ipInfoError}>暂不可用</span> : <Skeleton className="ml-auto h-5 w-24" />
  const location = ipInfo ? ipLocation(ipInfo) : ""
  const details: Array<{ label: string; icon: LucideIcon; value: React.ReactNode; title?: string }> = [
    { label: "注册时间", icon: CalendarDays, value: formatDate(account.createdAt) },
    { label: "IP", icon: Globe, value: ipValue(ipInfo?.ip || ""), title: ipInfo?.ip },
    { label: "位置", icon: MapPin, value: ipValue(location), title: location || undefined },
  ]
  const vipTiers = account.vipTiers || []
  const nextTier = nextVipTier(vipTiers, account.vipSpend)
  const tierStart = Math.max(0, ...vipTiers.filter(tier => tier.minSpend <= account.vipSpend).map(tier => tier.minSpend))
  const vipTarget = nextTier ? { level: vipLevelLabel(nextTier.level), start: tierStart, amount: nextTier.minSpend } : null
  const vipProgress = vipTarget ? Math.min(100, Math.max(0, (account.vipSpend - vipTarget.start) / (vipTarget.amount - vipTarget.start) * 100)) : 100
  const currentLevel = vipLevelLabel(account.vipLevel)

  // Personal details on the left, VIP progress on the right; they stack with a horizontal divider on phones.
  // VIP discount sits in the header like the referral badge on the invite card; hovering or focusing it lists every tier.
  const vipDiscountBadge = <Tooltip><TooltipTrigger asChild><button type="button" className="rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none" aria-label={`专属折扣 ${account.vipDiscountPercent}%，查看各级 VIP 折扣`}><BentoCardBadge tone="green" icon={Percent}>专属折扣 {account.vipDiscountPercent}%</BentoCardBadge></button></TooltipTrigger><TooltipContent>{vipTiers.map(tier => `${vipLevelLabel(tier.level)}：${tier.discountPercent}%`).join(" · ")}</TooltipContent></Tooltip>
  return <BentoCard span={span} rowSpan={rowSpan} className={className} title="个人信息" action={vipDiscountBadge}>
    <CardContent className="flex flex-1 flex-col gap-4 sm:flex-row">
      <div className="grid min-w-0 flex-1 content-between gap-3 sm:flex-[3]">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar size="lg" className="data-[size=lg]:size-12"><AvatarFallback className="bg-slate-600 text-base font-semibold text-white dark:bg-slate-500">{account.email.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
          <div className="grid min-w-0 flex-1 gap-0.5">
            <p className="flex min-w-0 items-center gap-1.5 font-semibold"><span className="truncate" title={account.email}>{account.email}</span><AccountVerificationIcon type={accountType} /></p>
            <p className="text-sm text-muted-foreground tabular-nums">ID #{account.customerID}</p>
          </div>
        </div>
        <Item className="rounded-2xl bg-background px-3 py-2">
          <dl className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
            {details.map(({ label, icon: Icon, value, title }) => <React.Fragment key={label}><dt className="flex items-center gap-1.5 text-muted-foreground"><Icon className="size-4" aria-hidden />{label}</dt><dd className="truncate text-right font-medium tabular-nums" title={title}>{value}</dd></React.Fragment>)}
          </dl>
        </Item>
      </div>
      <Separator className="sm:hidden" />
      <Separator orientation="vertical" className="hidden sm:block data-[orientation=vertical]:h-auto" />
      <section aria-label="VIP 等级" className="grid min-w-0 content-between justify-items-center gap-1 text-center sm:flex-[2]">
        <ProgressRing value={vipProgress} size={100} sweep={270} className="text-bento-green-strong" label={vipTarget ? `距离 ${vipTarget.level} 已完成 ${Math.round(vipProgress)}%` : "已达到最高 VIP 等级"}>
          <strong className="text-2xl font-semibold">{currentLevel}</strong>
        </ProgressRing>
        <div className="grid text-xs text-muted-foreground tabular-nums">
          <span>累计消费 <span className="font-medium text-foreground">{formatMoney(account.vipSpend)}</span></span>
          <span>{vipTarget ? `距离 ${vipTarget.level} 还差 ${formatMoney(vipTarget.amount - account.vipSpend)}` : "已达到最高等级"}</span>
        </div>
      </section>
    </CardContent>
  </BentoCard>
}

// Placeholder ad slot: promotes the referral program until real ad content is wired in.
// Hidden for now (SHOW_PROMO_SLOT); the greeting spans the full row while it is off.
const SHOW_PROMO_SLOT = false
function PromoCard({ span, rowSpan, className }: { span: BentoSpan; rowSpan: BentoRowSpan; className?: string }) {
  return <BentoCard tone="green" span={span} rowSpan={rowSpan} className={className} title="邀请好友，一起加速" action={<Badge variant="outline" className="border-transparent bg-white/60">推荐</Badge>}>
    <CardContent className="flex flex-1 flex-col justify-between gap-4">
      <p className="text-sm">好友通过你的邀请码购买套餐后，返利会直接计入你的钱包，购买时可抵扣。</p>
      <BentoButton asChild className="w-fit"><Link to="/account/referrals"><Gift />获取邀请码</Link></BentoButton>
    </CardContent>
  </BentoCard>
}

function NodeStatusCard({ status, error, inactive, span, rowSpan }: { status: NodeStatusSummary | null; error: string; inactive: boolean; span: BentoSpan; rowSpan: BentoRowSpan }) {
  const available = !inactive && Boolean(status?.configured && status.checkedAt)
  const note = inactive ? "当前线路暂不支持" : error ? "状态暂不可用" : !status ? "" : !status.configured ? "节点监控未配置" : "等待首次检测"
  return <BentoCard span={span} rowSpan={rowSpan} title="节点状态">
    <CardContent className="flex flex-1 items-end justify-between gap-3">
      {available ? <p className="flex flex-wrap items-baseline gap-x-1.5" title={status?.checkedAt ? `最近检测 ${formatDateTime(status.checkedAt)}` : undefined}><strong className="text-3xl font-semibold tabular-nums">{status?.onlineNodes}</strong><span className="text-sm text-muted-foreground tabular-nums">/ {status?.totalNodes} 在线</span></p> : !inactive && !status && !error ? <Skeleton className="h-9 w-24" /> : <p className="flex min-w-0 items-baseline gap-1.5"><strong className="text-3xl font-semibold">-</strong><span className="truncate text-sm text-muted-foreground">{note}</span></p>}
      {inactive ? null : <BentoIconLink to="/account/nodes" label="查看节点状态" icon={Eye} />}
    </CardContent>
  </BentoCard>
}

function DeviceLimitCard({ subscription, traffic, span, rowSpan }: { subscription: Subscription; traffic: SelfHostedTraffic | null; span: BentoSpan; rowSpan: BentoRowSpan }) {
  return <BentoCard span={span} rowSpan={rowSpan} title="在线IP数量">
    <CardContent className="grid flex-1 content-end">
      {traffic ? <p className="flex flex-wrap items-baseline gap-x-1.5"><strong className="text-3xl font-semibold tabular-nums">{traffic.connectedIpCount ?? "-"}</strong><span className="text-sm text-muted-foreground tabular-nums">/ {traffic.ipLimit || "不限"} 在线</span></p>
        : <p className="flex items-baseline gap-1.5"><strong className="text-3xl font-semibold tabular-nums">{subscription.devices}</strong><span className="text-sm text-muted-foreground">上限</span></p>}
    </CardContent>
  </BentoCard>
}

const ipCountryNames: Record<string, string> = { CN: "中国", JP: "日本", US: "美国", HK: "中国香港", MO: "中国澳门", TW: "中国台湾", SG: "新加坡", KR: "韩国", GB: "英国", DE: "德国", FR: "法国", CA: "加拿大", AU: "澳大利亚" }
const ipChinaRegions: Record<string, string> = { BJ: "北京市", SH: "上海市", GD: "广东省", ZJ: "浙江省", JS: "江苏省", SC: "四川省", HN: "湖南省", HB: "湖北省", SD: "山东省", FJ: "福建省" }
const ipCityNames: Record<string, string> = { Tokyo: "东京", Shenzhen: "深圳", Guangzhou: "广州", Beijing: "北京", Shanghai: "上海", Singapore: "新加坡", Seoul: "首尔", London: "伦敦", Paris: "巴黎", Frankfurt: "法兰克福", "Los Angeles": "洛杉矶", "San Francisco": "旧金山", "New York": "纽约" }

function ipLocation(info: IpInfo) {
  const country = info.countryCode ? ipCountryNames[info.countryCode] || "" : ""
  const region = info.countryCode === "CN" ? ipChinaRegions[info.regionCode || ""] || "" : ""
  const city = info.city ? ipCityNames[info.city] || "" : ""
  return [country, region, city].filter(Boolean).join(" · ") || "-"
}

function WalletBalanceCard({ account, span, rowSpan }: { account: Overview; span: BentoSpan; rowSpan: BentoRowSpan }) {
  return <BentoStatCard span={span} rowSpan={rowSpan} title="钱包余额" value={formatMoney(account.wallet.balance)} trailing={<BentoIconLink to="/account/wallet" label="查看钱包余额" icon={ArrowRight} />} />
}

function InviteFriendsCard({ account, span, rowSpan }: { account: Overview; span: BentoSpan; rowSpan: BentoRowSpan }) {
  return <BentoStatCard span={span} rowSpan={rowSpan} title="邀请好友" action={<BentoCardBadge tone="green" icon={Banknote}>获取{account.referral.rate}%返利</BentoCardBadge>} value={account.referral.invitedCount} unit="位好友已邀请" trailing={<BentoIconLink to="/account/referrals" label="查看邀请返利" icon={ArrowRight} />} />
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
  // Expired plans still publicly sold renew as a new purchase with the same product, period and traffic preselected.
  const renewal = status === "expired" ? account.subscription?.renewal : null
  const renewalUrl = renewal ? `/account/plans/checkout?${new URLSearchParams({ option: renewal.optionId, traffic: String(renewal.trafficTier) })}` : ""

  // Current or expired plan as "NAME (period-traffic/月)"; the period and traffic part is set smaller.
  const shownPlan = subscription ?? account.subscription
  // The headline name is the V2 line group, not the legacy tier in activeGroup.
  const nameParts = shownPlan ? { ...purchasedPlanParts(shownPlan, [], shownPlan.planTrafficBytes || null), name: shownPlan.lineGroupId?.toUpperCase() || "-" } : null
  const planDetail = nameParts ? `${nameParts.duration}-${nameParts.traffic}${nameParts.perMonth ? "/月" : ""}` : ""
  // No card title: plan name and grey facts share the top row; the headline figure sits bottom-left, the action bottom-right.
  return <BentoCard id="subscription" tone="yellow" span={span} rowSpan={rowSpan} className="scroll-mt-16">
    <CardContent className="flex flex-1 flex-col justify-between gap-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <h2 className="min-w-0 text-3xl font-bold wrap-anywhere xl:text-4xl" title={nameParts ? `${nameParts.name} (${planDetail})` : undefined}>{nameParts ? <><span className="text-extrude font-black">{nameParts.name}</span><span className="mt-4 block whitespace-nowrap text-xl xl:text-2xl">({planDetail})</span></> : "暂无套餐"}</h2>
        {subscription ? <div className="grid text-sm text-muted-foreground tabular-nums sm:text-right">
          <p>到期日期 {formatDate(subscription.expiresAt)}{subscription.giftedDays ? `（已赠送 ${subscription.giftedDays} 天）` : ""}</p>
          <p>流量配额 {planQuota}</p>
        </div> : null}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        {subscription ? subscription.duration === "lifetime" ? <p className="text-4xl font-semibold">永久有效</p> : <p className="flex items-baseline gap-2"><strong className="text-4xl font-semibold tabular-nums">{remainingDays ?? "-"}</strong><span className="text-sm">天后到期</span></p>
          : <p className="max-w-80 text-sm">{renewalUrl ? `套餐已于 ${formatDate(account.subscription?.expiresAt)} 到期，续费后恢复使用。` : "开通套餐后，这里会显示到期时间、流量配额和在线IP数量。"}</p>}
        {subscription ? canBuyHomeIp ? <BentoButton asChild size="lg" className="ml-auto"><Link to="/account/plans/checkout?product=home-ip"><span className="sm:hidden">定制家宽IP</span><span className="hidden sm:inline">AI被降智？定制纯净家宽 IP{Number.isFinite(homeIpStartingPrice) ? ` · ${formatMoney(homeIpStartingPrice)} 起` : ""}</span><ArrowUpRight className="size-5 text-white" strokeWidth={2.5} aria-hidden /></Link></BentoButton> : null
          : renewalUrl ? <BentoButton asChild size="lg" className="ml-auto"><Link to={renewalUrl}><RefreshCw />续费</Link></BentoButton>
          : <BentoButton asChild size="lg" className="ml-auto"><Link to="/account/plans"><PackagePlus />购买服务</Link></BentoButton>}
      </div>
    </CardContent>
  </BentoCard>
}

// Bar color per usage band (up to 50%, up to 99%, then above 99% of the quota): a solid indicator on a light track of the same color.
const usageBarBands = [
  [50, "bg-usage-20/20 *:data-[slot=progress-indicator]:bg-usage-20"],
  [99, "bg-usage-60/20 *:data-[slot=progress-indicator]:bg-usage-60"],
  [Infinity, "bg-usage-100/20 *:data-[slot=progress-indicator]:bg-usage-100"],
] as const

function usageBarClass(percent: number) {
  return usageBarBands.find(([limit]) => percent <= limit)?.[1] ?? usageBarBands[2][1]
}

function TrafficUsageCard({ plan, trafficLoading, trafficError, nextResetAt, span, rowSpan }: { plan: PlanView; trafficLoading: boolean; trafficError: string; nextResetAt?: string; span: BentoSpan; rowSpan: BentoRowSpan }) {
  const { subscription, usagePercent, remainingPercent, trafficTotal, trafficUsed } = plan
  const remaining = <p className="flex items-baseline gap-1.5"><strong className="text-3xl font-semibold tabular-nums">{remainingPercent == null ? subscription?.unlimited ? "不限" : trafficLoading ? "同步中" : "-" : `${Math.round(remainingPercent)}%`}</strong>{remainingPercent == null || subscription?.unlimited ? null : <span className="text-sm text-muted-foreground">剩余</span>}</p>
  return <BentoCard span={span} rowSpan={rowSpan} title="流量使用" action={remaining}>
    <CardContent className="grid flex-1 content-end gap-2">
      <Progress value={usagePercent ?? 0} className={cn("h-4 rounded-sm", usageBarClass(usagePercent ?? 0))} aria-label={usagePercent == null ? "流量用量暂不可用" : `已使用流量 ${Math.round(usagePercent)}%`} />
      {trafficError ? <p className="truncate text-xs text-muted-foreground" title={trafficError}>流量同步暂不可用：{trafficError}</p>
        : <p className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground"><span className="tabular-nums">已用 {trafficUsed} / {subscription?.unlimited ? "不限" : trafficTotal}</span>{nextResetAt ? <span>{formatDate(nextResetAt)} 重置</span> : null}</p>}
    </CardContent>
  </BentoCard>
}

function SubscriptionLinkCard({ subscriptionUrl, onImportClient, span, rowSpan }: { subscriptionUrl: string; onImportClient: (client: ImportClient) => void; span: BentoSpan; rowSpan: BentoRowSpan }) {
  return <BentoCard span={span} rowSpan={rowSpan} title="订阅链接">
    <CardContent>
      <Field>
        <span className="block rounded-4xl bg-[linear-gradient(90deg,var(--chart-1),var(--chart-2),var(--chart-3),var(--chart-4),var(--chart-5))] p-0.5"><Input id="subscription-url" aria-label="订阅地址" className="h-11 rounded-4xl border-0 bg-background px-4 font-semibold shadow-none dark:bg-background" readOnly value={subscriptionUrl} /></span>
        <div className="grid gap-2 sm:flex sm:flex-wrap [&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-auto">
          <CopySubscription value={subscriptionUrl} />
          <BentoButton asChild variant="outline"><a href={DOCS_URL} target="_blank" rel="noopener noreferrer"><BookOpen />使用教程</a></BentoButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><BentoButton variant="outline"><ExternalLink />一键导入客户端<ChevronDown /></BentoButton></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56">
              {(Object.keys(importClients) as ImportClient[]).map(client => <DropdownMenuItem key={client} className="min-h-11 justify-between gap-4 md:min-h-0" onSelect={() => onImportClient(client)}>{importClients[client].label}<span className="text-xs text-muted-foreground">{importClients[client].platform}</span></DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <FieldDescription>请勿将订阅链接分享给其他人。</FieldDescription>
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

  // Node status is only served to active self-hosted plans; skip the request otherwise.
  const canViewNodes = data?.subscription?.status === "active" && data.subscription.lineType === "self_hosted"
  React.useEffect(() => {
    if (!canViewNodes) return
    let active = true
    const refresh = () => fetchJson<NodeStatusSummary>("/api/account/node-status")
      .then(value => { if (active) { setNodeStatus(value); setNodeStatusError("") } })
      .catch(error => { if (active) setNodeStatusError(error instanceof Error ? error.message : "节点状态获取失败") })
    void refresh()
    const timer = window.setInterval(refresh, 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [canViewNodes])

  React.useEffect(() => {
    let active = true
    fetchJson<IpInfo & { error?: string }>("/api/account/ip-info")
      .then(value => {
        if (!value.error) return value
        if (import.meta.env.DEV) return devSampleIpInfo
        throw new Error(value.error)
      })
      .then(value => { if (active) { setIpInfo(value); setIpInfoError("") } })
      .catch(error => { if (active) { setIpInfo(null); setIpInfoError(error instanceof Error ? error.message : "IP 信息获取失败") } })
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
  // Without an active plan the traffic, device and node cards are hidden and the plan card spans the row.
  const announcementSpan: BentoSpan = plan.subscription ? 3 : 8
  const profileCard = <ProfileCard account={data} ipInfo={ipInfo} ipInfoError={ipInfoError} span={plan.subscription && !hasAnnouncements ? 8 : 5} rowSpan={2} className="md:col-span-8" />
  const [emailLocal, emailDomain] = data.email.split(/@(.*)/)
  const importConfig = importClient ? importClients[importClient] : null
  const importUrl = subscription && importConfig ? `${importConfig.scheme}${encodeURIComponent(subscription.subscriptionUrl)}` : ""
  return (
    <>
      <div className="grid gap-4">
        <Alert variant="warning"><CircleHelp /><AlertDescription className="flex w-full flex-row flex-wrap items-center justify-between gap-3"><span>遇到问题？发送工单联系客服吧！</span><Button asChild variant="link" size="sm" className="h-auto shrink-0 p-0 underline underline-offset-4"><Link to="/account/tickets/new">发送工单</Link></Button></AlertDescription></Alert>
        <BentoGrid>
          <section className={cn(bentoSpanClass(SHOW_PROMO_SLOT ? 5 : 8, 2), "flex min-w-0 flex-col justify-center gap-6 py-4")} aria-labelledby="account-greeting">
            <h2 id="account-greeting" className="grid gap-1 text-4xl font-semibold tracking-tight wrap-anywhere lg:text-5xl"><span>What's up,</span><span>{emailLocal}{emailDomain ? <><wbr />@{emailDomain}</> : null}{"\u00a0"}!</span></h2>
            <div className="flex flex-wrap gap-2">
              <BentoButton asChild size="lg"><Link to="/account/plans"><ArrowRight />前往商城</Link></BentoButton>
              <BentoButton asChild size="lg" variant="outline"><a href={DOCS_URL} target="_blank" rel="noopener noreferrer"><BookOpen />查看使用教程</a></BentoButton>
            </div>
          </section>
          {SHOW_PROMO_SLOT ? <PromoCard span={3} rowSpan={2} className="md:col-span-8" /> : null}
          <PlanDetailsCard account={data} plan={plan} span={plan.subscription ? 4 : 8} rowSpan={2} />
          {plan.subscription ? <>
            <TrafficUsageCard plan={plan} trafficLoading={trafficLoading} trafficError={trafficError} nextResetAt={selfHostedTraffic?.nextResetAt} span={4} rowSpan={1} />
            <DeviceLimitCard subscription={plan.subscription} traffic={selfHostedTraffic} span={2} rowSpan={1} />
            <NodeStatusCard status={nodeStatus} error={nodeStatusError} inactive={!canViewNodes} span={2} rowSpan={1} />
          </> : null}
          {/* From lg the subscription link (or, without a plan, the profile) 5 sits beside wallet over invite (3 each); the profile then pairs with announcements. */}
          {plan.subscription ? <SubscriptionLinkCard subscriptionUrl={plan.subscription.subscriptionUrl} onImportClient={setImportClient} span={5} rowSpan={2} /> : profileCard}
          <WalletBalanceCard account={data} span={3} rowSpan={1} />
          <InviteFriendsCard account={data} span={3} rowSpan={1} />
          {plan.subscription ? profileCard : null}
          {hasAnnouncements ? <BentoCard span={announcementSpan} rowSpan={2} className="md:col-span-8" title="网站公告" action={data.announcements.length > 1 ? <Badge variant="outline" className="bg-background tabular-nums">{carouselIndex + 1} / {data.announcements.length}</Badge> : null}>
            <CardContent className="grid flex-1">
              <Carousel opts={{ loop: data.announcements.length > 1 }} setApi={setCarouselApi} aria-label="网站公告" className="grid content-between gap-3">
                <CarouselContent>
                  {data.announcements.map((announcement, index) => <CarouselItem key={announcement.id}><Item asChild className="grid cursor-pointer gap-2 rounded-2xl bg-background p-3 hover:bg-background/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"><article role="button" tabIndex={0} aria-label={`查看公告：${announcement.title}`} onClick={() => viewAnnouncement(announcement)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); viewAnnouncement(announcement) } }}>
                    <header className="grid gap-1">
                      <div className="flex min-w-0 items-center gap-2">{index === 0 ? <Badge className="shrink-0">最新</Badge> : null}<h3 className="truncate font-semibold">{announcement.title}</h3></div>
                      <time className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums" dateTime={announcement.publishedAt}><Clock3 className="size-3.5" />{formatDateTime(announcement.publishedAt)}</time>
                    </header>
                    <MarkdownContent content={announcement.content} className="line-clamp-3 max-h-20 overflow-hidden text-sm text-muted-foreground xl:line-clamp-1 xl:max-h-5" />
                  </article></Item></CarouselItem>)}
                </CarouselContent>
                <div className="flex items-center justify-between gap-2">
                  <BentoButton variant="outline" onClick={() => { if (currentAnnouncement) viewAnnouncement(currentAnnouncement) }}><Eye />查看全文</BentoButton>
                  {data.announcements.length > 1 ? <div className="flex gap-2"><CarouselPrevious className="static size-11 translate-y-0 md:size-9" /><CarouselNext className="static size-11 translate-y-0 md:size-9" /></div> : null}
                </div>
              </Carousel>
            </CardContent>
          </BentoCard> : null}
          {hasTrafficDetails ? selfHostedTraffic ? <React.Suspense fallback={<Skeleton className={cn(bentoSpanClass(8, 3), "h-72 rounded-4xl xl:h-auto")} />}><AccountTrafficChart span={8} rowSpan={3} usage={selfHostedTraffic.nodeUsage} /></React.Suspense> : <Skeleton className={cn(bentoSpanClass(8, 3), "h-72 rounded-4xl xl:h-auto")} /> : null}
        </BentoGrid>
      </div>
      <Dialog open={announcementOpen} onOpenChange={changeAnnouncementOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selectedAnnouncement?.title}</DialogTitle><DialogDescription>{formatDateTime(selectedAnnouncement?.publishedAt)}</DialogDescription></DialogHeader>
          {selectedAnnouncement ? <MarkdownContent content={selectedAnnouncement.content} /> : null}
          <DialogFooter>
            {reminderDialog ? <label className="flex items-center gap-2 text-sm sm:mr-auto"><Checkbox checked={muteToday} onCheckedChange={checked => setMuteToday(checked === true)} />今日不再提醒</label> : null}
            <DialogClose asChild><Button variant={reminderDialog && !selectedAnnouncement?.url ? "default" : "outline"}>{reminderDialog ? "我知道了" : "关闭"}</Button></DialogClose>
            {selectedAnnouncement?.url ? <Button asChild><a href={selectedAnnouncement.url} target="_blank" rel="noopener noreferrer">阅读全文<ExternalLink /></a></Button> : null}
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
  // Only reached by typing the URL or an old bookmark; the in-app entries open the docs site in a new tab.
  React.useEffect(() => { window.location.replace(DOCS_URL) }, [])
  return <PageLoading />
}

// Shared inputs on bento surfaces: the rounded, borderless field used by the overview subscription link.
const bentoInputClass = "h-11 min-w-0 rounded-4xl border-0 bg-background px-4 shadow-none dark:bg-background"

// Figure card for one headline number, with an optional trailing control (usually a BentoIconLink).
function BentoStatCard({ title, value, unit, action, trailing, span, rowSpan }: { title: React.ReactNode; value: React.ReactNode; unit?: React.ReactNode; action?: React.ReactNode; trailing?: React.ReactNode; span: BentoSpan; rowSpan: BentoRowSpan }) {
  return <BentoCard span={span} rowSpan={rowSpan} title={title} action={action}>
    <CardContent className="flex flex-1 items-end justify-between gap-3">
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5"><strong className="truncate text-3xl font-semibold tabular-nums">{value}</strong>{unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}</p>
      {trailing}
    </CardContent>
  </BentoCard>
}

// Titled bento card for full-width record lists; sits outside BentoGrid so its height follows the content.
function BentoListCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <BentoCard span={null} rowSpan={null} title={title}>
    <CardContent className="grid gap-3">
      <p className="-mt-2 text-sm text-muted-foreground">{description}</p>
      <div className="rounded-2xl bg-background px-3 py-1">{children}</div>
    </CardContent>
  </BentoCard>
}

const walletBalanceKinds = [
  { key: "giftBalance", label: "赠送余额", icon: Gift, help: "后台赠送所得，不累计 VIP 和返利；购买套餐时优先抵扣。" },
  { key: "referralBalance", label: "返利余额", icon: Percent, help: "已结算的邀请返利，无需划转；购买套餐时在赠送余额之后抵扣。" },
  { key: "cashBalance", label: "充值余额", icon: Coins, help: "用户主动充值所得；充值时累计 VIP，购买套餐时最后抵扣。" },
] as const

const walletEntryLabels: Record<string, string> = { recharge: "充值", purchase: "消费", reward: "赠送", referral: "返利", reversal: "撤销" }

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

  if (!data) return error ? <p className="text-sm text-destructive">{error}</p> : <PageLoading />
  const canRecharge = data.paymentMethods.alipay || data.paymentMethods.wechat
  return (
    <div className="grid gap-4">
      <BentoGrid>
        <BentoCard tone="yellow" span={4} rowSpan={2} title="账户余额" action={data.heldBalance ? <BentoCardBadge icon={Clock3} className="tabular-nums">冻结中 {formatMoney(data.heldBalance)}</BentoCardBadge> : null}>
          <CardContent className="flex flex-1 flex-col justify-between gap-3">
            <p className="-mt-4 flex flex-wrap items-baseline gap-x-2"><strong className="text-4xl font-semibold tabular-nums">{formatMoney(data.balance)}</strong>{data.heldBalance ? <span className="text-sm tabular-nums">可用 {formatMoney(data.availableBalance)}</span> : null}</p>
            <Item className="rounded-2xl p-3">
              <dl className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
                {walletBalanceKinds.map(kind => <React.Fragment key={kind.key}>
                  <dt className="flex items-center gap-1.5 text-muted-foreground"><kind.icon className="size-4" aria-hidden />{kind.label}<Tooltip><TooltipTrigger aria-label={`${kind.label}说明`}><CircleHelp className="size-3.5" /></TooltipTrigger><TooltipContent className="max-w-64">{kind.help}</TooltipContent></Tooltip></dt>
                  <dd className="truncate text-right font-medium tabular-nums">{formatMoney(data[kind.key])}</dd>
                </React.Fragment>)}
              </dl>
            </Item>
          </CardContent>
        </BentoCard>
        <BentoCard span={4} rowSpan={2} title="在线充值" action={<BentoCardBadge icon={BadgeCheck}>累计 VIP 成长值</BentoCardBadge>}>
          <CardContent className="flex flex-1 flex-col justify-end">
            <Field>
              <FieldLabel htmlFor="recharge-amount">充值金额</FieldLabel>
              <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void recharge() }}>
                <Input id="recharge-amount" inputMode="decimal" placeholder="0.00" className={cn(bentoInputClass, "tabular-nums")} value={amount} onChange={event => setAmount(event.target.value)} disabled={paying || !canRecharge} />
                <BentoButton type="submit" className="shrink-0" disabled={paying || !canRecharge}>{paying ? <Loader2 className="animate-spin" /> : null}{canRecharge ? "去付款" : "在线充值维护中"}</BentoButton>
              </form>
              <FieldDescription>单次 ¥0.01–¥10,000.00，下一步在收银台选择支付宝或微信付款。</FieldDescription>
            </Field>
          </CardContent>
        </BentoCard>
      </BentoGrid>
      <BentoListCard title="余额流水" description="充值、赠送、消费和返利都会保留不可删除的记录。">
        {data.entries.length ? <Table><TableHeader><TableRow><TableHead>时间</TableHead><TableHead>类型</TableHead><TableHead>说明</TableHead><TableHead className="text-right">余额变动</TableHead><TableHead className="text-right">余额</TableHead></TableRow></TableHeader><TableBody>{data.entries.map(entry => { const delta = entry.cashDelta + entry.giftDelta + entry.referralDelta; return <TableRow key={entry.id}><TableCell className="tabular-nums">{formatDateTime(entry.createdAt)}</TableCell><TableCell><Badge variant="outline">{walletEntryLabels[entry.type] || "其他"}</Badge></TableCell><TableCell>{entry.description || "-"}</TableCell><TableCell className={cn("text-right font-medium tabular-nums", delta >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-foreground")}>{delta >= 0 ? "+" : ""}{formatMoney(delta)}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(entry.balance)}</TableCell></TableRow> })}</TableBody></Table>
          : <EmptyState title="暂无余额流水" description="充值、购买套餐或获得返利后，余额变动会显示在这里。" />}
      </BentoListCard>
    </div>
  )
}

type ReferralReward = { id: string; sourceOrderId: string; rewardAmount: number; baseAmount: number; status: string; availableAt: string; createdAt: string }
type ReferralData = { code: string; invitedCount: number; referralBalance: number; pendingAmount: number; earnedAmount: number; referralRate: number; recurringReferral: boolean; rewards: ReferralReward[] }

function InviteCopyField({ id, label, value }: { id: string; label: string; value: string }) {
  return <div className="flex items-center gap-2">
    <Label htmlFor={id} className="w-16 shrink-0">{label}</Label>
    <Input id={id} readOnly value={value} className={cn(bentoInputClass, "font-medium")} onFocus={event => event.currentTarget.select()} />
    <CopyButton value={value} aria-label={`复制${label}`} feedback="inline" variant="default" size="default" className="min-h-11 shrink-0 rounded-4xl px-5" />
  </div>
}

export function AccountReferralPage() {
  const [data, setData] = React.useState<ReferralData | null>(null)
  const [error, setError] = React.useState("")
  React.useEffect(() => {
    let active = true
    fetchJson<ReferralData>("/api/account/referrals")
      .then(value => { if (active) setData(value) })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : "邀请返利加载失败") })
    return () => { active = false }
  }, [])
  if (!data) return error ? <p className="text-sm text-destructive">{error}</p> : <PageLoading />
  const inviteUrl = `${window.location.origin}/register?ref=${data.code}`
  return <div className="grid gap-4">
    <BentoGrid>
      <BentoCard tone="green" span={5} rowSpan={2} className="md:col-span-8" title="邀请好友，一起加速" action={<BentoCardBadge icon={Banknote}>获取{data.referralRate}%返利</BentoCardBadge>}>
        <CardContent className="flex flex-1 flex-col justify-between gap-3">
          <p className="text-sm">好友通过你的链接注册并购买套餐后，你将获得实付金额 {data.referralRate}% 的返利{data.recurringReferral ? "，好友每次购买都返" : "（仅限首次购买）"}，到账后可直接抵扣。</p>
          <div className="grid gap-2">
            <InviteCopyField id="invite-code" label="邀请码" value={data.code} />
            <InviteCopyField id="invite-url" label="邀请链接" value={inviteUrl} />
          </div>
        </CardContent>
      </BentoCard>
      <BentoStatCard span={3} rowSpan={1} title="已邀请好友" value={data.invitedCount} unit="位" />
      <BentoStatCard span={3} rowSpan={1} title="返利余额" value={formatMoney(data.referralBalance)} trailing={<BentoIconLink to="/account/wallet" label="查看账户余额" icon={ArrowRight} />} />
      <BentoStatCard span={4} rowSpan={1} title="确认中的返利" value={formatMoney(data.pendingAmount)} unit="确认后自动到账" />
      <BentoStatCard span={4} rowSpan={1} title="累计获得返利" value={formatMoney(data.earnedAmount)} />
    </BentoGrid>
    <BentoListCard title="返利明细" description="好友订单确认后，返利自动计入返利余额。">
      {data.rewards.length ? <Table><TableHeader><TableRow><TableHead>来源订单</TableHead><TableHead className="text-right">实际投入</TableHead><TableHead className="text-right">返利金额</TableHead><TableHead>状态</TableHead><TableHead>到账时间</TableHead></TableRow></TableHeader><TableBody>{data.rewards.map(item => <TableRow key={item.id}><TableCell className="font-mono text-xs">{item.sourceOrderId}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(item.baseAmount)}</TableCell><TableCell className="text-right font-medium tabular-nums">{formatMoney(item.rewardAmount)}</TableCell><TableCell><Badge variant={item.status === "available" ? "success" : "secondary"}>{item.status === "available" ? "已到账" : item.status === "pending" ? "确认中" : item.status}</Badge></TableCell><TableCell className="tabular-nums">{formatDateTime(item.availableAt)}</TableCell></TableRow>)}</TableBody></Table>
        : <EmptyState title="暂无返利记录" description="好友通过你的邀请链接注册并购买套餐后，返利会显示在这里。" />}
    </BentoListCard>
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
  return <><ItemGroup className="md:hidden">{orders.map(order => <OrderMobileItem key={order.id} amount={formatMoney(order.totalAmount ?? order.amount)} createdAt={order.createdAt} detailUrl={`/account/orders/${encodeURIComponent(order.id)}`} orderNumber={order.merOrderTid} product={orderProductLabel(order)} status={order.statusText} statusVariant={order.status === "paid" ? "success" : order.status === "pending" ? "warning" : order.status === "failed" ? "destructive" : "secondary"} />)}</ItemGroup><div className="hidden md:block"><Table><TableHeader><TableRow><TableHead>订单</TableHead><TableHead>套餐</TableHead><TableHead>金额</TableHead><TableHead>状态</TableHead><TableHead>创建时间</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{orders.map(order => <TableRow key={order.id}><TableCell className="font-mono text-xs">{order.merOrderTid}</TableCell><TableCell>{orderProductLabel(order)}</TableCell><TableCell>{formatMoney(order.totalAmount ?? order.amount)}</TableCell><TableCell><Badge variant={order.status === "paid" ? "default" : "secondary"}>{order.statusText}</Badge></TableCell><TableCell>{formatDate(order.createdAt)}</TableCell><TableCell><div className="flex justify-end"><DataTableRowActions detail={<Button asChild variant="ghost" size="icon"><Link to={`/account/orders/${encodeURIComponent(order.id)}`} aria-label="查看订单详情"><Eye /></Link></Button>} /></div></TableCell></TableRow>)}</TableBody></Table></div></>
}
