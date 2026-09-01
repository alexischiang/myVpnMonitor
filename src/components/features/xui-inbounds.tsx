import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useSearchParams } from "react-router-dom"
import { CircleMinus, CirclePlus, Loader2, Pencil, RefreshCw, Save, Server, Settings2 } from "lucide-react"
import { toast } from "sonner"

import { fetchJson, postJson, putJson } from "@/api"
import { DataTable, DataTableColumnHeader, DataTableRowActions } from "@/components/features/data-table"
import { DataTableCard } from "@/components/features/data-table-card"
import { PageHeader } from "@/components/features/shared"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { XuiInboundGroups, XuiInboundManagement, XuiInboundMetadata } from "@/types"

const planGroups = ["basic", "pro", "ultra"]
const planLabels: Record<string, string> = { basic: "BASIC", pro: "PRO", ultra: "ULTRA" }
const networkLevels = [
  { value: "premium", label: "精品线路" },
  { value: "optimized", label: "优化线路" },
  { value: "standard", label: "普通线路" },
] as const

type InboundDraft = {
  enabled: boolean
  networkLevel: string
  region: string
}

type XuiInbound = XuiInboundManagement["inbounds"][number]

function InboundProbeBadge({ inbound }: { inbound: XuiInbound }) {
  const online = inbound.probeStatus === "online"
  const label = online ? `正常 · ${inbound.probeLatencyMs ?? 0} ms` : inbound.probeStatus === "offline" ? "异常" : inbound.probeStatus === "disabled" ? "未检测" : "未知"
  return <Badge variant={online ? "success" : inbound.probeStatus === "offline" ? "destructive" : "secondary"} title={inbound.probeError || `检测时间：${inbound.probeCheckedAt}`}>{label}</Badge>
}

