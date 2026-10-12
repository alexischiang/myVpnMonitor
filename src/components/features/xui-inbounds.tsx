import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useSearchParams } from "react-router-dom"
import { CircleMinus, CirclePlus, Loader2, Pencil, Plus, RefreshCw, Save, Server, Trash2 } from "lucide-react"
import { toast } from "@/components/features/toast"

import { deleteJson, fetchJson, fetchJsonSteps, postJson, putJson } from "@/api"
import { DataTable, DataTableColumnHeader, DataTableRowActions } from "@/components/features/arc-data-table"
import { DataTableCard } from "@/components/features/data-table-card"
import { PageHeader } from "@/components/features/shared"
import { StepProgress, type ProgressStep, type StepStatus } from "@/components/features/step-progress"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import type { CatalogV2LineGroup, XuiInboundManagement, XuiInboundSettings } from "@/types"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Input } from "@/components/arc/input/input"
import { Select } from "@/components/arc/select/select"
import { Switch } from "@/components/arc/switch/switch"
import { Card as ArcCard } from "@/components/arc/card/card"
import { SimpleTable } from "@/components/features/simple-table"
import { NumberField } from "@/components/arc/number-field/number-field"

const networkLevels = [
  { value: "premium", label: "精品线路" },
  { value: "optimized", label: "优化线路" },
  { value: "standard", label: "普通线路" },
] as const

type InboundDraft = {
  enabled: boolean
  networkLevel: string
  region: string
  inboundType: "package" | "custom"
}

type XuiInbound = XuiInboundManagement["inbounds"][number]
const emptyLineGroup = (): CatalogV2LineGroup => ({ id: "", name: "", isEnabled: true, sortOrder: 0, inboundKeys: [] })
// Steps the server reports while it saves a line group.
const lineGroupSaveSteps = [
  { id: "validate", label: "校验入站" },
  { id: "save", label: "保存权限组" },
  { id: "sync", label: "同步到 3x-ui" },
]
type LineGroupSaveResult = CatalogV2LineGroup & { xuiSync?: { updated?: number; skipped?: number; failed?: number; error?: string } }

function InboundProbeBadge({ inbound }: { inbound: XuiInbound }) {
  const online = inbound.probeStatus === "online"
  const label = online ? `正常 · ${inbound.probeLatencyMs ?? 0} ms` : inbound.probeStatus === "offline" ? "异常" : inbound.probeStatus === "disabled" ? "未检测" : "未知"
  return <Badge tone={online ? "success" : inbound.probeStatus === "offline" ? "danger" : "neutral"} title={inbound.probeError || `检测时间：${inbound.probeCheckedAt}`}>{label}</Badge>
}

