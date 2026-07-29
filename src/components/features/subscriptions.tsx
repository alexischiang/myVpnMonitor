import * as React from "react"
import { addMonths, format } from "date-fns"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { Eye, Loader2, Plus, Power, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { deleteJson, postJson, putJson } from "@/api"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DataTableCard } from "@/components/features/data-table-card"
import { DataTable, DataTableColumnHeader, DataTableRowActions } from "@/components/features/data-table"
import { useData } from "@/components/features/data-provider"
import { ProviderBadge } from "@/components/features/provider-badge"
import { SimpleFormDialog, type Field as SimpleField, type FormValues } from "@/components/features/simple-form"
import { StatusBadge, TrafficProgress, UrlCell } from "@/components/features/shared"
import type { Subscription, VendorRating } from "@/types"
import { formatDate, statusLabels } from "@/utils"

type ProviderSummary = {
  name: string
  vendorId?: string
  rating?: VendorRating | null
  subscriptions: Subscription[]
  poolCount: number
  enabledCount: number
  customerCount: number
  capacity: number
  autoSwitchCount: number
  latestExpiry: string
}

const subscriptionProvider = (item: Subscription) => item.serviceProvider || item.provider || "未填写供应商"
const manualSourceLabel = (item: Subscription) => item.sourceType === "yaml" ? "手动 YAML" : item.sourceType === "manual" ? "手动 Base64" : ""
const providerRatingFields: SimpleField[] = [{
  name: "rating",
  label: "供应商评级",
  type: "select",
  required: true,
  options: [
    { value: "S", label: "S 级" },
    { value: "A", label: "A 级" },
    { value: "B", label: "B 级" },
    { value: "C", label: "C 级" },
    { value: "unrated", label: "未评级" },
  ],
}]

