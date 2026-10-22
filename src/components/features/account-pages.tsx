import * as React from "react"
import { Link, Navigate, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom"
import { ArrowRight, ArrowUpRight, BadgeCheck, Banknote, BookOpen, CalendarDays, Check, ChevronDown, CircleHelp, Clock3, Coins, Copy, ExternalLink, Eye, Gift, Globe, Loader2, MapPin, PackagePlus, Percent, RefreshCw, type LucideIcon } from "lucide-react"
import { toast } from "@/components/features/toast"

import { clearJsonCache, fetchCachedJson, fetchJson, getCachedJson, postJson, putJson } from "@/api"
import { Avatar } from "@/components/arc/avatar/avatar"
import { Carousel } from "@/components/arc/carousel/carousel"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Gauge } from "@/components/arc/gauge/gauge"
import { MetricCard } from "@/components/arc/metric-card/metric-card"
import { Progress } from "@/components/arc/progress/progress"
import { UsageMeter } from "@/components/arc/usage-meter/usage-meter"
import { Separator } from "@/components/ui/separator"
import { AccountVerificationIcon } from "@/components/features/account-verification-icon"
import type { AccountNodeUsage } from "@/components/features/account-traffic-chart"
import { BentoButton, BentoIconLink } from "@/components/features/bento-button"
import { BentoCard, BentoCardBadge, BentoGrid, bentoSpanClass, bentoSurfaceStyle, type BentoRowSpan, type BentoSpan } from "@/components/features/bento-card"
import { DataTableRowActions } from "@/components/features/arc-data-table"
import { MarkdownContent } from "@/components/features/markdown-content"
import { OrderMobileItem } from "@/components/features/order-mobile-item"
import { EmptyState } from "@/components/features/shared"
import { CopyButton } from "@/components/arc/copy-button/copy-button"
import { ChangelogTimelineCard } from "@/components/features/changelog"
import { nextVipTier, vipLevelLabel, type VipTier } from "@/components/features/vip-badge"
import { DOCS_URL } from "@/lib/docs-site"
import { cn } from "@/lib/utils"
import { formatDate, formatDateTime, formatMoney, orderProductLabel, planSnapshotParts } from "@/utils"
import type { PlanSnapshot } from "@/types"

import type { PaymentOrder } from "@/components/features/cashier-types"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { CtaSection } from "@/components/arc/blocks/cta-section/cta-section"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Input } from "@/components/arc/input/input"
import { PasswordField } from "@/components/arc/password-field/password-field"
import { Card as ArcCard } from "@/components/arc/card/card"
import { SimpleTable } from "@/components/features/simple-table"
// Plan figures are derived on the server from planSnapshot, the user's only plan source.
type Subscription = { status: string; lineGroupId?: string; lineType?: "upstream" | "self_hosted"; planExpiresAt?: string; expiresAt: string; giftedDays?: number; purchasedAt: string; duration: string; traffic: string; planTrafficBytes?: number; planSnapshot?: PlanSnapshot | null; devices: number | string; subscriptionUrl: string; vipLevel?: string; productName?: string; renewal?: { optionId: string; trafficTier: number; early?: boolean } | null; queuedPlan?: { startsAt: string; expiresAt: string; planSnapshot: PlanSnapshot | null } | null }
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
  return <div className="grid gap-4 px-4 lg:px-6"><Skeleton lines={4} /><Skeleton lines={6} /></div>
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
      toast({ type: "success", title: "订阅链接已复制" })
    } catch {
      toast({ type: "error", title: "复制失败，请手动复制" })
    }
  }

  return <BentoButton variant={copied ? "success" : "primary"} aria-label={copied ? "订阅链接已复制" : "复制订阅链接"} onClick={copySubscription}><span className={copied ? "motion-safe:animate-[copy-success_180ms_ease-out]" : ""}>{copied ? <Check /> : <Copy />}</span>{copied ? "复制订阅成功" : "复制订阅链接"}</BentoButton>
}

