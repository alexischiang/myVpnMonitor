import { Link } from "react-router-dom"

import { Separator } from "@/components/ui/separator"
import { Badge, type BadgeTone } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"

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

const orderDateFormatter = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })
const orderTimeFormatter = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })

export function OrderMobileItem({ amount, createdAt, customer, customerUrl, detailUrl, orderNumber, product, status, statusVariant }: OrderMobileItemProps) {
  const date = new Date(createdAt)
  return (
    <Card className="items-stretch py-3"><header className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground min-w-0 truncate font-mono text-xs">#{orderNumber}</p>
          <Badge tone={statusVariant}>{status}</Badge>
        </header><section className="grid min-w-0 gap-1">
          {customer ? customerUrl ? <Button asChild variant="link" size="sm" className="h-auto w-fit max-w-full justify-start truncate p-0 text-xs font-normal"><Link to={customerUrl}>{customer}</Link></Button> : <p className="text-sm text-muted-foreground text-xs text-foreground">{customer}</p> : null}
          <div className="text-sm font-medium w-full whitespace-normal text-xs leading-normal font-normal">{product}</div>
          <p className="text-sm text-muted-foreground text-xs leading-tight">{orderDateFormatter.format(date)} · {orderTimeFormatter.format(date)}</p>
        </section><Separator /><footer className="flex min-w-0 items-center justify-between gap-3">
          <div className="text-sm font-medium shrink-0 text-sm font-semibold">{amount}</div>
          <Button asChild variant="secondary" size="sm" className="font-normal"><Link to={detailUrl}>查看详情</Link></Button>
        </footer></Card>
  )
}
