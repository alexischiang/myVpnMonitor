import type * as React from "react"

import type { BadgeTone } from "@/components/arc/badge/badge"

// The colours the status badges use; neutral statuses keep the plain card.
const toneColor: Partial<Record<BadgeTone, string>> = { success: "var(--success)", info: "var(--accent)", warning: "var(--warning)", danger: "var(--danger)" }

/**
 * Card style that shows a status as the border and a light wash in its badge colour, for phone cards that drop the status badge.
 * Keep the status text in the card for screen readers: colour alone does not name it.
 */
export function statusSurface(tone?: BadgeTone): React.CSSProperties | undefined {
  const color = tone ? toneColor[tone] : undefined
  if (!color) return undefined
  return { borderColor: `color-mix(in oklab, ${color} 80%, var(--border))`, "--card-surface": `color-mix(in oklab, ${color} 7%, var(--surface))` } as React.CSSProperties
}
