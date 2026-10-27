import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useSearchParams } from "react-router-dom"
import { Gauge, KeyRound, Pencil, Plus, Power, PowerOff, RefreshCw, Save, Terminal, Trash2, Undo2, Users as UsersIcon } from "lucide-react"

import { deleteJson, fetchJson, postJson, putJson } from "@/api"
import { DataTable, DataTableColumnHeader, DataTableRowActions } from "@/components/features/arc-data-table"
import { DataTableCard } from "@/components/features/data-table-card"
import { ConfirmDialog } from "@/components/features/confirm-dialog"
import { InfoList } from "@/components/features/shared"
import { toast } from "@/components/features/toast"
import { advancedSettingsText, applyAdvancedSettings, emptyNodeDraft, NODE_HUB_NETWORK_LEVELS, NODE_HUB_PROTOCOLS, NodeHubNodeForm, nodeDraftFrom, nodeSecurityLabel, protocolLabel, type NodeHubNodeDraft } from "@/components/features/node-hub-node-form"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { CopyButton } from "@/components/arc/copy-button/copy-button"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer"
import { Input } from "@/components/arc/input/input"
import { LineChart } from "@/components/arc/line-chart/line-chart"
import { MetricCard } from "@/components/arc/metric-card/metric-card"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Switch } from "@/components/arc/switch/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs"
import { Textarea } from "@/components/arc/textarea/textarea"
import type { NodeHubLoadStatus, NodeHubMachine, NodeHubNode, NodeHubOverview, User } from "@/types"
import { formatBytes, formatDateTime } from "@/utils"

// Admin page for node-hub: the machines (VPS running xboard-node) and nodes it serves, and the
// per-user node speed limit. Everything goes through the app's /api/node-hub/* proxy.

const TABS = ["overview", "machines", "nodes", "speed"] as const
type TabId = typeof TABS[number]
type MachineDraft = { name: string; host: string; notes: string; isActive: boolean }
const emptyMachineDraft = (): MachineDraft => ({ name: "", host: "", notes: "", isActive: true })

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function percent(used?: number, total?: number) {
  return used !== undefined && total ? Math.round(used / total * 1000) / 10 : null
}

function LoadSummary({ load }: { load: NodeHubLoadStatus | null }) {
  if (!load) return <span className="text-muted-foreground">未上报</span>
  const mem = percent(load.mem?.used, load.mem?.total)
  const disk = percent(load.disk?.used, load.disk?.total)
  return <div className="grid text-xs tabular-nums">
    <span>CPU {load.cpu === undefined ? "-" : `${load.cpu.toFixed(1)}%`}</span>
    <span className="text-muted-foreground">内存 {mem === null ? "-" : `${mem}%`} · 磁盘 {disk === null ? "-" : `${disk}%`}</span>
  </div>
}

function MachineStatus({ machine }: { machine: NodeHubMachine }) {
  if (!machine.isActive) return <Badge>已停用</Badge>
  return <div className="grid justify-items-start gap-1"><div className="flex flex-wrap gap-1"><Badge tone={machine.online ? "success" : "danger"}>{machine.online ? "在线" : machine.lastSeenAt ? "离线" : "未连接"}</Badge>{machine.online ? <Badge tone={machine.pushConnected ? "success" : "neutral"} title={machine.pushConnected ? "变更通过 WebSocket 即时送达" : "变更要等下一次轮询才送达"}>{machine.pushConnected ? "实时推送" : "轮询"}</Badge> : null}</div><span className="text-xs text-muted-foreground tabular-nums">{machine.lastSeenAt ? formatDateTime(machine.lastSeenAt) : "从未上报"}</span></div>
}

// The machine's own report says whether the proxy kernel is up; a node can be "online" (the machine pulls it) with no kernel running.
function kernelRunning(node: NodeHubNode) {
  const value = node.metrics?.kernel_status
  return typeof value === "boolean" ? value : null
}

function NodeStatus({ node }: { node: NodeHubNode }) {
  if (!node.enabled) return <Badge>已停用</Badge>
  const kernel = kernelRunning(node)
  return <div className="grid justify-items-start gap-1">
    <Badge tone={node.online ? "success" : "danger"}>{node.online ? "在线" : node.lastCheckAt ? "离线" : "未拉取"}</Badge>
    {node.online && kernel === false ? <Badge tone="warning">内核未运行</Badge> : null}
  </div>
}

