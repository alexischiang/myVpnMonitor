import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { deleteJson, postJson, putJson } from "@/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { DataTable, DataTableColumnHeader } from "@/components/features/data-table"
import { useData } from "@/components/features/data-provider"
import { SimpleFormDialog, type Field, type FormValues } from "@/components/features/simple-form"
import { PageHeader } from "@/components/features/shared"
import type { PlaceholderNode, Vendor } from "@/types"

const targets = ["clash", "clashr", "quan", "quanx", "loon", "surge&ver=4", "surge&ver=3", "shadowrocket", "v2ray", "mixed"]

export function SubconverterPage() {
  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <PageHeader title="Subconverter" description="订阅转换预设、供应商覆写与占位节点配置。" />
      <div className="grid gap-4">
        <PresetCard />
        <PricingCard />
        <VendorOverrides />
        <PlaceholderNodes />
      </div>
    </div>
  )
}

function PresetCard() {
  const { presets, reload, runAsync } = useData()
  const preset = presets[0] || {}
  const [saving, setSaving] = React.useState(false)
  const [values, setValues] = React.useState({
    target: preset.target || "clash",
    config: preset.config || "",
    emoji: preset.emoji !== false,
    udp: preset.udp !== false,
    scv: Boolean(preset.scv),
    sort: Boolean(preset.sort),
  })
  React.useEffect(() => {
    setValues({ target: preset.target || "clash", config: preset.config || "", emoji: preset.emoji !== false, udp: preset.udp !== false, scv: Boolean(preset.scv), sort: Boolean(preset.sort) })
  }, [preset.config, preset.emoji, preset.scv, preset.sort, preset.target, preset.udp])
  async function save() {
    setSaving(true)
    try {
      await runAsync(async () => {
        await putJson("/api/presets", values)
        await reload(["presets"])
        toast.success("转换预设已保存")
      }, "保存转换预设...")
    } finally {
      setSaving(false)
    }
  }
  return (
    <Card>
      <CardHeader><CardTitle>默认转换预设</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label>目标客户端</Label>
          <Select value={values.target} onValueChange={target => setValues(current => ({ ...current, target }))}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{targets.map(target => <SelectItem key={target} value={target}>{target}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>远程配置</Label>
          <Input value={values.config} onChange={event => setValues(current => ({ ...current, config: event.target.value }))} placeholder="https://..." />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {(["emoji", "udp", "scv", "sort"] as const).map(key => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <Checkbox checked={Boolean(values[key])} onCheckedChange={checked => setValues(current => ({ ...current, [key]: Boolean(checked) }))} />
              {key}
            </label>
          ))}
        </div>
        <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : null}{saving ? "保存中..." : "保存预设"}</Button>
      </CardContent>
    </Card>
  )
}

function VendorOverrides() {
  const { vendors, reload, runAsync } = useData()
  const [editing, setEditing] = React.useState<Vendor | null>(null)
  const [open, setOpen] = React.useState(false)
  const [deletingId, setDeletingId] = React.useState("")
  const fields: Field[] = [
    { name: "name", label: "供应商名称", required: true },
    { name: "overrideExclude", label: "排除规则", type: "textarea" },
    { name: "overrideInclude", label: "包含规则", type: "textarea" },
    { name: "overrideRename", label: "重命名规则", type: "textarea" },
  ]
  async function save(values: FormValues) {
    await runAsync(async () => {
      if (editing?.id) await putJson(`/api/vendors/${editing.id}`, values)
      else await postJson("/api/vendors", values)
      await reload(["vendors"])
      toast.success("供应商配置已保存")
    }, "保存供应商配置...")
  }
  async function remove(item: Vendor) {
    if (!confirm("确认删除？")) return
    setDeletingId(item.id)
    try {
      await runAsync(async () => { await deleteJson(`/api/vendors/${item.id}`); await reload(["vendors"]) }, "删除供应商...")
    } finally {
      setDeletingId("")
    }
  }

  const columns = React.useMemo<ColumnDef<Vendor>[]>(() => [
    {
      accessorKey: "name",
      header: DataTableColumnHeader({ title: "名称" }),
      meta: { label: "名称" },
    },
    {
      accessorKey: "overrideExclude",
      header: DataTableColumnHeader({ title: "排除" }),
      meta: { label: "排除" },
      cell: ({ row }) => row.original.overrideExclude ? "已配置" : "-",
    },
    {
      accessorKey: "overrideInclude",
      header: DataTableColumnHeader({ title: "包含" }),
      meta: { label: "包含" },
      cell: ({ row }) => row.original.overrideInclude ? "已配置" : "-",
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => { setEditing(row.original); setOpen(true) }}>
            编辑
          </Button>
          <Button variant="ghost" size="icon" onClick={() => remove(row.original)} disabled={Boolean(deletingId)} aria-label="删除供应商覆写">
            {deletingId === row.original.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        </div>
      ),
      enableHiding: false,
      enableSorting: false,
    },
  ], [deletingId])

  return (
    <Card>
      <CardHeader><CardTitle>供应商覆写</CardTitle></CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={vendors}
          searchKey="name"
          searchPlaceholder="搜索供应商覆写..."
          emptyTitle="暂无供应商覆写"
          toolbar={<Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}><Plus />新增</Button>}
        />
      </CardContent>
      <SimpleFormDialog open={open} title={editing ? "编辑供应商" : "新增供应商"} fields={fields} initialValues={editing || {}} onOpenChange={setOpen} onSubmit={save} />
    </Card>
  )
}