function ProfileCard({ account, ipInfo, ipInfoError, span, rowSpan, className }: { account: Overview; ipInfo: IpInfo | null; ipInfoError: string; span: BentoSpan; rowSpan: BentoRowSpan; className?: string }) {
  const accountType = account.isSuperAccount ? "super" : account.isBusiness ? "business" : account.isFamilyFriend ? "family" : "regular"
  const ipValue = (value: string) => ipInfo ? value : ipInfoError ? <span className="text-muted-foreground" title={ipInfoError}>暂不可用</span> : <Skeleton lines={1} className="ml-auto w-24" />
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
  const vipDiscountBadge = <Tooltip content={vipTiers.map(tier => `${vipLevelLabel(tier.level)}：${tier.discountPercent}%`).join(" · ")}><button type="button" className="rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none" aria-label={`专属折扣 ${account.vipDiscountPercent}%，查看各级 VIP 折扣`}><BentoCardBadge tone="green" icon={Percent}>专属折扣 {account.vipDiscountPercent}%</BentoCardBadge></button></Tooltip>
  return <BentoCard span={span} rowSpan={rowSpan} className={className} title="个人信息" action={vipDiscountBadge}>
    <div className="flex flex-1 flex-col gap-4 sm:flex-row">
      <div className="grid min-w-0 flex-1 content-between gap-3 sm:flex-[3]">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={account.email} size="lg" />
          <div className="grid min-w-0 flex-1 gap-0.5">
            <p className="flex min-w-0 items-center gap-1.5 font-semibold"><span className="truncate" title={account.email}>{account.email}</span><AccountVerificationIcon type={accountType} /></p>
            <p className="text-sm text-muted-foreground tabular-nums">ID #{account.customerID}</p>
          </div>
        </div>
        <ArcCard style={{ background: "var(--background)", borderColor: "transparent" }}><dl className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
            {details.map(({ label, icon: Icon, value, title }) => <React.Fragment key={label}><dt className="flex items-center gap-1.5 text-muted-foreground"><Icon className="size-4" aria-hidden />{label}</dt><dd className="truncate text-right font-medium tabular-nums" title={title}>{value}</dd></React.Fragment>)}
          </dl></ArcCard>
      </div>
      <Separator className="sm:hidden" />
      <Separator orientation="vertical" className="hidden sm:block data-[orientation=vertical]:h-auto" />
      <section aria-label="VIP 等级" className="grid min-w-0 content-between justify-items-center gap-1 text-center sm:flex-[2]">
        <Gauge value={Math.round(vipProgress)} label={currentLevel} tone="success" size={112} />
        <div className="grid text-xs text-muted-foreground tabular-nums">
          <span>累计消费 <span className="font-medium text-foreground">{formatMoney(account.vipSpend)}</span></span>
          <span>{vipTarget ? `距离 ${vipTarget.level} 还差 ${formatMoney(vipTarget.amount - account.vipSpend)}` : "已达到最高等级"}</span>
        </div>
      </section>
    </div>
  </BentoCard>
}

// Placeholder ad slot: promotes the referral program until real ad content is wired in.
// Hidden for now (SHOW_PROMO_SLOT); the greeting spans the full row while it is off.
const SHOW_PROMO_SLOT = false
function PromoCard({ span, rowSpan, className }: { span: BentoSpan; rowSpan: BentoRowSpan; className?: string }) {
  return <BentoCard tone="green" span={span} rowSpan={rowSpan} className={className} title="邀请好友，一起加速" action={<Badge className="border-transparent bg-white/60">推荐</Badge>}>
    <div className="flex flex-1 flex-col justify-between gap-4">
      <p className="text-sm">好友通过你的邀请码购买套餐后，返利会直接计入你的钱包，购买时可抵扣。</p>
      <BentoButton asChild className="w-fit"><Link to="/account/referrals"><Gift />获取邀请码</Link></BentoButton>
    </div>
  </BentoCard>
}

function NodeStatusCard({ status, error, inactive, span, rowSpan }: { status: NodeStatusSummary | null; error: string; inactive: boolean; span: BentoSpan; rowSpan: BentoRowSpan }) {
  const available = !inactive && Boolean(status?.configured && status.checkedAt)
  const note = inactive ? "当前线路暂不支持" : error ? "状态暂不可用" : !status ? "" : !status.configured ? "节点监控未配置" : "等待首次检测"
  return <BentoCard span={span} rowSpan={rowSpan} title="节点状态">
    <div className="flex flex-1 items-end justify-between gap-3">
      {available ? <p className="flex flex-wrap items-baseline gap-x-1.5" title={status?.checkedAt ? `最近检测 ${formatDateTime(status.checkedAt)}` : undefined}><strong className="text-2xl font-semibold tabular-nums">{status?.onlineNodes}</strong><span className="text-sm text-muted-foreground tabular-nums">/ {status?.totalNodes} 在线</span></p> : !inactive && !status && !error ? <Skeleton lines={2} className="w-24" /> : <p className="flex min-w-0 items-baseline gap-1.5"><strong className="text-2xl font-semibold">-</strong><span className="truncate text-sm text-muted-foreground">{note}</span></p>}
      {inactive ? null : <BentoIconLink to="/account/nodes" label="查看节点状态" icon={Eye} />}
    </div>
  </BentoCard>
}

function DeviceLimitCard({ subscription, traffic, span, rowSpan }: { subscription: Subscription; traffic: SelfHostedTraffic | null; span: BentoSpan; rowSpan: BentoRowSpan }) {
  return <BentoCard span={span} rowSpan={rowSpan} title="在线IP数量">
    <div className="grid flex-1 content-end">
      {traffic ? <p className="flex flex-wrap items-baseline gap-x-1.5"><strong className="text-2xl font-semibold tabular-nums">{traffic.connectedIpCount ?? "-"}</strong><span className="text-sm text-muted-foreground tabular-nums">/ {traffic.ipLimit || "不限"} 在线</span></p>
        : <p className="flex items-baseline gap-1.5"><strong className="text-2xl font-semibold tabular-nums">{subscription.devices}</strong><span className="text-sm text-muted-foreground">上限</span></p>}
    </div>
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
  return <BentoStatCard span={span} rowSpan={rowSpan} title="钱包余额" money value={Number(account.wallet.balance) || 0} trailing={<BentoIconLink to="/account/wallet" label="查看钱包余额" icon={ArrowRight} />} />
}

