import { Link } from "react-router-dom"

import type { BillingRecord } from "@/types"
import { billTypeLabels, formatDate, formatMoney, orderPlanName, orderProductLabel } from "@/utils"
import { Badge } from "@/components/arc/badge/badge"
import { Card } from "@/components/arc/card/card"
import { SimpleTable } from "@/components/features/simple-table"

function recordProductName(record: BillingRecord) {
  const planName = orderPlanName(record.productSnapshot)
  return planName !== "-" ? planName : orderProductLabel(record) || "-"
}

// Every paid order of the user (plans, add-ons, traffic packs, recharges) plus bills without an order.
export function UserBillsCard({ records }: { records?: BillingRecord[] }) {
  return (
    <Card className="gap-0 overflow-hidden py-0" title="账单记录"><SimpleTable caption="账单列表" columns={["账单", "商品名称", "类型", "订单金额", "现金支付", "日期", "备注"]} rows={records || []} rowKey={(record) => record.id} cells={(record) => [
      record.paymentOrderId && record.merOrderTid ? <Link className="max-w-48 truncate font-medium underline-offset-4 hover:underline" to={`/orders/${record.paymentOrderId}`}>{record.merOrderTid}</Link> : <span className="max-w-48 truncate font-medium">{record.merOrderTid || "-"}</span>,
      <span className="max-w-48 truncate">{recordProductName(record)}</span>,
      <span className="flex flex-wrap gap-1"><Badge>{billTypeLabels[record.type] || "账单"}</Badge>{record.reversedAt ? <Badge tone="neutral">已撤销</Badge> : null}</span>,
      <span className={record.reversedAt ? "font-medium text-muted-foreground line-through" : "font-medium"}>{formatMoney(record.amount)}</span>,
      <span className={record.reversedAt ? "text-muted-foreground line-through" : ""}>{formatMoney(record.cashAmount)}</span>,
      <span className="text-muted-foreground">{formatDate(record.occurredAt)}</span>,
      <span className="max-w-64 truncate text-muted-foreground">{record.walletAmount > 0 ? `余额抵扣 ${formatMoney(record.walletAmount)}` : record.description || "-"}</span>,
    ]} emptyMessage={records ? "暂无账单" : "加载中..."} /></Card>
  )
}
