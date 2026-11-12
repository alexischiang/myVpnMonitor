import * as React from "react"
import { Link } from "react-router-dom"
import { Download, Loader2, QrCode, RefreshCw } from "lucide-react"
import { IconBrandAlipay, IconBrandWechat } from "@tabler/icons-react"

import { ApiError, fetchJson, postJson } from "@/api"
import { formatDateTime, formatMoney } from "@/utils"
import { useData } from "@/components/features/data-provider"
import { CatalogPlanFields, catalogPlanOptions, useCatalogV2Products } from "@/components/features/catalog-plan-fields"
import type { PaymentPlatform } from "@/components/features/cashier-types"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Combobox } from "@/components/arc/combobox/combobox"
import { CopyButton } from "@/components/arc/copy-button/copy-button"
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog"
import { RadioCards } from "@/components/arc/radio-cards/radio-cards"
import { Select } from "@/components/arc/select/select"
import { Skeleton } from "@/components/arc/skeleton/skeleton"

type Method = "100" | "200"

type PaymentLinkQuote = {
  optionId: string
  planName?: string
  optionLabel: string
  amount: number
  purchaseAction: "initial" | "extend" | "replace" | "add_on"
  replacesTrial?: boolean
  paymentPlatforms: PaymentPlatform[]
}

export type PaymentLinkOrder = {
  id: string
  merOrderTid: string
  planName: string
  optionLabel: string
  email: string
  amount: number
  channelCode: string
  status: string
  statusText: string
  fulfillmentStatus: string
  paymentError: string
  expiresAt: string
}

export type PaymentLinkResult = { order: PaymentLinkOrder; qr: { content: string; imageDataUrl: string } | null }

const methodLabels: Record<Method, string> = { "100": "支付宝", "200": "微信支付" }
const POLL_MS = 5000

/**
 * Admin creates an order for a customer and gets a payment QR code to send them.
 * Without accountId the dialog lets the admin pick the customer; with orderId it shows that order's code.
 */
