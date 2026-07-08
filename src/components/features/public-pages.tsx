import * as React from "react"
import { useParams } from "react-router-dom"
import { CheckCircle, LinkIcon, Loader2, RefreshCw, Rocket, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { fetchJson, postJson } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { CopyButton, EmptyState } from "@/components/features/shared"
import { formatDate } from "@/utils"

const plans = [
  { id: "basic", name: "BASIC", title: "基本套餐", options: [{ id: "basic-30", label: "月付", days: "30天", price: 39, traffic: "100G/月" }, { id: "basic-360", label: "年付", days: "360天", price: 369, traffic: "100G/月" }] },
  { id: "pro", name: "PRO", title: "高级套餐", recommended: true, options: [{ id: "pro-30", label: "月付", days: "30天", price: 49, traffic: "200G/月" }, { id: "pro-360", label: "年付", days: "360天", price: 429, traffic: "200G/月" }] },
  { id: "ultra", name: "ULTRA", title: "极致套餐", options: [{ id: "ultra-30", label: "月付", days: "30天", price: 89, traffic: "300G/月" }, { id: "ultra-360", label: "年付", days: "360天", price: 859, traffic: "300G/月" }] },
]

export function PricingPage() {
  const [selected, setSelected] = React.useState({ plan: plans[1], option: plans[1].options[1] })
  const [email, setEmail] = React.useState("")
  const [order, setOrder] = React.useState<Record<string, string> | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [checking, setChecking] = React.useState(false)

  async function createOrder() {
    const normalizedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return toast.error("请输入有效邮箱")
    setLoading(true)
    try {
      const nextOrder = await postJson<Record<string, string>>("/api/payments/orders", {
        planId: selected.plan.id,
        planName: selected.plan.name,
        optionId: selected.option.id,
        optionLabel: `${selected.plan.name} ${selected.option.label} ${selected.option.days}`,
        amount: selected.option.price,
        email: normalizedEmail,
        returnUrl: window.location.href,
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
    <main className="min-h-svh bg-background p-6 text-foreground">
      <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-6">
          <div className="grid gap-2">
            <Badge className="w-fit">myVpnMonitor</Badge>
            <h1 className="text-3xl font-semibold tracking-tight">选择适合你的套餐</h1>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map(plan => (
              <Card key={plan.id}>
                <CardHeader>
                  <div><p className="text-sm text-muted-foreground">{plan.name}</p><CardTitle>{plan.title}</CardTitle></div>
                  {plan.recommended && <Badge>推荐</Badge>}
                </CardHeader>
                <CardContent className="grid gap-2">
                  {plan.options.map(option => (
                    <Button key={option.id} type="button" variant={selected.option.id === option.id ? "default" : "outline"} onClick={() => setSelected({ plan, option })} className="h-auto justify-between py-3">
                      <div className="grid text-left"><span>{option.label} / {option.days}</span><strong>￥{option.price}</strong></div>
                      <p>{option.traffic}</p>
                    </Button>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
        <Card>
          <CardHeader><CardTitle>{selected.plan.name} / {selected.option.label}</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="text-3xl font-semibold">￥{selected.option.price}</div>
            <Input type="email" placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} />
            <Button onClick={createOrder} disabled={loading}>{loading && <Loader2 />}生成支付订单</Button>
            {order && (
              <div className="grid gap-3 rounded-lg border p-3 text-sm">
                <div className="flex justify-between"><span>订单</span><strong>{order.tid || order.merOrderTid}</strong></div>
                <div className="flex justify-between"><span>状态</span><strong>{order.status}</strong></div>
                {order.payUrl && <Button asChild><a href={order.payUrl} target="_blank" rel="noreferrer">打开支付页面</a></Button>}
                <Button variant="outline" onClick={checkOrder} disabled={checking}><RefreshCw />刷新支付状态</Button>
              </div>
            )}
          </CardContent>
        </Card>
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
