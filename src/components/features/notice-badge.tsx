import type { LucideIcon } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"

import { Badge } from "@/components/arc/badge/badge"

// One status color per variant, from the Arc foundation tokens (light and dark).
const noticeBadgeColors = {
  info: "var(--info)",
  warning: "var(--warning)",
  success: "var(--success)",
  error: "var(--danger)",
}

type NoticeBadgeProps = {
  icon: LucideIcon
  label: ReactNode
  variant?: keyof typeof noticeBadgeColors
  /** sm for dense desktop spots, md (default) for general hints, lg for standalone notices; heights and text step up on phones (see .notice-badge in styles.css). */
  size?: "sm" | "md" | "lg"
}

// A borderless pill on a solid tint of the variant color, with text and icon in that color. Arc's badge module outranks
// utility classes and recolors on hover, so the colors are set inline: its variables, plus background, which also keeps the
// hover from changing it. Size, spacing and vertical centering come from .notice-badge in styles.css.
export function NoticeBadge({ icon: Icon, label, variant = "info", size = "md" }: NoticeBadgeProps) {
  const color = noticeBadgeColors[variant]
  const background = `color-mix(in oklab, ${color} 14%, var(--surface))`
  const style = { "--badge-color": color, "--badge-foreground": color, "--badge-background": background, "--badge-border": "transparent", background } as CSSProperties
  return (
    <Badge className="notice-badge" data-variant={variant} data-size={size} style={style}>
      <Icon aria-hidden="true" />
      <span className="notice-badge-label">{label}</span>
    </Badge>
  )
}