export function XuiInboundsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = React.useState<XuiInboundManagement | null>(null)
  const [lineGroups, setLineGroups] = React.useState<CatalogV2LineGroup[]>([])
  const [editingKey, setEditingKey] = React.useState("")
  const [draft, setDraft] = React.useState<InboundDraft>({ enabled: true, networkLevel: "", region: "", inboundType: "package" })
  const [groupOpen, setGroupOpen] = React.useState(false)
  const [groupDraft, setGroupDraft] = React.useState<CatalogV2LineGroup>(emptyLineGroup)
  const [groupOriginal, setGroupOriginal] = React.useState<CatalogV2LineGroup | null>(null)
  const [groupSearch, setGroupSearch] = React.useState("")
  const [groupNodeFilter, setGroupNodeFilter] = React.useState("all")
  const [groupSaveSteps, setGroupSaveSteps] = React.useState<ProgressStep[] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")
  const nodeFilter = searchParams.get("node") || "all"
  const levelFilter = searchParams.get("level") || "all"
  const regionFilter = searchParams.get("region") || "all"
  const planFilter = searchParams.get("plan") || "all"
  const statusFilter = searchParams.get("status") || "all"
  const typeFilter = searchParams.get("type") || "package"
  const searchQuery = searchParams.get("q") || ""
  const editingInbound = data?.inbounds.find(inbound => inbound.key === editingKey)

  function updateSearchParam(key: string, value: string, defaultValue = "all") {
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      if (!value || value === defaultValue) next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  }

  // live: read the inbound list from 3x-ui first instead of the last synced table.
  const refresh = React.useCallback(async (live = false, background = false) => {
    setLoading(true)
    try {
      const [result, groups] = await Promise.all([
        fetchJson<XuiInboundManagement>(live ? "/api/xui-inbounds?refresh=1" : "/api/xui-inbounds", { background }),
        fetchJson<CatalogV2LineGroup[]>("/api/catalog-v2/line-groups", { background }),
      ])
      setData(result)
      setLineGroups(groups)
      setError(result.refreshError ? `无法从 3x-ui 获取最新入站，当前显示上次同步的数据：${result.refreshError}` : "")
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "无法读取 3x-ui 入站")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const refreshIfVisible = (background = false) => { if (!document.hidden) void refresh(false, background) }
    const onVisibilityChange = () => { if (!document.hidden) refreshIfVisible() }
    void refresh(true)
    const timer = window.setInterval(() => refreshIfVisible(true), 120_000)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [refresh])

  const openEditor = React.useCallback((inbound: XuiInbound) => {
    setDraft({ enabled: inbound.enabled, networkLevel: inbound.networkLevel, region: inbound.region, inboundType: inbound.inboundType })
    setEditingKey(inbound.key)
  }, [])

  async function saveEditor() {
    const inbound = data?.inbounds.find(item => item.key === editingKey)
    if (!inbound) return
    const statusChanged = draft.enabled !== inbound.enabled
    setSaving(true)
    try {
      const settings = await putJson<XuiInboundSettings>(`/api/xui-inbounds/${encodeURIComponent(inbound.key)}/settings`, { networkLevel: draft.networkLevel, region: draft.region, inboundType: draft.inboundType })
      if (statusChanged) await postJson(`/api/xui-inbounds/${inbound.id}/set-enable`, { enable: draft.enabled })
      setData(current => current ? { ...current, inbounds: current.inbounds.map(item => item.key === inbound.key ? { ...item, enabled: draft.enabled, networkLevel: settings.networkLevel, region: settings.region, inboundType: settings.inboundType } : item) } : current)
      if (draft.inboundType === "custom") {
        const affected = lineGroups.filter(group => group.inboundKeys.includes(inbound.key))
        const updated = await Promise.all(affected.map(group => putJson<CatalogV2LineGroup>(`/api/catalog-v2/line-groups/${encodeURIComponent(group.id)}`, { ...group, inboundKeys: group.inboundKeys.filter(key => key !== inbound.key) })))
        if (updated.length) setLineGroups(current => current.map(group => updated.find(item => item.id === group.id) || group))
      }
      setEditingKey("")
      toast({ type: "success", title: "入站设置已保存" })
    } catch (saveError) {
      toast({ type: "error", title: saveError instanceof Error ? saveError.message : "保存失败" })
      if (statusChanged) void refresh()
    } finally {
      setSaving(false)
    }
  }

  const groupSettingsChanged = React.useMemo(() => groupOriginal
    ? JSON.stringify(groupDraft) !== JSON.stringify(groupOriginal)
    : Boolean(groupDraft.id || groupDraft.name || groupDraft.inboundKeys.length), [groupDraft, groupOriginal])

  const editorChanged = React.useMemo(() => {
    if (!editingInbound) return false
    return draft.enabled !== editingInbound.enabled
      || draft.networkLevel !== editingInbound.networkLevel
      || draft.region !== editingInbound.region
      || draft.inboundType !== editingInbound.inboundType
  }, [draft, editingInbound])

  function openGroupSettings(group?: CatalogV2LineGroup) {
    const next = group ? structuredClone(group) : { ...emptyLineGroup(), sortOrder: Math.max(-1, ...lineGroups.map(item => item.sortOrder)) + 1 }
    setGroupDraft(next)
    setGroupOriginal(group ? structuredClone(group) : null)
    setGroupSearch("")
    setGroupNodeFilter("all")
    setGroupOpen(true)
  }

  function setGroupInboundAvailability(inboundKey: string, available: boolean) {
    setGroupDraft(current => ({ ...current, inboundKeys: available ? [...new Set([...current.inboundKeys, inboundKey])] : current.inboundKeys.filter(key => key !== inboundKey) }))
  }

  async function saveGroupSettings() {
    setSaving(true)
    setGroupSaveSteps(lineGroupSaveSteps.map(step => ({ ...step, status: "pending" })))
    let runningStep = ""
    try {
      const { xuiSync, ...result } = await fetchJsonSteps<LineGroupSaveResult, { step: string; status: StepStatus }>(
        groupOriginal ? `/api/catalog-v2/line-groups/${encodeURIComponent(groupOriginal.id)}` : "/api/catalog-v2/line-groups",
        { method: groupOriginal ? "PUT" : "POST", body: JSON.stringify(groupDraft), background: true },
        event => {
          runningStep = event.status === "running" ? event.step : ""
          setGroupSaveSteps(current => current && current.map(step => step.id === event.step ? { ...step, status: event.status } : step))
        },
      )
      setLineGroups(current => groupOriginal
        ? current.map(group => group.id === result.id ? { ...result, productCount: group.productCount } : group).toSorted((left, right) => left.sortOrder - right.sortOrder)
        : [...current, { ...result, productCount: 0 }].toSorted((left, right) => left.sortOrder - right.sortOrder))
      setGroupOpen(false)
      // The group is saved even when the push fails; the five-minute sync retries it.
      if (xuiSync?.error) toast({ type: "warning", title: `权限组已保存，但同步到 3x-ui 失败：${xuiSync.error}。系统会在下次定时同步时重试。` })
      else if (xuiSync?.failed) toast({ type: "warning", title: `权限组已保存，但有 ${xuiSync.failed} 个用户未能同步到 3x-ui。系统会在下次定时同步时重试。` })
      else toast({ type: "success", title: xuiSync?.updated ? `V2 权限组已保存，已同步 ${xuiSync.updated} 个用户` : "V2 权限组已保存" })
    } catch (saveError) {
      // The step that was running is the one that failed; a request rejected before any step has none.
      const failedStep = lineGroupSaveSteps.find(step => step.id === runningStep)?.label
      const message = saveError instanceof Error ? saveError.message : "保存失败"
      toast({ type: "error", title: failedStep ? `${failedStep}失败：${message}` : message })
    } finally {
      setGroupSaveSteps(null)
      setSaving(false)
    }
  }

  async function removeGroup() {
    if (!groupOriginal || !window.confirm(`确认删除 ${groupOriginal.name}？`)) return
    setSaving(true)
    try {
      await deleteJson(`/api/catalog-v2/line-groups/${encodeURIComponent(groupOriginal.id)}`)
      setLineGroups(current => current.filter(group => group.id !== groupOriginal.id))
      setGroupOpen(false)
      toast({ type: "success", title: "V2 权限组已删除" })
    } catch (removeError) {
      toast({ type: "error", title: removeError instanceof Error ? removeError.message : "删除失败" })
    } finally {
      setSaving(false)
    }
  }

  const renderMobileInbound = React.useCallback((inbound: XuiInbound) => {
    const level = networkLevels.find(item => item.value === inbound.networkLevel)?.label || "未设置"
    const availableGroups = lineGroups.filter(group => group.inboundKeys.includes(inbound.key)).map(group => group.name).join(" / ") || "未分配"
    return <ArcCard title={<><span className="min-w-0 truncate">{inbound.name}</span><Badge>{inbound.inboundType === "custom" ? "定制节点" : "套餐节点"}</Badge><Badge tone={inbound.enabled ? "success" : "neutral"}>{inbound.enabled ? "启用" : "停用"}</Badge><InboundProbeBadge inbound={inbound} /></>} description={`${inbound.nodeName} · ${level} · ${inbound.region || "未设置"}`} headerAction={<><Button variant="ghost" size="icon" onClick={() => openEditor(inbound)} aria-label={`编辑 ${inbound.name}`}><Pencil /></Button></>}><p className="text-sm text-muted-foreground">{inbound.inboundType === "custom" ? "不参与套餐分组" : availableGroups} · {inbound.protocol.toUpperCase()} / {inbound.port ?? "-"} · {inbound.recentlyActive === null ? "连接活动未知" : inbound.recentlyActive ? "近期活跃" : "近期无流量"}</p></ArcCard>
  }, [lineGroups, openEditor])

  const columns = React.useMemo<ColumnDef<XuiInbound>[]>(() => [
    { id: "inbound", accessorFn: inbound => `${inbound.name} ${inbound.tag} ${inbound.nodeName} ${inbound.region} ${inbound.protocol} ${networkLevels.find(item => item.value === inbound.networkLevel)?.label || ""}`, header: DataTableColumnHeader({ title: "入站" }), meta: { label: "入站" }, cell: ({ row }) => <div className="grid min-w-0"><span className="truncate font-medium">{row.original.name}</span>{row.original.tag ? <span className="truncate text-xs text-muted-foreground">{row.original.tag}</span> : null}</div> },
    { accessorKey: "inboundType", header: DataTableColumnHeader({ title: "入站类型" }), meta: { label: "入站类型" }, cell: ({ row }) => <Badge>{row.original.inboundType === "custom" ? "定制节点" : "套餐节点"}</Badge> },
    { id: "status", accessorFn: inbound => `${inbound.enabled ? "启用" : "停用"} ${inbound.probeStatus} ${inbound.probeLatencyMs ?? ""} ${inbound.recentlyActive === null ? "状态未知" : inbound.recentlyActive ? "近期活跃" : "近期无流量"}`, header: DataTableColumnHeader({ title: "状态 / 延迟" }), meta: { label: "状态 / 延迟" }, cell: ({ row }) => <div className="grid justify-items-start gap-1"><Badge tone={row.original.enabled ? "success" : "neutral"}>{row.original.enabled ? "启用" : "停用"}</Badge><InboundProbeBadge inbound={row.original} /><span className="text-xs text-muted-foreground">{row.original.recentlyActive === null ? "连接活动未知" : row.original.recentlyActive ? "近期活跃" : "近期无流量"}</span></div> },
    { accessorKey: "clientCount", header: DataTableColumnHeader({ title: "客户端" }), meta: { label: "客户端" }, cell: ({ row }) => <span className="tabular-nums">{row.original.clientCount}</span> },
    { accessorKey: "networkLevel", header: DataTableColumnHeader({ title: "网络级别" }), meta: { label: "网络级别" }, cell: ({ row }) => { const label = networkLevels.find(item => item.value === row.original.networkLevel)?.label; return label ? <Badge>{label}</Badge> : <span className="text-muted-foreground">未设置</span> } },
    { accessorKey: "region", header: DataTableColumnHeader({ title: "地区" }), meta: { label: "地区" }, cell: ({ row }) => row.original.region || <span className="text-muted-foreground">未设置</span> },
    { accessorKey: "nodeName", header: DataTableColumnHeader({ title: "节点" }), meta: { label: "节点" }, cell: ({ row }) => <span className="font-medium">{row.original.nodeName}</span> },
    { id: "actions", header: "操作", cell: ({ row }) => <DataTableRowActions detail={<Button variant="ghost" size="icon" onClick={() => openEditor(row.original)} aria-label={`编辑 ${row.original.name}`}><Pencil /></Button>} />, enableHiding: false, enableSorting: false },
  ], [openEditor])

  const nodeOptions = React.useMemo(() => [...new Map((data?.inbounds || []).map(inbound => [inbound.nodeGuid, inbound.nodeName])).entries()].map(([value, label]) => ({ value, label })).toSorted((left, right) => left.label.localeCompare(right.label)), [data])
  const regionOptions = React.useMemo(() => [...new Set((data?.inbounds || []).map(inbound => inbound.region).filter(Boolean))].toSorted(), [data])
  const allInbounds = React.useMemo(() => (data?.inbounds || []).toSorted((left, right) => left.subSortIndex - right.subSortIndex || left.id - right.id), [data])
  const groupFilteredInbounds = React.useMemo(() => {
    const query = groupSearch.trim().toLocaleLowerCase()
    return allInbounds.filter(inbound => inbound.inboundType === "package" && (groupNodeFilter === "all" || inbound.nodeGuid === groupNodeFilter) && (!query || `${inbound.nodeName} ${inbound.name} ${inbound.tag} ${inbound.region} ${inbound.protocol}`.toLocaleLowerCase().includes(query)))
  }, [allInbounds, groupNodeFilter, groupSearch])
  const selectedInboundKeys = React.useMemo(() => new Set(groupDraft.inboundKeys), [groupDraft.inboundKeys])
  const availableInbounds = groupFilteredInbounds.filter(inbound => selectedInboundKeys.has(inbound.key))
  const unavailableInbounds = groupFilteredInbounds.filter(inbound => !selectedInboundKeys.has(inbound.key))
  const sortedInbounds = React.useMemo(() => allInbounds.filter(inbound => {
    const availableGroups = lineGroups.filter(group => group.inboundKeys.includes(inbound.key))
    return (nodeFilter === "all" || inbound.nodeGuid === nodeFilter)
      && (levelFilter === "all" || levelFilter === "unset" ? levelFilter === "all" || !inbound.networkLevel : inbound.networkLevel === levelFilter)
      && (regionFilter === "all" || regionFilter === "unset" ? regionFilter === "all" || !inbound.region : inbound.region === regionFilter)
      && (planFilter === "all" || planFilter === "unassigned" ? planFilter === "all" || !availableGroups.length : availableGroups.some(group => group.id === planFilter))
      && (statusFilter === "all" || (statusFilter === "enabled") === inbound.enabled)
      && (typeFilter === "all" || inbound.inboundType === typeFilter)
  }), [allInbounds, levelFilter, lineGroups, nodeFilter, planFilter, regionFilter, statusFilter, typeFilter])

  if (loading && !data) return <div className="grid gap-4 px-4 lg:px-6"><Skeleton lines={3} /><Skeleton lines={6} /></div>
  if (!data?.configured) return <div className="px-4 lg:px-6"><Alert title="尚未配置 3x-ui，无法管理入站。" /></div>

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <PageHeader title="入站管理" description="按单个入站维护线路属性；流量倍率在节点监控的节点设置中统一维护。" />
      {error ? <Alert tone="danger" title={error} /> : null}

      <section className="grid gap-3" aria-labelledby="v2-line-groups-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="v2-line-groups-title" className="font-semibold">V2 线路权限组</h2><p className="text-sm text-muted-foreground">V2 商品使用的入站权限；旧套餐分组不在此页面显示。</p></div>
          <Button onClick={() => openGroupSettings()}><Plus />新建权限组</Button>
        </div>
        {lineGroups.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{lineGroups.map(group => <Card key={group.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="text-lg font-medium truncate">{group.name}</h3><p className="text-sm text-muted-foreground truncate">{group.id}</p></div>{group.isEnabled ? <Badge tone="success">启用</Badge> : <Badge>停用</Badge>}</div><div className="flex items-end justify-between gap-3"><div className="text-sm text-muted-foreground"><span className="tabular-nums">{group.inboundKeys.length}</span> 个入站 · <span className="tabular-nums">{group.productCount || 0}</span> 个商品</div><Button variant="secondary" size="sm" onClick={() => openGroupSettings(group)}><Pencil />编辑</Button></div></Card>)}</div> : <Card title="尚未创建 V2 权限组" description="新建权限组后即可为 V2 套餐选择可用入站。"></Card>}
      </section>

      <DataTableCard filters={<>
        <Select label="入站类型" value={typeFilter} onValueChange={value => updateSearchParam("type", value, "package")} id="inbound-type-filter" className="w-full" options={[{ value: "package", label: "套餐节点" }, { value: "custom", label: "定制节点" }, { value: "all", label: "全部类型" }]} />
        <Select label="节点" value={nodeFilter} onValueChange={value => updateSearchParam("node", value)} id="inbound-node-filter" className="w-full" options={[{ value: "all", label: "全部节点" }, ...nodeOptions.map(option => ({ value: option.value, label: option.label }))]} />
        <Select label="网络级别" value={levelFilter} onValueChange={value => updateSearchParam("level", value)} id="inbound-level-filter" className="w-full" options={[{ value: "all", label: "全部级别" }, ...networkLevels.map(level => ({ value: level.value, label: level.label })), { value: "unset", label: "未设置" }]} />
        <Select label="地区" value={regionFilter} onValueChange={value => updateSearchParam("region", value)} id="inbound-region-filter" className="w-full" options={[{ value: "all", label: "全部地区" }, ...regionOptions.map(region => ({ value: region, label: region })), { value: "unset", label: "未设置" }]} />
        <Select label="V2 权限组" value={planFilter} onValueChange={value => updateSearchParam("plan", value)} id="inbound-plan-filter" className="w-full" options={[{ value: "all", label: "全部权限组" }, ...lineGroups.map(group => ({ value: group.id, label: group.name })), { value: "unassigned", label: "未分配" }]} />
        <Select label="状态" value={statusFilter} onValueChange={value => updateSearchParam("status", value)} id="inbound-status-filter" className="w-full" options={[{ value: "all", label: "全部状态" }, { value: "enabled", label: "启用" }, { value: "disabled", label: "停用" }]} />
      </>}><DataTable columns={columns} data={sortedInbounds} searchKey="inbound" initialSearchValue={searchQuery} onSearchChange={value => updateSearchParam("q", value, "")} searchPlaceholder="搜索节点、入站、地区或协议" emptyTitle="暂无入站" emptyDescription="没有符合当前筛选条件的入站" pageSize={30} frame="card" columnLayout="content" renderMobileItem={renderMobileInbound} toolbar={<ActionButton variant="secondary" size="sm" onClick={() => void refresh(true)} disabled={loading || saving} label="刷新" pending={loading} />} /></DataTableCard>

      <Dialog open={groupOpen} onOpenChange={open => { if (!saving) setGroupOpen(open) }}>
        <DialogContent title={groupOriginal ? `编辑 ${groupOriginal.name}` : "新建 V2 权限组"} description="设置权限组信息和可用入站；定制节点不参与套餐分组。" size="full" className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] overflow-hidden"><div className="grid gap-3 sm:grid-cols-4">
            <Input label="权限组 ID" id="line-group-id" value={groupDraft.id} disabled={Boolean(groupOriginal)} onChange={event => setGroupDraft(current => ({ ...current, id: event.target.value.toLowerCase() }))} placeholder="pro" />
            <Input label="名称" id="line-group-name" value={groupDraft.name} onChange={event => setGroupDraft(current => ({ ...current, name: event.target.value }))} placeholder="PRO" />
            <NumberField label="排序" id="line-group-order" value={groupDraft.sortOrder} onValueChange={next => setGroupDraft(current => ({ ...current, sortOrder: next }))} locale="zh-CN" min={0} />
            <Field orientation="horizontal" className="justify-between"><FieldContent><FieldLabel htmlFor="line-group-enabled">启用权限组</FieldLabel><FieldDescription>可供 V2 商品选择</FieldDescription></FieldContent><Switch id="line-group-enabled" checked={groupDraft.isEnabled} onCheckedChange={isEnabled => setGroupDraft(current => ({ ...current, isEnabled }))} /></Field>
          </div><div className="grid gap-3 sm:grid-cols-2">
            <Input label="搜索入站" id="group-inbound-search" value={groupSearch} onChange={event => setGroupSearch(event.target.value)} placeholder="节点、入站、地区或协议" />
            <Select label="节点" value={groupNodeFilter} onValueChange={setGroupNodeFilter} id="group-node-filter" className="w-full" options={[{ value: "all", label: "全部节点" }, ...nodeOptions.map(option => ({ value: option.value, label: option.label }))]} />
          </div><div className="grid min-h-0 gap-3 overflow-auto sm:grid-cols-2 sm:overflow-hidden">
            <div className="min-h-0 overflow-auto rounded-md border">
              <div className="border-b px-4 py-3"><h3 className="font-semibold">可用入站 ({availableInbounds.length})</h3></div>
                <SimpleTable<XuiInbound> caption="入站列表" columns={["入站", "线路", "操作"]} rows={availableInbounds} rowKey={(inbound) => inbound.key} cells={(inbound) => [<div className="grid"><span className="flex flex-wrap items-center gap-2 font-medium">{inbound.name}{inbound.enabled ? null : <Badge>停用</Badge>}</span><span className="text-xs text-muted-foreground">{inbound.nodeName}{inbound.tag ? ` · ${inbound.tag}` : ""}</span></div>, <>{inbound.protocol.toUpperCase()} / {inbound.port ?? "-"}</>, <span className="text-right"><Button variant="danger" size="icon" onClick={() => setGroupInboundAvailability(inbound.key, false)} aria-label={`剔除 ${inbound.name}`} title={`剔除 ${inbound.name}`}><CircleMinus /></Button></span>]} emptyMessage="没有符合筛选条件的可用入站" />
            </div>
            <div className="min-h-0 overflow-auto rounded-md border">
              <div className="border-b px-4 py-3"><h3 className="font-semibold">不可用入站 ({unavailableInbounds.length})</h3></div>
                <SimpleTable<XuiInbound> caption="入站列表" columns={["入站", "线路", "操作"]} rows={unavailableInbounds} rowKey={(inbound) => inbound.key} cells={(inbound) => [<div className="grid"><span className="flex flex-wrap items-center gap-2 font-medium">{inbound.name}{inbound.enabled ? null : <Badge>停用</Badge>}</span><span className="text-xs text-muted-foreground">{inbound.nodeName}{inbound.tag ? ` · ${inbound.tag}` : ""}</span></div>, <>{inbound.protocol.toUpperCase()} / {inbound.port ?? "-"}</>, <span className="text-right"><Button variant="success" size="icon" className="bg-emerald-600/10 text-emerald-600 hover:bg-emerald-600/20 focus-visible:ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-400 dark:hover:bg-emerald-400/20 dark:focus-visible:ring-emerald-400/40" onClick={() => setGroupInboundAvailability(inbound.key, true)} aria-label={`新增 ${inbound.name}`} title={`新增 ${inbound.name}`}><CirclePlus /></Button></span>]} emptyMessage="没有符合筛选条件的不可用入站" />
            </div>
          </div><div className="grid gap-4">
            {groupSaveSteps ? <StepProgress steps={groupSaveSteps} label="保存权限组进度" /> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">{groupOriginal ? <Button variant="danger" onClick={() => void removeGroup()} disabled={saving}><Trash2 />删除权限组</Button> : null}<Button variant="secondary" onClick={() => setGroupOpen(false)} disabled={saving}>取消</Button><ActionButton onClick={() => void saveGroupSettings()} disabled={saving || !groupSettingsChanged} label="保存权限组" pending={saving} /></div>
          </div></DialogContent>
      </Dialog>

      <Drawer open={Boolean(editingInbound)} onOpenChange={open => { if (!open && !saving) setEditingKey("") }}>
        <DrawerContent title="编辑入站" description={editingInbound ? `${editingInbound.nodeName} · ${editingInbound.name}` : ""} className="xui-inbound-sheet inset-y-4 right-4 h-auto w-[calc(100%-2rem)] rounded-lg border sm:max-w-lg"><div className="grid flex-1 content-start gap-6 overflow-y-auto px-4">
            <Field orientation="horizontal" className="justify-between"><FieldContent><FieldLabel htmlFor="inbound-enabled">入站状态</FieldLabel><FieldDescription>保存后在 3x-ui 中启用或停用该入站。</FieldDescription></FieldContent><Switch id="inbound-enabled" checked={draft.enabled} onCheckedChange={enabled => setDraft(current => ({ ...current, enabled }))} disabled={saving} /></Field>
            <Select label="入站类型" description="定制节点只能由管理员单独授权，不参与套餐分组的客户端批量分配。" value={draft.inboundType} onValueChange={(value: "package" | "custom") => setDraft(current => ({ ...current, inboundType: value }))} id="inbound-type" className="w-full" options={[{ value: "package", label: "套餐节点" }, { value: "custom", label: "定制节点" }]} />
            <Select label="网络级别" value={draft.networkLevel || "unset"} onValueChange={value => setDraft(current => ({ ...current, networkLevel: value === "unset" ? "" : value }))} className="w-full" options={[{ value: "unset", label: "未设置" }, ...networkLevels.map(level => ({ value: level.value, label: level.label }))]} />
            <Input label="地区" id="inbound-region" value={draft.region} onChange={event => setDraft(current => ({ ...current, region: event.target.value }))} placeholder="例如：香港、美国、台湾" maxLength={64} />
          </div><div className="mt-6 flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setEditingKey("")} disabled={saving}>取消</Button><ActionButton onClick={() => void saveEditor()} disabled={saving || !editorChanged} label="保存设置" pending={saving} /></div></DrawerContent>
      </Drawer>
    </div>
  )
}
