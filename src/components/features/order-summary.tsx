import { formatMoney } from "@/utils"
import type { PaymentOrder } from "./cashier-types"

function AmountRow({ label, amount }: { label: string; amount: number }) {
  return <p className="flex justify-between gap-4"><span>{label}</span><span className="tabular-nums">{formatMoney(amount)}</span></p>
}

function SummarySection({ title, children, separated }: { title: string; children: React.ReactNode; separated: boolean }) {
  return <div className={`grid gap-3${separated ? " border-t border-border pt-4" : ""}`}><p className="text-muted-foreground">{title}</p><div className="grid gap-2 text-foreground">{children}</div></div>
}

export function OrderSummary({ order }: { order: PaymentOrder }) {
  const sections = [
    { title: "订单号", content: <p className="break-all font-mono">{order.merOrderTid}</p> },
    { title: "商品明细", content: <><p className="font-medium">{order.optionLabel.startsWith(order.planName) ? order.optionLabel : `${order.planName} · ${order.optionLabel}`}</p>{order.trafficGb ? <p>流量规格 {order.trafficGb} GB</p> : null}</> },
    { title: "金额明细", content: <><AmountRow label="商品原价" amount={order.originalAmount ?? order.totalAmount ?? order.amount} />{order.addOnAmount ? <AmountRow label="附加服务" amount={order.addOnAmount} /> : null}{order.discountAmount ? <AmountRow label="优惠码抵扣" amount={-order.discountAmount} /> : null}{order.vipDiscountAmount ? <AmountRow label="VIP 折扣" amount={-order.vipDiscountAmount} /> : null}{order.taxAmount ? <AmountRow label="税费" amount={order.taxAmount} /> : null}<AmountRow label="订单总额" amount={order.totalAmount ?? order.amount} />{order.walletAmount ? <AmountRow label="账户余额抵扣" amount={-order.walletAmount} /> : null}{(order.addOnSnapshots || []).map(item => <p key={item.optionId}>{item.name} {item.regionName} · {formatMoney(item.amount)}</p>)}</> },
  ]
  return <section aria-label="订单摘要" className="grid gap-4 rounded-lg bg-muted/50 p-4 text-sm">
    {sections.map((section, index) => <SummarySection key={section.title} title={section.title} separated={index > 0}>{section.content}</SummarySection>)}
  </section>
}
