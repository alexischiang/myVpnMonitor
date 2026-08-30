import * as React from "react"
import { IconBrandAlipay, IconBrandWechat } from "@tabler/icons-react"
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { ArrowLeft, Check, CheckCircle, HousePlug, LinkIcon, Loader2, PackagePlus, Rocket, ShieldCheck, Tag, TriangleAlert, X } from "lucide-react"
import { toast } from "sonner"

import { clearJsonCache, fetchJson, postJson } from "@/api"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CopyButton, EmptyState } from "@/components/features/shared"
import type { FaqSetting, PricingRow } from "@/types"
import { formatDate, formatMoney } from "@/utils"

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
  return percent ? <Badge variant="destructive" className={inlinePlanBadgeClass}>-{percent}%</Badge> : null
}

function billingMonths(optionId: string) {
  return periods.find(period => optionId.endsWith(`-${period.suffix}`))?.months || 1
}

function lifetimeTrafficLabel(bytes: number | undefined, fallback: string) {
  const value = Number(bytes)
  if (Number.isFinite(value) && value >= 0) {
    if (value === 0) return "不限流量"
    const gb = value / 1024 ** 3
    return `${Number.isInteger(gb) ? gb : Number(gb.toFixed(2))}G 固定流量`
  }
  return fallback || "固定流量"
}

const defaultPlans = [
  { id: "basic", name: "BASIC", title: "基本套餐", description: "适合轻量网页浏览和社交软件", traffic: "每月 100G", devices: [1, 2, 3, 3], prices: [39, 109, 199, 369], recurringAvailable: true, lifetimeName: "BASIC 不限时", lifetimeTitle: "固定流量不限时长", lifetimeDescription: "流量用完为止，不设到期时间", lifetimeTraffic: "100G 固定流量", lifetimeTrafficBytes: 100 * 1024 ** 3, lifetimePrice: 79, lifetimeAvailable: true, lifetimeDevices: 1, features: ["基础线路", "流媒体支持", "在线客服"], unavailableFeatures: ["稳定 GPT 解锁", "国际内网专线", "独享级带宽体验"] },
  { id: "pro", name: "PRO", title: "高级套餐", description: "优质节点与稳定流媒体体验", recommended: true, traffic: "每月 200G", devices: [3, 3, 5, 5], prices: [49, 129, 229, 429], recurringAvailable: true, lifetimeName: "PRO 不限时", lifetimeTitle: "固定流量不限时长", lifetimeDescription: "流量用完为止，不设到期时间", lifetimeTraffic: "200G 固定流量", lifetimeTrafficBytes: 200 * 1024 ** 3, lifetimePrice: 95, lifetimeAvailable: true, lifetimeDevices: 3, features: ["优质节点", "普通专线连接", "稳定 GPT 解锁"], unavailableFeatures: ["国际内网专线", "独享级带宽体验"] },
  { id: "ultra", name: "ULTRA", title: "极致套餐", description: "国际内网专线与低延迟体验", traffic: "每月 300G", devices: [1, 2, 3, 3], prices: [89, 239, 449, 859], recurringAvailable: true, lifetimeName: "ULTRA 不限时", lifetimeTitle: "固定流量不限时长", lifetimeDescription: "流量用完为止，不设到期时间", lifetimeTraffic: "300G 固定流量", lifetimeTrafficBytes: 300 * 1024 ** 3, lifetimePrice: 129, lifetimeAvailable: true, lifetimeDevices: 1, features: ["国际内网专线", "独享级带宽体验", "专属客服支持"], unavailableFeatures: [] },
]

const defaultPricingFaqs: FaqSetting[] = [
  { id: "devices", question: "“可使用设备数”是指什么？", answer: "指同一订阅可同时使用的设备数量，手机、电脑和平板等各计为一台；具体数量以所选套餐和计费周期显示为准。" },
  { id: "gpt", question: "哪些套餐支持 GPT 解锁？", answer: "当前 PRO 套餐明确包含稳定 GPT 解锁。其他套餐能力请以套餐卡片的功能列表为准；实际可用性可能受目标平台策略和网络环境影响。" },
  { id: "discount", question: "季度、半年和年度套餐如何计算优惠？", answer: "页面折扣以月付价格乘以对应月数作为基准计算，周期价格旁的百分比就是相比连续月付节省的比例。" },
  { id: "renewal", question: "套餐未到期时再次购买会怎样？", answer: "新套餐支付成功后会立即覆盖当前套餐，原套餐剩余有效期和流量不再保留。提交订单前会要求再次确认。" },
  { id: "delivery", question: "支付后多久生效？可以退款吗？", answer: "支付成功并完成确认后套餐会自动生效。套餐属于即时交付的数字商品，购买后不支持退款。" },
]