function InviteFriendsCard({ account, span, rowSpan }: { account: Overview; span: BentoSpan; rowSpan: BentoRowSpan }) {
  return <BentoStatCard span={span} rowSpan={rowSpan} title="邀请好友" action={<BentoCardBadge tone="green" icon={Banknote}>获取{account.referral.rate}%返利</BentoCardBadge>} value={Number(account.referral.invitedCount) || 0} unit="位好友已邀请" trailing={<BentoIconLink to="/account/referrals" label="查看邀请返利" icon={ArrowRight} />} />
}

type PlanView = { subscription: Subscription | null; status: "active" | "expired" | "depleted" | "inactive"; trafficTotal: string; trafficUsed: string; usedGb: number | null; totalGb: number | null; usagePercent: number | null; remainingPercent: number | null }

function planView(subscription: Subscription | null, traffic: SelfHostedTraffic | null): PlanView {
  const usagePercent = subscription?.lineType === "self_hosted" ? traffic?.usagePercent ?? null : null
  const status = !subscription ? "inactive" : subscription.status === "expired" ? "expired" : traffic?.status === "depleted" ? "depleted" : "active"
  return {
    subscription: subscription?.status === "active" ? subscription : null,
    status,
    trafficTotal: traffic ? `${(traffic.totalBytes / 1024 ** 3).toFixed(0)} GB` : subscription?.traffic || "-",
    trafficUsed: traffic ? `${(traffic.usedBytes / 1024 ** 3).toFixed(2)} GB` : "-",
    usedGb: traffic ? traffic.usedBytes / 1024 ** 3 : null,
    totalGb: traffic && traffic.totalBytes > 0 ? traffic.totalBytes / 1024 ** 3 : null,
    usagePercent,
    remainingPercent: usagePercent == null ? null : Math.max(0, 100 - usagePercent),
  }
}

