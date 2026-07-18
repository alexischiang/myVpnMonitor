import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { deleteJson, fetchJson, postJson } from "@/api"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { DataTableCard } from "@/components/features/data-table-card"
import { DataTable, DataTableColumnHeader } from "@/components/features/data-table"
import { useData } from "@/components/features/data-provider"
import { EmptyState, PageHeader } from "@/components/features/shared"
import type { Bill } from "@/types"
import { billTypeLabels, durationLabels, formatDate, formatDateTime, formatMoney } from "@/utils"

export function BillsPage() {
  const { bills, reload, runAsync } = useData()
  const [pendingAction, setPendingAction] = React.useState<{ item: Bill; action: "reverse" | "delete" } | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const [typeFilter, setTypeFilter] = React.useState("all")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [durationFilter, setDurationFilter] = React.useState("all")
  const typeOptions = React.useMemo(() => [...new Set(bills.map(item => item.type).filter((value): value is string => Boolean(value)))].sort(), [bills])
  const durationOptions = React.useMemo(() => [...new Set(bills.map(item => item.duration).filter((value): value is string => Boolean(value)))].sort(), [bills])
  const filteredBills = React.useMemo(() => bills.filter(item =>
    (typeFilter === "all" || item.type === typeFilter) &&
    (statusFilter === "all" || (item.reversedAt ? "reversed" : "normal") === statusFilter) &&
    (durationFilter === "all" || item.duration === durationFilter)
  ), [bills, typeFilter, statusFilter, durationFilter])

  async function mutate(item: Bill, action: "reverse" | "delete") {
    await runAsync(async () => {
      if (action === "delete") await deleteJson(`/api/bills/${item.id}`)
      else await postJson(`/api/bills/${item.id}/reverse`, {})
      await reload(["bills", "users"])
      toast.success(action === "delete" ? "账单已删除" : "账单已冲正")
    }, "处理账单...")
  }

  async function confirmAction() {
    if (!pendingAction) return
    setConfirming(true)
    try {
      await mutate(pendingAction.item, pendingAction.action)
      setPendingAction(null)
    } finally {
      setConfirming(false)
    }
  }

  const columns = React.useMemo<ColumnDef<Bill>[]>(() => [
    {
      accessorKey: "occurredAt",
      header: DataTableColumnHeader({ title: "时间" }),
      meta: { label: "时间" },
      cell: ({ row }) => formatDate(row.original.occurredAt),
    },
    {
      id: "user",
      accessorFn: item => `${item.user?.userId || ""} ${item.userId || ""} ${item.description || ""}`,
      header: DataTableColumnHeader({ title: "用户" }),
      meta: { label: "用户" },
      cell: ({ row }) => row.original.user?.userId || row.original.userId || "-",
    },
    {
      accessorKey: "type",
      header: DataTableColumnHeader({ title: "类型" }),
      meta: { label: "类型" },
      cell: ({ row }) => billTypeLabels[row.original.type || ""] || row.original.type || "-",
    },
    {
      accessorKey: "duration",
      header: DataTableColumnHeader({ title: "周期" }),
      meta: { label: "周期" },
      cell: ({ row }) => row.original.duration || "-",
    },
    {
      accessorKey: "amount",
      header: DataTableColumnHeader({ title: "金额" }),
      meta: { label: "金额" },
      cell: ({ row }) => formatMoney(row.original.amount),
    },
    {
      accessorKey: "description",
      header: "备注",
      meta: { label: "备注" },
      cell: ({ row }) => row.original.reversedAt ? "已冲正" : row.original.description || "-",
      enableSorting: false,
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => {
        const item = row.original
        return (
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm"><Link to={`/bills/${item.id}`}>查看</Link></Button>
            {item.user?.accountStatus !== "active" && !item.reversedAt && (
              <Button variant="outline" size="sm" className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setPendingAction({ item, action: "reverse" })}>
                撤销
              </Button>
            )}
            {item.user?.accountStatus !== "active" ? <Button variant="destructive" size="sm" onClick={() => setPendingAction({ item, action: "delete" })}>删除</Button> : null}
          </div>
        )
      },
      enableHiding: false,
      enableSorting: false,
    },
  ], [])

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <DataTableCard filters={<>
        <Field><FieldLabel htmlFor="bill-type-filter">账单类型</FieldLabel><Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger id="bill-type-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem>{typeOptions.map(type => <SelectItem key={type} value={type}>{billTypeLabels[type] || type}</SelectItem>)}</SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="bill-status-filter">账单状态</FieldLabel><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger id="bill-status-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="normal">正常</SelectItem><SelectItem value="reversed">已冲正</SelectItem></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="bill-duration-filter">计费周期</FieldLabel><Select value={durationFilter} onValueChange={setDurationFilter}><SelectTrigger id="bill-duration-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem>{durationOptions.map(duration => <SelectItem key={duration} value={duration}>{durationLabels[duration] || duration}</SelectItem>)}</SelectContent></Select></Field>
      </>}>
        <DataTable
          columns={columns}
          data={filteredBills}
          searchKey="user"
          searchPlaceholder="搜索账单..."
          emptyTitle="暂无账单"
          pageSize={10}
          frame="card"
        />
      </DataTableCard>
      <AlertDialog open={Boolean(pendingAction)} onOpenChange={open => { if (!open) setPendingAction(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认{pendingAction?.action === "delete" ? "删除" : "撤销"}账单？</AlertDialogTitle>
            <AlertDialogDescription>{pendingAction?.action === "delete" ? "删除后无法恢复。" : "撤销后将冲正该账单，并同步扣减用户消费金额。"}</AlertDialogDescription>
          </AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={confirming}>取消</AlertDialogCancel><AlertDialogAction className="bg-destructive/10 text-destructive hover:bg-destructive/20" onClick={() => void confirmAction()} disabled={confirming}>{confirming ? <Loader2 className="animate-spin" /> : null}确认{pendingAction?.action === "delete" ? "删除" : "撤销"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const purchaseTypeLabels = { initial: "新购", extend: "续费延长", replace: "覆盖" }
const paymentChannelLabels: Record<string, string> = { "100": "支付宝", "200": "微信支付", "cash-credit": "现金价值全额抵扣" }

export function BillDetailPage() {
  const { id } = useParams()
  const [bill, setBill] = React.useState<Bill | null>(null)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (!id) return
    fetchJson<Bill>(`/api/bills/${encodeURIComponent(id)}`).then(setBill).catch(error => setError(error.message))
  }, [id])

  if (error) return <div className="px-4 lg:px-6"><EmptyState title="账单加载失败" description={error} /></div>
  if (!bill) return <main className="grid min-h-72 place-items-center"><Loader2 className="animate-spin" /></main>
  const payment = bill.payment

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <PageHeader title="账单详情" description={bill.id} actions={<Button asChild variant="outline" size="sm"><Link to="/bills"><ArrowLeft />返回账单</Link></Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>账单信息</CardTitle></CardHeader>
          <CardContent><Table><TableBody>
            <DetailRow label="用户" value={bill.user?.userId || bill.userId || "-"} />
            <DetailRow label="账单时间" value={formatDateTime(bill.occurredAt)} />
            <DetailRow label="购买类型" value={payment ? <Badge variant="outline">{purchaseTypeLabels[payment.purchaseAction]}</Badge> : billTypeLabels[bill.type || ""] || bill.type || "-"} />
            <DetailRow label="计费周期" value={durationLabels[bill.duration || ""] || bill.duration || "-"} />
            <DetailRow label="状态" value={<Badge variant={bill.reversedAt ? "destructive" : "secondary"}>{bill.reversedAt ? "已冲正" : "正常"}</Badge>} />
            <DetailRow label="备注" value={bill.description || "-"} />
          </TableBody></Table></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>支付详情</CardTitle></CardHeader>
          <CardContent>{payment ? <Table><TableBody>
            <DetailRow label="商品" value={`${payment.planName} · ${payment.optionLabel}`} />
            <DetailRow label="支付渠道" value={paymentChannelLabels[payment.channelCode] || payment.channelCode || "未知"} />
            <DetailRow label="支付时间" value={formatDateTime(payment.paidAt)} />
            <DetailRow label="商品原价" value={formatMoney(payment.originalAmount)} />
            <DetailRow label={payment.couponCode ? `优惠码 ${payment.couponCode}（${payment.discountPercent}%）` : "优惠码折扣"} value={`-${formatMoney(payment.discountAmount)}`} />
            <DetailRow label={`${payment.vipLevel.replace(/^vip/i, "VIP ")} 专属折扣（${payment.vipDiscountPercent}%）`} value={`-${formatMoney(payment.vipDiscountAmount)}`} />
            <DetailRow label="优惠后小计" value={formatMoney(payment.subtotal)} />
            <DetailRow label={`税费（${payment.taxRate}%）`} value={formatMoney(payment.taxAmount)} />
            <DetailRow label="剩余现金价值抵扣" value={`-${formatMoney(payment.cashCredit)}`} />
            {payment.walletGiftAmount ? <DetailRow label="赠送余额支付" value={formatMoney(payment.walletGiftAmount)} /> : null}
            {payment.walletCashAmount ? <DetailRow label="充值余额支付" value={formatMoney(payment.walletCashAmount)} /> : null}
            <DetailRow label="第三方实付" value={formatMoney(payment.amount)} />
            <DetailRow label="订单支付合计" value={<strong>{formatMoney(payment.totalAmount ?? payment.amount)}</strong>} />
          </TableBody></Table> : <EmptyState title="无支付订单信息" description="该账单由后台手工创建，未记录支付渠道和折扣。" />}</CardContent>
        </Card>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <TableRow><TableCell className="text-muted-foreground">{label}</TableCell><TableCell className="text-right whitespace-normal">{value}</TableCell></TableRow>
}
