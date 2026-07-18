import * as React from "react"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { Copy, ExternalLink, Gift, Loader2, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { deleteJson, postJson, putJson } from "@/api"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTableCard } from "@/components/features/data-table-card"
import { DataTable, DataTableColumnHeader } from "@/components/features/data-table"
import { useData } from "@/components/features/data-provider"
import { CopyButton, UserStatusBadge } from "@/components/features/shared"
import { UserFormDialog, type UserFormValues } from "@/components/features/user-form-dialog"
import { VipBadge } from "@/components/features/vip-badge"
import type { User } from "@/types"
import { absoluteUrl, formatDate, formatMoney, userStatus } from "@/utils"

type GiftPreview = {
  expiresAt: string
  subscription: User["subscription"] | null
  reason?: string
}

export function UsersPage() {
  const { users, subscriptions, pricing, reload, runAsync } = useData()
  const [editing, setEditing] = React.useState<User | null>(null)
  const [open, setOpen] = React.useState(false)
  const [deleteUser, setDeleteUser] = React.useState<User | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [poolUser, setPoolUser] = React.useState<User | null>(null)
  const [poolId, setPoolId] = React.useState("")
  const [poolSaving, setPoolSaving] = React.useState(false)
  const [allowDisabledPool, setAllowDisabledPool] = React.useState(false)
  const [giftUser, setGiftUser] = React.useState<User | null>(null)
  const [accountFilter, setAccountFilter] = React.useState("all")
  const [planFilter, setPlanFilter] = React.useState("all")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [giftDays, setGiftDays] = React.useState("")
  const [giftExpiresAt, setGiftExpiresAt] = React.useState("")
  const [giftPoolId, setGiftPoolId] = React.useState("")
  const [giftMessage, setGiftMessage] = React.useState("")
  const [giftError, setGiftError] = React.useState("")
  const [giftPreviewing, setGiftPreviewing] = React.useState(false)
  const [giftSaving, setGiftSaving] = React.useState(false)
  const currentPool = subscriptions.find(item => item.id === poolUser?.subscriptionId)
  const selectablePools = React.useMemo(() => subscriptions
    .filter(item => Date.parse(item.metrics?.expireAt || "") > Date.now() && (allowDisabledPool || item.enabled !== false))
    .sort((left, right) => (Date.parse(right.metrics?.expireAt || "") || 0) - (Date.parse(left.metrics?.expireAt || "") || 0)), [subscriptions, allowDisabledPool])
  const giftPools = React.useMemo(() => subscriptions
    .filter(item => item.enabled !== false && Date.parse(item.metrics?.expireAt || "") > Date.now())
    .sort((left, right) => (Date.parse(right.metrics?.expireAt || "") || 0) - (Date.parse(left.metrics?.expireAt || "") || 0)), [subscriptions])
  const planOptions = React.useMemo(() => [...new Set(users.map(item => item.activeGroup).filter((value): value is string => Boolean(value)))].sort(), [users])
  const filteredUsers = React.useMemo(() => users.filter(item =>
    (accountFilter === "all" || (item.accountStatus || "unclaimed") === accountFilter) &&
    (planFilter === "all" || item.activeGroup === planFilter) &&
    (statusFilter === "all" || userStatus(item) === statusFilter)
  ), [users, accountFilter, planFilter, statusFilter])

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

  function openGift(item: User) {
    setGiftUser(item)
    setGiftDays("")
    setGiftExpiresAt("")
    setGiftPoolId("")
    setGiftMessage("")
    setGiftError("")
  }

  async function previewGift() {
    if (!giftUser) return
    const days = Number(giftDays)
    if (!Number.isSafeInteger(days) || days <= 0) {
      setGiftError("请输入正确的赠送天数")
      return
    }
    setGiftPreviewing(true)
    setGiftError("")
    try {
      const preview = await postJson<GiftPreview>(`/api/users/${giftUser.id}/gift`, { days, preview: true })
      setGiftExpiresAt(preview.expiresAt)
      setGiftPoolId(preview.subscription?.id || "")
      setGiftMessage(preview.subscription ? "已根据赠送后的到期日推荐订阅池，可手动更换。" : preview.reason || "暂无推荐订阅池，请手动选择。")
    } catch (error) {
      setGiftError(error instanceof Error ? error.message : "计算赠送时长失败")
    } finally {
      setGiftPreviewing(false)
    }
  }

  async function submitGift(event: React.FormEvent) {
    event.preventDefault()
    if (!giftUser || !giftExpiresAt || !giftPoolId) return
    setGiftSaving(true)
    try {
      await postJson(`/api/users/${giftUser.id}/gift`, { days: Number(giftDays), subscriptionId: giftPoolId })
      await reload(["users"])
      toast.success("赠送时长已生效")
      setGiftUser(null)
    } catch (error) {
      setGiftError(error instanceof Error ? error.message : "赠送时长失败")
    } finally {
      setGiftSaving(false)
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

  function remove(item: User) {
    setDeleteUser(item)
  }

  async function confirmRemove() {
    if (!deleteUser) return
    const item = deleteUser
    setDeleting(true)
    try {
      await runAsync(async () => {
        await deleteJson(`/api/users/${item.id}`)
        await reload(["users", "bills"])
        toast.success("用户已删除")
      }, "删除用户...")
      setDeleteUser(null)
    } finally {
      setDeleting(false)
    }
  }

  function deliveryUrl(user: User) {
    return user.deliveryToken ? absoluteUrl(`/delivery/${user.deliveryToken}`) : ""
  }

  function renderMobileUser(item: User) {
    const claimed = item.accountStatus === "active"
    return <Item variant="outline"><ItemContent><ItemTitle className="flex w-full items-center gap-2"><span className="truncate">{claimed ? item.email || item.userId || "-" : item.userId || "-"}</span><UserStatusBadge user={item} /><VipBadge level={item.vipLevel} /></ItemTitle><ItemDescription>到期 {formatDate(item.expiresAt)} · 总消费 {formatMoney(item.actualPaid)}</ItemDescription></ItemContent><ItemActions><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="用户操作"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to={`/users/detail/${item.id}`}><ExternalLink />查看详情</Link></DropdownMenuItem>{deliveryUrl(item) ? <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(deliveryUrl(item)).then(() => toast.success("交付链接已复制"))}><Copy />复制交付链接</DropdownMenuItem> : null}<DropdownMenuItem onSelect={() => { setPoolUser(item); setPoolId(""); setAllowDisabledPool(false) }}><RefreshCw />更换订阅池</DropdownMenuItem><DropdownMenuItem onSelect={() => openGift(item)}><Gift />赠送时长</DropdownMenuItem>{!claimed ? <DropdownMenuItem onSelect={() => { setEditing(item); setOpen(true) }}><Pencil />编辑</DropdownMenuItem> : null}{!claimed ? <DropdownMenuItem variant="destructive" onSelect={() => void remove(item)}><Trash2 />删除</DropdownMenuItem> : null}</DropdownMenuContent></DropdownMenu></ItemActions></Item>
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
      cell: ({ row }) => <UserStatusBadge user={row.original} />,
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => {
        const item = row.original
        return (
          <div className="flex w-max items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`/users/detail/${item.id}`} aria-label="查看用户">
                <ExternalLink />
                详情
              </Link>
            </Button>
            {deliveryUrl(item) && <CopyButton value={deliveryUrl(item)} label="" />}
            <Button variant="outline" size="sm" onClick={() => { setPoolUser(item); setPoolId(""); setAllowDisabledPool(false) }}><RefreshCw />换池</Button>
            <Button variant="outline" size="sm" onClick={() => openGift(item)}><Gift />赠送</Button>
            {item.accountStatus !== "active" ? <Button variant="ghost" size="sm" onClick={() => { setEditing(item); setOpen(true) }}>编辑</Button> : null}
            {item.accountStatus !== "active" ? <Button variant="ghost" size="icon" onClick={() => remove(item)} aria-label="删除用户"><Trash2 /></Button> : null}
          </div>
        )
      },
      enableHiding: false,
      enableSorting: false,
    },
  ], [])

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <DataTableCard filters={<>
        <Field><FieldLabel htmlFor="account-filter">账户状态</FieldLabel><Select value={accountFilter} onValueChange={setAccountFilter}><SelectTrigger id="account-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="active">已认领</SelectItem><SelectItem value="invited">等待认领</SelectItem><SelectItem value="unclaimed">未认领</SelectItem></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="plan-filter">套餐</FieldLabel><Select value={planFilter} onValueChange={setPlanFilter}><SelectTrigger id="plan-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem>{planOptions.map(plan => <SelectItem key={plan} value={plan}>{plan}</SelectItem>)}</SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="status-filter">用户状态</FieldLabel><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger id="status-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="ok">Active</SelectItem><SelectItem value="warning">Expiring</SelectItem><SelectItem value="expired">Expired</SelectItem></SelectContent></Select></Field>
      </>}>
        <DataTable
          columns={columns}
          data={filteredUsers}
          searchKey="user"
          renderMobileItem={renderMobileUser}
          searchPlaceholder="搜索用户..."
          emptyTitle="暂无用户"
          pageSize={10}
          frame="card"
          toolbar={<Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}><Plus />新增用户</Button>}
        />
      </DataTableCard>

      <UserFormDialog
        open={open}
        user={editing}
        subscriptions={subscriptions}
        pricing={pricing}
        onOpenChange={setOpen}
        onSubmit={save}
      />
      <AlertDialog open={Boolean(deleteUser)} onOpenChange={open => { if (!open) setDeleteUser(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认删除用户？</AlertDialogTitle><AlertDialogDescription>删除后无法恢复，相关用户记录也将不再显示。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel><AlertDialogAction className="bg-destructive/10 text-destructive hover:bg-destructive/20" onClick={() => void confirmRemove()} disabled={deleting}>{deleting ? <Loader2 className="animate-spin" /> : null}确认删除</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={Boolean(poolUser)} onOpenChange={open => { if (!open) setPoolUser(null) }}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={changePool} noValidate>
            <DialogHeader><DialogTitle>手动换池</DialogTitle><DialogDescription>当前池：{currentPool ? `${currentPool.serviceProvider || currentPool.provider || "Provider"} - ${currentPool.email || currentPool.url} · 到期 ${formatDate(currentPool.metrics?.expireAt)}` : "未绑定"}</DialogDescription></DialogHeader>
            <div className="grid gap-2"><Label htmlFor="manual-pool">目标订阅池</Label><Select value={poolId} onValueChange={setPoolId}><SelectTrigger id="manual-pool" className="w-full"><SelectValue placeholder="请选择订阅池" /></SelectTrigger><SelectContent>{selectablePools.map(item => <SelectItem key={item.id} value={item.id}>{item.serviceProvider || item.provider || "Provider"} - {item.email || item.url} · 到期 {formatDate(item.metrics?.expireAt)}{item.enabled === false ? " · 未启用" : ""}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex items-center gap-2"><Checkbox id="allow-disabled-pool" checked={allowDisabledPool} onCheckedChange={checked => { const enabled = checked === true; setAllowDisabledPool(enabled); if (!enabled && subscriptions.find(item => item.id === poolId)?.enabled === false) setPoolId("") }} /><Label htmlFor="allow-disabled-pool">使用未启用池</Label></div>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose><Button type="submit" disabled={poolSaving || !poolId || poolId === poolUser?.subscriptionId}>{poolSaving ? <RefreshCw className="animate-spin" /> : <RefreshCw />}确认换池</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(giftUser)} onOpenChange={open => { if (!open) setGiftUser(null) }}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={submitGift} noValidate>
            <DialogHeader><DialogTitle>赠送时长</DialogTitle><DialogDescription>{giftUser?.userId || giftUser?.email || "用户"} · 当前到期 {formatDate(giftUser?.expiresAt)}</DialogDescription></DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="gift-days">赠送天数</FieldLabel>
                <Input id="gift-days" type="number" min="1" step="1" value={giftDays} onChange={event => { setGiftDays(event.target.value); setGiftExpiresAt(""); setGiftPoolId(""); setGiftMessage(""); setGiftError("") }} />
                <FieldError>{giftError}</FieldError>
              </Field>
              <Field>
                <FieldLabel>快捷选择</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {[7, 15, 30].map(days => <Button key={days} type="button" variant={giftDays === String(days) ? "default" : "outline"} size="sm" onClick={() => { setGiftDays(String(days)); setGiftExpiresAt(""); setGiftPoolId(""); setGiftMessage(""); setGiftError("") }}>{days} 天</Button>)}
                </div>
              </Field>
              {giftExpiresAt ? <Field><FieldLabel htmlFor="gift-expires-at">赠送后到期日</FieldLabel><Input id="gift-expires-at" value={giftExpiresAt.slice(0, 10)} readOnly /></Field> : null}
              {giftExpiresAt ? <Field><FieldLabel htmlFor="gift-pool">订阅池 URL</FieldLabel><Select value={giftPoolId} onValueChange={setGiftPoolId}><SelectTrigger id="gift-pool" className="w-full"><SelectValue placeholder="请选择订阅池" /></SelectTrigger><SelectContent>{giftPools.map(item => <SelectItem key={item.id} value={item.id}>{item.serviceProvider || item.provider || "Provider"} - {item.email || item.url} · 到期 {formatDate(item.metrics?.expireAt)}</SelectItem>)}</SelectContent></Select><FieldDescription>{giftMessage}</FieldDescription></Field> : null}
            </FieldGroup>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>{giftExpiresAt ? <Button type="submit" disabled={giftSaving || !giftPoolId}>{giftSaving ? <Loader2 className="animate-spin" /> : <Gift />}{giftSaving ? "赠送中..." : "确认赠送"}</Button> : <Button type="button" onClick={previewGift} disabled={giftPreviewing}>{giftPreviewing ? <Loader2 className="animate-spin" /> : <Gift />}{giftPreviewing ? "计算中..." : "推荐订阅池"}</Button>}</DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
