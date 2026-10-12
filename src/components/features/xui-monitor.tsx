import * as React from "react"
import { Activity, AlertTriangle, HelpCircle, Loader2, RefreshCw, Server, Settings2 } from "lucide-react"
import { toast } from "@/components/features/toast"

import { fetchJson, putJson } from "@/api"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { formatDateTime } from "@/utils"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Input } from "@/components/arc/input/input"
import { PasswordField } from "@/components/arc/password-field/password-field"
import { Select } from "@/components/arc/select/select"

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
    costConfig: null | { purchaseDate: string; monthlyFee: number; trafficQuotaGiB: number; trafficMode: "in_out" | "out_only" }
  }>
}

type NodeCostDraft = { purchaseDate: string; monthlyFee: string; trafficQuotaGiB: string; trafficMode: "in_out" | "out_only" }

export function XuiMonitorPage() {
  const [data, setData] = React.useState<MonitorData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [nodeTokens, setNodeTokens] = React.useState<Record<string, string>>({})
  const [nodeMultipliers, setNodeMultipliers] = React.useState<Record<string, string>>({})
  const [nodeCosts, setNodeCosts] = React.useState<Record<string, NodeCostDraft>>({})
  const [savingGuid, setSavingGuid] = React.useState("")
  const [settingsGuid, setSettingsGuid] = React.useState("")

  const refresh = React.useCallback(async (background = false) => {
    setLoading(true)
    try {
      const result = await fetchJson<MonitorData>("/api/xui-monitor", { background })
      setData(result)
      setError("")
    } catch (error) {
      setError(error instanceof Error ? error.message : "无法读取 3x-ui 状态")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const refreshIfVisible = (background = false) => { if (!document.hidden) void refresh(background) }
    const onVisibilityChange = () => { if (!document.hidden) refreshIfVisible() }
    refreshIfVisible()
    const timer = window.setInterval(() => refreshIfVisible(true), 120_000)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [refresh])

  function openNodeSettings(node: MonitorData["nodes"][number]) {
    setNodeTokens(current => ({ ...current, [node.guid]: "" }))
    setNodeMultipliers(current => ({ ...current, [node.guid]: String(node.multiplier) }))
    setNodeCosts(current => ({ ...current, [node.guid]: {
      purchaseDate: node.costConfig?.purchaseDate || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }),
      monthlyFee: node.costConfig ? String(node.costConfig.monthlyFee) : "",
      trafficQuotaGiB: node.costConfig ? String(node.costConfig.trafficQuotaGiB) : "",
      trafficMode: node.costConfig?.trafficMode || "in_out",
    } }))
    setSettingsGuid(node.guid)
  }

  async function saveNodeSettings(guid: string) {
    const node = data?.nodes.find(item => item.guid === guid)
    if (!node || !nodeSettingsChanged(node)) return
    setSavingGuid(guid)
    try {
      const apiToken = nodeTokens[guid]?.trim()
      const multiplier = Number(nodeMultipliers[guid])
      const cost = nodeCosts[guid]
      if (!nodeMultipliers[guid]?.trim() || !Number.isFinite(multiplier) || multiplier < 0 || multiplier > 100) throw new Error("节点倍率必须在 0 到 100 之间")
      const costChanged = nodeCostChanged(node)
      if (costChanged && (!cost?.purchaseDate || cost.monthlyFee === "" || !cost.trafficQuotaGiB)) throw new Error("请填写 VPS 购买日期、月费和流量额度")
      const multiplierChanged = multiplier !== node.multiplier
      let configured = node.trafficConfigured
      if (apiToken) {
        const credentials = await putJson<{ configured?: boolean }>(`/api/xui-monitor/nodes/${encodeURIComponent(guid)}/credentials`, { apiToken })
        configured = credentials.configured ?? true
      }
      let savedMultiplier = node.multiplier
      let savedCost = node.costConfig
      if (multiplierChanged) {
        const result = await putJson<{ multiplier: number }>(`/api/xui-monitor/nodes/${encodeURIComponent(guid)}/settings`, { multiplier })
        savedMultiplier = result.multiplier
      }
      if (costChanged && cost) {
        const result = await putJson<{ costConfig: MonitorData["nodes"][number]["costConfig"] }>(`/api/sales-traffic/nodes/${encodeURIComponent(guid)}/cost`, { costConfig: { ...cost, monthlyFee: Number(cost.monthlyFee), trafficQuotaGiB: Number(cost.trafficQuotaGiB) } })
        savedCost = result.costConfig
      }
      setNodeTokens(current => ({ ...current, [guid]: "" }))
      setSettingsGuid("")
      setData(current => current ? { ...current, nodes: current.nodes.map(item => item.guid === guid ? { ...item, multiplier: savedMultiplier, costConfig: savedCost, trafficConfigured: configured, trafficError: configured ? "" : item.trafficError } : item) } : current)
      toast({ type: "success", title: "节点设置已保存" })
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "保存失败" })
    } finally {
      setSavingGuid("")
    }
  }

  function nodeSettingsChanged(node: MonitorData["nodes"][number]) {
    const guid = node.guid
    const multiplier = Number(nodeMultipliers[guid] ?? String(node.multiplier))
    if (multiplier !== node.multiplier) return true
    if (nodeTokens[guid]?.trim()) return true
    return nodeCostChanged(node)
  }

  function nodeCostChanged(node: MonitorData["nodes"][number]) {
    const draft = nodeCosts[node.guid]
    if (!draft) return false
    const original = node.costConfig
    if (!original) return Boolean(draft.monthlyFee || draft.trafficQuotaGiB)
    return draft.purchaseDate !== original.purchaseDate
      || Number(draft.monthlyFee) !== Number(original.monthlyFee)
      || Number(draft.trafficQuotaGiB) !== Number(original.trafficQuotaGiB)
      || draft.trafficMode !== original.trafficMode
  }

  if (loading && !data) return <div className="grid gap-4 px-4 lg:px-6"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map(item => <Skeleton lines={4} key={item} />)}</div><Skeleton lines={6} /></div>

  if (!data?.configured) return <div className="px-4 lg:px-6"><Alert title="尚未配置 3x-ui。请在服务端设置 XUI_BASE_URL 和 XUI_API_TOKEN。" /></div>

  const settingsNode = data.nodes.find(node => node.guid === settingsGuid)
  const missingTokenNodes = data.nodes.filter(node => node.trafficTokenRequired && !node.trafficConfigured)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
        <p className="text-sm text-muted-foreground">每 2 分钟自动更新 · {data.checkedAt ? formatDateTime(data.checkedAt) : "尚未更新"} · {data.latency ?? "-"} ms</p>
        <ActionButton variant="secondary" size="sm" onClick={() => void refresh()} label="刷新" pending={loading} />
      </div>

      {error ? <div className="px-4 lg:px-6"><Alert tone="danger" title={error} /></div> : null}

      {missingTokenNodes.length ? <div className="px-4 lg:px-6"><Alert tone="warning" title={`${missingTokenNodes.length} 个节点尚未设置 API Token`}>{missingTokenNodes.map(node => node.name).join("、")}。请进入对应节点设置完成配置，否则无法统计该节点流量。</Alert></div> : null}

      <div className="px-4 lg:px-6">
        <Card description="当前在线客户端" title={data.onlineUsers ?? "-"}><p className="text-sm text-muted-foreground">{data.nodes.map(node => `${node.name} ${node.onlineCount}`).join(" · ") || "暂无节点"}</p></Card>
      </div>

      <div className="grid gap-4 px-4 lg:px-6">
        {data.nodes.map(node => {
          const online = node.enabled && node.status.toLowerCase() === "online"
          return (
            <Card key={node.id}><div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <h3 className="text-lg font-medium flex flex-wrap items-center gap-2"><Server className="size-5" />{node.name}<Badge tone={online ? "success" : "neutral"}>{node.enabled ? node.status : "disabled"}</Badge>{node.trafficTokenRequired && !node.trafficConfigured ? <Badge tone="danger">未设置 API</Badge> : null}{!node.costConfig ? <Badge tone="warning">未设置成本</Badge> : null}<Badge>× {node.multiplier}</Badge></h3>
                    <p className="text-sm text-muted-foreground">{node.address}{node.port ? `:${node.port}` : ""}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => openNodeSettings(node)}><Settings2 />节点设置</Button>
                  </div>
                </div><div className="grid gap-4">
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <p className="grid gap-1 text-muted-foreground">延迟<span className="font-medium text-foreground">{node.latencyMs ? `${node.latencyMs} ms` : "-"}</span></p>
                  <p className="grid gap-1 text-muted-foreground">入站<span className="font-medium text-foreground">{node.inboundCount}</span></p>
                  <p className="grid gap-1 text-muted-foreground">客户端<span className="font-medium text-foreground">{node.clientCount}</span></p>
                  <p className="grid gap-1 text-muted-foreground">当前使用<span className="font-medium text-foreground">{node.onlineCount}</span></p>
                </div>
                <p className="text-xs text-muted-foreground">最后心跳：{node.lastHeartbeat ? formatDateTime(node.lastHeartbeat) : "-"}</p>
                {node.trafficError ? <Alert tone="danger" title={`节点流量读取失败：${node.trafficError}`} /> : null}
                {node.lastError ? <Alert tone="danger" title={node.lastError} /> : null}
              </div></Card>
          )
        })}
      </div>

      <Dialog open={Boolean(settingsNode)} onOpenChange={open => { if (!open) setSettingsGuid("") }}>
        <DialogContent title={`${settingsNode?.name ?? ""} 节点设置`} description="配置整个面板的流量倍率；该面板中的所有端口和协议统一按此倍率计费。">
          {settingsNode ? <form className="grid gap-6" onSubmit={event => { event.preventDefault(); void saveNodeSettings(settingsNode.guid) }}>
            <Input label="流量倍率" description="保存后，该节点所有入站新增流量统一按此倍率计算。" id={`settings-multiplier-${settingsNode.id}`} type="number" min="0" max="100" step="0.1" value={nodeMultipliers[settingsNode.guid] ?? "1"} onChange={event => setNodeMultipliers(current => ({ ...current, [settingsNode.guid]: event.target.value }))} />
            <section className="grid gap-4 border-t pt-4">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">VPS 月度成本</h3>
                <Tooltip content="用户扣量始终按 in + out；VPS 成本计量根据此节点设置使用 in + out 或仅 out。"><button type="button" className="text-muted-foreground" aria-label="说明用户扣量与 VPS 成本计量"><HelpCircle className="size-4" /></button></Tooltip>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="购买日期" id={`cost-date-${settingsNode.id}`} type="date" value={nodeCosts[settingsNode.guid]?.purchaseDate || ""} onChange={event => setNodeCosts(current => ({ ...current, [settingsNode.guid]: { ...current[settingsNode.guid], purchaseDate: event.target.value } }))} />
                <Input label="月费（¥）" id={`cost-fee-${settingsNode.id}`} type="number" min="0" step="0.01" value={nodeCosts[settingsNode.guid]?.monthlyFee || ""} onChange={event => setNodeCosts(current => ({ ...current, [settingsNode.guid]: { ...current[settingsNode.guid], monthlyFee: event.target.value } }))} />
                <Input label="流量额度（GiB）" id={`cost-quota-${settingsNode.id}`} type="number" min="0.01" step="0.01" value={nodeCosts[settingsNode.guid]?.trafficQuotaGiB || ""} onChange={event => setNodeCosts(current => ({ ...current, [settingsNode.guid]: { ...current[settingsNode.guid], trafficQuotaGiB: event.target.value } }))} />
                <Select label="VPS 流量计算方式" value={nodeCosts[settingsNode.guid]?.trafficMode || "in_out"} onValueChange={(trafficMode: "in_out" | "out_only") => setNodeCosts(current => ({ ...current, [settingsNode.guid]: { ...current[settingsNode.guid], trafficMode } }))} id={`cost-mode-${settingsNode.id}`} options={[{ value: "in_out", label: "in + out" }, { value: "out_only", label: "out only" }]} />
              </div>
              <FieldDescription>购买日期是月度计费周期起点，精确到日；费用、额度或计量方式变化时，按实际变更日期保存。</FieldDescription>
            </section>
            <Field>
              <FieldLabel htmlFor={`settings-token-${settingsNode.id}`}>节点 API Token <Badge tone={settingsNode.trafficConfigured ? "success" : "neutral"}>{settingsNode.trafficConfigured ? "已配置" : "未配置"}</Badge></FieldLabel>
              <PasswordField label={settingsNode.trafficConfigured ? "留空保持现有 Token" : "输入该节点的 API Token"} hideLabel id={`settings-token-${settingsNode.id}`} autoComplete="new-password" placeholder={settingsNode.trafficConfigured ? "留空保持现有 Token" : "输入该节点的 API Token"} value={nodeTokens[settingsNode.guid] ?? ""} onChange={event => setNodeTokens(current => ({ ...current, [settingsNode.guid]: event.target.value }))} />
            </Field>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setSettingsGuid("")} disabled={savingGuid === settingsNode.guid}>取消</Button>
              <ActionButton type="submit" disabled={savingGuid === settingsNode.guid || !nodeSettingsChanged(settingsNode)} label="保存设置" pending={savingGuid === settingsNode.guid} />
            </div>
          </form> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
