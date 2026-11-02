import * as React from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { useClearSearchParams } from "@/hooks/use-search-param-state"
import type { ColumnDef } from "@tanstack/react-table"
import { Copy, Eye, Loader2, Pencil, Trash2, UserPlus } from "lucide-react"
import { toast } from "@/components/features/toast"

import { deleteJson, fetchJson, postJson, putJson } from "@/api"
import { DataTableCard } from "@/components/features/data-table-card"
import { DataTable, DataTableColumnHeader, DataTableRowActions } from "@/components/features/arc-data-table"
import { useData } from "@/components/features/data-provider"
import { StatusBadge, StatusDot, TrafficProgress, UserStatusBadge } from "@/components/features/shared"
import { UserFormDialog, type UserFormValues } from "@/components/features/user-form-dialog"
import { UsersSummaryCard } from "@/components/features/users-summary-card"
import { VipBadge } from "@/components/features/vip-badge"
import type { User, XuiPresence } from "@/types"
import { absoluteUrl, formatBytes, formatDate, formatDateTime, formatMoney, userStatus } from "@/utils"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Dialog as ArcDialog, DialogClose as ArcDialogClose, DialogContent as ArcDialogContent } from "@/components/arc/dialog/dialog"
import { Card } from "@/components/arc/card/card"

const userStatusLabels: Record<string, string> = { ok: "有效", warning: "即将到期", expired: "已过期", registered: "未购买" }

function OnlineIndicator({ online }: { online: boolean }) {
  return <StatusDot status={online ? "online" : "offline"} />
}

