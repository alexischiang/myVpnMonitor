import * as React from "react"
import { Activity, Loader2, RefreshCw, Server, Settings2 } from "lucide-react"
import { toast } from "sonner"

import { fetchJson, putJson } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { formatBytes, formatDateTime } from "@/utils"

type MonitorData = {
  configured: boolean
  latency?: number
  checkedAt?: string
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
    multiplier: number
    trafficTokenRequired: boolean
    trafficConfigured: boolean
    trafficError: string
  }>
  inbounds: Array<{
    id: string
    name: string
    protocol: string
    port: number | null
    enabled: boolean
    clients: number
    uploadBytes: number
    downloadBytes: number
    totalBytes: number
    expiryTime: number
    uptime: {
      availability: number | null
      incidents: number
      downtimeMs: number
      lastCheckedAt: number | null
      lastOk: boolean | null
      buckets: Array<{ from: number; status: "up" | "down" | "unknown"; checks: number; failedAt: number | null; error: string }>
    }
  }>
  billingUsers: Array<{
    id: string
    name: string
    email: string
    rawUsedBytes: number
    usedBytes: number
    totalBytes: number
    remainingBytes: number | null
    usagePercent: number | null
    depleted: boolean
    nodes: Array<{ guid: string; name: string; multiplier: number; rawBytes: number; weightedBytes: number }>
  }>
}

function uptimeLabel(seconds: number) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor(seconds % 86400 / 3600)
  return days ? `${days} 天 ${hours} 小时` : `${hours} 小时`
}