export function PricingPage() {
  const location = useLocation()
  const inAccount = location.pathname.startsWith("/account")
  const [plans, setPlans] = React.useState(defaultPlans)
  const [addOnProducts, setAddOnProducts] = React.useState<PricingRow[]>([])
  const [pricingFaqs, setPricingFaqs] = React.useState(defaultPricingFaqs)
  const [periodIndex, setPeriodIndex] = React.useState(0)
  const [planMode, setPlanMode] = React.useState<"recurring" | "lifetime">("recurring")

  React.useEffect(() => {
    fetchJson<PricingRow[]>("/api/public/pricing").then(rows => {
      setAddOnProducts(rows.filter(row => row.availability?.addon && (row.stock === undefined || row.stock > 0)))
      setPlans(rows.filter(row => row.productKind === "plan" && row.testPlan !== true && (row.availability?.recurring || row.availability?.lifetime)).map(row => {
        const defaultPlan = defaultPlans.find(plan => plan.id === row.group) || { id: row.group, name: row.group.toUpperCase(), title: "周期性套餐", description: "", recommended: false, traffic: "", devices: [1, 1, 1, 1], prices: [Number.NaN, Number.NaN, Number.NaN, Number.NaN], lifetimeName: `${row.group.toUpperCase()} 不限时`, lifetimeTitle: "固定流量不限时长", lifetimeDescription: "", lifetimeTraffic: "固定流量", lifetimeTrafficBytes: undefined, lifetimePrice: Number.NaN, lifetimeDevices: 1, features: [], unavailableFeatures: [] }
        return {
          ...defaultPlan,
          id: row.group,
          name: row.name || defaultPlan.name,
          title: row.title || defaultPlan.title,
          description: row.description || defaultPlan.description,
          recommended: Boolean(row.recommended),
          recurringAvailable: row.availability?.recurring === true,
          traffic: row.unlimited ? "无限流量" : row.trafficBaseGb ? `每月 ${row.trafficBaseGb}G，可定制至 ${row.trafficBaseGb * (row.trafficMaxTier || 1)}G` : row.traffic || defaultPlan.traffic,
          features: row.features ?? defaultPlan.features,
          unavailableFeatures: row.unavailableFeatures ?? defaultPlan.unavailableFeatures,
          prices: [row.monthly ?? defaultPlan.prices[0], row.quarterly ?? defaultPlan.prices[1], row.half_yearly ?? defaultPlan.prices[2], row.yearly ?? defaultPlan.prices[3]],
          lifetimeName: row.lifetimeName || defaultPlan.lifetimeName,
          lifetimeTitle: row.lifetimeTitle || defaultPlan.lifetimeTitle,
          lifetimeDescription: row.lifetimeDescription || defaultPlan.lifetimeDescription,
          lifetimeTraffic: row.lifetimeUnlimited ? "无限流量" : lifetimeTrafficLabel(row.lifetimeTrafficBytes ?? defaultPlan.lifetimeTrafficBytes, row.lifetimeTraffic || defaultPlan.lifetimeTraffic),
          lifetimeTrafficBytes: row.lifetimeTrafficBytes ?? defaultPlan.lifetimeTrafficBytes,
          lifetimePrice: row.availability?.lifetime ? row.lifetimePrice ?? defaultPlan.lifetimePrice : Number.NaN,
          lifetimeAvailable: row.availability?.lifetime === true,
          lifetimeDevices: row.lifetimeDevices ?? defaultPlan.lifetimeDevices,
          lifetimeFeatures: row.lifetimeFeatures,
          lifetimeUnavailableFeatures: row.lifetimeUnavailableFeatures,
          devices: [row.monthlyDevices ?? defaultPlan.devices[0], row.quarterlyDevices ?? defaultPlan.devices[1], row.half_yearlyDevices ?? defaultPlan.devices[2], row.yearlyDevices ?? defaultPlan.devices[3]],
        }
      }))
    }).catch(() => undefined)
    fetchJson<{ faqs: FaqSetting[] }>("/api/public/sales-settings").then(data => setPricingFaqs(data.faqs)).catch(() => undefined)
  }, [])

  React.useEffect(() => {
    setPeriodIndex(0)
    setPlanMode("recurring")
  }, [location.key])

  function selectPlanMode(value: string) {
    setPlanMode(value === "lifetime" ? "lifetime" : "recurring")
  }

  const trafficPackProduct = addOnProducts.find(product => product.addonType === "traffic_pack")
  const homeIpProduct = addOnProducts.find(product => product.addonType === "home_ip")
  const otherServices = addOnProducts.filter(product => !["traffic_pack", "home_ip"].includes(product.addonType || ""))
  const visiblePlans = plans.filter(plan => planMode === "lifetime" ? plan.lifetimeAvailable && Number.isFinite(plan.lifetimePrice) : plan.recurringAvailable && Number.isFinite(plan.prices[periodIndex]))

  return (
    <main className={inAccount ? "px-4 lg:px-6" : "min-h-svh bg-background px-4 py-8 text-foreground md:py-20"}>
      <section className="mx-auto grid min-w-0 max-w-6xl gap-8">
        <header className="grid min-w-0 justify-items-center gap-4 text-center">
          <h1 className="text-2xl font-semibold sm:text-3xl md:text-4xl">{inAccount ? "购买套餐" : "定制您的套餐"}</h1>
          <p className="text-sm text-muted-foreground sm:text-base">{inAccount ? "选择基础套餐或按需购买附加服务。" : "选择流量版本与计费周期，支付成功后立即生效。"}</p>
          <div className="flex min-w-0 w-full flex-col justify-center gap-2 sm:w-auto sm:flex-row">
            {planMode === "recurring" ? <Tabs className="min-w-0 w-full sm:w-auto" value={periods[periodIndex].id} onValueChange={value => setPeriodIndex(periods.findIndex(item => item.id === value))}>
              <TabsList className="relative grid min-w-0 w-full grid-cols-4 overflow-hidden">
                <span aria-hidden className="pointer-events-none absolute inset-y-[3px] left-[3px] rounded-md bg-background shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none dark:bg-input/30" style={{ width: "calc((100% - 6px) / 4)", transform: `translateX(${periodIndex * 100}%)` }} />
                {periods.map(item => <TabsTrigger key={item.id} value={item.id} className="relative z-10 min-w-0 px-1 text-xs data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:px-2 sm:text-sm dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent">{item.label}</TabsTrigger>)}
              </TabsList>
            </Tabs> : null}
            <Tabs className="min-w-0 w-full sm:w-auto" value={planMode} onValueChange={selectPlanMode}>
              <TabsList className="relative grid min-w-0 w-full grid-cols-2">
                <span aria-hidden className="pointer-events-none absolute inset-y-[3px] left-[3px] rounded-md bg-background shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none dark:bg-input/30" style={{ width: "calc((100% - 6px) / 2)", transform: `translateX(${planMode === "lifetime" ? 100 : 0}%)` }} />
                <TabsTrigger value="recurring" className="relative z-10 min-w-0 px-1 text-xs data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:px-2 sm:text-sm dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent"><span className="sm:hidden">周期套餐</span><span className="hidden sm:inline">周期性套餐</span></TabsTrigger>
                <TabsTrigger value="lifetime" className="relative z-10 min-w-0 px-1 text-xs data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:px-2 sm:text-sm dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent"><span className="inline-flex min-w-0 items-center gap-1"><span className="sm:hidden">不限时</span><span className="hidden sm:inline">不限时套餐</span><Badge variant="destructive" className="px-1 text-[10px] leading-4">限量</Badge></span></TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </header>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visiblePlans.map(plan => {
            const lifetime = planMode === "lifetime"
            const displayedPrice = lifetime ? plan.lifetimePrice : plan.prices[periodIndex]
            const checkoutOption = lifetime ? `${plan.id}-lifetime` : `${plan.id}-${periods[periodIndex].suffix}`
            return <Card key={plan.id} className={plan.recommended ? "min-w-0 border-foreground" : "min-w-0"}>
            <CardHeader><div className="flex items-center justify-between"><CardTitle>{lifetime ? plan.lifetimeName : plan.name}</CardTitle>{plan.recommended ? <Badge className="bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950">推荐</Badge> : null}</div><p className="text-sm text-muted-foreground">{lifetime ? plan.lifetimeTitle : plan.title}</p><div className="flex flex-wrap items-baseline gap-2 pt-2"><span><span className="text-4xl font-semibold">￥{Number.isFinite(displayedPrice) ? displayedPrice : "—"}</span><span className="text-sm text-muted-foreground"> / {lifetime ? "不限时" : periods[periodIndex].days}</span></span>{!lifetime ? <BillingDiscount monthlyPrice={plan.prices[0]} totalPrice={plan.prices[periodIndex]} months={periods[periodIndex].months} /> : null}</div><p className="text-sm text-muted-foreground sm:min-h-10">{lifetime ? plan.lifetimeDescription : plan.description}</p></CardHeader>
            <CardContent className="grid gap-5">{Number.isFinite(displayedPrice) ? <Button variant={plan.recommended ? "default" : "outline"} asChild>{inAccount ? <Link to={`/account/plans/checkout?option=${checkoutOption}`}>选择套餐</Link> : <Link to="/login?returnTo=/account/plans">登录后购买</Link>}</Button> : <Button disabled>当前周期未开放</Button>}<Separator /><div className="grid gap-3 text-sm"><p className="flex items-center gap-2"><Check className="size-4" />{lifetime ? plan.lifetimeTraffic : plan.traffic}</p><p className="flex items-center gap-2"><Check className="size-4" />可使用设备数：{lifetime ? plan.lifetimeDevices : plan.devices[periodIndex]} 台</p>{(lifetime ? plan.lifetimeFeatures || [] : plan.features).map(feature => <p key={feature} className="flex items-center gap-2"><Check className="size-4" />{feature}</p>)}{(lifetime ? plan.lifetimeUnavailableFeatures || [] : plan.unavailableFeatures).map(feature => <p key={feature} className="flex items-center gap-2 text-muted-foreground"><X className="size-4" /><span className="sr-only">不支持：</span>{feature}</p>)}</div></CardContent>
          </Card>
          })}
        </div>
        {inAccount ? <section className="grid gap-4">
          <header className="grid gap-1"><h2 className="text-xl font-semibold">附加服务</h2><p className="text-sm text-muted-foreground">按需购买额外服务，不影响当前套餐。</p></header>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><PackagePlus className="size-5" />流量包</CardTitle><CardDescription>为当前自研线路固定流量套餐增加本周期流量。</CardDescription></CardHeader>
            <CardContent className="grid gap-4"><p className="text-2xl font-semibold">{formatMoney(Number(trafficPackProduct?.addonPrice || 0))} <span className="text-sm font-normal text-muted-foreground">/ {trafficPackProduct?.addonTrafficGb || 0} GB</span></p><p className="text-sm text-muted-foreground">{trafficPackProduct?.addonDeliveryDescription || "月度重置、续费或更换套餐后失效，同一周期可重复购买。"}</p><Button asChild disabled={!trafficPackProduct}><Link to="/account/plans/checkout?product=traffic-pack">购买流量包</Link></Button></CardContent>
            </Card>
            <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><HousePlug className="size-5" />家宽 IP 定制<Badge variant="secondary">随套餐购买</Badge></CardTitle><CardDescription>{homeIpProduct?.description || "按地区与使用需求定制家庭宽带出口 IP。"}</CardDescription></CardHeader>
            <CardContent className="grid gap-4"><p className="text-sm text-muted-foreground">{homeIpProduct?.addonRegions?.map(region => `${region.name} ${formatMoney(region.price)}`).join(" · ") || "暂无可售地区"}</p><Button asChild variant="outline"><Link to="/account/plans/checkout?product=home-ip">已有周期套餐，单独购买</Link></Button><p className="text-xs text-muted-foreground">新购周期套餐时也可在确认订单页面一起选择。</p></CardContent>
            </Card>
            {otherServices.map(product => <Card key={product.group}>
              <CardHeader><CardTitle className="flex items-center gap-2"><PackagePlus className="size-5" />{product.name || product.group}{product.recommended ? <Badge>推荐</Badge> : null}</CardTitle><CardDescription>{product.title || product.description || "附加服务"}</CardDescription></CardHeader>
              <CardContent className="grid gap-4"><p className="text-2xl font-semibold">{formatMoney(Number(product.addonPrice || 0))} <span className="text-sm font-normal text-muted-foreground">/ {product.addonUnit || "次"}</span></p>{product.description && product.description !== product.title ? <p className="text-sm text-muted-foreground">{product.description}</p> : null}{product.features?.map(feature => <p key={feature} className="flex items-center gap-2 text-sm"><Check className="size-4" />{feature}</p>)}{product.addonDeliveryDescription ? <p className="text-sm text-muted-foreground">{product.addonDeliveryDescription}</p> : null}<Button variant="outline" onClick={() => toast.info("该商品请联系客服购买")}>联系客服购买</Button></CardContent>
            </Card>)}
          </div>
        </section> : null}
        {pricingFaqs.length ? <><Separator /><section className="grid w-full gap-4"><Accordion type="single" collapsible>{pricingFaqs.map(item => <AccordionItem key={item.id} value={item.id}><AccordionTrigger>{item.question}</AccordionTrigger><AccordionContent>{item.answer}</AccordionContent></AccordionItem>)}</Accordion></section></> : null}
        {!inAccount ? <p className="text-center text-sm text-muted-foreground">所有套餐一经支付不支持退款</p> : null}
      </section>
    </main>
  )
}