function PlanDetailsCard({ account, plan, span, rowSpan }: { account: Overview; plan: PlanView; span: BentoSpan; rowSpan: BentoRowSpan }) {
  const { subscription, status } = plan
  // Plan-only figures: traffic packs and admin gifts show in the traffic usage card, not here.
  const planTrafficGb = subscription?.planTrafficBytes ? Number((subscription.planTrafficBytes / 1024 ** 3).toFixed(2)) : 0
  const planQuota = subscription?.planSnapshot?.trafficBytes === null ? "不限" : planTrafficGb ? `${planTrafficGb}GB${subscription?.duration === "lifetime" ? "" : "/月"}` : subscription?.traffic || "-"
  const canBuyHomeIp = account.homeIp?.enabled && status === "active" && subscription?.duration !== "lifetime"
  const homeIpStartingPrice = Math.min(...(account.homeIp?.regions || []).map(region => Number(region.price)).filter(Number.isFinite))
  const expiresAtTime = Date.parse(subscription?.expiresAt || "")
  const remainingDays = Number.isFinite(expiresAtTime) ? Math.max(0, Math.ceil((expiresAtTime - Date.now()) / 86400000)) : null
  // Plans still publicly sold renew as a new purchase with the same product, period and traffic preselected; an active
  // recurring plan renews early, and the renewal waits until the current plan ends.
  const renewal = account.subscription?.renewal
  const renewalUrl = renewal ? `/account/plans/checkout?${new URLSearchParams({ option: renewal.optionId, traffic: String(renewal.trafficTier), ...(renewal.early ? { renew: "1" } : {}) })}` : ""
  const earlyRenewalUrl = subscription && renewal?.early ? renewalUrl : ""
  const queuedPlan = subscription?.queuedPlan
  const queuedParts = queuedPlan ? planSnapshotParts(queuedPlan.planSnapshot) : null
  const otherAction = subscription && status === "depleted" ? "traffic" : canBuyHomeIp ? "home-ip" : ""

  // Current or expired plan as "NAME (period-traffic/月)"; the period and traffic part is set smaller.
  const shownPlan = subscription ?? account.subscription
  // The headline name is the snapshot's line group; period and traffic come from the same snapshot.
  const nameParts = shownPlan ? { ...planSnapshotParts(shownPlan.planSnapshot), name: shownPlan.lineGroupId?.toUpperCase() || "-" } : null
  const planDetail = nameParts ? `${nameParts.duration}-${nameParts.traffic}${nameParts.perMonth ? "/月" : ""}` : ""
  // No card title: plan name and grey facts share the top row; the headline figure sits bottom-left, the action bottom-right.
  return <BentoCard id="subscription" tone="yellow" span={span} rowSpan={rowSpan} className="scroll-mt-16">
    <div className="flex flex-1 flex-col justify-between gap-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <h2 className="min-w-0 text-2xl font-bold wrap-anywhere xl:text-3xl" title={nameParts ? `${nameParts.name} (${planDetail})` : undefined}>{nameParts ? <><span className="text-extrude font-black">{nameParts.name}</span><span className="mt-3 block whitespace-nowrap text-lg xl:text-xl">({planDetail})</span></> : "暂无套餐"}</h2>
        {subscription ? <div className="grid text-sm text-muted-foreground tabular-nums sm:text-right">
          <p>到期日期 {formatDate(subscription.expiresAt)}{subscription.giftedDays ? `（已赠送 ${subscription.giftedDays} 天）` : ""}</p>
          <p>流量配额 {planQuota}</p>
        </div> : null}
      </div>
      {/* The countdown stays bottom-left; actions stack bottom-right, the renewal above the add-on offer. */}
      <div className={cn("flex items-end justify-between gap-4", !subscription && "flex-wrap gap-y-3")}>
        {subscription ? subscription.duration === "lifetime" ? <p className="shrink-0 text-3xl font-semibold">永久有效</p> : <p className="flex shrink-0 items-baseline gap-2"><strong className="text-3xl font-semibold tabular-nums">{remainingDays ?? "-"}</strong><span className="text-sm">天后到期</span></p>
          : <p className="max-w-80 text-sm">{renewalUrl ? `套餐已于 ${formatDate(account.subscription?.expiresAt)} 到期，续费后恢复使用。` : "开通套餐后，这里会显示到期时间、流量配额和在线IP数量。"}</p>}
        {subscription ? earlyRenewalUrl || queuedPlan || otherAction ? <div className="flex min-w-0 flex-col items-end gap-2 text-right">
            {earlyRenewalUrl ? <BentoButton asChild size="lg"><Link to={earlyRenewalUrl}><RefreshCw />提前续费</Link></BentoButton>
              : queuedPlan && queuedParts ? <p className="text-sm text-muted-foreground tabular-nums">已续费 {queuedParts.duration}-{queuedParts.traffic}{queuedParts.perMonth ? "/月" : ""}，{formatDate(queuedPlan.startsAt)} 生效</p> : null}
            {/* Traffic used up: the plan is still active, so the next step is a traffic pack. */}
            {otherAction === "traffic" ? <BentoButton asChild size="lg"><Link to="/account/plans#addons"><PackagePlus />流量已用完，购买流量包</Link></BentoButton>
              : otherAction === "home-ip" ? <BentoButton asChild size="lg"><Link to="/account/plans/checkout?product=home-ip"><span className="sm:hidden">定制家宽IP</span><span className="hidden sm:inline">AI被降智？定制纯净家宽 IP{Number.isFinite(homeIpStartingPrice) ? ` · ${formatMoney(homeIpStartingPrice)} 起` : ""}</span><ArrowUpRight className="size-5 text-white" strokeWidth={2.5} aria-hidden /></Link></BentoButton> : null}
          </div> : null
          : renewalUrl ? <BentoButton asChild size="lg" className="ml-auto"><Link to={renewalUrl}><RefreshCw />续费</Link></BentoButton>
          : <BentoButton asChild size="lg" className="ml-auto"><Link to="/account/plans"><PackagePlus />购买服务</Link></BentoButton>}
      </div>
    </div>
  </BentoCard>
}

// An unlimited plan has no allowance to measure against, so its meter is drawn against this nominal cap.
const UNLIMITED_TRAFFIC_DISPLAY_GB = 9999

