import * as React from "react"
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { ArrowLeft, Check, CheckCircle, Gauge, LinkIcon, Loader2, MonitorSmartphone, PackagePlus, Rocket, ShieldCheck, Tag, TriangleAlert } from "lucide-react"
import { toast } from "@/components/features/toast"

import { ApiError, clearJsonCache, fetchJson, postJson } from "@/api"
import { FaqSection } from "@/components/arc/blocks/faq-section/faq-section"
import { SiteFooter } from "@/components/arc/blocks/site-footer/site-footer"
import { SiteHeader } from "@/components/arc/blocks/site-header/site-header"
import { DOCS_URL } from "@/lib/docs-site"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { RadioCards } from "@/components/arc/radio-cards/radio-cards"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/arc/slider/slider"
import { EmptyState } from "@/components/features/shared"
import { CopyButton } from "@/components/arc/copy-button/copy-button"
import { BentoButton } from "@/components/features/bento-button"
import { PlanOfferCard } from "@/components/features/plan-offer-card"
import { CategoryPills } from "@/components/features/category-pills"
import { vipLevelLabel } from "@/components/features/vip-badge"
import type { CatalogV2AddonCategory, CatalogV2Product, FaqSetting } from "@/types"
import { formatDate, formatMoney, orderProductLabel } from "@/utils"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog"
import SegmentedControl from "@/components/arc/segmented-control/segmented-control"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Input } from "@/components/arc/input/input"
import { Card as ArcCard } from "@/components/arc/card/card"

const periods = [
  { id: "monthly", label: "月付", days: "30天", suffix: "30", months: 1 },
  { id: "quarterly", label: "季付", days: "90天", suffix: "90", months: 3 },
  { id: "half_yearly", label: "半年付", days: "180天", suffix: "180", months: 6 },
  { id: "yearly", label: "年付", days: "360天", suffix: "360", months: 12 },
] as const

const inlinePlanBadgeClass = "h-[18px] rounded-sm px-1.5 py-0 text-[11px] leading-[18px]"

function BillingDiscount({ monthlyPrice, totalPrice, months }: { monthlyPrice: number; totalPrice: number; months: number }) {
  if (months === 1) return null
  const percent = Math.max(0, Math.round((1 - totalPrice / (monthlyPrice * months)) * 100))
  return percent ? <Badge tone="danger" className={inlinePlanBadgeClass}>-{percent}%</Badge> : null
}

function billingMonths(optionId: string) {
  return periods.find(period => optionId.endsWith(`-${period.suffix}`))?.months || 1
}

function lifetimeTrafficLabel(bytes: number | undefined, fallback: string) {
  const value = Number(bytes)
  if (Number.isFinite(value) && value >= 0) {
    if (value === 0) return "不限"
    const gb = value / 1024 ** 3
    return `${Number.isInteger(gb) ? gb : Number(gb.toFixed(2))}G`
  }
  return fallback
}

const defaultPlans = [
  { id: "basic", name: "BASIC", title: "基本套餐", description: "适合轻量网页浏览和社交软件", traffic: "每月 100G", devices: [1, 2, 3, 3], prices: [39, 109, 199, 369], optionIds: ["basic-30", "basic-90", "basic-180", "basic-360"], recurringAvailable: true, lifetimeName: "BASIC 不限时", lifetimeTitle: "固定流量不限时长", lifetimeDescription: "流量用完为止，不设到期时间", lifetimeTraffic: "100G 固定流量", lifetimeTrafficBytes: 100 * 1024 ** 3, lifetimePrice: 79, lifetimeOptionId: "basic-lifetime", lifetimeAvailable: true, lifetimeDevices: 1, features: ["基础线路", "流媒体支持", "在线客服"], unavailableFeatures: ["稳定 GPT 解锁", "国际内网专线", "独享级带宽体验"] },
  { id: "pro", name: "PRO", title: "高级套餐", description: "优质节点与稳定流媒体体验", recommended: true, traffic: "每月 200G", devices: [3, 3, 5, 5], prices: [49, 129, 229, 429], optionIds: ["pro-30", "pro-90", "pro-180", "pro-360"], recurringAvailable: true, lifetimeName: "PRO 不限时", lifetimeTitle: "固定流量不限时长", lifetimeDescription: "流量用完为止，不设到期时间", lifetimeTraffic: "200G 固定流量", lifetimeTrafficBytes: 200 * 1024 ** 3, lifetimePrice: 95, lifetimeOptionId: "pro-lifetime", lifetimeAvailable: true, lifetimeDevices: 3, lifetimeRecommended: true, features: ["优质节点", "普通专线连接", "稳定 GPT 解锁"], unavailableFeatures: ["国际内网专线", "独享级带宽体验"] },
  { id: "ultra", name: "ULTRA", title: "极致套餐", description: "国际内网专线与低延迟体验", traffic: "每月 300G", devices: [1, 2, 3, 3], prices: [89, 239, 449, 859], optionIds: ["ultra-30", "ultra-90", "ultra-180", "ultra-360"], recurringAvailable: true, lifetimeName: "ULTRA 不限时", lifetimeTitle: "固定流量不限时长", lifetimeDescription: "流量用完为止，不设到期时间", lifetimeTraffic: "300G 固定流量", lifetimeTrafficBytes: 300 * 1024 ** 3, lifetimePrice: 129, lifetimeOptionId: "ultra-lifetime", lifetimeAvailable: true, lifetimeDevices: 1, features: ["国际内网专线", "独享级带宽体验", "专属客服支持"], unavailableFeatures: [] },
]

