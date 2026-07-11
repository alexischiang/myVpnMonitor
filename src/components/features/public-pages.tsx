import * as React from "react"
import { Link, useLocation, useParams } from "react-router-dom"
import { Check, CheckCircle, LinkIcon, Loader2, RefreshCw, Rocket, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { fetchJson, postJson } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CopyButton, EmptyState } from "@/components/features/shared"
import type { PricingRow } from "@/types"
import { formatDate } from "@/utils"

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
  const [order, setOrder] = React.useState<Record<string, string> | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [checking, setChecking] = React.useState(false)

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

  async function createOrder(plan: typeof defaultPlans[number], optionId?: string) {
    const period = periods[periodIndex]
    setLoading(true)
    try {
      const nextOrder = await postJson<Record<string, string>>("/api/payments/orders", {
        optionId: optionId || `${plan.id}-${period.suffix}`,
        returnUrl: `${window.location.origin}/account/payment/result`,
      })
      setOrder(nextOrder)
      if (nextOrder.payUrl) window.open(nextOrder.payUrl, "_blank", "noopener,noreferrer")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建订单失败")
    } finally {
      setLoading(false)
    }
  }

  async function checkOrder() {
    if (!order?.id) return
    setChecking(true)
    try {
      const nextOrder = await fetchJson<Record<string, string>>(`/api/payments/orders/${order.id}`)
      setOrder(nextOrder)
      if (nextOrder.deliveryUrl) window.location.href = nextOrder.deliveryUrl
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "查询订单失败")
    } finally {
      setChecking(false)
    }
  }

  return (
    <main className={inAccount ? "px-4 lg:px-6" : "min-h-svh bg-background px-4 py-12 text-foreground md:py-20"}>
      <section className="mx-auto grid max-w-6xl gap-8">
        <header className="grid justify-items-center gap-4 text-center"><h1 className="text-3xl font-semibold md:text-4xl">简单清晰的套餐价格</h1><p className="text-muted-foreground">选择周期后查看对应价格，支付成功后立即生效。</p><Tabs value={periods[periodIndex].id} onValueChange={value => setPeriodIndex(periods.findIndex(item => item.id === value))}><TabsList>{periods.map(item => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}</TabsList></Tabs></header>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map(plan => <Card key={plan.id} className={plan.recommended ? "border-foreground" : undefined}>
            <CardHeader><div className="flex items-center justify-between"><CardTitle>{plan.name}</CardTitle>{plan.recommended ? <Badge>推荐</Badge> : null}</div><p className="text-sm text-muted-foreground">{plan.title}</p><div className="pt-2"><span className="text-4xl font-semibold">￥{plan.prices[periodIndex]}</span><span className="text-sm text-muted-foreground"> / {periods[periodIndex].days}</span></div><p className="min-h-10 text-sm text-muted-foreground">{plan.description}</p></CardHeader>
            <CardContent className="grid gap-5"><Button variant={plan.recommended ? "default" : "outline"} disabled={loading} onClick={() => inAccount ? createOrder(plan) : undefined} asChild={!inAccount}>{inAccount ? <>{loading ? <Loader2 className="animate-spin" /> : null}选择套餐</> : <Link to="/login?returnTo=/account/plans">登录后购买</Link>}</Button>{plan.id === "pro" && inAccount ? <Button variant="outline" disabled={loading} onClick={() => createOrder(plan, "pro-test-001")}>1 元支付测试</Button> : null}<Separator /><div className="grid gap-3 text-sm"><p className="flex items-center gap-2"><Check className="size-4" />{plan.traffic}</p><p className="flex items-center gap-2"><Check className="size-4" />可绑定 {plan.devices[periodIndex]} 台设备</p>{plan.features.map(feature => <p key={feature} className="flex items-center gap-2"><Check className="size-4" />{feature}</p>)}</div></CardContent>
          </Card>)}
        </div>
        {order ? <Card className="mx-auto w-full max-w-xl"><CardHeader><CardTitle>支付订单</CardTitle></CardHeader><CardContent className="grid gap-3"><div className="flex justify-between text-sm"><span>订单号</span><strong>{order.tid || order.merOrderTid}</strong></div><div className="flex justify-between text-sm"><span>状态</span><strong>{order.status}</strong></div>{order.payUrl ? <Button asChild><a href={order.payUrl} target="_blank" rel="noreferrer">打开支付页面</a></Button> : null}<Button variant="outline" onClick={checkOrder} disabled={checking}><RefreshCw />刷新支付状态</Button></CardContent></Card> : null}
        {!inAccount ? <p className="text-center text-sm text-muted-foreground">所有套餐一经支付不支持退款</p> : null}
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
          <Badge className="w-fit">myVpnMonitor</Badge>
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
