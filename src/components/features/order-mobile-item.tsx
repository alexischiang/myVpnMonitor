import { Link } from "react-router-dom"
import { Eye } from "lucide-react"

import { formatDateTime } from "@/utils"
import { type BadgeTone } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { statusSurface } from "@/components/features/status-surface"

type OrderMobileItemProps = {
  amount: string
  createdAt: string
  customer?: string
  customerUrl?: string
  detailUrl: string
  orderNumber: string
  product: string
  status: string
  statusVariant?: BadgeTone
}

/**
 * One order as a phone card: what was bought and its amount as the title line, the customer and date below it, then the order
 * number beside an icon-only link to the order. The status is the border colour, and stays in the text for screen readers.
 */
export function OrderMobileItem({ amount, createdAt, customer, customerUrl, detailUrl, orderNumber, product, status, statusVariant }: OrderMobileItemProps) {
  return (
    <Card className="items-stretch py-3" style={statusSurface(statusVariant)}><div className="grid min-w-0 gap-1.5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-medium">{product}</p>
        <p className="shrink-0 text-sm font-semibold tabular-nums">{amount}</p>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
        {customer ? customerUrl
          ? <Link to={customerUrl} className="min-w-0 truncate underline-offset-2 hover:text-foreground hover:underline">{customer}</Link>
          : <p className="min-w-0 truncate">{customer}</p> : <span />}
        <p className="shrink-0 tabular-nums">{formatDateTime(createdAt)}</p>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="min-w-0 truncate font-mono text-xs text-muted-foreground">#{orderNumber}</p>
        <div className="flex shrink-0 items-center gap-2">
          <span className="sr-only">状态：{status}</span>
          <Button asChild variant="secondary" size="sm" collapse><Link to={detailUrl}><Eye />查看详情</Link></Button>
        </div>
      </div>
    </div></Card>
  )
}