type PaymentMethod = "100" | "200"
type PaymentPlatform = { id: string; name: string; provider: string; enabled: boolean; ready: boolean; methods: { alipay: boolean; wechat: boolean } }
type PaymentSelection = { platformId: string; method: PaymentMethod }

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
  originalAmount: number
  baseAmount?: number
  trafficTier?: number
  trafficBaseGb?: number
  trafficGb?: number
  trafficMaxTier?: number
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
  wallet: { availableBalance: number }
  amount: number
  planAmount?: number
  addOnAmount?: number
  selectedAddOns?: string[]
  availableAddOns?: Array<{ id: string; name: string; description: string; amount?: number; available: boolean; unavailableReason?: string; options?: Array<{ id: string; label: string; amount: number }> }>
  couponCode: string
  discountPercent: number
  paymentPlatforms: PaymentPlatform[]
  cycles: Array<{ optionId: string; label: string; amount: number; devices: number }>
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
  const [paying, setPaying] = React.useState("")
  const [useBalance, setUseBalance] = React.useState(true)
  const [addOns, setAddOns] = React.useState<string[]>([])
  const [trafficTier, setTrafficTier] = React.useState(1)
  const [paymentPlatformId, setPaymentPlatformId] = React.useState("")
  const [pendingPaymentSelection, setPendingPaymentSelection] = React.useState<PaymentSelection | null>(null)

  async function loadQuote(code = "", nextOptionId = optionId, nextUseBalance = useBalance, nextAddOns = addOns, nextTrafficTier = trafficTier) {
    setLoading(true)
    setCouponError("")
    try {
      const nextQuote = await postJson<CheckoutQuote>("/api/payments/quote", trafficPack ? { product: "traffic_pack", useBalance: nextUseBalance } : homeIp ? { product: "home_ip", optionId: nextOptionId, useBalance: nextUseBalance } : { optionId: nextOptionId, couponCode: code, useBalance: nextUseBalance, addOns: nextAddOns, trafficTier: nextTrafficTier })
      setQuote(nextQuote)
      setOptionId(nextQuote.optionId)
      setPaymentPlatformId(current => nextQuote.paymentPlatforms.some(platform => platform.id === current && platform.ready) ? current : nextQuote.paymentPlatforms.find(platform => platform.ready)?.id || "")
      if (code) toast.success("优惠码已应用")
    } catch (error) {
      const message = error instanceof Error ? error.message : "获取结算信息失败"
      if (code) setCouponError(message)
      else toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    void loadQuote("", initialOptionId)
  }, [initialOptionId])

  function selectCycle(nextOptionId: string) {
    setOptionId(nextOptionId)
    if (quote?.couponCode) setCouponCode("")
    void loadQuote("", nextOptionId)
  }

  function selectAddOn(id: string, checked: boolean) {
    const nextAddOns = checked ? [...addOns, id] : addOns.filter(addOn => addOn !== id)
    setAddOns(nextAddOns)
    void loadQuote(quote?.couponCode || "", optionId, useBalance, nextAddOns)
  }

  function selectAddOnOption(id: string) {
    const nextAddOns = id ? [...addOns.filter(addOn => !addOn.startsWith("home_ip:")), id] : addOns.filter(addOn => !addOn.startsWith("home_ip:"))
    setAddOns(nextAddOns)
    void loadQuote(quote?.couponCode || "", optionId, useBalance, nextAddOns)
  }

  function selectTrafficTier(values: number[]) {
    const nextTier = values[0] || 1
    setTrafficTier(nextTier)
    void loadQuote(quote?.couponCode || "", optionId, useBalance, addOns, nextTier)
  }

  async function validateCoupon() {
    setValidatingCoupon(true)
    try {
      await loadQuote(couponCode)
    } finally {
      setValidatingCoupon(false)
    }
  }

  async function createPayment(selection: PaymentSelection, confirmReplacement = false) {
    if (!quote) return
    let paymentWindow: Window | null = null
    setPaying(`${selection.platformId}:${selection.method}`)
    try {
      const pendingOrder = (await fetchJson<Array<{ id: string; payUrl?: string; status: string }>>("/api/account/orders")).find(order => order.status === "pending")
      if (pendingOrder) {
        if (pendingOrder.payUrl) {
          paymentWindow = window.open("", "_blank")
          if (paymentWindow) {
            paymentWindow.opener = null
            paymentWindow.location.replace(pendingOrder.payUrl)
          } else window.location.assign(pendingOrder.payUrl)
        }
        if (!pendingOrder.payUrl || paymentWindow) navigate(`/account/orders/${encodeURIComponent(pendingOrder.id)}`)
        return
      }
      paymentWindow = quote.amount > 0 ? window.open("", "_blank") : null
      if (paymentWindow) paymentWindow.opener = null
      const order = await postJson<{ id: string; payUrl?: string; status?: string; paymentProvider?: string }>("/api/payments/orders", {
        product: trafficPack ? "traffic_pack" : homeIp ? "home_ip" : "plan",
        optionId,
        couponCode: quote.couponCode,
        addOns,
        trafficTier,
        useBalance,
        paymentPlatformId: selection.platformId,
        channelCode: selection.method,
        confirmReplacement,
        returnUrl: `${window.location.origin}/account/payment/result`,
      })
      clearJsonCache()
      if (order.status === "pending") window.dispatchEvent(new CustomEvent("payment-order-updated", { detail: { id: order.id, status: order.status } }))
      if (order.paymentProvider === "test") {
        paymentWindow?.close()
        navigate(`/account/orders/${encodeURIComponent(order.id)}`)
      } else if (order.payUrl) {
        if (paymentWindow) paymentWindow.location.replace(order.payUrl)
        else window.location.assign(order.payUrl)
        if (paymentWindow) navigate(`/account/orders/${encodeURIComponent(order.id)}`)
      } else {
        paymentWindow?.close()
        navigate(`/account/payment/result?paymentOrder=${encodeURIComponent(order.id)}`)
      }
    } catch (error) {
      paymentWindow?.close()
      toast.error(error instanceof Error ? error.message : "创建订单失败")
      setPaying("")
    }
  }

  function pay(selection: PaymentSelection) {
    if (quote?.purchaseAction === "replace") setPendingPaymentSelection(selection)
    else void createPayment(selection)
  }

  async function confirmReplacement() {
    if (!pendingPaymentSelection) return
    await createPayment(pendingPaymentSelection, true)
    setPendingPaymentSelection(null)
  }

  if (loading && !quote) return <main className="grid min-h-72 place-items-center"><Loader2 className="animate-spin" /></main>
  if (!quote) return <EmptyState title={trafficPack ? "流量包不可用" : homeIp ? "家宽 IP 不可用" : "套餐不可用"} description={standaloneAddOn ? "请确认当前有生效中的周期性套餐，并检查商品是否已上架。" : "请返回套餐页重新选择。"} />
  const monthlyPrice = quote.cycles.find(cycle => billingMonths(cycle.optionId) === 1 && cycle.optionId.endsWith("-30"))?.amount || quote.originalAmount
  const couponApplied = Boolean(quote.couponCode && quote.couponCode === couponCode.trim().toUpperCase())
  const actionMessage = quote.purchaseAction === "add_on"
    ? homeIp ? "支付成功后将进入人工交付，客服会联系确认家宽 IP 使用信息。" : "流量包支付成功后立即加入当前周期，月度重置、续费或更换套餐后失效。"
    : quote.purchaseAction === "replace"
    ? "新套餐支付成功后将立即覆盖当前套餐，原套餐剩余有效期和流量不再保留。"
    : "付款成功后套餐立即生效。"

  return (
    <main className="px-4 lg:px-6">
      <section className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-5">
        <header className="grid gap-1 lg:col-span-5"><h1 className="text-2xl font-semibold tracking-tight">确认订单</h1><p className="text-sm text-muted-foreground">{trafficPack ? "确认流量包信息后完成支付" : homeIp ? "选择服务地区并确认人工交付信息" : "确认商品、计费周期与优惠信息后完成支付"}</p><Separator className="mt-3" /></header>
        {quote.purchaseAction !== "initial" ? <Alert variant={quote.purchaseAction === "replace" ? "warning" : "default"} className="lg:col-span-5"><TriangleAlert /><AlertDescription>{actionMessage}</AlertDescription></Alert> : null}
        <section className="grid content-start gap-4 lg:col-span-3">
          <Card>
            <CardHeader><CardTitle>{quote.planName} · {quote.title}</CardTitle><CardDescription>{quote.description}</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 text-sm"><p className="flex items-center gap-2"><Check className="size-4" />{quote.traffic}</p>{quote.devices ? <p className="flex items-center gap-2"><Check className="size-4" />可使用设备数：{quote.devices} 台</p> : null}{quote.features.map(feature => <p key={feature} className="flex items-center gap-2"><Check className="size-4" />{feature}</p>)}</div>
            </CardContent>
          </Card>
          {trafficPack ? null : <Card>
            <CardHeader><CardTitle>{homeIp ? "选择服务地区" : "选择计费周期"}</CardTitle><CardDescription>{homeIp ? "不同地区按后台配置的月费结算，每次服务 30 天。" : "选择适合你的购买周期"}</CardDescription></CardHeader>
            <CardContent><RadioGroup value={optionId} onValueChange={selectCycle} disabled={loading} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">{quote.cycles.map(cycle => <FieldLabel key={cycle.optionId} htmlFor={`cycle-${cycle.optionId}`} className="w-full cursor-pointer sm:min-w-0 sm:flex-1 sm:basis-[calc(50%-0.375rem)]"><Field orientation="horizontal" className="h-full w-full rounded-md border p-4 has-[[data-state=checked]]:border-primary"><FieldContent className="flex-1"><FieldTitle className="flex items-center gap-1.5 leading-[18px]">{quote.unlimited ? <>{cycle.label.replace(/\s*无限流量$/, "")}<Badge variant="outline" className={`${inlinePlanBadgeClass} relative isolate overflow-hidden border-transparent bg-[linear-gradient(135deg,#0ea5e9,#8b5cf6,#ec4899)] bg-clip-padding text-white dark:bg-[linear-gradient(135deg,#0284c7,#7c3aed,#db2777)]`}><span aria-hidden className="premium-shine absolute inset-0" /><span className="relative flex h-full items-center leading-none">无限流量</span></Badge></> : cycle.label}{homeIp ? null : <BillingDiscount monthlyPrice={monthlyPrice} totalPrice={cycle.amount} months={billingMonths(cycle.optionId)} />}</FieldTitle><FieldDescription>{formatMoney(cycle.amount)}{cycle.devices ? ` · 可使用设备数：${cycle.devices} 台` : ""}</FieldDescription></FieldContent><RadioGroupItem id={`cycle-${cycle.optionId}`} value={cycle.optionId} /></Field></FieldLabel>)}</RadioGroup></CardContent>
          </Card>}
          {!trafficPack && !quote.lifetime && (quote.trafficMaxTier || 1) > 1 ? <Card>
            <CardHeader><CardTitle>定制每月流量</CardTitle><CardDescription>可按套餐默认流量的倍数增加，价格根据所选流量自动计算。</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <Slider aria-label="每月流量" min={1} max={quote.trafficMaxTier} step={1} value={[trafficTier]} onValueChange={values => setTrafficTier(values[0] || 1)} onValueCommit={selectTrafficTier} disabled={loading || Boolean(paying)} />
              <Item variant="muted"><ItemContent><ItemDescription>当前选择</ItemDescription><ItemTitle>每月 {(quote.trafficBaseGb || 0) * trafficTier} GB</ItemTitle></ItemContent><ItemActions><span className="text-xl font-semibold tabular-nums">{formatMoney(quote.originalAmount)}</span></ItemActions></Item>
            </CardContent>
          </Card> : null}
          {standaloneAddOn || quote.lifetime ? null : <Card>
            <CardHeader><CardTitle>附加服务</CardTitle><CardDescription>可与基础套餐合并结算，按需选择。</CardDescription></CardHeader>
            <CardContent><ItemGroup>
              {(quote.availableAddOns || []).map(addOn => <Item key={addOn.id} variant="muted">{addOn.id === "home_ip" ? <HousePlug /> : <PackagePlus />}<ItemContent><ItemTitle>{addOn.name}</ItemTitle><ItemDescription>{addOn.description}{addOn.available ? " · 支付后进入人工交付" : ` · ${addOn.unavailableReason}`}</ItemDescription></ItemContent><ItemActions>{addOn.available && addOn.options?.length ? <Select value={addOns.find(id => id.startsWith(`${addOn.id}:`)) || "none"} onValueChange={value => selectAddOnOption(value === "none" ? "" : value)} disabled={loading || Boolean(paying)}><SelectTrigger aria-label={`选择${addOn.name}地区`} className="w-full sm:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">不购买</SelectItem>{addOn.options.map(option => <SelectItem key={option.id} value={option.id}>{option.label} · {formatMoney(option.amount)}</SelectItem>)}</SelectContent></Select> : <Badge variant="secondary">{addOn.unavailableReason}</Badge>}</ItemActions></Item>)}
            </ItemGroup></CardContent>
          </Card>}
        </section>
        <aside className="grid content-start gap-4 lg:col-span-2">
          {standaloneAddOn ? null : <Card>
            <CardHeader><CardTitle>优惠码</CardTitle><CardDescription>优惠码仅适用于基础套餐服务。</CardDescription></CardHeader>
            <CardContent><Field><div className="flex gap-2"><Input aria-label="优惠码" aria-invalid={Boolean(couponError)} aria-describedby={couponError ? "coupon-error" : couponApplied ? "coupon-success" : undefined} placeholder="输入优惠码（如有）" value={couponCode} onChange={event => { setCouponCode(event.target.value); setCouponError("") }} /><Button variant="outline" size="default" onClick={validateCoupon} disabled={loading}>{validatingCoupon ? <Loader2 className="animate-spin" /> : <Tag />}验证</Button></div><FieldError id="coupon-error">{couponError}</FieldError>{couponApplied ? <FieldDescription id="coupon-success" className="text-emerald-600 dark:text-emerald-500">优惠码验证成功</FieldDescription> : null}</Field></CardContent>
          </Card>}
          <Card>
            <CardHeader><CardTitle>订单摘要</CardTitle><CardDescription>{quote.optionLabel}</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 text-sm"><p className="flex justify-between"><span className="text-muted-foreground">{(quote.trafficTier || 1) > 1 ? `套餐基础价（每月 ${quote.trafficBaseGb} GB）` : "商品原价"}</span><span>{formatMoney(quote.baseAmount ?? quote.originalAmount)}</span></p>{(quote.trafficTier || 1) > 1 ? <p className="flex justify-between"><span className="text-muted-foreground">流量定制至每月 {quote.trafficGb} GB</span><span>+{formatMoney(quote.originalAmount - (quote.baseAmount || 0))}</span></p> : null}{quote.discountAmount ? <p className="flex justify-between"><span className="text-muted-foreground">优惠码 {quote.couponCode}（{quote.discountPercent}%）</span><span>-{formatMoney(quote.discountAmount)}</span></p> : null}{standaloneAddOn ? null : <><p className="flex justify-between gap-3"><span className="text-muted-foreground">{quote.vipLevel.replace(/^vip/i, "VIP ")} 专属折扣（{quote.vipDiscountPercent}%）</span><span>-{formatMoney(quote.vipDiscountAmount)}</span></p><p className="flex justify-between"><span className="text-muted-foreground">优惠后小计</span><span>{formatMoney(quote.subtotal)}</span></p><p className="flex justify-between"><span className="text-muted-foreground">税费（{quote.taxRate}%）</span><span>{formatMoney(quote.taxAmount)}</span></p></>}{quote.addOnAmount ? <p className="flex justify-between gap-3"><span className="text-muted-foreground">附加服务：{quote.availableAddOns?.filter(addOn => quote.selectedAddOns?.includes(addOn.id)).map(addOn => addOn.name).join("、")}</span><span>+{formatMoney(quote.addOnAmount)}</span></p> : null}{quote.walletGiftAmount ? <p className="flex justify-between"><span className="text-muted-foreground">赠送余额</span><span>-{formatMoney(quote.walletGiftAmount)}</span></p> : null}{quote.walletReferralAmount ? <p className="flex justify-between"><span className="text-muted-foreground">返利余额</span><span>-{formatMoney(quote.walletReferralAmount)}</span></p> : null}{quote.walletCashAmount ? <p className="flex justify-between"><span className="text-muted-foreground">充值余额</span><span>-{formatMoney(quote.walletCashAmount)}</span></p> : null}</div>
              {quote.wallet.availableBalance > 0 ? <FieldLabel htmlFor="use-wallet" className="min-h-10 w-full cursor-pointer justify-between rounded-md border bg-muted/40 px-3 py-2.5 transition-colors hover:bg-muted/60 has-[[data-disabled]]:cursor-not-allowed">使用余额抵扣<Checkbox id="use-wallet" checked={useBalance} onCheckedChange={checked => { const enabled = checked === true; setUseBalance(enabled); void loadQuote(quote.couponCode, optionId, enabled) }} disabled={loading || Boolean(paying)} /></FieldLabel> : null}
              <Separator />
              <p className="flex justify-between text-base font-semibold"><span>支付订单</span><span>{formatMoney(quote.amount)}</span></p>
              {quote.amount === 0 ? <Button onClick={() => pay({ platformId: "wallet", method: "100" })} disabled={Boolean(paying) || loading}>{paying ? <Loader2 className="animate-spin" /> : <Check />}{quote.walletAmount ? "余额支付" : "确认覆盖"}</Button> : <Field><FieldDescription>请选择一个支付结算平台</FieldDescription><Accordion type="single" value={paymentPlatformId} onValueChange={setPaymentPlatformId} className="grid gap-2">
                {quote.paymentPlatforms.map(platform => <AccordionItem key={platform.id} value={platform.id} disabled={!platform.ready || Boolean(paying) || loading} className="rounded-md border px-3 last:border-b data-[state=open]:border-primary">
                  <AccordionTrigger className="py-3 hover:no-underline"><span className="flex min-w-0 items-center gap-3"><ShieldCheck className="size-5 shrink-0" /><span className="truncate">{platform.name}</span></span></AccordionTrigger>
                  <AccordionContent className="grid gap-2 border-t pt-3 text-foreground">
                    {platform.methods.alipay ? <Button type="button" className="w-full bg-[#1677ff] text-white hover:bg-[#1677ff]/90" onClick={() => pay({ platformId: platform.id, method: "100" })} disabled={Boolean(paying) || loading}>{paying === `${platform.id}:100` ? <Loader2 className="animate-spin" /> : <IconBrandAlipay />}{`支付宝支付 ${formatMoney(quote.amount)}`}</Button> : null}
                    {platform.methods.wechat ? <Button type="button" className="w-full bg-[#07c160] text-white hover:bg-[#07c160]/90" onClick={() => pay({ platformId: platform.id, method: "200" })} disabled={Boolean(paying) || loading}>{paying === `${platform.id}:200` ? <Loader2 className="animate-spin" /> : <IconBrandWechat />}{`微信支付 ${formatMoney(quote.amount)}`}</Button> : null}
                  </AccordionContent>
                </AccordionItem>)}
              </Accordion></Field>}
              <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft />{standaloneAddOn ? "返回服务列表" : "返回服务选择"}</Button>
              <p className="text-xs text-muted-foreground">{trafficPack ? "付款成功后流量立即生效，月度重置、续费或更换套餐后失效。" : homeIp ? "付款成功后进入人工交付，服务有效期以订单快照和交付记录为准。" : "付款成功后套餐立即生效，数字商品不支持退款。"}</p>
            </CardContent>
          </Card>
        </aside>
      </section>
      <AlertDialog open={pendingPaymentSelection !== null} onOpenChange={open => { if (!open) setPendingPaymentSelection(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认覆盖当前套餐？</AlertDialogTitle><AlertDialogDescription>支付成功后，{quote.planName} 将立即覆盖当前套餐，原套餐剩余有效期和流量不再保留，且无法恢复。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={Boolean(paying)}>返回检查</AlertDialogCancel><AlertDialogAction onClick={() => void confirmReplacement()} disabled={Boolean(paying)}>{paying ? <Loader2 className="animate-spin" /> : null}{quote.amount === 0 ? "确认覆盖" : "确认并继续支付"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
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
  if (error || !data) return <main className="grid min-h-svh place-items-center"><EmptyState title="订阅不存在或已失效" description={error} /></main>
  return (
    <main className="min-h-svh bg-background p-6 text-foreground">
      <section className="mx-auto grid max-w-3xl gap-4">
        <div className="grid gap-2">
          <Badge className="w-fit">NEXORA</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">订阅已生效</h1>
        </div>
        <Card>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <Metric label="到期时间" value={formatDate(data.expiresAt)} />
            <Metric label="套餐等级" value={data.activeGroup || "-"} />
            <Metric label="VIP 等级" value={String(data.vipLevel || "-").toUpperCase()} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><LinkIcon />订阅 URL</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <code className="truncate rounded bg-muted px-2 py-1 text-sm">{data.subscriptionUrl}</code>
            <CopyButton value={data.subscriptionUrl} label="复制订阅 URL" variant="default" />
            <Button variant="outline" onClick={() => { window.location.href = `shadowrocket://add/${encodeURIComponent(data.subscriptionUrl)}` }}><Rocket />导入 Shadowrocket</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck />客户端教程</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(data.tutorials || []).map((item: any) => <Button asChild key={`${item.platform}-${item.client}`} variant="outline"><a href={item.url} target="_blank" rel="noreferrer"><CheckCircle />{item.platform}</a></Button>)}
          </CardContent>
        </Card>
      </section>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="grid gap-1"><span className="text-sm text-muted-foreground">{label}</span><strong>{value}</strong></div>
}
