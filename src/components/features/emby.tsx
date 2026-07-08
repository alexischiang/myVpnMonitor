import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { deleteJson, postJson, putJson } from "@/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DataTable, DataTableColumnHeader } from "@/components/features/data-table"
import { useData } from "@/components/features/data-provider"
import { SimpleFormDialog, type Field, type FormValues } from "@/components/features/simple-form"
import { PageHeader } from "@/components/features/shared"
import type { EmbyUser, EmbyVendor } from "@/types"
import { formatDate, formatMoney } from "@/utils"

export function EmbyPage() {
  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <PageHeader title="Emby" description="管理 Emby 账号供应商和客户账号。" />
      <Tabs defaultValue="users" className="grid gap-4">
        <TabsList>
          <TabsTrigger value="users">用户</TabsTrigger>
          <TabsTrigger value="vendors">供应商</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-0"><EmbyUsers /></TabsContent>
        <TabsContent value="vendors" className="mt-0"><EmbyVendors /></TabsContent>
      </Tabs>
    </div>
  )
}

function EmbyUsers() {
  const { embyUsers, embyVendors, reload, runAsync } = useData()
  const [editing, setEditing] = React.useState<EmbyUser | null>(null)
  const [open, setOpen] = React.useState(false)
  const fields: Field[] = [
    { name: "customerName", label: "客户名称", required: true },
    { name: "embyVendorId", label: "供应商", type: "select", required: true, options: embyVendors.map(v => ({ value: v.id, label: v.name })) },
    { name: "username", label: "用户名", required: true },
    { name: "password", label: "密码", type: "password", required: true },
    { name: "purchasedAt", label: "购买日期", type: "date" },
    { name: "expiresAt", label: "到期日期", type: "date" },
    { name: "cost", label: "成本", type: "number" },
    { name: "actualPaid", label: "实付", type: "number" },
    { name: "note", label: "备注", type: "textarea" },
  ]

  async function save(values: FormValues) {
    await runAsync(async () => {
      if (editing?.id) await putJson(`/api/emby-users/${editing.id}`, values)
      else await postJson("/api/emby-users", values)
      await reload(["embyUsers"])
      toast.success("Emby 用户已保存")
    }, "保存 Emby 用户...")
  }

  async function remove(item: EmbyUser) {
    if (!confirm("确认删除？")) return
    await runAsync(async () => {
      await deleteJson(`/api/emby-users/${item.id}`)
      await reload(["embyUsers"])
    }, "删除 Emby 用户...")
  }

  const columns = React.useMemo<ColumnDef<EmbyUser>[]>(() => [
    {
      id: "customer",
      accessorFn: item => `${item.customerName} ${item.username}`,
      header: DataTableColumnHeader({ title: "客户" }),
      meta: { label: "客户" },
      cell: ({ row }) => row.original.customerName,
    },
    {
      accessorKey: "embyVendorId",
      header: DataTableColumnHeader({ title: "供应商" }),
      meta: { label: "供应商" },
      cell: ({ row }) => embyVendors.find(v => v.id === row.original.embyVendorId)?.name || "-",
    },
    {
      accessorKey: "username",
      header: DataTableColumnHeader({ title: "账号" }),
      meta: { label: "账号" },
    },
    {
      accessorKey: "expiresAt",
      header: DataTableColumnHeader({ title: "到期" }),
      meta: { label: "到期" },
      cell: ({ row }) => formatDate(row.original.expiresAt),
    },
    {
      accessorKey: "actualPaid",
      header: DataTableColumnHeader({ title: "实付" }),
      meta: { label: "实付" },
      cell: ({ row }) => formatMoney(row.original.actualPaid),
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => { setEditing(row.original); setOpen(true) }}>
            编辑
          </Button>
          <Button variant="ghost" size="icon" onClick={() => remove(row.original)} aria-label="删除 Emby 用户">
            <Trash2 />
          </Button>
        </div>
      ),
      enableHiding: false,
      enableSorting: false,
    },
  ], [embyVendors])

  return (
    <Card>
      <CardContent>
        <DataTable
          columns={columns}
          data={embyUsers}
          searchKey="customer"
          searchPlaceholder="搜索 Emby 用户..."
          emptyTitle="暂无 Emby 用户"
          toolbar={<Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}><Plus />新增用户</Button>}
        />
      </CardContent>
      <SimpleFormDialog open={open} title={editing ? "编辑 Emby 用户" : "新增 Emby 用户"} fields={fields} initialValues={editing || { purchasedAt: new Date().toISOString().slice(0, 10) }} onOpenChange={setOpen} onSubmit={save} />
    </Card>
  )
}

function EmbyVendors() {
  const { embyVendors, reload, runAsync } = useData()
  const [editing, setEditing] = React.useState<EmbyVendor | null>(null)
  const [open, setOpen] = React.useState(false)
  const fields: Field[] = [
    { name: "name", label: "供应商名称", required: true },
    { name: "website", label: "官网", type: "url" },
    { name: "serversText", label: "服务器地址（每行一个）", type: "textarea", required: true },
    { name: "note", label: "备注", type: "textarea" },
  ]

  async function save(values: FormValues) {
    const servers = String(values.serversText || "").split(/\r?\n/).map(url => ({ url: url.trim(), label: "" })).filter(item => item.url)
    await runAsync(async () => {
      const payload = { ...values, servers }
      if (editing?.id) await putJson(`/api/emby-vendors/${editing.id}`, payload)
      else await postJson("/api/emby-vendors", payload)
      await reload(["embyVendors"])
      toast.success("Emby 供应商已保存")
    }, "保存供应商...")
  }

  async function remove(item: EmbyVendor) {
    if (!confirm("确认删除？")) return
    await runAsync(async () => {
      await deleteJson(`/api/emby-vendors/${item.id}`)
      await reload(["embyVendors"])
    }, "删除供应商...")
  }

  const columns = React.useMemo<ColumnDef<EmbyVendor>[]>(() => [
    {
      accessorKey: "name",
      header: DataTableColumnHeader({ title: "名称" }),
      meta: { label: "名称" },
    },
    {
      accessorKey: "website",
      header: DataTableColumnHeader({ title: "官网" }),
      meta: { label: "官网" },
      cell: ({ row }) => row.original.website || "-",
    },
    {
      id: "servers",
      accessorFn: item => item.servers?.length || 0,
      header: DataTableColumnHeader({ title: "服务器" }),
      meta: { label: "服务器" },
      cell: ({ row }) => row.original.servers?.length || 0,
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => { setEditing(row.original); setOpen(true) }}>
            编辑
          </Button>
          <Button variant="ghost" size="icon" onClick={() => remove(row.original)} aria-label="删除供应商">
            <Trash2 />
          </Button>
        </div>
      ),
      enableHiding: false,
      enableSorting: false,
    },
  ], [])

  return (
    <Card>
      <CardContent>
        <DataTable
          columns={columns}
          data={embyVendors}
          searchKey="name"
          searchPlaceholder="搜索供应商..."
          emptyTitle="暂无供应商"
          toolbar={<Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}><Plus />新增供应商</Button>}
        />
      </CardContent>
      <SimpleFormDialog open={open} title={editing ? "编辑供应商" : "新增供应商"} fields={fields} initialValues={editing ? { ...editing, serversText: editing.servers?.map(item => item.url).join("\n") } : {}} onOpenChange={setOpen} onSubmit={save} />
    </Card>
  )
}