function TrafficUsageCard({ plan, trafficError, nextResetAt, span, rowSpan }: { plan: PlanView; trafficLoading: boolean; trafficError: string; nextResetAt?: string; span: BentoSpan; rowSpan: BentoRowSpan }) {
  const { subscription, usedGb, totalGb, trafficTotal, trafficUsed } = plan
  const limitGb = subscription?.planSnapshot?.trafficBytes === null ? UNLIMITED_TRAFFIC_DISPLAY_GB : totalGb
  // The meter carries its own heading and remaining amount, so the card has no title row.
  return <BentoCard span={span} rowSpan={rowSpan}>
    <div className="grid flex-1 content-end gap-2">
      {usedGb == null || !limitGb ? null : <UsageMeter label="流量使用" unit="GB" decimals={1} limit={limitGb} segments={[{ id: "used", label: "已用", value: usedGb }]} />}
      {trafficError ? <p className="truncate text-xs text-muted-foreground" title={trafficError}>流量同步暂不可用：{trafficError}</p>
        : <p className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground"><span className="tabular-nums">已用 {trafficUsed} / {subscription?.planSnapshot?.trafficBytes === null ? `${UNLIMITED_TRAFFIC_DISPLAY_GB} GB` : trafficTotal}</span>{nextResetAt ? <span>{formatDate(nextResetAt)} 重置</span> : null}</p>}
    </div>
  </BentoCard>
}

function SubscriptionLinkCard({ subscriptionUrl, onImportClient, span, rowSpan }: { subscriptionUrl: string; onImportClient: (client: ImportClient) => void; span: BentoSpan; rowSpan: BentoRowSpan }) {
  return <BentoCard span={span} rowSpan={rowSpan} title="订阅链接">
    <Field>
        {/* The gradient wrapper is the field's only outline: Arc's input stylesheet outranks plain utilities, so its own border and radius are overridden here. */}
        <span className="block rounded-full bg-[linear-gradient(90deg,var(--chart-1),var(--chart-2),var(--chart-3),var(--chart-4),var(--chart-5))] p-0.5"><Input label="订阅地址" hideLabel id="subscription-url" className="!h-11 !rounded-full !border-0 !bg-background px-4 font-semibold" readOnly value={subscriptionUrl} /></span>
        <div className="grid gap-2 sm:flex sm:flex-wrap [&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-auto">
          <CopySubscription value={subscriptionUrl} />
          <BentoButton asChild variant="secondary"><a href={DOCS_URL} target="_blank" rel="noopener noreferrer"><BookOpen />使用教程</a></BentoButton>
          <DropdownMenu label="一键导入客户端" icon={<ExternalLink size={16} />} align="start" items={(Object.keys(importClients) as ImportClient[]).map(client => ({ label: `${importClients[client].label}（${importClients[client].platform}）`, onSelect: () => onImportClient(client) }))} />
        </div>
        <FieldDescription>请勿将订阅链接分享给其他人。</FieldDescription>
      </Field>
  </BentoCard>
}

export function AccountOverviewPage() {
  const navigate = useNavigate()
  const { data, error } = useOverview()
  const [importClient, setImportClient] = React.useState<ImportClient | null>(null)
  const [announcementOpen, setAnnouncementOpen] = React.useState(false)
  const [selectedAnnouncement, setSelectedAnnouncement] = React.useState<Announcement | null>(null)
  const [reminderDialog, setReminderDialog] = React.useState(false)
  const [muteToday, setMuteToday] = React.useState(false)
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
    const refresh = (background = false) => fetchJson<NodeStatusSummary>("/api/account/node-status", { background })
      .then(value => { if (active) { setNodeStatus(value); setNodeStatusError("") } })
      .catch(error => { if (active) setNodeStatusError(error instanceof Error ? error.message : "节点状态获取失败") })
    void refresh()
    const timer = window.setInterval(() => void refresh(true), 30000)
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
        <CtaSection variant="banner" bare compactAction title="遇到问题？" description="发送工单联系客服吧！" primaryAction={{ label: "发送工单", href: "/account/tickets/new" }} onNavigate={action => { if (action.href) navigate(action.href) }} />
        <BentoGrid>
          <section className={cn(bentoSpanClass(SHOW_PROMO_SLOT ? 5 : 8, 2), "flex min-w-0 flex-col justify-center gap-6 py-4")} aria-labelledby="account-greeting">
            <h2 id="account-greeting" className="grid gap-1 text-3xl font-semibold tracking-tight wrap-anywhere lg:text-4xl"><span>What's up,</span><span>{emailLocal}{emailDomain ? <><wbr />@{emailDomain}</> : null}{"\u00a0"}!</span></h2>
            <div className="flex flex-wrap gap-2">
              <BentoButton asChild size="lg"><Link to="/account/plans"><ArrowRight />前往商城</Link></BentoButton>
              <BentoButton asChild size="lg" variant="secondary"><a href={DOCS_URL} target="_blank" rel="noopener noreferrer"><BookOpen />查看使用教程</a></BentoButton>
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
          {hasAnnouncements ? <BentoCard span={announcementSpan} rowSpan={2} className="md:col-span-8" title="网站公告" action={data.announcements.length > 1 ? <Badge className="bg-background tabular-nums">{carouselIndex + 1} / {data.announcements.length}</Badge> : null}>
            <div className="grid flex-1">
              <div className="grid content-between gap-3">
                <Carousel label="网站公告" index={carouselIndex} onIndexChange={setCarouselIndex} slideLabel={(index, count) => `第 ${index + 1} 条，共 ${count} 条`}>
                  {data.announcements.map((announcement, index) => <article key={announcement.id} className="grid cursor-pointer gap-2 rounded-2xl bg-background p-3 hover:bg-background/70" role="button" tabIndex={0} aria-label={`查看公告：${announcement.title}`} onClick={() => viewAnnouncement(announcement)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); viewAnnouncement(announcement) } }}>
                    <header className="grid gap-1">
                      <div className="flex min-w-0 items-center gap-2">{index === 0 ? <Badge className="shrink-0">最新</Badge> : null}<h3 className="truncate font-semibold">{announcement.title}</h3></div>
                      <time className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums" dateTime={announcement.publishedAt}><Clock3 className="size-3.5" />{formatDateTime(announcement.publishedAt)}</time>
                    </header>
                    <MarkdownContent content={announcement.content} className="line-clamp-3 max-h-20 overflow-hidden text-sm text-muted-foreground xl:line-clamp-1 xl:max-h-5" />
                  </article>)}
                </Carousel>
                <div className="flex items-center justify-between gap-2">
                  <BentoButton variant="secondary" onClick={() => { if (currentAnnouncement) viewAnnouncement(currentAnnouncement) }}><Eye />查看全文</BentoButton>
                </div>
              </div>
            </div>
          </BentoCard> : null}
          {hasTrafficDetails ? selfHostedTraffic ? <React.Suspense fallback={<Skeleton lines={1} className={cn(bentoSpanClass(8, 3), "h-72 rounded-4xl xl:h-auto")} />}><AccountTrafficChart span={8} rowSpan={3} usage={selfHostedTraffic.nodeUsage} /></React.Suspense> : <Skeleton lines={1} className={cn(bentoSpanClass(8, 3), "h-72 rounded-4xl xl:h-auto")} /> : null}
          <ChangelogTimelineCard span={8} rowSpan={2} />
        </BentoGrid>
      </div>
      <Dialog open={announcementOpen} onOpenChange={changeAnnouncementOpen}>
        <DialogContent title={selectedAnnouncement?.title || "公告"} description={formatDateTime(selectedAnnouncement?.publishedAt)}>{selectedAnnouncement ? <MarkdownContent content={selectedAnnouncement.content} /> : null}<div className="mt-4 flex flex-wrap justify-end gap-2">
            {reminderDialog ? <label className="flex items-center gap-2 text-sm sm:mr-auto"><Checkbox checked={muteToday} onCheckedChange={checked => setMuteToday(checked === true)} />今日不再提醒</label> : null}
            <DialogClose asChild><Button variant={reminderDialog && !selectedAnnouncement?.url ? "primary" : "secondary"}>{reminderDialog ? "我知道了" : "关闭"}</Button></DialogClose>
            {selectedAnnouncement?.url ? <Button asChild><a href={selectedAnnouncement.url} target="_blank" rel="noopener noreferrer">阅读全文<ExternalLink /></a></Button> : null}
          </div></DialogContent>
      </Dialog>
      <Dialog open={importClient !== null} onOpenChange={open => { if (!open) setImportClient(null) }}>
        <DialogContent title={`导入 ${importConfig?.name}`} description={`⚠️请先关闭${importConfig?.app || "客户端"}的连接开关。`}><div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild><Button variant="secondary">取消</Button></DialogClose>
            <DialogClose asChild><Button onClick={() => { window.location.href = importUrl }}>导入 {importConfig?.name}</Button></DialogClose>
          </div></DialogContent>
      </Dialog>
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

