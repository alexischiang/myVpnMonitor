import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Link, useParams } from "react-router-dom"
import { AlertCircle, Eye, Loader2, Undo2 } from "lucide-react"

import { fetchJson, postJson, putJson } from "@/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { DataTableCard } from "@/components/features/data-table-card"
import { DataTable, DataTableColumnHeader, DataTableRowActions } from "@/components/features/data-table"
import { OrderMobileItem } from "@/components/features/order-mobile-item"
import { EmptyState, PageHeader } from "@/components/features/shared"
import { BackButton } from "@/components/features/back-button"
import { useSearchParamState } from "@/hooks/use-search-param-state"
import { durationLabels, formatDateTime, formatMoney } from "@/utils"

type AdminOrder = {
  id: string
  merOrderTid: string
  purpose: "plan" | "recharge" | "traffic_pack" | "addon"
  purchaseAction?: "initial" | "extend" | "replace" | "add_on"
  planName: string
  optionLabel: string
  duration?: string
  amount: number
  totalAmount?: number
  walletAmount?: number
  walletCashAmount?: number
  walletGiftAmount?: number
  walletReferralAmount?: number
  realCashAmount?: number
  virtualCashAmount?: number
  originalAmount?: number
  baseAmount?: number
  trafficTier?: number
  trafficGb?: number
  trafficTierMarkupPercent?: number
  addOnAmount?: number
  addOnSnapshots?: Array<{ id: string; optionId: string; name: string; regionName?: string; amount: number; durationDays?: number; deliveryMode?: string; deliveryDescription?: string }>
  discountAmount?: number
  vipDiscountAmount?: number
  subtotal?: number
  taxAmount?: number
  channelCode?: string
  couponCode?: string
  userId?: string
  email?: string
  status: string
  statusText: string
  fulfillmentStatus?: string
  fulfillmentStartedAt?: string
  fulfilledAt?: string
  deliveryNote?: string
  fulfillmentError?: string
  internalFulfillmentError?: string
  paymentError?: string
  deliveryUrl?: string
  reversible?: boolean
  reversedAt?: string
  reversalError?: string
  createdAt: string
  paidAt?: string
}

const orderStatusLabels: Record<string, string> = {
  pending: "待付款",
  closed: "已取消",
  failed: "支付失败",
  abnormal: "支付异常",
  unfulfilled: "已付款未发放套餐",
  manual_pending: "待人工交付",
  fulfilled: "已完成",
  reversed: "已撤销",
}

const paymentChannelLabels: Record<string, string> = { "100": "支付宝", "200": "微信支付", manual: "人工收款", wallet: "账户余额", "cash-credit": "零元订单" }

const orderTypeLabels: Record<string, string> = {
  initial: "新购",
  extend: "续费",
  replace: "覆盖套餐",
  add_on: "流量包",
  addon: "附加服务",
  recharge: "余额充值",
}

const orderTypeVariants = {
  initial: "success",
  extend: "default",
  replace: "warning",
  recharge: "secondary",
  addon: "secondary",
} as const

function orderType(order: AdminOrder) {
  return order.purpose === "recharge" ? "recharge" : order.purpose === "addon" ? "addon" : order.purchaseAction || "initial"
}

function orderStatus(order: AdminOrder) {
  if (order.reversedAt || order.fulfillmentStatus === "reversed") return "reversed"
  if (order.status === "paid" && order.fulfillmentStatus === "fulfilled") return "fulfilled"
  if (order.status === "paid" && order.fulfillmentStatus === "manual_pending") return "manual_pending"
  if (order.status === "paid") return "unfulfilled"
  return order.status
}

function statusBadgeVariant(status: string) {
  if (status === "fulfilled") return "success" as const
  if (["failed", "abnormal", "unfulfilled"].includes(status)) return "destructive" as const
  if (["pending", "paid", "manual_pending"].includes(status)) return "warning" as const
  return "secondary" as const
}

function displayOrderNumber(value: string) {
  return value.startsWith("family-grant-") ? "family-grant" : value
}