export function AdminPaymentLinkDialog({ open, onOpenChange, accountId, customerLabel, orderId, onChanged }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId?: string
  customerLabel?: string
  orderId?: string
  onChanged?: () => void
}) {
  const [result, setResult] = React.useState<PaymentLinkResult | null>(null)
  const [loadError, setLoadError] = React.useState("")

  React.useEffect(() => {
    if (!open) { setResult(null); setLoadError(""); return }
    if (!orderId) return
    fetchJson<PaymentLinkResult>(`/api/admin/payment-links/${encodeURIComponent(orderId)}`).then(setResult).catch(error => setLoadError(error instanceof Error ? error.message : "读取付款二维码失败"))
  }, [open, orderId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={orderId ? "付款二维码" : "代客下单"} description={result ? undefined : customerLabel ? `客户：${customerLabel}` : undefined} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {result ? <PaymentLinkResultView result={result} onResult={next => { setResult(next); if (next.order.status !== result.order.status) onChanged?.() }} onRestart={orderId ? undefined : () => setResult(null)} />
          : orderId ? (loadError ? <Alert tone="danger" title="读取付款二维码失败">{loadError}</Alert> : <Skeleton lines={6} className="w-full" />)
          : <PaymentLinkForm accountId={accountId} onCreated={created => { setResult(created); onChanged?.() }} />}
      </DialogContent>
    </Dialog>
  )
}

function PaymentLinkForm({ accountId: fixedAccountId, onCreated }: { accountId?: string; onCreated: (result: PaymentLinkResult) => void }) {
  const { users, reload } = useData()
  const products = useCatalogV2Products()
  React.useEffect(() => { if (!fixedAccountId && !users.length) void reload(["users"], { silent: true }) }, [fixedAccountId, users.length, reload])
  // Plan specs only: add-ons need buyer inputs (region, account) the admin cannot fill in for the customer.
  const options = React.useMemo(() => catalogPlanOptions(products || []), [products])
  const [accountId, setAccountId] = React.useState(fixedAccountId || "")
  const [optionId, setOptionId] = React.useState("")
  const [trafficTier, setTrafficTier] = React.useState("1")
  const [quote, setQuote] = React.useState<PaymentLinkQuote | null>(null)
  const [quoting, setQuoting] = React.useState(false)
  const [platformId, setPlatformId] = React.useState("")
  const [method, setMethod] = React.useState<Method>("100")
  const [confirmReplace, setConfirmReplace] = React.useState(false)
  const [error, setError] = React.useState("")
  const [pendingOrderId, setPendingOrderId] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const customerOptions = React.useMemo(() => users
    .filter(user => user.accountId && ["active", "invited"].includes(user.accountStatus || ""))
    .map(user => ({ value: user.accountId as string, label: user.email || user.userId || user.accountId as string, keywords: [user.userId, user.wechatName, user.email].filter(Boolean) as string[] })), [users])

  React.useEffect(() => { if (!optionId && options[0]) setOptionId(options[0].value) }, [optionId, options])

  React.useEffect(() => {
    setQuote(null)
    setConfirmReplace(false)
    setPendingOrderId("")
    if (!accountId || !optionId) return
    let active = true
    setQuoting(true)
    setError("")
    postJson<PaymentLinkQuote>("/api/admin/payment-links/quote", { accountId, optionId, trafficTier: Number(trafficTier) })
      .then(next => {
        if (!active) return
        setQuote(next)
        const ready = next.paymentPlatforms.filter(item => item.ready && (item.methods.alipay || item.methods.wechat))
        setPlatformId(current => ready.some(item => item.id === current) ? current : ready[0]?.id || "")
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "获取报价失败") })
      .finally(() => { if (active) setQuoting(false) })
    return () => { active = false }
  }, [accountId, optionId, trafficTier])

  const platforms = (quote?.paymentPlatforms || []).filter(item => item.ready && (item.methods.alipay || item.methods.wechat))
  const platform = platforms.find(item => item.id === platformId)
  React.useEffect(() => {
    if (platform && !platform.methods[method === "100" ? "alipay" : "wechat"]) setMethod(platform.methods.alipay ? "100" : "200")
  }, [platform, method])

  const needsReplaceConfirm = quote?.purchaseAction === "replace" && !quote.replacesTrial
  const canSubmit = Boolean(quote && platform && !quoting && !saving && (!needsReplaceConfirm || confirmReplace))

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!quote || !canSubmit) return
    setSaving(true)
    setError("")
    setPendingOrderId("")
    try {
      onCreated(await postJson<PaymentLinkResult>("/api/admin/payment-links", {
        accountId, optionId, trafficTier: Number(trafficTier), channelCode: method, paymentPlatformId: platformId,
        expectedAmount: quote.amount, confirmReplacement: confirmReplace,
      }))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        if (typeof cause.body.orderId === "string") setPendingOrderId(cause.body.orderId)
        if (cause.body.quote) setQuote(current => current ? { ...current, ...(cause.body.quote as Partial<PaymentLinkQuote>) } : current)
      }
      setError(cause instanceof Error ? cause.message : "代客下单失败")
    } finally {
      setSaving(false)
    }
  }

  if (!products) return <Skeleton lines={5} className="w-full" />
  return (
    <form className="grid gap-4" onSubmit={submit}>
      {fixedAccountId ? null : <Combobox label="客户" id="payment-link-customer" options={customerOptions} value={accountId} onValueChange={setAccountId} placeholder="搜索邮箱、用户 ID 或微信号" emptyMessage="没有可以下单的账户" disabled={saving} />}
      <CatalogPlanFields idPrefix="payment-link" label="商品规格" options={options} value={optionId} onValueChange={value => { setOptionId(value); setTrafficTier("1") }} trafficTier={trafficTier} onTrafficTierChange={setTrafficTier} disabled={saving} />
      {quoting ? <Skeleton lines={2} className="w-full" /> : quote ? <Card title={[quote.planName, quote.optionLabel].filter(Boolean).join(" · ")} description="按客户自己下单的价格收款，不使用账户余额" headerAction={<span className="font-semibold tabular-nums">{formatMoney(quote.amount)}</span>} /> : null}
      {quote && ["replace", "extend"].includes(quote.purchaseAction) ? <Alert tone="warning" title={quote.purchaseAction === "replace" ? "付款后将立即替换客户当前套餐。" : "付款后将在当前到期日基础上续期。"} /> : null}
      {needsReplaceConfirm ? <Checkbox id="payment-link-confirm-replace" label="已告知客户新套餐会立即覆盖当前套餐" checked={confirmReplace} onCheckedChange={checked => setConfirmReplace(checked === true)} disabled={saving} /> : null}
      {quote ? (platforms.length ? <>
        {platforms.length > 1 ? <Select label="支付平台" id="payment-link-platform" value={platformId} onValueChange={setPlatformId} disabled={saving} className="w-full" options={platforms.map(item => ({ value: item.id, label: item.name }))} /> : null}
        <RadioCards aria-label="付款方式" name="payment-link-method" layout="grid" value={method} onValueChange={value => setMethod(value as Method)} disabled={saving} options={[
          { value: "100", label: "支付宝", icon: <IconBrandAlipay className="size-5 text-[#1677ff]" />, disabled: !platform?.methods.alipay, disabledReason: "该支付平台未开启支付宝" },
          { value: "200", label: "微信支付", icon: <IconBrandWechat className="size-5 text-[#07c160]" />, disabled: !platform?.methods.wechat, disabledReason: "该支付平台未开启微信支付" },
        ]} />
      </> : <Alert tone="warning" title="没有可用的线上支付渠道">请先在支付设置中启用支付宝或微信通道。</Alert>) : null}
      {error ? <Alert tone="danger" title="代客下单失败">{error}{pendingOrderId ? <> <Button asChild variant="link" size="sm"><Link to={`/orders/${pendingOrderId}`}>查看该订单</Link></Button></> : null}</Alert> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose asChild><Button type="button" variant="secondary" disabled={saving}>取消</Button></DialogClose>
        <ActionButton type="submit" disabled={!canSubmit} label={`生成付款二维码${quote ? ` ${formatMoney(quote.amount)}` : ""}`} pendingLabel="正在创建订单..." pending={saving} />
      </div>
    </form>
  )
}

