import * as React from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { Copy, ExternalLink, Eye, Gift, Loader2, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "@/components/features/toast"

import { deleteJson, fetchJson, postJson, putJson } from "@/api"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { DataTableCard } from "@/components/features/data-table-card"
import { DataTable, DataTableColumnHeader, DataTableRowActions } from "@/components/features/arc-data-table"
import { useData } from "@/components/features/data-provider"
import { ProviderBadge } from "@/components/features/provider-badge"
import { StatusDot, TrafficProgress, UserStatusBadge } from "@/components/features/shared"
import { SubscriptionPoolSelect } from "@/components/features/subscription-pool-select"
import { UserFormDialog, type UserFormValues } from "@/components/features/user-form-dialog"
import { UsersSummaryCard } from "@/components/features/users-summary-card"
import { VipBadge } from "@/components/features/vip-badge"
import type { User, XuiPresence } from "@/types"
import { absoluteUrl, formatBytes, formatDate, formatDateTime, formatMoney, userStatus } from "@/utils"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { Dialog as ArcDialog, DialogClose as ArcDialogClose, DialogContent as ArcDialogContent } from "@/components/arc/dialog/dialog"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Input } from "@/components/arc/input/input"
import { Select } from "@/components/arc/select/select"
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog"
import { Card } from "@/components/arc/card/card"

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

function OnlineIndicator({ online }: { online: boolean }) {
  return <StatusDot status={online ? "online" : "offline"} />
}