function SwitchRow({ id, label, description, checked, onCheckedChange }: { id: string; label: string; description?: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return <Field orientation="horizontal" className="justify-between"><FieldContent><FieldLabel htmlFor={id}>{label}</FieldLabel>{description ? <FieldDescription>{description}</FieldDescription> : null}</FieldContent><Switch id={id} checked={checked} onCheckedChange={onCheckedChange} /></Field>
}

function InstallCommand({ command }: { command?: string }) {
  if (!command) return <Alert tone="warning" title="无法生成安装命令">node-hub 没有设置 NODE_HUB_PUBLIC_URL（xboard-node 访问 node-hub 的 HTTPS 地址），设置后重启 node-hub。</Alert>
  return <div className="grid gap-2">
    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">{command}</pre>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">在 VPS 上用 root 执行。命令里含机器 token，不要公开。</p><CopyButton value={command} label="复制安装命令" /></div>
  </div>
}

export function NodeHubPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get("tab") as TabId | null
  const tab: TabId = tabParam && TABS.includes(tabParam) ? tabParam : "overview"
  const [data, setData] = React.useState<NodeHubOverview | null>(null)
  const [notConfigured, setNotConfigured] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [syncing, setSyncing] = React.useState(false)

  // Machines
  const [machineCreateOpen, setMachineCreateOpen] = React.useState(false)
  const [machineDraft, setMachineDraft] = React.useState<MachineDraft>(emptyMachineDraft)
  const [machineSaving, setMachineSaving] = React.useState(false)
  const [installFor, setInstallFor] = React.useState<NodeHubMachine | null>(null)
  const [machineDetail, setMachineDetail] = React.useState<NodeHubMachine | null>(null)
  const [machineDetailLoading, setMachineDetailLoading] = React.useState(false)
  const [confirmResetToken, setConfirmResetToken] = React.useState(false)
  const [confirmDeleteMachine, setConfirmDeleteMachine] = React.useState(false)

  // Nodes
  const [nodeEditorOpen, setNodeEditorOpen] = React.useState(false)
  const [editingNode, setEditingNode] = React.useState<NodeHubNode | null>(null)
  const [nodeDraft, setNodeDraft] = React.useState<NodeHubNodeDraft>(() => emptyNodeDraft())
  const [advancedText, setAdvancedText] = React.useState("")
  const [advancedError, setAdvancedError] = React.useState("")
  const [nodeSaving, setNodeSaving] = React.useState(false)
  const [confirmDeleteNode, setConfirmDeleteNode] = React.useState<NodeHubNode | null>(null)

  // Speed limits
  const [users, setUsers] = React.useState<User[] | null>(null)
  const [usersError, setUsersError] = React.useState("")
  const [speedUser, setSpeedUser] = React.useState<User | null>(null)
  const [speedValue, setSpeedValue] = React.useState("")
  const [speedError, setSpeedError] = React.useState("")
  const [speedSaving, setSpeedSaving] = React.useState(false)

  const machineFilter = searchParams.get("machine") || "all"
  const protocolFilter = searchParams.get("protocol") || "all"
  const statusFilter = searchParams.get("status") || "all"

  function updateParam(key: string, value: string, defaultValue = "all") {
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      if (!value || value === defaultValue) next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  }

  const refresh = React.useCallback(async (background = false) => {
    if (!background) setLoading(true)
    try {
      const body = await fetchJson<NodeHubOverview | { configured: false }>("/api/node-hub/overview", { background })
      if ("configured" in body && body.configured === false) {
        setNotConfigured("本站没有设置 NODE_HUB_URL 和 NODE_HUB_INTERNAL_TOKEN。")
        setData(null)
        return
      }
      setNotConfigured("")
      setData(body as NodeHubOverview)
      setError("")
    } catch (loadError) {
      setError(errorMessage(loadError, "读取 node-hub 失败"))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const onVisibilityChange = () => { if (!document.hidden) void refresh(true) }
    void refresh()
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(true) }, 30_000)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [refresh])

  const loadUsers = React.useCallback(async () => {
    try {
      setUsers(await fetchJson<User[]>("/api/users"))
      setUsersError("")
    } catch (loadError) {
      setUsersError(errorMessage(loadError, "读取用户失败"))
    }
  }, [])

  React.useEffect(() => {
    if (tab === "speed" && users === null && !notConfigured) void loadUsers()
  }, [loadUsers, notConfigured, tab, users])

  async function syncEntitlements() {
    setSyncing(true)
    try {
      const result = await postJson<{ users: number; enabled: number; changed: number; disabled: number }>("/api/node-hub/sync")
      toast({ type: "success", title: `已同步 ${result.users} 个用户的授权`, description: `${result.enabled} 个可用，${result.changed} 个有变化，${result.disabled} 个停用` })
      void refresh(true)
    } catch (syncError) {
      toast({ type: "error", title: `同步授权失败：${errorMessage(syncError, "未知错误")}` })
    } finally {
      setSyncing(false)
    }
  }

  // --- machines ----------------------------------------------------------

  async function createMachine() {
    setMachineSaving(true)
    try {
      const machine = await postJson<NodeHubMachine>("/api/node-hub/machines", machineDraft)
      setMachineCreateOpen(false)
      setInstallFor(machine)
      toast({ type: "success", title: `机器「${machine.name}」已创建` })
      void refresh(true)
    } catch (saveError) {
      toast({ type: "error", title: errorMessage(saveError, "创建机器失败") })
    } finally {
      setMachineSaving(false)
    }
  }

  const openMachine = React.useCallback(async (machine: NodeHubMachine) => {
    setMachineDetail(machine)
    setMachineDraft({ name: machine.name, host: machine.host, notes: machine.notes, isActive: machine.isActive })
    setMachineDetailLoading(true)
    try {
      const detail = await fetchJson<NodeHubMachine>(`/api/node-hub/machines/${machine.id}`)
      setMachineDetail(current => current?.id === machine.id ? { ...machine, ...detail } : current)
    } catch (loadError) {
      toast({ type: "error", title: errorMessage(loadError, "读取机器详情失败") })
    } finally {
      setMachineDetailLoading(false)
    }
  }, [])

  async function saveMachine() {
    if (!machineDetail) return
    setMachineSaving(true)
    try {
      await putJson<NodeHubMachine>(`/api/node-hub/machines/${machineDetail.id}`, machineDraft)
      setMachineDetail(null)
      toast({ type: "success", title: "机器设置已保存" })
      void refresh(true)
    } catch (saveError) {
      toast({ type: "error", title: errorMessage(saveError, "保存机器失败") })
    } finally {
      setMachineSaving(false)
    }
  }

  // Runs from the confirm dialog; failures are reported and rethrown so the dialog stays open.
  async function resetMachineToken() {
    if (!machineDetail) return
    try {
      const machine = await postJson<NodeHubMachine>(`/api/node-hub/machines/${machineDetail.id}/reset-token`)
      setMachineDetail(current => current ? { ...current, installCommand: machine.installCommand, token: machine.token } : current)
      toast({ type: "success", title: "已重置机器 token", description: "旧 token 已失效，请在 VPS 上重新执行安装命令。" })
    } catch (resetError) {
      toast({ type: "error", title: errorMessage(resetError, "重置 token 失败") })
      throw resetError
    }
  }

  async function deleteMachine() {
    if (!machineDetail) return
    try {
      await deleteJson(`/api/node-hub/machines/${machineDetail.id}`)
      setMachineDetail(null)
      toast({ type: "success", title: `机器「${machineDetail.name}」已删除` })
      void refresh(true)
    } catch (deleteError) {
      toast({ type: "error", title: errorMessage(deleteError, "删除机器失败") })
      throw deleteError
    }
  }

  // --- nodes ---------------------------------------------------------------

  // Read through a ref so the table columns stay the same across background refreshes (a rebuild would close an open row menu).
  const firstMachineRef = React.useRef<NodeHubMachine | undefined>(undefined)
  firstMachineRef.current = data?.machines[0]
  const openNodeEditor = React.useCallback((node?: NodeHubNode) => {
    const firstMachine = firstMachineRef.current
    const draft = node ? nodeDraftFrom(node) : emptyNodeDraft(firstMachine?.id || 0)
    if (!node && firstMachine) draft.host = firstMachine.host
    setEditingNode(node || null)
    setNodeDraft(draft)
    setAdvancedText(advancedSettingsText(draft.settings))
    setAdvancedError("")
    setNodeEditorOpen(true)
  }, [])

  async function saveNode() {
    let settings: Record<string, unknown>
    try {
      settings = applyAdvancedSettings(nodeDraft.settings, advancedText)
      setAdvancedError("")
    } catch (parseError) {
      setAdvancedError(errorMessage(parseError, "高级设置有误"))
      return
    }
    if (!nodeDraft.machineId) {
      toast({ type: "error", title: "请选择节点所属的机器" })
      return
    }
    setNodeSaving(true)
    try {
      const body = { ...nodeDraft, settings }
      const saved = editingNode
        ? await putJson<NodeHubNode>(`/api/node-hub/nodes/${editingNode.id}`, body)
        : await postJson<NodeHubNode>("/api/node-hub/nodes", body)
      setNodeEditorOpen(false)
      toast({ type: "success", title: editingNode ? `节点「${saved.name}」已保存` : `节点「${saved.name}」已创建`, description: "机器最长约 1 分钟内拉取新配置。" })
      void refresh(true)
    } catch (saveError) {
      toast({ type: "error", title: errorMessage(saveError, "保存节点失败") })
    } finally {
      setNodeSaving(false)
    }
  }

  const setNodeEnabled = React.useCallback(async (node: NodeHubNode, enabled: boolean) => {
    try {
      await putJson(`/api/node-hub/nodes/${node.id}`, { enabled })
      toast({ type: "success", title: enabled ? `已启用「${node.name}」` : `已停用「${node.name}」` })
      void refresh(true)
    } catch (toggleError) {
      toast({ type: "error", title: errorMessage(toggleError, enabled ? "启用节点失败" : "停用节点失败") })
    }
  }, [refresh])

  async function deleteNode() {
    const node = confirmDeleteNode
    if (!node) return
    try {
      await deleteJson(`/api/node-hub/nodes/${node.id}`)
      setNodeEditorOpen(false)
      toast({ type: "success", title: `节点「${node.name}」已删除`, description: "端口最长约 5 分钟后释放，期间不要在同一端口新建节点。" })
      void refresh(true)
    } catch (deleteError) {
      toast({ type: "error", title: errorMessage(deleteError, "删除节点失败") })
      throw deleteError
    }
  }

  // --- speed limits ----------------------------------------------------------

  function openSpeed(user: User) {
    setSpeedUser(user)
    setSpeedValue(user.nodeSpeedLimitMbps === undefined || user.nodeSpeedLimitMbps === null ? "" : String(user.nodeSpeedLimitMbps))
    setSpeedError("")
  }

  async function saveSpeed(clear = false) {
    if (!speedUser) return
    const raw = clear ? "" : speedValue.trim()
    const value = raw === "" ? null : Number(raw)
    if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 100000)) {
      setSpeedError("请输入 0-100000 的整数，0 表示不限速。")
      return
    }
    setSpeedSaving(true)
    try {
      const result = await putJson<{ speedLimitMbps: number; override: number | null }>(`/api/users/${encodeURIComponent(speedUser.id)}/node-speed-limit`, { speedLimitMbps: value })
      setUsers(current => current && current.map(user => user.id === speedUser.id ? { ...user, nodeSpeedLimitMbps: result.override } : user))
      setSpeedUser(null)
      toast({ type: "success", title: result.override === null ? "已恢复套餐限速" : "限速已保存", description: result.speedLimitMbps ? `当前生效 ${result.speedLimitMbps} Mbps` : "当前不限速" })
    } catch (saveError) {
      setSpeedError(errorMessage(saveError, "保存限速失败"))
    } finally {
      setSpeedSaving(false)
    }
  }

  // --- derived ---------------------------------------------------------------

  const machines = React.useMemo(() => data?.machines || [], [data])
  const nodes = React.useMemo(() => data?.nodes || [], [data])
  const filteredNodes = React.useMemo(() => nodes.filter(node =>
    (machineFilter === "all" || String(node.machineId) === machineFilter)
    && (protocolFilter === "all" || node.protocol === protocolFilter)
    && (statusFilter === "all" || (statusFilter === "enabled" ? node.enabled : statusFilter === "disabled" ? !node.enabled : statusFilter === "online" ? node.online : node.enabled && !node.online))), [machineFilter, nodes, protocolFilter, statusFilter])
  const hubUsers = React.useMemo(() => (users || []).filter(user => user.lineType === "self_hosted" && (user.hubUuid || user.hubNodeIds?.length || user.nodeSpeedLimitMbps !== undefined)), [users])
  const issues = React.useMemo(() => [
    ...machines.filter(machine => machine.isActive && !machine.online).map(machine => ({ key: `m${machine.id}`, title: `机器「${machine.name}」${machine.lastSeenAt ? "离线" : "尚未连接"}`, detail: machine.lastSeenAt ? `最后上报 ${formatDateTime(machine.lastSeenAt)}` : "在 VPS 上执行安装命令后会自动上线。" })),
    ...nodes.filter(node => node.enabled && node.online && kernelRunning(node) === false).map(node => ({ key: `k${node.id}`, title: `节点「${node.name}」的内核未运行`, detail: "机器已拉取配置但代理内核没有启动，请在 VPS 上查看 journalctl -u xboard-node。" })),
    ...nodes.filter(node => node.enabled && !node.online && machines.find(machine => machine.id === node.machineId)?.online).map(node => ({ key: `n${node.id}`, title: `节点「${node.name}」离线`, detail: node.lastCheckAt ? `最后拉取 ${formatDateTime(node.lastCheckAt)}` : "机器还没有拉取这个节点，新节点最长约 1 分钟生效。" })),
  ], [machines, nodes])

  const machineColumns = React.useMemo<ColumnDef<NodeHubMachine>[]>(() => [
    { id: "machine", accessorFn: machine => `${machine.name} ${machine.host} ${machine.notes}`, header: DataTableColumnHeader({ title: "机器" }), meta: { label: "机器" }, cell: ({ row }) => <div className="grid min-w-0"><span className="truncate font-medium">{row.original.name}</span><span className="truncate text-xs text-muted-foreground">{row.original.host || "未填写地址"}</span></div> },
    { id: "status", accessorFn: machine => machine.isActive ? machine.online ? "在线" : "离线" : "已停用", header: DataTableColumnHeader({ title: "状态" }), meta: { label: "状态" }, cell: ({ row }) => <MachineStatus machine={row.original} /> },
    { id: "load", accessorFn: machine => machine.loadStatus?.cpu ?? -1, header: DataTableColumnHeader({ title: "负载" }), meta: { label: "负载" }, cell: ({ row }) => <LoadSummary load={row.original.loadStatus} /> },
    { id: "nodes", accessorFn: machine => machine.nodeIds?.length || 0, header: DataTableColumnHeader({ title: "节点" }), meta: { label: "节点" }, cell: ({ row }) => <span className="tabular-nums">{row.original.nodeIds?.length || 0}</span> },
    { id: "actions", header: "操作", enableHiding: false, enableSorting: false, cell: ({ row }) => <DataTableRowActions detail={<Button variant="ghost" size="icon" onClick={() => void openMachine(row.original)} aria-label={`管理 ${row.original.name}`}><Pencil /></Button>} /> },
  ], [openMachine])

  const nodeColumns = React.useMemo<ColumnDef<NodeHubNode>[]>(() => [
    { id: "node", accessorFn: node => `${node.name} ${node.machineName} ${node.host} ${node.region}`, header: DataTableColumnHeader({ title: "节点" }), meta: { label: "节点" }, cell: ({ row }) => <div className="grid min-w-0"><span className="truncate font-medium">{row.original.name}</span><span className="truncate text-xs text-muted-foreground">{row.original.machineName || `机器 ${row.original.machineId}`} · {row.original.host}</span></div> },
    { id: "protocol", accessorFn: node => `${node.protocol} ${node.serverPort}`, header: DataTableColumnHeader({ title: "协议 / 端口" }), meta: { label: "协议 / 端口" }, cell: ({ row }) => <div className="flex flex-wrap items-center gap-1"><Badge>{protocolLabel(row.original.protocol)}</Badge>{nodeSecurityLabel(row.original) ? <Badge>{nodeSecurityLabel(row.original)}</Badge> : null}<span className="text-sm tabular-nums">{row.original.serverPort}</span></div> },
    { id: "status", accessorFn: node => node.enabled ? node.online ? "在线" : "离线" : "已停用", header: DataTableColumnHeader({ title: "状态" }), meta: { label: "状态" }, cell: ({ row }) => <NodeStatus node={row.original} /> },
    { id: "users", accessorFn: node => node.userCount || 0, header: DataTableColumnHeader({ title: "授权 / 在线" }), meta: { label: "授权 / 在线" }, cell: ({ row }) => <span className="tabular-nums">{row.original.userCount || 0} / {row.original.onlineCount || 0}</span> },
    { id: "line", accessorFn: node => `${node.region} ${node.networkLevel} ${node.inboundType}`, header: DataTableColumnHeader({ title: "线路" }), meta: { label: "线路" }, cell: ({ row }) => <div className="flex flex-wrap gap-1">{row.original.region ? <Badge>{row.original.region}</Badge> : null}{row.original.networkLevel ? <Badge>{NODE_HUB_NETWORK_LEVELS.find(level => level.value === row.original.networkLevel)?.label}</Badge> : null}{row.original.inboundType === "custom" ? <Badge tone="info">定制节点</Badge> : null}{!row.original.region && !row.original.networkLevel && row.original.inboundType !== "custom" ? <span className="text-muted-foreground">未设置</span> : null}</div> },
    { id: "actions", header: "操作", enableHiding: false, enableSorting: false, cell: ({ row }) => <DataTableRowActions detail={<Button variant="ghost" size="icon" onClick={() => openNodeEditor(row.original)} aria-label={`编辑 ${row.original.name}`}><Pencil /></Button>} actions={[
      row.original.enabled ? { label: "停用节点", icon: <PowerOff />, onSelect: () => void setNodeEnabled(row.original, false) } : { label: "启用节点", icon: <Power />, onSelect: () => void setNodeEnabled(row.original, true) },
      { label: "删除节点", icon: <Trash2 />, destructive: true, separatorBefore: true, onSelect: () => setConfirmDeleteNode(row.original) },
    ]} /> },
  ], [openNodeEditor, setNodeEnabled])

  const speedColumns = React.useMemo<ColumnDef<User>[]>(() => [
    { id: "user", accessorFn: user => `${user.email || ""} ${user.customerID} ${user.id}`, header: DataTableColumnHeader({ title: "用户" }), meta: { label: "用户" }, cell: ({ row }) => <div className="grid min-w-0"><span className="truncate font-medium">{row.original.email || row.original.id}</span><span className="text-xs text-muted-foreground tabular-nums">#{row.original.customerID}</span></div> },
    { id: "nodes", accessorFn: user => user.hubNodeIds?.length || 0, header: DataTableColumnHeader({ title: "可用节点" }), meta: { label: "可用节点" }, cell: ({ row }) => <span className="tabular-nums">{row.original.hubNodeIds?.length || 0}</span> },
    { id: "plan", accessorFn: user => planSpeed(user), header: DataTableColumnHeader({ title: "套餐限速" }), meta: { label: "套餐限速" }, cell: ({ row }) => <span className="tabular-nums">{speedLabel(planSpeed(row.original))}</span> },
    { id: "override", accessorFn: user => user.nodeSpeedLimitMbps ?? -1, header: DataTableColumnHeader({ title: "单独设置" }), meta: { label: "单独设置" }, cell: ({ row }) => row.original.nodeSpeedLimitMbps === undefined || row.original.nodeSpeedLimitMbps === null ? <span className="text-muted-foreground">无</span> : <Badge tone="info">{speedLabel(row.original.nodeSpeedLimitMbps)}</Badge> },
    { id: "effective", accessorFn: user => effectiveSpeed(user), header: DataTableColumnHeader({ title: "生效限速" }), meta: { label: "生效限速" }, cell: ({ row }) => <span className="font-medium tabular-nums">{speedLabel(effectiveSpeed(row.original))}</span> },
    { id: "actions", header: "操作", enableHiding: false, enableSorting: false, cell: ({ row }) => <DataTableRowActions detail={<Button variant="ghost" size="icon" onClick={() => openSpeed(row.original)} aria-label={`设置 ${row.original.email || row.original.id} 的限速`}><Gauge /></Button>} /> },
  ], [])

  const loadChart = React.useMemo(() => {
    const history = machineDetail?.loadHistory || []
    // One point every ~15 minutes keeps a day of minute samples readable.
    const step = Math.max(1, Math.ceil(history.length / 96))
    return history.filter((_, index) => index % step === 0 || index === history.length - 1).map((sample, index, list) => ({
      key: sample.recordedAt,
      label: formatDateTime(sample.recordedAt),
      axisLabel: index % Math.max(1, Math.ceil(list.length / 6)) === 0 ? formatDateTime(sample.recordedAt).slice(-5) : undefined,
      values: { cpu: Math.round(sample.cpu * 10) / 10, mem: percent(sample.memUsed, sample.memTotal) ?? 0 },
    }))
  }, [machineDetail?.loadHistory])

  const machineChanged = machineDetail ? machineDraft.name !== machineDetail.name || machineDraft.host !== machineDetail.host || machineDraft.notes !== machineDetail.notes || machineDraft.isActive !== machineDetail.isActive : false

  if (loading && !data && !notConfigured) return <div className="grid gap-4 px-4 lg:px-6"><Skeleton lines={3} /><Skeleton lines={6} /></div>
  if (notConfigured) return <div className="grid gap-4 px-4 lg:px-6"><Alert tone="info" title="node-hub 尚未配置">{notConfigured} 配置方法见 docs/agent/node-hub.md 的「部署」一节。</Alert></div>

  const onlineMachines = machines.filter(machine => machine.isActive && machine.online).length
  const onlineNodes = nodes.filter(node => node.online).length
  const onlineConnections = nodes.reduce((sum, node) => sum + (node.onlineCount || 0), 0)

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      {error ? <Alert tone="danger" title={error} /> : null}
      <Tabs value={tab} onValueChange={value => updateParam("tab", value, "overview")} className="min-w-0 gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="overview">概览</TabsTrigger>
            <TabsTrigger value="machines">机器</TabsTrigger>
            <TabsTrigger value="nodes">节点</TabsTrigger>
            <TabsTrigger value="speed">用户限速</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton variant="secondary" icon={<RefreshCw />} collapse onClick={() => void refresh()} disabled={loading} pending={loading} label="刷新" />
            <ActionButton icon={<UsersIcon />} collapse onClick={() => void syncEntitlements()} disabled={syncing} pending={syncing} label="同步用户授权" />
          </div>
        </div>

        <TabsContent value="overview" className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="在线机器" value={onlineMachines} context={`共 ${machines.length} 台，停用的不计入`} />
            <MetricCard label="在线节点" value={onlineNodes} context={`共 ${nodes.length} 个，按时拉取配置即为在线`} />
            <MetricCard label="在线连接" value={onlineConnections} context="各节点上报的在线用户数之和" />
            <MetricCard label="需要处理" value={issues.length} context={issues.length ? "见下方列表" : "一切正常"} />
          </div>
          {issues.length ? <Card title="需要处理"><div className="grid gap-2">{issues.map(issue => <Alert key={issue.key} tone="warning" title={issue.title}>{issue.detail}</Alert>)}</div></Card> : null}
          <Card title="node-hub 设置" description="由 node-hub 的环境变量决定，修改后重启 node-hub。">
            <InfoList items={[
              { label: "公开地址（NODE_HUB_PUBLIC_URL）", value: data?.settings.publicUrl || <span className="text-destructive">未设置，无法生成安装命令</span> },
              { label: "实时推送（WebSocket）", value: data?.settings.websocket ? `已开启 · ${machines.filter(machine => machine.pushConnected).length} 台机器已连接` : "未开启（需要 NODE_HUB_PUBLIC_URL）" },
              { label: "上报间隔", value: `${data?.settings.pushInterval ?? "-"} 秒` },
              { label: "拉取间隔", value: `${data?.settings.pullInterval ?? "-"} 秒` },
              { label: "判定离线", value: `${data?.settings.onlineGraceSeconds ?? "-"} 秒未上报` },
            ]} />
          </Card>
        </TabsContent>

        <TabsContent value="machines">
          <DataTableCard><DataTable columns={machineColumns} data={machines} searchKey="machine" searchPlaceholder="搜索机器名称、地址或备注" stateKey="machines" emptyTitle="还没有机器" emptyDescription="新建机器后，在 VPS 上执行安装命令即可接入。" pageSize={30} frame="card" renderMobileItem={machine => <Card title={machine.name} description={machine.host || "未填写地址"} headerAction={<Button variant="ghost" size="icon" onClick={() => void openMachine(machine)} aria-label={`管理 ${machine.name}`}><Pencil /></Button>}><div className="flex flex-wrap items-start justify-between gap-3"><MachineStatus machine={machine} /><LoadSummary load={machine.loadStatus} /></div></Card>} toolbar={<Button collapse onClick={() => { setMachineDraft(emptyMachineDraft()); setMachineCreateOpen(true) }}><Plus />新建机器</Button>} /></DataTableCard>
        </TabsContent>

        <TabsContent value="nodes">
          <DataTableCard><DataTable columns={nodeColumns} data={filteredNodes} searchKey="node" searchPlaceholder="搜索节点、机器、地址或地区" stateKey="nodes" emptyTitle={nodes.length ? "没有符合条件的节点" : "还没有节点"} emptyDescription={nodes.length ? "调整筛选条件后再试。" : machines.length ? "新建节点后，加入线路组即可分配给用户。" : "先在「机器」中新建机器。"} pageSize={30} frame="card" filters={[
            { id: "machine", label: "机器", value: machineFilter, onChange: value => updateParam("machine", value), options: [{ value: "all", label: "全部机器" }, ...machines.map(machine => ({ value: String(machine.id), label: machine.name }))] },
            { id: "protocol", label: "协议", value: protocolFilter, onChange: value => updateParam("protocol", value), options: [{ value: "all", label: "全部协议" }, ...NODE_HUB_PROTOCOLS] },
            { id: "status", label: "状态", value: statusFilter, onChange: value => updateParam("status", value), options: [{ value: "all", label: "全部状态" }, { value: "online", label: "在线" }, { value: "offline", label: "离线" }, { value: "enabled", label: "已启用" }, { value: "disabled", label: "已停用" }] },
          ]} onClearFilters={() => setSearchParams(current => { const next = new URLSearchParams(current); for (const key of ["machine", "protocol", "status"]) next.delete(key); return next }, { replace: true })} renderMobileItem={node => <Card title={node.name} description={`${node.machineName || `机器 ${node.machineId}`} · ${protocolLabel(node.protocol)} ${nodeSecurityLabel(node)} · ${node.serverPort}`} headerAction={<Button variant="ghost" size="icon" onClick={() => openNodeEditor(node)} aria-label={`编辑 ${node.name}`}><Pencil /></Button>}><div className="flex flex-wrap items-start justify-between gap-3"><NodeStatus node={node} /><span className="text-sm tabular-nums">授权 {node.userCount || 0} · 在线 {node.onlineCount || 0}</span></div></Card>} toolbar={<Button collapse onClick={() => openNodeEditor()} disabled={!machines.length}><Plus />新建节点</Button>} /></DataTableCard>
        </TabsContent>

        <TabsContent value="speed" className="grid gap-4">
          {usersError ? <Alert tone="danger" title={`读取用户失败：${usersError}`} action={<Button variant="secondary" size="sm" onClick={() => void loadUsers()}><RefreshCw />重试</Button>} /> : null}
          {users === null && !usersError ? <Skeleton lines={6} /> : <DataTableCard><DataTable columns={speedColumns} data={hubUsers} searchKey="user" searchPlaceholder="搜索邮箱或客户编号" stateKey="speed" emptyTitle="没有使用 node-hub 节点的用户" emptyDescription="自建线路用户同步授权后会出现在这里。" pageSize={30} frame="card" renderMobileItem={user => <Card title={user.email || user.id} description={`可用节点 ${user.hubNodeIds?.length || 0} · 套餐 ${speedLabel(planSpeed(user))}`} headerAction={<Button variant="ghost" size="icon" onClick={() => openSpeed(user)} aria-label={`设置 ${user.email || user.id} 的限速`}><Gauge /></Button>}><span className="text-sm">生效限速 <span className="font-medium tabular-nums">{speedLabel(effectiveSpeed(user))}</span></span></Card>} toolbar={<ActionButton variant="secondary" icon={<RefreshCw />} collapse onClick={() => void loadUsers()} label="刷新用户" />} /></DataTableCard>}
        </TabsContent>
      </Tabs>

      <Dialog open={machineCreateOpen} onOpenChange={open => { if (!machineSaving) setMachineCreateOpen(open) }}>
        <DialogContent title="新建机器" description="一台机器对应一台运行 xboard-node 的 VPS，创建后会生成它专用的安装命令。">
          <div className="grid gap-3">
            <Input label="机器名称" id="machine-name" value={machineDraft.name} onChange={event => setMachineDraft(current => ({ ...current, name: event.target.value }))} placeholder="香港 VPS 01" maxLength={80} />
            <Input label="地址" id="machine-host" description="VPS 的 IP 或域名，新建节点时作为默认连接地址。" value={machineDraft.host} onChange={event => setMachineDraft(current => ({ ...current, host: event.target.value.trim() }))} placeholder="203.0.113.10" />
            <Textarea label="备注" id="machine-notes" value={machineDraft.notes} onChange={event => setMachineDraft(current => ({ ...current, notes: event.target.value }))} rows={2} maxLength={500} />
          </div>
          <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setMachineCreateOpen(false)} disabled={machineSaving}>取消</Button><ActionButton icon={<Plus />} onClick={() => void createMachine()} disabled={machineSaving || !machineDraft.name.trim()} pending={machineSaving} label="创建机器" /></div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(installFor)} onOpenChange={open => { if (!open) setInstallFor(null) }}>
        <DialogContent title={`安装到「${installFor?.name || ""}」`} description="在这台 VPS 上执行下面的命令，机器会在 1 分钟内上线。之后可随时在机器详情里重新查看。" size="lg">
          <InstallCommand command={installFor?.installCommand} />
          <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setInstallFor(null)}>完成</Button></div>
        </DialogContent>
      </Dialog>

      <Drawer open={Boolean(machineDetail)} onOpenChange={open => { if (!open && !machineSaving) setMachineDetail(null) }}>
        <DrawerContent title={machineDetail?.name || "机器"} description={machineDetail?.host || ""} size="lg">
          {machineDetail ? <div className="-mx-1 grid flex-1 content-start gap-6 overflow-x-hidden overflow-y-auto px-1">
            <section className="grid gap-3">
              <h3 className="text-sm font-semibold">状态</h3>
              <InfoList items={[
                { label: "状态", value: machineDetail.isActive ? machineDetail.online ? "在线" : machineDetail.lastSeenAt ? "离线" : "未连接" : "已停用" },
                { label: "最后上报", value: machineDetail.lastSeenAt ? formatDateTime(machineDetail.lastSeenAt) : "从未上报" },
                { label: "变更送达", value: machineDetail.pushConnected ? "实时推送（WebSocket）" : "轮询" },
                { label: "CPU", value: machineDetail.loadStatus?.cpu === undefined ? "-" : `${machineDetail.loadStatus.cpu.toFixed(1)}%` },
                { label: "内存", value: machineDetail.loadStatus?.mem ? `${formatBytes(machineDetail.loadStatus.mem.used)} / ${formatBytes(machineDetail.loadStatus.mem.total)}` : "-" },
                { label: "磁盘", value: machineDetail.loadStatus?.disk ? `${formatBytes(machineDetail.loadStatus.disk.used)} / ${formatBytes(machineDetail.loadStatus.disk.total)}` : "-" },
                { label: "节点", value: `${machineDetail.nodeIds?.length || 0} 个` },
              ]} />
              {machineDetailLoading ? <Skeleton lines={4} /> : loadChart.length > 1 ? <LineChart label="近 24 小时负载" data={loadChart} series={[{ key: "cpu", label: "CPU" }, { key: "mem", label: "内存" }]} unit="%" height={180} categoryLabel="时间" formatValue={value => `${value}%`} formatTick={value => `${value}%`} /> : <p className="text-sm text-muted-foreground">还没有负载记录，机器上线后每分钟记录一次，保留 24 小时。</p>}
            </section>
            <section className="grid gap-3">
              <h3 className="text-sm font-semibold">设置</h3>
              <Input label="机器名称" id="machine-edit-name" value={machineDraft.name} onChange={event => setMachineDraft(current => ({ ...current, name: event.target.value }))} maxLength={80} />
              <Input label="地址" id="machine-edit-host" value={machineDraft.host} onChange={event => setMachineDraft(current => ({ ...current, host: event.target.value.trim() }))} placeholder="203.0.113.10" />
              <Textarea label="备注" id="machine-edit-notes" value={machineDraft.notes} onChange={event => setMachineDraft(current => ({ ...current, notes: event.target.value }))} rows={2} maxLength={500} />
              <SwitchRow id="machine-edit-active" label="启用机器" description="停用后这台机器的请求会被拒绝，节点停止服务。" checked={machineDraft.isActive} onCheckedChange={isActive => setMachineDraft(current => ({ ...current, isActive }))} />
              <div className="flex flex-wrap justify-end gap-2"><ActionButton icon={<Save />} onClick={() => void saveMachine()} disabled={machineSaving || !machineChanged || !machineDraft.name.trim()} pending={machineSaving} label="保存机器设置" /></div>
            </section>
            <section className="grid gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Terminal className="size-4" />安装命令</h3>
              {machineDetailLoading ? <Skeleton lines={2} /> : <InstallCommand command={machineDetail.installCommand} />}
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="danger" onClick={() => setConfirmDeleteMachine(true)}><Trash2 />删除机器</Button>
                <Button variant="secondary" onClick={() => setConfirmResetToken(true)}><KeyRound />重置 token</Button>
              </div>
            </section>
          </div> : null}
        </DrawerContent>
      </Drawer>
      <ConfirmDialog open={confirmResetToken} onOpenChange={setConfirmResetToken} title={`重置「${machineDetail?.name || ""}」的 token？`} description="旧 token 立即失效，这台 VPS 会离线，直到用新的安装命令重新安装。" confirmLabel="重置 token" onConfirm={resetMachineToken} />
      <ConfirmDialog open={confirmDeleteMachine} onOpenChange={setConfirmDeleteMachine} title={`删除机器「${machineDetail?.name || ""}」？`} description="机器下还有节点时不能删除，请先删除节点。删除后不能恢复。" confirmLabel="删除机器" onConfirm={deleteMachine} />

      <Dialog open={nodeEditorOpen} onOpenChange={open => { if (!nodeSaving) setNodeEditorOpen(open) }}>
        <DialogContent title={editingNode ? `编辑「${editingNode.name}」` : "新建节点"} description="保存后机器最长约 1 分钟内拉取新配置；加入线路组后才会分配给用户。" size="xl">
          <NodeHubNodeForm draft={nodeDraft} onChange={setNodeDraft} machines={machines} advancedText={advancedText} onAdvancedTextChange={text => { setAdvancedText(text); setAdvancedError("") }} advancedError={advancedError} creating={!editingNode} />
          <div className="flex flex-wrap justify-end gap-2">
            {editingNode ? <Button variant="danger" className="mr-auto" onClick={() => setConfirmDeleteNode(editingNode)} disabled={nodeSaving}><Trash2 />删除节点</Button> : null}
            <Button variant="secondary" onClick={() => setNodeEditorOpen(false)} disabled={nodeSaving}>取消</Button>
            <ActionButton icon={editingNode ? <Save /> : <Plus />} onClick={() => void saveNode()} disabled={nodeSaving} pending={nodeSaving} label={editingNode ? "保存节点" : "创建节点"} />
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={Boolean(confirmDeleteNode)} onOpenChange={open => { if (!open) setConfirmDeleteNode(null) }} title={`删除节点「${confirmDeleteNode?.name || ""}」？`} description="用户会立即失去这个节点，线路组里的这个节点也会失效。删除后不能恢复。" confirmLabel="删除节点" onConfirm={deleteNode} />

      <Dialog open={Boolean(speedUser)} onOpenChange={open => { if (!open && !speedSaving) setSpeedUser(null) }}>
        <DialogContent title="设置用户限速" description={speedUser ? `${speedUser.email || speedUser.id} · 套餐限速 ${speedLabel(planSpeed(speedUser))}` : ""}>
          <Input label="单独限速（Mbps）" id="speed-limit" type="number" inputMode="numeric" min={0} max={100000} step={1} value={speedValue} onChange={event => { setSpeedValue(event.target.value); setSpeedError("") }} description="0 表示不限速；留空则使用套餐限速。按节点生效。" error={speedError} placeholder={String(planSpeed(speedUser) || "")} />
          <div className="flex flex-wrap justify-end gap-2">
            {speedUser?.nodeSpeedLimitMbps !== undefined && speedUser?.nodeSpeedLimitMbps !== null ? <Button variant="secondary" className="mr-auto" onClick={() => void saveSpeed(true)} disabled={speedSaving}><Undo2 />恢复套餐限速</Button> : null}
            <Button variant="secondary" onClick={() => setSpeedUser(null)} disabled={speedSaving}>取消</Button>
            <ActionButton icon={<Save />} onClick={() => void saveSpeed()} disabled={speedSaving} pending={speedSaving} label="保存限速" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function planSpeed(user: User | null) {
  const snapshot = user?.v2ProductSnapshot as { speedLimitMbps?: number } | undefined
  return Math.max(0, Math.floor(Number(snapshot?.speedLimitMbps) || 0))
}

function effectiveSpeed(user: User) {
  return user.nodeSpeedLimitMbps === undefined || user.nodeSpeedLimitMbps === null ? planSpeed(user) : user.nodeSpeedLimitMbps
}

function speedLabel(mbps: number) {
  return mbps ? `${mbps} Mbps` : "不限速"
}