const defaultPricingFaqs: FaqSetting[] = [
  { id: "devices", question: "“在线IP数量”是指什么？", answer: "指同一订阅可同时在线的 IP 数量，同一网络下的多个设备通常只占用一个 IP；具体数量以所选套餐和计费周期显示为准。" },
  { id: "gpt", question: "哪些套餐支持 GPT 解锁？", answer: "当前 PRO 套餐明确包含稳定 GPT 解锁。其他套餐能力请以套餐卡片的功能列表为准；实际可用性可能受目标平台策略和网络环境影响。" },
  { id: "discount", question: "季度、半年和年度套餐如何计算优惠？", answer: "页面折扣以月付价格乘以对应月数作为基准计算，周期价格旁的百分比就是相比连续月付节省的比例。" },
  { id: "renewal", question: "套餐未到期时再次购买会怎样？", answer: "新套餐支付成功后会立即覆盖当前套餐，原套餐剩余有效期和流量不再保留。提交订单前会要求再次确认。" },
  { id: "delivery", question: "支付后多久生效？可以退款吗？", answer: "支付成功并完成确认后套餐会自动生效。套餐属于即时交付的数字商品，购买后不支持退款。" },
]

export function PricingPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const inAccount = location.pathname.startsWith("/account")
  const [plans, setPlans] = React.useState<typeof defaultPlans>([])
  const [addOnProducts, setAddOnProducts] = React.useState<CatalogV2Product[]>([])
  const [addOnCategories, setAddOnCategories] = React.useState<CatalogV2AddonCategory[]>([])
  const [addOnFilter, setAddOnFilter] = React.useState("all")
  const [pricingFaqs, setPricingFaqs] = React.useState(defaultPricingFaqs)
  const [periodIndex, setPeriodIndex] = React.useState(0)
  const [planMode, setPlanMode] = React.useState<"recurring" | "lifetime">("recurring")
  const addOnsRef = React.useRef<HTMLElement>(null)

  // Links such as the overview's "购买流量包" open this page at the add-ons once they have loaded.
  React.useEffect(() => {
    if (location.hash === "#addons" && addOnProducts.length) addOnsRef.current?.scrollIntoView({ block: "start" })
  }, [addOnProducts.length, location.hash])

  React.useEffect(() => {
    fetchJson<CatalogV2Product[]>("/api/public/catalog-v2").then(rows => {
      setAddOnProducts(rows.filter(row => row.type === "addon" && row.stock !== 0))
      setPlans(rows.filter(row => row.type !== "addon" && row.stock !== 0).map(row => {
        const included = row.features.filter(feature => feature.isIncluded).map(feature => feature.label)
        const excluded = row.features.filter(feature => !feature.isIncluded).map(feature => feature.label)
        const prices = [Number.NaN, Number.NaN, Number.NaN, Number.NaN]
        const devices = [0, 0, 0, 0]
        const optionIds = ["", "", "", ""]
        for (const period of row.periods.filter(period => period.isEnabled)) {
          const index = periods.findIndex(item => Number(item.suffix) === period.durationDays)
          if (index >= 0) { prices[index] = period.priceCents / 100; devices[index] = period.deviceLimit; optionIds[index] = `v2:${row.id}:${period.id}` }
        }
        const firstPeriod = row.periods.find(period => period.isEnabled)
        return {
          ...defaultPlans[0], id: row.id, name: row.name, title: row.type === "lifetime_plan" ? "固定流量不限时长" : "周期性套餐", description: row.description,
          recommended: row.type === "recurring_plan" && row.isRecommended, recurringAvailable: row.type === "recurring_plan", prices, devices, optionIds,
          traffic: firstPeriod?.trafficBytes === null ? "不限" : firstPeriod ? `${Number((firstPeriod.trafficBytes / 1024 ** 3).toFixed(2))}G/月` : "-",
          features: included, unavailableFeatures: excluded,
          lifetimeName: row.name, lifetimeTitle: "固定流量不限时长", lifetimeDescription: row.description,
          lifetimeTraffic: lifetimeTrafficLabel(row.trafficBytes ?? undefined, "-"), lifetimeTrafficBytes: row.trafficBytes ?? undefined,
          lifetimePrice: row.type === "lifetime_plan" ? Number(row.priceCents) / 100 : Number.NaN, lifetimeOptionId: `v2:${row.id}`,
          lifetimeAvailable: row.type === "lifetime_plan", lifetimeDevices: row.deviceLimit || 0, lifetimeRecommended: row.type === "lifetime_plan" && row.isRecommended,
          lifetimeFeatures: included, lifetimeUnavailableFeatures: excluded,
        }
      }))
    }).catch(() => { setPlans([]); setAddOnProducts([]) })
    fetchJson<CatalogV2AddonCategory[]>("/api/public/catalog-v2/addon-categories").then(setAddOnCategories).catch(() => setAddOnCategories([]))
    fetchJson<{ faqs: FaqSetting[] }>("/api/public/sales-settings").then(data => setPricingFaqs(data.faqs)).catch(() => undefined)
  }, [])

  React.useEffect(() => {
    setPeriodIndex(0)
    setPlanMode("recurring")
  }, [location.key])

  function selectPlanMode(value: string) {
    setPlanMode(value === "lifetime" ? "lifetime" : "recurring")
  }

  const displayedPlanModes = [planMode === "lifetime"]
  const addOnGroups = [
    ...addOnCategories.map(category => ({ id: category.id, name: category.name, products: addOnProducts.filter(product => product.addonCategoryId === category.id) })),
    { id: "uncategorized", name: "其他服务", products: addOnProducts.filter(product => !addOnCategories.some(category => category.id === product.addonCategoryId)) },
  ].filter(group => group.products.length)
  const showAddOnGroupTitles = addOnGroups.some(group => group.id !== "uncategorized")
  const activeAddOnFilter = addOnGroups.some(group => group.id === addOnFilter) ? addOnFilter : "all"
  const visibleAddOnGroups = activeAddOnFilter === "all" ? addOnGroups : addOnGroups.filter(group => group.id === activeAddOnFilter)
  const PageRoot = inAccount ? "div" : "main"

  return (
    <>
    {/* The public price list is a standalone page, so it carries the site header and footer; inside the user centre the shell provides them. */}
    {inAccount ? null : <SiteHeader variant="simple" label="站点导航" brand={{ name: "NEXORA", href: "/pricing", mark: <></> }} items={[]} secondaryAction={{ label: "登录", href: "/login" }} primaryAction={{ label: "注册", href: "/register" }} onNavigate={destination => { if (destination.href?.startsWith("/")) navigate(destination.href) }} />}
    <PageRoot className={inAccount ? "pt-4" : "min-h-svh bg-background px-4 py-8 text-foreground md:py-20"}>
      <section className={inAccount ? "grid w-full min-w-0 gap-6" : "grid w-full min-w-0 gap-2"}>
        {displayedPlanModes.map(lifetime => {
          const visiblePlans = plans.filter(plan => lifetime ? plan.lifetimeAvailable && Number.isFinite(plan.lifetimePrice) : plan.recurringAvailable && Number.isFinite(plan.prices[periodIndex]))
          // Stable key: remounting on mode change would rebuild the selectors and skip their highlight animation.
          return <section key="plans" className={inAccount ? "grid gap-12" : "contents"}>
            <header className="grid min-w-0 justify-items-center gap-4 text-center">
              <h1 className="text-2xl font-semibold sm:text-3xl md:text-4xl">{inAccount ? lifetime ? "不限时套餐" : "周期性套餐" : "定制您的套餐"}</h1>
              <p className="text-sm text-muted-foreground sm:text-base">{inAccount ? lifetime ? "不设到期时间 流量用完为止" : "按付款周期计费 每月重置流量" : "选择流量版本与计费周期，支付成功后立即生效。"}</p>
              <div className="flex min-w-0 w-full flex-col items-center justify-center gap-2 sm:w-auto sm:flex-row">
                {!inAccount && !lifetime ? <SegmentedControl label="计费周期" value={periods[periodIndex].id} onValueChange={value => setPeriodIndex(periods.findIndex(item => item.id === value))} options={periods.map(item => ({ value: item.id, label: item.label }))} /> : null}
                <SegmentedControl label="套餐类型" value={planMode} onValueChange={selectPlanMode} options={[
                  { value: "recurring", label: "周期性套餐" },
                  { value: "lifetime", label: "不限时套餐", accessory: <Badge tone="danger">限量</Badge> },
                ]} />
              </div>
            </header>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visiblePlans.map(plan => {
                const displayedPrice = lifetime ? plan.lifetimePrice : plan.prices[periodIndex]
                const checkoutOption = lifetime ? plan.lifetimeOptionId : plan.optionIds[periodIndex]
                const specs = [
                  { label: lifetime ? "固定流量" : "每月流量", value: lifetime ? plan.lifetimeTraffic : plan.traffic.replace(/\/月$/, ""), icon: Gauge, color: "sky" },
                  { label: "在线IP数量", value: (lifetime ? plan.lifetimeDevices : plan.devices[periodIndex]) || "-", icon: MonitorSmartphone, color: "violet" },
                ]
                const features = [
                  ...(lifetime ? plan.lifetimeFeatures || [] : plan.features).map(label => ({ label })),
                  ...(lifetime ? plan.lifetimeUnavailableFeatures || [] : plan.unavailableFeatures).map(label => ({ label, available: false })),
                ]
                return <PlanOfferCard
                  key={plan.id}
                  title={lifetime ? plan.lifetimeName : plan.name}
                  description={lifetime ? plan.lifetimeDescription : plan.description}
                  price={`￥${Number.isFinite(displayedPrice) ? displayedPrice : "—"}`}
                  priceUnit={`/ ${lifetime ? "不限时" : periods[periodIndex].days}`}
                  priceExtra={!lifetime ? <BillingDiscount monthlyPrice={plan.prices[0]} totalPrice={plan.prices[periodIndex]} months={periods[periodIndex].months} /> : null}
                  specs={specs}
                  featuresTitle="套餐内容"
                  features={features}
                  action={Number.isFinite(displayedPrice) ? <BentoButton asChild>{inAccount ? <Link to={`/account/plans/checkout?option=${checkoutOption}`}>{lifetime ? "选择套餐" : "选择计费周期"}</Link> : <Link to="/login?returnTo=/account/plans">登录后购买</Link>}</BentoButton> : <BentoButton disabled>当前周期未开放</BentoButton>}
                />
              })}
              {visiblePlans.length ? null : <EmptyState title="当前暂无可购买套餐" description="请稍后再试或联系客服。" />}
            </div>
          </section>
        })}
        {inAccount ? <section ref={addOnsRef} id="addons" className="grid scroll-mt-20 gap-4">
          <header className="grid gap-1"><h2 className="text-xl font-semibold">附加服务</h2><p className="text-sm text-muted-foreground">按需购买额外服务，不影响当前套餐。</p></header>
          {showAddOnGroupTitles ? <CategoryPills label="附加服务分类" value={activeAddOnFilter} onValueChange={setAddOnFilter} options={[{ value: "all", label: "全部商品" }, ...addOnGroups.map(group => ({ value: group.id, label: group.name }))]} /> : null}
          {visibleAddOnGroups.map(group => <section key={group.id} aria-label={showAddOnGroupTitles && activeAddOnFilter === "all" ? undefined : group.id === "uncategorized" ? "附加服务" : group.name} className="grid gap-3">
          {showAddOnGroupTitles && activeAddOnFilter === "all" ? <h3 className="text-base font-medium">{group.name}</h3> : null}
          <div className="grid gap-4 md:grid-cols-2">
            {group.products.map(product => <Card key={product.id} title={<><PackagePlus className="size-5" />{product.name}</>} description={product.description || "附加服务"}><div className="grid gap-4"><p className="text-2xl font-semibold">{formatMoney(Number(product.priceCents || 0) / 100)} <span className="text-sm font-normal text-muted-foreground">/ 次</span></p>{product.features.filter(feature => feature.isIncluded).map(feature => <p key={feature.label} className="flex items-center gap-2 text-sm"><Check className="size-4" />{feature.label}</p>)}{product.deliveryDescription ? <p className="text-sm text-muted-foreground">{product.deliveryDescription}</p> : null}<Button variant="secondary" asChild><Link to={`/account/plans/checkout?option=${encodeURIComponent(`v2:${product.id}`)}`}>购买服务</Link></Button></div></Card>)}
          </div>
          </section>)}
        </section> : null}
        {pricingFaqs.length ? <FaqSection variant="accordion" title="常见问题" items={pricingFaqs.map(item => ({ id: item.id, question: item.question, answer: item.answer }))} contact={null} /> : null}
      </section>
    </PageRoot>
    {inAccount ? null : <SiteFooter variant="minimal" brand={{ name: "NEXORA", href: "/pricing", mark: <></> }} tagline="" links={[{ label: "登录", href: "/login" }, { label: "注册", href: "/register" }, { label: "使用文档", href: DOCS_URL }]} newsletter={null} status={null} socials={[]} />}
    </>
  )
}

