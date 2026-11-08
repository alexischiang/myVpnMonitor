import * as React from "react"
import { CircleMinus, CirclePlus, Pencil, Plus, Save, Trash2 } from "lucide-react"

import { deleteJson, fetchJson, fetchJsonSteps } from "@/api"
import { ConfirmDialog } from "@/components/features/confirm-dialog"
import { SimpleTable } from "@/components/features/simple-table"
import { StepProgress, type ProgressStep, type StepStatus } from "@/components/features/step-progress"
import { toast } from "@/components/features/toast"
import { WideNumberField } from "@/components/features/node-hub-node-form"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { Input } from "@/components/arc/input/input"
import { SearchField } from "@/components/arc/search-field/search-field"
import { Select } from "@/components/arc/select/select"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Switch } from "@/components/arc/switch/switch"
import type { CatalogV2LineGroup, XuiInboundManagement } from "@/types"

// V2 line permission groups on the Node Hub page: which node-hub inbounds each group (and so each
// V2 product) can use. Custom inbounds are granted per user and never join a group.

type Inbound = XuiInboundManagement["inbounds"][number]

const emptyLineGroup = (): CatalogV2LineGroup => ({ id: "", name: "", isEnabled: true, sortOrder: 0, includeAllNodes: false, inboundKeys: [], speedLimitMbps: 0 })
// Steps the server reports while it saves a line group.
const lineGroupSaveSteps = [
  { id: "validate", label: "校验入站" },
  { id: "save", label: "保存权限组" },
  { id: "sync", label: "同步到 node-hub" },
]
type LineGroupSaveResult = CatalogV2LineGroup & { xuiSync?: { hubChanged?: number; error?: string } }

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function InboundTable({ rows, empty, action }: { rows: Inbound[]; empty: string; action: (inbound: Inbound) => React.ReactNode }) {
  return <SimpleTable<Inbound> caption="入站列表" columns={["入站", "线路", "操作"]} rows={rows} rowKey={inbound => inbound.key} cells={inbound => [
    <div className="grid"><span className="flex flex-wrap items-center gap-2 font-medium">{inbound.name}{inbound.enabled ? null : <Badge>停用</Badge>}</span><span className="text-xs text-muted-foreground">{inbound.nodeName}{inbound.tag ? ` · ${inbound.tag}` : ""}</span></div>,
    <>{inbound.protocol.toUpperCase()} / {inbound.port ?? "-"}</>,
    <span className="text-right">{action(inbound)}</span>,
  ]} emptyMessage={empty} />
}

