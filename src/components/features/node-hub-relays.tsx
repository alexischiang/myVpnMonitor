import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { KeyRound, Pencil, Plus, Save, Terminal, Trash2 } from "lucide-react"

import { deleteJson, fetchJson, postJson, putJson } from "@/api"
import { DataTable, DataTableColumnHeader, DataTableRowActions } from "@/components/features/arc-data-table"
import { DataTableCard } from "@/components/features/data-table-card"
import { ConfirmDialog } from "@/components/features/confirm-dialog"
import { InfoList } from "@/components/features/shared"
import { toast } from "@/components/features/toast"
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
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Switch } from "@/components/arc/switch/switch"
import { Textarea } from "@/components/arc/textarea/textarea"
import type { NodeHubRelay } from "@/types"
import { formatDateTime } from "@/utils"

// The 中转机 tab of the node-hub page: relay machines that run realm and forward one port per
// (node, relay) entry to the node's landing machine. Nodes pick their relays in the node form.

type RelayDraft = { name: string; host: string; notes: string; isActive: boolean }
const emptyRelayDraft = (): RelayDraft => ({ name: "", host: "", notes: "", isActive: true })

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function RelayStatus({ relay }: { relay: NodeHubRelay }) {
  if (!relay.isActive) return <Badge>已停用</Badge>
  return <div className="grid justify-items-start gap-1">
    <div className="flex flex-wrap gap-1">
      <Badge tone={relay.online ? "success" : "danger"}>{relay.online ? "在线" : relay.lastSeenAt ? "离线" : "未连接"}</Badge>
      {relay.online && relay.endpointCount ? <Badge tone={relay.realmActive ? "success" : "warning"}>{relay.realmActive ? "realm 运行中" : "realm 未运行"}</Badge> : null}
      {relay.online && !relay.synced ? <Badge tone="warning" title="中转机每 30 秒拉取一次规则">规则同步中</Badge> : null}
    </div>
    <span className="text-xs text-muted-foreground tabular-nums">{relay.lastSeenAt ? formatDateTime(relay.lastSeenAt) : "从未同步"}</span>
  </div>
}

function RelayInstallCommand({ command }: { command?: string }) {
  if (!command) return <Alert tone="warning" title="无法生成安装命令">node-hub 没有设置 NODE_HUB_PUBLIC_URL（中转机访问 node-hub 的 HTTPS 地址），设置后重启 node-hub。</Alert>
  return <div className="grid gap-2">
    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">{command}</pre>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">在中转机上用 root 执行，会安装 realm 和规则同步服务。命令里含中转机 token，不要公开。</p><CopyButton value={command} label="复制安装命令" /></div>
  </div>
}

