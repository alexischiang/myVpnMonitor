import * as React from "react"
import { Check, CheckCircle, CircleX, Copy, ExternalLink, Info, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { User, UserAlertSetting } from "@/types"
import { copyText, formatBytes, statusLabels, userStatus } from "@/utils"

export function PageHeader({ actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null
}

export function UserAlert({ item }: { item: UserAlertSetting }) {
  const Icon = item.variant === "success" ? CheckCircle : item.variant === "warning" ? TriangleAlert : item.variant === "error" ? CircleX : Info
  return <Alert variant={item.variant}><Icon /><div className="col-start-2 grid min-w-0 gap-1 text-left">{item.title ? <AlertTitle className="col-start-1 w-full line-clamp-none wrap-anywhere text-left font-bold">{item.title}</AlertTitle> : null}{item.message ? <AlertDescription className="col-start-1 w-full !text-current text-left">{item.message}</AlertDescription> : null}</div></Alert>
}

export function StatusBadge({ status, children, className = "", style }: { status?: string; children?: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const variant = status === "ok" ? "success" : status === "expired" || status === "invalid" || status === "error" || status === "depleted" ? "destructive" : status === "warning" || status === "expiring" ? "warning" : "secondary"
  return <Badge variant={variant} className={`rounded-sm text-[10px] font-semibold ${className}`} style={style}>{children ?? (statusLabels[status || "unknown"] || status || "未知")}</Badge>
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

// feedback="inline" 时复制结果直接显示在按钮上（带动画），不弹出 Toast
export function CopyButton({ value, label = "复制", variant = "ghost", size = "sm", className, feedback = "toast" }: { value?: string; label?: string; variant?: React.ComponentProps<typeof Button>["variant"]; size?: React.ComponentProps<typeof Button>["size"]; className?: string; feedback?: "toast" | "inline" }) {
  const [result, setResult] = React.useState<"copied" | "failed" | null>(null)
  const resetTimer = React.useRef<number>()

  React.useEffect(() => () => window.clearTimeout(resetTimer.current), [])

  function showResult(next: "copied" | "failed") {
    setResult(next)
    window.clearTimeout(resetTimer.current)
    resetTimer.current = window.setTimeout(() => setResult(null), 2000)
  }

  async function copy() {
    try {
      await copyText(value || "")
      if (feedback === "inline") showResult("copied")
      else toast.success("已复制")
    } catch {
      if (feedback === "inline") showResult("failed")
      else toast.error("复制失败，请长按内容手动复制")
    }
  }

  const Icon = result === "copied" ? Check : result === "failed" ? CircleX : Copy
  return (
    <Button
      type="button"
      variant={result === "copied" ? "success" : result === "failed" ? "destructive" : variant}
      size={size}
      className={className}
      onClick={() => void copy()}
      disabled={!value}
    >
      <Icon key={result || "idle"} className={result ? "motion-safe:animate-[copy-success_180ms_ease-out]" : undefined} />
      <span aria-live="polite">{result === "copied" ? "已复制" : result === "failed" ? "复制失败，请长按链接复制" : label}</span>
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
