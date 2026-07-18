import * as React from "react"
import { IconBrandAlipay, IconBrandWechat } from "@tabler/icons-react"
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { ArrowLeft, Check, CheckCircle, LinkIcon, Loader2, Rocket, ShieldCheck, Tag, TriangleAlert, X } from "lucide-react"
import { toast } from "sonner"

import { clearJsonCache, fetchJson, postJson } from "@/api"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
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

const defaultPlans = [
  { id: "basic", name: "BASIC", title: "基本套餐", description: "适合轻量网页浏览和社交软件", traffic: "每月 100G", devices: [1, 2, 3, 3], prices: [39, 109, 199, 369], unlimitedPrices: [79, 219, 399, 599], features: ["基础线路", "流媒体支持", "在线客服"], unavailableFeatures: ["稳定 GPT 解锁", "国际内网专线", "独享级带宽体验"] },
  { id: "pro", name: "PRO", title: "高级套餐", description: "优质节点与稳定流媒体体验", recommended: true, traffic: "每月 200G", devices: [3, 3, 5, 5], prices: [49, 129, 229, 429], unlimitedPrices: [95, 249, 439, 679], features: ["优质节点", "普通专线连接", "稳定 GPT 解锁"], unavailableFeatures: ["国际内网专线", "独享级带宽体验"] },
  { id: "ultra", name: "ULTRA", title: "极致套餐", description: "国际内网专线与低延迟体验", traffic: "每月 300G", devices: [1, 2, 3, 3], prices: [89, 239, 449, 859], unlimitedPrices: [129, 349, 659, 1109], features: ["国际内网专线", "独享级带宽体验", "专属客服支持"], unavailableFeatures: [] },
]

const defaultPricingFaqs: FaqSetting[] = [
  { id: "devices", question: "“可绑定设备”是指什么？", answer: "指同一订阅可同时使用的设备数量，手机、电脑和平板等各计为一台；具体数量以所选套餐和计费周期显示为准。" },
  { id: "gpt", question: "哪些套餐支持 GPT 解锁？", answer: "当前 PRO 套餐明确包含稳定 GPT 解锁。其他套餐能力请以套餐卡片的功能列表为准；实际可用性可能受目标平台策略和网络环境影响。" },
  { id: "discount", question: "季度、半年和年度套餐如何计算优惠？", answer: "页面折扣以月付价格乘以对应月数作为基准计算，周期价格旁的百分比就是相比连续月付节省的比例。" },
  { id: "renewal", question: "套餐未到期时再次购买会怎样？", answer: "支付成功后会在当前套餐到期时间基础上自动延长对应时长，不会覆盖尚未使用的有效期。" },
  { id: "delivery", question: "支付后多久生效？可以退款吗？", answer: "支付成功并完成确认后套餐会自动生效。套餐属于即时交付的数字商品，购买后不支持退款。" },
]

