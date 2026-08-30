import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Eye, Loader2, Plus, Save, Trash2 } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"

import { putJson } from "@/api"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { DataTable, DataTableColumnHeader, DataTableRowActions } from "@/components/features/data-table"
import { DataTableCard } from "@/components/features/data-table-card"
import { useData } from "@/components/features/data-provider"
import { EmptyState } from "@/components/features/shared"
import type { PricingRow } from "@/types"
import { formatMoney } from "@/utils"
import { BackButton } from "@/components/features/back-button"
import { useSearchParamState } from "@/hooks/use-search-param-state"

const periods = [
  { key: "monthly", devicesKey: "monthlyDevices", label: "月付 / 30天" },
  { key: "quarterly", devicesKey: "quarterlyDevices", label: "季付 / 90天" },
  { key: "half_yearly", devicesKey: "half_yearlyDevices", label: "半年付 / 180天" },
  { key: "yearly", devicesKey: "yearlyDevices", label: "年付 / 360天" },
] as const

const permissionGroups = [
  { value: "basic", label: "BASIC" },
  { value: "pro", label: "PRO" },
  { value: "ultra", label: "ULTRA" },
] as const

type ProductItem = {
  id: string
  name: string
  description: string
  category: "套餐服务" | "附加服务" | "人工定制"
  serviceType: "周期性套餐" | "不限时套餐" | "附加服务" | "人工定制"
  billing: string
  status: "已启用" | "未开放"
  stock?: number
  group?: string
  service: "recurring" | "lifetime" | "addon" | "custom"
}

function priceRange(row: PricingRow) {
  const values = periods.map(period => Number(row[period.key])).filter(Number.isFinite)
  if (!values.length) return "未定价"
  const min = Math.min(...values)
  const max = Math.max(...values)
  return min === max ? formatMoney(min) : `${formatMoney(min)}–${formatMoney(max)}`
}

function productsFromPricing(pricing: PricingRow[]): ProductItem[] {
  return [
    ...pricing.flatMap(row => {
      const name = row.name || row.group.toUpperCase()
      if (["addon", "custom"].includes(row.productKind || "")) return [{ id: `${row.group}:${row.productKind}`, name, description: row.description || row.title || "服务", category: row.productKind === "custom" ? "人工定制" as const : "附加服务" as const, serviceType: row.productKind === "custom" ? "人工定制" as const : "附加服务" as const, billing: row.productKind === "custom" && !row.addonPrice ? "人工报价" : `${formatMoney(Number(row.addonPrice || 0))} / ${row.addonUnit || "次"}`, status: row.availability?.addon ? "已启用" as const : "未开放" as const, stock: row.stock, group: row.group, service: row.productKind as "addon" | "custom" }]
      const products: ProductItem[] = row.recurringDeleted ? [] : [{ id: `${row.group}:recurring`, name, description: row.title || row.description || "套餐服务", category: "套餐服务", serviceType: "周期性套餐", billing: `${priceRange(row)} · ${row.unlimited ? "无限流量" : "固定流量"} · 30–360天`, status: row.availability?.recurring ? "已启用" : "未开放", stock: row.stock, group: row.group, service: "recurring" }]
      if (row.lifetimeDeleted !== true && Number.isFinite(Number(row.lifetimePrice))) products.push({ id: `${row.group}:lifetime`, name: row.lifetimeName || `${name} 不限时`, description: row.lifetimeDescription || "固定流量不限时长", category: "套餐服务", serviceType: "不限时套餐", billing: `${formatMoney(Number(row.lifetimePrice))} · ${row.lifetimeUnlimited ? "无限流量" : row.lifetimeTraffic || "固定流量"}，不限时长`, status: row.availability?.lifetime ? "已启用" : "未开放", stock: row.lifetimeStock, group: row.group, service: "lifetime" })
      return products
    }),
  ]
}

function ProductStatusBadge({ status }: { status: ProductItem["status"] }) {
  return <Badge variant={status === "已启用" ? "success" : "secondary"}>{status}</Badge>
}

