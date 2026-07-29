import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { deleteJson, postJson, putJson } from "@/api"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { DataTable, DataTableColumnHeader, DataTableRowActions } from "@/components/features/data-table"
import { useData } from "@/components/features/data-provider"
import { SimpleFormDialog, type Field, type FormValues } from "@/components/features/simple-form"
import { PageHeader } from "@/components/features/shared"
import type { PlaceholderNode, Preset, Vendor } from "@/types"

const targets = ["clash", "clashr", "quan", "quanx", "loon", "surge&ver=4", "surge&ver=3", "shadowrocket", "v2ray", "mixed"]
const booleanOptions = [
  { key: "emoji", label: "节点 Emoji", defaultValue: true },
  { key: "udp", label: "UDP", defaultValue: true },
  { key: "tfo", label: "TCP Fast Open", defaultValue: false },
  { key: "scv", label: "跳过证书验证", defaultValue: false },
  { key: "sort", label: "节点排序", defaultValue: false },
  { key: "list", label: "仅输出节点列表", defaultValue: false },
  { key: "fdn", label: "过滤不支持节点", defaultValue: true },
  { key: "insert", label: "插入预设订阅", defaultValue: true },
  { key: "expand", label: "展开规则", defaultValue: true },
  { key: "classic", label: "Clash 经典规则", defaultValue: false },
  { key: "new_name", label: "Clash 新字段名", defaultValue: false },
  { key: "append_type", label: "附加节点类型", defaultValue: false },
  { key: "append_info", label: "附加流量信息", defaultValue: true },
  { key: "strict", label: "Surge 强制更新", defaultValue: false },
] as const
type BooleanOptionKey = typeof booleanOptions[number]["key"]
type PresetValues = { target: string; config: string; postSubconverter: boolean } & Record<BooleanOptionKey, boolean>

function presetValues(preset: Preset): PresetValues {
  return {
    target: preset.target || "clash",
    config: preset.config || "",
    postSubconverter: preset.postSubconverter !== false,
    ...Object.fromEntries(booleanOptions.map(option => [option.key, preset[option.key] ?? option.defaultValue])) as Record<BooleanOptionKey, boolean>,
  }
}
export function SubconverterPage() {
  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <PageHeader title="Subconverter" description="订阅转换预设、供应商覆写与占位节点配置。" />
      <div className="grid gap-4">
        <PresetCard />
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
  const [values, setValues] = React.useState(() => presetValues(preset))
  React.useEffect(() => {
    setValues(presetValues(preset))
  }, [preset])
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
    <>
      <Card>
        <CardHeader>
          <CardTitle><Label htmlFor="post-subconverter">执行 postSubconverter</Label></CardTitle>
          <CardDescription>关闭后直接返回 Subconverter 的原始转换结果。</CardDescription>
          <CardAction>
            <Switch
              id="post-subconverter"
              checked={values.postSubconverter}
              onCheckedChange={postSubconverter => setValues(current => ({ ...current, postSubconverter }))}
            />
          </CardAction>
        </CardHeader>
      </Card>
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {booleanOptions.map(option => (
              <Label key={option.key} htmlFor={`preset-${option.key}`} className="flex items-center gap-2">
                <Checkbox id={`preset-${option.key}`} checked={values[option.key]} onCheckedChange={checked => setValues(current => ({ ...current, [option.key]: checked === true }))} />
                {option.label} ({option.key})
              </Label>
            ))}
          </div>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : null}{saving ? "保存中..." : "保存预设"}</Button>
        </CardContent>
      </Card>
    </>
  )
}

function VendorOverrides() {
  const { subscriptions, vendors, reload, runAsync } = useData()
  const [editing, setEditing] = React.useState<Vendor | null>(null)
  const [open, setOpen] = React.useState(false)
  const providerNames = React.useMemo(() => [...new Set(subscriptions.map(item => item.serviceProvider || item.provider).filter((name): name is string => Boolean(name)))].sort(), [subscriptions])
  const vendorRows = React.useMemo(() => providerNames.map(name => vendors.find(vendor => vendor.name === name) || { id: `provider:${name}`, name }), [providerNames, vendors])
  const fields = React.useMemo<Field[]>(() => [
    { name: "overrideExclude", label: "排除规则", type: "textarea", rows: 5, className: "sm:col-span-1" },
    { name: "overrideInclude", label: "包含规则", type: "textarea", rows: 5, className: "sm:col-span-1" },
    { name: "overrideRename", label: "重命名规则", type: "textarea", rows: 4 },
  ], [])
  async function save(values: FormValues) {
    if (!editing) return
    const vendor = vendors.find(item => item.name === editing.name)
    await runAsync(async () => {
      if (vendor) await putJson(`/api/vendors/${vendor.id}`, values)
      else await postJson("/api/vendors", { ...values, name: editing.name })
      await reload(["vendors"])
      toast.success("供应商配置已保存")
    }, "保存供应商配置...")
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
      cell: ({ row }) => <DataTableRowActions><DropdownMenuItem onSelect={() => { setEditing(row.original); setOpen(true) }}>编辑</DropdownMenuItem></DataTableRowActions>,
      enableHiding: false,
      enableSorting: false,
    },
  ], [])

  return (
    <Card>
      <CardHeader><CardTitle>供应商覆写</CardTitle></CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={vendorRows}
          searchKey="name"
          searchPlaceholder="搜索供应商..."
          emptyTitle="暂无订阅池供应商"
        />
      </CardContent>
      <SimpleFormDialog open={open} title={`编辑 ${editing?.name || ""} 覆写`} description="规则留空时使用默认转换配置。" fields={fields} initialValues={editing || {}} contentClassName="sm:max-w-2xl" onOpenChange={setOpen} onSubmit={save} />
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
      cell: ({ row }) => <DataTableRowActions>
        <DropdownMenuItem onSelect={() => { setEditing(row.original); setOpen(true) }}>编辑</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => remove(row.original)} disabled={Boolean(deletingId)}>
          {deletingId === row.original.id ? <Loader2 className="animate-spin" /> : <Trash2 />}删除
        </DropdownMenuItem>
      </DataTableRowActions>,
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