// Traffic customization is charged per 30 days; periods longer than 30 days show "monthly × months = total".
function trafficCustomizationLabel(quote: CheckoutQuote) {
  const months = (quote.durationDays || 0) / 30
  if (months <= 1 || !quote.trafficCustomizationMonthlyAmount) return formatMoney(quote.trafficCustomizationAmount)
  return `${formatMoney(quote.trafficCustomizationMonthlyAmount)} × ${Number(months.toFixed(2))} = ${formatMoney(quote.trafficCustomizationAmount)}`
}

// Recomputes a V2 plan quote for another cycle, traffic tier or balance choice with the same rules as catalogV2Quote and
// quoteWithWallet on the server, so the page updates at once; the server quote that follows replaces it. Returns null when the
// quote cannot be previewed (add-ons, traffic packs, home IP, or an unknown cycle).
function previewCheckoutQuote(quote: CheckoutQuote, { optionId, trafficTier, useBalance, keepCoupon }: { optionId: string; trafficTier: number; useBalance: boolean; keepCoupon: boolean }): CheckoutQuote | null {
  const cycle = quote.cycles.find(item => item.optionId === optionId)
  if (!cycle || quote.trafficStepPrice === undefined || quote.purchaseAction === "add_on" || !quote.wallet) return null
  const steps = cycle.trafficGb == null || (quote.trafficMaxTier || 1) <= 1 ? 0 : Math.min(Math.max(Math.trunc(trafficTier) - 1, 0), (quote.trafficMaxTier || 1) - 1)
  const stepPriceCents = Math.round(quote.trafficStepPrice * 100)
  const customizationCents = Math.round(steps * stepPriceCents * (cycle.durationDays || 0) / 30)
  const originalCents = Math.round(cycle.amount * 100) + customizationCents
  const discountPercent = keepCoupon ? quote.discountPercent : 0
  const discountCents = Math.round(originalCents * discountPercent / 100)
  const afterCouponCents = originalCents - discountCents
  const subtotalCents = Math.round(afterCouponCents * (100 - quote.vipDiscountPercent) / 100)
  const taxCents = Math.round(subtotalCents * quote.taxRate / 100)
  const payableCents = subtotalCents + taxCents
  const giftCents = useBalance ? Math.min(payableCents, Math.round(quote.wallet.availableGiftBalance * 100)) : 0
  const referralCents = useBalance ? Math.min(payableCents - giftCents, Math.round(quote.wallet.availableReferralBalance * 100)) : 0
  const cashCents = useBalance ? Math.min(payableCents - giftCents - referralCents, Math.round(quote.wallet.availableCashBalance * 100)) : 0
  const trafficGb = cycle.trafficGb == null ? null : cycle.trafficGb + steps * (quote.trafficStepGb || 0)
  return {
    ...quote,
    optionId: cycle.optionId,
    optionLabel: cycle.label,
    devices: cycle.devices || 0,
    durationDays: cycle.durationDays,
    traffic: trafficGb == null ? quote.traffic : `${Number(trafficGb.toFixed(2))} GB`,
    trafficTier: steps + 1,
    trafficBaseGb: cycle.trafficGb == null ? quote.trafficBaseGb : Number(cycle.trafficGb.toFixed(2)),
    trafficGb: trafficGb ?? undefined,
    baseAmount: cycle.amount,
    trafficCustomizationAmount: customizationCents / 100,
    trafficCustomizationMonthlyAmount: steps * stepPriceCents / 100,
    originalAmount: originalCents / 100,
    couponCode: keepCoupon ? quote.couponCode : "",
    discountPercent,
    discountAmount: discountCents / 100,
    vipDiscountAmount: (afterCouponCents - subtotalCents) / 100,
    subtotal: subtotalCents / 100,
    taxAmount: taxCents / 100,
    beforeCreditAmount: payableCents / 100,
    planAmount: payableCents / 100,
    payableAmount: payableCents / 100,
    walletGiftAmount: giftCents / 100,
    walletReferralAmount: referralCents / 100,
    walletCashAmount: cashCents / 100,
    walletAmount: (giftCents + referralCents + cashCents) / 100,
    amount: (payableCents - giftCents - referralCents - cashCents) / 100,
  }
}