function PaymentLinkResultView({ result, onResult, onRestart }: { result: PaymentLinkResult; onResult: (result: PaymentLinkResult) => void; onRestart?: () => void }) {
  const { order, qr } = result
  const method = (order.channelCode === "200" ? "200" : "100") as Method
  const channelLabel = order.channelCode === "manual" ? "人工收款" : order.channelCode in methodLabels ? methodLabels[method] : ""
  const [refreshing, setRefreshing] = React.useState(false)
  const [refreshError, setRefreshError] = React.useState("")
  const onResultRef = React.useRef(onResult)
  onResultRef.current = onResult

  const refresh = React.useCallback(async (background: boolean) => {
    if (!background) setRefreshing(true)
    try {
      onResultRef.current(await fetchJson<PaymentLinkResult>(`/api/admin/payment-links/${encodeURIComponent(order.id)}`, { background }))
      setRefreshError("")
    } catch (cause) {
      setRefreshError(cause instanceof Error ? cause.message : "刷新订单状态失败")
    } finally {
      if (!background) setRefreshing(false)
    }
  }, [order.id])

  // Polls until the order leaves pending, so the dialog turns to paid without the admin doing anything.
  React.useEffect(() => {
    if (order.status !== "pending") return
    const timer = window.setInterval(() => void refresh(true), POLL_MS)
    return () => window.clearInterval(timer)
  }, [order.status, refresh])

  const paid = order.status === "paid"
  const statusTone = paid ? "success" : order.status === "pending" ? "info" : "neutral"
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone}>{order.statusText}</Badge>
        <span className="text-sm">{[channelLabel, order.planName, order.optionLabel].filter(Boolean).join(" · ")}</span>
        <span className="ml-auto font-semibold tabular-nums">{formatMoney(order.amount)}</span>
      </div>
      {qr ? <Card>
        <div className="grid justify-items-center gap-2">
          <img src={qr.imageDataUrl} alt={`${methodLabels[method]}付款二维码`} className="aspect-square w-full max-w-72 rounded-md bg-white" />
          <p className="text-xs text-muted-foreground tabular-nums">订单号 {order.merOrderTid} · 有效期至 {formatDateTime(order.expiresAt)}</p>
        </div>
      </Card> : null}
      {qr ? <Alert tone="info" title={`请客户用${method === "200" ? "微信" : "支付宝"}「扫一扫」付款`}>客户也可以保存二维码图片，在{method === "200" ? "微信" : "支付宝"}扫一扫里从相册识别。付款后本窗口会自动更新状态。</Alert> : null}
      {paid ? (order.fulfillmentStatus === "failed"
        ? <Alert tone="warning" title="已收款，服务发放失败">请在订单详情查看原因并重新发放。</Alert>
        : <Alert tone="success" title={order.fulfillmentStatus === "fulfilled" ? "已收款，服务已发放" : "已收款，正在发放服务"} />) : null}
      {!paid && order.status !== "pending" ? <Alert tone="warning" title="订单已关闭">{order.paymentError || "订单已过期或已取消，客户无法再付款。"}</Alert> : null}
      {order.status === "pending" && order.paymentError ? <Alert tone="warning" title="付款暂未完成">{order.paymentError}</Alert> : null}
      {refreshError ? <Alert tone="danger" title="刷新订单状态失败">{refreshError}</Alert> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {qr ? <>
          <CopyButton value={qr.content} label="复制支付链接" />
          <Button asChild variant="secondary"><a href={qr.imageDataUrl} download={`付款二维码-${order.merOrderTid}.png`}><Download />下载二维码</a></Button>
          <Button type="button" variant="secondary" disabled={refreshing} onClick={() => void refresh(false)}>{refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}刷新状态</Button>
        </> : null}
        {!paid && order.status !== "pending" && onRestart ? <Button type="button" variant="secondary" onClick={onRestart}><QrCode />重新下单</Button> : null}
        {onRestart ? <Button asChild><Link to={`/orders/${order.id}`}>查看订单</Link></Button> : <DialogClose asChild><Button type="button">关闭</Button></DialogClose>}
      </div>
    </div>
  )
}