function renderMobileOrder(order: AdminOrder) {
  const status = orderStatus(order)
  return <OrderMobileItem amount={formatMoney(order.totalAmount ?? order.amount)} createdAt={order.createdAt} customer={order.email || "-"} customerUrl={order.userId ? `/users/detail/${order.userId}` : undefined} detailUrl={`/orders/${order.id}`} orderNumber={displayOrderNumber(order.merOrderTid)} product={`${order.planName} / ${order.optionLabel}`} status={orderStatusLabels[status] || order.statusText} statusVariant={statusBadgeVariant(status)} />
}

export function OrdersPage() {
  const [orders, setOrders] = React.useState<AdminOrder[] | null>(null)
  const [error, setError] = React.useState("")
  const [statusFilter, setStatusFilter] = useSearchParamState("status", "all")
  const [purposeFilter, setPurposeFilter] = useSearchParamState("purpose", "all")

  React.useEffect(() => {
    fetchJson<AdminOrder[]>("/api/admin/orders").then(setOrders).catch(error => setError(error.message))
  }, [])

  const filteredOrders = React.useMemo(() => (orders || []).filter(order =>
    (statusFilter === "all" || orderStatus(order) === statusFilter) &&
    (purposeFilter === "all" || order.purpose === purposeFilter)
  ), [orders, purposeFilter, statusFilter])

  const columns = React.useMemo<ColumnDef<AdminOrder>[]>(() => [
    {
      accessorKey: "createdAt",
      header: DataTableColumnHeader({ title: "创建时间" }),
      meta: { label: "创建时间" },
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
    {
      accessorKey: "merOrderTid",
      header: DataTableColumnHeader({ title: "订单号" }),
      meta: { label: "订单号" },
      cell: ({ row }) => <span className="font-mono text-xs">{displayOrderNumber(row.original.merOrderTid)}</span>,
    },
    {
      id: "customer",
      accessorFn: order => `${order.email || ""} ${order.merOrderTid} ${order.planName} ${order.optionLabel}`,
      header: DataTableColumnHeader({ title: "客户" }),
      meta: { label: "客户" },
      cell: ({ row }) => row.original.userId ? <Button asChild variant="link" size="sm"><Link to={`/users/detail/${row.original.userId}`}>{row.original.email || "-"}</Link></Button> : row.original.email || "-",
    },
    {
      id: "product",
      accessorFn: order => `${order.planName} ${order.optionLabel}`,
      header: DataTableColumnHeader({ title: "商品" }),
      meta: { label: "商品" },
      cell: ({ row }) => `${row.original.planName} / ${row.original.optionLabel}`,
    },
    {
      id: "type",
      accessorFn: orderType,
      header: DataTableColumnHeader({ title: "账单种类" }),
      meta: { label: "账单种类" },
      cell: ({ row }) => <Badge variant={orderTypeVariants[orderType(row.original)]}>{orderTypeLabels[orderType(row.original)]}</Badge>,
    },
    {
      accessorKey: "totalAmount",
      header: DataTableColumnHeader({ title: "金额" }),
      meta: { label: "金额" },
      cell: ({ row }) => formatMoney(row.original.totalAmount ?? row.original.amount),
    },
    {
      id: "status",
      accessorFn: orderStatus,
      header: DataTableColumnHeader({ title: "状态" }),
      meta: { label: "状态" },
      cell: ({ row }) => {
        const status = orderStatus(row.original)
        return <Badge variant={statusBadgeVariant(status)}>{orderStatusLabels[status] || row.original.statusText}</Badge>
      },
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => <DataTableRowActions detail={<Button asChild variant="ghost" size="icon"><Link to={`/orders/${row.original.id}`} aria-label="查看订单详情"><Eye /></Link></Button>} />,
      enableHiding: false,
      enableSorting: false,
    },
  ], [])

  if (error) return <div className="px-4 lg:px-6"><EmptyState title="订单加载失败" description={error} /></div>
  if (!orders) return <main className="grid min-h-72 place-items-center"><Loader2 className="animate-spin" /></main>

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <PageHeader title="Orders" description="显示所有客户创建的订单，包括待付款、取消、失败、未发放和已完成订单。" />
      <DataTableCard filters={<>
        <Field><FieldLabel htmlFor="order-status-filter">订单状态</FieldLabel><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger id="order-status-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem>{Object.entries(orderStatusLabels).map(([status, label]) => <SelectItem key={status} value={status}>{label}</SelectItem>)}</SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="order-purpose-filter">订单类型</FieldLabel><Select value={purposeFilter} onValueChange={setPurposeFilter}><SelectTrigger id="order-purpose-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部类型</SelectItem><SelectItem value="plan">套餐购买</SelectItem><SelectItem value="traffic_pack">流量包购买</SelectItem><SelectItem value="addon">附加服务</SelectItem><SelectItem value="recharge">余额充值</SelectItem></SelectContent></Select></Field>
      </>}>
        <DataTable columns={columns} data={filteredOrders} searchKey="customer" searchPlaceholder="搜索邮箱、订单号或套餐..." emptyTitle="暂无订单" pageSize={30} frame="card" renderMobileItem={renderMobileOrder} stateKey="orders" />
      </DataTableCard>
    </div>
  )
}

