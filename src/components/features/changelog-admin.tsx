import * as React from "react"
import { Check, Pencil, Plus, Tags, Trash2, X } from "lucide-react"

import { deleteJson, fetchJson, postJson, putJson } from "@/api"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { Input } from "@/components/arc/input/input"
import { Select } from "@/components/arc/select/select"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Textarea } from "@/components/arc/textarea/textarea"
import { ChangelogTagDot, changelogTagColors, type ChangelogTagColor } from "@/components/features/changelog"
import { ConfirmDialog } from "@/components/features/confirm-dialog"
import { EmptyState } from "@/components/features/shared"
import { toast } from "@/components/features/toast"
import { formatDateTime } from "@/utils"

/** A stored release note as the admin API returns it; content is the raw text the admin typed. */
interface ChangelogRecord {
  id: string
  title: string
  content: string
  kind: string
  publishedAt: string
  updatedAt: string
}

/** A tag with the number of entries using it; a tag in use cannot be deleted. */
interface ChangelogTagRecord {
  id: string
  label: string
  color: ChangelogTagColor
  sortOrder: number
  entryCount: number
}

type Draft = { title: string; content: string; kind: string }
type TagDraft = { label: string; color: ChangelogTagColor }

// The colour select shows swatches only; the Chinese names stay as the options' accessible labels.
const colorOptions = Object.entries(changelogTagColors).map(([value, color]) => ({ value, label: color.label, icon: <ChangelogTagDot color={value} className="inline-block size-4 rounded-full" /> }))
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback

function TagBadge({ tag }: { tag?: Pick<ChangelogTagRecord, "label" | "color"> }) {
  return <Badge><ChangelogTagDot color={tag?.color ?? "muted"} />{tag?.label ?? "未知标签"}</Badge>
}

/** Add, rename, recolour and delete tags, shown in a dialog. Changes reach the parent through onChange so the entry form and list update at once. */
function ChangelogTagManager({ tags, onChange }: { tags: ChangelogTagRecord[]; onChange: (tags: ChangelogTagRecord[]) => void }) {
  const emptyDraft: TagDraft = { label: "", color: "blue" }
  const [drafts, setDrafts] = React.useState<Record<string, TagDraft>>({})
  const [newDraft, setNewDraft] = React.useState<TagDraft>(emptyDraft)
  const [busyId, setBusyId] = React.useState("")
  const [deleting, setDeleting] = React.useState<ChangelogTagRecord | null>(null)
  const draftOf = (tag: ChangelogTagRecord): TagDraft => drafts[tag.id] ?? { label: tag.label, color: tag.color }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!newDraft.label.trim() || busyId) return
    setBusyId("new")
    try {
      const created = await postJson<ChangelogTagRecord>("/api/changelog-tags", newDraft)
      onChange([...tags, created])
      setNewDraft(emptyDraft)
      toast({ type: "success", title: "标签已添加" })
    } catch (error) { toast({ type: "error", title: errorMessage(error, "添加标签失败") }) } finally { setBusyId("") }
  }
  async function save(tag: ChangelogTagRecord) {
    setBusyId(tag.id)
    try {
      const saved = await putJson<ChangelogTagRecord>(`/api/changelog-tags/${encodeURIComponent(tag.id)}`, draftOf(tag))
      onChange(tags.map(item => item.id === tag.id ? saved : item))
      setDrafts(({ [tag.id]: _, ...rest }) => rest)
      toast({ type: "success", title: "标签已保存" })
    } catch (error) { toast({ type: "error", title: errorMessage(error, "保存标签失败") }) } finally { setBusyId("") }
  }
  // Runs from the confirm dialog; a failure is reported and rethrown so the dialog stays open.
  async function remove(tag: ChangelogTagRecord) {
    setBusyId(tag.id)
    try {
      await deleteJson(`/api/changelog-tags/${encodeURIComponent(tag.id)}`)
      onChange(tags.filter(item => item.id !== tag.id))
      toast({ type: "success", title: "标签已删除" })
    } catch (error) { toast({ type: "error", title: errorMessage(error, "删除标签失败") }); throw error } finally { setBusyId("") }
  }

  return <>
    <div className="grid gap-4">
      {tags.length ? <ul className="grid divide-y">{tags.map(tag => {
        const draft = draftOf(tag)
        const changed = draft.label.trim() !== tag.label || draft.color !== tag.color
        const update = (patch: Partial<TagDraft>) => setDrafts(current => ({ ...current, [tag.id]: { ...draft, ...patch } }))
        return <li key={tag.id} className="flex flex-wrap items-center gap-2 py-3 first:pt-0 last:pb-0">
          <ChangelogTagDot color={draft.color} className="inline-block size-3 shrink-0 rounded-full" />
          <Input label={`${tag.label} 名称`} hideLabel id={`changelog-tag-${tag.id}-label`} className="min-w-0 flex-1 basis-32" maxLength={12} value={draft.label} onChange={event => update({ label: event.target.value })} />
          {/* Select sizes its outer field, not the trigger, so the width goes on a wrapper. */}
          <div className="w-20 shrink-0"><Select label={`${tag.label} 颜色`} hideLabel iconOnly id={`changelog-tag-${tag.id}-color`} value={draft.color} onValueChange={color => update({ color: color as ChangelogTagColor })} options={colorOptions} /></div>
          <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">{tag.entryCount} 条更新</span>
          <div className="flex shrink-0 gap-1">
            <Button variant="secondary" size="icon-sm" aria-label={`保存标签 ${tag.label}`} title="保存" loading={busyId === tag.id} disabled={!changed || !draft.label.trim() || Boolean(busyId)} onClick={() => void save(tag)}><Check /></Button>
            <Button variant="danger" size="icon-sm" aria-label={`删除标签 ${tag.label}`} title={tag.entryCount ? "有更新正在使用，不能删除" : "删除"} disabled={tag.entryCount > 0 || Boolean(busyId)} onClick={() => setDeleting(tag)}><Trash2 /></Button>
          </div>
        </li>
      })}</ul> : <EmptyState icon={<Tags width={24} height={24} strokeWidth={1.5} />} title="还没有标签" description="至少添加一个标签后才能发布更新。" />}
      <form className="flex flex-wrap items-end gap-2 border-t pt-4" onSubmit={event => void create(event)}>
        <Input label="新标签名称" id="changelog-tag-new-label" className="min-w-0 flex-1 basis-32" maxLength={12} value={newDraft.label} onChange={event => setNewDraft({ ...newDraft, label: event.target.value })} placeholder="例如：安全公告" />
        <div className="w-20 shrink-0"><Select label="颜色" iconOnly id="changelog-tag-new-color" value={newDraft.color} onValueChange={color => setNewDraft({ ...newDraft, color: color as ChangelogTagColor })} options={colorOptions} /></div>
        <Button type="submit" variant="secondary" size="icon" aria-label="添加标签" title="添加标签" loading={busyId === "new"} disabled={!newDraft.label.trim() || Boolean(busyId)}><Plus /></Button>
      </form>
    </div>
    <ConfirmDialog open={deleting !== null} onOpenChange={open => { if (!open) setDeleting(null) }} title={`删除标签「${deleting?.label ?? ""}」？`} description="删除后不能恢复。" onConfirm={() => deleting ? remove(deleting) : undefined} />
  </>
}

