import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useSearchParams } from "react-router-dom"
import { CircleMinus, CirclePlus, Loader2, Pencil, Plus, RefreshCw, Save, Server, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { deleteJson, fetchJson, postJson, putJson } from "@/api"
import { DataTable, DataTableColumnHeader, DataTableRowActions } from "@/components/features/data-table"
import { DataTableCard } from "@/components/features/data-table-card"
import { PageHeader } from "@/components/features/shared"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { CatalogV2LineGroup, XuiInboundManagement, XuiInboundMetadata } from "@/types"

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

function InboundProbeBadge({ inbound }: { inbound: XuiInbound }) {
  const online = inbound.probeStatus === "online"
  const label = online ? `正常 · ${inbound.probeLatencyMs ?? 0} ms` : inbound.probeStatus === "offline" ? "异常" : inbound.probeStatus === "disabled" ? "未检测" : "未知"
  return <Badge variant={online ? "success" : inbound.probeStatus === "offline" ? "destructive" : "secondary"} title={inbound.probeError || `检测时间：${inbound.probeCheckedAt}`}>{label}</Badge>
}

export function XuiInboundsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = React.useState<XuiInboundManagement | null>(null)
  const [lineGroups, setLineGroups] = React.useState<CatalogV2LineGroup[]>([])
  const [metadata, setMetadata] = React.useState<XuiInboundMetadata>({})
  const [editingKey, setEditingKey] = React.useState("")
  const [draft, setDraft] = React.useState<InboundDraft>({ enabled: true, networkLevel: "", region: "", inboundType: "package" })
  const [groupOpen, setGroupOpen] = React.useState(false)
  const [groupDraft, setGroupDraft] = React.useState<CatalogV2LineGroup>(emptyLineGroup)
  const [groupOriginal, setGroupOriginal] = React.useState<CatalogV2LineGroup | null>(null)
  const [groupSearch, setGroupSearch] = React.useState("")
  const [groupNodeFilter, setGroupNodeFilter] = React.useState("all")
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

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const [result, groups] = await Promise.all([
        fetchJson<XuiInboundManagement>("/api/xui-inbounds"),
        fetchJson<CatalogV2LineGroup[]>("/api/catalog-v2/line-groups"),
      ])
      setData(result)
      setLineGroups(groups)
      setMetadata(result.metadata || {})
      setError("")
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "无法读取 3x-ui 入站")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const refreshIfVisible = () => { if (!document.hidden) void refresh() }
    const onVisibilityChange = () => { if (!document.hidden) refreshIfVisible() }
    refreshIfVisible()
    const timer = window.setInterval(refreshIfVisible, 120_000)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [refresh])

  const openEditor = React.useCallback((inbound: XuiInbound) => {
    const item = metadata[inbound.key]
    setDraft({
      enabled: inbound.enabled,
      networkLevel: item?.networkLevel || "",
      region: item?.region || "",
      inboundType: item?.inboundType || inbound.inboundType || "package",
    })
    setEditingKey(inbound.key)
  }, [metadata])

  async function saveEditor() {
    const inbound = data?.inbounds.find(item => item.key === editingKey)
    if (!inbound) return
    const nextMetadata = { ...metadata, [inbound.key]: { ...metadata[inbound.key], networkLevel: draft.networkLevel as XuiInboundMetadata[string]["networkLevel"], region: draft.region, inboundType: draft.inboundType } }
    const statusChanged = draft.enabled !== inbound.enabled
    setSaving(true)
    try {
      const result = await putJson<{ metadata: XuiInboundMetadata }>("/api/xui-inbound-groups", { metadata: nextMetadata, syncGroups: false })
      if (statusChanged) await postJson(`/api/xui-inbounds/${inbound.id}/set-enable`, { enable: draft.enabled })
      setMetadata(result.metadata)
      setData(current => current ? { ...current, metadata: result.metadata, inbounds: current.inbounds.map(item => item.key === inbound.key ? { ...item, enabled: draft.enabled, networkLevel: nextMetadata[inbound.key].networkLevel, region: nextMetadata[inbound.key].region, inboundType: draft.inboundType } : item) } : current)
      if (draft.inboundType === "custom") {
        const affected = lineGroups.filter(group => group.inboundKeys.includes(inbound.key))
        const updated = await Promise.all(affected.map(group => putJson<CatalogV2LineGroup>(`/api/catalog-v2/line-groups/${encodeURIComponent(group.id)}`, { ...group, inboundKeys: group.inboundKeys.filter(key => key !== inbound.key) })))
        if (updated.length) setLineGroups(current => current.map(group => updated.find(item => item.id === group.id) || group))
      }
      setEditingKey("")
      toast.success("入站设置已保存")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "保存失败")
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
    const item = metadata[editingInbound.key]
    return draft.enabled !== editingInbound.enabled
      || draft.networkLevel !== (item?.networkLevel || "")
      || draft.region !== (item?.region || "")
      || draft.inboundType !== (item?.inboundType || editingInbound.inboundType || "package")
  }, [draft, editingInbound, metadata])

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
    try {
      const result = groupOriginal
        ? await putJson<CatalogV2LineGroup>(`/api/catalog-v2/line-groups/${encodeURIComponent(groupOriginal.id)}`, groupDraft)
        : await postJson<CatalogV2LineGroup>("/api/catalog-v2/line-groups", groupDraft)
      setLineGroups(current => groupOriginal
        ? current.map(group => group.id === result.id ? { ...result, productCount: group.productCount } : group).toSorted((left, right) => left.sortOrder - right.sortOrder)
        : [...current, { ...result, productCount: 0 }].toSorted((left, right) => left.sortOrder - right.sortOrder))
      setGroupOpen(false)
      toast.success("V2 权限组已保存")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "保存失败")
    } finally {
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
      toast.success("V2 权限组已删除")
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : "删除失败")
    } finally {
      setSaving(false)
    }
  }

  const renderMobileInbound = React.useCallback((inbound: XuiInbound) => {
    const level = networkLevels.find(item => item.value === inbound.networkLevel)?.label || "未设置"
    const availableGroups = lineGroups.filter(group => group.inboundKeys.includes(inbound.key)).map(group => group.name).join(" / ") || "未分配"
    return <Item variant="outline"><ItemContent><ItemTitle className="flex w-full flex-wrap items-center gap-2"><span className="min-w-0 truncate">{inbound.name}</span><Badge variant="outline">{inbound.inboundType === "custom" ? "定制节点" : "套餐节点"}</Badge><Badge variant={inbound.enabled ? "success" : "secondary"}>{inbound.enabled ? "启用" : "停用"}</Badge><InboundProbeBadge inbound={inbound} /></ItemTitle><ItemDescription>{inbound.nodeName} · {level} · {inbound.region || "未设置"}</ItemDescription><ItemDescription>{inbound.inboundType === "custom" ? "不参与套餐分组" : availableGroups} · {inbound.protocol.toUpperCase()} / {inbound.port ?? "-"} · {inbound.recentlyActive === null ? "连接活动未知" : inbound.recentlyActive ? "近期活跃" : "近期无流量"}</ItemDescription></ItemContent><ItemActions><Button variant="ghost" size="icon" onClick={() => openEditor(inbound)} aria-label={`编辑 ${inbound.name}`}><Pencil /></Button></ItemActions></Item>
  }, [lineGroups, openEditor])

  const columns = React.useMemo<ColumnDef<XuiInbound>[]>(() => [
    { id: "inbound", accessorFn: inbound => `${inbound.name} ${inbound.tag} ${inbound.nodeName} ${inbound.region} ${inbound.protocol} ${networkLevels.find(item => item.value === inbound.networkLevel)?.label || ""}`, header: DataTableColumnHeader({ title: "入站" }), meta: { label: "入站" }, cell: ({ row }) => <div className="grid min-w-0"><span className="truncate font-medium">{row.original.name}</span>{row.original.tag ? <span className="truncate text-xs text-muted-foreground">{row.original.tag}</span> : null}</div> },
    { accessorKey: "inboundType", header: DataTableColumnHeader({ title: "入站类型" }), meta: { label: "入站类型" }, cell: ({ row }) => <Badge variant="outline">{row.original.inboundType === "custom" ? "定制节点" : "套餐节点"}</Badge> },
    { id: "status", accessorFn: inbound => `${inbound.enabled ? "启用" : "停用"} ${inbound.probeStatus} ${inbound.probeLatencyMs ?? ""} ${inbound.recentlyActive === null ? "状态未知" : inbound.recentlyActive ? "近期活跃" : "近期无流量"}`, header: DataTableColumnHeader({ title: "状态 / 延迟" }), meta: { label: "状态 / 延迟" }, cell: ({ row }) => <div className="grid justify-items-start gap-1"><Badge variant={row.original.enabled ? "success" : "secondary"}>{row.original.enabled ? "启用" : "停用"}</Badge><InboundProbeBadge inbound={row.original} /><span className="text-xs text-muted-foreground">{row.original.recentlyActive === null ? "连接活动未知" : row.original.recentlyActive ? "近期活跃" : "近期无流量"}</span></div> },
    { accessorKey: "clientCount", header: DataTableColumnHeader({ title: "客户端" }), meta: { label: "客户端" }, cell: ({ row }) => <span className="tabular-nums">{row.original.clientCount}</span> },
    { accessorKey: "networkLevel", header: DataTableColumnHeader({ title: "网络级别" }), meta: { label: "网络级别" }, cell: ({ row }) => { const label = networkLevels.find(item => item.value === row.original.networkLevel)?.label; return label ? <Badge variant="outline">{label}</Badge> : <span className="text-muted-foreground">未设置</span> } },
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

  if (loading && !data) return <div className="grid gap-4 px-4 lg:px-6"><Skeleton className="h-20" /><Skeleton className="h-96" /></div>
  if (!data?.configured) return <div className="px-4 lg:px-6"><Alert><Server /><AlertDescription>尚未配置 3x-ui，无法管理入站。</AlertDescription></Alert></div>

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <PageHeader title="入站管理" description="按单个入站维护线路属性；流量倍率在节点监控的节点设置中统一维护。" />
      {error ? <Alert variant="destructive"><Server /><AlertDescription>{error}</AlertDescription></Alert> : null}

      <section className="grid gap-3" aria-labelledby="v2-line-groups-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="v2-line-groups-title" className="font-semibold">V2 线路权限组</h2><p className="text-sm text-muted-foreground">V2 商品使用的入站权限；旧套餐分组不在此页面显示。</p></div>
          <Button onClick={() => openGroupSettings()}><Plus />新建权限组</Button>
        </div>
        {lineGroups.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{lineGroups.map(group => <Card key={group.id}>
          <CardHeader className="gap-2"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><CardTitle className="truncate">{group.name}</CardTitle><CardDescription className="truncate">{group.id}</CardDescription></div>{group.isEnabled ? <Badge variant="success">启用</Badge> : <Badge variant="secondary">停用</Badge>}</div></CardHeader>
          <CardContent className="flex items-end justify-between gap-3"><div className="text-sm text-muted-foreground"><span className="tabular-nums">{group.inboundKeys.length}</span> 个入站 · <span className="tabular-nums">{group.productCount || 0}</span> 个商品</div><Button variant="outline" size="sm" onClick={() => openGroupSettings(group)}><Pencil />编辑</Button></CardContent>
        </Card>)}</div> : <Card><CardHeader><CardTitle>尚未创建 V2 权限组</CardTitle><CardDescription>新建权限组后即可为 V2 套餐选择可用入站。</CardDescription></CardHeader></Card>}
      </section>

      <DataTableCard filters={<>
        <Field><FieldLabel htmlFor="inbound-type-filter">入站类型</FieldLabel><Select value={typeFilter} onValueChange={value => updateSearchParam("type", value, "package")}><SelectTrigger id="inbound-type-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="package">套餐节点</SelectItem><SelectItem value="custom">定制节点</SelectItem><SelectItem value="all">全部类型</SelectItem></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="inbound-node-filter">节点</FieldLabel><Select value={nodeFilter} onValueChange={value => updateSearchParam("node", value)}><SelectTrigger id="inbound-node-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部节点</SelectItem>{nodeOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="inbound-level-filter">网络级别</FieldLabel><Select value={levelFilter} onValueChange={value => updateSearchParam("level", value)}><SelectTrigger id="inbound-level-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部级别</SelectItem>{networkLevels.map(level => <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>)}<SelectItem value="unset">未设置</SelectItem></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="inbound-region-filter">地区</FieldLabel><Select value={regionFilter} onValueChange={value => updateSearchParam("region", value)}><SelectTrigger id="inbound-region-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部地区</SelectItem>{regionOptions.map(region => <SelectItem key={region} value={region}>{region}</SelectItem>)}<SelectItem value="unset">未设置</SelectItem></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="inbound-plan-filter">V2 权限组</FieldLabel><Select value={planFilter} onValueChange={value => updateSearchParam("plan", value)}><SelectTrigger id="inbound-plan-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部权限组</SelectItem>{lineGroups.map(group => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}<SelectItem value="unassigned">未分配</SelectItem></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="inbound-status-filter">状态</FieldLabel><Select value={statusFilter} onValueChange={value => updateSearchParam("status", value)}><SelectTrigger id="inbound-status-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectContent></Select></Field>
      </>}><DataTable columns={columns} data={sortedInbounds} searchKey="inbound" initialSearchValue={searchQuery} onSearchChange={value => updateSearchParam("q", value, "")} searchPlaceholder="搜索节点、入站、地区或协议" emptyTitle="暂无入站" emptyDescription="没有符合当前筛选条件的入站" pageSize={30} frame="card" columnLayout="content" renderMobileItem={renderMobileInbound} toolbar={<Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading || saving}>{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}刷新</Button>} /></DataTableCard>

      <Dialog open={groupOpen} onOpenChange={open => { if (!saving) setGroupOpen(open) }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-6xl">
          <DialogHeader><DialogTitle>{groupOriginal ? `编辑 ${groupOriginal.name}` : "新建 V2 权限组"}</DialogTitle><DialogDescription>设置权限组信息和可用入站；定制节点不参与套餐分组。</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field><FieldLabel htmlFor="line-group-id">权限组 ID</FieldLabel><Input id="line-group-id" value={groupDraft.id} disabled={Boolean(groupOriginal)} onChange={event => setGroupDraft(current => ({ ...current, id: event.target.value.toLowerCase() }))} placeholder="pro" /></Field>
            <Field><FieldLabel htmlFor="line-group-name">名称</FieldLabel><Input id="line-group-name" value={groupDraft.name} onChange={event => setGroupDraft(current => ({ ...current, name: event.target.value }))} placeholder="PRO" /></Field>
            <Field><FieldLabel htmlFor="line-group-order">排序</FieldLabel><Input id="line-group-order" type="number" min="0" value={groupDraft.sortOrder} onChange={event => setGroupDraft(current => ({ ...current, sortOrder: Number(event.target.value) }))} /></Field>
            <Field orientation="horizontal" className="justify-between"><FieldContent><FieldLabel htmlFor="line-group-enabled">启用权限组</FieldLabel><FieldDescription>可供 V2 商品选择</FieldDescription></FieldContent><Switch id="line-group-enabled" checked={groupDraft.isEnabled} onCheckedChange={isEnabled => setGroupDraft(current => ({ ...current, isEnabled }))} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="group-inbound-search">搜索入站</FieldLabel><Input id="group-inbound-search" value={groupSearch} onChange={event => setGroupSearch(event.target.value)} placeholder="节点、入站、地区或协议" /></Field>
            <Field><FieldLabel htmlFor="group-node-filter">节点</FieldLabel><Select value={groupNodeFilter} onValueChange={setGroupNodeFilter}><SelectTrigger id="group-node-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部节点</SelectItem>{nodeOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></Field>
          </div>
          <div className="grid min-h-0 gap-3 overflow-auto sm:grid-cols-2 sm:overflow-hidden">
            <div className="min-h-0 overflow-auto rounded-md border">
              <div className="border-b px-4 py-3"><h3 className="font-semibold">可用入站 ({availableInbounds.length})</h3></div>
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background"><TableRow><TableHead>入站</TableHead><TableHead>线路</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
                  <TableBody>{availableInbounds.length ? availableInbounds.map(inbound => <TableRow key={inbound.key}><TableCell><div className="grid"><span className="flex flex-wrap items-center gap-2 font-medium">{inbound.name}{inbound.enabled ? null : <Badge variant="secondary">停用</Badge>}</span><span className="text-xs text-muted-foreground">{inbound.nodeName}{inbound.tag ? ` · ${inbound.tag}` : ""}</span></div></TableCell><TableCell>{inbound.protocol.toUpperCase()} / {inbound.port ?? "-"}</TableCell><TableCell className="text-right"><Button variant="destructive" size="icon" onClick={() => setGroupInboundAvailability(inbound.key, false)} aria-label={`剔除 ${inbound.name}`} title={`剔除 ${inbound.name}`}><CircleMinus /></Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">没有符合筛选条件的可用入站</TableCell></TableRow>}</TableBody>
                </Table>
            </div>
            <div className="min-h-0 overflow-auto rounded-md border">
              <div className="border-b px-4 py-3"><h3 className="font-semibold">不可用入站 ({unavailableInbounds.length})</h3></div>
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background"><TableRow><TableHead>入站</TableHead><TableHead>线路</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
                  <TableBody>{unavailableInbounds.length ? unavailableInbounds.map(inbound => <TableRow key={inbound.key}><TableCell><div className="grid"><span className="flex flex-wrap items-center gap-2 font-medium">{inbound.name}{inbound.enabled ? null : <Badge variant="secondary">停用</Badge>}</span><span className="text-xs text-muted-foreground">{inbound.nodeName}{inbound.tag ? ` · ${inbound.tag}` : ""}</span></div></TableCell><TableCell>{inbound.protocol.toUpperCase()} / {inbound.port ?? "-"}</TableCell><TableCell className="text-right"><Button variant="success" size="icon" className="bg-emerald-600/10 text-emerald-600 hover:bg-emerald-600/20 focus-visible:ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-400 dark:hover:bg-emerald-400/20 dark:focus-visible:ring-emerald-400/40" onClick={() => setGroupInboundAvailability(inbound.key, true)} aria-label={`新增 ${inbound.name}`} title={`新增 ${inbound.name}`}><CirclePlus /></Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">没有符合筛选条件的不可用入站</TableCell></TableRow>}</TableBody>
                </Table>
            </div>
          </div>
          <DialogFooter>{groupOriginal ? <Button variant="destructive" onClick={() => void removeGroup()} disabled={saving}><Trash2 />删除权限组</Button> : null}<Button variant="outline" onClick={() => setGroupOpen(false)} disabled={saving}>取消</Button><Button onClick={() => void saveGroupSettings()} disabled={saving || !groupSettingsChanged}>{saving ? <Loader2 className="animate-spin" /> : <Save />}保存权限组</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(editingInbound)} onOpenChange={open => { if (!open && !saving) setEditingKey("") }}>
        <SheetContent className="xui-inbound-sheet inset-y-4 right-4 h-auto w-[calc(100%-2rem)] rounded-lg border sm:max-w-lg">
          <SheetHeader><SheetTitle>编辑入站</SheetTitle><SheetDescription>{editingInbound ? `${editingInbound.nodeName} · ${editingInbound.name}` : ""}</SheetDescription></SheetHeader>
          <div className="grid flex-1 content-start gap-6 overflow-y-auto px-4">
            <Field orientation="horizontal" className="justify-between"><FieldContent><FieldLabel htmlFor="inbound-enabled">入站状态</FieldLabel><FieldDescription>保存后在 3x-ui 中启用或停用该入站。</FieldDescription></FieldContent><Switch id="inbound-enabled" checked={draft.enabled} onCheckedChange={enabled => setDraft(current => ({ ...current, enabled }))} disabled={saving} /></Field>
            <Field><FieldLabel htmlFor="inbound-type">入站类型</FieldLabel><Select value={draft.inboundType} onValueChange={(value: "package" | "custom") => setDraft(current => ({ ...current, inboundType: value }))}><SelectTrigger id="inbound-type" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="package">套餐节点</SelectItem><SelectItem value="custom">定制节点</SelectItem></SelectContent></Select><FieldDescription>定制节点只能由管理员单独授权，不参与套餐分组的客户端批量分配。</FieldDescription></Field>
            <Field><FieldLabel>网络级别</FieldLabel><Select value={draft.networkLevel || "unset"} onValueChange={value => setDraft(current => ({ ...current, networkLevel: value === "unset" ? "" : value }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unset">未设置</SelectItem>{networkLevels.map(level => <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>)}</SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="inbound-region">地区</FieldLabel><Input id="inbound-region" value={draft.region} onChange={event => setDraft(current => ({ ...current, region: event.target.value }))} placeholder="例如：香港、美国、台湾" maxLength={64} /></Field>
          </div>
          <SheetFooter><Button variant="outline" onClick={() => setEditingKey("")} disabled={saving}>取消</Button><Button onClick={() => void saveEditor()} disabled={saving || !editorChanged}>{saving ? <Loader2 className="animate-spin" /> : <Save />}保存设置</Button></SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
