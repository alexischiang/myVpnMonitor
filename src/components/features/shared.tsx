import * as React from "react"
import { Copy, ExternalLink } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { copyText, formatBytes, statusLabels } from "@/utils"

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="grid gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatusBadge({ status }: { status?: string }) {
  const variant = status === "ok" ? "default" : status === "expired" || status === "invalid" || status === "error" || status === "depleted" ? "destructive" : "secondary"
  return <Badge variant={variant} className={status === "ok" ? "bg-emerald-600 text-[10px] text-white" : "text-[10px]"}>{statusLabels[status || "unknown"] || status || "未知"}</Badge>
}

export function EmptyState({ title = "暂无数据", description }: { title?: string; description?: string }) {
  return (
    <div className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg text-center">
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}

export function CopyButton({ value, label = "复制", variant = "ghost" }: { value?: string; label?: string; variant?: React.ComponentProps<typeof Button>["variant"] }) {
  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      onClick={async () => {
        await copyText(value || "")
        toast.success("已复制")
      }}
      disabled={!value}
    >
      <Copy />
      {label}
    </Button>
  )
}

export function UrlCell({ value }: { value?: string }) {
  return (
    <div className="flex max-w-96 items-center gap-2">
      <code className="truncate rounded bg-muted px-1.5 py-0.5 text-xs">{value || "-"}</code>
      {value && <CopyButton value={value} label="" />}
    </div>
  )
}

export function TrafficProgress({ remaining, total }: { remaining?: number; total?: number }) {
  if (!total) return <span>未知</span>
  const pct = Math.max(0, Math.min(100, Math.round(((remaining || 0) / total) * 100)))
  return (
    <div className="grid min-w-32 gap-1">
      <Progress value={pct} />
      <p className="text-xs text-muted-foreground">{formatBytes(remaining)} / {formatBytes(total)}</p>
    </div>
  )
}

export function ExternalLinkButton({ href, children }: { href?: string; children: React.ReactNode }) {
  if (!href) return null
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} target="_blank" rel="noreferrer">
        <ExternalLink />
        {children}
      </a>
    </Button>
  )
}