export function XuiInboundsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = React.useState<XuiInboundManagement | null>(null)
  const [groups, setGroups] = React.useState<XuiInboundGroups>({})
  const [metadata, setMetadata] = React.useState<XuiInboundMetadata>({})
  const [editingKey, setEditingKey] = React.useState("")
  const [draft, setDraft] = React.useState<InboundDraft>({ enabled: true, networkLevel: "", region: "" })
  const [groupOpen, setGroupOpen] = React.useState(false)
  const [selectedGroup, setSelectedGroup] = React.useState(planGroups[0])
  const [draftGroups, setDraftGroups] = React.useState<XuiInboundGroups>({})
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
  const searchQuery = searchParams.get("q") || ""

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
      const result = await fetchJson<XuiInboundManagement>("/api/xui-inbounds")
      setData(result)
      setGroups(result.groups)
      setMetadata(result.metadata || {})
      setError("")
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "无法读取 3x-ui 入站")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
    const timer = window.setInterval(refresh, 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const openEditor = React.useCallback((inbound: XuiInbound) => {
    const item = metadata[inbound.key]
    setDraft({
      enabled: inbound.enabled,
      networkLevel: item?.networkLevel || "",
      region: item?.region || "",
    })
    setEditingKey(inbound.key)
  }, [metadata])

  async function saveEditor() {
    const inbound = data?.inbounds.find(item => item.key === editingKey)
    if (!inbound) return
    const nextMetadata = { ...metadata, [inbound.key]: { ...metadata[inbound.key], networkLevel: draft.networkLevel as XuiInboundMetadata[string]["networkLevel"], region: draft.region } }
    const statusChanged = draft.enabled !== inbound.enabled
    setSaving(true)
    try {
      const result = await putJson<{ groups: XuiInboundGroups; metadata: XuiInboundMetadata }>("/api/xui-inbound-groups", { groups, metadata: nextMetadata, syncGroups: false })
      if (statusChanged) await postJson(`/api/xui-inbounds/${inbound.id}/set-enable`, { enable: draft.enabled })
      setGroups(result.groups)
      setMetadata(result.metadata)
      setData(current => current ? { ...current, groups: result.groups, metadata: result.metadata, inbounds: current.inbounds.map(item => item.key === inbound.key ? { ...item, enabled: draft.enabled, networkLevel: nextMetadata[inbound.key].networkLevel, region: nextMetadata[inbound.key].region } : item) } : current)
      setEditingKey("")
      toast.success("入站设置已保存")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "保存失败")
      if (statusChanged) void refresh()
    } finally {
      setSaving(false)
    }
  }

  function openGroupSettings() {
    setDraftGroups(Object.fromEntries(planGroups.map(group => [group, [...(groups[group] || [])]])))
    setSelectedGroup(planGroups[0])
    setGroupSearch("")
    setGroupNodeFilter("all")
    setGroupOpen(true)
  }

  function setGroupInboundAvailability(inboundId: number, available: boolean) {
    setDraftGroups(current => {
      const ids = current[selectedGroup] || []
      return { ...current, [selectedGroup]: available ? [...new Set([...ids, inboundId])] : ids.filter(id => id !== inboundId) }
    })
  }

  async function saveGroupSettings() {
    setSaving(true)
    try {
      const result = await putJson<{ groups: XuiInboundGroups; metadata: XuiInboundMetadata; synced: Array<{ users: number }> }>("/api/xui-inbound-groups", { groups: draftGroups, metadata, syncGroups: true })
      setGroups(result.groups)
      setMetadata(result.metadata)
      setData(current => current ? { ...current, groups: result.groups, metadata: result.metadata } : current)
      setGroupOpen(false)
      const users = result.synced.reduce((sum, item) => sum + item.users, 0)
      toast.success(users ? `套餐分组已保存，并同步 ${users} 个用户` : "套餐分组已保存")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  const renderMobileInbound = React.useCallback((inbound: XuiInbound) => {
    const level = networkLevels.find(item => item.value === inbound.networkLevel)?.label || "未设置"
    const availableGroups = planGroups.filter(group => (groups[group] || []).includes(inbound.id)).map(group => planLabels[group]).join(" / ") || "未分配"
    return <Item variant="outline"><ItemContent><ItemTitle className="flex w-full flex-wrap items-center gap-2"><span className="min-w-0 truncate">{inbound.name}</span><Badge variant={inbound.enabled ? "success" : "secondary"}>{inbound.enabled ? "启用" : "停用"}</Badge><InboundProbeBadge inbound={inbound} /></ItemTitle><ItemDescription>{inbound.nodeName} · {level} · {inbound.region || "未设置"}</ItemDescription><ItemDescription>{availableGroups} · {inbound.protocol.toUpperCase()} / {inbound.port ?? "-"} · {inbound.recentlyActive === null ? "连接活动未知" : inbound.recentlyActive ? "近期活跃" : "近期无流量"}</ItemDescription></ItemContent><ItemActions><Button variant="ghost" size="icon" onClick={() => openEditor(inbound)} aria-label={`编辑 ${inbound.name}`}><Pencil /></Button></ItemActions></Item>
  }, [groups, openEditor])

  const columns = React.useMemo<ColumnDef<XuiInbound>[]>(() => [
    { id: "inbound", accessorFn: inbound => `${inbound.name} ${inbound.tag} ${inbound.nodeName} ${inbound.region} ${inbound.protocol} ${networkLevels.find(item => item.value === inbound.networkLevel)?.label || ""}`, header: DataTableColumnHeader({ title: "入站" }), meta: { label: "入站" }, cell: ({ row }) => <div className="grid min-w-0"><span className="truncate font-medium">{row.original.name}</span>{row.original.tag ? <span className="truncate text-xs text-muted-foreground">{row.original.tag}</span> : null}</div> },
    { id: "status", accessorFn: inbound => `${inbound.enabled ? "启用" : "停用"} ${inbound.probeStatus} ${inbound.probeLatencyMs ?? ""} ${inbound.recentlyActive === null ? "状态未知" : inbound.recentlyActive ? "近期活跃" : "近期无流量"}`, header: DataTableColumnHeader({ title: "状态 / 延迟" }), meta: { label: "状态 / 延迟" }, cell: ({ row }) => <div className="grid justify-items-start gap-1"><Badge variant={row.original.enabled ? "success" : "secondary"}>{row.original.enabled ? "启用" : "停用"}</Badge><InboundProbeBadge inbound={row.original} /><span className="text-xs text-muted-foreground">{row.original.recentlyActive === null ? "连接活动未知" : row.original.recentlyActive ? "近期活跃" : "近期无流量"}</span></div> },
    { accessorKey: "clientCount", header: DataTableColumnHeader({ title: "客户端" }), meta: { label: "客户端" }, cell: ({ row }) => <span className="tabular-nums">{row.original.clientCount}</span> },
    { accessorKey: "networkLevel", header: DataTableColumnHeader({ title: "网络级别" }), meta: { label: "网络级别" }, cell: ({ row }) => { const label = networkLevels.find(item => item.value === row.original.networkLevel)?.label; return label ? <Badge variant="outline">{label}</Badge> : <span className="text-muted-foreground">未设置</span> } },
    { accessorKey: "region", header: DataTableColumnHeader({ title: "地区" }), meta: { label: "地区" }, cell: ({ row }) => row.original.region || <span className="text-muted-foreground">未设置</span> },
    { accessorKey: "nodeName", header: DataTableColumnHeader({ title: "节点" }), meta: { label: "节点" }, cell: ({ row }) => <span className="font-medium">{row.original.nodeName}</span> },
    { id: "actions", header: "操作", cell: ({ row }) => <DataTableRowActions detail={<Button variant="ghost" size="icon" onClick={() => openEditor(row.original)} aria-label={`编辑 ${row.original.name}`}><Pencil /></Button>} />, enableHiding: false, enableSorting: false },
  ], [openEditor])

  const nodeOptions = React.useMemo(() => [...new Map((data?.inbounds || []).map(inbound => [inbound.nodeGuid, inbound.nodeName])).entries()].map(([value, label]) => ({ value, label })).toSorted((left, right) => left.label.localeCompare(right.label)), [data])
  const regionOptions = React.useMemo(() => [...new Set((data?.inbounds || []).map(inbound => inbound.region).filter(Boolean))].toSorted(), [data])
  const allInbounds = React.useMemo(() => (data?.inbounds || []).toSorted((left, right) => left.nodeName.localeCompare(right.nodeName) || left.name.localeCompare(right.name)), [data])
  const groupFilteredInbounds = React.useMemo(() => {
    const query = groupSearch.trim().toLocaleLowerCase()
    return allInbounds.filter(inbound => (groupNodeFilter === "all" || inbound.nodeGuid === groupNodeFilter) && (!query || `${inbound.nodeName} ${inbound.name} ${inbound.tag} ${inbound.region} ${inbound.protocol}`.toLocaleLowerCase().includes(query)))
  }, [allInbounds, groupNodeFilter, groupSearch])
  const selectedGroupIds = React.useMemo(() => new Set(draftGroups[selectedGroup] || []), [draftGroups, selectedGroup])
  const availableInbounds = groupFilteredInbounds.filter(inbound => selectedGroupIds.has(inbound.id))
  const unavailableInbounds = groupFilteredInbounds.filter(inbound => !selectedGroupIds.has(inbound.id))
  const sortedInbounds = React.useMemo(() => allInbounds.filter(inbound => {
    const availableGroups = planGroups.filter(group => (groups[group] || []).includes(inbound.id))
    return (nodeFilter === "all" || inbound.nodeGuid === nodeFilter)
      && (levelFilter === "all" || levelFilter === "unset" ? levelFilter === "all" || !inbound.networkLevel : inbound.networkLevel === levelFilter)
      && (regionFilter === "all" || regionFilter === "unset" ? regionFilter === "all" || !inbound.region : inbound.region === regionFilter)
      && (planFilter === "all" || planFilter === "unassigned" ? planFilter === "all" || !availableGroups.length : availableGroups.includes(planFilter))
      && (statusFilter === "all" || (statusFilter === "enabled") === inbound.enabled)
  }), [allInbounds, groups, levelFilter, nodeFilter, planFilter, regionFilter, statusFilter])

  if (loading && !data) return <div className="grid gap-4 px-4 lg:px-6"><Skeleton className="h-20" /><Skeleton className="h-96" /></div>
  if (!data?.configured) return <div className="px-4 lg:px-6"><Alert><Server /><AlertDescription>尚未配置 3x-ui，无法管理入站。</AlertDescription></Alert></div>

  const editingInbound = data.inbounds.find(inbound => inbound.key === editingKey)

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <PageHeader title="入站管理" description="按单个入站维护线路属性；流量倍率在节点监控的节点设置中统一维护。" />
      {error ? <Alert variant="destructive"><Server /><AlertDescription>{error}</AlertDescription></Alert> : null}

      <DataTableCard filters={<>
        <Field><FieldLabel htmlFor="inbound-node-filter">节点</FieldLabel><Select value={nodeFilter} onValueChange={value => updateSearchParam("node", value)}><SelectTrigger id="inbound-node-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部节点</SelectItem>{nodeOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="inbound-level-filter">网络级别</FieldLabel><Select value={levelFilter} onValueChange={value => updateSearchParam("level", value)}><SelectTrigger id="inbound-level-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部级别</SelectItem>{networkLevels.map(level => <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>)}<SelectItem value="unset">未设置</SelectItem></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="inbound-region-filter">地区</FieldLabel><Select value={regionFilter} onValueChange={value => updateSearchParam("region", value)}><SelectTrigger id="inbound-region-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部地区</SelectItem>{regionOptions.map(region => <SelectItem key={region} value={region}>{region}</SelectItem>)}<SelectItem value="unset">未设置</SelectItem></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="inbound-plan-filter">可用套餐</FieldLabel><Select value={planFilter} onValueChange={value => updateSearchParam("plan", value)}><SelectTrigger id="inbound-plan-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部套餐</SelectItem>{planGroups.map(group => <SelectItem key={group} value={group}>{planLabels[group]}</SelectItem>)}<SelectItem value="unassigned">未分配</SelectItem></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="inbound-status-filter">状态</FieldLabel><Select value={statusFilter} onValueChange={value => updateSearchParam("status", value)}><SelectTrigger id="inbound-status-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="enabled">启用</SelectItem><SelectItem value="disabled">停用</SelectItem></SelectContent></Select></Field>
      </>}><DataTable columns={columns} data={sortedInbounds} searchKey="inbound" initialSearchValue={searchQuery} onSearchChange={value => updateSearchParam("q", value, "")} searchPlaceholder="搜索节点、入站、地区或协议" emptyTitle="暂无入站" emptyDescription="没有符合当前筛选条件的入站" pageSize={30} frame="card" columnLayout="content" renderMobileItem={renderMobileInbound} toolbar={<div className="flex gap-2"><Button variant="outline" size="sm" onClick={openGroupSettings} disabled={saving}><Settings2 />套餐分组</Button><Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading || saving}>{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}刷新</Button></div>} /></DataTableCard>

      <Dialog open={groupOpen} onOpenChange={open => { if (!saving) setGroupOpen(open) }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-6xl">
          <DialogHeader><DialogTitle>套餐分组可用入站</DialogTitle><DialogDescription>选择套餐后设置其可用入站，保存后会同步对应套餐用户。</DialogDescription></DialogHeader>
          <Tabs value={selectedGroup} onValueChange={setSelectedGroup}>
            <TabsList className="max-w-full overflow-x-auto">{planGroups.map(group => <TabsTrigger key={group} value={group}>{planLabels[group]}<Badge variant="secondary">{(draftGroups[group] || []).length}</Badge></TabsTrigger>)}</TabsList>
          </Tabs>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="group-inbound-search">搜索入站</FieldLabel><Input id="group-inbound-search" value={groupSearch} onChange={event => setGroupSearch(event.target.value)} placeholder="节点、入站、地区或协议" /></Field>
            <Field><FieldLabel htmlFor="group-node-filter">节点</FieldLabel><Select value={groupNodeFilter} onValueChange={setGroupNodeFilter}><SelectTrigger id="group-node-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部节点</SelectItem>{nodeOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></Field>
          </div>
          <div className="grid min-h-0 gap-3 overflow-auto sm:grid-cols-2 sm:overflow-hidden">
            <div className="min-h-0 overflow-auto rounded-md border">
              <div className="border-b px-4 py-3"><h3 className="font-semibold">可用入站 ({availableInbounds.length})</h3></div>
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background"><TableRow><TableHead>入站</TableHead><TableHead>线路</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
                  <TableBody>{availableInbounds.length ? availableInbounds.map(inbound => <TableRow key={inbound.key}><TableCell><div className="grid"><span className="font-medium">{inbound.name}</span><span className="text-xs text-muted-foreground">{inbound.nodeName}{inbound.tag ? ` · ${inbound.tag}` : ""}</span></div></TableCell><TableCell>{inbound.protocol.toUpperCase()} / {inbound.port ?? "-"}</TableCell><TableCell className="text-right"><Button variant="destructive" size="icon" onClick={() => setGroupInboundAvailability(inbound.id, false)} aria-label={`剔除 ${inbound.name}`} title={`剔除 ${inbound.name}`}><CircleMinus /></Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">没有符合筛选条件的可用入站</TableCell></TableRow>}</TableBody>
                </Table>
            </div>
            <div className="min-h-0 overflow-auto rounded-md border">
              <div className="border-b px-4 py-3"><h3 className="font-semibold">不可用入站 ({unavailableInbounds.length})</h3></div>
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background"><TableRow><TableHead>入站</TableHead><TableHead>线路</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
                  <TableBody>{unavailableInbounds.length ? unavailableInbounds.map(inbound => <TableRow key={inbound.key}><TableCell><div className="grid"><span className="font-medium">{inbound.name}</span><span className="text-xs text-muted-foreground">{inbound.nodeName}{inbound.tag ? ` · ${inbound.tag}` : ""}</span></div></TableCell><TableCell>{inbound.protocol.toUpperCase()} / {inbound.port ?? "-"}</TableCell><TableCell className="text-right"><Button variant="outline" size="icon" onClick={() => setGroupInboundAvailability(inbound.id, true)} aria-label={`新增 ${inbound.name}`} title={`新增 ${inbound.name}`}><CirclePlus /></Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">没有符合筛选条件的不可用入站</TableCell></TableRow>}</TableBody>
                </Table>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setGroupOpen(false)} disabled={saving}>取消</Button><Button onClick={() => void saveGroupSettings()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}保存套餐分组</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(editingInbound)} onOpenChange={open => { if (!open && !saving) setEditingKey("") }}>
        <SheetContent className="xui-inbound-sheet inset-y-4 right-4 h-auto w-[calc(100%-2rem)] rounded-lg border sm:max-w-lg">
          <SheetHeader><SheetTitle>编辑入站</SheetTitle><SheetDescription>{editingInbound ? `${editingInbound.nodeName} · ${editingInbound.name}` : ""}</SheetDescription></SheetHeader>
          <div className="grid flex-1 content-start gap-6 overflow-y-auto px-4">
            <Field orientation="horizontal" className="justify-between"><FieldContent><FieldLabel htmlFor="inbound-enabled">入站状态</FieldLabel><FieldDescription>保存后在 3x-ui 中启用或停用该入站。</FieldDescription></FieldContent><Switch id="inbound-enabled" checked={draft.enabled} onCheckedChange={enabled => setDraft(current => ({ ...current, enabled }))} disabled={saving} /></Field>
            <Field><FieldLabel>网络级别</FieldLabel><Select value={draft.networkLevel || "unset"} onValueChange={value => setDraft(current => ({ ...current, networkLevel: value === "unset" ? "" : value }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unset">未设置</SelectItem>{networkLevels.map(level => <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>)}</SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="inbound-region">地区</FieldLabel><Input id="inbound-region" value={draft.region} onChange={event => setDraft(current => ({ ...current, region: event.target.value }))} placeholder="例如：香港、美国、台湾" maxLength={64} /></Field>
          </div>
          <SheetFooter><Button variant="outline" onClick={() => setEditingKey("")} disabled={saving}>取消</Button><Button onClick={() => void saveEditor()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}保存设置</Button></SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
