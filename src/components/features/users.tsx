import * as React from "react"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { ExternalLink, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { deleteJson, postJson, putJson } from "@/api"
import { Button } from "@/components/ui/button"
import { DataTable, DataTableColumnHeader } from "@/components/features/data-table"
import { useData } from "@/components/features/data-provider"
import { SimpleFormDialog, type Field, type FormValues } from "@/components/features/simple-form"
import { CopyButton, PageHeader, StatusBadge } from "@/components/features/shared"
import type { User } from "@/types"
import { absoluteUrl, formatDate, formatMoney, userStatus } from "@/utils"

export function UsersPage() {
  const { users, subscriptions, reload, runAsync } = useData()
  const [editing, setEditing] = React.useState<User | null>(null)
  const [open, setOpen] = React.useState(false)

  const fields: Field[] = [
    { name: "userId", label: "用户 ID", required: true },
    { name: "wechatName", label: "微信名" },
    { name: "imessage", label: "iMessage / 邮箱", type: "email" },
    { name: "subscriptionId", label: "绑定订阅池", type: "select", required: true, options: subscriptions.map(item => ({ value: item.id, label: `${item.serviceProvider || item.provider || "Provider"} - ${item.email || item.url.slice(-8)}` })) },
    { name: "activeGroup", label: "套餐", type: "select", options: ["basic", "pro", "ultra"].map(value => ({ value, label: value.toUpperCase() })) },
    { name: "vipLevel", label: "VIP", type: "select", options: ["vip1", "vip2", "vip3"].map(value => ({ value, label: value.toUpperCase() })) },
    { name: "duration", label: "周期", type: "select", options: ["monthly", "quarterly", "half_yearly", "yearly", "lifetime", "custom"].map(value => ({ value, label: value })) },
    { name: "purchasedAt", label: "购买日期", type: "date" },
    { name: "expiresAt", label: "到期日期", type: "date" },
    { name: "actualPaid", label: "实付金额", type: "number" },
    { name: "note", label: "备注", type: "textarea" },
  ]

  async function save(values: FormValues) {
    await runAsync(async () => {
      const payload = {
        ...values,
        outputMode: "subconverter",
        blockUserinfo: true,
        purchasedAt: values.purchasedAt || new Date().toISOString().slice(0, 10),
      }
      if (editing?.id) {
        await putJson(`/api/users/${editing.id}`, payload)
        toast.success("用户已更新")
      } else {
        await postJson("/api/users", payload)
        toast.success("用户已创建")
      }
      await reload(["users", "bills"])
    }, "保存用户...")
  }

  async function remove(item: User) {
    if (!confirm("确认删除该用户？")) return
    await runAsync(async () => {
      await deleteJson(`/api/users/${item.id}`)
      await reload(["users", "bills"])
      toast.success("用户已删除")
    }, "删除用户...")
  }

  function deliveryUrl(user: User) {
    return user.deliveryToken ? absoluteUrl(`/delivery/${user.deliveryToken}`) : ""
  }

  const columns = React.useMemo<ColumnDef<User>[]>(() => [
    {
      id: "user",
      accessorFn: item => `${item.userId || ""} ${item.wechatName || ""} ${item.imessage || ""} ${item.email || ""}`,
      header: DataTableColumnHeader({ title: "用户" }),
      meta: { label: "用户" },
      cell: ({ row }) => <div className="truncate font-medium">{row.original.userId || "-"}</div>,
    },
    {
      id: "plan",
      accessorFn: item => `${item.activeGroup || ""} ${item.vipLevel || ""}`,
      header: DataTableColumnHeader({ title: "套餐" }),
      meta: { label: "套餐" },
      cell: ({ row }) => `${row.original.activeGroup || "-"} / ${row.original.vipLevel || "-"}`,
    },
    {
      id: "subscription",
      accessorFn: item => `${item.subscription?.email || ""} ${item.subscription?.serviceProvider || ""}`,
      header: DataTableColumnHeader({ title: "订阅池" }),
      meta: { label: "订阅池" },
      cell: ({ row }) => (
        <div className="truncate">
          {row.original.subscription?.email || row.original.subscription?.serviceProvider || "-"}
        </div>
      ),
    },
    {
      accessorKey: "expiresAt",
      header: DataTableColumnHeader({ title: "到期" }),
      meta: { label: "到期" },
      cell: ({ row }) => formatDate(row.original.expiresAt),
    },
    {
      accessorKey: "actualPaid",
      header: DataTableColumnHeader({ title: "消费" }),
      meta: { label: "消费" },
      cell: ({ row }) => formatMoney(row.original.actualPaid),
    },
    {
      id: "status",
      accessorFn: item => userStatus(item),
      header: DataTableColumnHeader({ title: "状态" }),
      meta: { label: "状态" },
      cell: ({ row }) => <StatusBadge status={userStatus(row.original)} />,
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => {
        const item = row.original
        return (
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon">
              <Link to={`/users/detail/${item.id}`} aria-label="查看用户">
                <ExternalLink />
              </Link>
            </Button>
            {deliveryUrl(item) && <CopyButton value={deliveryUrl(item)} label="" />}
            <Button variant="ghost" size="sm" onClick={() => { setEditing(item); setOpen(true) }}>
              编辑
            </Button>
            <Button variant="ghost" size="icon" onClick={() => remove(item)} aria-label="删除用户">
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
        title="用户"
        description="客户订阅、到期日、交付链接和账单入口。"
        actions={
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>
            <Plus />
            新增用户
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={users}
        searchKey="user"
        searchPlaceholder="搜索用户..."
        emptyTitle="暂无用户"
      />

      <SimpleFormDialog
        open={open}
        title={editing ? "编辑用户" : "新增用户"}
        fields={fields}
        initialValues={editing || { activeGroup: "pro", vipLevel: "vip1", duration: "monthly", purchasedAt: new Date().toISOString().slice(0, 10) }}
        onOpenChange={setOpen}
        onSubmit={save}
      />
    </div>
  )
}
