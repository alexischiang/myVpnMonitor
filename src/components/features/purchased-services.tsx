import { Badge } from "@/components/ui/badge"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { CopyButton } from "@/components/features/shared"
import type { AddonService } from "@/types"
import { formatDateTime } from "@/utils"

const statusBadges: Record<AddonService["status"], { label: string; variant: "success" | "warning" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "等待交付", variant: "warning" },
  processing: { label: "处理中", variant: "outline" },
  active: { label: "生效中", variant: "success" },
  delivered: { label: "已交付", variant: "success" },
  expired: { label: "已过期", variant: "secondary" },
  failed: { label: "交付异常", variant: "destructive" },
  reversed: { label: "已撤销", variant: "secondary" },
}

function validity(service: AddonService) {
  if (service.status === "pending" || service.status === "processing") return service.handler === "custom_node" ? `交付后生效，有效期 ${service.durationDays * service.quantity} 天` : "等待交付"
  if (service.handler === "traffic_credit") return service.expiresAt ? `有效至 ${formatDateTime(service.expiresAt)}（月度流量重置时失效）` : "随当前流量周期"
  if (service.expiresAt) return `${formatDateTime(service.startedAt)} 至 ${formatDateTime(service.expiresAt)}`
  return service.deliveredAt ? `交付于 ${formatDateTime(service.deliveredAt)}` : ""
}

// Services bought in one order, as the customer sees them: status, validity, what they
// entered at checkout and what was delivered.
export function PurchasedServices({ services }: { services: AddonService[] }) {
  if (!services.length) return null
  return <section className="grid gap-3" aria-labelledby="purchased-services-title">
    <h2 id="purchased-services-title" className="text-sm font-medium">已购服务</h2>
    <ItemGroup className="gap-3">{services.map(service => {
      const badge = statusBadges[service.status]
      return <Item key={service.id} variant="outline" className="items-start">
        <ItemContent className="min-w-0 gap-2">
          <ItemTitle className="flex flex-wrap gap-2">{service.name}{service.regionName ? ` · ${service.regionName}` : ""}{service.quantity > 1 ? ` ×${service.quantity}` : ""}<Badge variant={badge.variant}>{badge.label}</Badge></ItemTitle>
          <ItemDescription className="line-clamp-none tabular-nums">{service.handlerLabel}{validity(service) ? ` · ${validity(service)}` : ""}</ItemDescription>
          {service.buyerInputLabel ? <ItemDescription className="line-clamp-none break-all">{service.buyerInputLabel}：{service.buyerInput}</ItemDescription> : null}
          {service.handler === "custom_node" && service.inboundIds.length ? <ItemDescription className="line-clamp-none">{service.status === "expired" ? "定制节点已到期解绑。" : `已开通 ${service.inboundIds.length} 个定制节点，会随订阅自动更新；周期性套餐过期期间暂停连接，续费后自动恢复。`}</ItemDescription> : null}
          {service.deliveryNote ? <div className="grid gap-2 rounded-md bg-muted/50 p-3">
            <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">交付内容</span><CopyButton value={service.deliveryNote} /></div>
            <p className="text-sm break-all whitespace-pre-wrap">{service.deliveryNote}</p>
          </div> : null}
        </ItemContent>
      </Item>
    })}</ItemGroup>
  </section>
}