export function PricingPage() {
  const location = useLocation()
  const inAccount = location.pathname.startsWith("/account")
  const [plans, setPlans] = React.useState(defaultPlans)
  const [pricingFaqs, setPricingFaqs] = React.useState(defaultPricingFaqs)
  const [periodIndex, setPeriodIndex] = React.useState(0)
  const [trafficMode, setTrafficMode] = React.useState<"limited" | "unlimited">("limited")

  React.useEffect(() => {
    fetchJson<PricingRow[]>("/api/public/pricing").then(rows => {
      setPlans(defaultPlans.map(defaultPlan => {
        const row = rows.find(item => item.group === defaultPlan.id)
        if (!row) return defaultPlan
        return {
          ...defaultPlan,
          name: row.name || defaultPlan.name,
          title: row.title || defaultPlan.title,
          description: row.description || defaultPlan.description,
          recommended: Boolean(row.recommended),
          traffic: row.traffic || defaultPlan.traffic,
          features: row.features ?? defaultPlan.features,
          unavailableFeatures: row.unavailableFeatures ?? defaultPlan.unavailableFeatures,
          prices: [row.monthly ?? defaultPlan.prices[0], row.quarterly ?? defaultPlan.prices[1], row.half_yearly ?? defaultPlan.prices[2], row.yearly ?? defaultPlan.prices[3]],
          unlimitedPrices: [row.unlimitedMonthly ?? defaultPlan.unlimitedPrices[0], row.unlimitedQuarterly ?? defaultPlan.unlimitedPrices[1], row.unlimitedHalfYearly ?? defaultPlan.unlimitedPrices[2], row.unlimitedYearly ?? defaultPlan.unlimitedPrices[3]],
          devices: [row.monthlyDevices ?? defaultPlan.devices[0], row.quarterlyDevices ?? defaultPlan.devices[1], row.half_yearlyDevices ?? defaultPlan.devices[2], row.yearlyDevices ?? defaultPlan.devices[3]],
        }
      }))
    }).catch(() => undefined)
    fetchJson<{ faqs: FaqSetting[] }>("/api/public/sales-settings").then(data => setPricingFaqs(data.faqs)).catch(() => undefined)
  }, [])

  React.useEffect(() => {
    setPeriodIndex(0)
    setTrafficMode("limited")
  }, [location.key])

  function selectTrafficMode(value: string) {
    setTrafficMode(value === "unlimited" ? "unlimited" : "limited")
  }

  return (
    <main className={inAccount ? "px-4 lg:px-6" : "min-h-svh bg-background px-4 py-12 text-foreground md:py-20"}>
      <section className="mx-auto grid max-w-6xl gap-8">
        <header className="grid justify-items-center gap-4 text-center">
          <h1 className="text-2xl font-semibold sm:text-3xl md:text-4xl">定制您的套餐</h1>
          <p className="text-sm text-muted-foreground sm:text-base">选择流量版本与计费周期，支付成功后立即生效。</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Tabs value={periods[periodIndex].id} onValueChange={value => setPeriodIndex(periods.findIndex(item => item.id === value))}>
              <TabsList className="relative grid grid-cols-4 overflow-hidden">
                <span aria-hidden className="pointer-events-none absolute inset-y-[3px] left-[3px] rounded-md bg-background shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none dark:bg-input/30" style={{ width: "calc((100% - 6px) / 4)", transform: `translateX(${periodIndex * 100}%)` }} />
                {periods.map(item => <TabsTrigger key={item.id} value={item.id} className="relative z-10 text-xs data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:text-sm dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent">{item.label}</TabsTrigger>)}
              </TabsList>
            </Tabs>
            <Tabs value={trafficMode} onValueChange={selectTrafficMode}>
              <TabsList className="relative grid grid-cols-2 overflow-hidden">
                <span aria-hidden className={`pointer-events-none absolute inset-y-[3px] left-[3px] overflow-hidden rounded-md shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none ${trafficMode === "unlimited" ? "bg-[linear-gradient(135deg,#0ea5e9,#8b5cf6,#ec4899)] dark:bg-[linear-gradient(135deg,#0284c7,#7c3aed,#db2777)]" : "bg-background dark:bg-input/30"}`} style={{ width: "calc((100% - 6px) / 2)", transform: `translateX(${trafficMode === "unlimited" ? 100 : 0}%)` }}>{trafficMode === "unlimited" ? <span className="premium-shine absolute inset-0" /> : null}</span>
                <TabsTrigger value="limited" className="relative z-10 text-xs data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:text-sm dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent">固定流量</TabsTrigger>
                <TabsTrigger value="unlimited" className="relative z-10 text-xs data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none sm:text-sm dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-white">无限流量</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map(plan => <Card key={plan.id} className={plan.recommended ? "border-foreground" : undefined}>
            <CardHeader><div className="flex items-center justify-between"><CardTitle>{plan.name}</CardTitle>{plan.recommended ? <Badge className="bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950">推荐</Badge> : null}</div><p className="text-sm text-muted-foreground">{plan.title}</p><div className="flex flex-wrap items-baseline gap-2 pt-2"><span><span className="text-4xl font-semibold">￥{trafficMode === "unlimited" ? plan.unlimitedPrices[periodIndex] : plan.prices[periodIndex]}</span><span className="text-sm text-muted-foreground"> / {periods[periodIndex].days}</span></span>{trafficMode === "limited" ? <BillingDiscount monthlyPrice={plan.prices[0]} totalPrice={plan.prices[periodIndex]} months={periods[periodIndex].months} /> : null}</div><p className="text-sm text-muted-foreground sm:min-h-10">{plan.description}</p></CardHeader>
            <CardContent className="grid gap-5"><Button variant={plan.recommended ? "default" : "outline"} asChild>{inAccount ? <Link to={`/account/plans/checkout?option=${plan.id}${trafficMode === "unlimited" ? "-unlimited" : ""}-${periods[periodIndex].suffix}`}>选择套餐</Link> : <Link to="/login?returnTo=/account/plans">登录后购买</Link>}</Button><Separator /><div className="grid gap-3 text-sm"><p className="flex items-center gap-2"><Check className="size-4" />{trafficMode === "unlimited" ? "无限流量" : plan.traffic}</p><p className="flex items-center gap-2"><Check className="size-4" />可绑定 {plan.devices[periodIndex]} 台设备</p>{plan.features.map(feature => <p key={feature} className="flex items-center gap-2"><Check className="size-4" />{feature}</p>)}{plan.unavailableFeatures.map(feature => <p key={feature} className="flex items-center gap-2 text-muted-foreground"><X className="size-4" /><span className="sr-only">不支持：</span>{feature}</p>)}</div></CardContent>
          </Card>)}
        </div>
        {pricingFaqs.length ? <><Separator /><section className="grid w-full gap-4"><Accordion type="single" collapsible>{pricingFaqs.map(item => <AccordionItem key={item.id} value={item.id}><AccordionTrigger>{item.question}</AccordionTrigger><AccordionContent>{item.answer}</AccordionContent></AccordionItem>)}</Accordion></section></> : null}
        {!inAccount ? <p className="text-center text-sm text-muted-foreground">所有套餐一经支付不支持退款</p> : null}
      </section>
    </main>
  )
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
  originalAmount: number
  discountAmount: number
  vipLevel: string
  vipDiscountPercent: number
  vipDiscountAmount: number
  subtotal: number
  taxRate: number
  taxAmount: number
  beforeCreditAmount: number
  cashCredit: number
  purchaseAction: "initial" | "extend" | "replace"
  payableAmount: number
  walletAmount: number
  walletCashAmount: number
  walletGiftAmount: number
  wallet: { availableBalance: number }
  amount: number
  couponCode: string
  discountPercent: number
  cycles: Array<{ optionId: string; label: string; amount: number; devices: number }>
}

