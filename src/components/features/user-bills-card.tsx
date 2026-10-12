import type { Bill } from "@/types"
import { billTypeLabels, formatDate, formatMoney, purchasedPlanName } from "@/utils"
import { Badge } from "@/components/arc/badge/badge"
import { Card } from "@/components/arc/card/card"
import { SimpleTable } from "@/components/features/simple-table"

export function UserBillsCard({ bills }: { bills: Bill[] }) {
  return (
    <Card className="gap-0 overflow-hidden py-0" title="账单记录"><SimpleTable caption="账单列表" columns={["账单", "商品名称", "类型", "金额", "日期", "备注"]} rows={bills} rowKey={(bill) => {
const productName = bill.productSnapshot ? purchasedPlanName({ currentProductSnapshot: bill.productSnapshot }) : "-"
return bill.id }} cells={(bill) => {
const productName = bill.productSnapshot ? purchasedPlanName({ currentProductSnapshot: bill.productSnapshot }) : "-"
return [<span className="max-w-48 truncate font-medium">{bill.merOrderTid || "-"}</span>, <span className="max-w-48 truncate">{productName}</span>, <Badge>{billTypeLabels[bill.type || ""] || "账单"}</Badge>, <span className="font-medium">{formatMoney(bill.amount)}</span>, <span className="text-muted-foreground">{formatDate(bill.occurredAt)}</span>, <span className="max-w-64 truncate text-muted-foreground">{bill.description || "-"}</span>] }} emptyMessage="暂无账单" /></Card>
  )
}