type CheckoutQuote = {
  optionId: string
  planName: string
  optionLabel: string
  title: string
  description: string
  traffic: string
  features: string[]
  devices: number
  unlimited?: boolean
  fulfillment?: { mode: "automatic" | "manual" | null; handler: "traffic_credit" | "custom_node" | "manual" | null }
  selectedAddOnSnapshots?: Array<{ buyerInputLabel?: string }>
  originalAmount: number
  baseAmount?: number
  trafficCustomizationAmount: number
  trafficCustomizationMonthlyAmount?: number
  durationDays?: number | null
  trafficTier?: number
  trafficBaseGb?: number
  trafficStepGb?: number
  trafficGb?: number
  trafficMaxTier?: number
  trafficStepPrice?: number
  trafficTierMarkupPercent?: number
  discountAmount: number
  vipLevel: string
  vipDiscountPercent: number
  vipDiscountAmount: number
  subtotal: number
  taxRate: number
  taxAmount: number
  beforeCreditAmount: number
  purchaseAction: "initial" | "extend" | "replace" | "add_on"
  payableAmount: number
  walletAmount: number
  walletCashAmount: number
  walletGiftAmount: number
  walletReferralAmount: number
  wallet: { availableBalance: number; availableCashBalance: number; availableGiftBalance: number; availableReferralBalance: number }
  amount: number
  planAmount?: number
  addOnAmount?: number
  selectedAddOns?: string[]
  availableAddOns?: Array<{ id: string; name: string; description: string; amount?: number; available: boolean; unavailableReason?: string; options?: Array<{ id: string; label: string; amount: number }> }>
  couponCode: string
  discountPercent: number
  cycles: Array<{ optionId: string; label: string; amount: number; devices: number; durationDays?: number | null; trafficGb?: number | null }>
}

