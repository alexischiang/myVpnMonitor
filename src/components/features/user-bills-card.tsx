import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Bill } from "@/types"
import { formatDate, formatMoney } from "@/utils"

export function UserBillsCard({ bills }: { bills: Bill[] }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-6">
        <CardTitle>账单记录</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-6">账单</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>金额</TableHead>
              <TableHead>日期</TableHead>
              <TableHead className="px-6">备注</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bills.length ? bills.map(bill => (
              <TableRow key={bill.id}>
                <TableCell className="max-w-48 truncate px-6 font-medium" title={bill.payment?.merOrderTid || bill.paymentOrderId || bill.id}>
                  {bill.payment?.merOrderTid || bill.paymentOrderId || bill.id}
                </TableCell>
                <TableCell><Badge variant="secondary">{bill.type || "账单"}</Badge></TableCell>
                <TableCell className="font-medium">{formatMoney(bill.amount)}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(bill.occurredAt)}</TableCell>
                <TableCell className="max-w-64 truncate px-6 text-muted-foreground" title={bill.description}>
                  {bill.description || "-"}
                </TableCell>
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">暂无账单</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