export function NodeHubLineGroupsTab({ refreshKey }: { refreshKey: number }) {
  const [inbounds, setInbounds] = React.useState<Inbound[]>([])
  const [lineGroups, setLineGroups] = React.useState<CatalogV2LineGroup[] | null>(null)
  const [error, setError] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<CatalogV2LineGroup>(emptyLineGroup)
  const [original, setOriginal] = React.useState<CatalogV2LineGroup | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [nodeFilter, setNodeFilter] = React.useState("all")
  const [saveSteps, setSaveSteps] = React.useState<ProgressStep[] | null>(null)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const [management, groups] = await Promise.all([
        fetchJson<XuiInboundManagement>("/api/xui-inbounds", { background: true }),
        fetchJson<CatalogV2LineGroup[]>("/api/catalog-v2/line-groups", { background: true }),
      ])
      setInbounds(management.inbounds.toSorted((left, right) => left.subSortIndex - right.subSortIndex || left.id - right.id))
      setLineGroups(groups)
      setError(management.hubError ? `无法读取 node-hub 节点：${management.hubError}` : "")
    } catch (loadError) {
      setError(errorMessage(loadError, "读取权限组失败"))
    }
  }, [])

  React.useEffect(() => { void load() }, [load, refreshKey])

  const nodeOptions = React.useMemo(() => [...new Map(inbounds.map(inbound => [inbound.nodeGuid, inbound.nodeName])).entries()].map(([value, label]) => ({ value, label })).toSorted((left, right) => left.label.localeCompare(right.label)), [inbounds])
  const filteredInbounds = React.useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return inbounds.filter(inbound => inbound.inboundType === "package" && (nodeFilter === "all" || inbound.nodeGuid === nodeFilter) && (!query || `${inbound.nodeName} ${inbound.name} ${inbound.tag} ${inbound.region} ${inbound.protocol}`.toLocaleLowerCase().includes(query)))
  }, [inbounds, nodeFilter, search])
  const selectedKeys = React.useMemo(() => new Set(draft.inboundKeys), [draft.inboundKeys])
  const availableInbounds = filteredInbounds.filter(inbound => selectedKeys.has(inbound.key))
  const unavailableInbounds = filteredInbounds.filter(inbound => !selectedKeys.has(inbound.key))
  const changed = original ? JSON.stringify(draft) !== JSON.stringify(original) : Boolean(draft.id || draft.name || draft.inboundKeys.length)

  function openSettings(group?: CatalogV2LineGroup) {
    setDraft(group ? { ...structuredClone(group), speedLimitMbps: group.speedLimitMbps || 0 } : { ...emptyLineGroup(), sortOrder: Math.max(-1, ...(lineGroups || []).map(item => item.sortOrder)) + 1 })
    setOriginal(group ? { ...structuredClone(group), speedLimitMbps: group.speedLimitMbps || 0 } : null)
    setSearch("")
    setNodeFilter("all")
    setOpen(true)
  }

  function setAvailability(inboundKey: string, available: boolean) {
    setDraft(current => ({ ...current, inboundKeys: available ? [...new Set([...current.inboundKeys, inboundKey])] : current.inboundKeys.filter(key => key !== inboundKey) }))
  }

  async function save() {
    setSaving(true)
    setSaveSteps(lineGroupSaveSteps.map(step => ({ ...step, status: "pending" })))
    let runningStep = ""
    try {
      const { xuiSync, ...result } = await fetchJsonSteps<LineGroupSaveResult, { step: string; status: StepStatus }>(
        original ? `/api/catalog-v2/line-groups/${encodeURIComponent(original.id)}` : "/api/catalog-v2/line-groups",
        { method: original ? "PUT" : "POST", body: JSON.stringify(draft), background: true },
        event => {
          runningStep = event.status === "running" ? event.step : ""
          setSaveSteps(current => current && current.map(step => step.id === event.step ? { ...step, status: event.status } : step))
        },
      )
      setLineGroups(current => (original
        ? (current || []).map(group => group.id === result.id ? { ...result, productCount: group.productCount } : group)
        : [...(current || []), { ...result, productCount: 0 }]).toSorted((left, right) => left.sortOrder - right.sortOrder))
      setOpen(false)
      // The group is saved even when the push fails; the next entitlement sync retries it.
      if (xuiSync?.error) toast({ type: "warning", title: `权限组已保存，但同步到 node-hub 失败：${xuiSync.error}。系统会在下次定时同步时重试。` })
      else toast({ type: "success", title: xuiSync?.hubChanged ? `V2 权限组已保存，已同步 ${xuiSync.hubChanged} 个用户` : "V2 权限组已保存" })
    } catch (saveError) {
      // The step that was running is the one that failed; a request rejected before any step has none.
      const failedStep = lineGroupSaveSteps.find(step => step.id === runningStep)?.label
      const message = errorMessage(saveError, "保存失败")
      toast({ type: "error", title: failedStep ? `${failedStep}失败：${message}` : message })
    } finally {
      setSaveSteps(null)
      setSaving(false)
    }
  }

  // Runs from the confirm dialog; a failure is reported and rethrown so the dialog stays open.
  async function remove() {
    if (!original) return
    setSaving(true)
    try {
      await deleteJson(`/api/catalog-v2/line-groups/${encodeURIComponent(original.id)}`)
      setLineGroups(current => (current || []).filter(group => group.id !== original.id))
      setOpen(false)
      toast({ type: "success", title: "V2 权限组已删除" })
    } catch (removeError) {
      toast({ type: "error", title: errorMessage(removeError, "删除失败") })
      throw removeError
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="grid gap-3" aria-labelledby="v2-line-groups-title">
      {error ? <Alert tone="danger" title={error} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="v2-line-groups-title" className="font-semibold">V2 线路权限组</h2><p className="text-sm text-muted-foreground">V2 商品可用的节点；定制节点不参与权限组。</p></div>
        <Button onClick={() => openSettings()} disabled={lineGroups === null}><Plus />新建权限组</Button>
      </div>
      {lineGroups === null ? error ? null : <Skeleton lines={3} />
        : lineGroups.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{lineGroups.map(group => <Card key={group.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-lg font-medium">{group.name}</h3><p className="truncate text-sm text-muted-foreground">{group.id}</p></div>{group.isEnabled ? <Badge tone="success">启用</Badge> : <Badge>停用</Badge>}</div><div className="flex items-end justify-between gap-3"><div className="text-sm text-muted-foreground">{group.includeAllNodes ? "全部节点" : <><span className="tabular-nums">{group.inboundKeys.length}</span> 个入站</>} · <span className="tabular-nums">{group.productCount || 0}</span> 个商品 · <span className="whitespace-nowrap tabular-nums">{group.speedLimitMbps ? `限速 ${group.speedLimitMbps} Mbps` : "不限速"}</span></div><Button variant="secondary" size="sm" onClick={() => openSettings(group)}><Pencil />编辑</Button></div></Card>)}</div>
        : <Card title="尚未创建 V2 权限组" description="新建权限组后即可为 V2 套餐选择可用入站。"></Card>}

      <Dialog open={open} onOpenChange={next => { if (!saving) setOpen(next) }}>
        <DialogContent title={original ? `编辑 ${original.name}` : "新建 V2 权限组"} description="设置权限组信息和可用入站；定制节点不参与套餐分组。" size="full"><div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Every field here is a label over one control-height box, so the boxes line up across the row. */}
          <Input label="权限组 ID" id="line-group-id" value={draft.id} disabled={Boolean(original)} onChange={event => setDraft(current => ({ ...current, id: event.target.value.toLowerCase() }))} placeholder="pro" />
          <Input label="名称" id="line-group-name" value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="PRO" />
          <WideNumberField label="排序" id="line-group-order" value={draft.sortOrder} onValueChange={next => setDraft(current => ({ ...current, sortOrder: next }))} min={0} />
          <WideNumberField label="用户限速" id="line-group-speed" description="0 为不限速，用户单独限速优先" value={draft.speedLimitMbps || 0} onValueChange={next => setDraft(current => ({ ...current, speedLimitMbps: Math.max(0, Math.floor(next || 0)) }))} min={0} max={100000} step={1} suffix=" Mbps" formatOptions={{ useGrouping: false }} />
          <Select label="状态" id="line-group-enabled" className="w-full" value={draft.isEnabled ? "enabled" : "disabled"} onValueChange={value => setDraft(current => ({ ...current, isEnabled: value === "enabled" }))} options={[{ value: "enabled", label: "启用" }, { value: "disabled", label: "停用" }]} />
        </div>
        <Field orientation="horizontal" className="justify-between"><FieldContent><FieldLabel htmlFor="line-group-all-nodes">包含全部节点</FieldLabel><FieldDescription>{draft.includeAllNodes ? `当前 ${inbounds.filter(inbound => inbound.inboundType === "package").length} 个套餐节点，新节点自动加入；定制节点除外` : "新建的套餐节点自动加入；定制节点除外"}</FieldDescription></FieldContent><Switch id="line-group-all-nodes" checked={draft.includeAllNodes === true} onCheckedChange={includeAllNodes => setDraft(current => ({ ...current, includeAllNodes }))} /></Field>
        {draft.includeAllNodes ? null : <><div className="grid items-start gap-3 sm:grid-cols-2">
          <SearchField label="搜索入站" id="group-inbound-search" value={search} onValueChange={setSearch} placeholder="节点、入站、地区或协议" />
          <Select label="节点" value={nodeFilter} onValueChange={setNodeFilter} id="group-node-filter" className="w-full" options={[{ value: "all", label: "全部节点" }, ...nodeOptions]} />
        </div><div className="grid gap-3 sm:grid-cols-2">
          <div className="max-h-96 overflow-auto rounded-md border">
            <div className="border-b px-4 py-3"><h3 className="font-semibold">可用入站 ({availableInbounds.length})</h3></div>
            <InboundTable rows={availableInbounds} empty="没有符合筛选条件的可用入站" action={inbound => <Button variant="danger" size="icon" onClick={() => setAvailability(inbound.key, false)} aria-label={`剔除 ${inbound.name}`} title={`剔除 ${inbound.name}`}><CircleMinus /></Button>} />
          </div>
          <div className="max-h-96 overflow-auto rounded-md border">
            <div className="border-b px-4 py-3"><h3 className="font-semibold">不可用入站 ({unavailableInbounds.length})</h3></div>
            <InboundTable rows={unavailableInbounds} empty="没有符合筛选条件的不可用入站" action={inbound => <Button variant="success" size="icon" className="bg-emerald-600/10 text-emerald-600 hover:bg-emerald-600/20 focus-visible:ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-400 dark:hover:bg-emerald-400/20 dark:focus-visible:ring-emerald-400/40" onClick={() => setAvailability(inbound.key, true)} aria-label={`新增 ${inbound.name}`} title={`新增 ${inbound.name}`}><CirclePlus /></Button>} />
          </div>
        </div></>}<div className="grid gap-4">
          {saveSteps ? <StepProgress steps={saveSteps} label="保存权限组进度" /> : null}
          <div className="flex flex-wrap justify-end gap-2">{original ? <><Button variant="danger" className="mr-auto" onClick={() => setConfirmDelete(true)} disabled={saving}><Trash2 />删除权限组</Button><ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`删除权限组「${original.name}」？`} description="删除后不能恢复。" onConfirm={remove} /></> : null}<Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>取消</Button><ActionButton icon={<Save />} onClick={() => void save()} disabled={saving || !changed} label="保存权限组" pending={saving} /></div>
        </div></DialogContent>
      </Dialog>
    </section>
  )
}
