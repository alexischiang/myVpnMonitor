import type { LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const noticeBadgeStyles = {
  info: "bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300",
  warning: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
  success: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  error: "bg-red-500/10 text-red-700 dark:bg-red-400/10 dark:text-red-300",
}

type NoticeBadgeProps = {
  icon: LucideIcon
  label: string
  variant?: keyof typeof noticeBadgeStyles
}

export function NoticeBadge({ icon: Icon, label, variant = "info" }: NoticeBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn("min-h-7 rounded-full border-0 px-2.5 py-1", noticeBadgeStyles[variant])}
    >
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  )
}