function durationLabel(milliseconds: number) {
  const minutes = Math.round(milliseconds / 60000)
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分` : `${minutes} 分钟`
}

function UptimeStrip({ uptime }: { uptime: MonitorData["inbounds"][number]["uptime"] }) {
  return <div className="grid min-w-64 gap-2">
    <div className="flex items-center justify-between gap-3 text-xs"><span>最近 24 小时</span><span className="font-medium tabular-nums">{uptime.availability === null ? "暂无数据" : `${uptime.availability}%`}</span></div>
    <TooltipProvider><div className="flex gap-1">{uptime.buckets.map(bucket => <Tooltip key={bucket.from}>
      <TooltipTrigger asChild><span role="img" tabIndex={0} aria-label={`${formatDateTime(bucket.from)} ${bucket.status === "up" ? "正常" : bucket.status === "down" ? "断连" : "未检测"}`} className={`h-7 min-w-1 flex-1 rounded-sm ${bucket.status === "up" ? "bg-green-500" : bucket.status === "down" ? "bg-destructive" : "bg-muted"}`} /></TooltipTrigger>
      <TooltipContent>{formatDateTime(bucket.failedAt || bucket.from)}：{bucket.status === "up" ? `${bucket.checks} 次正常` : bucket.status === "down" ? `检测失败${bucket.error ? `，${bucket.error}` : ""}` : "未检测"}</TooltipContent>
    </Tooltip>)}</div></TooltipProvider>
    <p className="text-xs text-muted-foreground">{uptime.incidents ? `${uptime.incidents} 次断连，约 ${durationLabel(uptime.downtimeMs)}` : uptime.lastCheckedAt ? "未发现断连" : "等待首次检测"}</p>
  </div>
}

export function XuiMonitorPage() {
  const [data, setData] = React.useState<MonitorData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [multipliers, setMultipliers] = React.useState<Record<string, string>>({})
  const [nodeTokens, setNodeTokens] = React.useState<Record<string, string>>({})
  const [savingGuid, setSavingGuid] = React.useState("")
  const [settingsGuid, setSettingsGuid] = React.useState("")

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchJson<MonitorData>("/api/xui-monitor")
      setData(result)
      setMultipliers(current => Object.fromEntries(result.nodes.map(node => [node.guid, current[node.guid] ?? String(node.multiplier)])))
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
    setMultipliers(current => ({ ...current, [node.guid]: String(node.multiplier) }))
    setNodeTokens(current => ({ ...current, [node.guid]: "" }))
    setSettingsGuid(node.guid)
  }

  async function saveNodeSettings(guid: string) {
    const multiplier = Number(multipliers[guid])
    if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > 100) {
      toast.error("流量倍率必须在 0 到 100 之间")
      return
    }
    setSavingGuid(guid)
    try {
      await putJson(`/api/xui-monitor/nodes/${encodeURIComponent(guid)}/multiplier`, { multiplier })
      const apiToken = nodeTokens[guid]?.trim()
      if (apiToken) await putJson(`/api/xui-monitor/nodes/${encodeURIComponent(guid)}/credentials`, { apiToken })
      setNodeTokens(current => ({ ...current, [guid]: "" }))
      setData(current => current ? { ...current, nodes: current.nodes.map(node => node.guid === guid ? { ...node, multiplier } : node) } : current)
      setSettingsGuid("")
      if (apiToken) await refresh()
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

      <div className="grid gap-4 px-4 md:grid-cols-2 lg:px-6 xl:grid-cols-3">
        {data.nodes.map(node => {
          const online = node.enabled && node.status.toLowerCase() === "online"
          return (
            <Card key={node.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <CardTitle className="flex items-center gap-2"><Server className="size-5" />{node.name}</CardTitle>
                    <CardDescription>{node.address}{node.port ? `:${node.port}` : ""}</CardDescription>
                  </div>
                  <div className="grid justify-items-end gap-2">
                    <Badge variant={online ? "success" : "secondary"}>{node.enabled ? node.status : "disabled"}</Badge>
                    <Button variant="outline" size="sm" onClick={() => openNodeSettings(node)}><Settings2 />节点设置</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <p className="grid gap-1 text-muted-foreground">延迟<span className="font-medium text-foreground">{node.latencyMs ? `${node.latencyMs} ms` : "-"}</span></p>
                  <p className="grid gap-1 text-muted-foreground">入站<span className="font-medium text-foreground">{node.inboundCount}</span></p>
                  <p className="grid gap-1 text-muted-foreground">客户端<span className="font-medium text-foreground">{node.onlineCount} / {node.clientCount}</span></p>
                </div>
                <div className="grid gap-2">
                  <p className="flex justify-between text-sm"><span>CPU</span><span>{node.cpu.toFixed(1)}%</span></p>
                  <Progress value={node.cpu} />
                  <p className="flex justify-between text-sm"><span>内存</span><span>{node.memory.toFixed(1)}%</span></p>
                  <Progress value={node.memory} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <p className="grid gap-1 text-muted-foreground">网络<span className="text-foreground">↑ {formatBytes(node.uploadBytes)} · ↓ {formatBytes(node.downloadBytes)}</span></p>
                  <p className="grid gap-1 text-muted-foreground">运行时间<span className="text-foreground">{uptimeLabel(node.uptime)}</span></p>
                  <p className="grid gap-1 text-muted-foreground">Panel<span className="text-foreground">{node.panelVersion || "-"}</span></p>
                  <p className="grid gap-1 text-muted-foreground">Xray<span className="text-foreground">{node.xrayVersion || "-"} · {node.xrayState}</span></p>
                </div>
                <p className="text-xs text-muted-foreground">最后心跳：{node.lastHeartbeat ? formatDateTime(node.lastHeartbeat) : "-"}</p>
                {node.trafficError ? <Alert variant="destructive"><Activity /><AlertDescription>节点流量读取失败：{node.trafficError}</AlertDescription></Alert> : null}
                {node.lastError ? <Alert variant="destructive"><Activity /><AlertDescription>{node.lastError}</AlertDescription></Alert> : null}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader><CardTitle>Inbound 状态</CardTitle><CardDescription>3x-ui 入站运行与流量状态</CardDescription></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>入站</TableHead><TableHead>状态</TableHead><TableHead>协议 / 端口</TableHead><TableHead>24 小时连通性</TableHead><TableHead>客户端</TableHead><TableHead>上传</TableHead><TableHead>下载</TableHead><TableHead>流量额度</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.inbounds.map(inbound => {
                  const used = inbound.uploadBytes + inbound.downloadBytes
                  return <TableRow key={inbound.id}><TableCell className="font-medium">{inbound.name}</TableCell><TableCell><div className="grid justify-items-start gap-1"><Badge variant={inbound.enabled ? "success" : "secondary"}>{inbound.enabled ? "启用" : "停用"}</Badge><Badge variant={inbound.recentlyActive ? "success" : "secondary"}>{inbound.recentlyActive === null ? "活跃状态未知" : inbound.recentlyActive ? "近期有流量" : "近期无流量"}</Badge></div></TableCell><TableCell>{inbound.protocol.toUpperCase()} / {inbound.port ?? "-"}</TableCell><TableCell><UptimeStrip uptime={inbound.uptime} /></TableCell><TableCell>{inbound.clients}</TableCell><TableCell>{formatBytes(inbound.uploadBytes)}</TableCell><TableCell>{formatBytes(inbound.downloadBytes)}</TableCell><TableCell>{inbound.totalBytes ? `${formatBytes(used)} / ${formatBytes(inbound.totalBytes)}` : "不限"}</TableCell></TableRow>
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader><CardTitle>用户倍率流量</CardTitle><CardDescription>按用户和节点累计；倍率修改仅影响之后产生的流量</CardDescription></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>用户</TableHead><TableHead>节点明细</TableHead><TableHead>原始流量</TableHead><TableHead>折算流量</TableHead><TableHead>套餐额度</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.billingUsers.map(user => <TableRow key={user.id}><TableCell><p className="font-medium">{user.name}</p><p className="text-xs text-muted-foreground">{user.email}</p></TableCell><TableCell><div className="grid gap-1">{user.nodes.map(node => <p key={node.guid} className="text-xs">{node.name}：{formatBytes(node.rawBytes)} × {node.multiplier} = {formatBytes(node.weightedBytes)}</p>)}</div></TableCell><TableCell>{formatBytes(user.rawUsedBytes)}</TableCell><TableCell className="font-medium">{formatBytes(user.usedBytes)}</TableCell><TableCell>{user.totalBytes ? `${formatBytes(user.usedBytes)} / ${formatBytes(user.totalBytes)}` : "不限"}</TableCell><TableCell><Badge variant={user.depleted ? "destructive" : "success"}>{user.depleted ? "已耗尽" : "正常"}</Badge></TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(settingsNode)} onOpenChange={open => { if (!open) setSettingsGuid("") }}>
        <DialogContent>
          {settingsNode ? <form className="grid gap-6" onSubmit={event => { event.preventDefault(); void saveNodeSettings(settingsNode.guid) }}>
            <DialogHeader>
              <DialogTitle>{settingsNode.name} 节点设置</DialogTitle>
              <DialogDescription>配置流量倍率和节点 API 访问凭据。</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor={`settings-multiplier-${settingsNode.id}`}>流量倍率</FieldLabel>
              <Input id={`settings-multiplier-${settingsNode.id}`} type="number" min="0" max="100" step="0.1" value={multipliers[settingsNode.guid] ?? String(settingsNode.multiplier)} onChange={event => setMultipliers(current => ({ ...current, [settingsNode.guid]: event.target.value }))} />
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