/** One figure of the overview grid on Arc's metric card: a count, or an amount in yuan when `money` is set. `action` sits beside the title, `trailing` (usually a BentoIconLink) in the bottom-right corner. */
function BentoStatCard({ title, value, money = false, unit, action, trailing, span, rowSpan }: { title: string; value: number; money?: boolean; unit?: string; action?: React.ReactNode; trailing?: React.ReactNode; span: BentoSpan; rowSpan: BentoRowSpan }) {
  return <MetricCard className={bentoSpanClass(span, rowSpan)} label={title} value={value} prefix={money ? "¥" : undefined} decimals={money ? 2 : 0} context={unit} density="compact" style={bentoSurfaceStyle()} action={action} trailing={trailing} />
}

// Titled bento card for full-width record lists; sits outside BentoGrid so its height follows the content.
function BentoListCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <BentoCard span={null} rowSpan={null} title={title}>
    <div className="grid gap-3">
      <p className="-mt-2 text-sm text-muted-foreground">{description}</p>
      <div className="rounded-2xl bg-background px-3 py-1">{children}</div>
    </div>
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
      toast({ type: "error", title: "请输入 0.01 至 10,000.00 元，最多两位小数" })
      return
    }
    setPaying(true)
    try {
      const order = await postJson<PaymentOrder>("/api/wallet/recharge", { amount: value })
      clearJsonCache()
      window.dispatchEvent(new CustomEvent("payment-order-updated", { detail: { id: order.id, status: order.status } }))
      navigate(`/cashier/${encodeURIComponent(order.id)}`)
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "创建充值订单失败" })
      setPaying(false)
    }
  }

  if (!data) return error ? <p className="text-sm text-destructive">{error}</p> : <PageLoading />
  const canRecharge = data.paymentMethods.alipay || data.paymentMethods.wechat
  return (
    <div className="grid gap-4">
      <BentoGrid>
        <BentoCard tone="yellow" span={4} rowSpan={2} title="账户余额" action={data.heldBalance ? <BentoCardBadge icon={Clock3} className="tabular-nums">冻结中 {formatMoney(data.heldBalance)}</BentoCardBadge> : null}>
          <div className="flex flex-1 flex-col justify-between gap-3">
            <p className="-mt-4 flex flex-wrap items-baseline gap-x-2"><strong className="text-4xl font-semibold tabular-nums">{formatMoney(data.balance)}</strong>{data.heldBalance ? <span className="text-sm tabular-nums">可用 {formatMoney(data.availableBalance)}</span> : null}</p>
            <ArcCard className="rounded-2xl p-3"><dl className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
                {walletBalanceKinds.map(kind => <React.Fragment key={kind.key}>
                  <dt className="flex items-center gap-1.5 text-muted-foreground"><kind.icon className="size-4" aria-hidden />{kind.label}<Tooltip content={kind.help}><button type="button" aria-label={`${kind.label}说明`}><CircleHelp className="size-3.5" /></button></Tooltip></dt>
                  <dd className="truncate text-right font-medium tabular-nums">{formatMoney(data[kind.key])}</dd>
                </React.Fragment>)}
              </dl></ArcCard>
          </div>
        </BentoCard>
        <BentoCard span={4} rowSpan={2} title="在线充值" action={<BentoCardBadge icon={BadgeCheck}>累计 VIP 成长值</BentoCardBadge>}>
          <div className="flex flex-1 flex-col justify-end">
            <Field>
              <FieldLabel htmlFor="recharge-amount">充值金额</FieldLabel>
              <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void recharge() }}>
                <Input label="0.00" hideLabel id="recharge-amount" inputMode="decimal" placeholder="0.00" className={cn(bentoInputClass, "tabular-nums")} value={amount} onChange={event => setAmount(event.target.value)} disabled={paying || !canRecharge} />
                <BentoButton type="submit" className="shrink-0" disabled={paying || !canRecharge}>{paying ? <Loader2 className="animate-spin" /> : null}{canRecharge ? "去付款" : "在线充值维护中"}</BentoButton>
              </form>
              <FieldDescription>单次 ¥0.01–¥10,000.00，下一步在收银台选择支付宝或微信付款。</FieldDescription>
            </Field>
          </div>
        </BentoCard>
      </BentoGrid>
      <BentoListCard title="余额流水" description="充值、赠送、消费和返利都会保留不可删除的记录。">
        {data.entries.length ? <SimpleTable caption="时间列表" columns={["时间", "类型", "说明", "余额变动", "余额"]} rows={data.entries} rowKey={(entry) => {
const delta = entry.cashDelta + entry.giftDelta + entry.referralDelta;
return entry.id }} cells={(entry) => {
const delta = entry.cashDelta + entry.giftDelta + entry.referralDelta;
return [<span className="tabular-nums">{formatDateTime(entry.createdAt)}</span>, <Badge>{walletEntryLabels[entry.type] || "其他"}</Badge>, <>{entry.description || "-"}</>, <span className={cn("text-right font-medium tabular-nums", delta >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-foreground")}>{delta >= 0 ? "+" : ""}{formatMoney(delta)}</span>, <span className="text-right tabular-nums">{formatMoney(entry.balance)}</span>] }} />
          : <EmptyState icon={<Coins width={24} height={24} strokeWidth={1.5} />} title="暂无余额流水" description="充值、购买套餐或获得返利后，余额变动会显示在这里。" />}
      </BentoListCard>
    </div>
  )
}

type ReferralReward = { id: string; sourceOrderId: string; rewardAmount: number; baseAmount: number; status: string; availableAt: string; createdAt: string }
type ReferralData = { code: string; invitedCount: number; referralBalance: number; pendingAmount: number; earnedAmount: number; referralRate: number; recurringReferral: boolean; rewards: ReferralReward[] }

function InviteCopyField({ id, label, value }: { id: string; label: string; value: string }) {
  return <div className="flex items-center gap-2">
    <label htmlFor={id} className="w-16 shrink-0 text-sm font-medium">{label}</label>
    <Input label="输入" hideLabel id={id} readOnly value={value} className={cn(bentoInputClass, "font-medium")} onFocus={event => event.currentTarget.select()} />
    <CopyButton value={value} label={`复制${label}`} className="shrink-0" />
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
        <div className="flex flex-1 flex-col justify-between gap-3">
          <p className="text-sm">好友通过你的链接注册并购买套餐后，你将获得实付金额 {data.referralRate}% 的返利{data.recurringReferral ? "，好友每次购买都返" : "（仅限首次购买）"}，到账后可直接抵扣。</p>
          <div className="grid gap-2">
            <InviteCopyField id="invite-code" label="邀请码" value={data.code} />
            <InviteCopyField id="invite-url" label="邀请链接" value={inviteUrl} />
          </div>
        </div>
      </BentoCard>
      <BentoStatCard span={3} rowSpan={1} title="已邀请好友" value={Number(data.invitedCount) || 0} unit="位" />
      <BentoStatCard span={3} rowSpan={1} title="返利余额" money value={Number(data.referralBalance) || 0} trailing={<BentoIconLink to="/account/wallet" label="查看账户余额" icon={ArrowRight} />} />
      <BentoStatCard span={4} rowSpan={1} title="确认中的返利" money value={Number(data.pendingAmount) || 0} unit="确认后自动到账" />
      <BentoStatCard span={4} rowSpan={1} title="累计获得返利" money value={Number(data.earnedAmount) || 0} />
    </BentoGrid>
    <BentoListCard title="返利明细" description="好友订单确认后，返利自动计入返利余额。">
      {data.rewards.length ? <SimpleTable caption="来源订单列表" columns={["来源订单", "实际投入", "返利金额", "状态", "到账时间"]} rows={data.rewards} rowKey={(item) => item.id} cells={(item) => [<span className="font-mono text-xs">{item.sourceOrderId}</span>, <span className="text-right tabular-nums">{formatMoney(item.baseAmount)}</span>, <span className="text-right font-medium tabular-nums">{formatMoney(item.rewardAmount)}</span>, <Badge tone={item.status === "available" ? "success" : "neutral"}>{item.status === "available" ? "已到账" : item.status === "pending" ? "确认中" : item.status}</Badge>, <span className="tabular-nums">{formatDateTime(item.availableAt)}</span>]} />
        : <EmptyState icon={<Gift width={24} height={24} strokeWidth={1.5} />} title="暂无返利记录" description="好友通过你的邀请链接注册并购买套餐后，返利会显示在这里。" />}
    </BentoListCard>
  </div>
}

export function AccountOrdersPage() {
  const { data: orders, error } = useCachedAccountData<PaymentOrder[]>("/api/account/orders")
  if (!orders) return error ? <p className="px-4 text-sm text-destructive lg:px-6">{error}</p> : <PageLoading />
  return <div className="px-4 lg:px-6"><Card className="contents md:flex" title="订单记录" description="所有商品订单"><>{orders.length ? <OrdersTable orders={orders} /> : <p className="text-sm text-muted-foreground">仅展示2026年7月15日后的订单</p>}</></Card></div>
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
    if (password !== confirmPassword) return toast({ type: "error", title: "两次输入的密码不一致" })
    setLoading(true)
    try {
      await putJson("/api/auth/password", { currentPassword, password })
      clearJsonCache()
      toast({ type: "success", title: "密码已修改，请重新登录" })
      navigate("/login", { replace: true })
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "修改失败" })
    } finally { setLoading(false) }
  }
  return <div className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6"><Card title="账户资料" description="邮箱是你的唯一登录账号。"><div className="grid gap-4"><Input label="邮箱" id="profile-email" value={email} disabled /><Metric label="注册时间" value={data ? formatDate(data.createdAt) : "-"} /></div></Card><Card title="修改密码" description="修改成功后当前设备需要重新登录，其他设备保持登录。"><form className="grid gap-4" onSubmit={submit} noValidate><PasswordField label="当前密码" id="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /><PasswordField label="新密码" id="new-password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required /><PasswordField label="确认新密码" id="confirm-password" minLength={8} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /><ActionButton type="submit" label="保存密码" pending={loading} /></form></Card></div>
}

