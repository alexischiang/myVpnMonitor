import type { ComponentProps } from "react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"

type OrderMobileItemProps = {
  amount: string
  createdAt: string
  customer?: string
  customerUrl?: string
  detailUrl: string
  orderNumber: string
  product: string
  status: string
  statusVariant?: ComponentProps<typeof Badge>["variant"]
}

const orderDateFormatter = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })
const orderTimeFormatter = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })

export function OrderMobileItem({ amount, createdAt, customer, customerUrl, detailUrl, orderNumber, product, status, statusVariant }: OrderMobileItemProps) {
  const date = new Date(createdAt)
  return (
    <Item variant="outline" size="sm" className="items-stretch py-3">
      <ItemContent className="gap-2.5">
        <header className="flex items-center justify-between gap-3">
          <ItemDescription className="min-w-0 truncate font-mono text-xs">#{orderNumber}</ItemDescription>
          <Badge variant={statusVariant}>{status}</Badge>
        </header>
        <section className="grid min-w-0 gap-1">
          {customer ? customerUrl ? <Button asChild variant="link" size="sm" className="h-auto w-fit max-w-full justify-start truncate p-0 text-xs font-normal"><Link to={customerUrl}>{customer}</Link></Button> : <ItemDescription className="text-xs text-foreground">{customer}</ItemDescription> : null}
          <ItemTitle className="w-full whitespace-normal text-xs leading-normal font-normal">{product}</ItemTitle>
          <ItemDescription className="text-xs leading-tight">{orderDateFormatter.format(date)} · {orderTimeFormatter.format(date)}</ItemDescription>
        </section>
        <Separator />
        <footer className="flex min-w-0 items-center justify-between gap-3">
          <ItemTitle className="shrink-0 text-sm font-semibold">{amount}</ItemTitle>
          <Button asChild variant="outline" size="sm" className="font-normal"><Link to={detailUrl}>查看详情</Link></Button>
        </footer>
      </ItemContent>
    </Item>
  )
}
