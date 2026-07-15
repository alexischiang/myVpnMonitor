import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { deleteJson, fetchJson, postJson } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { DataTable, DataTableColumnHeader } from "@/components/features/data-table"
import { useData } from "@/components/features/data-provider"
import { EmptyState, PageHeader } from "@/components/features/shared"
import type { Bill } from "@/types"
import { billTypeLabels, durationLabels, formatDate, formatDateTime, formatMoney } from "@/utils"

export function BillsPage() {
  const { bills, reload, runAsync } = useData()

  async function mutate(item: Bill, action: "reverse" | "delete") {
    await runAsync(async () => {
      if (action === "delete") await deleteJson(`/api/bills/${item.id}`)
      else await postJson(`/api/bills/${item.id}/reverse`, {})
      await reload(["bills", "users"])
      toast.success(action === "delete" ? "账单已删除" : "账单已冲正")
    }, "处理账单...")
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
            <Button asChild variant="ghost" size="sm"><Link to={`/bills/${item.id}`}>查看</Link></Button>
            {item.user?.accountStatus !== "active" && !item.reversedAt && (
              <Button variant="ghost" size="sm" onClick={() => mutate(item, "reverse")}>
                冲正
              </Button>
            )}
            {item.user?.accountStatus !== "active" ? <Button variant="ghost" size="sm" onClick={() => mutate(item, "delete")}>删除</Button> : null}
          </div>
        )
      },
      enableHiding: false,
      enableSorting: false,
    },
  ], [])

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <PageHeader title="账单" description="收入记录、续费记录与冲正状态。" />
      <DataTable
        columns={columns}
        data={bills}
        searchKey="user"
        searchPlaceholder="搜索账单..."
        emptyTitle="暂无账单"
      />
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
            <DetailRow label="实际付款" value={<strong>{formatMoney(payment.amount)}</strong>} />
          </TableBody></Table> : <EmptyState title="无支付订单信息" description="该账单由后台手工创建，未记录支付渠道和折扣。" />}</CardContent>
        </Card>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <TableRow><TableCell className="text-muted-foreground">{label}</TableCell><TableCell className="text-right whitespace-normal">{value}</TableCell></TableRow>
}
