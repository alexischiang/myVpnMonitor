import * as React from "react"
import { Link, useLocation, useSearchParams } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { Copy, ExternalLink, Eye, Gift, Loader2, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { deleteJson, postJson, putJson } from "@/api"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTableCard } from "@/components/features/data-table-card"
import { DataTable, DataTableColumnHeader, DataTableRowActions } from "@/components/features/data-table"
import { useData } from "@/components/features/data-provider"
import { ProviderBadge } from "@/components/features/provider-badge"
import { UserStatusBadge } from "@/components/features/shared"
import { SubscriptionPoolSelect } from "@/components/features/subscription-pool-select"
import { UserFormDialog, type UserFormValues } from "@/components/features/user-form-dialog"
import { UsersSummaryCard } from "@/components/features/users-summary-card"
import { VipBadge } from "@/components/features/vip-badge"
import type { User } from "@/types"
import { absoluteUrl, formatDate, formatMoney, userStatus } from "@/utils"

type GiftPreview = {
  expiresAt: string
  subscription: User["subscription"] | null
  reason?: string
}

type BatchGiftPreview = {
  eligibleCount: number
  readyCount: number
  unavailableCount: number
  unavailableUsers: string[]
}

export function UsersPage() {
  const { users, subscriptions, pricing, reload, runAsync } = useData()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [editing, setEditing] = React.useState<User | null>(null)
  const [open, setOpen] = React.useState(false)
  const [deleteUser, setDeleteUser] = React.useState<User | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [poolUser, setPoolUser] = React.useState<User | null>(null)
  const [poolId, setPoolId] = React.useState("")
  const [poolSaving, setPoolSaving] = React.useState(false)
  const [allowDisabledPool, setAllowDisabledPool] = React.useState(false)
  const [allowFullPool, setAllowFullPool] = React.useState(false)
  const [giftUser, setGiftUser] = React.useState<User | null>(null)
  const [allowDisabledGiftPool, setAllowDisabledGiftPool] = React.useState(false)
  const [allowFullGiftPool, setAllowFullGiftPool] = React.useState(false)
  const accountFilter = searchParams.get("account") || "all"
  const planFilter = searchParams.get("plan") || "all"
  const statusFilter = searchParams.get("status") || "all"
  const searchQuery = searchParams.get("q") || ""
  const [giftDays, setGiftDays] = React.useState("")
  const [giftExpiresAt, setGiftExpiresAt] = React.useState("")
  const [giftPoolId, setGiftPoolId] = React.useState("")
  const [giftMessage, setGiftMessage] = React.useState("")
  const [giftError, setGiftError] = React.useState("")
  const [giftPreviewing, setGiftPreviewing] = React.useState(false)
  const [giftSaving, setGiftSaving] = React.useState(false)
  const [batchGiftOpen, setBatchGiftOpen] = React.useState(false)
  const [batchGiftDays, setBatchGiftDays] = React.useState("")
  const [batchGiftGroup, setBatchGiftGroup] = React.useState("all")
  const [batchAllowDisabled, setBatchAllowDisabled] = React.useState(false)
  const [batchGiftPreview, setBatchGiftPreview] = React.useState<BatchGiftPreview | null>(null)
  const [batchGiftLoading, setBatchGiftLoading] = React.useState(false)
  const [batchGiftSaving, setBatchGiftSaving] = React.useState(false)
  const currentPool = subscriptions.find(item => item.id === poolUser?.subscriptionId)
  const planOptions = React.useMemo(() => [...new Set(users.map(item => item.activeGroup).filter((value): value is string => Boolean(value)))].sort(), [users])
  const filteredUsers = React.useMemo(() => users.filter(item =>
    (accountFilter === "all" || (item.accountStatus || "unclaimed") === accountFilter) &&
    (planFilter === "all" || item.activeGroup === planFilter) &&
    (statusFilter === "all" || userStatus(item) === statusFilter)
  ), [users, accountFilter, planFilter, statusFilter])
  const totalUsers = users.length
  const activeUsers = users.filter(item => !item.registeredOnly && userStatus(item) !== "expired").length
  const addedToday = users.filter(item => item.createdAt && new Date(item.createdAt).toDateString() === new Date().toDateString()).length
  const expiringUsers = users.filter(item => userStatus(item) === "warning").length

  function updateSearchParam(key: string, value: string, defaultValue = "") {
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      if (value === defaultValue) next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  }

  async function changePool(event: React.FormEvent) {
    event.preventDefault()
    if (!poolUser || !poolId || poolId === poolUser.subscriptionId) return
    setPoolSaving(true)
    try {
      await postJson(`/api/users/${poolUser.id}/pool`, { subscriptionId: poolId, allowDisabled: allowDisabledPool, allowFull: allowFullPool })
      await reload(["users", "subscriptions"])
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
    setAllowDisabledGiftPool(false)
    setAllowFullGiftPool(false)
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
      await postJson(`/api/users/${giftUser.id}/gift`, { days: Number(giftDays), subscriptionId: giftPoolId, allowDisabled: allowDisabledGiftPool, allowFull: allowFullGiftPool })
      await reload(["users"])
      toast.success("赠送时长已生效")
      setGiftUser(null)
    } catch (error) {
      setGiftError(error instanceof Error ? error.message : "赠送时长失败")
    } finally {
      setGiftSaving(false)
    }
  }

  function openBatchGift() {
    setBatchGiftDays("")
    setBatchGiftGroup("all")
    setBatchAllowDisabled(false)
    setBatchGiftPreview(null)
    setBatchGiftOpen(true)
  }

  async function previewBatchGift() {
    const days = Number(batchGiftDays)
    if (!Number.isSafeInteger(days) || days <= 0) return
    setBatchGiftLoading(true)
    try {
      const preview = await postJson<BatchGiftPreview>("/api/users/batch-gift", { days, group: batchGiftGroup === "all" ? "" : batchGiftGroup, allowDisabled: batchAllowDisabled, preview: true })
      setBatchGiftPreview(preview)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "预览批量赠送失败")
    } finally {
      setBatchGiftLoading(false)
    }
  }

  async function submitBatchGift(event: React.FormEvent) {
    event.preventDefault()
    if (!batchGiftPreview || batchGiftPreview.unavailableCount || !batchGiftDays) return
    setBatchGiftSaving(true)
    try {
      const result = await postJson<{ updatedCount: number }>("/api/users/batch-gift", { days: Number(batchGiftDays), group: batchGiftGroup === "all" ? "" : batchGiftGroup, allowDisabled: batchAllowDisabled })
      await reload(["users"])
      toast.success(`已为 ${result.updatedCount} 位用户赠送 ${batchGiftDays} 天`)
      setBatchGiftOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量赠送失败")
    } finally {
      setBatchGiftSaving(false)
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
    const claimed = ["active", "disabled"].includes(item.accountStatus || "unclaimed")
    return <Item variant="outline"><ItemContent><ItemTitle className="flex w-full items-center gap-2"><span className="min-w-0 truncate">{item.userId ? <span className="font-medium">{item.userId}</span> : null}<span className={`${item.userId ? "ml-1 " : ""}text-xs font-normal text-muted-foreground`}>#{item.customerID}</span></span><UserStatusBadge user={item} />{item.registeredOnly ? null : <VipBadge level={item.vipLevel} />}</ItemTitle><ItemDescription className="flex items-center gap-2 text-xs"><span>{item.registeredOnly ? formatDate(item.createdAt) : `${formatDate(item.expiresAt)} · ${formatMoney(item.actualPaid)} · ${(item.activeGroup || "-").toUpperCase()}`}</span>{item.subscription ? <ProviderBadge name={item.subscription.serviceProvider || item.subscription.provider} /> : null}</ItemDescription></ItemContent><ItemActions><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="用户操作"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to={`/users/detail/${item.id}${location.search}`}><ExternalLink />查看详情</Link></DropdownMenuItem>{item.registeredOnly ? null : <>{deliveryUrl(item) ? <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(deliveryUrl(item)).then(() => toast.success("交付链接已复制"))}><Copy />复制交付链接</DropdownMenuItem> : null}{item.lineType === "self_hosted" ? null : <DropdownMenuItem onSelect={() => { setPoolUser(item); setPoolId(""); setAllowDisabledPool(false); setAllowFullPool(false) }}><RefreshCw />更换订阅池</DropdownMenuItem>}<DropdownMenuItem onSelect={() => openGift(item)}><Gift />赠送时长</DropdownMenuItem>{!claimed ? <DropdownMenuItem onSelect={() => { setEditing(item); setOpen(true) }}><Pencil />编辑</DropdownMenuItem> : null}{!claimed ? <DropdownMenuItem variant="destructive" onSelect={() => void remove(item)}><Trash2 />删除</DropdownMenuItem> : null}</>}</DropdownMenuContent></DropdownMenu></ItemActions></Item>
  }

  const columns = React.useMemo<ColumnDef<User>[]>(() => [
    {
      id: "user",
      accessorFn: item => {
        const provider = item.subscription?.serviceProvider || item.subscription?.provider || ""
        return `${item.userId || ""} ${item.customerID || ""} ${item.wechatName || ""} ${item.imessage || ""} ${item.email || ""} ${provider} #${item.customerID || ""} @${item.userId || ""} @${item.email || ""} !${provider}`
      },
      header: DataTableColumnHeader({ title: "用户" }),
      meta: { label: "用户" },
      cell: ({ row }) => <div className="flex min-w-0 items-center whitespace-nowrap leading-5">{row.original.userId ? <span className="truncate font-medium">{row.original.userId}</span> : null}<span className={`${row.original.userId ? "ml-1 " : ""}shrink-0 text-xs font-normal text-muted-foreground`}>#{row.original.customerID}</span></div>,
    },
    {
      id: "email",
      accessorFn: item => ["active", "disabled"].includes(item.accountStatus || "unclaimed") ? item.email || "" : "未认领",
      header: DataTableColumnHeader({ title: "邮箱" }),
      meta: { label: "邮箱" },
      cell: ({ row }) => ["active", "disabled"].includes(row.original.accountStatus || "unclaimed") ? row.original.email || "-" : "未认领",
    },
    {
      id: "subscription",
      accessorFn: item => `${item.subscription?.serviceProvider || item.subscription?.provider || ""} ${item.subscription?.email || ""}`,
      header: DataTableColumnHeader({ title: "订阅池" }),
      meta: { label: "订阅池" },
      cell: ({ row }) => row.original.subscription ? (
        <div className="flex min-w-0 items-center gap-2">
          <ProviderBadge name={row.original.subscription.serviceProvider || row.original.subscription.provider} />
          <span className="min-w-0 truncate text-xs text-muted-foreground">{row.original.subscription.email || "-"}</span>
        </div>
      ) : "-",
    },
    {
      accessorKey: "activeGroup",
      header: DataTableColumnHeader({ title: "套餐等级" }),
      meta: { label: "套餐等级" },
      cell: ({ row }) => row.original.activeGroup ? <Badge variant="outline">{row.original.activeGroup.toUpperCase()}</Badge> : "-",
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
        const claimed = ["active", "disabled"].includes(item.accountStatus || "unclaimed")
        return (
          <DataTableRowActions
            detail={<Button asChild variant="ghost" size="icon"><Link to={`/users/detail/${item.id}${location.search}`} aria-label="查看用户详情"><Eye /></Link></Button>}
          >
            {item.registeredOnly ? null : <>
              {deliveryUrl(item) ? <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(deliveryUrl(item)).then(() => toast.success("交付链接已复制"))}><Copy />复制交付链接</DropdownMenuItem> : null}
              {item.lineType === "self_hosted" ? null : <DropdownMenuItem onSelect={() => { setPoolUser(item); setPoolId(""); setAllowDisabledPool(false); setAllowFullPool(false) }}><RefreshCw />换池</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => openGift(item)}><Gift />赠送</DropdownMenuItem>
              {!claimed ? <DropdownMenuItem onSelect={() => { setEditing(item); setOpen(true) }}><Pencil />编辑</DropdownMenuItem> : null}
              {!claimed ? <DropdownMenuItem variant="destructive" onSelect={() => remove(item)}><Trash2 />删除</DropdownMenuItem> : null}
            </>}
          </DataTableRowActions>
        )
      },
      enableHiding: false,
      enableSorting: false,
    },
  ], [location.search])

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <UsersSummaryCard total={totalUsers} active={activeUsers} addedToday={addedToday} expiring={expiringUsers} />
      <DataTableCard filters={<>
        <Field><FieldLabel htmlFor="account-filter">账户状态</FieldLabel><Select value={accountFilter} onValueChange={value => updateSearchParam("account", value, "all")}><SelectTrigger id="account-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="active">已认领</SelectItem><SelectItem value="disabled">已停用</SelectItem><SelectItem value="invited">等待认领</SelectItem><SelectItem value="unclaimed">未认领</SelectItem></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="plan-filter">套餐</FieldLabel><Select value={planFilter} onValueChange={value => updateSearchParam("plan", value, "all")}><SelectTrigger id="plan-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem>{planOptions.map(plan => <SelectItem key={plan} value={plan}>{plan}</SelectItem>)}</SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="status-filter">套餐状态</FieldLabel><Select value={statusFilter} onValueChange={value => updateSearchParam("status", value, "all")}><SelectTrigger id="status-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="registered">未购买</SelectItem><SelectItem value="ok">Active</SelectItem><SelectItem value="warning">Expiring</SelectItem><SelectItem value="expired">Expired</SelectItem></SelectContent></Select></Field>
      </>}>
        <DataTable
          columns={columns}
          data={filteredUsers}
          searchKey="user"
          initialSearchValue={searchQuery}
          onSearchChange={value => updateSearchParam("q", value)}
          renderMobileItem={renderMobileUser}
          searchPlaceholder="搜索用户，#ID，@用户名/邮箱，!供应商"
          emptyTitle="暂无用户"
          pageSize={30}
          frame="card"
          toolbar={<div className="flex gap-2"><Button size="sm" variant="outline" onClick={openBatchGift}><Gift />批量赠送</Button><Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}><Plus />新增用户</Button></div>}
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
      <Dialog open={batchGiftOpen} onOpenChange={setBatchGiftOpen}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={submitBatchGift} noValidate>
            <DialogHeader><DialogTitle>批量赠送时长</DialogTitle><DialogDescription>范围为全部未过期用户，再按套餐等级筛选。</DialogDescription></DialogHeader>
            <FieldGroup>
              <Field><FieldLabel htmlFor="batch-gift-days">赠送天数</FieldLabel><Input id="batch-gift-days" type="number" min="1" step="1" value={batchGiftDays} onChange={event => { setBatchGiftDays(event.target.value); setBatchGiftPreview(null) }} required /></Field>
              <Field><FieldLabel htmlFor="batch-gift-group">套餐等级</FieldLabel><Select value={batchGiftGroup} onValueChange={value => { setBatchGiftGroup(value); setBatchGiftPreview(null) }}><SelectTrigger id="batch-gift-group" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部等级</SelectItem><SelectItem value="basic">BASIC</SelectItem><SelectItem value="pro">PRO</SelectItem><SelectItem value="ultra">ULTRA</SelectItem></SelectContent></Select></Field>
              <div className="flex items-center gap-2"><Checkbox id="batch-allow-disabled" checked={batchAllowDisabled} onCheckedChange={checked => { setBatchAllowDisabled(checked === true); setBatchGiftPreview(null) }} /><FieldLabel htmlFor="batch-allow-disabled">使用未启用池</FieldLabel></div>
              {batchGiftPreview ? <FieldDescription>符合条件 {batchGiftPreview.eligibleCount} 人，可执行 {batchGiftPreview.readyCount} 人。{batchGiftPreview.unavailableCount ? "部分用户没有可用订阅池，将保留原订阅池并只增加时长。" : ""}</FieldDescription> : null}
            </FieldGroup>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>{batchGiftPreview ? <Button type="submit" disabled={batchGiftSaving}>{batchGiftSaving ? <Loader2 className="animate-spin" /> : <Gift />}{batchGiftSaving ? "赠送中..." : "确认批量赠送"}</Button> : <Button type="button" onClick={() => void previewBatchGift()} disabled={batchGiftLoading || !batchGiftDays}>{batchGiftLoading ? <Loader2 className="animate-spin" /> : <Gift />}{batchGiftLoading ? "计算中..." : "预览范围"}</Button>}</DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(deleteUser)} onOpenChange={open => { if (!open) setDeleteUser(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认删除用户？</AlertDialogTitle><AlertDialogDescription>删除后无法恢复，相关用户记录也将不再显示。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel><AlertDialogAction className="bg-destructive/10 text-destructive hover:bg-destructive/20" onClick={() => void confirmRemove()} disabled={deleting}>{deleting ? <Loader2 className="animate-spin" /> : null}确认删除</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={Boolean(poolUser)} onOpenChange={open => { if (!open) setPoolUser(null) }}>
        <DialogContent className="sm:max-w-xl">
          <form className="grid gap-4" onSubmit={changePool} noValidate>
            <DialogHeader><DialogTitle>手动换池</DialogTitle><DialogDescription className="break-all">为 {poolUser?.userId || poolUser?.email || "当前用户"} 选择新的订阅池。</DialogDescription></DialogHeader>
            <Item variant="muted" size="sm" className="items-start">
              <ItemContent className="gap-2">
                <ItemTitle>当前分配</ItemTitle>
                <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[5rem_minmax(0,1fr)]">
                  <dt className="text-muted-foreground">套餐到期</dt><dd>{formatDate(poolUser?.expiresAt)}</dd>
                  <dt className="text-muted-foreground">当前池</dt><dd className="min-w-0">{currentPool ? <><span className="block font-medium text-foreground">{currentPool.serviceProvider || currentPool.provider || "Provider"}</span><span className="block break-all text-muted-foreground">{currentPool.email || currentPool.url}</span></> : "未绑定"}</dd>
                  <dt className="text-muted-foreground">池到期</dt><dd>{currentPool ? formatDate(currentPool.metrics?.expireAt) : "-"}</dd>
                </dl>
              </ItemContent>
            </Item>
            <SubscriptionPoolSelect id="manual-pool" label="目标订阅池" subscriptions={subscriptions} value={poolId} onValueChange={setPoolId} allowDisabled={allowDisabledPool} onAllowDisabledChange={setAllowDisabledPool} allowFull={allowFullPool} onAllowFullChange={setAllowFullPool} group={poolUser?.isSuperAccount ? undefined : poolUser?.activeGroup} />
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
              {giftExpiresAt ? <SubscriptionPoolSelect id="gift-pool" label="订阅池 URL" subscriptions={subscriptions} value={giftPoolId} onValueChange={setGiftPoolId} allowDisabled={allowDisabledGiftPool} onAllowDisabledChange={setAllowDisabledGiftPool} allowFull={allowFullGiftPool} onAllowFullChange={setAllowFullGiftPool} group={giftUser?.isSuperAccount ? undefined : giftUser?.activeGroup} description={giftMessage} /> : null}
            </FieldGroup>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>{giftExpiresAt ? <Button type="submit" disabled={giftSaving || !giftPoolId}>{giftSaving ? <Loader2 className="animate-spin" /> : <Gift />}{giftSaving ? "赠送中..." : "确认赠送"}</Button> : <Button type="button" onClick={previewGift} disabled={giftPreviewing}>{giftPreviewing ? <Loader2 className="animate-spin" /> : <Gift />}{giftPreviewing ? "计算中..." : "推荐订阅池"}</Button>}</DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
