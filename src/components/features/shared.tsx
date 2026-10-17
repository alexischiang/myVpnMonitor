import * as React from "react"
import { ExternalLink } from "lucide-react"

import { Progress } from "@/components/arc/progress/progress"
import type { User, UserAlertSetting } from "@/types"
import { formatBytes, statusLabels, userStatus } from "@/utils"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { CopyButton } from "@/components/arc/copy-button/copy-button"

// A compact label/value list for detail sidebars: labels on the left, values right-aligned and truncated, numbers in tabular widths.
export function InfoList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
    {items.map(item => <React.Fragment key={item.label}><dt className="text-muted-foreground">{item.label}</dt><dd className="min-w-0 truncate text-right font-medium tabular-nums">{item.value}</dd></React.Fragment>)}
  </dl>
}

export function PageHeader({ actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null
}

export function UserAlert({ item }: { item: UserAlertSetting }) {
  const tone = item.variant === "error" ? "danger" : item.variant === "default" ? "info" : item.variant
  return <Alert tone={tone} title={item.title || "提示"}>{item.message || null}</Alert>
}

export function StatusBadge({ status, children, className = "", style }: { status?: string; children?: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const tone = status === "ok" ? "success" : status === "expired" || status === "invalid" || status === "error" || status === "depleted" ? "danger" : status === "warning" || status === "expiring" ? "warning" : "neutral"
  return <Badge tone={tone} className={`rounded-sm text-[10px] font-semibold ${className}`} style={style}>{children ?? (statusLabels[status || "unknown"] || status || "未知")}</Badge>
}

export function UserStatusBadge({ user }: { user?: User | null }) {
  const status = userStatus(user)
  return <StatusBadge status={status}>{status === "registered" ? "未购买" : status === "ok" ? "Active" : status === "warning" ? "Expiring" : "Expired"}</StatusBadge>
}

export function StatusDot({ status, label }: { status: "online" | "offline" | "maintenance"; label?: string }) {
  const color = status === "online" ? "bg-green-500" : status === "offline" ? "bg-red-500" : "bg-gray-400"
  const text = label || (status === "online" ? "在线" : status === "offline" ? "离线" : "维护中")
  return <span className="relative flex size-2 shrink-0" role="status" aria-label={text} title={text}><span className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:animate-none ${color}`} /><span className={`relative inline-flex size-2 rounded-full ${color}`} /></span>
}

export function EmptyState({ title = "暂无数据", description }: { title?: string; description?: string }) {
  return (
    <div className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg text-center">
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}

export function UrlCell({ value }: { value?: string }) {
  return (
    <div className="flex max-w-96 items-center gap-2">
      <code className="truncate rounded bg-muted px-1.5 py-0.5 text-xs">{value || "-"}</code>
      {value && <CopyButton value={value} iconOnly variant="plain" />}
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
    <Button asChild variant="secondary" size="sm">
      <a href={href} target="_blank" rel="noreferrer">
        <ExternalLink />
        {children}
      </a>
    </Button>
  )
}