export function OrderDetailPage() {
  const { id } = useParams()
  const [order, setOrder] = React.useState<AdminOrder | null>(null)
  const [error, setError] = React.useState("")
  const [retryError, setRetryError] = React.useState("")
  const [retryOpen, setRetryOpen] = React.useState(false)
  const [retrying, setRetrying] = React.useState(false)
  const [reverseOpen, setReverseOpen] = React.useState(false)
  const [reversing, setReversing] = React.useState(false)
  const [deliveryNote, setDeliveryNote] = React.useState("")
  const [delivering, setDelivering] = React.useState(false)

  React.useEffect(() => {
    if (!id) return
    fetchJson<AdminOrder>(`/api/admin/orders/${encodeURIComponent(id)}`).then(setOrder).catch(error => setError(error.message))
  }, [id])

  if (error) return <div className="px-4 lg:px-6"><EmptyState title="订单加载失败" description={error} /></div>
  if (!order) return <main className="grid min-h-72 place-items-center"><Loader2 className="animate-spin" /></main>
  const status = orderStatus(order)
  const failure = order.internalFulfillmentError || order.paymentError

  async function retryFulfillment() {
    if (!id || retrying) return
    setRetrying(true)
    setRetryError("")
    try {
      setOrder(await postJson<AdminOrder>(`/api/admin/orders/${encodeURIComponent(id)}`))
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "重新发放失败")
    } finally {
      setRetrying(false)
    }
  }

  async function reverseOrder() {
    if (!id || reversing) return
    setReversing(true)
    setRetryError("")
    try {
      setOrder(await postJson<AdminOrder>(`/api/admin/orders/${encodeURIComponent(id)}/reverse`))
      setReverseOpen(false)
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "撤销订单失败")
    } finally {
      setReversing(false)
    }
  }

  async function completeDelivery() {
    if (!id || !deliveryNote.trim()) return
    setDelivering(true)
    try {
      setOrder(await putJson<AdminOrder>(`/api/admin/orders/${encodeURIComponent(id)}`, { deliveryNote }))
      setDeliveryNote("")
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "提交交付记录失败")
    } finally {
      setDelivering(false)
    }
  }

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <PageHeader title="订单详情" description={order.merOrderTid} actions={<>
        {order.reversible ? <>
          <Button variant="destructive" size="sm" disabled={reversing || retrying} onClick={() => setReverseOpen(true)}><Undo2 />{reversing ? "正在撤销" : "撤销订单"}</Button>
          <AlertDialog open={reverseOpen} onOpenChange={setReverseOpen}>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>确认撤销此订单？</AlertDialogTitle><AlertDialogDescription>系统会撤销该订单产生的套餐变更、钱包与 VIP 流水、账单、邀请返利和优惠券占用。第三方实付款不会自动退回，仍需按实际情况人工退款。此操作不能在后台恢复。</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel disabled={reversing}>取消</AlertDialogCancel><Button variant="destructive" asChild><AlertDialogAction disabled={reversing} onClick={() => void reverseOrder()}>确认撤销</AlertDialogAction></Button></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </> : null}
        {status === "unfulfilled" ? <>
          <Button variant="destructive" size="sm" disabled={retrying} onClick={() => setRetryOpen(true)}>{retrying ? <Loader2 className="animate-spin" /> : null}{retrying ? "正在发放" : "重新发放"}</Button>
          <AlertDialog open={retryOpen} onOpenChange={setRetryOpen}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>确认重新发放套餐？</AlertDialogTitle><AlertDialogDescription>系统会按原订单重新执行套餐发放。已经结算的钱包和 VIP 流水不会重复记账。</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => void retryFulfillment()}>确认发放</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
          </AlertDialog>
        </> : null}
        <BackButton fallback="/orders" size="sm" />
      </>} />
      {retryError ? <Alert variant="error"><AlertCircle /><AlertTitle>重新发放失败</AlertTitle><AlertDescription>{retryError}</AlertDescription></Alert> : null}
      {failure ? <Alert variant="error"><AlertCircle /><AlertTitle>{status === "unfulfilled" ? "已付款但套餐未发放" : "订单处理异常"}</AlertTitle><AlertDescription>{failure}</AlertDescription></Alert> : null}
      <Alert><AlertCircle /><AlertTitle>金额分类</AlertTitle><AlertDescription>realCash 是用户实际支付、充值或获得的返利；virtualCash 是后台赠送余额，不代表用户现金支出。下方钱包明细仍按赠送、返利、充值分别记录。</AlertDescription></Alert>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>订单信息</CardTitle></CardHeader>
          <CardContent><Table><TableBody>
            <DetailRow label="客户" value={order.email || "-"} />
            <DetailRow label="账单种类" value={<Badge variant={orderTypeVariants[orderType(order)]}>{orderTypeLabels[orderType(order)]}</Badge>} />
            <DetailRow label="订单状态" value={<Badge variant={statusBadgeVariant(status)}>{orderStatusLabels[status] || order.statusText}</Badge>} />
            <DetailRow label="发放状态" value={order.fulfillmentStatus === "fulfilled" ? "已全部交付" : order.fulfillmentStatus === "manual_pending" ? "基础套餐已发放，附加服务待人工交付" : order.fulfillmentStatus === "failed" ? "发放失败" : order.fulfillmentStatus === "reversed" ? "已撤销" : "尚未发放"} />
            <DetailRow label="创建时间" value={formatDateTime(order.createdAt)} />
            <DetailRow label="支付时间" value={order.paidAt ? formatDateTime(order.paidAt) : "尚未支付"} />
            {order.reversedAt ? <DetailRow label="撤销时间" value={formatDateTime(order.reversedAt)} /> : null}
            <DetailRow label="套餐周期" value={durationLabels[order.duration || ""] || order.optionLabel} />
            {order.trafficGb ? <DetailRow label="流量规格" value={`第 ${order.trafficTier || 1} 档 · 每月 ${order.trafficGb} GB`} /> : null}
            {order.trafficTierMarkupPercent && (order.trafficTier || 1) > 1 ? <DetailRow label="流量加价规则" value={`每档加收周期原价 ${order.trafficTierMarkupPercent}%`} /> : null}
            {order.fulfillmentStartedAt ? <DetailRow label="开始交付" value={formatDateTime(order.fulfillmentStartedAt)} /> : null}
            {order.fulfilledAt ? <DetailRow label="完成交付" value={formatDateTime(order.fulfilledAt)} /> : null}
            {order.deliveryNote ? <DetailRow label="交付说明" value={order.deliveryNote} /> : null}
          </TableBody></Table></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>支付详情</CardTitle></CardHeader>
          <CardContent><Table><TableBody>
            <DetailRow label="商品" value={`${order.planName} · ${order.optionLabel}`} />
            <DetailRow label="支付渠道" value={paymentChannelLabels[order.channelCode || ""] || order.channelCode || "未知"} />
            <DetailRow label="套餐第 1 档原价" value={formatMoney(order.baseAmount ?? order.originalAmount ?? order.totalAmount ?? order.amount)} />
            {(order.originalAmount || 0) > (order.baseAmount || order.originalAmount || 0) ? <DetailRow label="流量定制加价" value={`+${formatMoney((order.originalAmount || 0) - (order.baseAmount || 0))}`} /> : null}
            <DetailRow label="定制后商品原价" value={formatMoney(order.originalAmount ?? order.totalAmount ?? order.amount)} />
            <DetailRow label="优惠金额" value={`-${formatMoney((order.discountAmount || 0) + (order.vipDiscountAmount || 0))}${order.couponCode ? `（优惠码：${order.couponCode}）` : ""}`} />
            <DetailRow label="优惠后小计" value={formatMoney(order.subtotal ?? order.totalAmount ?? order.amount)} />
            <DetailRow label="税费" value={formatMoney(order.taxAmount || 0)} />
            {order.addOnAmount ? <DetailRow label="附加服务合计" value={`+${formatMoney(order.addOnAmount)}`} /> : null}
            {order.walletGiftAmount ? <DetailRow label="赠送余额支付" value={formatMoney(order.walletGiftAmount)} /> : null}
            {order.walletReferralAmount ? <DetailRow label="返利余额支付" value={formatMoney(order.walletReferralAmount)} /> : null}
            {order.walletCashAmount ? <DetailRow label="充值余额支付" value={formatMoney(order.walletCashAmount)} /> : null}
            <DetailRow label="第三方实付" value={formatMoney(order.amount)} />
            <DetailRow label="realCash（实际现金）" value={formatMoney(order.realCashAmount ?? ((order.amount || 0) + (order.walletCashAmount || 0) + (order.walletReferralAmount || 0)))} />
            <DetailRow label="virtualCash（后台赠送）" value={formatMoney(order.virtualCashAmount ?? order.walletGiftAmount ?? 0)} />
            <DetailRow label="订单支付合计" value={<strong>{formatMoney(order.totalAmount ?? order.amount)}</strong>} />
          </TableBody></Table></CardContent>
        </Card>
      </div>
      {order.addOnSnapshots?.length ? <Card><CardHeader><CardTitle>附加服务快照</CardTitle></CardHeader><CardContent><Table><TableBody>{order.addOnSnapshots.map(addOn => <React.Fragment key={addOn.optionId}><DetailRow label="服务" value={`${addOn.name}${addOn.regionName ? ` · ${addOn.regionName}` : ""}`} /><DetailRow label="成交价格" value={formatMoney(addOn.amount)} />{addOn.durationDays ? <DetailRow label="服务期限" value={`${addOn.durationDays} 天`} /> : null}<DetailRow label="交付方式" value={addOn.deliveryMode === "manual" ? "人工交付" : "自动交付"} />{addOn.deliveryDescription ? <DetailRow label="交付约定" value={addOn.deliveryDescription} /> : null}</React.Fragment>)}</TableBody></Table>{order.fulfillmentStatus === "manual_pending" ? <section className="grid gap-3 pt-4"><Textarea aria-label="交付说明" value={deliveryNote} onChange={event => setDeliveryNote(event.target.value)} placeholder="填写已交付的账号、地区、有效期、联系记录或其他必要说明" rows={5} /><Button onClick={() => void completeDelivery()} disabled={delivering || !deliveryNote.trim()}>{delivering ? <Loader2 className="animate-spin" /> : null}标记人工服务已交付</Button></section> : null}</CardContent></Card> : null}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <TableRow><TableCell className="text-muted-foreground">{label}</TableCell><TableCell className="text-right whitespace-normal">{value}</TableCell></TableRow>
}