export function CheckoutPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const initialOptionId = searchParams.get("option") || ""
  const [optionId, setOptionId] = React.useState(initialOptionId)
  const [quote, setQuote] = React.useState<CheckoutQuote | null>(null)
  const [couponCode, setCouponCode] = React.useState("")
  const [couponError, setCouponError] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [validatingCoupon, setValidatingCoupon] = React.useState(false)
  const [paying, setPaying] = React.useState("")
  const [useBalance, setUseBalance] = React.useState(true)
  const [pendingPaymentChannel, setPendingPaymentChannel] = React.useState<"100" | "200" | null>(null)

  async function loadQuote(code = "", nextOptionId = optionId, nextUseBalance = useBalance) {
    setLoading(true)
    setCouponError("")
    try {
      setQuote(await postJson<CheckoutQuote>("/api/payments/quote", { optionId: nextOptionId, couponCode: code, useBalance: nextUseBalance }))
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

  async function validateCoupon() {
    setValidatingCoupon(true)
    try {
      await loadQuote(couponCode)
    } finally {
      setValidatingCoupon(false)
    }
  }

  async function createPayment(channelCode: "100" | "200") {
    if (!quote) return
    const paymentWindow = quote.amount > 0 ? window.open("about:blank", "_blank") : null
    if (paymentWindow) paymentWindow.opener = null
    setPaying(channelCode)
    try {
      const order = await postJson<{ id: string; payUrl?: string; status?: string }>("/api/payments/orders", {
        optionId,
        couponCode: quote.couponCode,
        useBalance,
        channelCode,
        returnUrl: `${window.location.origin}/account/payment/result`,
      })
      clearJsonCache()
      if (order.status === "pending") window.dispatchEvent(new CustomEvent("payment-order-updated", { detail: { id: order.id, status: order.status } }))
      if (order.payUrl && paymentWindow) paymentWindow.location.href = order.payUrl
      navigate(order.payUrl ? `/account/orders/${encodeURIComponent(order.id)}` : `/account/payment/result?paymentOrder=${encodeURIComponent(order.id)}`)
    } catch (error) {
      paymentWindow?.close()
      toast.error(error instanceof Error ? error.message : "创建订单失败")
      setPaying("")
    }
  }

  function pay(channelCode: "100" | "200") {
    if (quote?.purchaseAction === "replace") setPendingPaymentChannel(channelCode)
    else void createPayment(channelCode)
  }

  async function confirmReplacement() {
    if (!pendingPaymentChannel) return
    const channelCode = pendingPaymentChannel
    await createPayment(channelCode)
    setPendingPaymentChannel(null)
  }

  if (loading && !quote) return <main className="grid min-h-72 place-items-center"><Loader2 className="animate-spin" /></main>
  if (!quote) return <EmptyState title="套餐不可用" description="请返回套餐页重新选择。" />
  const monthlyPrice = quote.cycles.find(cycle => billingMonths(cycle.optionId) === 1 && cycle.optionId.endsWith("-30"))?.amount || quote.originalAmount
  const couponApplied = Boolean(quote.couponCode && quote.couponCode === couponCode.trim().toUpperCase())
  const actionMessage = quote.purchaseAction === "replace"
    ? `新套餐将立即覆盖当前套餐，剩余现金价值 ${formatMoney(quote.cashCredit)} 已自动抵扣。`
    : quote.purchaseAction === "extend" ? "同级同版本套餐将从当前到期日继续延长。" : "付款成功后套餐立即生效。"

  return (
    <main className="px-4 lg:px-6">
      <section className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-5">
        <header className="grid gap-1 lg:col-span-5"><h1 className="text-2xl font-semibold tracking-tight">确认订单</h1><p className="text-sm text-muted-foreground">确认商品、计费周期与优惠信息后完成支付</p><Separator className="mt-3" /></header>
        {quote.purchaseAction !== "initial" ? <Alert variant={quote.purchaseAction === "replace" ? "warning" : "default"} className="lg:col-span-5"><TriangleAlert /><AlertDescription>{actionMessage}</AlertDescription></Alert> : null}
        <section className="grid gap-4 lg:col-span-3">
          <Card>
            <CardHeader><CardTitle>{quote.planName} · {quote.title}</CardTitle><CardDescription>{quote.description}</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 text-sm"><p className="flex items-center gap-2"><Check className="size-4" />{quote.traffic}</p>{quote.devices ? <p className="flex items-center gap-2"><Check className="size-4" />可绑定 {quote.devices} 台设备</p> : null}{quote.features.map(feature => <p key={feature} className="flex items-center gap-2"><Check className="size-4" />{feature}</p>)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>选择计费周期</CardTitle><CardDescription>选择适合你的购买周期</CardDescription></CardHeader>
            <CardContent><RadioGroup value={optionId} onValueChange={selectCycle} disabled={loading} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">{quote.cycles.map(cycle => <FieldLabel key={cycle.optionId} htmlFor={`cycle-${cycle.optionId}`} className="w-full cursor-pointer sm:min-w-0 sm:flex-1 sm:basis-[calc(50%-0.375rem)]"><Field orientation="horizontal" className="h-full w-full rounded-md border p-4 has-[[data-state=checked]]:border-primary"><FieldContent className="flex-1"><FieldTitle className="flex items-center gap-1.5 leading-[18px]">{quote.unlimited ? <>{cycle.label.replace(/\s*无限流量$/, "")}<Badge variant="outline" className={`${inlinePlanBadgeClass} relative isolate overflow-hidden border-transparent bg-[linear-gradient(135deg,#0ea5e9,#8b5cf6,#ec4899)] bg-clip-padding text-white dark:bg-[linear-gradient(135deg,#0284c7,#7c3aed,#db2777)]`}><span aria-hidden className="premium-shine absolute inset-0" /><span className="relative flex h-full items-center leading-none">无限流量</span></Badge></> : cycle.label}<BillingDiscount monthlyPrice={monthlyPrice} totalPrice={cycle.amount} months={billingMonths(cycle.optionId)} /></FieldTitle><FieldDescription>{formatMoney(cycle.amount)}{cycle.devices ? ` · 可绑定 ${cycle.devices} 台设备` : ""}</FieldDescription></FieldContent><RadioGroupItem id={`cycle-${cycle.optionId}`} value={cycle.optionId} /></Field></FieldLabel>)}</RadioGroup></CardContent>
          </Card>
        </section>
        <aside className="grid content-start gap-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>优惠码</CardTitle></CardHeader>
            <CardContent><Field><div className="flex gap-2"><Input aria-label="优惠码" aria-invalid={Boolean(couponError)} aria-describedby={couponError ? "coupon-error" : couponApplied ? "coupon-success" : undefined} placeholder="输入优惠码（如有）" value={couponCode} onChange={event => { setCouponCode(event.target.value); setCouponError("") }} /><Button variant="outline" size="default" onClick={validateCoupon} disabled={loading}>{validatingCoupon ? <Loader2 className="animate-spin" /> : <Tag />}验证</Button></div><FieldError id="coupon-error">{couponError}</FieldError>{couponApplied ? <FieldDescription id="coupon-success" className="text-emerald-600 dark:text-emerald-500">优惠码验证成功</FieldDescription> : null}</Field></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>订单摘要</CardTitle><CardDescription>{quote.optionLabel}</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 text-sm"><p className="flex justify-between"><span className="text-muted-foreground">商品原价</span><span>{formatMoney(quote.originalAmount)}</span></p>{quote.discountAmount ? <p className="flex justify-between"><span className="text-muted-foreground">优惠码 {quote.couponCode}（{quote.discountPercent}%）</span><span>-{formatMoney(quote.discountAmount)}</span></p> : null}<p className="flex justify-between gap-3"><span className="text-muted-foreground">{quote.vipLevel.replace(/^vip/i, "VIP ")} 专属折扣（{quote.vipDiscountPercent}%）</span><span>-{formatMoney(quote.vipDiscountAmount)}</span></p><p className="flex justify-between"><span className="text-muted-foreground">优惠后小计</span><span>{formatMoney(quote.subtotal)}</span></p><p className="flex justify-between"><span className="text-muted-foreground">税费（{quote.taxRate}%）</span><span>{formatMoney(quote.taxAmount)}</span></p>{quote.cashCredit ? <p className="flex justify-between"><span className="text-muted-foreground">现有套餐剩余现金价值抵扣</span><span>-{formatMoney(quote.cashCredit)}</span></p> : null}{quote.walletGiftAmount ? <p className="flex justify-between"><span className="text-muted-foreground">赠送余额</span><span>-{formatMoney(quote.walletGiftAmount)}</span></p> : null}{quote.walletCashAmount ? <p className="flex justify-between"><span className="text-muted-foreground">充值余额</span><span>-{formatMoney(quote.walletCashAmount)}</span></p> : null}</div>
              {quote.wallet.availableBalance > 0 ? <Field orientation="horizontal"><Checkbox id="use-wallet" checked={useBalance} onCheckedChange={checked => { const enabled = checked === true; setUseBalance(enabled); void loadQuote(quote.couponCode, optionId, enabled) }} disabled={loading || Boolean(paying)} /><FieldContent><FieldLabel htmlFor="use-wallet">使用账户余额</FieldLabel><FieldDescription>可用 {formatMoney(quote.wallet.availableBalance)}，优先使用赠送余额</FieldDescription></FieldContent></Field> : null}
              <Separator />
              <p className="flex justify-between text-base font-semibold"><span>第三方支付</span><span>{formatMoney(quote.amount)}</span></p>
              {quote.amount === 0 ? <Button onClick={() => pay("100")} disabled={Boolean(paying) || loading}>{paying ? <Loader2 className="animate-spin" /> : <Check />}{quote.walletAmount ? "余额支付" : "确认覆盖"}</Button> : <div className="grid gap-2"><Button className="w-full bg-[#1677ff] text-white hover:bg-[#1677ff]/90" onClick={() => pay("100")} disabled={Boolean(paying) || loading}>{paying === "100" ? <Loader2 className="animate-spin" /> : <IconBrandAlipay />}支付宝支付 {formatMoney(quote.amount)}</Button><Button className="w-full bg-[#07c160] text-white hover:bg-[#07c160]/90" onClick={() => pay("200")} disabled={Boolean(paying) || loading}>{paying === "200" ? <Loader2 className="animate-spin" /> : <IconBrandWechat />}微信支付 {formatMoney(quote.amount)}</Button></div>}
              <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft />返回套餐选择</Button>
              <p className="text-xs text-muted-foreground">付款成功后套餐立即生效，数字商品不支持退款。</p>
            </CardContent>
          </Card>
        </aside>
      </section>
      <AlertDialog open={pendingPaymentChannel !== null} onOpenChange={open => { if (!open) setPendingPaymentChannel(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认覆盖当前套餐？</AlertDialogTitle><AlertDialogDescription>支付成功后，{quote.planName} 将立即覆盖当前套餐，原套餐剩余有效期不再保留；剩余现金价值 {formatMoney(quote.cashCredit)} 已用于抵扣。</AlertDialogDescription></AlertDialogHeader>
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