export function PaymentResultPage() {
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get("paymentOrder") || ""
  return <Navigate to={orderId ? `/cashier/${encodeURIComponent(orderId)}` : "/account/orders"} replace />
}

function Metric({ label, value, description }: { label: string; value: React.ReactNode; description?: string }) {
  return <div className="grid gap-1"><span className="flex items-center gap-1 text-sm text-muted-foreground">{label}{description ? <Tooltip content={description}><button type="button" aria-label={`${label}说明`}><CircleHelp className="size-3.5" /></button></Tooltip> : null}</span><strong className="text-sm font-medium">{value}</strong></div>
}

function OrdersTable({ orders }: { orders: PaymentOrder[] }) {
  return <><div className="grid gap-3 md:hidden">{orders.map(order => <OrderMobileItem key={order.id} amount={formatMoney(order.totalAmount ?? order.amount)} createdAt={order.createdAt} detailUrl={`/account/orders/${encodeURIComponent(order.id)}`} orderNumber={order.merOrderTid} product={orderProductLabel(order)} status={order.statusText} statusVariant={order.status === "paid" ? "success" : order.status === "pending" ? "warning" : order.status === "failed" ? "danger" : "neutral"} />)}</div><div className="hidden md:block"><SimpleTable caption="订单列表" columns={["订单", "套餐", "金额", "状态", "创建时间", "操作"]} rows={orders} rowKey={(order) => order.id} cells={(order) => [<span className="font-mono text-xs">{order.merOrderTid}</span>, <>{orderProductLabel(order)}</>, <>{formatMoney(order.totalAmount ?? order.amount)}</>, <Badge tone={order.status === "paid" ? "neutral" : "neutral"}>{order.statusText}</Badge>, <>{formatDate(order.createdAt)}</>, <div className="flex justify-end"><DataTableRowActions detail={<Button asChild variant="ghost" size="icon"><Link to={`/account/orders/${encodeURIComponent(order.id)}`} aria-label="查看订单详情"><Eye /></Link></Button>} /></div>]} /></div></>
}
