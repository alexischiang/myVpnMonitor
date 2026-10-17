import * as React from "react"
import { Link } from "react-router-dom"
import { LockKeyhole } from "lucide-react"

import { fetchJson } from "@/api"
import { StatusDot } from "@/components/features/shared"
import { formatDateTime } from "@/utils"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { MetricCard } from "@/components/arc/metric-card/metric-card"

type AccountNodeStatus = {
  configured: boolean
  currentGroup: string
  checkedAt: string
  totalNodes: number
  onlineNodes: number
  offlineNodes: number
  inbounds: Array<{
    id: string
    name: string
    region: string
    networkLevel: "premium" | "optimized" | "standard" | ""
    enabled: boolean
    status: "online" | "offline" | "unknown" | "disabled"
    latencyMs: number | null
    checkedAt: string
    custom: boolean
    accessible: boolean
    permissionGroups: string[]
  }>
}

export function AccountNodeStatusPage() {
  const [data, setData] = React.useState<AccountNodeStatus | null>(null)
  const [error, setError] = React.useState("")
  const [loading, setLoading] = React.useState(true)

  const refresh = React.useCallback(async (background = false) => {
    setLoading(true)
    try {
      setData(await fetchJson<AccountNodeStatus>("/api/account/node-status", { background }))
      setError("")
    } catch (error) {
      setError(error instanceof Error ? error.message : "节点状态获取失败")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(true), 120_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  if (loading && !data) return <div className="grid gap-4 px-4 lg:px-6"><Skeleton lines={4} /><Skeleton lines={6} /></div>
  if (!data) return <div className="px-4 lg:px-6"><Alert tone="danger" title={error || "节点状态暂不可用"} /></div>
  if (!data.configured) return <div className="px-4 lg:px-6"><Alert title="节点监控暂不可用，请稍后再试。" /></div>

  const lockedNodes = data.inbounds.filter(inbound => !inbound.accessible).length

  return <div className="grid gap-4 px-4 lg:px-6">
    {error ? <Alert tone="danger" title={`${error}，当前显示上次检测结果。`} /> : null}

    <div className="grid gap-4 sm:grid-cols-3">
      <MetricCard density="compact" label="可用节点" value={data.totalNodes} context={data.currentGroup ? `当前套餐 ${data.currentGroup.toUpperCase()}` : "当前套餐可用的节点"} />
      <MetricCard density="compact" label="当前在线" value={data.onlineNodes} context={data.offlineNodes ? `${data.offlineNodes} 个节点离线` : "全部节点运行正常"} />
      <MetricCard density="compact" label="待解锁" value={lockedNodes} context={lockedNodes ? "升级套餐后可使用" : "当前套餐已解锁全部节点"} action={lockedNodes ? <Button asChild variant="secondary" size="sm"><Link to="/account/plans">查看套餐</Link></Button> : undefined} />
    </div>

    <Card title="节点列表" description={`延迟为平台到节点的探测结果，与你所在网络的实际延迟可能不同。${data.checkedAt ? `最后检测：${formatDateTime(data.checkedAt)}` : ""}`}>
      {data.inbounds.length ? <ul className="grid">{data.inbounds.map(inbound => {
        const online = inbound.enabled && inbound.status === "online"
        const dotStatus = !inbound.enabled ? "maintenance" : online ? "online" : inbound.status === "offline" ? "offline" : "maintenance"
        const statusLabel = !inbound.enabled ? "维护中" : online ? "在线" : inbound.status === "offline" ? "离线" : "检测中"
        const statusTone = online ? "text-emerald-600 dark:text-emerald-400" : dotStatus === "offline" ? "text-destructive" : "text-muted-foreground"
        const requiredGroups = inbound.permissionGroups.map(group => group.toUpperCase()).join(" / ")
        // One row per node: name and access badge on the left; status, latency and the unlock action in fixed columns on the right.
        return <li key={inbound.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-3 last:border-b-0">
          <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
            <StatusDot status={dotStatus} label={statusLabel} />
            <span className="truncate text-sm font-medium" title={inbound.name}>{inbound.name}</span>
            <span className="flex-none">{inbound.custom ? <Badge>专属节点</Badge> : inbound.accessible ? <Badge>当前套餐可用</Badge> : <Badge tone="warning"><LockKeyhole />需 {requiredGroups}</Badge>}</span>
          </div>
          <div className="flex items-center gap-4 pl-5 text-sm sm:ml-auto sm:pl-0">
            <span className={`w-12 ${statusTone}`}>{statusLabel}</span>
            <span className="w-16 text-right tabular-nums text-muted-foreground">{online && inbound.latencyMs != null ? `${inbound.latencyMs} ms` : "—"}</span>
            <span className="flex justify-end empty:hidden sm:w-20 sm:empty:flex">{!inbound.accessible && inbound.enabled ? <Button asChild size="sm"><Link to="/account/plans">解锁节点</Link></Button> : null}</span>
          </div>
        </li>
      })}</ul> : <p className="text-sm text-muted-foreground">暂未配置可展示的套餐节点。</p>}
    </Card>
  </div>
}
