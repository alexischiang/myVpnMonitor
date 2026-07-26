import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Link, useParams } from "react-router-dom"
import { AlertCircle, ArrowLeft, Eye, Loader2 } from "lucide-react"

import { fetchJson, postJson } from "@/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { DataTableCard } from "@/components/features/data-table-card"
import { DataTable, DataTableColumnHeader, DataTableRowActions } from "@/components/features/data-table"
import { EmptyState, PageHeader } from "@/components/features/shared"
import { durationLabels, formatDateTime, formatMoney } from "@/utils"

type AdminOrder = {
  id: string
  merOrderTid: string
  purpose: "plan" | "recharge"
  purchaseAction?: "initial" | "extend" | "replace"
  planName: string
  optionLabel: string
  duration?: string
  amount: number
  totalAmount?: number
  walletAmount?: number
  walletCashAmount?: number
  walletGiftAmount?: number
  originalAmount?: number
  discountAmount?: number
  vipDiscountAmount?: number
  subtotal?: number
  taxAmount?: number
  cashCredit?: number
  channelCode?: string
  couponCode?: string
  email?: string
  status: string
  statusText: string
  fulfillmentStatus?: string
  fulfillmentError?: string
  internalFulfillmentError?: string
  paymentError?: string
  deliveryUrl?: string
  createdAt: string
  paidAt?: string
}

const orderStatusLabels: Record<string, string> = {
  pending: "待付款",
  closed: "已取消",
  failed: "支付失败",
  abnormal: "支付异常",
  unfulfilled: "已付款未发放套餐",
  fulfilled: "已完成",
}

const paymentChannelLabels: Record<string, string> = { "100": "支付宝", "200": "微信支付", wallet: "账户余额", "cash-credit": "现金价值全额抵扣" }

const orderTypeLabels: Record<string, string> = {
  initial: "新购",
  extend: "续费",
  replace: "升级 / 变更",
  recharge: "余额充值",
}

const orderTypeVariants = {
  initial: "success",
  extend: "default",
  replace: "warning",
  recharge: "secondary",
} as const

function orderType(order: AdminOrder) {
  return order.purpose === "recharge" ? "recharge" : order.purchaseAction || "initial"
}

function orderStatus(order: AdminOrder) {
  if (order.status === "paid" && order.fulfillmentStatus === "fulfilled") return "fulfilled"
  if (order.status === "paid") return "unfulfilled"
  return order.status
}

function statusBadgeVariant(status: string) {
  if (status === "fulfilled") return "success" as const
  if (["failed", "abnormal", "unfulfilled"].includes(status)) return "destructive" as const
  if (["pending", "paid"].includes(status)) return "warning" as const
  return "secondary" as const
}