export function ChangelogAdminPage() {
  const [records, setRecords] = React.useState<ChangelogRecord[] | null>(null)
  const [tags, setTags] = React.useState<ChangelogTagRecord[] | null>(null)
  const [draft, setDraft] = React.useState<Draft>({ title: "", content: "", kind: "" })
  const [editingId, setEditingId] = React.useState("")
  const [busyId, setBusyId] = React.useState("")
  const [tagsOpen, setTagsOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState<ChangelogRecord | null>(null)
  const titleRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    Promise.all([fetchJson<ChangelogRecord[]>("/api/changelog"), fetchJson<ChangelogTagRecord[]>("/api/changelog-tags")])
      .then(([entries, tagList]) => { setRecords(entries); setTags(tagList) })
      .catch(error => toast({ type: "error", title: errorMessage(error, "更新日志加载失败") }))
  }, [])

  // Keep the form's tag valid: default to the first tag, and fall back when the chosen tag is deleted.
  const kind = tags?.some(tag => tag.id === draft.kind) ? draft.kind : tags?.[0]?.id ?? ""
  const editing = records?.find(record => record.id === editingId)
  const ready = draft.title.trim() && draft.content.trim() && kind

  // Entry counts per tag follow the local entry list, so the tag manager's delete guard is right without reloading.
  const tagsWithCounts = React.useMemo(() => (tags ?? []).map(tag => ({ ...tag, entryCount: (records ?? []).filter(record => record.kind === tag.id).length })), [tags, records])

  function edit(record: ChangelogRecord) {
    setEditingId(record.id)
    setDraft({ title: record.title, content: record.content, kind: record.kind })
    titleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    titleRef.current?.focus({ preventScroll: true })
  }

  function reset() {
    setEditingId("")
    setDraft({ title: "", content: "", kind })
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!ready || busyId) return
    setBusyId("form")
    const payload = { ...draft, kind }
    try {
      if (editing) {
        const saved = await putJson<ChangelogRecord>(`/api/changelog/${encodeURIComponent(editing.id)}`, payload)
        setRecords(current => (current ?? []).map(record => record.id === saved.id ? saved : record))
        toast({ type: "success", title: "更新已保存" })
      } else {
        const created = await postJson<ChangelogRecord>("/api/changelog", payload)
        setRecords(current => [created, ...(current ?? [])])
        toast({ type: "success", title: "更新已发布", description: "用户中心的更新日志和总览已显示这条更新。" })
      }
      reset()
    } catch (error) {
      toast({ type: "error", title: errorMessage(error, "保存更新失败") })
    } finally {
      setBusyId("")
    }
  }

  // Runs from the confirm dialog; a failure is reported and rethrown so the dialog stays open.
  async function remove(record: ChangelogRecord) {
    setBusyId(record.id)
    try {
      await deleteJson(`/api/changelog/${encodeURIComponent(record.id)}`)
      setRecords(current => (current ?? []).filter(item => item.id !== record.id))
      if (editingId === record.id) reset()
      toast({ type: "success", title: "更新已删除" })
    } catch (error) {
      toast({ type: "error", title: errorMessage(error, "删除更新失败") })
      throw error
    } finally {
      setBusyId("")
    }
  }

  if (!records || !tags) return <div className="grid gap-6 px-4 lg:px-6"><Skeleton lines={6} /><Skeleton lines={4} /></div>

  return (
    <div className="grid gap-6 px-4 lg:px-6">
      <Card title={editing ? "编辑更新" : "发布更新"} description="发布后立即显示在用户中心的更新日志页和总览卡片中。" headerAction={<div className="flex flex-wrap gap-2">{editing ? <Button variant="secondary" size="sm" onClick={reset}><X />取消编辑</Button> : null}<Button variant="secondary" size="sm" onClick={() => setTagsOpen(true)}><Tags />管理标签</Button></div>}>
        <form className="grid gap-4" onSubmit={event => void submit(event)}>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
            <Input ref={titleRef} label="标题" id="changelog-title" required maxLength={80} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="例如：新增香港 IEPL 线路" />
            <Select label="标签" id="changelog-kind" value={kind} onValueChange={value => setDraft({ ...draft, kind: value })} options={tags.map(tag => ({ value: tag.id, label: tag.label }))} placeholder="先在下方添加标签" />
          </div>
          <Textarea label="内容" id="changelog-content" required rows={6} maxLength={4000} value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })}
            description="第一行是摘要，显示在列表中；之后每行一条详情，展开后显示。"
            placeholder={"香港节点全部升级为 IEPL 专线。\n晚高峰延迟降低约 40%。\n支持 Netflix、Disney+ 解锁。"} />
          <div className="flex flex-wrap justify-end gap-2">
            <ActionButton type="submit" label={editing ? "保存修改" : "发布更新"} pending={busyId === "form"} disabled={!ready || Boolean(busyId)} />
          </div>
        </form>
      </Card>

      <Card title="已发布" description={`共 ${records.length} 条，按发布时间从新到旧排列。`}>
        {records.length === 0 ? <EmptyState title="还没有发布任何更新" description="在上方填写标题、标签和内容后发布第一条更新。" />
          : <ul className="grid divide-y">
            {records.map(record => {
              const [summary = "", ...details] = record.content.split("\n")
              return <li key={record.id} className="flex flex-wrap items-start gap-3 py-4 first:pt-0 last:pb-0">
                <div className="grid min-w-0 flex-1 gap-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <TagBadge tag={tags.find(tag => tag.id === record.kind)} />
                    <h3 className="min-w-0 truncate font-medium">{record.title}</h3>
                    {record.id === editingId ? <Badge tone="warning">编辑中</Badge> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{summary}{details.length ? `（另有 ${details.length} 条详情）` : ""}</p>
                  <time className="text-xs text-muted-foreground tabular-nums" dateTime={record.publishedAt}>发布于 {formatDateTime(record.publishedAt)}</time>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="secondary" size="icon-sm" aria-label={`编辑 ${record.title}`} title="编辑" disabled={Boolean(busyId)} onClick={() => edit(record)}><Pencil /></Button>
                  <Button variant="danger" size="icon-sm" aria-label={`删除 ${record.title}`} title="删除" loading={busyId === record.id} disabled={Boolean(busyId)} onClick={() => setDeleting(record)}><Trash2 /></Button>
                </div>
              </li>
            })}
          </ul>}
      </Card>

      <Dialog open={tagsOpen} onOpenChange={setTagsOpen}>
        <DialogContent size="lg" title="标签管理" description="标签用于给更新分类，用户可以在更新日志页按标签筛选。正在被更新使用的标签不能删除。">
          <div className="mt-4"><ChangelogTagManager tags={tagsWithCounts} onChange={setTags} /></div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={deleting !== null} onOpenChange={open => { if (!open) setDeleting(null) }} title={`删除更新「${deleting?.title ?? ""}」？`} description="用户将不再看到这条记录，删除后不能恢复。" onConfirm={() => deleting ? remove(deleting) : undefined} />
    </div>
  )
}
