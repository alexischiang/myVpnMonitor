import * as React from "react"
import { Link, useLocation, useParams } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { ArrowLeft, Eye, Gift, Loader2, MailCheck, Power, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { fetchJson, postJson, putJson } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DataTable, DataTableColumnHeader, DataTableRowActions } from "@/components/features/data-table"
import { useData } from "@/components/features/data-provider"
import { EmptyState, PageHeader, StatusBadge, TrafficProgress, UrlCell, UserStatusBadge } from "@/components/features/shared"
import { SubscriptionPoolSelect } from "@/components/features/subscription-pool-select"
import { UserBillsCard } from "@/components/features/user-bills-card"
import type { User, UserLog } from "@/types"
import { absoluteUrl, formatBytes, formatDate, formatDateTime, formatMoney, formatUserExpiry, userStatus } from "@/utils"

type GiftPreview = {
  expiresAt: string
  subscription: User["subscription"] | null
  reason?: string
}

export function SubscriptionDetailPage() {
  const { id } = useParams()
  const { subscriptions, users, reload, runAsync } = useData()
  const [cache, setCache] = React.useState<{ body?: string; error?: string; fetchedAt?: string; bodyFetchedAt?: string; bodyLength?: number; storage?: string } | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [refreshingCache, setRefreshingCache] = React.useState(false)
  const [togglingAutoSwitch, setTogglingAutoSwitch] = React.useState(false)
  const item = subscriptions.find(entry => entry.id === id)
  const boundUsers = users.filter(user => user.subscriptionId === id)

  React.useEffect(() => {
    if (!id) return
    fetchJson<typeof cache>(`/api/subscriptions/${id}/cache`).then(setCache).catch(error => setCache({ error: error.message }))
  }, [id])

  const boundUserColumns = React.useMemo<ColumnDef<User>[]>(() => [
    {
      id: "user",
      accessorFn: user => `${user.customerID || ""} ${user.userId || ""} ${user.wechatName || ""} ${user.email || ""}`,
      header: DataTableColumnHeader({ title: "用户" }),
      meta: { label: "用户" },
      cell: ({ row }) => row.original.customerID || row.original.userId || row.original.wechatName || "-",
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
      cell: ({ row }) => <UserStatusBadge user={row.original} />,
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => <DataTableRowActions detail={<Button asChild variant="ghost" size="icon"><Link to={`/users/detail/${row.original.id}`} aria-label="查看用户详情"><Eye /></Link></Button>} />,
      enableHiding: false,
      enableSorting: false,
    },
  ], [])

  if (!item) return <EmptyState title="未找到订阅" />

  async function refresh() {
    setRefreshing(true)
    try {
      await runAsync(async () => {
        await postJson(`/api/subscriptions/${item.id}/refresh`, {})
        const payload = await fetchJson<typeof cache>(`/api/subscriptions/${item.id}/cache`)
        setCache(payload)
        await reload(["subscriptions"])
      }, "刷新配置和指标...")
    } finally {
      setRefreshing(false)
    }
  }

  async function refreshCache() {
    setRefreshingCache(true)
    try {
      const payload = await fetchJson<typeof cache>(`/api/subscriptions/${item.id}/cache?force=true`).catch(error => ({ error: error.message }))
      setCache(payload)
      await reload(["subscriptions"])
    } finally {
      setRefreshingCache(false)
    }
  }

  async function toggleAutoSwitch() {
    setTogglingAutoSwitch(true)
    try {
      await runAsync(async () => {
        await putJson(`/api/subscriptions/${item.id}`, { excludeFromAutoSwitch: !item.excludeFromAutoSwitch })
        await reload(["subscriptions"])
        toast.success(item.excludeFromAutoSwitch ? "已恢复自动换池切入" : "已禁止自动换池切入")
      }, item.excludeFromAutoSwitch ? "恢复自动换池切入..." : "禁止自动换池切入...")
    } finally {
      setTogglingAutoSwitch(false)
    }
  }

  return (
    <div className="grid min-w-0 w-full gap-4 px-4 lg:px-6">
      <PageHeader
        title="订阅详情"
        description={item.email || item.serviceProvider || item.url || "手动 Base64 订阅"}
        actions={
          <>
            <Button asChild variant="outline" size="sm"><Link to="/urls"><ArrowLeft />返回</Link></Button>
            {item.sourceType !== "manual" ? <Button variant="outline" size="sm" onClick={toggleAutoSwitch} disabled={togglingAutoSwitch}>{togglingAutoSwitch ? <Loader2 className="animate-spin" /> : null}{item.excludeFromAutoSwitch ? "恢复自动切入" : "禁止自动切入"}</Button> : null}
            <Button size="sm" onClick={refresh} disabled={refreshing}>{refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}刷新</Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>基础信息</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            {item.sourceType === "manual" ? <Info label="配置来源" value="手动 Base64" /> : <UrlCell value={item.url} />}
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
            <Button variant="outline" size="sm" onClick={refreshCache} disabled={refreshingCache}>{refreshingCache ? <Loader2 className="animate-spin" /> : <RefreshCw />}刷新缓存</Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              {cache?.body ? `缓存时间：${formatDateTime(cache.bodyFetchedAt || cache.fetchedAt)} - ${formatBytes(cache.bodyLength)}` : cache?.fetchedAt ? `最近尝试：${formatDateTime(cache.fetchedAt)}` : "未加载"}
            </p>
            {cache?.error ? <Alert variant="destructive"><AlertDescription>最新配置拉取失败：{cache.error}{cache.body ? ` 当前显示的是 ${formatDateTime(cache.bodyFetchedAt || cache.fetchedAt)} 的缓存配置。` : " 当前没有可显示的缓存配置。"}</AlertDescription></Alert> : null}
            <pre className="max-h-96 overflow-auto rounded-lg border bg-muted p-3 text-xs">{cache?.body || "(empty)"}</pre>
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
  const location = useLocation()
  const { users, subscriptions, bills, reload, runAsync } = useData()
  const user = users.find(entry => entry.id === id)
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [inviteEmail, setInviteEmail] = React.useState("")
  const [inviteEmailError, setInviteEmailError] = React.useState("")
  const [inviteSending, setInviteSending] = React.useState(false)
  const [referralRate, setReferralRate] = React.useState(10)
  const [recurringReferral, setRecurringReferral] = React.useState(false)
  const [referralSaving, setReferralSaving] = React.useState(false)
  const [giftBalanceOpen, setGiftBalanceOpen] = React.useState(false)
  const [giftBalanceAmount, setGiftBalanceAmount] = React.useState("")
  const [giftBalanceNote, setGiftBalanceNote] = React.useState("")
  const [giftBalanceError, setGiftBalanceError] = React.useState("")
  const [giftBalanceSaving, setGiftBalanceSaving] = React.useState(false)
  const [poolOpen, setPoolOpen] = React.useState(false)
  const [poolId, setPoolId] = React.useState("")
  const [poolSaving, setPoolSaving] = React.useState(false)
  const [allowDisabledPool, setAllowDisabledPool] = React.useState(false)
  const [allowFullPool, setAllowFullPool] = React.useState(false)
  const [giftOpen, setGiftOpen] = React.useState(false)
  const [giftDays, setGiftDays] = React.useState("")
  const [giftExpiresAt, setGiftExpiresAt] = React.useState("")
  const [giftPoolId, setGiftPoolId] = React.useState("")
  const [giftMessage, setGiftMessage] = React.useState("")
  const [giftError, setGiftError] = React.useState("")
  const [giftPreviewing, setGiftPreviewing] = React.useState(false)
  const [giftSaving, setGiftSaving] = React.useState(false)
  const [allowDisabledGiftPool, setAllowDisabledGiftPool] = React.useState(false)
  const [allowFullGiftPool, setAllowFullGiftPool] = React.useState(false)
  const [accountStatusOpen, setAccountStatusOpen] = React.useState(false)
  const [accountStatusSaving, setAccountStatusSaving] = React.useState(false)
  const currentPool = subscriptions.find(item => item.id === user?.subscriptionId)
  const userBills = bills.filter(item => item.userId === user?.id || item.user?.id === user?.id)
  const purchaseCount = userBills.filter(item => !item.reversedAt).length
  const poolLogs = (user?.userLogs || []).filter(log => log.status === "switched" || log.reason === "manual-pool-changed" || log.reason === "user-created")

  React.useEffect(() => {
    setReferralRate(user?.referralRate ?? 10)
    setRecurringReferral(user?.recurringReferral === true)
  }, [user?.referralRate, user?.recurringReferral])

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

  async function sendAccountInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = event.currentTarget.elements.namedItem("inviteEmail") as HTMLInputElement
    if (!inviteEmail.trim() || !input.validity.valid) {
      setInviteEmailError(inviteEmail.trim() ? "请输入有效的邮箱地址。" : "请输入收件邮箱。")
      return
    }
    setInviteEmailError("")
    setInviteSending(true)
    try {
      await runAsync(async () => {
        await postJson(`/api/users/${user.id}/account-invite`, { email: inviteEmail })
        await reload(["users"], { silent: true })
        setInviteOpen(false)
        toast.success("账户认领邮件已发送")
      }, "发送认领邮件...")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "账户认领邮件发送失败")
    } finally {
      setInviteSending(false)
    }
  }

  async function saveReferralSettings() {
    if (!user.accountId) return
    setReferralSaving(true)
    try {
      await runAsync(async () => {
        await putJson(`/api/referrals/accounts/${user.accountId}`, { referralRate, recurringReferral })
        await reload(["users"], { silent: true })
        toast.success("返利设置已保存")
      }, "保存返利设置...")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    } finally {
      setReferralSaving(false)
    }
  }

  async function giftBalance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = Number(giftBalanceAmount)
    if (!/^\d+(\.\d{1,2})?$/.test(giftBalanceAmount.trim()) || amount <= 0 || amount > 10000) {
      setGiftBalanceError("请输入 0.01 至 10,000.00 元，最多两位小数。")
      return
    }
    setGiftBalanceSaving(true)
    try {
      const wallet = await postJson<{ availableBalance: number }>(`/api/users/${user.id}/wallet-gift`, { amount, note: giftBalanceNote })
      setGiftBalanceOpen(false)
      setGiftBalanceAmount("")
      setGiftBalanceNote("")
      toast.success(`已赠送 ${formatMoney(amount)}，用户可用余额 ${formatMoney(wallet.availableBalance)}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "赠送余额失败")
    } finally {
      setGiftBalanceSaving(false)
    }
  }

  function openPoolDialog() {
    setPoolId("")
    setAllowDisabledPool(false)
    setAllowFullPool(false)
    setPoolOpen(true)
  }

  async function changePool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!poolId || poolId === user.subscriptionId) return
    setPoolSaving(true)
    try {
      await postJson(`/api/users/${user.id}/pool`, { subscriptionId: poolId, allowDisabled: allowDisabledPool, allowFull: allowFullPool })
      await reload(["users"])
      setPoolOpen(false)
      toast.success("用户订阅池已更新")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "换池失败")
    } finally {
      setPoolSaving(false)
    }
  }

  function openGiftDialog() {
    setGiftDays("")
    setGiftExpiresAt("")
    setGiftPoolId("")
    setGiftMessage("")
    setGiftError("")
    setAllowDisabledGiftPool(false)
    setAllowFullGiftPool(false)
    setGiftOpen(true)
  }

  async function previewGift() {
    const days = Number(giftDays)
    if (!Number.isSafeInteger(days) || days <= 0) {
      setGiftError("请输入正确的赠送天数")
      return
    }
    setGiftPreviewing(true)
    setGiftError("")
    try {
      const preview = await postJson<GiftPreview>(`/api/users/${user.id}/gift`, { days, preview: true })
      setGiftExpiresAt(preview.expiresAt)
      setGiftPoolId(preview.subscription?.id || "")
      setGiftMessage(preview.subscription ? "已根据赠送后的到期日推荐订阅池，可手动更换。" : preview.reason || "暂无推荐订阅池，请手动选择。")
    } catch (error) {
      setGiftError(error instanceof Error ? error.message : "计算赠送时长失败")
    } finally {
      setGiftPreviewing(false)
    }
  }

  async function submitGift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!giftExpiresAt || !giftPoolId) return
    setGiftSaving(true)
    try {
      await postJson(`/api/users/${user.id}/gift`, { days: Number(giftDays), subscriptionId: giftPoolId, allowDisabled: allowDisabledGiftPool, allowFull: allowFullGiftPool })
      await reload(["users"])
      setGiftOpen(false)
      toast.success("赠送时长已生效")
    } catch (error) {
      setGiftError(error instanceof Error ? error.message : "赠送时长失败")
    } finally {
      setGiftSaving(false)
    }
  }

  async function toggleAccountStatus() {
    const disabling = user.accountStatus === "active"
    setAccountStatusSaving(true)
    try {
      await postJson(`/api/users/${user.id}/account-status`, { disabled: disabling })
      await reload(["users"], { silent: true })
      setAccountStatusOpen(false)
      toast.success(disabling ? "账户已停用" : "账户已恢复")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "账户状态更新失败")
    } finally {
      setAccountStatusSaving(false)
    }
  }

  return (
    <div className="grid min-w-0 w-full gap-4 px-4 lg:px-6">
      <Dialog open={giftBalanceOpen} onOpenChange={setGiftBalanceOpen}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={giftBalance}>
            <DialogHeader><DialogTitle>赠送余额</DialogTitle><DialogDescription>赠送金额永久有效，消费时优先于充值余额使用，不计入 VIP。</DialogDescription></DialogHeader>
            <Field><FieldLabel htmlFor="gift-balance-amount">赠送金额</FieldLabel><Input id="gift-balance-amount" inputMode="decimal" placeholder="0.00" value={giftBalanceAmount} onChange={event => { setGiftBalanceAmount(event.target.value); setGiftBalanceError("") }} aria-invalid={Boolean(giftBalanceError)} autoFocus required /><FieldError>{giftBalanceError}</FieldError></Field>
            <Field><FieldLabel htmlFor="gift-balance-note">备注</FieldLabel><Input id="gift-balance-note" maxLength={100} placeholder="可选" value={giftBalanceNote} onChange={event => setGiftBalanceNote(event.target.value)} /></Field>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={giftBalanceSaving}>取消</Button></DialogClose><Button type="submit" disabled={giftBalanceSaving}>{giftBalanceSaving ? <Loader2 className="animate-spin" /> : <Gift />}{giftBalanceSaving ? "赠送中..." : "确认赠送"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={sendAccountInvite} noValidate>
            <DialogHeader><DialogTitle>发送账户认领邮件</DialogTitle><DialogDescription>用户将通过该邮箱设置密码并认领订阅账户。</DialogDescription></DialogHeader>
            <Field><FieldLabel htmlFor="invite-email">收件邮箱</FieldLabel><Input id="invite-email" name="inviteEmail" type="email" value={inviteEmail} onChange={event => { setInviteEmail(event.target.value); setInviteEmailError("") }} aria-invalid={Boolean(inviteEmailError)} autoFocus required /><FieldError>{inviteEmailError}</FieldError></Field>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={inviteSending}>取消</Button></DialogClose><Button type="submit" disabled={inviteSending}>{inviteSending ? <Loader2 className="animate-spin" /> : <MailCheck />}{inviteSending ? "发送中..." : "发送邮件"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={poolOpen} onOpenChange={setPoolOpen}>
        <DialogContent className="sm:max-w-xl">
          <form className="grid gap-4" onSubmit={changePool} noValidate>
            <DialogHeader><DialogTitle>手动换池</DialogTitle><DialogDescription className="break-all">当前订阅池：{currentPool?.email || currentPool?.serviceProvider || "未绑定"}</DialogDescription></DialogHeader>
            <SubscriptionPoolSelect id="detail-manual-pool" label="目标订阅池" subscriptions={subscriptions} value={poolId} onValueChange={setPoolId} allowDisabled={allowDisabledPool} onAllowDisabledChange={setAllowDisabledPool} allowFull={allowFullPool} onAllowFullChange={setAllowFullPool} group={user.activeGroup} />
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={poolSaving}>取消</Button></DialogClose><Button type="submit" disabled={poolSaving || !poolId || poolId === user.subscriptionId}>{poolSaving ? <RefreshCw className="animate-spin" /> : <RefreshCw />}{poolSaving ? "换池中..." : "确认换池"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={giftOpen} onOpenChange={setGiftOpen}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={submitGift} noValidate>
            <DialogHeader><DialogTitle>赠送时长</DialogTitle><DialogDescription>{user.userId || user.email || "用户"} · 当前到期 {formatDate(user.expiresAt)}</DialogDescription></DialogHeader>
            <FieldGroup>
              <Field><FieldLabel htmlFor="detail-gift-days">赠送天数</FieldLabel><Input id="detail-gift-days" type="number" min="1" step="1" value={giftDays} onChange={event => { setGiftDays(event.target.value); setGiftExpiresAt(""); setGiftPoolId(""); setGiftMessage(""); setGiftError("") }} /><FieldError>{giftError}</FieldError></Field>
              <Field><FieldLabel>快捷选择</FieldLabel><div className="flex flex-wrap gap-2">{[7, 15, 30].map(days => <Button key={days} type="button" variant={giftDays === String(days) ? "default" : "outline"} size="sm" onClick={() => { setGiftDays(String(days)); setGiftExpiresAt(""); setGiftPoolId(""); setGiftMessage(""); setGiftError("") }}>{days} 天</Button>)}</div></Field>
              {giftExpiresAt ? <Field><FieldLabel htmlFor="detail-gift-expires-at">赠送后到期日</FieldLabel><Input id="detail-gift-expires-at" value={giftExpiresAt.slice(0, 10)} readOnly /></Field> : null}
              {giftExpiresAt ? <SubscriptionPoolSelect id="detail-gift-pool" label="订阅池 URL" subscriptions={subscriptions} value={giftPoolId} onValueChange={setGiftPoolId} allowDisabled={allowDisabledGiftPool} onAllowDisabledChange={setAllowDisabledGiftPool} allowFull={allowFullGiftPool} onAllowFullChange={setAllowFullGiftPool} group={user.activeGroup} description={giftMessage} /> : <FieldDescription>输入天数后先计算到期日和推荐订阅池。</FieldDescription>}
            </FieldGroup>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={giftSaving}>取消</Button></DialogClose>{giftExpiresAt ? <Button type="submit" disabled={giftSaving || !giftPoolId}>{giftSaving ? <Loader2 className="animate-spin" /> : <Gift />}{giftSaving ? "赠送中..." : "确认赠送"}</Button> : <Button type="button" onClick={() => void previewGift()} disabled={giftPreviewing}>{giftPreviewing ? <Loader2 className="animate-spin" /> : <Gift />}{giftPreviewing ? "计算中..." : "推荐订阅池"}</Button>}</DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={accountStatusOpen} onOpenChange={setAccountStatusOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{user.accountStatus === "active" ? "确认停用账户？" : "确认恢复账户？"}</AlertDialogTitle><AlertDialogDescription>{user.accountStatus === "active" ? "停用后用户将无法登录，当前登录状态也会失效；已绑定的订阅链接仍然有效。" : "恢复后用户可以重新登录账户，原有订阅和余额保持不变。"}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={accountStatusSaving}>取消</AlertDialogCancel><AlertDialogAction className={user.accountStatus === "active" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined} onClick={event => { event.preventDefault(); void toggleAccountStatus() }} disabled={accountStatusSaving}>{accountStatusSaving ? <Loader2 className="animate-spin" /> : <Power />}{accountStatusSaving ? "处理中..." : user.accountStatus === "active" ? "确认停用" : "确认恢复"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <main className="grid min-w-0 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="self-start xl:sticky xl:top-4">
          <CardHeader className="relative justify-items-center text-center">
            <Button asChild variant="ghost" size="icon-sm" className="absolute top-4 left-4">
              <Link to={`/users${location.search}`} aria-label="返回用户列表"><ArrowLeft /></Link>
            </Button>
            <Avatar className="size-20">
              <AvatarFallback className="text-xl">{(user.wechatName || user.userId || user.email || "用户").slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <CardTitle className="break-all text-lg">{user.wechatName || user.userId || user.email || "用户"}</CardTitle>
            <CardDescription className="flex flex-wrap justify-center gap-2">
              <UserStatusBadge user={user} />
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Card className="gap-2 py-4">
                <CardContent className="grid justify-items-center gap-1 px-3 text-center">
                  <p className="text-lg font-semibold">{purchaseCount}</p>
                  <p className="text-xs text-muted-foreground">购买次数</p>
                </CardContent>
              </Card>
              <Card className="gap-2 py-4">
                <CardContent className="grid justify-items-center gap-1 px-3 text-center">
                  <p className="text-lg font-semibold">{formatMoney(user.actualPaid)}</p>
                  <p className="text-xs text-muted-foreground">总消费金额</p>
                </CardContent>
              </Card>
            </div>
            <Separator />
            <div className="grid gap-3 [&>div]:grid-cols-[5rem_minmax(0,1fr)] [&>div]:items-start [&>div]:gap-3 [&>div>div]:text-right [&>div>div]:text-sm [&>div>div]:font-normal [&>div>p]:text-sm">
              <Info label="用户名" value={user.userId || "-"} />
              <Info label="ID" value={user.customerID || "-"} />
              <Info label="邮箱" value={user.email || "-"} />
              <Info label="账户" value={user.accountStatus === "active" ? "已认领" : user.accountStatus === "disabled" ? "已停用" : user.accountStatus === "invited" ? "等待认领" : "未认领"} />
              <Info label="套餐" value={user.registeredOnly ? "未开通" : (user.activeGroup?.toUpperCase() || "-")} />
              <Info label="VIP" value={user.vipLevel?.toUpperCase() || "-"} />
              <Info label="当前到期" value={formatUserExpiry(user)} />
            </div>
          </CardContent>
          {user.registeredOnly ? null : (
            <CardFooter className="grid gap-2">
              <Button variant="outline" className="w-full" onClick={openPoolDialog}><RefreshCw />换池</Button>
              <Button variant="outline" className="w-full" onClick={openGiftDialog}><Gift />赠送时长</Button>
              {user.accountStatus === "active" ? <>
                <Button variant="outline" className="w-full" onClick={() => { setGiftBalanceError(""); setGiftBalanceOpen(true) }}><Gift />赠送余额</Button>
                <Button variant="destructive" className="w-full" onClick={() => setAccountStatusOpen(true)}><Power />停用账户</Button>
              </> : user.accountStatus === "disabled" ? (
                <Button variant="outline" className="w-full" onClick={() => setAccountStatusOpen(true)}><Power />恢复账户</Button>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => { setInviteEmail([user.email, user.imessage, user.userId].find(value => value?.includes("@")) || ""); setInviteEmailError(""); setInviteOpen(true) }}><MailCheck />{user.accountStatus === "invited" ? "重新发送认领邮件" : "发送账户认领邮件"}</Button>
              )}
            </CardFooter>
          )}
        </Card>

        <Tabs defaultValue="overview" className="min-w-0 gap-4">
          <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="overview">基本信息</TabsTrigger>
            <TabsTrigger value="bills">账单记录</TabsTrigger>
            <TabsTrigger value="referral">邀请返利</TabsTrigger>
            <TabsTrigger value="logs">换池日志</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="grid min-w-0 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>当前套餐</CardTitle>
                <CardDescription>{user.registeredOnly ? "尚未开通订阅" : `${user.activeGroup?.toUpperCase() || "未设置"} 套餐`}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Info label="当前到期" value={formatUserExpiry(user)} />
                <Info label="原套餐到期" value={formatDate(user.planExpiresAt || user.expiresAt)} />
                <Info label="赠送时长" value={`${user.giftedDays || 0} 天`} />
                <Info label="订阅池" value={user.subscription?.email || user.subscription?.serviceProvider || "-"} />
                <Info label="用户 URL" value={<UrlCell value={absoluteUrl(user.relayPath)} />} />
                <Info label="订阅状态" value={<UserStatusBadge user={user} />} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>账户信息</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Info label="ID" value={user.customerID || "-"} />
                <Info label="邮箱" value={user.email || "-"} />
                <Info label="iMessage" value={user.imessage || "-"} />
                <Info label="VIP 等级" value={user.vipLevel?.toUpperCase() || "-"} />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="bills" className="min-w-0">
            <UserBillsCard bills={userBills} />
          </TabsContent>
          <TabsContent value="referral" className="min-w-0">
            <Card>
              <CardHeader className="gap-6"><CardTitle>邀请返利设置</CardTitle><Separator /></CardHeader>
              <CardContent>{user.accountId ? <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="referral-rate">收到返利比例（%）</Label><Input id="referral-rate" type="number" min="0" max="100" value={referralRate} onChange={event => setReferralRate(Number(event.target.value))} /></div><div className="flex items-center gap-2 self-end"><Checkbox id="recurring-referral" checked={recurringReferral} onCheckedChange={checked => setRecurringReferral(checked === true)} /><Label htmlFor="recurring-referral">享受循环返利</Label></div><Button className="sm:w-fit" onClick={() => void saveReferralSettings()} disabled={referralSaving}>{referralSaving ? <Loader2 className="animate-spin" /> : null}{referralSaving ? "保存中..." : "保存返利设置"}</Button></div> : <p className="text-sm text-muted-foreground">用户认领账户后可配置邀请返利。</p>}</CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="logs" className="min-w-0">
            <Card>
              <CardHeader className="gap-6"><CardTitle>换池日志</CardTitle><Separator /></CardHeader>
              <CardContent><DataTable columns={poolLogColumns} data={poolLogs} searchKey="reasonText" searchPlaceholder="搜索换池原因..." emptyTitle="暂无换池日志" /></CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="min-w-0 break-words text-sm font-medium">{value}</div>
    </div>
  )
}
