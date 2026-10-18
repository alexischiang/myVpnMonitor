import * as React from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, CircleX, Clock3, Loader2, RefreshCw, WalletCards } from "lucide-react"
import { toast } from "@/components/features/toast"
import { clearJsonCache, deleteJson, fetchJson, postJson, putJson } from "@/api"
import { formatMoney } from "@/utils"
import { CashierCard } from "./cashier-card"
import { OrderSummary } from "./order-summary"
import { OnlinePayment } from "./online-payment"
import { NoticeBadge } from "./notice-badge"
import { PurchasedServices } from "./purchased-services"
import type { PaymentOrder } from "./cashier-types"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog"

function collectionTitle(order: PaymentOrder) {
  if (order.status !== "paid") return order.status === "pending" ? "等待付款" : order.statusText
  if (order.fulfillmentStatus === "failed") return "已收款，发放遇到问题"
  if (order.fulfillmentStatus === "fulfilled") return "付款与发放已完成"
  if (order.fulfillmentStatus === "manual_pending") return "已收款，等待人工服务交付"
  return order.manualPaidAt ? "已人工收款，正在发放" : "已收款，正在发放"
}

export function Cashier({ initialOrder }: { initialOrder: PaymentOrder }) {
  const [order, setOrder] = React.useState(initialOrder)
  const [now, setNow] = React.useState(Date.now())
  const [busy, setBusy] = React.useState(false)
  const [paymentBusy, setPaymentBusy] = React.useState(false)
  const operationRef = React.useRef(false)
  const [error, setError] = React.useState("")
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const seconds = Math.max(0, Math.ceil((new Date(order.expiresAt).getTime() - now) / 1000))
  const pending = order.status === "pending"
  const disabled = busy || paymentBusy || seconds === 0
  const displayAmount = formatMoney(pending ? order.amount : order.totalAmount ?? order.amount)
  const statusNotice = pending
    ? <NoticeBadge icon={Clock3} label={seconds > 0 ? <>请在 <span className="font-medium tabular-nums">{Math.floor(seconds / 60).toString().padStart(2, "0")}:{(seconds % 60).toString().padStart(2, "0")}</span> 内完成付款</> : "订单已到期，正在更新状态…"} variant="warning" size="lg" />
    : order.status !== "paid" ? <NoticeBadge icon={CircleX} label="该订单已关闭" variant="error" size="lg" /> : null
  function update(next: PaymentOrder) {
    setOrder(next)
    clearJsonCache()
    window.dispatchEvent(new Event("payment-order-updated"))
  }
  async function operate(action: "refresh" | "cancel" | "start" | "test") {
    if (operationRef.current || paymentBusy) return
    operationRef.current = true
    setBusy(true)
    setError("")
    try {
      const base = `/api/payments/orders/${encodeURIComponent(order.id)}`
      const result = action === "cancel" ? await deleteJson<PaymentOrder>(`/api/orders/${encodeURIComponent(order.id)}`)
        : action === "test" ? await putJson<PaymentOrder>(`${base}/test-status`, { status: "paid" })
        : await postJson<PaymentOrder>(`${base}/${action}`, {})
      update(result)
      if (action === "refresh") result.status === "paid" ? toast({ type: "success", title: "已确认支付成功" }) : toast({ type: "info", title: result.status === "pending" ? "暂未检测到支付结果" : result.statusText })
      if (action === "cancel") setCancelOpen(false)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "操作失败，请重试。"
      setError(message)
      if (action === "refresh") toast({ type: "error", title: message })
    }
    finally { operationRef.current = false; setBusy(false) }
  }
  React.useEffect(() => {
    if (!pending && !(order.status === "paid" && !["fulfilled", "manual_pending", "failed"].includes(order.fulfillmentStatus || ""))) return
    let stopped = false
    let polling = false
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    // Poll local order state; do not repeatedly query the external provider.
    const poll = window.setInterval(async () => {
      if (polling || operationRef.current || paymentBusy) return
      polling = true
      try { const next = await fetchJson<PaymentOrder>(`/api/orders/${encodeURIComponent(order.id)}`, { background: true }); if (!stopped) update(next) }
      catch { if (!stopped) setError("暂时无法更新订单状态，请检查网络后重试。") }
      finally { polling = false }
    }, 5000)
    return () => { stopped = true; window.clearInterval(clock); window.clearInterval(poll) }
  }, [order.id, order.status, order.fulfillmentStatus, paymentBusy])

  return <div className="mx-auto grid w-full max-w-lg gap-5"><CashierCard amount={displayAmount} notice={statusNotice}>
      {error ? <Alert tone="warning" title="操作暂未完成">{error}</Alert> : null}
      <OrderSummary order={order} />
      {pending && seconds > 0 ? <>
        {order.amount > 0 ? <OnlinePayment invoice={order} disabled={disabled} onUpdated={update} onBusy={setPaymentBusy} /> : <section className="grid gap-3"><p className="text-sm text-muted-foreground">{order.walletAmount ? "账户余额已预留，确认后扣除余额并发放服务。" : "本订单无需付款，确认后发放服务。"}</p><ActionButton className="min-h-11" disabled={disabled} onClick={() => void operate("start")} label={order.walletAmount ? "余额付款" : "确认完成"} pending={busy} /></section>}
        {order.paymentProvider === "test" ? <Button variant="secondary" className="min-h-11" disabled={disabled} onClick={() => void operate("test")}>模拟测试支付成功</Button> : null}
      </> : null}
      {order.status === "paid" ? <Alert tone={order.fulfillmentStatus === "failed" ? "warning" : "info"} title={collectionTitle(order)}>{order.fulfillmentStatus === "failed" ? `款项已确认，请勿再次付款。请联系客服处理${order.purpose === "recharge" ? "余额入账" : "套餐发放"}。` : order.fulfillmentStatus === "manual_pending" ? "客服将继续处理人工服务交付，你可以在订单详情中查看后续结果。" : order.fulfillmentStatus === "fulfilled" ? "服务已生效，可以前往账户查看。" : "款项已确认，正在为你处理服务。"}{order.manualPaidAt ? " 本订单由客服确认人工收款。" : ""}</Alert> : null}
      {order.services?.length ? <PurchasedServices services={order.services} /> : null}
      <div className="grid gap-3">
        {pending || (order.status === "paid" && order.fulfillmentStatus !== "fulfilled") ? <ActionButton variant="secondary" className="min-h-11" disabled={busy || paymentBusy} onClick={() => void operate("refresh")} label="检查支付状态" pending={busy} /> : null}
        {order.status === "paid" ? <Button asChild className="min-h-11">{order.purpose === "recharge" ? <Link to="/account/wallet">查看账户余额</Link> : <Link to="/account">查看我的套餐</Link>}</Button> : null}
      </div>
      <div className={pending ? "grid grid-cols-[3fr_1fr] gap-3" : "grid"}><Button asChild variant="secondary" className="min-h-11"><Link to="/account/orders"><ArrowLeft />返回我的订单</Link></Button>{pending ? <Button variant="danger" className="min-h-11 px-2" disabled={disabled} onClick={() => setCancelOpen(true)}>取消订单</Button> : null}</div>
  </CashierCard>
    <Dialog open={cancelOpen} onOpenChange={setCancelOpen}><DialogContent title="取消这个订单？" description="订单将关闭，预留余额会释放。已打开的支付页面可能仍然可用，请勿再付款；如果已经付款，请先检查付款状态。"><div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button variant="secondary" disabled={busy}>保留订单</Button></DialogClose><DialogClose asChild><Button variant="primary" disabled={busy} onClick={event => { event.preventDefault(); void operate("cancel") }}>确认取消订单</Button></DialogClose></div></DialogContent></Dialog>
  </div>
}