export function PricingSettingsPage() {
  const { pricing } = useData()
  const [category, setCategory] = useSearchParamState("category", "all")
  const [serviceType, setServiceType] = useSearchParamState("type", "all")
  const products = React.useMemo(() => productsFromPricing(pricing), [pricing])
  const filteredProducts = React.useMemo(() => products.filter(product => (category === "all" || product.category === category) && (serviceType === "all" || product.serviceType === serviceType)), [category, products, serviceType])

  const columns = React.useMemo<ColumnDef<ProductItem>[]>(() => [
    { id: "product", accessorFn: product => `${product.name} ${product.description}`, header: DataTableColumnHeader({ title: "商品" }), meta: { label: "商品" }, cell: ({ row }) => <ItemContent><ItemTitle>{row.original.name}</ItemTitle><ItemDescription>{row.original.description}</ItemDescription></ItemContent> },
    { accessorKey: "category", header: DataTableColumnHeader({ title: "商品分类" }), meta: { label: "商品分类" }, cell: ({ row }) => <Badge variant="outline">{row.original.category}</Badge> },
    { accessorKey: "serviceType", header: DataTableColumnHeader({ title: "服务类型" }), meta: { label: "服务类型" } },
    { accessorKey: "billing", header: DataTableColumnHeader({ title: "价格与周期" }), meta: { label: "价格与周期" } },
    { accessorKey: "stock", header: DataTableColumnHeader({ title: "库存" }), meta: { label: "库存" }, cell: ({ row }) => row.original.stock === undefined ? "不限库存" : row.original.stock },
    { accessorKey: "status", header: DataTableColumnHeader({ title: "状态" }), meta: { label: "状态" }, cell: ({ row }) => <ProductStatusBadge status={row.original.status} /> },
    { id: "actions", header: "操作", cell: ({ row }) => row.original.group ? <DataTableRowActions detail={<Button asChild variant="ghost" size="icon"><Link to={`/pricing-settings/${encodeURIComponent(row.original.group)}/${row.original.service}`} aria-label={`编辑 ${row.original.name}`}><Eye /></Link></Button>} /> : "-", enableHiding: false, enableSorting: false },
  ], [])

  const renderMobileProduct = React.useCallback((product: ProductItem) => <Item variant="outline"><ItemContent><ItemTitle>{product.name}</ItemTitle><ItemDescription>{product.category} · {product.serviceType}</ItemDescription><ItemDescription>{product.billing} · {product.stock === undefined ? "不限库存" : `库存 ${product.stock}`}</ItemDescription></ItemContent><ItemActions><ProductStatusBadge status={product.status} />{product.group ? <Button asChild variant="ghost" size="icon"><Link to={`/pricing-settings/${encodeURIComponent(product.group)}/${product.service}`} aria-label={`编辑 ${product.name}`}><Eye /></Link></Button> : null}</ItemActions></Item>, [])

  return <div className="grid gap-4 px-4 lg:px-6"><DataTableCard filters={<><Field><FieldLabel htmlFor="product-category">商品分类</FieldLabel><Select value={category} onValueChange={setCategory}><SelectTrigger id="product-category" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部商品</SelectItem><SelectItem value="套餐服务">套餐服务</SelectItem><SelectItem value="附加服务">附加服务</SelectItem><SelectItem value="人工定制">人工定制</SelectItem></SelectContent></Select></Field><Field><FieldLabel htmlFor="service-type">服务类型</FieldLabel><Select value={serviceType} onValueChange={setServiceType}><SelectTrigger id="service-type" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部类型</SelectItem><SelectItem value="周期性套餐">周期性套餐</SelectItem><SelectItem value="不限时套餐">不限时套餐</SelectItem><SelectItem value="附加服务">附加服务</SelectItem><SelectItem value="人工定制">人工定制</SelectItem></SelectContent></Select></Field></>}><DataTable columns={columns} data={filteredProducts} searchKey="product" searchPlaceholder="搜索商品" emptyTitle="暂无商品" renderMobileItem={renderMobileProduct} frame="card" columnLayout="content" toolbar={<Button asChild><Link to="/pricing-settings/new"><Plus />新增商品</Link></Button>} stateKey="products" /></DataTableCard></div>
}