export function NodeHubRelaysTab({ relays, onChanged }: { relays: NodeHubRelay[]; onChanged: () => void }) {
  const [createOpen, setCreateOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<RelayDraft>(emptyRelayDraft)
  const [saving, setSaving] = React.useState(false)
  const [installFor, setInstallFor] = React.useState<NodeHubRelay | null>(null)
  const [detail, setDetail] = React.useState<NodeHubRelay | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [confirmReset, setConfirmReset] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  async function createRelay() {
    setSaving(true)
    try {
      const relay = await postJson<NodeHubRelay>("/api/node-hub/relays", draft)
      setCreateOpen(false)
      setInstallFor(relay)
      toast({ type: "success", title: `中转机「${relay.name}」已创建` })
      onChanged()
    } catch (saveError) {
      toast({ type: "error", title: errorMessage(saveError, "创建中转机失败") })
    } finally {
      setSaving(false)
    }
  }

  const openRelay = React.useCallback(async (relay: NodeHubRelay) => {
    setDetail(relay)
    setDraft({ name: relay.name, host: relay.host, notes: relay.notes, isActive: relay.isActive })
    setDetailLoading(true)
    try {
      const loaded = await fetchJson<NodeHubRelay>(`/api/node-hub/relays/${relay.id}`)
      setDetail(current => current?.id === relay.id ? { ...relay, ...loaded } : current)
    } catch (loadError) {
      toast({ type: "error", title: errorMessage(loadError, "读取中转机详情失败") })
    } finally {
      setDetailLoading(false)
    }
  }, [])

  async function saveRelay() {
    if (!detail) return
    setSaving(true)
    try {
      await putJson<NodeHubRelay>(`/api/node-hub/relays/${detail.id}`, draft)
      setDetail(null)
      toast({ type: "success", title: "中转机设置已保存", description: "地址改动会写进用户订阅；规则 30 秒内同步到中转机。" })
      onChanged()
    } catch (saveError) {
      toast({ type: "error", title: errorMessage(saveError, "保存中转机失败") })
    } finally {
      setSaving(false)
    }
  }

  // Run from the confirm dialogs; failures are reported and rethrown so the dialog stays open.
  async function resetToken() {
    if (!detail) return
    try {
      const relay = await postJson<NodeHubRelay>(`/api/node-hub/relays/${detail.id}/reset-token`)
      setDetail(current => current ? { ...current, installCommand: relay.installCommand } : current)
      toast({ type: "success", title: "已重置中转机 token", description: "旧 token 已失效，请在中转机上重新执行安装命令。" })
    } catch (resetError) {
      toast({ type: "error", title: errorMessage(resetError, "重置 token 失败") })
      throw resetError
    }
  }

  async function deleteRelay() {
    if (!detail) return
    try {
      await deleteJson(`/api/node-hub/relays/${detail.id}`)
      setDetail(null)
      toast({ type: "success", title: `中转机「${detail.name}」已删除`, description: "中转机上的 realm 不会自动卸载，可在中转机上执行安装脚本的 --uninstall。" })
      onChanged()
    } catch (deleteError) {
      toast({ type: "error", title: errorMessage(deleteError, "删除中转机失败") })
      throw deleteError
    }
  }

  const columns = React.useMemo<ColumnDef<NodeHubRelay>[]>(() => [
    { id: "relay", accessorFn: relay => `${relay.name} ${relay.host} ${relay.notes}`, header: DataTableColumnHeader({ title: "中转机" }), meta: { label: "中转机" }, cell: ({ row }) => <div className="grid min-w-0"><span className="truncate font-medium">{row.original.name}</span><span className="truncate text-xs text-muted-foreground">{row.original.host}</span></div> },
    { id: "status", accessorFn: relay => relay.isActive ? relay.online ? "在线" : "离线" : "已停用", header: DataTableColumnHeader({ title: "状态" }), meta: { label: "状态" }, cell: ({ row }) => <RelayStatus relay={row.original} /> },
    { id: "endpoints", accessorFn: relay => relay.endpointCount || 0, header: DataTableColumnHeader({ title: "转发规则" }), meta: { label: "转发规则" }, cell: ({ row }) => <span className="tabular-nums">{row.original.endpointCount || 0}</span> },
    { id: "actions", header: "操作", enableHiding: false, enableSorting: false, cell: ({ row }) => <DataTableRowActions detail={<Button variant="ghost" size="icon" onClick={() => void openRelay(row.original)} aria-label={`管理 ${row.original.name}`}><Pencil /></Button>} /> },
  ], [openRelay])

  const changed = detail ? draft.name !== detail.name || draft.host !== detail.host || draft.notes !== detail.notes || draft.isActive !== detail.isActive : false

  return <>
    <DataTableCard><DataTable columns={columns} data={relays} searchKey="relay" searchPlaceholder="搜索中转机名称、地址或备注" stateKey="relays" emptyTitle="还没有中转机" emptyDescription="中转机用 realm 把端口转发到落地机。新建后在中转机上执行安装命令，再在节点里勾选它。" pageSize={30} frame="card" renderMobileItem={relay => <Card title={relay.name} description={relay.host} headerAction={<Button variant="ghost" size="icon" onClick={() => void openRelay(relay)} aria-label={`管理 ${relay.name}`}><Pencil /></Button>}><div className="flex flex-wrap items-start justify-between gap-3"><RelayStatus relay={relay} /><span className="text-sm tabular-nums">规则 {relay.endpointCount || 0}</span></div></Card>} toolbar={<Button collapse onClick={() => { setDraft(emptyRelayDraft()); setCreateOpen(true) }}><Plus />新建中转机</Button>} /></DataTableCard>

    <Dialog open={createOpen} onOpenChange={open => { if (!saving) setCreateOpen(open) }}>
      <DialogContent title="新建中转机" description="中转机运行 realm，把用户连接转发到落地机上的节点。创建后会生成它专用的安装命令。">
        <div className="grid gap-3">
          <Input label="名称" id="relay-name" description="用户订阅里显示为「节点名 · 中转机名」。" value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="香港中转" maxLength={80} />
          <Input label="公网地址" id="relay-host" description="用户连接的 IP 或域名，写进订阅。" value={draft.host} onChange={event => setDraft(current => ({ ...current, host: event.target.value.trim() }))} placeholder="203.0.113.10" />
          <Textarea label="备注" id="relay-notes" value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} rows={2} maxLength={500} />
        </div>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>取消</Button><ActionButton icon={<Plus />} onClick={() => void createRelay()} disabled={saving || !draft.name.trim() || !draft.host.trim()} pending={saving} label="创建中转机" /></div>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(installFor)} onOpenChange={open => { if (!open) setInstallFor(null) }}>
      <DialogContent title={`安装到「${installFor?.name || ""}」`} description="在中转机上执行下面的命令，30 秒内上线。之后可随时在中转机详情里重新查看。" size="lg">
        <RelayInstallCommand command={installFor?.installCommand} />
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setInstallFor(null)}>完成</Button></div>
      </DialogContent>
    </Dialog>

    <Drawer open={Boolean(detail)} onOpenChange={open => { if (!open && !saving) setDetail(null) }}>
      <DrawerContent title={detail?.name || "中转机"} description={detail?.host || ""} size="lg">
        {detail ? <div className="-mx-1 grid flex-1 content-start gap-6 overflow-x-hidden overflow-y-auto px-1">
          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">状态</h3>
            <InfoList items={[
              { label: "状态", value: <RelayStatus relay={detail} /> },
              { label: "最后同步", value: detail.lastSeenAt ? formatDateTime(detail.lastSeenAt) : "从未同步" },
              { label: "realm", value: detail.status?.realm || "-" },
              { label: "转发规则", value: `${detail.endpointCount || 0} 条` },
            ]} />
            {detailLoading ? <Skeleton lines={2} /> : detail.endpoints?.length ? <div className="grid gap-1 text-sm">
              {detail.endpoints.map(endpoint => <div key={endpoint.listenPort} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"><span className="font-medium">{endpoint.nodeName}</span><span className="font-mono text-xs tabular-nums text-muted-foreground">:{endpoint.listenPort} → {endpoint.remoteHost}:{endpoint.remotePort}</span></div>)}
            </div> : <p className="text-sm text-muted-foreground">还没有节点经过这台中转机。在节点表单的「接入方式」里勾选它。</p>}
          </section>
          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">设置</h3>
            <Input label="名称" id="relay-edit-name" value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} maxLength={80} />
            <Input label="公网地址" id="relay-edit-host" value={draft.host} onChange={event => setDraft(current => ({ ...current, host: event.target.value.trim() }))} placeholder="203.0.113.10" />
            <Textarea label="备注" id="relay-edit-notes" value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} rows={2} maxLength={500} />
            <Field orientation="horizontal" className="justify-between"><FieldContent><FieldLabel htmlFor="relay-edit-active">启用中转机</FieldLabel><FieldDescription>停用后它的入口从订阅里移除，中转机在下次同步时停止 realm。</FieldDescription></FieldContent><Switch id="relay-edit-active" checked={draft.isActive} onCheckedChange={isActive => setDraft(current => ({ ...current, isActive }))} /></Field>
            <div className="flex flex-wrap justify-end gap-2"><ActionButton icon={<Save />} onClick={() => void saveRelay()} disabled={saving || !changed || !draft.name.trim() || !draft.host.trim()} pending={saving} label="保存中转机设置" /></div>
          </section>
          <section className="grid gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Terminal className="size-4" />安装命令</h3>
            {detailLoading ? <Skeleton lines={2} /> : <RelayInstallCommand command={detail.installCommand} />}
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="danger" onClick={() => setConfirmDelete(true)}><Trash2 />删除中转机</Button>
              <Button variant="secondary" onClick={() => setConfirmReset(true)}><KeyRound />重置 token</Button>
            </div>
          </section>
        </div> : null}
      </DrawerContent>
    </Drawer>
    <ConfirmDialog open={confirmReset} onOpenChange={setConfirmReset} title={`重置「${detail?.name || ""}」的 token？`} description="旧 token 立即失效，中转机停止同步规则（realm 保持最后一次的规则），直到用新的安装命令重新安装。" confirmLabel="重置 token" onConfirm={resetToken} />
    <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`删除中转机「${detail?.name || ""}」？`} description="还有节点经过它时不能删除，请先在节点里取消勾选。删除后不能恢复。" confirmLabel="删除中转机" onConfirm={deleteRelay} />
  </>
}