function PlaceholderNodes() {
  const { placeholderNodes, reload, runAsync } = useData()
  const [editing, setEditing] = React.useState<PlaceholderNode | null>(null)
  const [open, setOpen] = React.useState(false)
  const [deletingId, setDeletingId] = React.useState("")
  const fields: Field[] = [
    { name: "tag", label: "标签", required: true },
    { name: "nodesText", label: "节点（每行一个）", type: "textarea", required: true },
  ]
  async function save(values: FormValues) {
    const nodes = String(values.nodesText || "").split(/\r?\n/).map(item => item.trim()).filter(Boolean)
    await runAsync(async () => {
      if (editing?.id) await putJson(`/api/placeholder-nodes/${editing.id}`, { tag: values.tag, nodes })
      else await postJson("/api/placeholder-nodes", { tag: values.tag, nodes })
      await reload(["placeholderNodes"])
      toast.success("占位节点已保存")
    }, "保存占位节点...")
  }
  async function remove(item: PlaceholderNode) {
    if (!confirm("确认删除？")) return
    setDeletingId(item.id)
    try {
      await runAsync(async () => { await deleteJson(`/api/placeholder-nodes/${item.id}`); await reload(["placeholderNodes"]) }, "删除占位节点...")
    } finally {
      setDeletingId("")
    }
  }

  const columns = React.useMemo<ColumnDef<PlaceholderNode>[]>(() => [
    {
      accessorKey: "tag",
      header: DataTableColumnHeader({ title: "标签" }),
      meta: { label: "标签" },
    },
    {
      id: "nodes",
      accessorFn: item => item.nodes.length,
      header: DataTableColumnHeader({ title: "节点数" }),
      meta: { label: "节点数" },
      cell: ({ row }) => row.original.nodes.length,
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => { setEditing(row.original); setOpen(true) }}>
            编辑
          </Button>
          <Button variant="ghost" size="icon" onClick={() => remove(row.original)} disabled={Boolean(deletingId)} aria-label="删除占位节点">
            {deletingId === row.original.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        </div>
      ),
      enableHiding: false,
      enableSorting: false,
    },
  ], [deletingId])

  return (
    <Card>
      <CardHeader><CardTitle>占位节点</CardTitle></CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={placeholderNodes}
          searchKey="tag"
          searchPlaceholder="搜索占位节点..."
          emptyTitle="暂无占位节点"
          toolbar={<Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}><Plus />新增</Button>}
        />
      </CardContent>
      <SimpleFormDialog open={open} title={editing ? "编辑占位节点" : "新增占位节点"} fields={fields} initialValues={editing ? { tag: editing.tag, nodesText: editing.nodes.join("\n") } : {}} onOpenChange={setOpen} onSubmit={save} />
    </Card>
  )
}

function PricingCard() {
  const { pricing, reload, runAsync } = useData()
  const [text, setText] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => setText(JSON.stringify(pricing, null, 2)), [pricing])
  async function save() {
    setSaving(true)
    try {
      await runAsync(async () => {
        await putJson("/api/pricing", JSON.parse(text || "[]"))
        await reload(["pricing"])
        toast.success("价格已保存")
      }, "保存价格...")
    } finally {
      setSaving(false)
    }
  }
  return (
    <Card>
      <CardHeader><CardTitle>价格表 JSON</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        <Textarea value={text} onChange={event => setText(event.target.value)} rows={12} />
        <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : null}{saving ? "保存中..." : "保存价格"}</Button>
      </CardContent>
    </Card>
  )
}
