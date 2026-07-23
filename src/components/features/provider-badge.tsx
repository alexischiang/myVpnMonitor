import * as React from "react"

import { Badge } from "@/components/ui/badge"

export function ProviderBadge({ name }: { name?: string }) {
  const label = name || "未填写供应商"
  let hash = 2166136261
  for (const character of label) hash = Math.imul(hash ^ (character.codePointAt(0) || 0), 16777619)

  return (
    <Badge
      variant="outline"
      className="border-[hsl(var(--provider-hue)_70%_45%/0.28)] bg-[hsl(var(--provider-hue)_70%_45%/0.12)] text-[hsl(var(--provider-hue)_65%_32%)] dark:text-[hsl(var(--provider-hue)_80%_72%)]"
      style={{ "--provider-hue": (hash >>> 0) % 360 } as React.CSSProperties}
    >
      {label}
    </Badge>
  )
}
