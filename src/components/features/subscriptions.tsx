import * as React from "react"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { Eye, Plus, Power, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { deleteJson, postJson, putJson } from "@/api"
import { Button } from "@/components/ui/button"
import { DataTable, DataTableColumnHeader } from "@/components/features/data-table"
import { useData } from "@/components/features/data-provider"
import { SimpleFormDialog, type Field, type FormValues } from "@/components/features/simple-form"
import { PageHeader, StatusBadge, TrafficProgress, UrlCell } from "@/components/features/shared"
import type { Subscription } from "@/types"
import { formatDate } from "@/utils"

const fields: Field[] = [
  { name: "url", label: "订阅 URL", type: "url", required: true, placeholder: "https://...", className: "sm:col-span-2" },
  { name: "email", label: "邮箱", type: "email", placeholder: "customer@example.com" },
  { name: "serviceProvider", label: "供应商", type: "text", placeholder: "YKK Cloud" },
  { name: "note", label: "备注", type: "textarea", rows: 3, placeholder: "套餐、来源或其他备注", className: "sm:col-span-2" },
]

export function SubscriptionsPage() {
  const { subscriptions, reload, runAsync, busy } = useData()
  const [editing, setEditing] = React.useState<Subscription | null>(null)
  const [open, setOpen] = React.useState(false)

  async function save(values: FormValues) {
    await runAsync(async () => {
      if (editing?.id) {
        await putJson(`/api/subscriptions/${editing.id}`, values)
        toast.success("订阅已更新")
      } else {
        const created = await postJson<Subscription>("/api/subscriptions", values)
        await postJson(`/api/subscriptions/${created.id}/refresh`, {})
        toast.success("订阅已创建")
      }
      await reload(["subscriptions"])
    }, "保存订阅...")
  }

  async function remove(item: Subscription) {
    if (!confirm("确认删除该订阅？")) return
    await runAsync(async () => {
      await deleteJson(`/api/subscriptions/${item.id}`)
      await reload(["subscriptions"])
      toast.success("订阅已删除")
    }, "删除订阅...")
  }

  async function refresh(item?: Subscription) {
    await runAsync(async () => {
      if (item) await postJson(`/api/subscriptions/${item.id}/refresh`, {})
      else await postJson("/api/subscriptions/cache-refresh", {})
      await reload(["subscriptions"])
      toast.success("刷新完成")
    }, "刷新订阅指标...")
  }

  async function toggleEnabled(item: Subscription) {
    await runAsync(async () => {
      const enabled = item.enabled === false
      await putJson(`/api/subscriptions/${item.id}`, { enabled })
      await reload(["subscriptions"])
      toast.success(enabled ? "订阅池已启用" : "订阅池已停用")
    }, item.enabled === false ? "启用订阅池..." : "停用订阅池...")
  }

  const sortedSubscriptions = React.useMemo(() => [...subscriptions].sort((left, right) => (Date.parse(right.metrics?.expireAt || "") || 0) - (Date.parse(left.metrics?.expireAt || "") || 0)), [subscriptions])

  const columns = React.useMemo<ColumnDef<Subscription>[]>(() => [
    {
      id: "subscription",
      accessorFn: item => `${item.email || item.name || ""} ${item.serviceProvider || item.provider || ""} ${item.note || ""} ${item.url || ""}`,
      header: DataTableColumnHeader({ title: "订阅" }),
      meta: { label: "订阅" },
      cell: ({ row }) => {
        const item = row.original
        return (
          <div className="grid gap-1">
            <div className="truncate font-medium">{item.email || item.name || "未命名订阅"}</div>
            <div className="truncate text-sm text-muted-foreground">{item.serviceProvider || item.provider || "Provider"}</div>
          </div>
        )
      },
    },
    {
      accessorKey: "url",
      header: "URL",
      meta: { label: "URL" },
      cell: ({ row }) => <UrlCell value={row.original.url} />,
      enableSorting: false,
    },
    {
      accessorKey: "customerCount",
      header: DataTableColumnHeader({ title: "客户" }),
      meta: { label: "客户" },
      cell: ({ row }) => row.original.customerCount || 0,
    },
    {
      id: "traffic",
      header: "流量",
      meta: { label: "流量" },
      cell: ({ row }) => (
        <TrafficProgress
          remaining={row.original.metrics?.remainingBytes}
          total={row.original.metrics?.totalBytes}
        />
      ),
      enableSorting: false,
    },
    {
      accessorFn: item => item.metrics?.expireAt || "",
      id: "expires",
      header: DataTableColumnHeader({ title: "到期" }),
      meta: { label: "到期" },
      cell: ({ row }) => formatDate(row.original.metrics?.expireAt),
    },
    {
      accessorKey: "status",
      header: DataTableColumnHeader({ title: "状态" }),
      meta: { label: "状态" },
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => {
        const item = row.original
        return (
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon">
              <Link to={`/urls/detail/${item.id}`} aria-label="查看订阅">
                <Eye />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => refresh(item)} aria-label="刷新订阅">
              <RefreshCw />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toggleEnabled(item)}><Power />{item.enabled === false ? "启用" : "停用"}</Button>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(item); setOpen(true) }}>
              编辑
            </Button>
            <Button variant="ghost" size="icon" onClick={() => remove(item)} aria-label="删除订阅">
              <Trash2 />
            </Button>
          </div>
        )
      },
      enableHiding: false,
      enableSorting: false,
    },
  ], [])

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <PageHeader
        title="订阅池"
        description="管理上游订阅 URL、缓存状态、客户绑定与流量到期指标。"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refresh()} disabled={!!busy}>
              <RefreshCw />
              全部刷新
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>
              <Plus />
              新增订阅
            </Button>
          </>
        }
      />

      <DataTable
        columns={columns}
        data={sortedSubscriptions}
        searchKey="subscription"
        searchPlaceholder="搜索订阅..."
        emptyTitle="暂无订阅"
      />

      <SimpleFormDialog
        open={open}
        title={editing ? "编辑订阅" : "新增订阅"}
        description="粘贴上游订阅地址，保存后会自动刷新一次指标。"
        fields={fields}
        initialValues={editing || {}}
        submitLabel={editing ? "保存修改" : "保存并刷新"}
        contentClassName="sm:max-w-2xl"
        onOpenChange={setOpen}
        onSubmit={save}
      />
    </div>
  )
}