export function SubscriptionsPage() {
  const { subscriptions, vendors, reload, runAsync, busy } = useData()
  const [editing, setEditing] = React.useState<Subscription | null>(null)
  const [disabling, setDisabling] = React.useState<Subscription | null>(null)
  const [disablingProvider, setDisablingProvider] = React.useState<ProviderSummary | null>(null)
  const [ratingProvider, setRatingProvider] = React.useState<ProviderSummary | null>(null)
  const [open, setOpen] = React.useState(false)
  const [pendingAction, setPendingAction] = React.useState("")
  const [enabledFilter, setEnabledFilter] = React.useState("all")
  const [statusFilter, setStatusFilter] = React.useState("ok")
  const [providerFilter, setProviderFilter] = React.useState("all")
  const defaultManualExpiry = React.useMemo(() => format(addMonths(new Date(), 1), "yyyy-MM-dd"), [])
  const [activeTab, setActiveTab] = React.useState("urls")

  async function save(values: FormValues) {
    const payload = {
      ...values,
      allowedGroups: ["basic", "pro", "ultra"].filter(group => values[`allow_${group}`] === true),
    }
    await runAsync(async () => {
      if (editing?.id) {
        await putJson(`/api/subscriptions/${editing.id}`, payload)
        const nextSourceType = values.sourceType === "manual" || values.sourceType === "yaml" ? values.sourceType : "url"
        const nextManualContent = nextSourceType === "manual"
          ? String(values.manualContent || "").replace(/\s+/g, "")
          : String(values.manualContent || "").trim()
        const sourceChanged = nextSourceType !== (editing.sourceType || "url")
          || (nextSourceType !== "url" && nextManualContent !== editing.manualContent)
          || (nextSourceType === "url" && String(values.url || "").trim() !== editing.url)
        if (sourceChanged) await postJson(`/api/subscriptions/${editing.id}/refresh`, {})
        toast.success("订阅已更新")
      } else {
        const created = await postJson<Subscription>("/api/subscriptions", payload)
        await postJson(`/api/subscriptions/${created.id}/refresh`, {})
        toast.success("订阅已创建")
      }
      await reload(["subscriptions"])
    }, "保存订阅...")
  }

  async function remove(item: Subscription) {
    if (!confirm("确认删除该订阅？")) return
    setPendingAction(`delete:${item.id}`)
    try {
      await runAsync(async () => {
        await deleteJson(`/api/subscriptions/${item.id}`)
        await reload(["subscriptions"])
        toast.success("订阅已删除")
      }, "删除订阅...")
    } finally {
      setPendingAction("")
    }
  }

  async function refresh(item?: Subscription) {
    setPendingAction(item ? `refresh:${item.id}` : "refresh:all")
    try {
      await runAsync(async () => {
        if (item) await postJson(`/api/subscriptions/${item.id}/refresh`, {})
        else await postJson("/api/subscriptions/cache-refresh", {})
        await reload(["subscriptions"])
        toast.success("刷新完成")
      }, "刷新配置和指标...")
    } finally {
      setPendingAction("")
    }
  }

  async function toggleEnabled(item: Subscription) {
    setPendingAction(`toggle:${item.id}`)
    try {
      await runAsync(async () => {
        const enabled = item.enabled === false
        await putJson(`/api/subscriptions/${item.id}`, { enabled })
        await reload(["subscriptions"])
        toast.success(enabled ? "订阅池已启用" : "订阅池已停用")
      }, item.enabled === false ? "启用订阅池..." : "停用订阅池...")
    } finally {
      setPendingAction("")
    }
  }

  async function toggleProviderAutoSwitch(provider: ProviderSummary) {
    const excludeFromAutoSwitch = provider.autoSwitchCount > 0
    setPendingAction(`provider:${provider.name}`)
    try {
      await runAsync(async () => {
        await Promise.all(provider.subscriptions.map(item => putJson(`/api/subscriptions/${item.id}`, { excludeFromAutoSwitch })))
        await reload(["subscriptions"])
        toast.success(excludeFromAutoSwitch ? `已禁止 ${provider.name} 自动切入` : `已恢复 ${provider.name} 自动切入`)
      }, excludeFromAutoSwitch ? "批量禁止自动切入..." : "批量恢复自动切入...")
    } finally {
      setPendingAction("")
    }
  }

  async function saveProviderRating(values: FormValues) {
    if (!ratingProvider) return
    const rating = values.rating === "unrated" ? "" : values.rating
    if (!ratingProvider.vendorId && !rating) return
    await runAsync(async () => {
      if (ratingProvider.vendorId) await putJson(`/api/vendors/${ratingProvider.vendorId}`, { rating })
      else await postJson("/api/vendors", { name: ratingProvider.name, rating })
      await reload(["vendors", "subscriptions"])
      toast.success("供应商评级已保存")
    }, "保存供应商评级...")
  }

  const sortedSubscriptions = React.useMemo(() => [...subscriptions].sort((left, right) => (Date.parse(right.metrics?.expireAt || "") || 0) - (Date.parse(left.metrics?.expireAt || "") || 0)), [subscriptions])
  const statusOptions = React.useMemo(() => [...new Set(subscriptions.map(item => item.status).filter((value): value is string => Boolean(value)))].sort(), [subscriptions])
  const providerOptions = React.useMemo(() => [...new Set(subscriptions.map(item => item.serviceProvider || item.provider).filter((value): value is string => Boolean(value)))].sort(), [subscriptions])
  const providerSummaries = React.useMemo<ProviderSummary[]>(() => {
    const groups = new Map<string, Subscription[]>()
    const vendorByName = new Map(vendors.map(vendor => [vendor.name, vendor]))
    subscriptions.forEach(item => groups.set(subscriptionProvider(item), [...(groups.get(subscriptionProvider(item)) || []), item]))
    return [...groups].map(([name, items]) => ({
      name,
      vendorId: vendorByName.get(name)?.id,
      rating: vendorByName.get(name)?.rating === "" ? null : vendorByName.get(name)?.rating || "C",
      subscriptions: items,
      poolCount: items.length,
      enabledCount: items.filter(item => item.enabled !== false).length,
      customerCount: items.reduce((total, item) => total + (Number(item.customerCount) || 0), 0),
      capacity: items.reduce((total, item) => total + (Number(item.maxUsers) || 0), 0),
      autoSwitchCount: items.filter(item => !item.excludeFromAutoSwitch).length,
      latestExpiry: items.reduce((latest, item) => (Date.parse(item.metrics?.expireAt || "") || 0) > (Date.parse(latest) || 0) ? item.metrics?.expireAt || "" : latest, ""),
    })).sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
  }, [subscriptions, vendors])
  const fields = React.useMemo<SimpleField[]>(() => [
    {
      name: "sourceType",
      label: "配置来源",
      type: "select",
      required: true,
      className: "sm:col-span-2",
      options: [
        { value: "url", label: "远程订阅 URL" },
        { value: "manual", label: "手动 Base64 内容" },
        { value: "yaml", label: "手动 YAML 配置" },
      ],
    },
    { name: "url", label: "订阅 URL", type: "url", required: true, placeholder: "https://...", className: "sm:col-span-2", visibleWhen: { field: "sourceType", equals: "url" } },
    {
      name: "manualContent",
      label: "Base64 订阅内容",
      type: "textarea",
      required: true,
      rows: 5,
      placeholder: "粘贴完整的 Base64 字符串，解码后应包含 trojan://、vless:// 等节点",
      className: "sm:col-span-2",
      controlClassName: "field-sizing-fixed h-32 min-h-24 max-h-48 resize-y overflow-auto break-all font-mono text-xs",
      visibleWhen: { field: "sourceType", equals: "manual" },
    },
    { name: "expiresAt", label: "到期日", type: "date", required: true, visibleWhen: { field: "sourceType", equals: "manual" } },
    {
      name: "manualContent",
      label: "YAML 配置内容",
      type: "textarea",
      required: true,
      rows: 10,
      placeholder: "粘贴包含 proxies、proxy-groups 和 rules 的完整 Clash YAML 配置",
      className: "sm:col-span-2",
      controlClassName: "field-sizing-fixed h-64 min-h-40 max-h-96 resize-y overflow-auto font-mono text-xs",
      visibleWhen: { field: "sourceType", equals: "yaml" },
    },
    { name: "expiresAt", label: "到期日", type: "date", required: true, visibleWhen: { field: "sourceType", equals: "yaml" } },
    { name: "email", label: "邮箱", type: "email", placeholder: "customer@example.com" },
    {
      name: "serviceProvider",
      label: "供应商",
      type: "select",
      placeholder: "选择供应商",
      options: providerOptions.map(provider => ({ value: provider, label: provider })),
      allowCustom: true,
      customLabel: "新增供应商",
      customPlaceholder: "输入供应商名称",
    },
    { name: "maxUsers", label: "人数上限", type: "number", required: true, placeholder: "15", className: "sm:col-span-2" },
    { name: "allow_basic", label: "BASIC", type: "checkbox", className: "items-center rounded-md border p-3 sm:col-span-1" },
    { name: "allow_pro", label: "PRO", type: "checkbox", className: "items-center rounded-md border p-3 sm:col-span-1" },
    { name: "allow_ultra", label: "ULTRA", type: "checkbox", className: "items-center rounded-md border p-3 sm:col-span-1" },
    {
      name: "useCachedConfigForFallback",
      label: "不依赖实时拉取",
      type: "checkbox",
      description: "已有 YAML 缓存时，无需验证远端即可换入。",
      className: "items-start rounded-md border p-3 sm:col-span-2",
      visibleWhen: { field: "sourceType", equals: "url" },
    },
    {
      name: "excludeFromAutoSwitch",
      label: "禁止自动换池切换到此 URL",
      type: "checkbox",
      description: "不影响已绑定用户，也不影响手动选择此池。",
      className: "items-start rounded-md border p-3 sm:col-span-2",
      visibleWhen: { field: "sourceType", equals: "url" },
    },
  ], [providerOptions])
  const filteredSubscriptions = React.useMemo(() => sortedSubscriptions.filter(item =>
    (enabledFilter === "all" || (item.enabled === false ? "disabled" : "enabled") === enabledFilter) &&
    (statusFilter === "all" || item.status === statusFilter) &&
    (providerFilter === "all" || subscriptionProvider(item) === providerFilter)
  ), [sortedSubscriptions, enabledFilter, statusFilter, providerFilter])

  const columns = React.useMemo<ColumnDef<Subscription>[]>(() => [
    {
      id: "subscription",
      accessorFn: item => `${item.email || item.name || ""} ${item.serviceProvider || item.provider || ""} ${item.note || ""} ${item.url || ""} ${manualSourceLabel(item)}`,
      header: DataTableColumnHeader({ title: "订阅" }),
      meta: { label: "订阅" },
      cell: ({ row }) => {
        const item = row.original
        return (
          <div className="grid gap-1">
            <div className="truncate font-medium">{item.email || item.name || "未命名订阅"}</div>
            <ProviderBadge name={subscriptionProvider(item)} />
          </div>
        )
      },
    },
    {
      accessorKey: "url",
      header: "URL",
      meta: { label: "URL" },
      cell: ({ row }) => manualSourceLabel(row.original) ? <Badge variant="secondary">{manualSourceLabel(row.original)}</Badge> : <UrlCell value={row.original.url} />,
      enableSorting: false,
    },
    {
      accessorKey: "customerCount",
      header: DataTableColumnHeader({ title: "客户" }),
      meta: { label: "客户" },
      cell: ({ row }) => row.original.customerCount || 0,
    },
    {
      id: "allowedGroups",
      accessorFn: item => (item.allowedGroups || ["basic", "pro", "ultra"]).join(" "),
      header: DataTableColumnHeader({ title: "适用范围" }),
      meta: { label: "适用范围" },
      cell: ({ row }) => (row.original.allowedGroups || ["basic", "pro", "ultra"]).map(group => group.toUpperCase()).join(" / "),
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
          <DataTableRowActions detail={<Button asChild variant="ghost" size="icon"><Link to={`/urls/detail/${item.id}`} aria-label="查看订阅详情"><Eye /></Link></Button>}>
            <DropdownMenuItem onSelect={() => refresh(item)} disabled={Boolean(pendingAction)}>
              {pendingAction === `refresh:${item.id}` ? <Loader2 className="animate-spin" /> : <RefreshCw />}刷新
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => item.enabled === false ? toggleEnabled(item) : setDisabling(item)} disabled={Boolean(pendingAction)}>
              {pendingAction === `toggle:${item.id}` ? <Loader2 className="animate-spin" /> : <Power />}{item.enabled === false ? "启用" : "停用"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { setEditing(item); setOpen(true) }}>编辑</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => remove(item)} disabled={Boolean(pendingAction)}>
              {pendingAction === `delete:${item.id}` ? <Loader2 className="animate-spin" /> : <Trash2 />}删除
            </DropdownMenuItem>
          </DataTableRowActions>
        )
      },
      enableHiding: false,
      enableSorting: false,
    },
  ], [pendingAction])

  const providerColumns = React.useMemo<ColumnDef<ProviderSummary>[]>(() => [
    {
      accessorKey: "name",
      header: DataTableColumnHeader({ title: "供应商" }),
      meta: { label: "供应商" },
      cell: ({ row }) => <ProviderBadge name={row.original.name} />,
    },
    {
      accessorKey: "poolCount",
      header: DataTableColumnHeader({ title: "池 URL" }),
      meta: { label: "池 URL" },
    },
    {
      accessorKey: "rating",
      header: DataTableColumnHeader({ title: "评级" }),
      meta: { label: "评级" },
      cell: ({ row }) => row.original.rating ? `${row.original.rating} 级` : "未评级",
    },
    {
      accessorKey: "enabledCount",
      header: DataTableColumnHeader({ title: "启用" }),
      meta: { label: "启用" },
      cell: ({ row }) => `${row.original.enabledCount}/${row.original.poolCount}`,
    },
    {
      accessorKey: "customerCount",
      header: DataTableColumnHeader({ title: "客户/容量" }),
      meta: { label: "客户/容量" },
      cell: ({ row }) => `${row.original.customerCount}/${row.original.capacity}`,
    },
    {
      accessorKey: "autoSwitchCount",
      header: DataTableColumnHeader({ title: "自动切入" }),
      meta: { label: "自动切入" },
      cell: ({ row }) => <Badge variant={row.original.autoSwitchCount ? "success" : "secondary"}>{row.original.autoSwitchCount}/{row.original.poolCount} 允许</Badge>,
    },
    {
      accessorKey: "latestExpiry",
      header: DataTableColumnHeader({ title: "最晚到期" }),
      meta: { label: "最晚到期" },
      cell: ({ row }) => formatDate(row.original.latestExpiry),
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => {
        const provider = row.original
        const pending = pendingAction === `provider:${provider.name}`
        return (
          <DataTableRowActions detail={<Button variant="ghost" size="icon" onClick={() => { setProviderFilter(provider.name); setActiveTab("urls") }} aria-label="查看供应商 URL"><Eye /></Button>}>
            <DropdownMenuItem onSelect={() => setRatingProvider(provider)}>设置评级</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => provider.autoSwitchCount ? setDisablingProvider(provider) : toggleProviderAutoSwitch(provider)} disabled={Boolean(pendingAction)}>
              {pending ? <Loader2 className="animate-spin" /> : null}{provider.autoSwitchCount ? "禁止自动切入" : "恢复自动切入"}
            </DropdownMenuItem>
          </DataTableRowActions>
        )
      },
      enableHiding: false,
      enableSorting: false,
    },
  ], [pendingAction])

  return (
    <div className="grid min-w-0 w-full gap-4 px-4 lg:px-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0 w-full gap-4">
        <TabsList variant="line">
          <TabsTrigger value="urls">URL 管理</TabsTrigger>
          <TabsTrigger value="providers">供应商管理</TabsTrigger>
        </TabsList>
        <TabsContent value="urls" className="min-w-0">
          <DataTableCard filters={<>
            <Field><FieldLabel htmlFor="pool-enabled-filter">启用状态</FieldLabel><Select value={enabledFilter} onValueChange={setEnabledFilter}><SelectTrigger id="pool-enabled-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="enabled">已启用</SelectItem><SelectItem value="disabled">已停用</SelectItem></SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="pool-status-filter">运行状态</FieldLabel><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger id="pool-status-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem>{statusOptions.map(status => <SelectItem key={status} value={status}>{statusLabels[status] || status}</SelectItem>)}</SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="pool-provider-filter">供应商</FieldLabel><Select value={providerFilter} onValueChange={setProviderFilter}><SelectTrigger id="pool-provider-filter" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem>{providerSummaries.map(provider => <SelectItem key={provider.name} value={provider.name}>{provider.name}</SelectItem>)}</SelectContent></Select></Field>
          </>}>
            <DataTable
              columns={columns}
              data={filteredSubscriptions}
              searchKey="subscription"
              searchPlaceholder="搜索订阅..."
              emptyTitle="暂无订阅"
              pageSize={30}
              frame="card"
              toolbar={<><Button variant="outline" size="sm" onClick={() => refresh()} disabled={!!busy || Boolean(pendingAction)}>{pendingAction === "refresh:all" ? <Loader2 className="animate-spin" /> : <RefreshCw />}全部刷新</Button><Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}><Plus />新增订阅</Button></>}
            />
          </DataTableCard>
        </TabsContent>
        <TabsContent value="providers" className="min-w-0">
          <DataTableCard>
            <DataTable columns={providerColumns} data={providerSummaries} searchKey="name" searchPlaceholder="搜索供应商..." emptyTitle="暂无供应商" pageSize={10} frame="card" />
          </DataTableCard>
        </TabsContent>
      </Tabs>

      <AlertDialog open={Boolean(disabling)} onOpenChange={open => { if (!open) setDisabling(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认停用该池 URL？</AlertDialogTitle>
            <AlertDialogDescription>停用后，该池不会继续提供订阅；已绑定用户下次请求时会触发自动换池。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={() => disabling && toggleEnabled(disabling)}>确认停用</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(disablingProvider)} onOpenChange={open => { if (!open) setDisablingProvider(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认禁止该供应商自动切入？</AlertDialogTitle>
            <AlertDialogDescription>将批量禁止 {disablingProvider?.name} 下 {disablingProvider?.poolCount || 0} 个池 URL 被自动换池或续费推荐切入；已绑定用户和手动选择不受影响。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={() => disablingProvider && toggleProviderAutoSwitch(disablingProvider)}>确认禁止</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SimpleFormDialog
        open={Boolean(ratingProvider)}
        title={`设置 ${ratingProvider?.name || ""} 评级`}
        description="未评级供应商不会参与自动推荐。"
        fields={providerRatingFields}
        initialValues={{ rating: ratingProvider?.rating || "unrated" }}
        submitLabel="保存评级"
        onOpenChange={open => { if (!open) setRatingProvider(null) }}
        onSubmit={saveProviderRating}
      />

      <SimpleFormDialog
        open={open}
        title={editing ? "编辑订阅" : "新增订阅"}
        description="选择远程 URL、手动 Base64 节点或完整 YAML 配置；手动内容不会访问任何上游地址。"
        fields={fields}
        initialValues={editing ? {
          ...editing,
          sourceType: editing.sourceType || "url",
          expiresAt: editing.metrics?.expireAt?.slice(0, 10) || defaultManualExpiry,
          maxUsers: editing.maxUsers ?? 15,
          allow_basic: !editing.allowedGroups || editing.allowedGroups.includes("basic"),
          allow_pro: !editing.allowedGroups || editing.allowedGroups.includes("pro"),
          allow_ultra: !editing.allowedGroups || editing.allowedGroups.includes("ultra"),
        } : { sourceType: "url", expiresAt: defaultManualExpiry, maxUsers: 15, allow_basic: true, allow_pro: true, allow_ultra: true }}
        submitLabel={editing ? "保存修改" : "保存并刷新"}
        contentClassName="sm:max-w-2xl"
        onOpenChange={setOpen}
        onSubmit={save}
      />
    </div>
  )
}
