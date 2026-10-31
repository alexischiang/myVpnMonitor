import * as React from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { AlertCircle, ArrowRightLeft, AtSign, Banknote, Eye, Gift, Loader2, MailCheck, Network, Power, RefreshCw, RotateCcw, Settings2, UserCog } from "lucide-react"
import { toast } from "@/components/features/toast"

import { fetchJson, postJson, putJson } from "@/api"
import { Avatar } from "@/components/arc/avatar/avatar"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { AccountVerificationIcon } from "@/components/features/account-verification-icon"
import { DataTable, DataTableColumnHeader, DataTableRowActions } from "@/components/features/arc-data-table"
import { useData } from "@/components/features/data-provider"
import { EmptyState, PageHeader, StatusBadge, TrafficProgress, UrlCell, UserStatusBadge } from "@/components/features/shared"
import { SubscriptionPoolSelect } from "@/components/features/subscription-pool-select"
import { UserBillsCard } from "@/components/features/user-bills-card"
import { NodeTrafficList } from "@/components/features/node-traffic-list"
import { BackButton } from "@/components/features/back-button"
import { CatalogPlanFields, catalogPlanConfig, catalogPurchaseOptions as catalogPurchaseOptionsFor, useCatalogV2Products } from "@/components/features/catalog-plan-fields"
import { XuiClientDialog } from "@/components/features/xui-client-dialog"
import type { PlanSnapshot, User, XuiCustomInboundManagement } from "@/types"
import { absoluteUrl, durationLabels, formatBytes, formatDate, formatDateTime, formatMoney, formatUserExpiry, planSnapshotName, planSnapshotOptionId, userStatus } from "@/utils"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { Card } from "@/components/arc/card/card"
import { Dialog as ArcDialog, DialogClose as ArcDialogClose, DialogContent as ArcDialogContent } from "@/components/arc/dialog/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Input } from "@/components/arc/input/input"
import { SearchField } from "@/components/arc/search-field/search-field"
import { Select } from "@/components/arc/select/select"
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog"
import { Card as ArcCard } from "@/components/arc/card/card"
import { SimpleTable } from "@/components/features/simple-table"

type GiftPreview = {
  days: number
  plan: PlanSnapshot
  beforeExpiresAt: string
  afterExpiresAt: string
  giftedDaysBefore: number
  giftedDaysAfter: number
  queuedPlan: { planSnapshot: PlanSnapshot | null; before: { startsAt: string; expiresAt: string }; after: { startsAt: string; expiresAt: string } } | null
}

// Mirrors the server's giftDaysPreview gate: only an active recurring V2 plan can receive gifted days.
function hasActiveRecurringPlan(user: User) {
  return user.v2ProductSnapshot?.productType === "recurring_plan" && user.duration !== "lifetime" && new Date(user.expiresAt || 0).getTime() > Date.now()
}

type ManualPaymentQuote = {
  optionId: string
  optionLabel: string
  originalAmount: number
  vipLevel: string
  vipDiscountAmount: number
  amount: number
  purchaseAction: "initial" | "extend" | "replace" | "add_on"
}

type ReferralDetails = {
  invitedUsers: Array<{ id: string; email: string; status: string; createdAt?: string; orderCount: number; totalPaid: number }>
  orders: Array<{ id: string; number: string; inviteeEmail: string; planName: string; amount: number; status: string; createdAt?: string }>
  rewards: Array<{ id: string; sourceOrderId: string; orderNumber: string; inviteeEmail: string; baseAmount: number; rate: number; rewardAmount: number; status: string; availableAt?: string }>
}

// Mirrors the server's planChangeExpiry: the period moves by the difference in days (gifted days are kept);
// a lifetime user starts the new period at the purchase date.
function planChangeExpiresAt(user: User, toDays: number) {
  const shift = (value: string | undefined, days: number) => {
    const date = new Date(value || "")
    if (Number.isNaN(date.getTime())) return null
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString()
  }
  const fromDays = Number(user.v2ProductSnapshot?.durationDays) || 0
  if (user.duration === "lifetime" || !fromDays || !user.expiresAt) return shift(user.purchasedAt || user.createdAt, toDays)
  return shift(user.expiresAt, toDays - fromDays)
}

function formatPoolExpiryDifference(days?: number | null) {
  if (days === null || days === undefined) return "暂无法判断"
  if (days === 0) return "与用户同日到期"
  return days > 0 ? `池比用户晚到期 ${days} 天` : `池比用户早到期 ${Math.abs(days)} 天`
}

function poolDisplayName(pool?: User["subscription"] | null) {
  const provider = pool?.serviceProvider || pool?.provider
  const identifier = pool?.email || pool?.name
  return provider && identifier ? `${provider} · ${identifier}` : provider || identifier || pool?.url || "未绑定"
}

const userTypeLabels = { regular: "普通账户", family: "亲友账户", business: "企业账户", super: "超级账户" } as const
const xuiMigrationLabels = {
  completed: { label: "已完成", variant: "success" },
  activation_required: { label: "待激活", variant: "warning" },
  failed: { label: "失败", variant: "danger" },
} as const

function userType(user: User): keyof typeof userTypeLabels {
  if (user.isSuperAccount) return "super"
  if (user.isBusiness) return "business"
  if (user.isFamilyFriend) return "family"
  return "regular"
}

function xuiMigrationStatus(user: User) {
  return user.xuiMigrationStatus
    ? xuiMigrationLabels[user.xuiMigrationStatus]
    : user.xuiClientEmail
      ? { label: "无需迁移", variant: "neutral" as const }
      : { label: "未触发", variant: "neutral" as const }
}

function xuiMigrationSource(user: User) {
  if (user.xuiMigrationSource === "linked_existing" || user.xuiManagementMode === "link") return "关联已有客户端"
  if (user.xuiMigrationSource === "created" || user.xuiManagementMode === "import") return "新建客户端"
  return "-"
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

  if (!item) return <EmptyState scene="map" compact={false} title="未找到订阅" description="该订阅不存在或已被删除。" />

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
        toast({ type: "success", title: item.excludeFromAutoSwitch ? "已恢复自动换池切入" : "已禁止自动换池切入" })
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
            <BackButton fallback="/urls" size="sm" />
            {item.sourceType === "url" ? <ActionButton variant="secondary" size="sm" onClick={toggleAutoSwitch} label={item.excludeFromAutoSwitch ? "恢复自动切入" : "禁止自动切入"} pending={togglingAutoSwitch} /> : null}
            <ActionButton size="sm" onClick={refresh} label="刷新" pending={refreshing} />
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="基础信息"><div className="grid gap-4">
            {item.sourceType === "manual" ? <Info label="配置来源" value="手动 Base64" /> : item.sourceType === "yaml" ? <Info label="配置来源" value="手动 YAML" /> : <UrlCell value={item.url} />}
            <div className="grid gap-3">
              <Info label="HTTP" value={item.httpStatus || "-"} />
              <Info label="最后检查" value={formatDateTime(item.lastCheckedAt)} />
              <Info label="到期" value={formatDate(item.metrics?.expireAt)} />
              <Info label="已用流量" value={formatBytes(item.metrics?.usedBytes)} />
              <Info label="剩余流量" value={<TrafficProgress remaining={item.metrics?.remainingBytes} total={item.metrics?.totalBytes} />} />
              <Info label="状态" value={<StatusBadge status={item.status} />} />
            </div>
            {item.lastError && (
              <Alert tone="danger" title={item.lastError} />
            )}
          </div></Card>

        <Card title="实时配置"><ActionButton variant="secondary" size="sm" onClick={refreshCache} label="刷新缓存" pending={refreshingCache} /><div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              {cache?.body ? `缓存时间：${formatDateTime(cache.bodyFetchedAt || cache.fetchedAt)} - ${formatBytes(cache.bodyLength)}` : cache?.fetchedAt ? `最近尝试：${formatDateTime(cache.fetchedAt)}` : "未加载"}
            </p>
            {cache?.error ? <Alert tone="danger" title={`最新配置拉取失败：${cache.error}${cache.body ? ` 当前显示的是 ${formatDateTime(cache.bodyFetchedAt || cache.fetchedAt)} 的缓存配置。` : " 当前没有可显示的缓存配置。"}`} /> : null}
            <pre className="max-h-96 overflow-auto rounded-lg border bg-muted p-3 text-xs">{cache?.body || "(empty)"}</pre>
          </div></Card>

        <Card className="lg:col-span-2" title="绑定用户"><DataTable
              columns={boundUserColumns}
              data={boundUsers}
              searchKey="user"
              searchPlaceholder="搜索绑定用户..."
              emptyTitle="暂无绑定用户"
            /></Card>
      </div>
    </div>
  )
}

