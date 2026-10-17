import * as React from "react"
import { Eye, Loader2, Send } from "lucide-react"
import { Link } from "react-router-dom"
import { toast } from "@/components/features/toast"

import { fetchJson, putJson } from "@/api"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { EmptyState } from "@/components/features/shared"
import { CopyButton } from "@/components/arc/copy-button/copy-button"
import type { AddonService, AdminDeliveryOrder, CustomInboundOption } from "@/types"
import { formatDate, formatDateTime, formatMoney } from "@/utils"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Textarea } from "@/components/arc/textarea/textarea"
import { Card } from "@/components/arc/card/card"

type DeliveredOrder = { id: string; deliveryNotifyError?: string }

// Custom inbounds are loaded once and shared by every form on the page.
let customInboundRequest: Promise<CustomInboundOption[]> | null = null
function loadCustomInbounds() {
  customInboundRequest ||= fetchJson<CustomInboundOption[]>("/api/admin/custom-inbounds").catch(error => { customInboundRequest = null; throw error })
  return customInboundRequest
}

export function serviceNames(services: AddonService[]) {
  return services.map(service => `${service.name}${service.regionName ? ` · ${service.regionName}` : ""}${service.quantity > 1 ? ` ×${service.quantity}` : ""}`).join("、")
}

export function BuyerInputRow({ service }: { service: AddonService }) {
  if (!service.buyerInputLabel) return null
  return <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">{service.buyerInputLabel}：</span><span className="min-w-0 font-medium break-all">{service.buyerInput || "未填写"}</span>{service.buyerInput ? <CopyButton value={service.buyerInput} variant="plain" /> : null}</div>
}

// Delivers one paid add-on order: text content for card keys/accounts/top-ups, inbound
// selection for custom nodes. The server emails the customer a link afterwards.
export function ServiceDeliveryForm({ order, onDelivered }: { order: { id: string; services?: AddonService[] }; onDelivered: (order: DeliveredOrder) => void }) {
  const service = order.services?.[0]
  const byInbounds = service?.delivery === "inbounds"
  const [deliveryNote, setDeliveryNote] = React.useState("")
  const [inboundIds, setInboundIds] = React.useState<number[]>([])
  const [inbounds, setInbounds] = React.useState<CustomInboundOption[] | null>(byInbounds ? null : [])
  const [loadError, setLoadError] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const idPrefix = `delivery-${order.id}`

  React.useEffect(() => {
    if (!byInbounds) return
    loadCustomInbounds().then(setInbounds).catch(error => setLoadError(error instanceof Error ? error.message : "定制入站加载失败"))
  }, [byInbounds])

  if (!service) return null
  const ready = byInbounds ? inboundIds.length > 0 : deliveryNote.trim().length > 0

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try {
      const delivered = await putJson<DeliveredOrder>(`/api/admin/orders/${encodeURIComponent(order.id)}`, { deliveryNote, inboundIds })
      if (delivered.deliveryNotifyError) toast({ type: "warning", title: `已交付，但邮件提醒未发送：${delivered.deliveryNotifyError}` })
      else toast({ type: "success", title: "已交付，并已邮件提醒客户" })
      onDelivered(delivered)
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "交付失败" })
    } finally { setSubmitting(false) }
  }

  const enabledInbounds = (inbounds || []).filter(inbound => inbound.enabled)
  return <form className="grid gap-4" onSubmit={event => void submit(event)}>
    <FieldGroup>
      {byInbounds ? <FieldSet>
        <FieldLegend>授权定制入站</FieldLegend>
        <FieldDescription>勾选后立即绑定到该用户；有效期从交付起算{service.durationDays ? ` ${service.durationDays * service.quantity} 天` : ""}，到期自动解绑。</FieldDescription>
        {loadError ? <Alert tone="danger" title={loadError} />
          : inbounds === null ? <Skeleton lines={2} />
          : enabledInbounds.length ? <div className="grid gap-2 sm:grid-cols-2">{enabledInbounds.map(inbound => <Field key={inbound.id} orientation="horizontal">
            <Checkbox id={`${idPrefix}-inbound-${inbound.id}`} checked={inboundIds.includes(inbound.id)} onCheckedChange={checked => setInboundIds(current => checked === true ? [...current, inbound.id] : current.filter(id => id !== inbound.id))} />
            <FieldLabel htmlFor={`${idPrefix}-inbound-${inbound.id}`} className="font-normal">{inbound.name}{inbound.region ? <span className="text-muted-foreground">{inbound.region}</span> : null}</FieldLabel>
          </Field>)}</div>
          : <EmptyState title="没有可用的定制入站" description="请先在入站管理中把家宽等入站标记为定制类型并启用。" />}
      </FieldSet> : null}
      <Textarea label={byInbounds ? "交付说明（可选）" : "交付内容"} description="客户登录后在订单详情查看；提醒邮件只包含订单链接，不含交付内容。" id={`${idPrefix}-note`} rows={byInbounds ? 2 : 4} maxLength={2000} value={deliveryNote} onChange={event => setDeliveryNote(event.target.value)} placeholder={byInbounds ? "例如：节点地区、使用注意事项" : "卡密、账号密码或充值凭证"} />
    </FieldGroup>
    <div className="flex justify-end"><ActionButton type="submit" disabled={!ready || submitting} className="min-h-11 sm:min-h-9" aria-label={`交付并通知客户：${serviceNames(order.services || [])}`} label="交付并通知客户" pending={submitting} /></div>
  </form>
}

