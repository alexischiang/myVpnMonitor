import { StatusBadge } from "@/components/features/shared"

const vipTiers = {
  vip1: { label: "VIP 1", start: "#64748b", end: "#334155" },
  vip2: { label: "VIP 2", start: "#2563eb", end: "#0ea5e9" },
  vip3: { label: "VIP 3", start: "#7c3aed", end: "#db2777" },
} as const

// VIP tier rules as published by the server (VIP_TIERS), ordered from the lowest tier.
export type VipTier = { level: string; minSpend: number; discountPercent: number }

export function vipLevelLabel(level?: string) {
  return level ? level.replace(/^vip\s*/i, "VIP ") : "-"
}

export function nextVipTier(tiers: VipTier[], spend: number) {
  return tiers.find(tier => spend < tier.minSpend) || null
}

export function VipBadge({ level = "vip1" }: { level?: string }) {
  const tier = vipTiers[level.toLowerCase() as keyof typeof vipTiers] || vipTiers.vip1
  return (
    <StatusBadge status="ok" className="relative isolate text-white dark:text-white" style={{ backgroundImage: `linear-gradient(135deg, ${tier.start}, ${tier.end})` }}>
      <span aria-hidden className="vip-badge-shine absolute inset-0" />
      <span className="relative">{tier.label}</span>
    </StatusBadge>
  )
}