export function UserDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { users, subscriptions, bills, reload, runAsync } = useData()
  const summaryUser = users.find(entry => entry.id === id)
  const [loadedUser, setLoadedUser] = React.useState<User | null>(null)
  const user = summaryUser && loadedUser?.id === id
    ? { ...loadedUser, ...summaryUser, userLogs: summaryUser.userLogs?.length ? summaryUser.userLogs : loadedUser.userLogs }
    : summaryUser || (loadedUser?.id === id ? loadedUser : undefined)
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [inviteEmail, setInviteEmail] = React.useState("")
  const [inviteEmailError, setInviteEmailError] = React.useState("")
  const [inviteSending, setInviteSending] = React.useState(false)
  const [referralRate, setReferralRate] = React.useState(10)
  const [recurringReferral, setRecurringReferral] = React.useState(false)
  const [referralSaving, setReferralSaving] = React.useState(false)
  const [nodeSourceOpen, setNodeSourceOpen] = React.useState(false)
  const [nodeSourceValue, setNodeSourceValue] = React.useState("mix")
  const [nodeSourceSaving, setNodeSourceSaving] = React.useState(false)
  const [referralDetails, setReferralDetails] = React.useState<ReferralDetails | null>(null)
  const [referralDetailsError, setReferralDetailsError] = React.useState("")
  const [giftBalanceOpen, setGiftBalanceOpen] = React.useState(false)
  const [giftBalanceAmount, setGiftBalanceAmount] = React.useState("")
  const [giftBalanceNote, setGiftBalanceNote] = React.useState("")
  const [giftBalanceError, setGiftBalanceError] = React.useState("")
  const [giftBalanceSaving, setGiftBalanceSaving] = React.useState(false)
  const [trafficGiftOpen, setTrafficGiftOpen] = React.useState(false)
  const [emailRebindOpen, setEmailRebindOpen] = React.useState(false)
  const [emailRebindValue, setEmailRebindValue] = React.useState("")
  const [emailRebindNote, setEmailRebindNote] = React.useState("")
  const [emailRebindError, setEmailRebindError] = React.useState("")
  const [emailRebindSaving, setEmailRebindSaving] = React.useState(false)
  const [trafficGiftGb, setTrafficGiftGb] = React.useState("")
  const [trafficGiftNote, setTrafficGiftNote] = React.useState("")
  const [trafficGiftError, setTrafficGiftError] = React.useState("")
  const [trafficGiftSaving, setTrafficGiftSaving] = React.useState(false)
  const [manualPaymentOpen, setManualPaymentOpen] = React.useState(false)
  const [manualPaymentOption, setManualPaymentOption] = React.useState("")
  const [manualPaymentQuote, setManualPaymentQuote] = React.useState<ManualPaymentQuote | null>(null)
  const [manualPaymentAmount, setManualPaymentAmount] = React.useState("")
  const [manualPaymentError, setManualPaymentError] = React.useState("")
  const [manualPaymentLoading, setManualPaymentLoading] = React.useState(false)
  const [manualPaymentSaving, setManualPaymentSaving] = React.useState(false)
  const [poolOpen, setPoolOpen] = React.useState(false)
  const [poolId, setPoolId] = React.useState("")
  const [poolSaving, setPoolSaving] = React.useState(false)
  const [allowDisabledPool, setAllowDisabledPool] = React.useState(false)
  const [allowFullPool, setAllowFullPool] = React.useState(false)
  const [giftOpen, setGiftOpen] = React.useState(false)
  const [giftDays, setGiftDays] = React.useState("")
  const [giftPreview, setGiftPreview] = React.useState<GiftPreview | null>(null)
  const [giftError, setGiftError] = React.useState("")
  const [giftPreviewing, setGiftPreviewing] = React.useState(false)
  const [giftSaving, setGiftSaving] = React.useState(false)
  const [accountStatusOpen, setAccountStatusOpen] = React.useState(false)
  const [accountStatusSaving, setAccountStatusSaving] = React.useState(false)
  const [xuiRecoverOpen, setXuiRecoverOpen] = React.useState(false)
  const [xuiRecoverSaving, setXuiRecoverSaving] = React.useState(false)
  const [userTypeOpen, setUserTypeOpen] = React.useState(false)
  const [selectedUserType, setSelectedUserType] = React.useState<keyof typeof userTypeLabels>("regular")
  const [userTypeSaving, setUserTypeSaving] = React.useState(false)
  const [xuiOpen, setXuiOpen] = React.useState(false)
  const [planOpen, setPlanOpen] = React.useState(false)
  const [planConfirmOpen, setPlanConfirmOpen] = React.useState(false)
  const [planOptionId, setPlanOptionId] = React.useState("")
  const [planTrafficTier, setPlanTrafficTier] = React.useState("1")
  const [planNote, setPlanNote] = React.useState("")
  const [planError, setPlanError] = React.useState("")
  const [planSaving, setPlanSaving] = React.useState(false)
  const [planRollbackId, setPlanRollbackId] = React.useState("")
  const [planRollbackSaving, setPlanRollbackSaving] = React.useState(false)
  const [trafficResetOpen, setTrafficResetOpen] = React.useState(false)
  const [trafficResetSaving, setTrafficResetSaving] = React.useState(false)
  const [customInboundOpen, setCustomInboundOpen] = React.useState(false)
  const [customInboundData, setCustomInboundData] = React.useState<XuiCustomInboundManagement | null>(null)
  const [customInboundDraft, setCustomInboundDraft] = React.useState<number[]>([])
  const [customInboundSearch, setCustomInboundSearch] = React.useState("")
  const [customInboundLoading, setCustomInboundLoading] = React.useState(false)
  const [customInboundSaving, setCustomInboundSaving] = React.useState(false)
  const [walletBalance, setWalletBalance] = React.useState<number | null>(null)
  const catalogV2Products = useCatalogV2Products()
  const currentPool = subscriptions.find(item => item.id === user?.subscriptionId)
  const userBills = bills.filter(item => item.userId === user?.id || item.user?.id === user?.id)
  const purchaseCount = userBills.filter(item => !item.reversedAt).length

  const productName = planSnapshotName(user?.v2ProductSnapshot)
  const currentOptionId = planSnapshotOptionId(user?.v2ProductSnapshot)
  const currentUnlimited = user?.v2ProductSnapshot?.trafficBytes === null
  const catalogPurchaseOptions = React.useMemo(() => catalogPurchaseOptionsFor(catalogV2Products || []), [catalogV2Products])
  const catalogPlanOptions = React.useMemo(() => catalogPurchaseOptions.filter(option => option.product.type !== "addon"), [catalogPurchaseOptions])
  const planOptions = catalogPlanOptions
  const selectedPlanConfig = React.useMemo(() => {
    const option = planOptions.find(item => item.value === planOptionId)
    return option ? catalogPlanConfig(option) : null
  }, [planOptionId, planOptions])
  const planPreview = React.useMemo(() => {
    if (!user || !selectedPlanConfig) return null
    const { option, lifetime, unlimited, baseBytes, stepBytes, targetDevices } = selectedPlanConfig
    const trafficTier = lifetime || unlimited ? 1 : Number(planTrafficTier)
    const targetBytes = unlimited ? 0 : baseBytes + (trafficTier - 1) * stepBytes
    const usedBytes = Math.max(0, Number(user.xuiWeightedTraffic?.usedBytes) || 0)
    const targetExpiresAt = lifetime ? null : planChangeExpiresAt(user, option.period?.durationDays || 0)
    const changes = [
      ...(currentOptionId !== planOptionId ? [{ label: "商品规格", before: productName, after: option.label }] : []),
      ...(lifetime && user.duration !== "lifetime" ? [{ label: "到期日", before: formatDate(user.expiresAt), after: "永久有效" }] : []),
      ...(!lifetime && targetExpiresAt && targetExpiresAt !== user.expiresAt ? [{ label: "到期日", before: user.duration === "lifetime" ? "永久有效" : formatDate(user.expiresAt), after: formatDate(targetExpiresAt) }] : []),
      ...((currentUnlimited ? "不限流量" : formatBytes(user.xuiTrafficLimitBytes || 0)) !== (unlimited ? "不限流量" : formatBytes(targetBytes)) ? [{ label: "流量配额", before: currentUnlimited ? "不限流量" : formatBytes(user.xuiTrafficLimitBytes || 0), after: unlimited ? "不限流量" : formatBytes(targetBytes) }] : []),
      ...(Number(user.deviceLimit || 0) !== targetDevices ? [{ label: "在线IP数量", before: `${user.deviceLimit || 0}`, after: `${targetDevices}` }] : []),
    ]
    const impacts = [
      `已用流量 ${formatBytes(usedBytes)} 保留，不会清零`,
      "本次后台调整不生成账单，不退款",
      ...(targetExpiresAt && Date.parse(targetExpiresAt) <= Date.now() ? ["按购买日重算后到期日已过，变更后用户将处于过期状态"] : []),
      "套餐权限、在线IP数量和流量配额会立即同步到 3x-ui",
      ...(targetBytes > 0 && usedBytes >= targetBytes ? ["目标额度不高于已用流量，变更后用户将进入流量耗尽状态"] : []),
    ]
    return { changes, impacts }
  }, [currentOptionId, currentUnlimited, planOptionId, planTrafficTier, productName, selectedPlanConfig, user])
  const latestPlanEvent = user?.userLogs?.find(log => ["plan-changed", "plan-change-rolled-back"].includes(log.reason || ""))
  const customInboundRows = React.useMemo(() => {
    const query = customInboundSearch.trim().toLocaleLowerCase()
    return (customInboundData?.inbounds || [])
      .filter(inbound => !query || `${inbound.name} ${inbound.tag} ${inbound.nodeName} ${inbound.region} ${inbound.protocol}`.toLocaleLowerCase().includes(query))
      .toSorted((left, right) => left.nodeName.localeCompare(right.nodeName) || left.name.localeCompare(right.name))
  }, [customInboundData, customInboundSearch])
  const offlineCustomInbounds = React.useMemo(() => (customInboundData?.inbounds || []).filter(inbound => customInboundDraft.includes(inbound.id) && inbound.probeStatus === "offline"), [customInboundData, customInboundDraft])
  const customInboundChanged = React.useMemo(() => {
    const current = [...(customInboundData?.extraInboundIds || [])].sort((left, right) => left - right)
    const draft = [...customInboundDraft].sort((left, right) => left - right)
    return JSON.stringify(current) !== JSON.stringify(draft)
  }, [customInboundData, customInboundDraft])

  React.useEffect(() => {
    if (!id) return
    let active = true
    void fetchJson<User>(`/api/users/${id}`).then(data => { if (active) setLoadedUser(data) }).catch(() => undefined)
    return () => { active = false }
  }, [id])

  React.useEffect(() => {
    if (!planOpen || !selectedPlanConfig || selectedPlanConfig.lifetime || selectedPlanConfig.unlimited) return
    setPlanTrafficTier(value => String(Math.min(selectedPlanConfig.maxTier, Math.max(1, Number(value) || 1))))
  }, [planOpen, selectedPlanConfig])

  async function refreshUserDetails() {
    if (!id || id.startsWith("account:")) return
    const [detail] = await Promise.all([
      fetchJson<User>(`/api/users/${id}`),
      reload(["users", "subscriptions"])
    ])
    setLoadedUser(detail)
  }

  async function openCustomInbounds() {
    if (!user) return
    setCustomInboundOpen(true)
    setCustomInboundLoading(true)
    setCustomInboundData(null)
    setCustomInboundSearch("")
    try {
      const result = await fetchJson<XuiCustomInboundManagement>(`/api/users/${user.id}/custom-inbounds`)
      setCustomInboundData(result)
      setCustomInboundDraft(result.extraInboundIds)
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "个人定制入站读取失败" })
      setCustomInboundOpen(false)
    } finally {
      setCustomInboundLoading(false)
    }
  }

  function setCustomInboundSelected(inboundId: number, selected: boolean) {
    setCustomInboundDraft(current => selected ? [...new Set([...current, inboundId])] : current.filter(id => id !== inboundId))
  }

  async function saveCustomInbounds() {
    if (!user || !customInboundData) return
    setCustomInboundSaving(true)
    try {
      await putJson(`/api/users/${user.id}/custom-inbounds`, { inboundIds: customInboundDraft })
      await refreshUserDetails()
      setCustomInboundOpen(false)
      toast({ type: "success", title: "个人定制入站已同步" })
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "个人定制入站保存失败" })
    } finally {
      setCustomInboundSaving(false)
    }
  }

  React.useEffect(() => {
    setReferralRate(user?.referralRate ?? 10)
    setRecurringReferral(user?.recurringReferral === true)
  }, [user?.referralRate, user?.recurringReferral])

  React.useEffect(() => {
    if (!user?.accountId) {
      setReferralDetails(null)
      setReferralDetailsError("")
      return
    }
    let active = true
    setReferralDetails(null)
    setReferralDetailsError("")
    void fetchJson<ReferralDetails>(`/api/referrals/accounts/${user.accountId}`)
      .then(data => { if (active) setReferralDetails(data) })
      .catch(error => { if (active) setReferralDetailsError(error instanceof Error ? error.message : "返利明细加载失败") })
    return () => { active = false }
  }, [user?.accountId])

  React.useEffect(() => {
    if (!user?.id || user.registeredOnly) return
    void fetchJson<{ availableBalance?: number }>(`/api/users/${user.id}/wallet`).then(data => setWalletBalance(typeof data.availableBalance === "number" ? data.availableBalance : null)).catch(() => setWalletBalance(null))
  }, [user?.id, user?.registeredOnly])

  if (!user) return <EmptyState scene="map" compact={false} title="未找到用户" description="该用户不存在或已被删除。" />
  const weightedTraffic = user.xuiWeightedTraffic

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
        toast({ type: "success", title: "账户认领邮件已发送" })
      }, "发送认领邮件...")
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "账户认领邮件发送失败" })
    } finally {
      setInviteSending(false)
    }
  }

  function openNodeSourceDialog() {
    setNodeSourceValue(user?.nodeSource || "mix")
    setNodeSourceOpen(true)
  }

  async function saveNodeSource(nodeSource: string) {
    if (!user) return
    if (nodeSource === (user.nodeSource || "mix")) {
      setNodeSourceOpen(false)
      return
    }
    setNodeSourceSaving(true)
    try {
      await runAsync(async () => {
        await putJson(`/api/users/${encodeURIComponent(user.id)}/node-source`, { nodeSource })
        await reload(["users"], { silent: true })
        setNodeSourceOpen(false)
        toast({ type: "success", title: "节点来源已保存", description: "用户下次更新订阅后生效" })
      }, "保存节点来源...")
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "保存失败" })
    } finally {
      setNodeSourceSaving(false)
    }
  }

  async function saveReferralSettings() {
    if (!user.accountId) return
    setReferralSaving(true)
    try {
      await runAsync(async () => {
        await putJson(`/api/referrals/accounts/${user.accountId}`, { referralRate, recurringReferral })
        await reload(["users"], { silent: true })
        toast({ type: "success", title: "返利设置已保存" })
      }, "保存返利设置...")
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "保存失败" })
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
      setWalletBalance(wallet.availableBalance)
      toast({ type: "success", title: `已赠送 ${formatMoney(amount)}，用户可用余额 ${formatMoney(wallet.availableBalance)}` })
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "赠送余额失败" })
    } finally {
      setGiftBalanceSaving(false)
    }
  }

  async function rebindEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = event.currentTarget.elements.namedItem("rebindEmail") as HTMLInputElement
    if (!emailRebindValue.trim() || !input.validity.valid) {
      setEmailRebindError(emailRebindValue.trim() ? "请输入有效的邮箱地址。" : "请输入新邮箱。")
      return
    }
    setEmailRebindSaving(true)
    setEmailRebindError("")
    try {
      const result = await postJson<{ claimMail?: { sent: boolean; error?: string } }>(`/api/users/${user.id}/email`, { email: emailRebindValue, note: emailRebindNote })
      // Registered-only accounts have no detail endpoint; their row comes from the users list.
      await (user.id.startsWith("account:") ? reload(["users"]) : refreshUserDetails())
      setEmailRebindOpen(false)
      const title = `邮箱已换绑为 ${emailRebindValue.trim().toLowerCase()}`
      if (!result?.claimMail) toast({ type: "success", title })
      else if (result.claimMail.sent) toast({ type: "success", title, description: "认领邮件已发送到新邮箱。" })
      else toast({ type: "warning", title, description: `认领邮件发送失败：${result.claimMail.error || "未知错误"}，可稍后重新发送认领邮件。` })
    } catch (error) {
      setEmailRebindError(error instanceof Error ? error.message : "换绑邮箱失败")
    } finally {
      setEmailRebindSaving(false)
    }
  }

  async function giftTraffic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trafficGb = Number(trafficGiftGb)
    if (!Number.isFinite(trafficGb) || trafficGb <= 0 || trafficGb > 102400) {
      setTrafficGiftError("请输入大于 0 GB 且不超过 100 TB 的流量。")
      return
    }
    setTrafficGiftSaving(true)
    setTrafficGiftError("")
    try {
      await postJson(`/api/users/${user.id}/traffic-gift`, { trafficGb, note: trafficGiftNote })
      await refreshUserDetails()
      setTrafficGiftOpen(false)
      setTrafficGiftGb("")
      setTrafficGiftNote("")
      toast({ type: "success", title: `已单向赠送 ${trafficGb} GB 流量` })
    } catch (error) {
      setTrafficGiftError(error instanceof Error ? error.message : "赠送流量失败")
    } finally {
      setTrafficGiftSaving(false)
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
      await refreshUserDetails()
      setPoolOpen(false)
      toast({ type: "success", title: "用户订阅池已更新" })
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "换池失败" })
    } finally {
      setPoolSaving(false)
    }
  }

  function openGiftDialog() {
    setGiftDays("")
    setGiftPreview(null)
    setGiftError("")
    setGiftOpen(true)
  }

  async function previewGift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const days = Number(giftDays)
    if (!Number.isSafeInteger(days) || days <= 0) {
      setGiftError("请输入正确的赠送天数")
      return
    }
    setGiftPreviewing(true)
    setGiftError("")
    try {
      setGiftPreview(await postJson<GiftPreview>(`/api/users/${user.id}/gift`, { days, preview: true }))
    } catch (error) {
      setGiftError(error instanceof Error ? error.message : "生成赠送预览失败")
    } finally {
      setGiftPreviewing(false)
    }
  }

  async function submitGift() {
    if (!giftPreview) return
    setGiftSaving(true)
    try {
      await postJson(`/api/users/${user.id}/gift`, { days: giftPreview.days })
      await refreshUserDetails()
      setGiftOpen(false)
      toast({ type: "success", title: "赠送时长已生效" })
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
      toast({ type: "success", title: disabling ? "账户已停用" : "账户已恢复" })
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "账户状态更新失败" })
    } finally {
      setAccountStatusSaving(false)
    }
  }

  function openUserTypeDialog() {
    setSelectedUserType(userType(user))
    setUserTypeOpen(true)
  }

  async function saveUserType() {
    setUserTypeSaving(true)
    try {
      await postJson(`/api/users/${user.id}/type`, { type: selectedUserType })
      await refreshUserDetails()
      setUserTypeOpen(false)
      toast({ type: "success", title: "用户类型已更新" })
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "用户类型更新失败" })
    } finally {
      setUserTypeSaving(false)
    }
  }

  function openPlanDialog() {
    const optionId = planOptions.find(option => option.value === currentOptionId)?.value
      || planOptions[0]?.value
      || ""
    setPlanOptionId(optionId)
    setPlanTrafficTier(String((user.v2ProductSnapshot?.trafficSteps || 0) + 1))
    setPlanNote("")
    setPlanError("")
    setPlanOpen(true)
  }

  function previewPlanChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!planOptionId) {
      setPlanError("请选择目标商品规格")
      return
    }
    if (!planNote.trim()) {
      setPlanError("请填写套餐变更原因")
      return
    }
    setPlanConfirmOpen(true)
  }

  async function changePlan() {
    setPlanSaving(true)
    setPlanError("")
    try {
      await postJson(`/api/users/${user.id}/plan`, { optionId: planOptionId, trafficTier: Number(planTrafficTier), note: planNote })
      await refreshUserDetails()
      setPlanConfirmOpen(false)
      setPlanOpen(false)
      toast({ type: "success", title: "套餐已更改并记录" })
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "套餐更改失败")
    } finally {
      setPlanSaving(false)
    }
  }

  async function rollbackPlanChange() {
    setPlanRollbackSaving(true)
    try {
      await postJson(`/api/users/${user.id}/plan-rollback`, { changeId: planRollbackId })
      await refreshUserDetails()
      setPlanRollbackId("")
      toast({ type: "success", title: "已撤销最近一次套餐变更" })
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "撤销套餐变更失败" })
    } finally {
      setPlanRollbackSaving(false)
    }
  }

  async function resetTraffic() {
    setTrafficResetSaving(true)
    try {
      await postJson(`/api/users/${user.id}/traffic-reset`, {})
      await refreshUserDetails()
      setTrafficResetOpen(false)
      toast({ type: "success", title: "用户流量已重置" })
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "流量重置失败" })
    } finally {
      setTrafficResetSaving(false)
    }
  }

  async function recoverXuiClient() {
    setXuiRecoverSaving(true)
    try {
      await postJson(`/api/users/${user.id}/xui-sync`, {})
      await refreshUserDetails()
      setXuiRecoverOpen(false)
      toast({ type: "success", title: "已按V2套餐同步到3x-ui" })
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "3x-ui 同步失败" })
    } finally {
      setXuiRecoverSaving(false)
    }
  }

  async function loadManualPaymentQuote(optionId: string) {
    setManualPaymentLoading(true)
    setManualPaymentError("")
    setManualPaymentQuote(null)
    setManualPaymentAmount("")
    try {
      const quote = await postJson<ManualPaymentQuote>("/api/admin/manual-payments/quote", {
        accountId: user.accountId,
        optionId,
      })
      setManualPaymentQuote(quote)
      setManualPaymentAmount(quote.originalAmount.toFixed(2))
    } catch (error) {
      setManualPaymentError(error instanceof Error ? error.message : "获取人工收款报价失败")
    } finally {
      setManualPaymentLoading(false)
    }
  }

  function openManualPaymentDialog() {
    const optionId = catalogPurchaseOptions.find(option => option.value === user.currentOptionId)?.value || catalogPurchaseOptions[0]?.value || ""
    setManualPaymentOption(optionId)
    setManualPaymentOpen(true)
    if (optionId) void loadManualPaymentQuote(optionId)
  }

  async function submitManualPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!manualPaymentQuote) return
    const amount = Number(manualPaymentAmount)
    if (!/^\d+(\.\d{1,2})?$/.test(manualPaymentAmount.trim()) || amount <= 0 || amount > 10000) {
      setManualPaymentError("请输入 0.01 至 10,000.00 元，最多两位小数。")
      return
    }
    setManualPaymentSaving(true)
    setManualPaymentError("")
    try {
      const order = await postJson<{ userId?: string }>("/api/admin/manual-payments", {
        accountId: user.accountId,
        optionId: manualPaymentQuote.optionId,
        amount,
      })
      setManualPaymentOpen(false)
      await reload(["users", "subscriptions", "bills"])
      toast({ type: "success", title: "人工收款已完成，套餐已生效" })
      if (user.registeredOnly && order.userId) navigate(`/users/detail/${order.userId}`)
      else await refreshUserDetails()
    } catch (error) {
      setManualPaymentError(error instanceof Error ? error.message : "人工收款失败")
    } finally {
      setManualPaymentSaving(false)
    }
  }

  const migrationStatus = xuiMigrationStatus(user)

  return (
    <div className="grid min-w-0 w-full gap-4 px-4 lg:px-6">
      <Dialog open={manualPaymentOpen} onOpenChange={setManualPaymentOpen}>
        <DialogContent title="人工收款"><form className="grid gap-4" onSubmit={submitManualPayment}>
            <FieldGroup>
              <Select label="V2 商品规格" value={manualPaymentOption} onValueChange={value => { setManualPaymentOption(value); void loadManualPaymentQuote(value) }} disabled={manualPaymentLoading || manualPaymentSaving || !catalogPurchaseOptions.length} id="manual-payment-plan" className="w-full" placeholder="暂无可用 V2 商品" options={[...catalogPurchaseOptions.map(item => ({ value: item.value, label: item.label }))]} />
            </FieldGroup>
            {manualPaymentLoading ? <ArcCard title="正在计算报价" description="请稍候" headerAction={<><Loader2 className="animate-spin" /></>} /> : null}
            {manualPaymentQuote ? <><ArcCard title={manualPaymentQuote.optionLabel} description="仅显示套餐原价，不统计税费等" headerAction={<><span className="font-semibold">{formatMoney(manualPaymentQuote.originalAmount)}</span></>} /><Input label="收款金额" id="manual-payment-amount" inputMode="decimal" value={manualPaymentAmount} onChange={event => { setManualPaymentAmount(event.target.value); setManualPaymentError("") }} aria-invalid={Boolean(manualPaymentError)} required /></> : null}
            {["replace", "extend"].includes(manualPaymentQuote?.purchaseAction || "") ? <Alert tone="warning" title={manualPaymentQuote?.purchaseAction === "replace" ? "确认后将立即替换当前套餐。" : "确认后将在当前到期日基础上续期。"} /> : null}
            {manualPaymentError ? <Alert tone="danger" title="人工收款失败">{manualPaymentError}</Alert> : null}
            <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary" disabled={manualPaymentSaving}>取消</Button></DialogClose><ActionButton type="submit" disabled={!manualPaymentQuote || manualPaymentLoading || manualPaymentSaving} label={`确认收款 ${manualPaymentAmount && Number.isFinite(Number(manualPaymentAmount)) ? formatMoney(Number(manualPaymentAmount)) : ""}`} pendingLabel="处理中..." pending={manualPaymentSaving} /></div>
          </form></DialogContent>
      </Dialog>
      <Dialog open={giftBalanceOpen} onOpenChange={setGiftBalanceOpen}>
        <DialogContent title="赠送余额" description="赠送金额永久有效，购买套餐时优先于返利和充值余额使用，不计入 VIP。"><form className="grid gap-4" onSubmit={giftBalance}>
            <Input label="赠送金额" error={(giftBalanceError) || undefined} id="gift-balance-amount" inputMode="decimal" placeholder="0.00" value={giftBalanceAmount} onChange={event => { setGiftBalanceAmount(event.target.value); setGiftBalanceError("") }} aria-invalid={Boolean(giftBalanceError)} autoFocus required />
            <Input label="备注" id="gift-balance-note" maxLength={100} placeholder="可选" value={giftBalanceNote} onChange={event => setGiftBalanceNote(event.target.value)} />
            <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary" disabled={giftBalanceSaving}>取消</Button></DialogClose><ActionButton type="submit" label="确认赠送" pendingLabel="赠送中..." pending={giftBalanceSaving} /></div>
          </form></DialogContent>
      </Dialog>
      <Dialog open={emailRebindOpen} onOpenChange={setEmailRebindOpen}>
        <DialogContent title="换绑邮箱" description={`当前邮箱：${user.email || "-"}。${["active", "disabled"].includes(user.accountStatus || "") ? "换绑后用户用新邮箱和原密码登录" : "换绑后将向新邮箱发送认领邮件"}，已发出的重置密码和认领链接失效；3x-ui 客户端保持不变。`}><form className="grid gap-4" onSubmit={rebindEmail} noValidate>
            <Input label="新邮箱" error={emailRebindError || undefined} id="rebind-email" name="rebindEmail" type="email" value={emailRebindValue} onChange={event => { setEmailRebindValue(event.target.value); setEmailRebindError("") }} aria-invalid={Boolean(emailRebindError)} autoFocus required />
            <Input label="备注" id="rebind-email-note" maxLength={200} placeholder="可选" value={emailRebindNote} onChange={event => setEmailRebindNote(event.target.value)} />
            <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary" disabled={emailRebindSaving}>取消</Button></DialogClose><ActionButton type="submit" label="确认换绑邮箱" pendingLabel="换绑中..." pending={emailRebindSaving} /></div>
          </form></DialogContent>
      </Dialog>
      <Dialog open={trafficGiftOpen} onOpenChange={setTrafficGiftOpen}>
        <DialogContent title="单向赠送流量" description="只会增加用户额度，不能覆盖或扣减。最终额度始终由本地套餐、已购流量包和赠送记录计算，不读取 3x-ui 额度。"><form className="grid gap-4" onSubmit={giftTraffic}>
            <Input label="赠送流量（GB）" error={(trafficGiftError) || undefined} id="traffic-gift-gb" type="number" min="0.01" max="102400" step="0.01" value={trafficGiftGb} onChange={event => { setTrafficGiftGb(event.target.value); setTrafficGiftError("") }} aria-invalid={Boolean(trafficGiftError)} autoFocus required />
            <Input label="备注" id="traffic-gift-note" maxLength={200} placeholder="可选" value={trafficGiftNote} onChange={event => setTrafficGiftNote(event.target.value)} />
            <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary" disabled={trafficGiftSaving}>取消</Button></DialogClose><ActionButton type="submit" label="确认单向赠送" pendingLabel="赠送中..." pending={trafficGiftSaving} /></div>
          </form></DialogContent>
      </Dialog>
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent title="发送账户认领邮件" description="用户将通过该邮箱设置密码并认领订阅账户。"><form className="grid gap-4" onSubmit={sendAccountInvite} noValidate>
            <Input label="收件邮箱" error={(inviteEmailError) || undefined} id="invite-email" name="inviteEmail" type="email" value={inviteEmail} onChange={event => { setInviteEmail(event.target.value); setInviteEmailError("") }} aria-invalid={Boolean(inviteEmailError)} autoFocus required />
            <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary" disabled={inviteSending}>取消</Button></DialogClose><ActionButton type="submit" label="发送邮件" pendingLabel="发送中..." pending={inviteSending} /></div>
          </form></DialogContent>
      </Dialog>
      <Dialog open={poolOpen} onOpenChange={setPoolOpen}>
        <DialogContent title="手动换池" description={`当前订阅池：${poolDisplayName(currentPool)}`} size="lg"><form className="grid gap-4" onSubmit={changePool} noValidate>
            <SubscriptionPoolSelect id="detail-manual-pool" label="目标订阅池" subscriptions={subscriptions} value={poolId} onValueChange={setPoolId} allowDisabled={allowDisabledPool} onAllowDisabledChange={setAllowDisabledPool} allowFull={allowFullPool} onAllowFullChange={setAllowFullPool} group={user.isSuperAccount ? undefined : user.v2ProductSnapshot?.lineGroupId || undefined} />
            <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary" disabled={poolSaving}>取消</Button></DialogClose><ActionButton type="submit" disabled={poolSaving || !poolId || poolId === user.subscriptionId} label="确认换池" pendingLabel="换池中..." pending={poolSaving} /></div>
          </form></DialogContent>
      </Dialog>
      <Dialog open={giftOpen} onOpenChange={setGiftOpen}>
        <DialogContent title="赠送时长" description={`${user.userId || user.email || "用户"} · 赠送天数叠加到当前生效套餐的到期日`}>{!hasActiveRecurringPlan(user) ? <div className="grid gap-4">
            <Alert tone="warning" title="无法赠送时长">用户当前没有生效中的周期性套餐{user.v2ProductSnapshot ? `（当前：${productName}，${user.duration === "lifetime" || user.v2ProductSnapshot.productType === "lifetime_plan" ? "不限时套餐" : `已于 ${formatDate(user.expiresAt)} 到期`}）` : ""}，请先通过购买或更改套餐开通周期性套餐。</Alert>
            <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary">关闭</Button></DialogClose></div>
          </div> : giftPreview ? <div className="grid gap-4">
            <ArcCard title="变更预览"><SimpleTable caption="赠送时长变更" columns={["项目", "当前", "赠送后"]} rows={[
              { label: "套餐", before: planSnapshotName(giftPreview.plan), after: planSnapshotName(giftPreview.plan) },
              { label: "到期日", before: formatDate(giftPreview.beforeExpiresAt), after: formatDate(giftPreview.afterExpiresAt) },
              { label: "累计赠送", before: `${giftPreview.giftedDaysBefore} 天`, after: `${giftPreview.giftedDaysAfter} 天` },
              ...(giftPreview.queuedPlan ? [
                { label: "续费套餐生效", before: formatDate(giftPreview.queuedPlan.before.startsAt), after: formatDate(giftPreview.queuedPlan.after.startsAt) },
                { label: "续费套餐到期", before: formatDate(giftPreview.queuedPlan.before.expiresAt), after: formatDate(giftPreview.queuedPlan.after.expiresAt) },
              ] : []),
            ]} rowKey={change => change.label} cells={change => [<span className="font-medium">{change.label}</span>, <span className="whitespace-normal tabular-nums text-muted-foreground">{change.before}</span>, <span className="whitespace-normal tabular-nums">{change.after}</span>]} /></ArcCard>
            <Alert tone="warning" title="执行影响">赠送 {giftPreview.days} 天，套餐规格、流量额度和线路绑定保持不变{user.lineType === "self_hosted" ? "；新的到期日会同步到 3x-ui" : ""}。</Alert>
            {giftError ? <Alert tone="danger" title={giftError} /> : null}
            <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={giftSaving} onClick={() => { setGiftPreview(null); setGiftError("") }}>返回修改</Button><ActionButton type="button" onClick={() => void submitGift()} label="确认赠送" pendingLabel="赠送中..." pending={giftSaving} /></div>
          </div> : <form className="grid gap-4" onSubmit={previewGift} noValidate>
            <FieldGroup>
              <div className="grid gap-3 rounded-xl bg-muted px-3 py-2 sm:grid-cols-2"><Info label="当前套餐" value={productName} /><Info label="当前到期" value={formatDate(user.expiresAt)} /></div>
              <Input label="赠送天数" error={(giftError) || undefined} id="detail-gift-days" type="number" min="1" step="1" value={giftDays} onChange={event => { setGiftDays(event.target.value); setGiftError("") }} autoFocus />
              <Field><FieldLabel>快捷选择</FieldLabel><div className="flex flex-wrap gap-2">{[7, 15, 30].map(days => <Button key={days} type="button" variant={giftDays === String(days) ? "primary" : "secondary"} size="sm" onClick={() => { setGiftDays(String(days)); setGiftError("") }}>{days} 天</Button>)}</div></Field>
            </FieldGroup>
            <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary" disabled={giftPreviewing}>取消</Button></DialogClose><ActionButton type="submit" label="下一步" pendingLabel="生成预览..." pending={giftPreviewing} /></div>
          </form>}</DialogContent>
      </Dialog>
      <Dialog open={userTypeOpen} onOpenChange={setUserTypeOpen}>
        <ArcDialogContent title="设置用户类型" description="超级账户可跨越 BASIC、PRO、ULTRA 套餐等级选择订阅池。"><Select label="用户类型" value={selectedUserType} onValueChange={value => setSelectedUserType(value as keyof typeof userTypeLabels)} disabled={userTypeSaving} id="user-type" className="w-full" options={[...Object.entries(userTypeLabels).map(([value, label]) => ({ value: value, label: label }))]} /><div className="mt-4 flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary" disabled={userTypeSaving}>取消</Button></DialogClose><ActionButton type="button" onClick={() => void saveUserType()} label="保存类型" pendingLabel="保存中..." pending={userTypeSaving} /></div></ArcDialogContent>
      </Dialog>
      <Dialog open={customInboundOpen} onOpenChange={setCustomInboundOpen}>
        <ArcDialogContent title="管理个人定制入站" description="个人定制授权不随套餐变更或到期清除。用户到期时仍只显示占位节点，重新购买套餐后自动恢复授权。" size="xl" className="max-h-[calc(100dvh-2rem)] overflow-y-auto">{customInboundLoading ? <ArcCard title="正在读取可用入站" description="请稍候…" headerAction={<><Loader2 className="animate-spin" /></>} /> : customInboundData ? <>
            {customInboundData.staleExtraInboundIds.length ? <Alert tone="warning" title="存在已删除的授权入站"><span>这些授权当前不会提供给用户，可以取消以清理记录。</span>{customInboundData.staleExtraInboundIds.map(inboundId => <Label key={inboundId} className="flex items-center gap-2"><Checkbox checked={customInboundDraft.includes(inboundId)} onCheckedChange={checked => setCustomInboundSelected(inboundId, checked === true)} disabled={customInboundSaving} />入站 #{inboundId}（已删除）</Label>)}</Alert> : null}
            {offlineCustomInbounds.length ? <Alert tone="warning" title="所选入站当前离线">{offlineCustomInbounds.map(inbound => inbound.name).join("、")} 当前无法连接，授权仍会保存并同步。</Alert> : null}
            <SearchField label="筛选入站" id="custom-inbound-search" value={customInboundSearch} onValueChange={setCustomInboundSearch} placeholder="搜索名称、节点、地区或协议" />
            <SimpleTable<XuiCustomInboundManagement["inbounds"][number]> caption="选择列表" columns={["选择", "入站", "状态", "授权来源", "定制用户"]} rows={customInboundRows} rowKey={(inbound) => {
const inherited = customInboundData.inheritedInboundIds.includes(inbound.id)
const selected = customInboundDraft.includes(inbound.id)
const cannotAdd = !inbound.enabled && !selected
return inbound.key }} cells={(inbound) => {
const inherited = customInboundData.inheritedInboundIds.includes(inbound.id)
const selected = customInboundDraft.includes(inbound.id)
const cannotAdd = !inbound.enabled && !selected
return [<Checkbox checked={selected ? true : inherited ? "indeterminate" : false} onCheckedChange={checked => setCustomInboundSelected(inbound.id, checked === true)} disabled={inherited && !selected || cannotAdd || customInboundSaving} aria-label={`${selected ? "取消个人定制" : inherited ? "套餐已包含" : "选择"} ${inbound.name}`} />, <><span className="font-medium">{inbound.name}</span><p className="text-xs text-muted-foreground">{inbound.nodeName}{inbound.region ? ` · ${inbound.region}` : ""} · {inbound.protocol.toUpperCase()} / {inbound.port ?? "-"}</p></>, <span className="flex flex-wrap gap-1"><Badge tone={inbound.enabled ? "success" : "neutral"}>{inbound.enabled ? "启用" : "停用"}</Badge><Badge tone={inbound.probeStatus === "online" ? "success" : inbound.probeStatus === "offline" ? "danger" : "neutral"}>{inbound.probeStatus === "online" ? "正常" : inbound.probeStatus === "offline" ? "离线" : inbound.probeStatus === "disabled" ? "未检测" : "未知"}</Badge></span>, <span className="flex flex-wrap gap-1">{inherited ? <Badge>套餐包含</Badge> : null}{selected ? <Badge>个人定制</Badge> : null}{!inherited && !selected ? <span className="text-muted-foreground">未授权</span> : null}</span>, <span className="text-right tabular-nums">{inbound.customAssignmentCount}</span>] }} emptyMessage="没有符合条件的入站" />
          </> : null}<div className="mt-4 flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary" disabled={customInboundSaving}>取消</Button></DialogClose><ActionButton type="button" onClick={() => void saveCustomInbounds()} disabled={customInboundLoading || customInboundSaving || !customInboundData || !customInboundChanged} label="保存并同步" pendingLabel="同步中..." pending={customInboundSaving} /></div></ArcDialogContent>
      </Dialog>
      <Dialog open={planOpen} onOpenChange={open => { setPlanOpen(open); if (!open) setPlanConfirmOpen(false) }}>
        <DialogContent title="更改套餐" description="可选择商品库中的套餐规格，包括未上架商品；附加商品和旧版规格不可选择。操作原因会写入用户记录。" size="lg" className="max-h-[calc(100dvh-2rem)] overflow-y-auto"><form className="grid gap-4" onSubmit={previewPlanChange}>
            <FieldGroup>
              <CatalogPlanFields idPrefix="plan" label="目标商品规格" placeholder="没有可用商品规格" options={planOptions} value={planOptionId} onValueChange={setPlanOptionId} trafficTier={planTrafficTier} onTrafficTierChange={setPlanTrafficTier} disabled={planSaving} description="切换周期时按购买日重新计算到期日，赠送时长保留；切换至不限时规格后，到期日改为永久有效。" tierDescription="后台调整不计算价格，所选流量配额会直接同步到 3x-ui。" />
              <Input label="变更原因" error={(planError) || undefined} id="plan-note" maxLength={200} value={planNote} onChange={event => { setPlanNote(event.target.value); setPlanError("") }} placeholder="例如：客服补偿、套餐升级" aria-invalid={Boolean(planError)} autoFocus required />
            </FieldGroup>
            {planPreview?.changes.length ? <ArcCard title="变更预览"><SimpleTable caption="项目列表" columns={["项目", "当前", "变更后"]} rows={planPreview.changes} rowKey={(change) => change.label} cells={(change) => [<span className="font-medium">{change.label}</span>, <span className="whitespace-normal text-muted-foreground">{change.before}</span>, <span className="whitespace-normal">{change.after}</span>]} /></ArcCard> : null}
            {planPreview ? <Alert tone="warning" title="执行影响">{planPreview.impacts.join("；")}。</Alert> : null}
            <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary" disabled={planSaving}>取消</Button></DialogClose><Button type="submit" disabled={planSaving || !planPreview?.changes.length}><ArrowRightLeft />查看变更确认</Button></div>
          </form></DialogContent>
      </Dialog>
      <ArcDialog open={planConfirmOpen} onOpenChange={setPlanConfirmOpen}>
        <ArcDialogContent title="确认执行套餐变更？" description="更改将立即同步到 3x-ui，当前流量包会失效。操作完成后可从用户日志撤销最近一次变更。"><div className="flex flex-wrap justify-end gap-2"><ArcDialogClose asChild><Button variant="secondary" disabled={planSaving}>返回修改</Button></ArcDialogClose><ArcDialogClose asChild><Button onClick={event => { event.preventDefault(); void changePlan() }} disabled={planSaving}>{planSaving ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}{planSaving ? "同步中..." : "确认更改套餐"}</Button></ArcDialogClose></div></ArcDialogContent>
      </ArcDialog>
      <ArcDialog open={Boolean(planRollbackId)} onOpenChange={open => { if (!open) setPlanRollbackId("") }}>
        <ArcDialogContent title="撤销最近一次套餐变更？" description="将恢复变更前的套餐周期、到期日、商品绑定和流量包权益，并重新同步 3x-ui。撤销操作本身也会写入用户日志。"><div className="flex flex-wrap justify-end gap-2"><ArcDialogClose asChild><Button variant="secondary" disabled={planRollbackSaving}>取消</Button></ArcDialogClose><ArcDialogClose asChild><Button onClick={event => { event.preventDefault(); void rollbackPlanChange() }} disabled={planRollbackSaving}>{planRollbackSaving ? <Loader2 className="animate-spin" /> : <RotateCcw />}{planRollbackSaving ? "恢复中..." : "确认撤销变更"}</Button></ArcDialogClose></div></ArcDialogContent>
      </ArcDialog>
      <XuiClientDialog user={user} open={xuiOpen} onOpenChange={setXuiOpen} onComplete={refreshUserDetails} />
      <ArcDialog open={trafficResetOpen} onOpenChange={setTrafficResetOpen}>
        <ArcDialogContent title="确认重置用户流量？" description={`将清零 ${user.userId || user.email || "该用户"} 当前已使用流量，套餐额度、流量包和下次自动重置日期保持不变。操作完成后无法恢复。`}><div className="flex flex-wrap justify-end gap-2"><ArcDialogClose asChild><Button variant="secondary" disabled={trafficResetSaving}>取消</Button></ArcDialogClose><ArcDialogClose asChild><Button onClick={event => { event.preventDefault(); void resetTraffic() }} disabled={trafficResetSaving}>{trafficResetSaving ? <Loader2 className="animate-spin" /> : <RotateCcw />}{trafficResetSaving ? "重置中..." : "确认重置流量"}</Button></ArcDialogClose></div></ArcDialogContent>
      </ArcDialog>
      <ArcDialog open={nodeSourceOpen} onOpenChange={open => { if (!nodeSourceSaving) setNodeSourceOpen(open) }}>
        <ArcDialogContent title="设置节点来源" description="决定订阅里下发哪套架构的节点。只影响订阅内容，用户在 3x-ui 和 node-hub 上的授权不变，两边的流量都会计费；用户更新订阅后生效。"><Select label="节点来源" value={nodeSourceValue} onValueChange={setNodeSourceValue} disabled={nodeSourceSaving} id="node-source" className="w-full" options={NODE_SOURCE_OPTIONS} /><div className="mt-4 flex flex-wrap justify-end gap-2"><ArcDialogClose asChild><Button type="button" variant="secondary" disabled={nodeSourceSaving}>取消</Button></ArcDialogClose><ActionButton type="button" onClick={() => void saveNodeSource(nodeSourceValue)} label="保存节点来源" pendingLabel="保存中..." pending={nodeSourceSaving} /></div></ArcDialogContent>
      </ArcDialog>
      <ArcDialog open={accountStatusOpen} onOpenChange={setAccountStatusOpen}>
        <ArcDialogContent title={user.accountStatus === "active" ? "确认停用账户？" : "确认恢复账户？"} description={user.accountStatus === "active" ? "停用后用户将无法登录，当前登录状态也会失效；订阅链接将返回停用提示，3x-ui 客户端也会停用。" : "恢复后用户可以重新登录账户；有效期内的自研线路 3x-ui 客户端也会恢复，原有订阅和余额保持不变。"}><div className="flex flex-wrap justify-end gap-2"><ArcDialogClose asChild><Button variant="secondary" disabled={accountStatusSaving}>取消</Button></ArcDialogClose><ArcDialogClose asChild><Button variant="primary" onClick={event => { event.preventDefault(); void toggleAccountStatus() }} disabled={accountStatusSaving}>{accountStatusSaving ? <Loader2 className="animate-spin" /> : <Power />}{accountStatusSaving ? "处理中..." : user.accountStatus === "active" ? "确认停用" : "确认恢复"}</Button></ArcDialogClose></div></ArcDialogContent>
      </ArcDialog>
      <ArcDialog open={xuiRecoverOpen} onOpenChange={setXuiRecoverOpen}>
        <ArcDialogContent title="同步V2套餐到3x-ui？" description="将按当前V2套餐的额度、到期时间、在线IP数量和入站组更新或补建3x-ui客户端，不清空已有流量。"><div className="flex flex-wrap justify-end gap-2"><ArcDialogClose asChild><Button variant="secondary" disabled={xuiRecoverSaving}>取消</Button></ArcDialogClose><ArcDialogClose asChild><Button onClick={event => { event.preventDefault(); void recoverXuiClient() }} disabled={xuiRecoverSaving}>{xuiRecoverSaving ? <Loader2 className="animate-spin" /> : <RefreshCw />}{xuiRecoverSaving ? "同步中..." : "立即同步"}</Button></ArcDialogClose></div></ArcDialogContent>
      </ArcDialog>
      {user.accountStatus === "disabled" ? <Alert tone="warning" title="该用户已停用" /> : null}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="self-start xl:sticky xl:top-4" title={<>{user.wechatName || user.userId || user.email || "用户"}
              <AccountVerificationIcon type={userType(user)} /></>} description={<UserStatusBadge user={user} />} headerAction={<BackButton fallback={`/users${location.search}`} iconOnly size="icon-sm" />}><div className="hidden justify-center xl:flex"><Avatar name={user.wechatName || user.userId || user.email || "用户"} size="xl" /></div><div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-0.5 rounded-xl bg-muted px-3 py-2"><p className="text-xs text-muted-foreground">套餐购买次数</p><p className="text-lg font-semibold tabular-nums">{purchaseCount}</p></div>
              <div className="grid gap-0.5 rounded-xl bg-muted px-3 py-2"><p className="text-xs text-muted-foreground">总消费金额</p><p className="text-lg font-semibold tabular-nums">{user.cashSpent === undefined ? "-" : formatMoney(user.cashSpent)}</p></div>
            </div>
            <Separator />
            <div className="grid gap-3 [&>div]:grid-cols-[5rem_minmax(0,1fr)] [&>div]:items-start [&>div]:gap-3 [&>div>div]:text-right [&>div>div]:text-sm [&>div>div]:font-normal [&>div>p]:text-sm">
              <Info label="ID" value={user.customerID || "-"} />
              <Info label="邮箱" value={user.email || "-"} />
              <Info label="账户" value={user.accountStatus === "active" ? "已认领" : user.accountStatus === "disabled" ? "已停用" : user.accountStatus === "invited" ? "等待认领" : "未认领"} />
              <Info label="用户类型" value={userTypeLabels[userType(user)]} />
              <Info label="钱包余额" value={walletBalance === null ? "-" : formatMoney(walletBalance)} />
              {user.lineType === "self_hosted" ? <Info label="节点来源" value={NODE_SOURCE_LABELS[user.nodeSource || "mix"]} /> : null}
            </div>
          </div>{user.registeredOnly && !["active", "disabled"].includes(user.accountStatus || "") ? null : <ProfileActions items={[
            ...(user.accountStatus === "active" && user.accountId ? [{ label: "人工收款", icon: <Banknote />, onSelect: openManualPaymentDialog }] : []),
            ...(user.registeredOnly ? [] : [
              { label: "设置用户类型", icon: <UserCog />, onSelect: openUserTypeDialog },
              ...(user.lineType === "self_hosted" ? [] : [{ label: "切换到自研线路", icon: <Network />, onSelect: () => setXuiOpen(true) }]),
              ...(user.lineType === "self_hosted" && user.xuiClientEmail ? [{ label: "管理个人定制入站", icon: <Network />, onSelect: () => void openCustomInbounds() }] : []),
              ...(user.lineType === "self_hosted" ? [{ label: "更改套餐", icon: <ArrowRightLeft />, onSelect: openPlanDialog }] : []),
              ...(user.lineType === "self_hosted" ? [{ label: "设置节点来源", icon: <Network />, onSelect: openNodeSourceDialog }] : []),
              ...(user.lineType === "self_hosted" && user.xuiClientEmail ? [{ label: "重置流量", icon: <RotateCcw />, onSelect: () => setTrafficResetOpen(true) }] : []),
              ...(user.lineType === "self_hosted" ? [
                { label: "单向赠送流量", icon: <Gift />, onSelect: () => { setTrafficGiftError(""); setTrafficGiftOpen(true) } },
                { label: "同步V2套餐到3x-ui", icon: <RefreshCw />, onSelect: () => setXuiRecoverOpen(true), disabled: xuiRecoverSaving },
              ] : [{ label: "换池", icon: <RefreshCw />, onSelect: openPoolDialog }]),
              { label: "赠送时长", icon: <Gift />, onSelect: openGiftDialog },
            ]),
            ...(user.email || user.accountStatus !== "unclaimed" ? [{ label: "换绑邮箱", icon: <AtSign />, onSelect: () => { setEmailRebindValue(""); setEmailRebindNote(""); setEmailRebindError(""); setEmailRebindOpen(true) } }] : []),
            ...(user.accountStatus === "active" ? [
              ...(user.registeredOnly ? [] : [{ label: "赠送余额", icon: <Gift />, onSelect: () => { setGiftBalanceError(""); setGiftBalanceOpen(true) } }]),
              { label: "停用账户", icon: <Power />, onSelect: () => setAccountStatusOpen(true), destructive: true },
            ] : user.accountStatus === "disabled" ? [
              { label: "恢复账户", icon: <Power />, onSelect: () => setAccountStatusOpen(true) },
            ] : [
              { label: user.accountStatus === "invited" ? "重新发送认领邮件" : "发送账户认领邮件", icon: <MailCheck />, onSelect: () => { setInviteEmail([user.email, user.imessage, user.userId].find(value => value?.includes("@")) || ""); setInviteEmailError(""); setInviteOpen(true) } },
            ]),
          ]} />}</Card>

        <Tabs defaultValue="overview" className="@container min-w-0 gap-4">
          <TabsList className="grid w-full grid-cols-2 group-data-[orientation=horizontal]/tabs:h-auto sm:grid-cols-4">
            <TabsTrigger value="overview" className="h-9">基本信息</TabsTrigger>
            <TabsTrigger value="catalog-v2" className="h-9">V2 商品</TabsTrigger>
            <TabsTrigger value="bills" className="h-9">用户日志</TabsTrigger>
            <TabsTrigger value="referral" className="h-9">邀请返利</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className={`grid min-w-0 gap-4 ${user.lineType === "self_hosted" ? "@4xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] @4xl:grid-rows-[auto_auto_auto_1fr] @4xl:items-start" : ""}`}>
            {/* Wide panes: node traffic on the left, plan and status stacked on the right. Narrow panes: one column with the plan first. */}
            <Card className="order-first @4xl:order-none @4xl:col-start-2 @4xl:row-start-1" title="当前套餐" description={user.registeredOnly ? "尚未开通订阅" : productName} headerAction={<UserStatusBadge user={user} />}><div className="grid gap-4 sm:grid-cols-2 @4xl:grid-cols-1">
                <Info label="当前到期" value={formatUserExpiry(user)} />
                <Info label="原套餐到期" value={formatDate(user.planExpiresAt || user.expiresAt)} />
                <Info label="赠送时长" value={`${user.giftedDays || 0} 天`} />
                <Info label="用户 URL" value={<UrlCell value={absoluteUrl(user.relayPath)} />} />
              </div></Card>
            {user.lineType === "self_hosted" ? <Card className="@4xl:col-start-1 @4xl:row-span-4 @4xl:row-start-1" title="倍率流量" description="按节点倍率折算用户流量；节点倍率修改仅影响之后产生的流量" headerAction={<Badge tone={!weightedTraffic ? "neutral" : weightedTraffic.depleted ? "danger" : "success"}>{!weightedTraffic ? "未同步" : weightedTraffic.depleted ? "已耗尽" : "正常"}</Badge>}><div className="grid gap-4">
                {weightedTraffic ? <>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Info label="原始流量" value={formatBytes(weightedTraffic.rawUsedBytes)} />
                    <Info label="折算流量" value={formatBytes(weightedTraffic.usedBytes)} />
                    <Info label="套餐额度" value={weightedTraffic.totalBytes ? `${formatBytes(weightedTraffic.remainingBytes)} / ${formatBytes(weightedTraffic.totalBytes)}` : "不限"} />
                  </div>
                  {weightedTraffic.totalBytes ? <TrafficProgress remaining={weightedTraffic.remainingBytes} total={weightedTraffic.totalBytes} /> : null}
                  <Separator />
                  {weightedTraffic.nodes.length ? <NodeTrafficList nodes={weightedTraffic.nodes} /> : <EmptyState title="暂无节点流量明细" />}
                  <p className="text-xs text-muted-foreground">最后同步：{weightedTraffic.lastSyncedAt ? formatDateTime(weightedTraffic.lastSyncedAt) : "-"}</p>
                </> : <EmptyState title="暂无倍率流量数据" description="完成首次 3x-ui 流量同步后显示节点明细。" />}
              </div></Card> : null}
            {user.poolCompatibility ? (
              <Card className="@4xl:col-start-2" title="推荐适配度" description={poolDisplayName(currentPool)} headerAction={<Badge tone={user.poolCompatibility.status === "high" ? "success" : user.poolCompatibility.status === "usable" ? "neutral" : user.poolCompatibility.status === "incompatible" ? "danger" : "warning"}>
                      {user.poolCompatibility.statusText}
                    </Badge>}><div className="grid gap-4">
                  {user.poolCompatibility.status !== "high" ? (
                    <Alert tone={user.poolCompatibility.status === "incompatible" ? "danger" : user.poolCompatibility.status === "adjust" ? "warning" : "info"} title="具体原因">
                        <ul className="list-disc space-y-1 pl-4">
                          {user.poolCompatibility.reasons.map(reason => <li key={reason}>{reason}</li>)}
                        </ul>
                      </Alert>
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Info label="当前池 URL" value={currentPool?.url ? <UrlCell value={currentPool.url} /> : "-"} />
                    <Info label="供应商评级" value={user.poolCompatibility.rating ? <Badge>{user.poolCompatibility.rating} 级</Badge> : "未评级"} />
                    <Info label="套餐匹配" value={user.isSuperAccount ? "超级账户可跨等级使用" : user.poolCompatibility.groupAllowed ? `${user.v2ProductSnapshot?.lineGroupId?.toUpperCase() || "当前"} 套餐可用` : "不支持当前套餐"} />
                    <Info label="到期匹配" value={formatPoolExpiryDifference(user.poolCompatibility.expiryDiffDays)} />
                    <Info label="容量" value={`${user.poolCompatibility.customerCount ?? 0} / ${user.poolCompatibility.maxUsers ?? 15} 人`} />
                    <Info label="绑定方式" value={user.poolCompatibility.binding?.type === "manual" ? `手动换池${user.poolCompatibility.binding.at ? ` · ${formatDateTime(user.poolCompatibility.binding.at)}` : ""}` : "系统绑定"} />
                  </div>
                  {user.poolCompatibility.recommendedPool ? (
                    <ArcCard title="当前更优选择" description={`${user.poolCompatibility.recommendedPool.label} · ${user.poolCompatibility.recommendedPool.rating || "未评级"} 级 · ${formatPoolExpiryDifference(user.poolCompatibility.recommendedPool.expiryDiffDays)}`} />
                  ) : null}
                </div></Card>
            ) : null}
            <Card className="@4xl:col-start-2" title="3x-ui 信息"><div className="grid gap-4 sm:grid-cols-2">
                <Info label="迁移状态" value={<Badge tone={migrationStatus.variant}>{migrationStatus.label}</Badge>} />
                <Info label="迁移方式" value={xuiMigrationSource(user)} />
                <Info label="客户端" value={user.xuiClientEmail || "-"} />
                <Info label="客户端状态" value={user.xuiClientPresent === false ? "客户端缺失" : user.xuiClientPresent === true ? "正常" : "等待检查"} />
                <Info label="迁移时间" value={user.xuiMigratedAt ? formatDateTime(user.xuiMigratedAt) : "-"} />
                {user.xuiMigrationError ? <Info label="迁移错误" value={user.xuiMigrationError} /> : null}
              </div></Card>
          </TabsContent>
          <TabsContent value="catalog-v2" className="grid min-w-0 gap-4">
            {user.v2ProductSnapshot ? <>
              <Card title="当前 V2 商品" description="用户当前套餐的商品快照，套餐权益和 3x-ui 同步只以它为准。" headerAction={<Badge tone="success">生效中</Badge>}><div className="grid gap-4 sm:grid-cols-2">
                  <Info label="商品名称" value={user.v2ProductSnapshot.name} />
                  <Info label="商品 ID" value={user.v2ProductSnapshot.productId} />
                  <Info label="商品类型" value={user.v2ProductSnapshot.productType === "recurring_plan" ? "周期性套餐" : "不限时套餐"} />
                  <Info label="周期标识" value={user.v2ProductSnapshot.periodId || "不限时"} />
                  <Info label="周期时长" value={user.v2ProductSnapshot.durationDays ? `${user.v2ProductSnapshot.durationDays} 天` : "不限时"} />
                  <Info label="流量额度" value={user.v2ProductSnapshot.trafficBytes === null ? "不限流量" : formatBytes(user.v2ProductSnapshot.trafficBytes)} />
                  <Info label="在线IP数量" value={user.v2ProductSnapshot.deviceLimit === null ? "-" : `${user.v2ProductSnapshot.deviceLimit}`} />
                  <Info label="线路权限组" value={user.v2ProductSnapshot.lineGroupId || "-"} />
                </div></Card>
            </> : <EmptyState title="尚未迁移到 V2 商品" description="完成 V2 商品映射迁移后，此处会显示新的商品绑定与原商品信息。" />}
          </TabsContent>
          <TabsContent value="bills" className="grid min-w-0 gap-4">
            <UserBillsCard records={user.billingRecords} />
            <Card className="gap-0 overflow-hidden py-0" title="用户日志" description={`共 ${user.userLogs?.length || 0} 条`}><SimpleTable caption="时间列表" columns={["时间", "类型", "状态", "内容", "操作"]} rows={user.userLogs} rowKey={(log) => log.id} cells={(log) => [<span className="text-muted-foreground">{formatDateTime(log.at)}</span>, <Badge>{log.reasonText || log.reason || "用户日志"}</Badge>, <Badge tone={["failed", "blocked", "no_usable_pool"].includes(log.status || "") ? "danger" : "neutral"}>{log.statusText || log.status || "已记录"}</Badge>, <span className="whitespace-normal text-muted-foreground">{log.message || [log.fromSubscriptionLabel, log.toSubscriptionLabel].filter(Boolean).join(" → ") || "-"}</span>, <span className="text-right">{latestPlanEvent?.id === log.id && log.reason === "plan-changed" && log.details?.rollbackState ? <Button type="button" variant="secondary" size="sm" onClick={() => setPlanRollbackId(log.id)}><RotateCcw />撤销变更</Button> : null}</span>]} emptyMessage="暂无用户日志" /></Card>
          </TabsContent>
          <TabsContent value="referral" className="grid min-w-0 gap-4">
            <Card title="邀请返利设置"><Separator /><>{user.accountId ? <div className="grid gap-4 sm:grid-cols-2"><Input label="收到返利比例（%）" id="referral-rate" type="number" min="0" max="100" value={referralRate} onChange={event => setReferralRate(Number(event.target.value))} /><div className="self-end"><Checkbox id="recurring-referral" checked={recurringReferral} onCheckedChange={checked => setRecurringReferral(checked === true)} label="享受循环返利" /></div><ActionButton className="sm:w-fit" onClick={() => void saveReferralSettings()} label="保存返利设置" pendingLabel="保存中..." pending={referralSaving} /></div> : <p className="text-sm text-muted-foreground">用户认领账户后可配置邀请返利。</p>}</></Card>
            {referralDetailsError ? <Alert tone="danger" title={referralDetailsError} /> : null}
            <Card className="gap-0 overflow-hidden py-0" title="邀请用户" description={referralDetails ? `共 ${referralDetails.invitedUsers.length} 人` : "正在加载"}><SimpleTable caption="邮箱列表" columns={["邮箱", "状态", "订单数", "消费金额", "注册时间"]} rows={referralDetails?.invitedUsers} rowKey={(item) => item.id} cells={(item) => [<span className="font-medium">{item.email}</span>, <Badge tone={item.status === "active" ? "success" : item.status === "disabled" ? "danger" : "neutral"}>{item.status === "active" ? "正常" : item.status === "disabled" ? "已停用" : item.status === "invited" ? "待认领" : item.status}</Badge>, <>{item.orderCount}</>, <>{formatMoney(item.totalPaid)}</>, <span className="text-muted-foreground">{formatDateTime(item.createdAt)}</span>]} emptyMessage="暂无邀请用户" /></Card>
            <Card className="gap-0 overflow-hidden py-0" title="邀请账单"><SimpleTable caption="订单列表" columns={["订单", "邀请用户", "套餐", "金额", "状态", "时间"]} rows={referralDetails?.orders} rowKey={(item) => item.id} cells={(item) => [<Button asChild variant="link" size="sm" className="h-auto p-0"><Link to={`/orders/${item.id}`}>{item.number}</Link></Button>, <>{item.inviteeEmail}</>, <>{item.planName}</>, <>{formatMoney(item.amount)}</>, <Badge tone={item.status === "paid" ? "success" : item.status === "reversed" ? "danger" : "neutral"}>{item.status === "paid" ? "已支付" : item.status === "pending" ? "待支付" : item.status === "reversed" ? "已撤销" : item.status}</Badge>, <span className="text-muted-foreground">{formatDateTime(item.createdAt)}</span>]} emptyMessage="暂无邀请账单" /></Card>
            <Card className="gap-0 overflow-hidden py-0" title="返利明细"><SimpleTable caption="来源订单列表" columns={["来源订单", "邀请用户", "返利基数", "比例", "返利金额", "状态", "到账时间"]} rows={referralDetails?.rewards} rowKey={(item) => item.id} cells={(item) => [<Button asChild variant="link" size="sm" className="h-auto p-0"><Link to={`/orders/${item.sourceOrderId}`}>{item.orderNumber}</Link></Button>, <>{item.inviteeEmail}</>, <>{formatMoney(item.baseAmount)}</>, <>{item.rate}%</>, <span className="font-medium">{formatMoney(item.rewardAmount)}</span>, <Badge tone={item.status === "available" ? "success" : item.status === "pending" ? "neutral" : "danger"}>{item.status === "available" ? "已到账" : item.status === "pending" ? "审核中" : item.status === "rejected" ? "已拒绝" : item.status}</Badge>, <span className="text-muted-foreground">{formatDateTime(item.availableAt)}</span>]} emptyMessage="暂无返利记录" /></Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

const NODE_SOURCE_OPTIONS = [
  { value: "mix", label: "mix（3x-ui + node-hub）" },
  { value: "3xui", label: "3xui（仅 3x-ui 面板节点）" },
  { value: "nodehub", label: "nodehub（仅 node-hub 节点）" }
]
const NODE_SOURCE_LABELS: Record<string, string> = { mix: "mix", "3xui": "3xui", nodehub: "nodehub" }

type ProfileAction = { label: string; icon: React.ReactNode; onSelect: () => void; destructive?: boolean; disabled?: boolean }

/** The profile card's actions: one menu on phones (a column of a dozen buttons would fill the screen), buttons from md up. */
function ProfileActions({ items }: { items: ProfileAction[] }) {
  if (!items.length) return null
  return <div className="mt-4">
    <div className="md:hidden"><DropdownMenu label="管理用户" align="start" trigger={<Button variant="secondary" className="w-full"><Settings2 />管理用户</Button>} items={items.map((item, index) => ({ ...item, separatorBefore: Boolean(item.destructive && index) }))} /></div>
    <div className="hidden gap-2 md:grid">{items.map(item => <Button key={item.label} variant={item.destructive ? "danger" : "secondary"} className="w-full" onClick={item.onSelect} disabled={item.disabled}>{item.icon}{item.label}</Button>)}</div>
  </div>
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-3 sm:grid-cols-1 sm:gap-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="min-w-0 break-words text-right text-sm font-medium sm:text-left">{value}</div>
    </div>
  )
}
