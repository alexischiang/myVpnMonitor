import * as React from "react"
import { IconBrandAlipay, IconBrandWechat } from "@tabler/icons-react"
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { ArrowLeft, Check, CheckCircle, LinkIcon, Loader2, Rocket, ShieldCheck, Tag } from "lucide-react"
import { toast } from "sonner"

import { fetchJson, postJson } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CopyButton, EmptyState } from "@/components/features/shared"
import type { PricingRow } from "@/types"
import { formatDate, formatMoney } from "@/utils"

const periods = [
  { id: "monthly", label: "月付", days: "30天", suffix: "30" },
  { id: "quarterly", label: "季付", days: "90天", suffix: "90" },
  { id: "half_yearly", label: "半年付", days: "180天", suffix: "180" },
  { id: "yearly", label: "年付", days: "360天", suffix: "360" },
] as const

const defaultPlans = [
  { id: "basic", name: "BASIC", title: "基本套餐", description: "适合轻量网页浏览和社交软件", traffic: "每月 100G", devices: [1, 2, 3, 3], prices: [39, 109, 199, 369], features: ["基础线路", "流媒体支持", "在线客服"] },
  { id: "pro", name: "PRO", title: "高级套餐", description: "优质节点与稳定流媒体体验", recommended: true, traffic: "每月 200G", devices: [3, 3, 5, 5], prices: [49, 129, 229, 429], features: ["优质节点", "普通专线连接", "稳定 GPT 解锁"] },
  { id: "ultra", name: "ULTRA", title: "极致套餐", description: "国际内网专线与低延迟体验", traffic: "每月 300G", devices: [1, 2, 3, 3], prices: [89, 239, 449, 859], features: ["国际内网专线", "独享级带宽体验", "专属客服支持"] },
]

