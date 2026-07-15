import { Badge } from "@/components/ui/badge"

const vipTiers = {
  vip1: { label: "VIP 1", start: "#64748b", end: "#334155" },
  vip2: { label: "VIP 2", start: "#2563eb", end: "#0ea5e9" },
  vip3: { label: "VIP 3", start: "#7c3aed", end: "#db2777" },
} as const

export function VipBadge({ level = "vip1" }: { level?: string }) {
  const tier = vipTiers[level.toLowerCase() as keyof typeof vipTiers] || vipTiers.vip1
  return (
    <Badge variant="outline" className="relative isolate h-5 rounded-sm py-0 text-[11px] font-semibold leading-none text-white" style={{ backgroundImage: `linear-gradient(135deg, ${tier.start}, ${tier.end})` }}>
      <span aria-hidden className="vip-badge-shine absolute inset-0" />
      <span className="relative">{tier.label}</span>
    </Badge>
  )
}
