import * as React from "react"
import { RefreshCw } from "lucide-react"

import { fetchJsonSteps, postJson } from "@/api"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog"
import { Progress } from "@/components/arc/progress/progress"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { SimpleTable } from "@/components/features/simple-table"
import { toast } from "@/components/features/toast"
import type { CatalogV2LineGroup } from "@/types"
import { formatBytes } from "@/utils"

type EntitlementField = "name" | "deviceLimit" | "trafficBytes" | "lineGroupId"
type Connection = "unchanged" | "enable" | "disable"
type UserRef = { userId: string; label: string }
type BuyerSyncChange = UserRef & {
  fields: Array<{ field: EntitlementField; before: string | number | null; after: string | number | null }>
  usedBytes: number
  totalBytesBefore: number
  totalBytesAfter: number
  connection: Connection
}
type BuyerSyncPreview = { productId: string; fingerprint: string; holders: number; unchanged: number; changes: BuyerSyncChange[]; skipped: Array<UserRef & { reason: string }> }
type BuyerSyncResult = { holders: number; unchanged: number; skipped: BuyerSyncPreview["skipped"]; updated: Array<UserRef & { connection: Connection }>; failed: Array<UserRef & { error: string; rollback: string }> }
type SyncProgress = { done: number; total: number }
type State =
  | { phase: "loading" }
  | { phase: "preview"; preview: BuyerSyncPreview }
  | { phase: "running"; preview: BuyerSyncPreview; progress: SyncProgress }
  | { phase: "done"; result: BuyerSyncResult }
  | { phase: "error"; message: string }

const fieldLabels: Record<EntitlementField, string> = { name: "商品名称", deviceLimit: "在线IP数量", trafficBytes: "流量", lineGroupId: "线路权限组" }
const connectionBadges: Record<Connection, { tone: "neutral" | "success" | "danger"; label: string }> = {
  unchanged: { tone: "neutral", label: "保持不变" },
  enable: { tone: "success", label: "恢复连接" },
  disable: { tone: "danger", label: "关闭连接" },
}

function fieldValue(field: EntitlementField, value: string | number | null, groups: CatalogV2LineGroup[]) {
  if (field === "trafficBytes") return value === null ? "无限流量" : formatBytes(Number(value))
  if (field === "lineGroupId") return groups.find(group => group.id === value)?.name || String(value ?? "-")
  return String(value ?? "-")
}

function ChangeList({ change, groups }: { change: BuyerSyncChange; groups: CatalogV2LineGroup[] }) {
  return <ul className="grid gap-1">
    {change.fields.map(item => <li key={item.field} className="tabular-nums">{fieldLabels[item.field]}：{fieldValue(item.field, item.before, groups)} → {fieldValue(item.field, item.after, groups)}</li>)}
  </ul>
}

function trafficCell(change: BuyerSyncChange) {
  const quota = (bytes: number) => bytes ? formatBytes(bytes) : "无限流量"
  return <span className="tabular-nums">{formatBytes(change.usedBytes)} / {quota(change.totalBytesBefore)} → {quota(change.totalBytesAfter)}</span>
}

function SkippedTable({ rows }: { rows: BuyerSyncPreview["skipped"] }) {
  if (!rows.length) return null
  return <SimpleTable caption="跳过的用户" columns={["跳过的用户", "原因"]} rows={rows} rowKey={row => row.userId} cells={row => [row.label, row.reason]} />
}

/**
 * Pushes a saved product's current plan attributes (name, device limit, traffic, line group) to its active buyers.
 * The dialog first shows a read-only preview of who changes and how; confirming applies exactly that preview, and the
 * server refuses it if the product was saved again in between. The button is for saved plan products only.
 */