export function PricingDetailPage() {
  const { group = "", serviceType = "recurring" } = useParams()
  const navigate = useNavigate()
  const { pricing, reload, runAsync } = useData()
  const isNew = !group
  const source = pricing.find(item => item.group === group)
  const [row, setRow] = React.useState<PricingRow | null>(source || (isNew ? { group: "", enabled: false, stock: 0, monthly: 0, monthlyDevices: 1, features: [], unavailableFeatures: [], lineType: "self_hosted" } : null))
  const [newServiceType, setNewServiceType] = React.useState<"recurring" | "lifetime" | "addon" | "custom">("recurring")
  const isLifetime = serviceType === "lifetime" || isNew && newServiceType === "lifetime"
  const isCustom = serviceType === "custom" || isNew && newServiceType === "custom"
  const isAddon = serviceType === "addon" || isNew && newServiceType === "addon"
  const isService = isAddon || isCustom
  const [saving, setSaving] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  React.useEffect(() => setRow(source || (isNew ? { group: "", enabled: false, stock: 0, monthly: 0, monthlyDevices: 1, features: [], unavailableFeatures: [], lineType: "self_hosted" } : null)), [isNew, source])

  function update(patch: Partial<PricingRow>) {
    setRow(current => current ? { ...current, ...patch } : current)
  }

  async function save() {
    if (!row) return
    const normalizedGroup = row.group.trim().toLowerCase()
    const serviceName = isLifetime ? row.lifetimeName : row.name
    if (!normalizedGroup || !serviceName?.trim()) { toast.error("请填写商品标识和套餐名称"); return }
    setSaving(true)
    try {
      await runAsync(async () => {
        const newRow = { ...row, group: normalizedGroup, productKind: isCustom ? "custom" as const : isAddon ? "addon" as const : "plan" as const, lineType: isService ? undefined : "self_hosted" as const, recurringDeleted: isLifetime, lifetimeDeleted: !isLifetime && !isService }
        await putJson("/api/pricing", isNew ? [...pricing, newRow] : pricing.map(item => item.group === row.group ? row : item))
        await reload(["pricing"], { silent: true })
        toast.success("商品配置已保存")
        if (isNew) navigate(`/pricing-settings/${encodeURIComponent(normalizedGroup)}/${newServiceType}`, { replace: true })
      }, "保存商品配置...")
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!row || isNew) return
    setDeleting(true)
    try {
      await runAsync(async () => {
        const removeGroup = isService || (isLifetime ? row.recurringDeleted === true : row.lifetimeDeleted === true)
        const nextPricing = removeGroup ? pricing.filter(item => item.group !== row.group) : pricing.map(item => item.group === row.group ? { ...item, [isLifetime ? "lifetimeDeleted" : "recurringDeleted"]: true } : item)
        await putJson("/api/pricing", nextPricing)
        await reload(["pricing"], { silent: true })
        toast.success("商品已删除")
        navigate("/pricing-settings", { replace: true })
      }, "删除商品...")
    } finally {
      setDeleting(false)
    }
  }

  if (!row) return <div className="grid gap-4 px-4 lg:px-6"><EmptyState title="商品不存在" description="请返回商品管理重新选择。" /><BackButton fallback="/pricing-settings" className="w-fit" /></div>

  const serviceName = isLifetime ? row.lifetimeName || (isNew ? "" : `${row.name || row.group.toUpperCase()} 不限时`) : row.name || (isNew ? "" : row.group.toUpperCase())
  const serviceTitle = isLifetime ? row.lifetimeTitle || "固定流量不限时长" : row.title || ""
  const serviceDescription = isLifetime ? row.lifetimeDescription || "" : row.description || ""
  const serviceTraffic = isLifetime ? row.lifetimeTraffic || "" : row.traffic || ""
  const serviceStock = isLifetime ? row.lifetimeStock : row.stock
  const serviceEnabled = isLifetime ? row.lifetimeEnabled !== false : row.enabled !== false
  const serviceRecommended = isLifetime ? Boolean(row.lifetimeRecommended) : Boolean(row.recommended)
  const serviceUnlimited = isLifetime ? row.lifetimeUnlimited === true : row.unlimited === true
  const servicePermissionGroup = isLifetime ? row.lifetimePermissionGroup || (permissionGroups.some(item => item.value === row.group) ? row.group : "pro") : row.permissionGroup || (permissionGroups.some(item => item.value === row.group) ? row.group : "pro")
  const serviceFeatures = isLifetime ? row.lifetimeFeatures || [] : row.features || []
  const serviceUnavailableFeatures = isLifetime ? row.lifetimeUnavailableFeatures || [] : row.unavailableFeatures || []
  const updateService = (field: "name" | "title" | "description" | "traffic" | "stock" | "enabled" | "recommended" | "features" | "unavailableFeatures", value: unknown) => update({ [isLifetime ? `lifetime${field[0].toUpperCase()}${field.slice(1)}` : field]: value } as Partial<PricingRow>)

  return <div className="grid gap-4 px-4 lg:px-6">
    <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink asChild><Link to="/pricing-settings">商品管理</Link></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{isNew ? "新增商品" : serviceName}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
    <header className="flex flex-wrap items-start justify-between gap-4"><section className="grid gap-1"><h2 className="text-xl font-semibold tracking-tight">{isNew ? "新增商品" : serviceName}</h2><p className="text-sm text-muted-foreground">{isCustom ? "人工确认需求、价格和交付内容的定制服务。" : isAddon ? "在周期套餐基础上购买的附加服务。" : isLifetime ? `${serviceUnlimited ? "无限" : "固定"}流量、不限使用时长的独立商品。` : "按月、季、半年或年度续期的独立商品。"}点击保存后生效。</p></section><div className="flex flex-wrap gap-2">{isNew ? null : <Button variant="destructive" onClick={() => setDeleteOpen(true)} disabled={saving || deleting}><Trash2 />删除</Button>}<BackButton fallback="/pricing-settings" /><Button onClick={() => void save()} disabled={saving || deleting}>{saving ? <Loader2 className="animate-spin" /> : <Save />}{saving ? "保存中..." : "保存配置"}</Button></div></header>
    <Card><CardHeader><CardTitle>基础信息</CardTitle><CardDescription>用于商品列表和购买页面展示。</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">{isNew ? <><Field><FieldLabel htmlFor="product-type">商品类型</FieldLabel><Select value={newServiceType} onValueChange={value => setNewServiceType(value as "recurring" | "lifetime" | "addon" | "custom")}><SelectTrigger id="product-type" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="recurring">周期性套餐</SelectItem><SelectItem value="lifetime">不限时套餐</SelectItem><SelectItem value="addon">附加服务</SelectItem><SelectItem value="custom">人工定制</SelectItem></SelectContent></Select></Field><Field><FieldLabel htmlFor="product-group">商品标识</FieldLabel><Input id="product-group" value={row.group} onChange={event => update({ group: event.target.value.toLowerCase() })} placeholder="例如 vip_plus" /></Field></> : null}<Field><FieldLabel htmlFor="product-name">{isService ? "商品名称" : "套餐名称"}</FieldLabel><Input id="product-name" value={serviceName} onChange={event => updateService("name", event.target.value)} /></Field><Field><FieldLabel htmlFor="product-title">商品副标题</FieldLabel><Input id="product-title" value={serviceTitle} onChange={event => updateService("title", event.target.value)} /></Field>{isService ? null : <><Field><FieldLabel htmlFor="product-permission-group">分配权限组</FieldLabel><Select value={servicePermissionGroup} onValueChange={value => update({ [isLifetime ? "lifetimePermissionGroup" : "permissionGroup"]: value as PricingRow["permissionGroup"] })}><SelectTrigger id="product-permission-group" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{permissionGroups.map(group => <SelectItem key={group.value} value={group.value}>{group.label}</SelectItem>)}</SelectContent></Select><FieldDescription>开通或后台映射用户时，自动同步该权限组关联的入站。</FieldDescription></Field><Field orientation="horizontal"><Switch id="product-unlimited" checked={serviceUnlimited} onCheckedChange={unlimited => update({ [isLifetime ? "lifetimeUnlimited" : "unlimited"]: unlimited })} /><FieldLabel htmlFor="product-unlimited">无限流量</FieldLabel></Field>{serviceUnlimited ? null : <Field><FieldLabel htmlFor="product-traffic">固定流量说明</FieldLabel><Input id="product-traffic" value={serviceTraffic} onChange={event => updateService("traffic", event.target.value)} placeholder={isLifetime ? "例如 100G 固定流量" : "例如 每月 100G"} /></Field>}</>}<Field><FieldLabel htmlFor="product-stock">库存</FieldLabel><Input id="product-stock" type="number" min="0" step="1" value={serviceStock ?? ""} onChange={event => updateService("stock", event.target.value === "" ? undefined : Number(event.target.value))} placeholder="留空表示不限库存" /></Field><Field className="md:col-span-2"><FieldLabel htmlFor="product-description">商品描述</FieldLabel><Input id="product-description" value={serviceDescription} onChange={event => updateService("description", event.target.value)} /></Field><Field orientation="horizontal"><Switch id="product-enabled" checked={serviceEnabled} onCheckedChange={enabled => updateService("enabled", enabled)} /><FieldLabel htmlFor="product-enabled">商品上架</FieldLabel></Field><Field orientation="horizontal"><Checkbox id="product-recommended" checked={serviceRecommended} onCheckedChange={checked => updateService("recommended", checked === true)} /><FieldLabel htmlFor="product-recommended">标记为推荐商品</FieldLabel></Field></CardContent></Card>
    {isService ? <Card><CardHeader><CardTitle>{isCustom ? "人工定制配置" : "附加服务配置"}</CardTitle><CardDescription>设置售价、规格和支付后的交付方式。</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Field><FieldLabel htmlFor="addon-price">商品价格</FieldLabel><Input id="addon-price" type="number" min="0" step="0.01" value={row.addonPrice ?? ""} onChange={event => update({ addonPrice: Number(event.target.value) })} /></Field><Field><FieldLabel htmlFor="addon-unit">计价单位</FieldLabel><Input id="addon-unit" value={row.addonUnit || "次"} onChange={event => update({ addonUnit: event.target.value })} placeholder="例如 次、100 GB" /></Field><Field><FieldLabel htmlFor="addon-delivery-mode">交付方式</FieldLabel><Select value={row.addonDeliveryMode || "manual"} onValueChange={value => update({ addonDeliveryMode: value as "automatic" | "manual" })}><SelectTrigger id="addon-delivery-mode" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="automatic">自动交付</SelectItem><SelectItem value="manual">人工交付</SelectItem></SelectContent></Select></Field><Field><FieldLabel htmlFor="addon-delivery-description">交付说明</FieldLabel><Input id="addon-delivery-description" value={row.addonDeliveryDescription || ""} onChange={event => update({ addonDeliveryDescription: event.target.value })} placeholder="例如 支付后自动增加当前周期流量" /></Field></CardContent></Card> : isLifetime ? <Card><CardHeader><CardTitle>不限时定价</CardTitle><CardDescription>{serviceUnlimited ? "无限流量且不设置到期时间。" : "固定总流量，用完为止，不设置到期时间。"}</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Field><FieldLabel htmlFor="lifetime-price">商品价格</FieldLabel><Input id="lifetime-price" type="number" min="0" step="0.01" value={row.lifetimePrice ?? ""} onChange={event => update({ lifetimePrice: Number(event.target.value) })} /></Field><Field><FieldLabel htmlFor="lifetime-devices">可使用设备数</FieldLabel><Input id="lifetime-devices" type="number" min="0" step="1" value={row.lifetimeDevices ?? ""} onChange={event => update({ lifetimeDevices: Number(event.target.value) })} /></Field>{row.lineType === "self_hosted" && !serviceUnlimited ? <Field><FieldLabel htmlFor="lifetime-traffic-bytes">3x-ui 总额度（GB）</FieldLabel><Input id="lifetime-traffic-bytes" type="number" min="0" step="1" value={row.lifetimeTrafficBytes === undefined ? "" : row.lifetimeTrafficBytes / 1024 ** 3} onChange={event => update({ lifetimeTrafficBytes: Number(event.target.value) * 1024 ** 3 })} /></Field> : null}</CardContent></Card> : <Card><CardHeader><CardTitle>周期定价</CardTitle><CardDescription>{serviceUnlimited ? "无限流量版本的周期价格和可使用设备数。" : "固定流量版本的周期价格和可使用设备数。"}</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{periods.map(period => <FieldGroup key={period.key}><FieldDescription>{period.label}</FieldDescription><Field><FieldLabel htmlFor={`${period.key}-price`}>商品价格</FieldLabel><Input id={`${period.key}-price`} type="number" min="0" step="0.01" value={row[period.key] ?? ""} onChange={event => update({ [period.key]: Number(event.target.value) })} /></Field><Field><FieldLabel htmlFor={period.devicesKey}>可使用设备数</FieldLabel><Input id={period.devicesKey} type="number" min="0" step="1" value={row[period.devicesKey] ?? ""} onChange={event => update({ [period.devicesKey]: Number(event.target.value) })} /></Field></FieldGroup>)}</CardContent></Card>}
    <Card><CardHeader><CardTitle>{isService ? "服务内容" : "权益信息"}</CardTitle><CardDescription>仅用于当前商品，每行填写一项。</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Field><FieldLabel htmlFor="product-features">{isService ? "包含内容" : "支持的权益"}</FieldLabel><Textarea id="product-features" rows={6} value={serviceFeatures.join("\n")} onChange={event => updateService("features", event.target.value.split("\n"))} /></Field><Field><FieldLabel htmlFor="product-unavailable-features">{isService ? "不包含内容" : "不支持的权益"}</FieldLabel><Textarea id="product-unavailable-features" rows={6} value={serviceUnavailableFeatures.join("\n")} onChange={event => updateService("unavailableFeatures", event.target.value.split("\n"))} /></Field></CardContent></Card>
    {isService ? <Card><CardHeader><CardTitle>服务规格</CardTitle><CardDescription>流量包、地区价格和有效期均由后台配置。</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Field><FieldLabel htmlFor="addon-type">服务类型</FieldLabel><Select value={row.addonType || "manual"} onValueChange={value => update({ addonType: value as PricingRow["addonType"] })}><SelectTrigger id="addon-type" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="traffic_pack">流量包</SelectItem><SelectItem value="home_ip">家宽 IP</SelectItem><SelectItem value="manual">人工服务</SelectItem></SelectContent></Select></Field><Field><FieldLabel htmlFor="addon-duration">有效天数</FieldLabel><Input id="addon-duration" type="number" min="0" step="1" value={row.addonDurationDays ?? 0} onChange={event => update({ addonDurationDays: Number(event.target.value) })} /></Field>{row.addonType === "traffic_pack" ? <Field><FieldLabel htmlFor="addon-traffic">每份流量（GB）</FieldLabel><Input id="addon-traffic" type="number" min="1" step="1" value={row.addonTrafficGb ?? 100} onChange={event => update({ addonTrafficGb: Number(event.target.value) })} /></Field> : null}{row.addonType === "home_ip" ? <Field className="md:col-span-2"><FieldLabel htmlFor="addon-regions">地区规格</FieldLabel><Textarea id="addon-regions" rows={6} value={(row.addonRegions || []).map(region => region.id + "," + region.name + "," + region.price).join("\n")} onChange={event => update({ addonRegions: event.target.value.split("\n").map(line => { const [id, name, price] = line.split(","); return { id: id?.trim() || "", name: name?.trim() || "", price: Number(price) } }) })} placeholder={"us,美国,40\nuk,英国,40"} /><FieldDescription>每行填写“标识,地区名称,价格”。</FieldDescription></Field> : null}</CardContent></Card> : null}
    {!isService && !isLifetime && !serviceUnlimited ? <Card><CardHeader><CardTitle>流量定制</CardTitle><CardDescription>所有套餐均由 3x-ui 自研线路交付。第 N 档流量为默认流量 × N，价格按当前计费周期原价逐档加价。</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-3"><Field><FieldLabel htmlFor="traffic-base">默认流量（GB / 月）</FieldLabel><Input id="traffic-base" type="number" min="1" step="1" value={row.trafficBaseGb ?? ""} onChange={event => update({ trafficBaseGb: Number(event.target.value) })} /></Field><Field><FieldLabel htmlFor="traffic-tiers">最高档位</FieldLabel><Input id="traffic-tiers" type="number" min="1" max="50" step="1" value={row.trafficMaxTier ?? 10} onChange={event => update({ trafficMaxTier: Number(event.target.value) })} /></Field><Field><FieldLabel htmlFor="traffic-markup">每档加价比例（%）</FieldLabel><Input id="traffic-markup" type="number" min="0" step="1" value={row.trafficTierMarkupPercent ?? 50} onChange={event => update({ trafficTierMarkupPercent: Number(event.target.value) })} /></Field></CardContent></Card> : null}
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除商品？</AlertDialogTitle><AlertDialogDescription>{isService ? `将删除 ${serviceName}。` : `仅删除 ${serviceName}，不会影响同等级的另一项商品。`}此操作无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel><AlertDialogAction className="bg-destructive/10 text-destructive hover:bg-destructive/20" onClick={() => void remove()} disabled={deleting}>{deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}确认删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {!isService && isLifetime ? <Card><CardHeader><CardTitle>交付线路</CardTitle><CardDescription>不限时套餐统一由 3x-ui 自研线路交付，{serviceUnlimited ? "不设置流量额度。" : "并按固定总流量自动配置用户额度。"}</CardDescription></CardHeader></Card> : null}
  </div>
}
