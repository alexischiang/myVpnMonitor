import * as React from "react"
import { Link, useParams } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { ArrowLeft, MailCheck, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { fetchJson, postJson, putJson } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DataTable, DataTableColumnHeader } from "@/components/features/data-table"
import { useData } from "@/components/features/data-provider"
import { EmptyState, PageHeader, StatusBadge, TrafficProgress, UrlCell } from "@/components/features/shared"
import type { Bill, User, UserLog } from "@/types"
import { formatBytes, formatDate, formatDateTime, formatMoney, formatUserExpiry, userStatus } from "@/utils"

export function SubscriptionDetailPage() {
  const { id } = useParams()
  const { subscriptions, users, reload, runAsync } = useData()
  const [cache, setCache] = React.useState<{ body?: string; error?: string; fetchedAt?: string; bodyLength?: number; storage?: string } | null>(null)
  const item = subscriptions.find(entry => entry.id === id)
  const boundUsers = users.filter(user => user.subscriptionId === id)

  React.useEffect(() => {
    if (!id) return
    fetchJson<typeof cache>(`/api/subscriptions/${id}/cache`).then(setCache).catch(error => setCache({ error: error.message }))
  }, [id])

  const boundUserColumns = React.useMemo<ColumnDef<User>[]>(() => [
    {
      id: "user",
      accessorFn: user => `${user.userId || ""} ${user.wechatName || ""} ${user.email || ""}`,
      header: DataTableColumnHeader({ title: "用户" }),
      meta: { label: "用户" },
      cell: ({ row }) => row.original.userId || row.original.wechatName || "-",
    },
    {
      accessorKey: "expiresAt",
      header: DataTableColumnHeader({ title: "到期" }),
      meta: { label: "到期" },
      cell: ({ row }) => formatUserExpiry(row.original),
    },
    {
      id: "status",
      accessorFn: user => userStatus(user),
      header: DataTableColumnHeader({ title: "状态" }),
      meta: { label: "状态" },
      cell: ({ row }) => <StatusBadge status={userStatus(row.original)} />,
    },
  ], [])

  if (!item) return <EmptyState title="未找到订阅" />

  async function refresh() {
    await runAsync(async () => {
      await postJson(`/api/subscriptions/${item.id}/refresh`, {})
      await reload(["subscriptions"])
    }, "刷新订阅...")
  }

  async function refreshCache() {
    const payload = await fetchJson<typeof cache>(`/api/subscriptions/${item.id}/cache?force=true`).catch(error => ({ error: error.message }))
    setCache(payload)
  }

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <PageHeader
        title="订阅详情"
        description={item.email || item.serviceProvider || item.url}
        actions={
          <>
            <Button asChild variant="outline" size="sm"><Link to="/urls"><ArrowLeft />返回</Link></Button>
            <Button size="sm" onClick={refresh}><RefreshCw />刷新</Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>基础信息</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <UrlCell value={item.url} />
            <div className="grid gap-3">
              <Info label="HTTP" value={item.httpStatus || "-"} />
              <Info label="最后检查" value={formatDateTime(item.lastCheckedAt)} />
              <Info label="到期" value={formatDate(item.metrics?.expireAt)} />
              <Info label="已用流量" value={formatBytes(item.metrics?.usedBytes)} />
              <Info label="剩余流量" value={<TrafficProgress remaining={item.metrics?.remainingBytes} total={item.metrics?.totalBytes} />} />
              <Info label="状态" value={<StatusBadge status={item.status} />} />
            </div>
            {item.lastError && (
              <Alert variant="destructive">
                <AlertDescription>{item.lastError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>实时配置</CardTitle>
            <Button variant="outline" size="sm" onClick={refreshCache}>刷新缓存</Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              {cache?.fetchedAt ? `${cache.storage || "cache"} - ${formatDateTime(cache.fetchedAt)} - ${formatBytes(cache.bodyLength)}` : "未加载"}
            </p>
            <pre className="max-h-96 overflow-auto rounded-lg border bg-muted p-3 text-xs">{cache?.error ? `Error: ${cache.error}` : cache?.body || "(empty)"}</pre>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>绑定用户</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={boundUserColumns}
              data={boundUsers}
              searchKey="user"
              searchPlaceholder="搜索绑定用户..."
              emptyTitle="暂无绑定用户"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function UserDetailPage() {
  const { id } = useParams()
  const { users, bills, reload, runAsync } = useData()
  const user = users.find(entry => entry.id === id)
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [inviteEmail, setInviteEmail] = React.useState("")
  const [referralRate, setReferralRate] = React.useState(10)
  const [recurringReferral, setRecurringReferral] = React.useState(false)
  const userBills = bills.filter(item => item.userId === user?.id || item.user?.id === user?.id)
  const poolLogs = (user?.userLogs || []).filter(log => log.status === "switched" || log.reason === "manual-pool-changed" || log.reason === "user-created")

  React.useEffect(() => {
    setReferralRate(user?.referralRate ?? 10)
    setRecurringReferral(user?.recurringReferral === true)
  }, [user?.referralRate, user?.recurringReferral])

  const billColumns = React.useMemo<ColumnDef<Bill>[]>(() => [
    {
      accessorKey: "occurredAt",
      header: DataTableColumnHeader({ title: "时间" }),
      meta: { label: "时间" },
      cell: ({ row }) => formatDate(row.original.occurredAt),
    },
    {
      accessorKey: "type",
      header: DataTableColumnHeader({ title: "类型" }),
      meta: { label: "类型" },
      cell: ({ row }) => row.original.type || "-",
    },
    {
      accessorKey: "amount",
      header: DataTableColumnHeader({ title: "金额" }),
      meta: { label: "金额" },
      cell: ({ row }) => formatMoney(row.original.amount),
    },
    {
      accessorKey: "description",
      header: "备注",
      meta: { label: "备注" },
      cell: ({ row }) => row.original.description || "-",
      enableSorting: false,
    },
  ], [])

  const poolLogColumns = React.useMemo<ColumnDef<UserLog>[]>(() => [
    {
      accessorKey: "at",
      header: DataTableColumnHeader({ title: "时间" }),
      meta: { label: "时间" },
      cell: ({ row }) => formatDateTime(row.original.at),
    },
    {
      accessorKey: "statusText",
      header: "类型",
      meta: { label: "类型" },
      cell: ({ row }) => row.original.reason === "user-created" ? "新购绑定" : row.original.reason === "manual-pool-changed" ? "手动换池" : "自动换池",
    },
    {
      accessorKey: "fromSubscriptionLabel",
      header: "原池",
      meta: { label: "原池" },
      cell: ({ row }) => row.original.fromSubscriptionLabel || "-",
    },
    {
      accessorKey: "toSubscriptionLabel",
      header: "目标池",
      meta: { label: "目标池" },
      cell: ({ row }) => row.original.toSubscriptionLabel || "-",
    },
    {
      accessorKey: "reasonText",
      header: "原因",
      meta: { label: "原因" },
      cell: ({ row }) => row.original.reasonText || row.original.message || "-",
      enableSorting: false,
    },
  ], [])

  if (!user) return <EmptyState title="未找到用户" />

  async function sendAccountInvite(event: React.FormEvent) {
    event.preventDefault()
    try {
      await runAsync(async () => {
        await postJson(`/api/users/${user.id}/account-invite`, { email: inviteEmail })
        await reload(["users"], { silent: true })
        setInviteOpen(false)
        toast.success("账户认领邮件已发送")
      }, "发送认领邮件...")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "账户认领邮件发送失败")
    }
  }

  async function saveReferralSettings() {
    if (!user.accountId) return
    try {
      await runAsync(async () => {
        await putJson(`/api/referrals/accounts/${user.accountId}`, { referralRate, recurringReferral })
        await reload(["users"], { silent: true })
        toast.success("返利设置已保存")
      }, "保存返利设置...")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    }
  }

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <PageHeader title="用户详情" description={user.userId || user.wechatName || user.email} actions={<div className="flex gap-2">{user.accountStatus !== "active" ? <Button size="sm" onClick={() => { setInviteEmail([user.email, user.imessage, user.userId].find(value => value?.includes("@")) || ""); setInviteOpen(true) }}><MailCheck />{user.accountStatus === "invited" ? "重新发送认领邮件" : "发送账户认领邮件"}</Button> : null}<Button asChild variant="outline" size="sm"><Link to="/users"><ArrowLeft />返回</Link></Button></div>} />
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={sendAccountInvite}>
            <DialogHeader><DialogTitle>发送账户认领邮件</DialogTitle><DialogDescription>用户将通过该邮箱设置密码并认领订阅账户。</DialogDescription></DialogHeader>
            <div className="grid gap-2"><Label htmlFor="invite-email">收件邮箱</Label><Input id="invite-email" type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} autoFocus required /></div>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose><Button type="submit"><MailCheck />发送邮件</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>订阅信息</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Info label="用户 ID" value={user.userId || "-"} />
            <Info label="邮箱" value={user.email || "-"} />
            <Info label="iMessage" value={user.imessage || "-"} />
            <Info label="套餐" value={`${user.activeGroup || "-"} / ${user.vipLevel || "-"}`} />
            <Info label="到期" value={formatUserExpiry(user)} />
            <Info label="订阅池" value={user.subscription?.email || user.subscription?.serviceProvider || "-"} />
            <Info label="状态" value={<StatusBadge status={userStatus(user)} />} />
            <Info label="账户" value={user.accountStatus === "active" ? "已认领" : user.accountStatus === "invited" ? "等待认领" : "未认领"} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>账单记录</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={billColumns}
              data={userBills}
              searchKey="description"
              searchPlaceholder="搜索账单..."
              emptyTitle="暂无账单"
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>邀请返利设置</CardTitle></CardHeader>
          <CardContent>{user.accountId ? <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="referral-rate">收到返利比例（%）</Label><Input id="referral-rate" type="number" min="0" max="100" value={referralRate} onChange={event => setReferralRate(Number(event.target.value))} /></div><div className="flex items-center gap-2 self-end"><Checkbox id="recurring-referral" checked={recurringReferral} onCheckedChange={checked => setRecurringReferral(checked === true)} /><Label htmlFor="recurring-referral">享受循环返利</Label></div><Button className="sm:w-fit" onClick={() => void saveReferralSettings()}>保存返利设置</Button></div> : <p className="text-sm text-muted-foreground">用户认领账户后可配置邀请返利。</p>}</CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>换池日志</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={poolLogColumns}
              data={poolLogs}
              searchKey="reasonText"
              searchPlaceholder="搜索换池原因..."
              emptyTitle="暂无换池日志"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{value}</div>
    </div>
  )
}