export function ProductBuyerSyncButton({ productId, productName, groups, dirty }: { productId: string; productName: string; groups: CatalogV2LineGroup[]; dirty: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [state, setState] = React.useState<State>({ phase: "loading" })
  const running = state.phase === "running"
  const path = `/api/catalog-v2/products/${encodeURIComponent(productId)}/buyer-sync`

  const loadPreview = React.useCallback(async () => {
    setState({ phase: "loading" })
    try {
      setState({ phase: "preview", preview: await postJson<BuyerSyncPreview>(`${path}/preview`, {}) })
    } catch (error) {
      setState({ phase: "error", message: error instanceof Error ? error.message : "生成预览失败" })
    }
  }, [path])

  function openDialog() {
    setOpen(true)
    void loadPreview()
  }

  async function apply(preview: BuyerSyncPreview) {
    setState({ phase: "running", preview, progress: { done: 0, total: preview.changes.length } })
    try {
      const result = await fetchJsonSteps<BuyerSyncResult, { step: string; status: SyncProgress }>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fingerprint: preview.fingerprint }) }, message => {
        if (message.step === "users") setState(current => current.phase === "running" ? { ...current, progress: message.status } : current)
      })
      setState({ phase: "done", result })
      if (result.failed.length) toast({ type: "error", title: `${result.failed.length} 位用户同步失败，已回滚` })
      else toast({ type: "success", title: `已同步 ${result.updated.length} 位用户` })
    } catch (error) {
      setState({ phase: "error", message: error instanceof Error ? error.message : "同步失败" })
    }
  }

  return <>
    <Button variant="secondary" collapse onClick={openDialog}><RefreshCw />同步已购用户</Button>
    <Dialog open={open} onOpenChange={next => { if (!running) setOpen(next) }}>
      <DialogContent size="xl" title={`同步已购用户：${productName}`} description="把商品当前的名称、在线IP数量、流量和线路权限组应用到未到期的已购用户，并按同一规则同步 3x-ui。到期时间和成交价不变。" onEscapeKeyDown={event => { if (running) event.preventDefault() }}>
        {state.phase === "loading" ? <div className="grid gap-2" aria-label="正在生成预览"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24 w-full" /></div> : null}
        {state.phase === "error" ? <>
          <Alert tone="danger" title={state.message} />
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild><Button variant="secondary">关闭</Button></DialogClose>
            <Button onClick={() => void loadPreview()}><RefreshCw />重新生成预览</Button>
          </div>
        </> : null}
        {state.phase === "preview" || state.phase === "running" ? <PreviewBody preview={state.preview} groups={groups} dirty={dirty} progress={state.phase === "running" ? state.progress : null} onApply={() => void apply(state.preview)} /> : null}
        {state.phase === "done" ? <ResultBody result={state.result} /> : null}
      </DialogContent>
    </Dialog>
  </>
}

function PreviewBody({ preview, groups, dirty, progress, onApply }: { preview: BuyerSyncPreview; groups: CatalogV2LineGroup[]; dirty: boolean; progress: SyncProgress | null; onApply: () => void }) {
  const closing = preview.changes.filter(change => change.connection === "disable").length
  return <>
    <div className="flex flex-wrap gap-2">
      <Badge tone="info">待同步 {preview.changes.length}</Badge>
      <Badge>无需变更 {preview.unchanged}</Badge>
      {preview.skipped.length ? <Badge tone="warning">跳过 {preview.skipped.length}</Badge> : null}
      {closing ? <Badge tone="danger">将关闭连接 {closing}</Badge> : null}
    </div>
    {dirty ? <Alert tone="warning" title="页面有未保存的修改">预览和同步按已保存的商品计算；要让这些修改生效，请先关闭弹窗并保存商品。</Alert> : null}
    {preview.changes.length ? <SimpleTable
      caption="待同步的用户"
      columns={["用户", "变更", "已用 / 流量额度", "3x-ui 连接"]}
      rows={preview.changes}
      rowKey={row => row.userId}
      cells={row => [row.label, <ChangeList change={row} groups={groups} />, trafficCell(row), <Badge tone={connectionBadges[row.connection].tone}>{connectionBadges[row.connection].label}</Badge>]}
    /> : <Alert tone="info" title={preview.holders ? "所有未到期的已购用户都已与商品当前设置一致" : "没有未到期的已购用户"}>没有需要同步的用户。</Alert>}
    <SkippedTable rows={preview.skipped} />
    {closing ? <Alert tone="warning" title={`${closing} 位用户的已用流量达到新的流量额度`}>同步后将关闭他们的 3x-ui 客户端连接，直到流量重置或增加额度。</Alert> : null}
    {progress ? <Progress value={progress.done} max={progress.total || 1} label={`正在同步 ${progress.done} / ${progress.total} 位用户，请勿关闭页面`} showValue /> : null}
    <div className="flex flex-wrap justify-end gap-2">
      <DialogClose asChild><Button variant="secondary" disabled={Boolean(progress)}>取消</Button></DialogClose>
      {preview.changes.length ? <Button loading={Boolean(progress)} onClick={onApply}>确认同步 {preview.changes.length} 位用户</Button> : null}
    </div>
  </>
}

function ResultBody({ result }: { result: BuyerSyncResult }) {
  return <>
    {result.failed.length
      ? <Alert tone="warning" title={`已同步 ${result.updated.length} 位用户，${result.failed.length} 位失败`}>失败的用户已恢复到同步前的套餐权益，可稍后重新同步。</Alert>
      : <Alert tone="success" title={result.updated.length ? `已同步 ${result.updated.length} 位用户` : "没有需要同步的用户"} />}
    {result.failed.length ? <SimpleTable caption="同步失败的用户" columns={["同步失败的用户", "原因", "回滚"]} rows={result.failed} rowKey={row => row.userId} cells={row => [row.label, row.error, row.rollback]} /> : null}
    <SkippedTable rows={result.skipped} />
    <div className="flex flex-wrap justify-end gap-2">
      <DialogClose asChild><Button>完成</Button></DialogClose>
    </div>
  </>
}
