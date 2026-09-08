import * as React from "react"
import { Link } from "react-router-dom"
import { Activity, Clock3, LockKeyhole, RefreshCw, Server } from "lucide-react"

import { fetchJson } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusDot } from "@/components/features/shared"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime } from "@/utils"

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

const networkLabels: Record<AccountNodeStatus["inbounds"][number]["networkLevel"], string> = { premium: "精品", optimized: "优化", standard: "标准", "": "" }

export function AccountNodeStatusPage() {
  const [data, setData] = React.useState<AccountNodeStatus | null>(null)
  const [error, setError] = React.useState("")
  const [loading, setLoading] = React.useState(true)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchJson<AccountNodeStatus>("/api/account/node-status"))
      setError("")
    } catch (error) {
      setError(error instanceof Error ? error.message : "节点状态获取失败")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
    const timer = window.setInterval(refresh, 120_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  if (loading && !data) return <div className="grid gap-4 px-4 lg:px-6"><Skeleton className="h-32" /><Skeleton className="h-80" /></div>
  if (!data) return <div className="px-4 lg:px-6"><Alert variant="destructive"><Activity /><AlertDescription>{error || "节点状态暂不可用"}</AlertDescription></Alert></div>
  if (!data.configured) return <div className="px-4 lg:px-6"><Alert><Server /><AlertDescription>节点监控暂不可用，请稍后再试。</AlertDescription></Alert></div>

  const lockedNodes = data.inbounds.filter(inbound => !inbound.accessible).length

  return <div className="grid gap-4 px-4 lg:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" />平台探测，每两分钟更新 · {data.checkedAt ? formatDateTime(data.checkedAt) : "等待首次检测"}</p>
      <Button variant="outline" size="sm" className="min-h-11 sm:min-h-0" onClick={() => void refresh()} disabled={loading}>{loading ? <RefreshCw className="animate-spin" /> : <RefreshCw />}刷新状态</Button>
    </div>

    {error ? <Alert variant="destructive"><Activity /><AlertDescription>{error}，当前显示上次检测结果。</AlertDescription></Alert> : null}

    <Card>
      <CardContent className="pt-6">
        <ItemGroup className="grid-cols-3">
          <Item variant="muted" size="sm"><ItemContent><ItemDescription className="text-xs">可用节点</ItemDescription><ItemTitle className="text-xl tabular-nums">{data.totalNodes}</ItemTitle></ItemContent></Item>
          <Item variant="muted" size="sm"><ItemContent><ItemDescription className="text-xs">当前在线</ItemDescription><ItemTitle className="text-xl tabular-nums">{data.onlineNodes}</ItemTitle></ItemContent></Item>
          <Item variant="muted" size="sm"><ItemContent><ItemDescription className="text-xs">待解锁</ItemDescription><ItemTitle className="text-xl tabular-nums">{lockedNodes}</ItemTitle></ItemContent></Item>
        </ItemGroup>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>节点列表</CardTitle>
        <CardDescription>延迟为平台到节点的探测结果，与你所在网络的实际延迟可能不同。</CardDescription>
      </CardHeader>
      <CardContent>
        {data.inbounds.length ? <ItemGroup>{data.inbounds.map(inbound => {
          const online = inbound.enabled && inbound.status === "online"
          const dotStatus = !inbound.enabled ? "maintenance" : online ? "online" : inbound.status === "offline" ? "offline" : "maintenance"
          const statusLabel = !inbound.enabled ? "维护中" : online ? "在线" : inbound.status === "offline" ? "离线" : "检测中"
          const requiredGroups = inbound.permissionGroups.map(group => group.toUpperCase()).join(" / ")
          return <Item key={inbound.id} variant="outline" className="flex-col items-stretch sm:flex-row sm:items-center">
            <ItemContent>
              <ItemTitle><StatusDot status={dotStatus} label={statusLabel} /><Server className="size-4 text-muted-foreground" />{inbound.name}<Badge variant={online ? "success" : !inbound.enabled ? "secondary" : inbound.status === "offline" ? "destructive" : "warning"}>{statusLabel}</Badge>{inbound.custom ? <Badge variant="outline">专属节点</Badge> : inbound.accessible ? <Badge variant="outline">当前套餐可用</Badge> : <Badge variant="warning"><LockKeyhole />需 {requiredGroups}</Badge>}</ItemTitle>
              <ItemDescription className="line-clamp-none">{[inbound.region, networkLabels[inbound.networkLevel]].filter(Boolean).join(" · ") || "套餐节点"} · 平台延迟 <span className="tabular-nums">{online && inbound.latencyMs !== null ? `${inbound.latencyMs} ms` : "-"}</span>{inbound.checkedAt ? ` · ${formatDateTime(inbound.checkedAt)}` : ""}</ItemDescription>
            </ItemContent>
            {!inbound.accessible && inbound.enabled ? <ItemActions className="w-full sm:w-auto"><Button asChild size="sm" className="min-h-11 w-full sm:min-h-0 sm:w-auto"><Link to="/account/plans">解锁节点</Link></Button></ItemActions> : null}
          </Item>
        })}</ItemGroup> : <p className="text-sm text-muted-foreground">暂未配置可展示的套餐节点。</p>}
      </CardContent>
    </Card>
  </div>
}