export function PricingPage() {
  const location = useLocation()
  const inAccount = location.pathname.startsWith("/account")
  const [plans, setPlans] = React.useState(defaultPlans)
  const [periodIndex, setPeriodIndex] = React.useState(3)

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
          features: row.features?.length ? row.features : defaultPlan.features,
          prices: [row.monthly ?? defaultPlan.prices[0], row.quarterly ?? defaultPlan.prices[1], row.half_yearly ?? defaultPlan.prices[2], row.yearly ?? defaultPlan.prices[3]],
          devices: [row.monthlyDevices ?? defaultPlan.devices[0], row.quarterlyDevices ?? defaultPlan.devices[1], row.half_yearlyDevices ?? defaultPlan.devices[2], row.yearlyDevices ?? defaultPlan.devices[3]],
        }
      }))
    }).catch(() => undefined)
  }, [])

  return (
    <main className={inAccount ? "px-4 lg:px-6" : "min-h-svh bg-background px-4 py-12 text-foreground md:py-20"}>
      <section className="mx-auto grid max-w-6xl gap-8">
        <header className="grid justify-items-center gap-4 text-center"><h1 className="text-3xl font-semibold md:text-4xl">简单清晰的套餐价格</h1><p className="text-muted-foreground">选择周期后查看对应价格，支付成功后立即生效。</p><Tabs value={periods[periodIndex].id} onValueChange={value => setPeriodIndex(periods.findIndex(item => item.id === value))}><TabsList>{periods.map(item => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}</TabsList></Tabs></header>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map(plan => <Card key={plan.id} className={plan.recommended ? "border-foreground" : undefined}>
            <CardHeader><div className="flex items-center justify-between"><CardTitle>{plan.name}</CardTitle>{plan.recommended ? <Badge>推荐</Badge> : null}</div><p className="text-sm text-muted-foreground">{plan.title}</p><div className="pt-2"><span className="text-4xl font-semibold">￥{plan.prices[periodIndex]}</span><span className="text-sm text-muted-foreground"> / {periods[periodIndex].days}</span></div><p className="min-h-10 text-sm text-muted-foreground">{plan.description}</p></CardHeader>
            <CardContent className="grid gap-5"><Button variant={plan.recommended ? "default" : "outline"} asChild>{inAccount ? <Link to={`/account/plans/checkout?option=${plan.id}-${periods[periodIndex].suffix}`}>选择套餐</Link> : <Link to="/login?returnTo=/account/plans">登录后购买</Link>}</Button>{plan.id === "pro" && inAccount ? <Button variant="outline" asChild><Link to="/account/plans/checkout?option=pro-test-001">1 元支付测试</Link></Button> : null}<Separator /><div className="grid gap-3 text-sm"><p className="flex items-center gap-2"><Check className="size-4" />{plan.traffic}</p><p className="flex items-center gap-2"><Check className="size-4" />可绑定 {plan.devices[periodIndex]} 台设备</p>{plan.features.map(feature => <p key={feature} className="flex items-center gap-2"><Check className="size-4" />{feature}</p>)}</div></CardContent>
          </Card>)}
        </div>
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
  originalAmount: number
  discountAmount: number
  subtotal: number
  taxRate: number
  taxAmount: number
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
  const [loading, setLoading] = React.useState(true)
  const [paying, setPaying] = React.useState("")

  async function loadQuote(code = "", nextOptionId = optionId) {
    setLoading(true)
    try {
      setQuote(await postJson<CheckoutQuote>("/api/payments/quote", { optionId: nextOptionId, couponCode: code }))
      if (code) toast.success("优惠码已应用")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "获取结算信息失败")
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { void loadQuote("", initialOptionId) }, [initialOptionId])

  function selectCycle(nextOptionId: string) {
    setOptionId(nextOptionId)
    void loadQuote(quote?.couponCode || "", nextOptionId)
  }

  async function pay(channelCode: "100" | "200") {
    if (!quote) return
    const paymentWindow = window.open("about:blank", "_blank")
    if (paymentWindow) paymentWindow.opener = null
    setPaying(channelCode)
    try {
      const order = await postJson<{ id: string; payUrl?: string }>("/api/payments/orders", {
        optionId,
        couponCode: quote.couponCode,
        channelCode,
        returnUrl: `${window.location.origin}/account/payment/result`,
      })
      if (!order.payUrl) throw new Error("支付地址不可用")
      if (paymentWindow) paymentWindow.location.href = order.payUrl
      navigate(`/account/orders/${encodeURIComponent(order.id)}`)
    } catch (error) {
      paymentWindow?.close()
      toast.error(error instanceof Error ? error.message : "创建订单失败")
      setPaying("")
    }
  }

  if (loading && !quote) return <main className="grid min-h-72 place-items-center"><Loader2 className="animate-spin" /></main>
  if (!quote) return <EmptyState title="套餐不可用" description="请返回套餐页重新选择。" />

  return (
    <main className="px-4 lg:px-6">
      <section className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-5"><CardHeader><CardTitle>确认订单</CardTitle><CardDescription>确认商品、计费周期与优惠信息后完成支付</CardDescription></CardHeader></Card>
        <section className="grid gap-4 lg:col-span-3">
          <Card>
            <CardHeader><CardTitle>{quote.planName} · {quote.title}</CardTitle><CardDescription>{quote.description}</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 text-sm"><p className="flex items-center gap-2"><Check className="size-4" />{quote.traffic}</p>{quote.devices ? <p className="flex items-center gap-2"><Check className="size-4" />可绑定 {quote.devices} 台设备</p> : null}{quote.features.map(feature => <p key={feature} className="flex items-center gap-2"><Check className="size-4" />{feature}</p>)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>选择计费周期</CardTitle><CardDescription>选择适合你的购买周期</CardDescription></CardHeader>
            <CardContent><RadioGroup value={optionId} onValueChange={selectCycle} disabled={loading} className="flex flex-wrap gap-3">{quote.cycles.map(cycle => <FieldLabel key={cycle.optionId} htmlFor={`cycle-${cycle.optionId}`} className="min-w-0 flex-1 basis-[calc(50%-0.375rem)] cursor-pointer"><Field orientation="horizontal" className="h-full w-full rounded-md border p-4 has-[[data-state=checked]]:border-primary"><FieldContent className="flex-1"><FieldTitle>{cycle.label}</FieldTitle><FieldDescription>{formatMoney(cycle.amount)}{cycle.devices ? ` · 可绑定 ${cycle.devices} 台设备` : ""}</FieldDescription></FieldContent><RadioGroupItem id={`cycle-${cycle.optionId}`} value={cycle.optionId} /></Field></FieldLabel>)}</RadioGroup></CardContent>
          </Card>
        </section>
        <aside className="grid content-start gap-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>优惠码</CardTitle></CardHeader>
            <CardContent><div className="flex gap-2"><Input aria-label="优惠码" placeholder="输入优惠码（如有）" value={couponCode} onChange={event => setCouponCode(event.target.value)} /><Button variant="outline" onClick={() => loadQuote(couponCode)} disabled={loading}><Tag />验证</Button></div></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>订单摘要</CardTitle><CardDescription>{quote.optionLabel}</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 text-sm"><p className="flex justify-between"><span className="text-muted-foreground">商品原价</span><span>{formatMoney(quote.originalAmount)}</span></p>{quote.discountAmount ? <p className="flex justify-between"><span className="text-muted-foreground">优惠码 {quote.couponCode}（{quote.discountPercent}%）</span><span>-{formatMoney(quote.discountAmount)}</span></p> : null}<p className="flex justify-between"><span className="text-muted-foreground">优惠后小计</span><span>{formatMoney(quote.subtotal)}</span></p><p className="flex justify-between"><span className="text-muted-foreground">税费（{quote.taxRate}%）</span><span>{formatMoney(quote.taxAmount)}</span></p></div>
              <Separator />
              <p className="flex justify-between text-base font-semibold"><span>总计</span><span>{formatMoney(quote.amount)}</span></p>
              <div className="grid gap-2"><Button className="w-full bg-[#1677ff] text-white hover:bg-[#1677ff]/90" onClick={() => pay("100")} disabled={Boolean(paying) || loading}>{paying === "100" ? <Loader2 className="animate-spin" /> : <IconBrandAlipay />}支付宝支付</Button><Button className="w-full bg-[#07c160] text-white hover:bg-[#07c160]/90" onClick={() => pay("200")} disabled={Boolean(paying) || loading}>{paying === "200" ? <Loader2 className="animate-spin" /> : <IconBrandWechat />}微信支付</Button></div>
              <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft />返回套餐</Button>
              <p className="text-xs text-muted-foreground">付款成功后套餐立即生效，数字商品不支持退款。</p>
            </CardContent>
          </Card>
        </aside>
      </section>
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
