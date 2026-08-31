import * as React from "react"
import { Activity, AlertTriangle, Loader2, RefreshCw, Server, Settings2 } from "lucide-react"
import { toast } from "sonner"

import { fetchJson, putJson } from "@/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime } from "@/utils"

type MonitorData = {
  configured: boolean
  latency?: number
  checkedAt?: string
  onlineUsers: number | null
  system: null | {
    cpu: number
    cpuCores: number
    memoryUsed: number
    memoryTotal: number
    diskUsed: number
    diskTotal: number
    uptime: number
    xrayState: string
    xrayVersion: string
    sentBytes: number
    receivedBytes: number
  }
  nodes: Array<{
    id: string
    guid: string
    name: string
    address: string
    port: number | null
    enabled: boolean
    recentlyActive: boolean | null
    status: string
    lastHeartbeat: string
    latencyMs: number
    cpu: number
    memory: number
    uptime: number
    uploadBytes: number
    downloadBytes: number
    xrayState: string
    xrayVersion: string
    panelVersion: string
    inboundCount: number
    clientCount: number
    onlineCount: number
    lastError: string
    trafficTokenRequired: boolean
    trafficConfigured: boolean
    trafficError: string
    multiplier: number
  }>
}

export function XuiMonitorPage() {
  const [data, setData] = React.useState<MonitorData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [nodeTokens, setNodeTokens] = React.useState<Record<string, string>>({})
  const [nodeMultipliers, setNodeMultipliers] = React.useState<Record<string, string>>({})
  const [savingGuid, setSavingGuid] = React.useState("")
  const [settingsGuid, setSettingsGuid] = React.useState("")

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchJson<MonitorData>("/api/xui-monitor")
      setData(result)
      setError("")
    } catch (error) {
      setError(error instanceof Error ? error.message : "无法读取 3x-ui 状态")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
    const timer = window.setInterval(refresh, 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  function openNodeSettings(node: MonitorData["nodes"][number]) {
    setNodeTokens(current => ({ ...current, [node.guid]: "" }))
    setNodeMultipliers(current => ({ ...current, [node.guid]: String(node.multiplier) }))
    setSettingsGuid(node.guid)
  }

  async function saveNodeSettings(guid: string) {
    setSavingGuid(guid)
    try {
      const apiToken = nodeTokens[guid]?.trim()
      const multiplier = Number(nodeMultipliers[guid])
      if (!nodeMultipliers[guid]?.trim() || !Number.isFinite(multiplier) || multiplier < 0 || multiplier > 100) throw new Error("节点倍率必须在 0 到 100 之间")
      await putJson(`/api/xui-monitor/nodes/${encodeURIComponent(guid)}/settings`, { apiToken, multiplier })
      setNodeTokens(current => ({ ...current, [guid]: "" }))
      setSettingsGuid("")
      await refresh()
      toast.success("节点设置已保存")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    } finally {
      setSavingGuid("")
    }
  }

  if (loading && !data) return <div className="grid gap-4 px-4 lg:px-6"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-36" />)}</div><Skeleton className="h-80" /></div>

  if (!data?.configured) return <div className="px-4 lg:px-6"><Alert><Server /><AlertDescription>尚未配置 3x-ui。请在服务端设置 XUI_BASE_URL 和 XUI_API_TOKEN。</AlertDescription></Alert></div>

  const settingsNode = data.nodes.find(node => node.guid === settingsGuid)
  const missingTokenNodes = data.nodes.filter(node => node.trafficTokenRequired && !node.trafficConfigured)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
        <p className="text-sm text-muted-foreground">每 30 秒自动更新 · {data.checkedAt ? formatDateTime(data.checkedAt) : "尚未更新"} · {data.latency ?? "-"} ms</p>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          刷新
        </Button>
      </div>

      {error ? <div className="px-4 lg:px-6"><Alert variant="destructive"><Activity /><AlertDescription>{error}</AlertDescription></Alert></div> : null}

      {missingTokenNodes.length ? <div className="px-4 lg:px-6"><Alert variant="warning"><AlertTriangle /><AlertTitle>{missingTokenNodes.length} 个节点尚未设置 API Token</AlertTitle><AlertDescription>{missingTokenNodes.map(node => node.name).join("、")}。请进入对应节点设置完成配置，否则无法统计该节点流量。</AlertDescription></Alert></div> : null}

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardDescription>当前在线客户端</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{data.onlineUsers ?? "-"}</CardTitle>
            <CardDescription>{data.nodes.map(node => `${node.name} ${node.onlineCount}`).join(" · ") || "暂无节点"}</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 px-4 lg:px-6">
        {data.nodes.map(node => {
          const online = node.enabled && node.status.toLowerCase() === "online"
          return (
            <Card key={node.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <CardTitle className="flex flex-wrap items-center gap-2"><Server className="size-5" />{node.name}<Badge variant={online ? "success" : "secondary"}>{node.enabled ? node.status : "disabled"}</Badge>{node.trafficTokenRequired && !node.trafficConfigured ? <Badge variant="destructive">未设置 API</Badge> : null}<Badge variant="outline">× {node.multiplier}</Badge></CardTitle>
                    <CardDescription>{node.address}{node.port ? `:${node.port}` : ""}</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openNodeSettings(node)}><Settings2 />节点设置</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <p className="grid gap-1 text-muted-foreground">延迟<span className="font-medium text-foreground">{node.latencyMs ? `${node.latencyMs} ms` : "-"}</span></p>
                  <p className="grid gap-1 text-muted-foreground">入站<span className="font-medium text-foreground">{node.inboundCount}</span></p>
                  <p className="grid gap-1 text-muted-foreground">客户端<span className="font-medium text-foreground">{node.clientCount}</span></p>
                  <p className="grid gap-1 text-muted-foreground">当前使用<span className="font-medium text-foreground">{node.onlineCount}</span></p>
                </div>
                <p className="text-xs text-muted-foreground">最后心跳：{node.lastHeartbeat ? formatDateTime(node.lastHeartbeat) : "-"}</p>
                {node.trafficError ? <Alert variant="destructive"><Activity /><AlertDescription>节点流量读取失败：{node.trafficError}</AlertDescription></Alert> : null}
                {node.lastError ? <Alert variant="destructive"><Activity /><AlertDescription>{node.lastError}</AlertDescription></Alert> : null}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={Boolean(settingsNode)} onOpenChange={open => { if (!open) setSettingsGuid("") }}>
        <DialogContent>
          {settingsNode ? <form className="grid gap-6" onSubmit={event => { event.preventDefault(); void saveNodeSettings(settingsNode.guid) }}>
            <DialogHeader>
              <DialogTitle>{settingsNode.name} 节点设置</DialogTitle>
              <DialogDescription>配置整个面板的流量倍率；该面板中的所有端口和协议统一按此倍率计费。</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor={`settings-multiplier-${settingsNode.id}`}>流量倍率</FieldLabel>
              <Input id={`settings-multiplier-${settingsNode.id}`} type="number" min="0" max="100" step="0.1" value={nodeMultipliers[settingsNode.guid] ?? "1"} onChange={event => setNodeMultipliers(current => ({ ...current, [settingsNode.guid]: event.target.value }))} />
              <FieldDescription>保存后，该节点所有入站新增流量统一按此倍率计算。</FieldDescription>
            </Field>
            {settingsNode.trafficTokenRequired ? <Field>
              <FieldLabel htmlFor={`settings-token-${settingsNode.id}`}>节点 API Token <Badge variant={settingsNode.trafficConfigured ? "success" : "secondary"}>{settingsNode.trafficConfigured ? "已配置" : "未配置"}</Badge></FieldLabel>
              <Input id={`settings-token-${settingsNode.id}`} type="password" autoComplete="new-password" placeholder={settingsNode.trafficConfigured ? "留空保持现有 Token" : "输入该节点的 API Token"} value={nodeTokens[settingsNode.guid] ?? ""} onChange={event => setNodeTokens(current => ({ ...current, [settingsNode.guid]: event.target.value }))} />
            </Field> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSettingsGuid("")} disabled={savingGuid === settingsNode.guid}>取消</Button>
              <Button type="submit" disabled={savingGuid === settingsNode.guid}>{savingGuid === settingsNode.guid ? <Loader2 className="animate-spin" /> : null}保存设置</Button>
            </DialogFooter>
          </form> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