export function UsersPage() {
  const { users, subscriptions, reload, runAsync } = useData()
  const location = useLocation()
  const navigate = useNavigate()
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
  const activityFilter = searchParams.get("activity") || "all"
  const searchQuery = searchParams.get("q") || ""
  const [presence, setPresence] = React.useState<XuiPresence | null>(null)
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
  const planOptions = React.useMemo(() => [...new Set(users.map(item => item.v2LineGroupId).filter((value): value is string => Boolean(value)))].sort(), [users])
  const onlineGuidsByEmail = React.useMemo(() => {
    const result: Record<string, string[]> = {}
    for (const [guid, emails] of Object.entries(presence?.onlineByGuid || {})) {
      for (const email of emails) (result[email] ||= []).push(guid)
    }
    return result
  }, [presence])
  const matchesActivity = React.useCallback((item: User) => {
    if (activityFilter === "all") return true
    if (!presence?.configured) return false
    const email = String(item.xuiClientEmail || "").toLowerCase()
    if (!email) return false
    const online = Boolean(onlineGuidsByEmail[email]?.length)
    const lastSeen = presence?.lastOnline[email] || 0
    if (activityFilter === "online") return online
    if (activityFilter === "never") return !online && !lastSeen
    const days = { day: 1, week: 7, month: 30 }[activityFilter as "day" | "week" | "month"]
    return !online && Boolean(days && lastSeen && lastSeen <= Date.now() / 1000 - days * 86400)
  }, [activityFilter, onlineGuidsByEmail, presence])
  const filteredUsers = React.useMemo(() => users.filter(item =>
    (accountFilter === "all" || (item.accountStatus || "unclaimed") === accountFilter) &&
    (planFilter === "all" || item.v2LineGroupId === planFilter) &&
    (statusFilter === "all" || userStatus(item) === statusFilter) &&
    matchesActivity(item)
  ), [users, accountFilter, planFilter, statusFilter, matchesActivity])
  const totalUsers = users.length
  const activeUsers = users.filter(item => !item.registeredOnly && userStatus(item) !== "expired").length
  const addedToday = users.filter(item => item.createdAt && new Date(item.createdAt).toDateString() === new Date().toDateString()).length
  const expiringUsers = users.filter(item => userStatus(item) === "warning").length

  const refreshPresence = React.useCallback(async (background = false) => {
    try {
      setPresence(await fetchJson<XuiPresence>("/api/xui-presence", { background }))
    } catch {
      // Keep the last successful snapshot during a transient 3x-ui failure.
    }
  }, [])

  React.useEffect(() => {
    void refreshPresence()
    const timer = window.setInterval(() => void refreshPresence(true), 30_000)
    return () => window.clearInterval(timer)
  }, [refreshPresence])

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
      toast({ type: "success", title: "用户订阅池已更新" })
      setPoolUser(null)
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "换池失败" })
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
      toast({ type: "success", title: "赠送时长已生效" })
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
      toast({ type: "error", title: error instanceof Error ? error.message : "预览批量赠送失败" })
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
      toast({ type: "success", title: `已为 ${result.updatedCount} 位用户赠送 ${batchGiftDays} 天` })
      setBatchGiftOpen(false)
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "批量赠送失败" })
    } finally {
      setBatchGiftSaving(false)
    }
  }

  async function save(values: UserFormValues) {
    await runAsync(async () => {
      if (editing?.id) {
        await putJson(`/api/users/${editing.id}`, values)
        toast({ type: "success", title: "用户已更新" })
      } else {
        await postJson("/api/users", { ...values, lineType: "self_hosted", outputMode: "subconverter", trafficTier: Number(values.trafficTier) || 1 })
        toast({ type: "success", title: "用户已创建" })
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
        toast({ type: "success", title: "用户已删除" })
      }, "删除用户...")
      setDeleteUser(null)
    } finally {
      setDeleting(false)
    }
  }

  function deliveryUrl(user: User) {
    return user.deliveryToken ? absoluteUrl(`/delivery/${user.deliveryToken}`) : ""
  }

  function xuiPresenceFor(user: User) {
    const email = String(user.xuiClientEmail || "").toLowerCase()
    const guids = email ? onlineGuidsByEmail[email] || [] : []
    return {
      available: Boolean(email && presence?.configured),
      online: guids.length > 0,
      nodes: guids.map(guid => presence?.nodeNames[guid] || guid),
      lastOnline: email ? presence?.lastOnline[email] || 0 : 0,
      dailyUsedBytes: email && presence?.configured ? presence.dailyTraffic?.users?.[email]?.usedBytes ?? 0 : -1,
    }
  }

  function renderMobileUser(item: User) {
    const claimed = ["active", "disabled"].includes(item.accountStatus || "unclaimed")
    const xui = xuiPresenceFor(item)
    return <Card title={<><span className="min-w-0 truncate">{item.userId ? <span className="font-medium">{item.userId}</span> : null}<span className={`${item.userId ? "ml-1 " : ""}text-xs font-normal text-muted-foreground`}>#{item.customerID}</span></span><UserStatusBadge user={item} />{item.registeredOnly ? null : <VipBadge level={item.vipLevel} />}</>} description={<><span>{item.registeredOnly ? formatDate(item.createdAt) : `${formatDate(item.expiresAt)} · ${formatMoney(item.actualPaid)} · ${(item.v2LineGroupId || "-").toUpperCase()}`}</span>{item.subscription ? <ProviderBadge name={item.subscription.serviceProvider || item.subscription.provider} /> : null}</>} headerAction={<><DropdownMenu label="用户操作" trigger={<Button variant="ghost" size="icon" aria-label="用户操作"><MoreHorizontal /></Button>} items={[
      { label: "查看详情", icon: <ExternalLink size={15} />, onSelect: () => navigate(`/users/detail/${item.id}${location.search}`) },
      ...(item.registeredOnly ? [] : [
        ...(deliveryUrl(item) ? [{ label: "复制交付链接", icon: <Copy size={15} />, onSelect: () => void navigator.clipboard.writeText(deliveryUrl(item)).then(() => toast({ type: "success", title: "交付链接已复制" })) }] : []),
        ...(item.lineType === "self_hosted" ? [] : [{ label: "更换订阅池", icon: <RefreshCw size={15} />, onSelect: () => { setPoolUser(item); setPoolId(""); setAllowDisabledPool(false); setAllowFullPool(false) } }]),
        { label: "赠送时长", icon: <Gift size={15} />, onSelect: () => openGift(item) },
        ...(!claimed ? [{ label: "编辑", icon: <Pencil size={15} />, onSelect: () => { setEditing(item); setOpen(true) } }, { label: "删除", icon: <Trash2 size={15} />, destructive: true, onSelect: () => void remove(item) }] : []),
      ]),
    ]} /></>}>{xui.available ? <p className="text-sm text-muted-foreground flex items-center gap-1.5 text-xs"><span>{xui.online ? xui.nodes.join(" / ") : xui.lastOnline ? `最后在线 ${formatDateTime(new Date(xui.lastOnline * 1000).toISOString())}` : "从未在线"}</span><OnlineIndicator online={xui.online} /></p> : null}</Card>
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
      id: "traffic",
      accessorFn: item => item.xuiWeightedTraffic?.usagePercent ?? -1,
      header: DataTableColumnHeader({ title: "流量使用" }),
      meta: { label: "流量使用" },
      cell: ({ row }) => row.original.xuiWeightedTraffic?.totalBytes
        ? <TrafficProgress remaining={row.original.xuiWeightedTraffic.remainingBytes ?? 0} total={row.original.xuiWeightedTraffic.totalBytes} />
        : row.original.unlimited ? "不限" : "-",
    },
    {
      id: "dailyTraffic",
      accessorFn: item => xuiPresenceFor(item).dailyUsedBytes,
      header: DataTableColumnHeader({ title: "今日流量" }),
      meta: { label: "今日流量" },
      cell: ({ row }) => { const value = row.getValue<number>("dailyTraffic"); return value < 0 ? "-" : formatBytes(value) },
    },
    {
      accessorKey: "v2LineGroupId",
      header: DataTableColumnHeader({ title: "套餐等级" }),
      meta: { label: "套餐等级" },
      cell: ({ row }) => row.original.v2LineGroupId ? <Badge>{row.original.v2LineGroupId.toUpperCase()}</Badge> : "-",
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
      id: "online",
      accessorFn: item => xuiPresenceFor(item).online ? "在线" : "离线",
      header: DataTableColumnHeader({ title: "在线状态" }),
      meta: { label: "在线状态" },
      cell: ({ row }) => { const xui = xuiPresenceFor(row.original); return xui.available ? <OnlineIndicator online={xui.online} /> : "-" },
    },
    {
      id: "currentNode",
      accessorFn: item => xuiPresenceFor(item).nodes.join(" "),
      header: DataTableColumnHeader({ title: "当前节点" }),
      meta: { label: "当前节点" },
      cell: ({ row }) => xuiPresenceFor(row.original).nodes.join(" / ") || "-",
    },
    {
      id: "lastOnline",
      accessorFn: item => xuiPresenceFor(item).lastOnline,
      header: DataTableColumnHeader({ title: "最后在线" }),
      meta: { label: "最后在线" },
      cell: ({ row }) => { const xui = xuiPresenceFor(row.original); return !xui.available ? "-" : xui.online ? "当前在线" : xui.lastOnline ? formatDateTime(new Date(xui.lastOnline * 1000).toISOString()) : "从未在线" },
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
            actions={item.registeredOnly ? [] : [
              ...(deliveryUrl(item) ? [{ label: "复制交付链接", icon: <Copy size={15} />, onSelect: () => void navigator.clipboard.writeText(deliveryUrl(item)).then(() => toast({ type: "success", title: "交付链接已复制" })) }] : []),
              ...(item.lineType === "self_hosted" ? [] : [{ label: "换池", icon: <RefreshCw size={15} />, onSelect: () => { setPoolUser(item); setPoolId(""); setAllowDisabledPool(false); setAllowFullPool(false) } }]),
              { label: "赠送", icon: <Gift size={15} />, onSelect: () => openGift(item) },
              ...(!claimed ? [{ label: "编辑", icon: <Pencil size={15} />, onSelect: () => { setEditing(item); setOpen(true) } }, { label: "删除", icon: <Trash2 size={15} />, destructive: true, onSelect: () => remove(item) }] : []),
            ]}
          />
        )
      },
      enableHiding: false,
      enableSorting: false,
    },
  ], [location.search, onlineGuidsByEmail, presence])

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <UsersSummaryCard total={totalUsers} active={activeUsers} addedToday={addedToday} expiring={expiringUsers} />
      <DataTableCard filters={<>
        <Select label="账户状态" value={accountFilter} onValueChange={value => updateSearchParam("account", value, "all")} id="account-filter" className="w-full" options={[{ value: "all", label: "全部" }, { value: "active", label: "已认领" }, { value: "disabled", label: "已停用" }, { value: "invited", label: "等待认领" }, { value: "unclaimed", label: "未认领" }]} />
        <Select label="套餐" value={planFilter} onValueChange={value => updateSearchParam("plan", value, "all")} id="plan-filter" className="w-full" options={[{ value: "all", label: "全部" }, ...planOptions.map(plan => ({ value: plan, label: plan }))]} />
        <Select label="套餐状态" value={statusFilter} onValueChange={value => updateSearchParam("status", value, "all")} id="status-filter" className="w-full" options={[{ value: "all", label: "全部" }, { value: "registered", label: "未购买" }, { value: "ok", label: "Active" }, { value: "warning", label: "Expiring" }, { value: "expired", label: "Expired" }]} />
        <Select label="在线情况" value={activityFilter} onValueChange={value => updateSearchParam("activity", value, "all")} id="activity-filter" className="w-full" options={[{ value: "all", label: "全部" }, { value: "online", label: "当前在线" }, { value: "day", label: "超过 24 小时未在线" }, { value: "week", label: "超过 7 天未在线" }, { value: "month", label: "超过 30 天未在线" }, { value: "never", label: "从未在线" }]} />
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
          stateKey="users"
          toolbar={<div className="flex gap-2"><Button size="sm" variant="secondary" onClick={openBatchGift}><Gift />批量赠送</Button><Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}><Plus />新增用户</Button></div>}
        />
      </DataTableCard>

      <UserFormDialog
        open={open}
        user={editing}
        onOpenChange={setOpen}
        onSubmit={save}
      />
      <Dialog open={batchGiftOpen} onOpenChange={setBatchGiftOpen}>
        <DialogContent title="批量赠送时长" description="范围为全部未过期用户，再按套餐等级筛选。"><form className="grid gap-4" onSubmit={submitBatchGift} noValidate>
            <FieldGroup>
              <Input label="赠送天数" id="batch-gift-days" type="number" min="1" step="1" value={batchGiftDays} onChange={event => { setBatchGiftDays(event.target.value); setBatchGiftPreview(null) }} required />
              <Select label="套餐等级" value={batchGiftGroup} onValueChange={value => { setBatchGiftGroup(value); setBatchGiftPreview(null) }} id="batch-gift-group" className="w-full" options={[{ value: "all", label: "全部等级" }, { value: "basic", label: "BASIC" }, { value: "pro", label: "PRO" }, { value: "ultra", label: "ULTRA" }]} />
              <Checkbox id="batch-allow-disabled" checked={batchAllowDisabled} onCheckedChange={checked => { setBatchAllowDisabled(checked === true); setBatchGiftPreview(null) }} label="使用未启用池" />
              {batchGiftPreview ? <FieldDescription>符合条件 {batchGiftPreview.eligibleCount} 人，可执行 {batchGiftPreview.readyCount} 人。{batchGiftPreview.unavailableCount ? "部分用户没有可用订阅池，将保留原订阅池并只增加时长。" : ""}</FieldDescription> : null}
            </FieldGroup>
            <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary">取消</Button></DialogClose>{batchGiftPreview ? <ActionButton type="submit" label="确认批量赠送" pendingLabel="赠送中..." pending={batchGiftSaving} /> : <ActionButton type="button" onClick={() => void previewBatchGift()} disabled={batchGiftLoading || !batchGiftDays} label="预览范围" pendingLabel="计算中..." pending={batchGiftLoading} />}</div>
          </form></DialogContent>
      </Dialog>
      <ArcDialog open={Boolean(deleteUser)} onOpenChange={open => { if (!open) setDeleteUser(null) }}>
        <ArcDialogContent title="确认删除用户？" description="删除后无法恢复，相关用户记录也将不再显示。"><div className="flex flex-wrap justify-end gap-2"><ArcDialogClose asChild><Button variant="secondary" disabled={deleting}>取消</Button></ArcDialogClose><ArcDialogClose asChild><Button variant="primary" onClick={() => void confirmRemove()} disabled={deleting}>{deleting ? <Loader2 className="animate-spin" /> : null}确认删除</Button></ArcDialogClose></div></ArcDialogContent>
      </ArcDialog>
      <Dialog open={Boolean(poolUser)} onOpenChange={open => { if (!open) setPoolUser(null) }}>
        <DialogContent title="手动换池" description={`为 ${poolUser?.userId || poolUser?.email || "当前用户"} 选择新的订阅池。`} size="lg"><form className="grid gap-4" onSubmit={changePool} noValidate>
            <Card className="items-start" title="当前分配"><dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[5rem_minmax(0,1fr)]">
                  <dt className="text-muted-foreground">套餐到期</dt><dd>{formatDate(poolUser?.expiresAt)}</dd>
                  <dt className="text-muted-foreground">当前池</dt><dd className="min-w-0">{currentPool ? <><span className="block font-medium text-foreground">{currentPool.serviceProvider || currentPool.provider || "Provider"}</span><span className="block break-all text-muted-foreground">{currentPool.email || currentPool.url}</span></> : "未绑定"}</dd>
                  <dt className="text-muted-foreground">池到期</dt><dd>{currentPool ? formatDate(currentPool.metrics?.expireAt) : "-"}</dd>
                </dl></Card>
            <SubscriptionPoolSelect id="manual-pool" label="目标订阅池" subscriptions={subscriptions} value={poolId} onValueChange={setPoolId} allowDisabled={allowDisabledPool} onAllowDisabledChange={setAllowDisabledPool} allowFull={allowFullPool} onAllowFullChange={setAllowFullPool} group={poolUser?.isSuperAccount ? undefined : poolUser?.activeGroup} />
            <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary">取消</Button></DialogClose><ActionButton type="submit" disabled={poolSaving || !poolId || poolId === poolUser?.subscriptionId} label="确认换池" pending={poolSaving} /></div>
          </form></DialogContent>
      </Dialog>
      <Dialog open={Boolean(giftUser)} onOpenChange={open => { if (!open) setGiftUser(null) }}>
        <DialogContent title="赠送时长" description={`${giftUser?.userId || giftUser?.email || "用户"} · 当前到期 ${formatDate(giftUser?.expiresAt)}`}><form className="grid gap-4" onSubmit={submitGift} noValidate>
            <FieldGroup>
              <Input label="赠送天数" error={(giftError) || undefined} id="gift-days" type="number" min="1" step="1" value={giftDays} onChange={event => { setGiftDays(event.target.value); setGiftExpiresAt(""); setGiftPoolId(""); setGiftMessage(""); setGiftError("") }} />
              <Field>
                <FieldLabel>快捷选择</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {[7, 15, 30].map(days => <Button key={days} type="button" variant={giftDays === String(days) ? "primary" : "secondary"} size="sm" onClick={() => { setGiftDays(String(days)); setGiftExpiresAt(""); setGiftPoolId(""); setGiftMessage(""); setGiftError("") }}>{days} 天</Button>)}
                </div>
              </Field>
              {giftExpiresAt ? <Input label="赠送后到期日" id="gift-expires-at" value={giftExpiresAt.slice(0, 10)} readOnly /> : null}
              {giftExpiresAt ? <SubscriptionPoolSelect id="gift-pool" label="订阅池 URL" subscriptions={subscriptions} value={giftPoolId} onValueChange={setGiftPoolId} allowDisabled={allowDisabledGiftPool} onAllowDisabledChange={setAllowDisabledGiftPool} allowFull={allowFullGiftPool} onAllowFullChange={setAllowFullGiftPool} group={giftUser?.isSuperAccount ? undefined : giftUser?.activeGroup} description={giftMessage} /> : null}
            </FieldGroup>
            <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary">取消</Button></DialogClose>{giftExpiresAt ? <ActionButton type="submit" disabled={giftSaving || !giftPoolId} label="确认赠送" pendingLabel="赠送中..." pending={giftSaving} /> : <ActionButton type="button" onClick={previewGift} label="推荐订阅池" pendingLabel="计算中..." pending={giftPreviewing} />}</div>
          </form></DialogContent>
      </Dialog>
    </div>
  )
}
