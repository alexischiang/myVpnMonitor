import * as React from "react"
import { Link } from "react-router-dom"
import { Activity, LockKeyhole, Server } from "lucide-react"

import { fetchJson } from "@/api"
import { StatusDot } from "@/components/features/shared"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Card as ArcCard } from "@/components/arc/card/card"

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

    <Card><div className="grid gap-3 grid-cols-3">
          <ArcCard title={data.totalNodes} description="可用节点" />
          <ArcCard title={data.onlineNodes} description="当前在线" />
          <ArcCard title={lockedNodes} description="待解锁" />
        </div></Card>

    <Card title="节点列表" description="延迟为平台到节点的探测结果，与你所在网络的实际延迟可能不同。"><>
        {data.inbounds.length ? <div className="grid gap-3">{data.inbounds.map(inbound => {
          const online = inbound.enabled && inbound.status === "online"
          const dotStatus = !inbound.enabled ? "maintenance" : online ? "online" : inbound.status === "offline" ? "offline" : "maintenance"
          const statusLabel = !inbound.enabled ? "维护中" : online ? "在线" : inbound.status === "offline" ? "离线" : "检测中"
          const requiredGroups = inbound.permissionGroups.map(group => group.toUpperCase()).join(" / ")
          return <ArcCard key={inbound.id} className="flex-col items-stretch sm:flex-row sm:items-center" title={<><StatusDot status={dotStatus} label={statusLabel} />{inbound.name}{inbound.custom ? <Badge>专属节点</Badge> : inbound.accessible ? <Badge>当前套餐可用</Badge> : <Badge tone="warning"><LockKeyhole />需 {requiredGroups}</Badge>}</>} headerAction={<>{!inbound.accessible && inbound.enabled ? <div className="flex items-center gap-2 w-full sm:w-auto"><Button asChild size="sm" className="min-h-11 w-full sm:min-h-0 sm:w-auto"><Link to="/account/plans">解锁节点</Link></Button></div> : null}</>} />
        })}</div> : <p className="text-sm text-muted-foreground">暂未配置可展示的套餐节点。</p>}
      </></Card>
  </div>
}