export function UsersPage() {
  const { users, reload, runAsync } = useData()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const clearFilters = useClearSearchParams(["account", "plan", "status", "activity"])
  const [editing, setEditing] = React.useState<User | null>(null)
  const [open, setOpen] = React.useState(false)
  const [deleteUser, setDeleteUser] = React.useState<User | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const accountFilter = searchParams.get("account") || "all"
  const planFilter = searchParams.get("plan") || "all"
  const statusFilter = searchParams.get("status") || "all"
  const activityFilter = searchParams.get("activity") || "all"
  const searchQuery = searchParams.get("q") || ""
  const [presence, setPresence] = React.useState<XuiPresence | null>(null)
  const planOptions = React.useMemo(() => [...new Set(users.map(item => item.v2ProductSnapshot?.lineGroupId).filter((value): value is string => Boolean(value)))].sort(), [users])
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
    (planFilter === "all" || item.v2ProductSnapshot?.lineGroupId === planFilter) &&
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

  async function save(values: UserFormValues) {
    await runAsync(async () => {
      if (editing?.id) {
        await putJson(`/api/users/${editing.id}`, values)
        toast({ type: "success", title: "用户已更新" })
      } else {
        await postJson("/api/users", { ...values, lineType: "self_hosted", trafficTier: Number(values.trafficTier) || 1 })
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
    const xui = xuiPresenceFor(item)
    const status = userStatus(item)
    // The whole card opens the user; its actions live on the detail page.
    return <Link to={`/users/detail/${item.id}${location.search}`} className="block rounded-[var(--radius-panel)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><Card><div className="grid min-w-0 gap-1.5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium">{item.userId || `#${item.customerID}`}</p>
        <div className="flex shrink-0 items-center gap-1">{item.registeredOnly ? null : <VipBadge level={item.vipLevel} />}<StatusBadge status={status}>{userStatusLabels[status]}</StatusBadge></div>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground tabular-nums">
        <p className="min-w-0 truncate">{item.registeredOnly ? `注册 ${formatDate(item.createdAt)}` : `到期 ${formatDate(item.expiresAt)}`}{item.userId ? ` · #${item.customerID}` : ""}{item.registeredOnly ? "" : ` · ${(item.v2ProductSnapshot?.lineGroupId || "-").toUpperCase()}`}</p>
        {item.registeredOnly ? null : <p className="shrink-0 font-medium text-foreground">{formatMoney(item.actualPaid)}</p>}
      </div>
      {xui.available ? <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <OnlineIndicator online={xui.online} /><span className="truncate">{xui.online ? xui.nodes.join(" / ") : xui.lastOnline ? `最后在线 ${formatDateTime(new Date(xui.lastOnline * 1000).toISOString())}` : "从未在线"}</span>
      </div> : null}
    </div></Card></Link>
  }

  const columns = React.useMemo<ColumnDef<User>[]>(() => [
    {
      id: "user",
      accessorFn: item => `${item.userId || ""} ${item.customerID || ""} ${item.wechatName || ""} ${item.imessage || ""} ${item.email || ""} #${item.customerID || ""} @${item.userId || ""} @${item.email || ""}`,
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
        : row.original.v2ProductSnapshot?.trafficBytes === null ? "不限" : "-",
    },
    {
      id: "dailyTraffic",
      accessorFn: item => xuiPresenceFor(item).dailyUsedBytes,
      header: DataTableColumnHeader({ title: "今日流量" }),
      meta: { label: "今日流量" },
      cell: ({ row }) => { const value = row.getValue<number>("dailyTraffic"); return value < 0 ? "-" : formatBytes(value) },
    },
    {
      id: "lineGroupId",
      accessorFn: row => row.v2ProductSnapshot?.lineGroupId || "",
      header: DataTableColumnHeader({ title: "套餐等级" }),
      meta: { label: "套餐等级" },
      cell: ({ row }) => row.original.v2ProductSnapshot?.lineGroupId ? <Badge>{row.original.v2ProductSnapshot.lineGroupId.toUpperCase()}</Badge> : "-",
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
      <DataTableCard>
        <DataTable
          filters={[
            { id: "account", label: "账户状态", value: accountFilter, onChange: value => updateSearchParam("account", value, "all"), options: [{ value: "all", label: "全部" }, { value: "active", label: "已认领" }, { value: "disabled", label: "已停用" }, { value: "invited", label: "等待认领" }, { value: "unclaimed", label: "未认领" }] },
            { id: "plan", label: "套餐", value: planFilter, onChange: value => updateSearchParam("plan", value, "all"), options: [{ value: "all", label: "全部" }, ...planOptions.map(plan => ({ value: plan, label: plan }))] },
            { id: "status", label: "套餐状态", value: statusFilter, onChange: value => updateSearchParam("status", value, "all"), options: [{ value: "all", label: "全部" }, { value: "registered", label: "未购买" }, { value: "ok", label: "Active" }, { value: "warning", label: "Expiring" }, { value: "expired", label: "Expired" }] },
            { id: "activity", label: "在线情况", value: activityFilter, onChange: value => updateSearchParam("activity", value, "all"), options: [{ value: "all", label: "全部" }, { value: "online", label: "当前在线" }, { value: "day", label: "超过 24 小时未在线" }, { value: "week", label: "超过 7 天未在线" }, { value: "month", label: "超过 30 天未在线" }, { value: "never", label: "从未在线" }] },
          ]}
          onClearFilters={clearFilters}
          columns={columns}
          data={filteredUsers}
          searchKey="user"
          initialSearchValue={searchQuery}
          onSearchChange={value => updateSearchParam("q", value)}
          renderMobileItem={renderMobileUser}
          searchPlaceholder="搜索用户，#ID，@用户名/邮箱"
          emptyTitle="暂无用户"
          pageSize={30}
          frame="card"
          stateKey="users"
          toolbar={<Button collapse onClick={() => { setEditing(null); setOpen(true) }}><UserPlus />新增用户</Button>}
        />
      </DataTableCard>

      <UserFormDialog
        open={open}
        user={editing}
        onOpenChange={setOpen}
        onSubmit={save}
      />
      <ArcDialog open={Boolean(deleteUser)} onOpenChange={open => { if (!open) setDeleteUser(null) }}>
        <ArcDialogContent title="确认删除用户？" description="删除后无法恢复，相关用户记录也将不再显示。"><div className="flex flex-wrap justify-end gap-2"><ArcDialogClose asChild><Button variant="secondary" disabled={deleting}>取消</Button></ArcDialogClose><ArcDialogClose asChild><Button variant="primary" onClick={() => void confirmRemove()} disabled={deleting}>{deleting ? <Loader2 className="animate-spin" /> : null}确认删除</Button></ArcDialogClose></div></ArcDialogContent>
      </ArcDialog>
    </div>
  )
}