export function CheckoutPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const trafficPack = searchParams.get("product") === "traffic-pack"
  const homeIp = searchParams.get("product") === "home-ip"
  const standaloneAddOn = trafficPack || homeIp
  const initialOptionId = trafficPack ? "traffic-pack" : searchParams.get("option") || ""
  const [optionId, setOptionId] = React.useState(initialOptionId)
  const [quote, setQuote] = React.useState<CheckoutQuote | null>(null)
  const [couponCode, setCouponCode] = React.useState("")
  const [couponError, setCouponError] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [validatingCoupon, setValidatingCoupon] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const submissionStartingRef = React.useRef(false)
  const [useBalance, setUseBalance] = React.useState(true)
  const [trafficTier, setTrafficTier] = React.useState(() => Math.max(1, Math.trunc(Number(searchParams.get("traffic"))) || 1))
  const [replacementOpen, setReplacementOpen] = React.useState(false)
  const [buyerInput, setBuyerInput] = React.useState("")
  const [buyerInputError, setBuyerInputError] = React.useState("")

  // Re-quoting keeps the controls enabled so the page does not flash a disabled state on every change; only the latest request
  // updates the quote, and submitting waits for it.
  const quoteRequestRef = React.useRef(0)
  const quotePendingRef = React.useRef<Promise<void> | null>(null)
  // The last quote the server returned; a local preview falls back to it when the re-quote fails.
  const serverQuoteRef = React.useRef<CheckoutQuote | null>(null)
  const serverUseBalanceRef = React.useRef(true)

  // Shows the locally computed price for a change right away, before the server quote for it arrives.
  function previewQuote(change: { optionId?: string; trafficTier?: number; useBalance?: boolean; keepCoupon?: boolean }) {
    if (!quote || standaloneAddOn) return
    const preview = previewCheckoutQuote(serverQuoteRef.current || quote, { optionId: change.optionId ?? optionId, trafficTier: change.trafficTier ?? trafficTier, useBalance: change.useBalance ?? useBalance, keepCoupon: change.keepCoupon ?? Boolean(quote.couponCode) })
    if (preview) setQuote(preview)
  }

  function loadQuote(code = "", nextOptionId = optionId, nextUseBalance = useBalance, nextTrafficTier = trafficTier) {
    const request = ++quoteRequestRef.current
    setCouponError("")
    const pending = (async () => {
      try {
        const nextQuote = await postJson<CheckoutQuote>("/api/orders/quote", trafficPack ? { product: "traffic_pack", useBalance: nextUseBalance } : homeIp ? { product: "home_ip", optionId: nextOptionId, useBalance: nextUseBalance } : { optionId: nextOptionId, couponCode: code, useBalance: nextUseBalance, addOns: [], trafficTier: nextTrafficTier })
        if (request !== quoteRequestRef.current) return
        serverQuoteRef.current = nextQuote
        serverUseBalanceRef.current = nextUseBalance
        setQuote(nextQuote)
        setOptionId(nextQuote.optionId)
        if (code) toast({ type: "success", title: "优惠码已应用" })
      } catch (error) {
        if (request !== quoteRequestRef.current) return
        const message = error instanceof Error ? error.message : "获取结算信息失败"
        // Undo the preview: show the last price the server confirmed, with the choices it was quoted for.
        const confirmed = serverQuoteRef.current
        if (confirmed) {
          setQuote(confirmed)
          setOptionId(confirmed.optionId)
          setTrafficTier(confirmed.trafficTier || 1)
          setUseBalance(serverUseBalanceRef.current)
        }
        if (code) setCouponError(message)
        else toast({ type: "error", title: message })
      } finally {
        if (request === quoteRequestRef.current) setLoading(false)
      }
    })()
    quotePendingRef.current = pending
    return pending
  }

  React.useEffect(() => {
    void loadQuote("", initialOptionId)
  }, [initialOptionId])

  function selectCycle(nextOptionId: string) {
    setOptionId(nextOptionId)
    if (quote?.couponCode) setCouponCode("")
    previewQuote({ optionId: nextOptionId, keepCoupon: false })
    void loadQuote("", nextOptionId)
  }

  function changeTrafficTier(value: number) {
    setTrafficTier(value || 1)
    previewQuote({ trafficTier: value || 1 })
  }

  function selectTrafficTier(values: number[]) {
    const nextTier = values[0] || 1
    setTrafficTier(nextTier)
    previewQuote({ trafficTier: nextTier })
    void loadQuote(quote?.couponCode || "", optionId, useBalance, nextTier)
  }

  async function validateCoupon() {
    setValidatingCoupon(true)
    try {
      await loadQuote(couponCode)
    } finally {
      setValidatingCoupon(false)
    }
  }

  async function submitOrder(confirmReplacement = false) {
    if (!quote || submissionStartingRef.current) return
    const buyerInputLabel = quote.selectedAddOnSnapshots?.[0]?.buyerInputLabel
    if (buyerInputLabel && !buyerInput.trim()) {
      setBuyerInputError(`请填写${buyerInputLabel}`)
      document.getElementById("checkout-buyer-input")?.focus()
      return
    }
    submissionStartingRef.current = true
    setSubmitting(true)
    try {
      await quotePendingRef.current
      const pending = (await fetchJson<Array<{ id: string; status: string }>>("/api/account/orders")).find(order => order.status === "pending")
      if (pending) {
        navigate(`/account/orders/${encodeURIComponent(pending.id)}`)
        return
      }
      const order = await postJson<{ id: string }>("/api/orders", {
        product: trafficPack ? "traffic_pack" : homeIp ? "home_ip" : "plan",
        optionId, couponCode: quote.couponCode, addOns: [], trafficTier, useBalance, confirmReplacement, buyerInput,
        expectedAmount: quote.payableAmount,
      })
      clearJsonCache()
      window.dispatchEvent(new Event("payment-order-updated"))
      navigate(`/cashier/${encodeURIComponent(order.id)}`)
    } catch (error) {
      // The price changed after this page loaded: show the new quote and let the customer submit again.
      if (error instanceof ApiError && error.status === 409 && error.body.quote) {
        quoteRequestRef.current++
        serverQuoteRef.current = error.body.quote as CheckoutQuote
        setQuote(error.body.quote as CheckoutQuote)
        toast({ type: "warning", title: error.message })
      } else toast({ type: "error", title: error instanceof Error ? error.message : "提交订单失败" })
    } finally {
      submissionStartingRef.current = false
      setSubmitting(false)
    }
  }

  function confirmOrder() {
    if (quote?.purchaseAction === "replace") setReplacementOpen(true)
    else void submitOrder()
  }

  if (loading && !quote) return <main className="grid min-h-72 place-items-center"><Loader2 className="animate-spin" /></main>
  if (!quote) return <EmptyState scene="map" compact={false} title={trafficPack ? "流量包不可用" : homeIp ? "家宽 IP 不可用" : "套餐不可用"} description={standaloneAddOn ? "请确认当前有生效中的周期性套餐，并检查商品是否已上架。" : "请返回套餐页重新选择。"} />
  const isStandaloneAddOn = standaloneAddOn || quote.purchaseAction === "add_on"
  const monthlyPrice = quote.cycles.find(cycle => cycle.durationDays === 30 || billingMonths(cycle.optionId) === 1 && cycle.optionId.endsWith("-30"))?.amount || quote.originalAmount
  // V2 tiers add trafficStepGb per step; legacy plans have no step and multiply the base traffic.
  const selectedTrafficGb = Number(((quote.trafficBaseGb || 0) + (trafficTier - 1) * (quote.trafficStepGb ?? quote.trafficBaseGb ?? 0)).toFixed(2))
  const buyerInputLabel = quote.selectedAddOnSnapshots?.[0]?.buyerInputLabel || ""
  const couponApplied = Boolean(quote.couponCode && quote.couponCode === couponCode.trim().toUpperCase())
  const actionMessage = quote.purchaseAction === "add_on"
    ? quote.fulfillment?.mode === "automatic" ? "支付成功后附加服务将自动发放。" : "支付成功后将进入人工交付。"
    : quote.purchaseAction === "replace"
    ? "新套餐支付成功后将立即覆盖当前套餐，原套餐剩余有效期和流量不再保留。"
    : "付款成功后套餐立即生效。"

  return (
    <div className="px-4 lg:px-6">
      <section className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-5">
        <header className="grid gap-1 lg:col-span-5"><h1 className="text-2xl font-semibold tracking-tight">确认订单</h1><p className="text-sm text-muted-foreground">{trafficPack ? "确认流量包信息后提交订单" : homeIp ? "选择服务地区并确认人工交付信息" : "确认商品、计费周期与优惠信息后提交订单"}</p><Separator className="mt-3" /></header>
        {quote.purchaseAction !== "initial" ? <Alert tone={quote.purchaseAction === "replace" ? "warning" : "info"} className="lg:col-span-5" title={actionMessage} /> : null}
        <section className="grid content-start gap-4 lg:col-span-3">
          <Card title={orderProductLabel({ planName: quote.planName, optionLabel: quote.title === quote.description ? "" : quote.title }, " · ")} description={quote.description}><div className="grid gap-4">
              <div className="grid gap-3 text-sm">{quote.traffic ? <p className="flex items-center gap-2"><Check className="size-4" />{quote.traffic}</p> : null}{quote.devices ? <p className="flex items-center gap-2"><Check className="size-4" />在线IP数量：{quote.devices}</p> : null}{quote.features.map(feature => <p key={feature} className="flex items-center gap-2"><Check className="size-4" />{feature}</p>)}</div>
            </div></Card>
          {buyerInputLabel ? <Card title="下单信息" description="用于人工交付，提交后不可修改，请仔细核对。"><Field data-invalid={Boolean(buyerInputError)}><FieldLabel htmlFor="checkout-buyer-input">{buyerInputLabel}</FieldLabel><Input label="输入" hideLabel id="checkout-buyer-input" required maxLength={200} value={buyerInput} aria-invalid={Boolean(buyerInputError)} aria-describedby={buyerInputError ? "checkout-buyer-input-error" : undefined} onChange={event => { setBuyerInput(event.target.value); setBuyerInputError("") }} disabled={submitting} /><FieldError id="checkout-buyer-input-error">{buyerInputError}</FieldError></Field></Card> : null}
          {isStandaloneAddOn ? null : <Card title={homeIp ? "选择服务地区" : "选择计费周期"} description={homeIp ? "不同地区按后台配置的月费结算，每次服务 30 天。" : "选择适合你的购买周期"}><RadioCards aria-label={homeIp ? "选择服务地区" : "选择计费周期"} value={optionId} onValueChange={selectCycle} layout="grid" minColumnWidth={220} options={quote.cycles.map(cycle => ({ value: cycle.optionId, label: <span className="flex flex-wrap items-center gap-1.5">{quote.unlimited ? <>{cycle.label.replace(/\s*无限流量$/, "")}<Badge className={`${inlinePlanBadgeClass} relative isolate overflow-hidden border-transparent bg-[linear-gradient(135deg,#0ea5e9,#8b5cf6,#ec4899)] bg-clip-padding text-white dark:bg-[linear-gradient(135deg,#0284c7,#7c3aed,#db2777)]`}><span aria-hidden className="premium-shine absolute inset-0" /><span className="relative flex h-full items-center leading-none">无限流量</span></Badge></> : cycle.label}{homeIp ? null : <BillingDiscount monthlyPrice={monthlyPrice} totalPrice={cycle.amount} months={billingMonths(cycle.optionId)} />}</span>, description: <>{formatMoney(cycle.amount)}{cycle.devices ? ` · 在线IP数量：${cycle.devices}` : ""}</> }))} /></Card>}
          {!trafficPack && !quote.lifetime && (quote.trafficMaxTier || 1) > 1 ? <Card title="定制每月流量" description={quote.trafficStepGb ? `每档在套餐默认流量上增加 ${quote.trafficStepGb} GB，价格根据所选流量自动计算。` : "可按套餐默认流量的倍数增加，价格根据所选流量自动计算。"}><div className="grid gap-4">
              <Slider label="每月流量" min={1} max={quote.trafficMaxTier} step={1} value={trafficTier} onValueChange={changeTrafficTier} onValueCommit={value => selectTrafficTier([value])} disabled={submitting} />
              <ArcCard title={`每月 ${selectedTrafficGb} GB`} description="当前选择" headerAction={<><span className="text-xl font-semibold tabular-nums">{formatMoney(quote.originalAmount)}</span></>} />
            </div></Card> : null}
        </section>
        <aside className="grid content-start gap-4 lg:col-span-2">
          {isStandaloneAddOn ? null : <Card title="优惠码" description="优惠码仅适用于基础套餐服务。"><Field><div className="flex gap-2"><div className="min-w-0 flex-1"><Input label="优惠码" hideLabel aria-invalid={Boolean(couponError)} aria-describedby={couponError ? "coupon-error" : couponApplied ? "coupon-success" : undefined} placeholder="输入优惠码（如有）" value={couponCode} onChange={event => { setCouponCode(event.target.value); setCouponError("") }} /></div><ActionButton variant="secondary" onClick={validateCoupon} label="验证" pending={validatingCoupon} /></div><FieldError id="coupon-error">{couponError}</FieldError>{couponApplied ? <FieldDescription id="coupon-success" className="text-emerald-600 dark:text-emerald-500">优惠码验证成功</FieldDescription> : null}</Field></Card>}
          <Card title="订单摘要" description={orderProductLabel(quote, " · ")}><div className="grid gap-4">
              <div className="grid gap-3 text-sm">
                <p className="flex justify-between"><span className="text-muted-foreground">{(quote.trafficTier || 1) > 1 ? `套餐基础价（每月 ${quote.trafficBaseGb} GB）` : "商品原价"}</span><span>{formatMoney(quote.baseAmount ?? quote.originalAmount)}</span></p>
                {(quote.trafficTier || 1) > 1 ? <p className="flex justify-between"><span className="text-muted-foreground">流量定制至每月 {quote.trafficGb} GB</span><span>+{trafficCustomizationLabel(quote)}</span></p> : null}
                {quote.discountAmount ? <p className="flex justify-between"><span className="text-muted-foreground">优惠码 {quote.couponCode}（{quote.discountPercent}%）</span><span>-{formatMoney(quote.discountAmount)}</span></p> : null}
                {isStandaloneAddOn && !quote.vipDiscountAmount ? null : <p className="flex justify-between gap-3"><span className="text-muted-foreground">{vipLevelLabel(quote.vipLevel)} 专属折扣（{quote.vipDiscountPercent}%）</span><span>-{formatMoney(quote.vipDiscountAmount)}</span></p>}
                <p className="flex justify-between"><span className="text-muted-foreground">{isStandaloneAddOn ? "小计" : "优惠后小计"}</span><span>{formatMoney(quote.subtotal)}</span></p>
                {quote.addOnAmount && !isStandaloneAddOn ? <p className="flex justify-between gap-3"><span className="text-muted-foreground">附加服务：{quote.availableAddOns?.filter(addOn => quote.selectedAddOns?.includes(addOn.id)).map(addOn => addOn.name).join("、")}</span><span>+{formatMoney(quote.addOnAmount)}</span></p> : null}
                <p className="flex justify-between"><span className="text-muted-foreground">{quote.taxRate ? `税费（${quote.taxRate}%）` : "税费（免税）"}</span><span>{formatMoney(quote.taxAmount)}</span></p>
                {quote.walletGiftAmount ? <p className="flex justify-between"><span className="text-muted-foreground">赠送余额</span><span>-{formatMoney(quote.walletGiftAmount)}</span></p> : null}
                {quote.walletReferralAmount ? <p className="flex justify-between"><span className="text-muted-foreground">返利余额</span><span>-{formatMoney(quote.walletReferralAmount)}</span></p> : null}
                {quote.walletCashAmount ? <p className="flex justify-between"><span className="text-muted-foreground">充值余额</span><span>-{formatMoney(quote.walletCashAmount)}</span></p> : null}
              </div>
              {quote.wallet.availableBalance > 0 ? <FieldLabel htmlFor="use-wallet" className="min-h-10 w-full cursor-pointer justify-between rounded-md border bg-muted/40 px-3 py-2.5 transition-colors hover:bg-muted/60 has-[[data-disabled]]:cursor-not-allowed">使用余额抵扣<Checkbox id="use-wallet" checked={useBalance} onCheckedChange={checked => { const enabled = checked === true; setUseBalance(enabled); previewQuote({ useBalance: enabled }); void loadQuote(quote.couponCode, optionId, enabled) }} disabled={submitting} /></FieldLabel> : null}
              <Separator />
              <p className="flex justify-between text-base font-semibold"><span>待付金额</span><span>{formatMoney(quote.amount)}</span></p>
              <ActionButton className="min-h-11" onClick={confirmOrder} disabled={submitting} label="提交订单" pendingLabel="正在提交订单…" pending={submitting} />
              <p className="text-xs text-muted-foreground">提交后进入收银台，确认付款后发放服务。</p>
              <Button variant="secondary" onClick={() => navigate(-1)}><ArrowLeft />{isStandaloneAddOn ? "返回服务列表" : "返回服务选择"}</Button>
              <p className="text-xs text-muted-foreground">{trafficPack || quote.purchaseAction === "add_on" && quote.fulfillment?.mode === "automatic" ? "付款成功后流量立即生效，月度重置、续费或更换套餐后失效。" : quote.purchaseAction === "add_on" ? "付款成功后进入人工交付，交付内容可在订单详情查看；数字商品不支持退款。" : homeIp ? "付款成功后进入人工交付，服务有效期以订单快照和交付记录为准。" : "付款成功后套餐立即生效，数字商品不支持退款。"}</p>
            </div></Card>
        </aside>
      </section>
      <Dialog open={replacementOpen} onOpenChange={setReplacementOpen}>
        <DialogContent title="确认覆盖当前套餐？" description={`支付成功后，${quote.planName} 将立即覆盖当前套餐，原套餐剩余有效期和流量不再保留，且无法恢复。`}><div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button variant="secondary" disabled={submitting}>返回检查</Button></DialogClose><DialogClose asChild><Button onClick={() => void submitOrder(true)} disabled={submitting}>{submitting ? <Loader2 className="animate-spin" /> : null}确认并提交订单</Button></DialogClose></div></DialogContent>
      </Dialog>
    </div>
  )
}

