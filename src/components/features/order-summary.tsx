import { CopyButton } from "@/components/features/shared"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { formatDateTime, formatMoney } from "@/utils"
import type { PaymentOrder } from "./cashier-types"

function AmountRow({ label, amount }: { label: string; amount: number }) {
  return <p className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="tabular-nums">{formatMoney(amount)}</span></p>
}

export function OrderSummary({ order }: { order: PaymentOrder }) {
  return <section aria-label="订单摘要" className="grid gap-0 rounded-lg bg-muted/50 px-3">
    <Item size="sm"><ItemContent><ItemDescription>套餐与周期</ItemDescription><ItemTitle>{order.optionLabel || order.planName}</ItemTitle>{order.trafficGb ? <ItemDescription>流量规格 {order.trafficGb} GB</ItemDescription> : null}</ItemContent></Item>
    <Item size="sm" className="flex-col items-start gap-1 rounded-none border-0 border-t border-border sm:flex-row sm:items-center"><ItemContent><ItemDescription>订单号</ItemDescription><ItemTitle className="break-all font-mono text-sm">{order.merOrderTid}</ItemTitle></ItemContent><ItemActions><CopyButton value={order.merOrderTid} label="复制订单号" /></ItemActions></Item>
    <Accordion type="single" collapsible className="px-3"><AccordionItem value="details"><AccordionTrigger>订单金额明细</AccordionTrigger><AccordionContent className="grid gap-3">
      <AmountRow label="商品原价" amount={order.originalAmount ?? order.totalAmount ?? order.amount} />
      {order.addOnAmount ? <AmountRow label="附加服务" amount={order.addOnAmount} /> : null}
      {order.discountAmount ? <AmountRow label="优惠码抵扣" amount={-order.discountAmount} /> : null}
      {order.vipDiscountAmount ? <AmountRow label="VIP 折扣" amount={-order.vipDiscountAmount} /> : null}
      {order.taxAmount ? <AmountRow label="税费" amount={order.taxAmount} /> : null}
      <AmountRow label="订单总额" amount={order.totalAmount ?? order.amount} />
      {order.walletAmount ? <AmountRow label="账户余额抵扣" amount={-order.walletAmount} /> : null}
      <p className="text-xs text-muted-foreground">提交时间 {formatDateTime(order.createdAt)}</p>
      {(order.addOnSnapshots || []).map(item => <p key={item.optionId} className="text-muted-foreground">{item.name} {item.regionName} · {formatMoney(item.amount)}</p>)}
    </AccordionContent></AccordionItem></Accordion>
  </section>
}