function OrderMeta({ order }: { order: AdminDeliveryOrder }) {
  return <p className="text-sm text-muted-foreground line-clamp-none tabular-nums">{order.email || "无邮箱"}{order.customerID ? ` · #${order.customerID}` : ""} · {order.merOrderTid} · {formatMoney(order.totalAmount ?? order.amount)} · 付款 {formatDateTime(order.paidAt)}</p>
}

function HandlerBadges({ services }: { services: AddonService[] }) {
  return <>{[...new Set(services.map(service => service.handlerLabel))].map(label => <Badge key={label}>{label}</Badge>)}</>
}

export function ServiceDeliveriesPage() {
  const [data, setData] = React.useState<{ pending: AdminDeliveryOrder[]; delivered: AdminDeliveryOrder[] } | null>(null)
  const [error, setError] = React.useState("")
  const load = React.useCallback(() => fetchJson<{ pending: AdminDeliveryOrder[]; delivered: AdminDeliveryOrder[] }>("/api/admin/deliveries").then(value => { setData(value); setError("") }).catch(error => setError(error instanceof Error ? error.message : "加载失败")), [])
  React.useEffect(() => { void load() }, [load])

  if (!data && !error) return <div className="grid gap-4 px-4 lg:px-6"><Skeleton lines={2} className="w-56" /><Skeleton lines={5} /><Skeleton lines={5} /></div>
  return <div className="grid gap-4 px-4 lg:px-6">
    {error ? <Alert tone="danger" title={error} /> : null}
    {data ? <Tabs defaultValue="pending" className="gap-4">
      <TabsList><TabsTrigger value="pending">待交付 {data.pending.length}</TabsTrigger><TabsTrigger value="delivered">最近已交付</TabsTrigger></TabsList>
      <TabsContent value="pending">
        {data.pending.length ? <div className="grid gap-3 gap-4">{data.pending.map(order => <Card key={order.id} className="flex-col items-stretch gap-4" title={<>{serviceNames(order.services)}<HandlerBadges services={order.services} /></>} headerAction={<><ServiceDeliveryForm order={order} onDelivered={() => void load()} /></>}><OrderMeta order={order} />{order.services.map(service => <BuyerInputRow key={service.id} service={service} />)}</Card>)}</div> : <EmptyState title="没有待交付的服务" description="客户购买人工交付的附加服务并付款后，会出现在这里。" />}
      </TabsContent>
      <TabsContent value="delivered">
        {data.delivered.length ? <div className="grid gap-3 gap-3">{data.delivered.map(order => <Card key={order.id} title={<>{serviceNames(order.services)}<HandlerBadges services={order.services} />{order.deliveryNotifyError ? <Badge tone="warning">邮件未发送</Badge> : order.deliveryNotifiedAt ? <Badge tone="success">已邮件提醒</Badge> : null}</>} description={`交付于 ${formatDateTime(order.fulfilledAt)}${order.deliveredBy ? ` · ${order.deliveredBy}` : ""}${order.services[0]?.expiresAt ? ` · 有效期至 ${formatDate(order.services[0].expiresAt)}` : ""}${order.deliveryNotifyError ? ` · ${order.deliveryNotifyError}` : ""}`} headerAction={<><Button asChild variant="ghost" size="icon"><Link to={`/orders/${encodeURIComponent(order.id)}`} aria-label={`查看订单 ${order.merOrderTid}`}><Eye /></Link></Button></>}><OrderMeta order={order} /></Card>)}</div> : <EmptyState title="还没有交付记录" description="完成交付的人工服务会显示在这里。" />}
      </TabsContent>
    </Tabs> : null}
  </div>
}