export function OrdersPage() {
  const [orders, setOrders] = React.useState<AdminOrder[] | null>(null)
  const [error, setError] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [purposeFilter, setPurposeFilter] = React.useState("all")

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
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.merOrderTid}</span>,
    },
    {
      id: "customer",
      accessorFn: order => `${order.email || ""} ${order.merOrderTid} ${order.planName} ${order.optionLabel}`,
      header: DataTableColumnHeader({ title: "客户" }),
      meta: { label: "客户" },
      cell: ({ row }) => row.original.email || "-",
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
        <Field><FieldLabel htmlFor="order-purpose-filter">订单类型</FieldLabel><Select value={purposeFilter} onValueChange={setPurposeFilter}><SelectTrigger id="order-purpose-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部类型</SelectItem><SelectItem value="plan">套餐购买</SelectItem><SelectItem value="recharge">余额充值</SelectItem></SelectContent></Select></Field>
      </>}>
        <DataTable columns={columns} data={filteredOrders} searchKey="customer" searchPlaceholder="搜索邮箱、订单号或套餐..." emptyTitle="暂无订单" pageSize={10} frame="card" />
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

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <PageHeader title="订单详情" description={order.merOrderTid} actions={<>
        {status === "unfulfilled" ? <>
          <Button variant="destructive" size="sm" disabled={retrying} onClick={() => setRetryOpen(true)}>{retrying ? <Loader2 className="animate-spin" /> : null}{retrying ? "正在发放" : "重新发放"}</Button>
          <AlertDialog open={retryOpen} onOpenChange={setRetryOpen}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>确认重新发放套餐？</AlertDialogTitle><AlertDialogDescription>系统会按原订单重新执行套餐发放。已经结算的钱包和 VIP 流水不会重复记账。</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => void retryFulfillment()}>确认发放</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
          </AlertDialog>
        </> : null}
        <Button asChild variant="outline" size="sm"><Link to="/orders"><ArrowLeft />返回订单</Link></Button>
      </>} />
      {retryError ? <Alert variant="error"><AlertCircle /><AlertTitle>重新发放失败</AlertTitle><AlertDescription>{retryError}</AlertDescription></Alert> : null}
      {failure ? <Alert variant="error"><AlertCircle /><AlertTitle>{status === "unfulfilled" ? "已付款但套餐未发放" : "订单处理异常"}</AlertTitle><AlertDescription>{failure}</AlertDescription></Alert> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>订单信息</CardTitle></CardHeader>
          <CardContent><Table><TableBody>
            <DetailRow label="客户" value={order.email || "-"} />
            <DetailRow label="账单种类" value={<Badge variant={orderTypeVariants[orderType(order)]}>{orderTypeLabels[orderType(order)]}</Badge>} />
            <DetailRow label="订单状态" value={<Badge variant={statusBadgeVariant(status)}>{orderStatusLabels[status] || order.statusText}</Badge>} />
            <DetailRow label="发放状态" value={order.fulfillmentStatus === "fulfilled" ? "已发放" : order.fulfillmentStatus === "failed" ? "发放失败" : "尚未发放"} />
            <DetailRow label="创建时间" value={formatDateTime(order.createdAt)} />
            <DetailRow label="支付时间" value={order.paidAt ? formatDateTime(order.paidAt) : "尚未支付"} />
            <DetailRow label="套餐周期" value={durationLabels[order.duration || ""] || order.optionLabel} />
          </TableBody></Table></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>支付详情</CardTitle></CardHeader>
          <CardContent><Table><TableBody>
            <DetailRow label="商品" value={`${order.planName} · ${order.optionLabel}`} />
            <DetailRow label="支付渠道" value={paymentChannelLabels[order.channelCode || ""] || order.channelCode || "未知"} />
            <DetailRow label="商品原价" value={formatMoney(order.originalAmount ?? order.totalAmount ?? order.amount)} />
            <DetailRow label="优惠金额" value={`-${formatMoney((order.discountAmount || 0) + (order.vipDiscountAmount || 0))}`} />
            <DetailRow label="优惠后小计" value={formatMoney(order.subtotal ?? order.totalAmount ?? order.amount)} />
            <DetailRow label="税费" value={formatMoney(order.taxAmount || 0)} />
            <DetailRow label="现金价值抵扣" value={`-${formatMoney(order.cashCredit || 0)}`} />
            {order.walletGiftAmount ? <DetailRow label="赠送余额支付" value={formatMoney(order.walletGiftAmount)} /> : null}
            {order.walletCashAmount ? <DetailRow label="充值余额支付" value={formatMoney(order.walletCashAmount)} /> : null}
            <DetailRow label="第三方实付" value={formatMoney(order.amount)} />
            <DetailRow label="订单支付合计" value={<strong>{formatMoney(order.totalAmount ?? order.amount)}</strong>} />
          </TableBody></Table></CardContent>
        </Card>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <TableRow><TableCell className="text-muted-foreground">{label}</TableCell><TableCell className="text-right whitespace-normal">{value}</TableCell></TableRow>
}
