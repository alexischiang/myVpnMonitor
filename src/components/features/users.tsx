import * as React from "react"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { deleteJson, postJson, putJson } from "@/api"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable, DataTableColumnHeader } from "@/components/features/data-table"
import { useData } from "@/components/features/data-provider"
import { CopyButton, PageHeader, StatusBadge } from "@/components/features/shared"
import { UserFormDialog, type UserFormValues } from "@/components/features/user-form-dialog"
import type { User } from "@/types"
import { absoluteUrl, formatDate, formatMoney, userStatus } from "@/utils"

export function UsersPage() {
  const { users, subscriptions, reload, runAsync } = useData()
  const [editing, setEditing] = React.useState<User | null>(null)
  const [open, setOpen] = React.useState(false)
  const [poolUser, setPoolUser] = React.useState<User | null>(null)
  const [poolId, setPoolId] = React.useState("")
  const [poolSaving, setPoolSaving] = React.useState(false)
  const [allowDisabledPool, setAllowDisabledPool] = React.useState(false)
  const currentPool = subscriptions.find(item => item.id === poolUser?.subscriptionId)
  const selectablePools = React.useMemo(() => subscriptions
    .filter(item => Date.parse(item.metrics?.expireAt || "") > Date.now() && (allowDisabledPool || item.enabled !== false))
    .sort((left, right) => (Date.parse(right.metrics?.expireAt || "") || 0) - (Date.parse(left.metrics?.expireAt || "") || 0)), [subscriptions, allowDisabledPool])

  async function changePool(event: React.FormEvent) {
    event.preventDefault()
    if (!poolUser || !poolId || poolId === poolUser.subscriptionId) return
    setPoolSaving(true)
    try {
      await postJson(`/api/users/${poolUser.id}/pool`, { subscriptionId: poolId, allowDisabled: allowDisabledPool })
      await reload(["users"])
      toast.success("用户订阅池已更新")
      setPoolUser(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "换池失败")
    } finally {
      setPoolSaving(false)
    }
  }

  async function save(values: UserFormValues) {
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
      id: "email",
      accessorFn: item => item.accountStatus === "active" ? item.email || "" : "未认领",
      header: DataTableColumnHeader({ title: "邮箱" }),
      meta: { label: "邮箱" },
      cell: ({ row }) => row.original.accountStatus === "active" ? row.original.email || "-" : "未认领",
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
            <Button variant="ghost" size="sm" onClick={() => { setPoolUser(item); setPoolId(""); setAllowDisabledPool(false) }}><RefreshCw />换池</Button>
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

      <UserFormDialog
        open={open}
        user={editing}
        subscriptions={subscriptions}
        onOpenChange={setOpen}
        onSubmit={save}
      />
      <Dialog open={Boolean(poolUser)} onOpenChange={open => { if (!open) setPoolUser(null) }}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={changePool}>
            <DialogHeader><DialogTitle>手动换池</DialogTitle><DialogDescription>当前池：{currentPool ? `${currentPool.serviceProvider || currentPool.provider || "Provider"} - ${currentPool.email || currentPool.url} · 到期 ${formatDate(currentPool.metrics?.expireAt)}` : "未绑定"}</DialogDescription></DialogHeader>
            <div className="grid gap-2"><Label htmlFor="manual-pool">目标订阅池</Label><Select value={poolId} onValueChange={setPoolId}><SelectTrigger id="manual-pool" className="w-full"><SelectValue placeholder="请选择订阅池" /></SelectTrigger><SelectContent>{selectablePools.map(item => <SelectItem key={item.id} value={item.id}>{item.serviceProvider || item.provider || "Provider"} - {item.email || item.url} · 到期 {formatDate(item.metrics?.expireAt)}{item.enabled === false ? " · 未启用" : ""}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex items-center gap-2"><Checkbox id="allow-disabled-pool" checked={allowDisabledPool} onCheckedChange={checked => { const enabled = checked === true; setAllowDisabledPool(enabled); if (!enabled && subscriptions.find(item => item.id === poolId)?.enabled === false) setPoolId("") }} /><Label htmlFor="allow-disabled-pool">使用未启用池</Label></div>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose><Button type="submit" disabled={poolSaving || !poolId || poolId === poolUser?.subscriptionId}>{poolSaving ? <RefreshCw className="animate-spin" /> : <RefreshCw />}确认换池</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