export function DeliveryPage() {
  const { token } = useParams()
  const [data, setData] = React.useState<Record<string, any> | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  React.useEffect(() => {
    fetchJson<Record<string, any>>(`/api/public/delivery/${encodeURIComponent(token || "")}`)
      .then(setData)
      .catch(error => setError(error.message))
      .finally(() => setLoading(false))
  }, [token])
  if (loading) return <main className="grid min-h-svh place-items-center"><Loader2 className="animate-spin" /></main>
  if (error || !data) return <main className="grid min-h-svh place-items-center"><EmptyState scene="map" compact={false} title="订阅不存在或已失效" description={error} /></main>
  return (
    <main className="min-h-svh bg-background p-6 text-foreground">
      <section className="mx-auto grid max-w-3xl gap-4">
        <div className="grid gap-2">
          <Badge className="w-fit">NEXORA</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">订阅已生效</h1>
        </div>
        <Card><div className="grid gap-4 md:grid-cols-3">
            <Metric label="到期时间" value={formatDate(data.expiresAt)} />
            <Metric label="套餐等级" value={String(data.lineGroupId || "-").toUpperCase()} />
            <Metric label="VIP 等级" value={vipLevelLabel(data.vipLevel)} />
          </div></Card>
        <Card title={<><LinkIcon />订阅 URL</>}><div className="grid gap-3">
            <code className="truncate rounded bg-muted px-2 py-1 text-sm">{data.subscriptionUrl}</code>
            <CopyButton value={data.subscriptionUrl || ""} disabled={!data.subscriptionUrl} label="复制订阅 URL" />
            <Button variant="secondary" onClick={() => { window.location.href = `shadowrocket://add/${encodeURIComponent(data.subscriptionUrl)}` }}><Rocket />导入 Shadowrocket</Button>
          </div></Card>
        <Card title={<><ShieldCheck />客户端教程</>}><div className="flex flex-wrap gap-2">
            {(data.tutorials || []).map((item: any) => <Button asChild key={`${item.platform}-${item.client}`} variant="secondary"><a href={item.url} target="_blank" rel="noreferrer"><CheckCircle />{item.platform}</a></Button>)}
          </div></Card>
      </section>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="grid gap-1"><span className="text-sm text-muted-foreground">{label}</span><strong>{value}</strong></div>
}
