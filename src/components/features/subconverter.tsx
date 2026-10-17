import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { CircleHelp, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "@/components/features/toast"

import { deleteJson, postJson, putJson } from "@/api"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { DataTable, DataTableColumnHeader, DataTableRowActions } from "@/components/features/arc-data-table"
import { useData } from "@/components/features/data-provider"
import { SimpleFormDialog, type Field as SimpleFormField, type FormValues } from "@/components/features/simple-form"
import { PageHeader } from "@/components/features/shared"
import type { PlaceholderNode, Preset, Vendor } from "@/types"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Input } from "@/components/arc/input/input"
import { Select } from "@/components/arc/select/select"
import { Switch } from "@/components/arc/switch/switch"

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
type PresetValues = { target: string; config: string; postSubconverter: boolean; nextinCompatible: boolean } & Record<BooleanOptionKey, boolean>

function presetValues(preset: Preset): PresetValues {
  return {
    target: preset.target || "clash",
    config: preset.config || "",
    postSubconverter: preset.postSubconverter !== false,
    nextinCompatible: preset.nextinCompatible === true,
    ...Object.fromEntries(booleanOptions.map(option => [option.key, preset[option.key] ?? option.defaultValue])) as Record<BooleanOptionKey, boolean>,
  }
}
export function SubconverterPage() {
  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <PageHeader title="Subconverter" description="订阅转换预设、供应商覆写与占位节点配置。" />
      <Tabs defaultValue="preset" className="min-w-0 gap-4">
        <TabsList>
          <TabsTrigger value="preset">转换预设</TabsTrigger>
          <TabsTrigger value="vendors">供应商覆写</TabsTrigger>
          <TabsTrigger value="placeholders">占位节点</TabsTrigger>
        </TabsList>
        <TabsContent value="preset" className="grid min-w-0 gap-4"><PresetCard /></TabsContent>
        <TabsContent value="vendors" className="min-w-0"><VendorOverrides /></TabsContent>
        <TabsContent value="placeholders" className="min-w-0"><PlaceholderNodes /></TabsContent>
      </Tabs>
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
        toast({ type: "success", title: "转换预设已保存" })
      }, "保存转换预设...")
    } finally {
      setSaving(false)
    }
  }
  return (
    <>
      <Card title={<Label htmlFor="post-subconverter" className="text-base">执行 postSubconverter</Label>} description="关闭后直接返回 Subconverter 的原始转换结果。" headerAction={<Switch id="post-subconverter" checked={values.postSubconverter} onCheckedChange={postSubconverter => setValues(current => ({ ...current, postSubconverter }))} />}><Field orientation="horizontal" className="justify-between">
            <FieldContent className="flex flex-row items-center gap-1.5">
              <FieldLabel htmlFor="nextin-compatible">Nextin 适配</FieldLabel>
              <Tooltip content="开启后从 postSubconverter 结果中排除 global-client-fingerprint。"><button type="button" aria-label="Nextin 适配说明"><CircleHelp className="size-4 text-muted-foreground" /></button></Tooltip>
            </FieldContent>
            <Switch id="nextin-compatible" checked={values.nextinCompatible} disabled={!values.postSubconverter} onCheckedChange={nextinCompatible => setValues(current => ({ ...current, nextinCompatible }))} />
          </Field></Card>
      <Card title="默认转换预设"><div className="grid gap-4">
          <Select label="目标客户端" value={values.target} onValueChange={target => setValues(current => ({ ...current, target }))} className="w-full" options={[...targets.map(target => ({ value: target, label: target }))]} />
          <Input label="远程配置" value={values.config} onChange={event => setValues(current => ({ ...current, config: event.target.value }))} placeholder="https://..." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {booleanOptions.map(option => (
              <Label key={option.key} htmlFor={`preset-${option.key}`} className="flex items-center gap-2">
                <Checkbox id={`preset-${option.key}`} checked={values[option.key]} onCheckedChange={checked => setValues(current => ({ ...current, [option.key]: checked === true }))} />
                {option.label} ({option.key})
              </Label>
            ))}
          </div>
          <ActionButton onClick={save} label="保存预设" pendingLabel="保存中..." pending={saving} />
        </div></Card>
    </>
  )
}

function VendorOverrides() {
  const { subscriptions, vendors, reload, runAsync } = useData()
  const [editing, setEditing] = React.useState<Vendor | null>(null)
  const [open, setOpen] = React.useState(false)
  const providerNames = React.useMemo(() => [...new Set(subscriptions.map(item => item.serviceProvider || item.provider).filter((name): name is string => Boolean(name)))].sort(), [subscriptions])
  const vendorRows = React.useMemo(() => providerNames.map(name => vendors.find(vendor => vendor.name === name) || { id: `provider:${name}`, name }), [providerNames, vendors])
  const fields = React.useMemo<SimpleFormField[]>(() => [
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
      toast({ type: "success", title: "供应商配置已保存" })
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
      cell: ({ row }) => <DataTableRowActions actions={[{ label: "编辑", onSelect: () => { setEditing(row.original); setOpen(true) } }]} />,
      enableHiding: false,
      enableSorting: false,
    },
  ], [])

  return (
    <Card title="供应商覆写"><DataTable
          columns={columns}
          data={vendorRows}
          searchKey="name"
          searchPlaceholder="搜索供应商..."
          emptyTitle="暂无订阅池供应商"
        /><SimpleFormDialog open={open} title={`编辑 ${editing?.name || ""} 覆写`} description="规则留空时使用默认转换配置。" fields={fields} initialValues={editing || {}} contentClassName="sm:max-w-2xl" onOpenChange={setOpen} onSubmit={save} /></Card>
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
      toast({ type: "success", title: "占位节点已保存" })
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
      cell: ({ row }) => <DataTableRowActions actions={[{ label: "编辑", onSelect: () => { setEditing(row.original); setOpen(true) } }, { label: "删除", icon: <Trash2 size={15} />, destructive: true, disabled: Boolean(deletingId), onSelect: () => remove(row.original) }]} />,
      enableHiding: false,
      enableSorting: false,
    },
  ], [deletingId])

  return (
    <Card title="占位节点"><DataTable
          columns={columns}
          data={placeholderNodes}
          searchKey="tag"
          searchPlaceholder="搜索占位节点..."
          emptyTitle="暂无占位节点"
          toolbar={<Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}><Plus />新增</Button>}
        /><SimpleFormDialog open={open} title={editing ? "编辑占位节点" : "新增占位节点"} fields={fields} initialValues={editing ? { tag: editing.tag, nodesText: editing.nodes.join("\n") } : {}} onOpenChange={setOpen} onSubmit={save} /></Card>
  )
}
