import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { ArrowLeft, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "@/components/features/toast"

import { deleteJson, fetchJson, postJson, putJson } from "@/api"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { DataTable, DataTableColumnHeader, DataTableRowActions } from "@/components/features/arc-data-table"
import { DataTableCard, FilterSelect } from "@/components/features/data-table-card"
import { EmptyState, PageHeader } from "@/components/features/shared"
import { ConfirmDialog } from "@/components/features/confirm-dialog"
import { cn } from "@/lib/utils"
import type { AddonHandler, CatalogV2AddonCategory, CatalogV2CompareAttribute, CatalogV2LineGroup, CatalogV2Period, CatalogV2Product } from "@/types"
import { builtInCompareRows, compareTrafficLabel, networkLevelSummary, regionsSummary, trafficCustomizationSummary } from "@/components/features/plan-compare-rows"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { PageHeader as DetailHeader } from "@/components/arc/blocks/page-header/page-header"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Input } from "@/components/arc/input/input"
import { Select } from "@/components/arc/select/select"
import { Switch } from "@/components/arc/switch/switch"
import { Textarea } from "@/components/arc/textarea/textarea"
import { Card as ArcCard } from "@/components/arc/card/card"
import { MoneyInput } from "@/components/arc/money-input/money-input"
import { NumberField } from "@/components/arc/number-field/number-field"

const GB = 1024 ** 3
const typeLabels = { recurring_plan: "周期性套餐", lifetime_plan: "不限时套餐", addon: "附加服务" } as const
const NO_ADDON_CATEGORY = "none"
// Mirrors ADDON_HANDLERS in commerce/addon-services.js; the server enforces the same rules.
const addonHandlerOptions: Record<AddonHandler, { label: string; description: string; requiresPlan: boolean }> = {
  traffic_credit: { label: "流量包", description: "付款后自动增加当前周期流量，在下次月度流量重置时失效。", requiresPlan: true },
  custom_node: { label: "节点定制", description: "人工交付：在服务交付页为用户绑定定制入站。每份按有效天数计算，从交付起算，到期自动解绑；套餐过期期间保留绑定但无法连接。", requiresPlan: true },
  manual: { label: "人工交付（卡密 / 账号 / 代充值）", description: "付款后进入服务交付队列，由你采购后填写卡密、账号或凭证交付给客户。", requiresPlan: false },
}

function money(cents: number | null) {
  return cents === null ? "未填写" : `¥${(cents / 100).toFixed(2)}`
}

function defaultProduct(): CatalogV2Product {
  return { id: "", type: "recurring_plan", isEnabled: true, isForSale: true, stock: null, sortOrder: 0, name: "", tagline: "", description: "", features: [], compareValues: {}, isRecommended: false, lineGroupId: null, addonCategoryId: null, buyerInputLabel: "", chargeTax: true, vipDiscount: true, durationDays: null, trafficBytes: null, deviceLimit: null, priceCents: null, trafficCustomization: { enabled: false, stepBytes: null, stepPriceCents: null, maxSteps: 10 }, purchaseRequirement: null, fulfillment: { mode: null, handler: null, config: {} }, deliveryDescription: "", serviceDurationDays: null, allowQuantity: true, minQuantity: 1, maxQuantity: null, periods: [] }
}

// Every price in the product editor: a standard-height CNY field without quick-add chips; the value is in cents.
function PriceInput({ label, id, cents, onChange, description }: { label: string; id: string; cents: number | null; onChange: (cents: number | null) => void; description?: string }) {
  // Period prices are stored as 0 when cleared; the field stays empty while the admin retypes instead of jumping to ¥0.00.
  const [cleared, setCleared] = React.useState(false)
  return <MoneyInput size="md" label={label} id={id} value={cleared && !cents ? null : cents} onValueChange={next => { setCleared(next === null); onChange(next) }} currency="CNY" currencies={["CNY"]} quickAdd={[]} locale="zh-CN" description={description} />
}

function nullableNumber(value: string, multiplier = 1) {
  return value === "" ? null : Math.round(Number(value) * multiplier)
}

function FeatureFields({ product, update }: { product: CatalogV2Product; update: (patch: Partial<CatalogV2Product>) => void }) {
  const included = product.features.filter(item => item.isIncluded).map(item => item.label).join("\n")
  const excluded = product.features.filter(item => !item.isIncluded).map(item => item.label).join("\n")
  function setFeatures(value: string, isIncluded: boolean) {
    const other = product.features.filter(item => item.isIncluded !== isIncluded)
    const next = value.split("\n").map(label => label.trim()).filter(Boolean).map((label, index) => ({ label, isIncluded, sortOrder: index * 10 }))
    update({ features: [...other, ...next].map((item, index) => ({ ...item, sortOrder: index * 10 })) })
  }
  return <Card title="商品特点" description="每行填写一项，分别在前端显示为支持和不支持。"><div className="grid items-start gap-4 md:grid-cols-2"><Textarea label="优点" id="catalog-v2-features" rows={6} value={included} onChange={event => setFeatures(event.target.value, true)} /><Textarea label="缺点" id="catalog-v2-limitations" rows={6} value={excluded} onChange={event => setFeatures(event.target.value, false)} /></div></Card>
}

function AddonCategoryManager({ categories, onChange }: { categories: CatalogV2AddonCategory[]; onChange: (categories: CatalogV2AddonCategory[]) => void }) {
  const [drafts, setDrafts] = React.useState<Record<string, { name: string; sortOrder: number }>>({})
  const [newName, setNewName] = React.useState("")
  const [busyId, setBusyId] = React.useState("")
  const [deleting, setDeleting] = React.useState<CatalogV2AddonCategory | null>(null)
  const draftOf = (category: CatalogV2AddonCategory) => drafts[category.id] || { name: category.name, sortOrder: category.sortOrder }
  const sorted = (list: CatalogV2AddonCategory[]) => [...list].sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
  async function create(event: React.FormEvent) {
    event.preventDefault()
    setBusyId("new")
    try {
      const created = await postJson<CatalogV2AddonCategory>("/api/catalog-v2/addon-categories", { name: newName, sortOrder: Math.max(-10, ...categories.map(category => category.sortOrder)) + 10 })
      onChange(sorted([...categories, { ...created, productCount: 0 }]))
      setNewName("")
      toast({ type: "success", title: "分类已添加" })
    } catch (error) { toast({ type: "error", title: error instanceof Error ? error.message : "添加分类失败" }) } finally { setBusyId("") }
  }
  async function save(category: CatalogV2AddonCategory) {
    setBusyId(category.id)
    try {
      const saved = await putJson<CatalogV2AddonCategory>(`/api/catalog-v2/addon-categories/${encodeURIComponent(category.id)}`, draftOf(category))
      onChange(sorted(categories.map(item => item.id === category.id ? { ...item, ...saved } : item)))
      setDrafts(({ [category.id]: _, ...rest }) => rest)
      toast({ type: "success", title: "分类已保存" })
    } catch (error) { toast({ type: "error", title: error instanceof Error ? error.message : "保存分类失败" }) } finally { setBusyId("") }
  }
  // Runs from the confirm dialog; a failure is reported and rethrown so the dialog stays open.
  async function remove(category: CatalogV2AddonCategory) {
    setBusyId(category.id)
    try {
      await deleteJson(`/api/catalog-v2/addon-categories/${encodeURIComponent(category.id)}`)
      onChange(categories.filter(item => item.id !== category.id))
      toast({ type: "success", title: "分类已删除" })
    } catch (error) { toast({ type: "error", title: error instanceof Error ? error.message : "删除分类失败" }); throw error } finally { setBusyId("") }
  }
  return <Card title="附加服务分类" description="用户端按分类分组展示附加服务，排序数字越小越靠前；删除分类后，其中的商品会变为未分类。"><div className="grid gap-4">
    {categories.length ? <div className="grid gap-3">{categories.map(category => {
      const draft = draftOf(category)
      const changed = draft.name !== category.name || draft.sortOrder !== category.sortOrder
      const update = (patch: Partial<typeof draft>) => setDrafts(current => ({ ...current, [category.id]: { ...draft, ...patch } }))
      return <ArcCard key={category.id} className="flex-wrap" description={category.productCount ? `${category.productCount} 个商品` : "暂无商品"} headerAction={<><ActionButton variant="secondary" onClick={() => void save(category)} disabled={!changed || !draft.name.trim() || busyId === category.id} aria-label={`保存分类 ${category.name}`} label="保存分类" pending={busyId === category.id} /><Button variant="danger" size="icon" onClick={() => setDeleting(category)} disabled={busyId === category.id} aria-label={`删除分类 ${category.name}`}><Trash2 /></Button></>}><div className="flex flex-wrap items-center gap-2"><Input label={`${category.name} 分类名称`} hideLabel className="min-w-0 flex-1 basis-40" value={draft.name} maxLength={40} onChange={event => update({ name: event.target.value })} /><Input label={`${category.name} 排序`} hideLabel className="w-24 tabular-nums" type="number" min="0" value={draft.sortOrder} onChange={event => update({ sortOrder: Number(event.target.value) })} /></div></ArcCard>
    })}</div> : <EmptyState title="尚未创建分类" description="创建分类后，可在附加服务商品中选择所属分类。" />}
    <form className="flex flex-wrap items-end gap-2" onSubmit={event => void create(event)}><div className="flex-1 basis-56"><Input label="新分类名称" id="addon-category-name" value={newName} maxLength={40} onChange={event => setNewName(event.target.value)} placeholder="例如：流量加油包" /></div><ActionButton type="submit" disabled={!newName.trim() || busyId === "new"} label="添加分类" pending={busyId === "new"} /></form>
    <ConfirmDialog open={deleting !== null} onOpenChange={open => { if (!open) setDeleting(null) }} title={`删除分类「${deleting?.name ?? ""}」？`} description={deleting?.productCount ? `其中 ${deleting.productCount} 个商品会变为未分类。` : "删除后不能恢复。"} onConfirm={() => deleting ? remove(deleting) : undefined} />
  </div></Card>
}

const compareKindLabels: Record<CatalogV2CompareAttribute["kind"], string> = { choice: "选项", boolean: "支持 / 不支持", text: "文字" }
const compareKindOptions = Object.entries(compareKindLabels).map(([value, label]) => ({ value, label }))
const splitCompareOptions = (value: string) => value.split(/[、,，\n]/).map(option => option.trim()).filter(Boolean)
type CompareAttributeDraft = { label: string; kind: CatalogV2CompareAttribute["kind"]; options: string; sortOrder: number }

function CompareAttributeManager({ attributes, onChange }: { attributes: CatalogV2CompareAttribute[]; onChange: (attributes: CatalogV2CompareAttribute[]) => void }) {
  const emptyDraft: CompareAttributeDraft = { label: "", kind: "choice", options: "", sortOrder: 0 }
  const [drafts, setDrafts] = React.useState<Record<string, CompareAttributeDraft>>({})
  const [newDraft, setNewDraft] = React.useState(emptyDraft)
  const [busyId, setBusyId] = React.useState("")
  const [deletingAttribute, setDeletingAttribute] = React.useState<CatalogV2CompareAttribute | null>(null)
  const draftOf = (attribute: CatalogV2CompareAttribute): CompareAttributeDraft => drafts[attribute.id] || { label: attribute.label, kind: attribute.kind, options: attribute.options.join("、"), sortOrder: attribute.sortOrder }
  const payloadOf = (draft: CompareAttributeDraft) => ({ label: draft.label, kind: draft.kind, options: draft.kind === "choice" ? splitCompareOptions(draft.options) : [], sortOrder: draft.sortOrder })
  const sorted = (list: CatalogV2CompareAttribute[]) => [...list].sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
  async function create(event: React.FormEvent) {
    event.preventDefault()
    setBusyId("new")
    try {
      const created = await postJson<CatalogV2CompareAttribute>("/api/catalog-v2/compare-attributes", payloadOf({ ...newDraft, sortOrder: Math.max(0, ...attributes.map(attribute => attribute.sortOrder)) + 10 }))
      onChange(sorted([...attributes, created]))
      setNewDraft(emptyDraft)
      toast({ type: "success", title: "对比项已添加", description: "已启用的周期性套餐需要补填该项后才能再次保存。" })
    } catch (error) { toast({ type: "error", title: error instanceof Error ? error.message : "添加对比项失败" }) } finally { setBusyId("") }
  }
  async function save(attribute: CatalogV2CompareAttribute) {
    setBusyId(attribute.id)
    try {
      const saved = await putJson<CatalogV2CompareAttribute>(`/api/catalog-v2/compare-attributes/${encodeURIComponent(attribute.id)}`, payloadOf(draftOf(attribute)))
      onChange(sorted(attributes.map(item => item.id === attribute.id ? saved : item)))
      setDrafts(({ [attribute.id]: _, ...rest }) => rest)
      toast({ type: "success", title: "对比项已保存" })
    } catch (error) { toast({ type: "error", title: error instanceof Error ? error.message : "保存对比项失败" }) } finally { setBusyId("") }
  }
  // Runs from the confirm dialog; a failure is reported and rethrown so the dialog stays open.
  async function remove(attribute: CatalogV2CompareAttribute) {
    setBusyId(attribute.id)
    try {
      await deleteJson(`/api/catalog-v2/compare-attributes/${encodeURIComponent(attribute.id)}`)
      onChange(attributes.filter(item => item.id !== attribute.id))
      toast({ type: "success", title: "对比项已删除" })
    } catch (error) { toast({ type: "error", title: error instanceof Error ? error.message : "删除对比项失败" }); throw error } finally { setBusyId("") }
  }
  // name is the row's current label, used for the visually hidden field labels on existing rows; the new-row form shows its labels.
  const draftFields = (draft: CompareAttributeDraft, update: (patch: Partial<CompareAttributeDraft>) => void, prefix: string, name?: string) => <>
    <Input label={name ? `${name} 名称` : "对比项名称"} hideLabel={Boolean(name)} id={`${prefix}-label`} className="min-w-0 flex-1 basis-40" value={draft.label} maxLength={30} onChange={event => update({ label: event.target.value })} placeholder="例如：流媒体解锁" />
    {/* Select sizes its outer field, not the trigger, so the width goes on a wrapper. */}
    <div className="w-40 shrink-0"><Select label={name ? `${name} 类型` : "类型"} hideLabel={Boolean(name)} id={`${prefix}-kind`} value={draft.kind} onValueChange={kind => update({ kind: kind as CompareAttributeDraft["kind"] })} options={compareKindOptions} /></div>
    {draft.kind === "choice" ? <Input label={name ? `${name} 选项` : "选项（用顿号或逗号分隔）"} hideLabel={Boolean(name)} id={`${prefix}-options`} className="min-w-0 flex-1 basis-56" value={draft.options} onChange={event => update({ options: event.target.value })} placeholder="不支持、基础、全部" /> : null}
  </>
  return <Card title="套餐对比项" description="周期性套餐对比页里，每月流量、在线IP、流量加购、可用地区、线路等级会根据商品数据自动显示；这里配置额外的对比行。每一行都会出现在所有周期性套餐的编辑页，启用的套餐必须填写。"><div className="grid gap-4">
    {attributes.length ? <div className="grid gap-3">{attributes.map(attribute => {
      const draft = draftOf(attribute)
      const changed = JSON.stringify(payloadOf(draft)) !== JSON.stringify(payloadOf({ label: attribute.label, kind: attribute.kind, options: attribute.options.join("、"), sortOrder: attribute.sortOrder }))
      const update = (patch: Partial<CompareAttributeDraft>) => setDrafts(current => ({ ...current, [attribute.id]: { ...draft, ...patch } }))
      return <ArcCard key={attribute.id} className="flex-wrap" description={compareKindLabels[attribute.kind]} headerAction={<><ActionButton variant="secondary" onClick={() => void save(attribute)} disabled={!changed || !draft.label.trim() || busyId === attribute.id} aria-label={`保存对比项 ${attribute.label}`} label="保存对比项" pending={busyId === attribute.id} /><Button variant="danger" size="icon" onClick={() => setDeletingAttribute(attribute)} disabled={busyId === attribute.id} aria-label={`删除对比项 ${attribute.label}`}><Trash2 /></Button></>}><div className="flex flex-wrap items-center gap-2">
        {draftFields(draft, update, `compare-${attribute.id}`, attribute.label)}
        <Input label={`${attribute.label} 排序`} hideLabel className="w-24 tabular-nums" type="number" min="0" value={draft.sortOrder} onChange={event => update({ sortOrder: Number(event.target.value) })} />
      </div></ArcCard>
    })}</div> : <EmptyState title="尚未配置对比项" description="添加后，对比页会在自动生成的行之后显示这些行。" />}
    <form className="flex flex-wrap items-end gap-2" onSubmit={event => void create(event)}>{draftFields(newDraft, patch => setNewDraft(current => ({ ...current, ...patch })), "compare-new")}<ActionButton type="submit" disabled={!newDraft.label.trim() || (newDraft.kind === "choice" && splitCompareOptions(newDraft.options).length < 2) || busyId === "new"} label="添加对比项" pending={busyId === "new"} /></form>
    <ConfirmDialog open={deletingAttribute !== null} onOpenChange={open => { if (!open) setDeletingAttribute(null) }} title={`删除对比项「${deletingAttribute?.label ?? ""}」？`} description="对比页将不再显示这一行，商品里已填写的值会在下次保存时清除。" onConfirm={() => deletingAttribute ? remove(deletingAttribute) : undefined} />
  </div></Card>
}

// Every comparison row for one recurring plan: the rows derived from product data are previewed read-only,
// the configured rows are edited here.
function CompareFields({ product, update, attributes, group }: { product: CatalogV2Product; update: (patch: Partial<CatalogV2Product>) => void; attributes: CatalogV2CompareAttribute[]; group?: CatalogV2LineGroup }) {
  const periods = product.periods.filter(period => period.isEnabled).toSorted((left, right) => left.durationDays - right.durationDays)
  const perPeriod = (format: (period: CatalogV2Period) => string) => periods.length ? periods.map(period => `${period.durationDays} 天 ${format(period)}`).join(" · ") : "未启用周期"
  const preview = (value: string | boolean | null, empty: string) => value === false ? "不支持" : value || empty
  const derived: Record<typeof builtInCompareRows[number]["id"], string> = {
    traffic: perPeriod(period => compareTrafficLabel(period.trafficBytes)),
    devices: perPeriod(period => String(period.deviceLimit)),
    "traffic-addon": preview(trafficCustomizationSummary(product), "不支持"),
    regions: preview(regionsSummary(group?.coverage), group ? "权限组的入站未填写地区" : "未选择线路权限组"),
    "network-level": preview(networkLevelSummary(group?.coverage), group ? "权限组的入站未填写线路等级" : "未选择线路权限组"),
  }
  const setValue = (id: string, value: string) => update({ compareValues: { ...product.compareValues, [id]: value } })
  return <Card title="套餐对比" description={<>对比页的每一行。自动生成的行来自周期规格、流量定制和线路权限组；其余行在<Link className="underline underline-offset-4" to="/catalog-v2">商品管理</Link>页的「套餐对比项」中配置。</>}><div className="grid gap-6">
    <dl className="grid gap-3 text-sm md:grid-cols-2">{builtInCompareRows.map(row => <div key={row.id} className="grid gap-1"><dt className="text-muted-foreground">{row.label}</dt><dd className="tabular-nums">{derived[row.id]}</dd></div>)}</dl>
    <Separator />
    {attributes.length ? <div className="grid items-start gap-4 md:grid-cols-2">{attributes.map(attribute => {
      const id = `catalog-v2-compare-${attribute.id}`
      const value = product.compareValues[attribute.id] || ""
      const invalid = attribute.kind === "choice" && value && !attribute.options.includes(value)
      const description = invalid ? `原值「${value}」已不在选项中，请重新选择。` : undefined
      if (attribute.kind === "text") return <Input key={attribute.id} label={attribute.label} id={id} required={product.isEnabled} maxLength={60} value={value} onChange={event => setValue(attribute.id, event.target.value)} />
      const options = attribute.kind === "boolean" ? [{ value: "yes", label: "支持" }, { value: "no", label: "不支持" }] : attribute.options.map(option => ({ value: option, label: option }))
      return <Select key={attribute.id} label={attribute.label} description={description} id={id} className="w-full" value={invalid ? "" : value} onValueChange={next => setValue(attribute.id, next)} options={options} />
    })}</div> : <p className="text-sm text-muted-foreground">尚未配置额外的对比项。</p>}
  </div></Card>
}

const ALL = "all"
const statusOptions = [{ value: ALL, label: "全部状态" }, { value: "enabled", label: "启用" }, { value: "disabled", label: "停用" }]
const saleOptions = [{ value: ALL, label: "全部渠道" }, { value: "sale", label: "对外销售" }, { value: "admin", label: "仅管理员授予" }]
const vipOptions = [{ value: ALL, label: "全部" }, { value: "yes", label: "享受" }, { value: "no", label: "不享受" }]

function matchesCommonFilters(product: CatalogV2Product, filters: { status: string; sale: string; vip: string }) {
  return (filters.status === ALL || (filters.status === "enabled") === product.isEnabled)
    && (filters.sale === ALL || (filters.sale === "sale") === product.isForSale)
    && (filters.vip === ALL || (filters.vip === "yes") === product.vipDiscount)
}

// Lowest enabled period price for recurring plans, the fixed price otherwise.
function productPriceLabel(product: CatalogV2Product) {
  if (product.type !== "recurring_plan") return money(product.priceCents)
  const prices = product.periods.filter(period => period.isEnabled).map(period => period.priceCents)
  return prices.length ? `${money(Math.min(...prices))} 起` : "无启用周期"
}

function productPeriodsLabel(product: CatalogV2Product) {
  if (product.type === "lifetime_plan") return "永久"
  return product.periods.length ? product.periods.toSorted((left, right) => left.durationDays - right.durationDays).map(period => period.durationDays).join(" / ") : "未添加周期"
}

function ProductStatusBadges({ product }: { product: CatalogV2Product }) {
  return <div className="flex flex-wrap gap-1">{product.isEnabled ? <Badge tone="success">启用</Badge> : <Badge>停用</Badge>}{product.isForSale ? <Badge>销售</Badge> : <Badge>仅管理员授予</Badge>}</div>
}

function EditProductButton({ product }: { product: CatalogV2Product }) {
  return <Button asChild variant="ghost" size="icon"><Link to={`/catalog-v2/products/${encodeURIComponent(product.id)}`} aria-label={`编辑 ${product.name}`}><Pencil /></Link></Button>
}

function ProductMobileItem({ product, details }: { product: CatalogV2Product; details: string }) {
  return <ArcCard title={<><span className="break-all">{product.name}</span><ProductStatusBadges product={product} /></>} description={`${product.id} · ${details}`} headerAction={<><EditProductButton product={product} /></>} />
}

function productNameColumn(): ColumnDef<CatalogV2Product> {
  return { id: "name", accessorFn: product => `${product.name} ${product.id}`, header: DataTableColumnHeader({ title: "商品" }), meta: { label: "商品" }, cell: ({ row }) => <div className="grid"><span className="font-medium whitespace-nowrap">{row.original.name}</span><span className="text-xs whitespace-nowrap text-muted-foreground">{row.original.id}</span></div> }
}

function productSharedColumns(): ColumnDef<CatalogV2Product>[] {
  return [
    { id: "price", accessorFn: product => product.type === "recurring_plan" ? Math.min(...product.periods.filter(period => period.isEnabled).map(period => period.priceCents), Infinity) : product.priceCents ?? Infinity, header: DataTableColumnHeader({ title: "价格" }), meta: { label: "价格" }, cell: ({ row }) => <span className="tabular-nums">{productPriceLabel(row.original)}</span> },
    { id: "stock", accessorFn: product => product.stock ?? Infinity, header: DataTableColumnHeader({ title: "库存" }), meta: { label: "库存" }, cell: ({ row }) => <span className="tabular-nums">{row.original.stock === null ? "不限" : row.original.stock}</span> },
    { id: "status", accessorFn: product => `${product.isEnabled ? "启用" : "停用"} ${product.isForSale ? "销售" : "仅管理员授予"}`, header: DataTableColumnHeader({ title: "状态" }), meta: { label: "状态" }, cell: ({ row }) => <ProductStatusBadges product={row.original} /> },
    { accessorKey: "sortOrder", header: DataTableColumnHeader({ title: "排序" }), meta: { label: "排序" }, cell: ({ row }) => <span className="tabular-nums">{row.original.sortOrder}</span> },
    { id: "actions", header: "操作", cell: ({ row }) => <DataTableRowActions detail={<EditProductButton product={row.original} />} />, enableHiding: false, enableSorting: false },
  ]
}

function PlanProductsTable({ products, groups }: { products: CatalogV2Product[]; groups: CatalogV2LineGroup[] }) {
  const [filters, setFilters] = React.useState({ type: ALL, group: ALL, status: ALL, sale: ALL, vip: ALL })
  const setFilter = (key: keyof typeof filters) => (value: string) => setFilters(current => ({ ...current, [key]: value }))
  const rows = React.useMemo(() => products.filter(product => product.type !== "addon" && (filters.type === ALL || product.type === filters.type) && (filters.group === ALL || product.lineGroupId === filters.group) && matchesCommonFilters(product, filters)), [filters, products])
  const columns = React.useMemo<ColumnDef<CatalogV2Product>[]>(() => {
    const [price, ...rest] = productSharedColumns()
    return [
      productNameColumn(),
      { accessorKey: "type", header: DataTableColumnHeader({ title: "类型" }), meta: { label: "类型" }, cell: ({ row }) => <Badge>{typeLabels[row.original.type]}</Badge> },
      { id: "periods", accessorFn: productPeriodsLabel, header: DataTableColumnHeader({ title: "周期" }), meta: { label: "周期" }, enableSorting: false, cell: ({ row }) => <span className="tabular-nums">{productPeriodsLabel(row.original)}</span> },
      price,
      ...rest,
    ]
  }, [])
  return <section className="grid gap-3" aria-labelledby="catalog-v2-plans-title">
    <h2 id="catalog-v2-plans-title" className="font-semibold">套餐</h2>
    <DataTableCard filters={<>
      <FilterSelect id="plan-type-filter" label="类型" value={filters.type} onValueChange={setFilter("type")} options={[{ value: ALL, label: "全部类型" }, { value: "recurring_plan", label: typeLabels.recurring_plan }, { value: "lifetime_plan", label: typeLabels.lifetime_plan }]} />
      <FilterSelect id="plan-group-filter" label="线路权限组" value={filters.group} onValueChange={setFilter("group")} options={[{ value: ALL, label: "全部权限组" }, ...groups.map(group => ({ value: group.id, label: group.name }))]} />
      <FilterSelect id="plan-status-filter" label="状态" value={filters.status} onValueChange={setFilter("status")} options={statusOptions} />
      <FilterSelect id="plan-sale-filter" label="销售渠道" value={filters.sale} onValueChange={setFilter("sale")} options={saleOptions} />
      <FilterSelect id="plan-vip-filter" label="VIP 折扣" value={filters.vip} onValueChange={setFilter("vip")} options={vipOptions} />
    </>}><DataTable columns={columns} data={rows} searchKey="name" stateKey="plans" searchPlaceholder="搜索套餐名称或 ID" emptyTitle="暂无套餐" emptyDescription="没有符合当前筛选条件的套餐" frame="card" columnLayout="content" renderMobileItem={product => <ProductMobileItem product={product} details={`${typeLabels[product.type]} · ${productPriceLabel(product)}`} />} /></DataTableCard>
  </section>
}

function AddonProductsTable({ products, categories }: { products: CatalogV2Product[]; categories: CatalogV2AddonCategory[] }) {
  const [filters, setFilters] = React.useState({ category: ALL, handler: ALL, status: ALL, sale: ALL, vip: ALL })
  const setFilter = (key: keyof typeof filters) => (value: string) => setFilters(current => ({ ...current, [key]: value }))
  const categoryName = React.useCallback((id: string | null) => categories.find(category => category.id === id)?.name || "未分类", [categories])
  const rows = React.useMemo(() => products.filter(product => product.type === "addon" && (filters.category === ALL || (product.addonCategoryId || NO_ADDON_CATEGORY) === filters.category) && (filters.handler === ALL || (product.fulfillment.handler || "manual") === filters.handler) && matchesCommonFilters(product, filters)), [filters, products])
  const columns = React.useMemo<ColumnDef<CatalogV2Product>[]>(() => [
    productNameColumn(),
    { id: "category", accessorFn: product => categoryName(product.addonCategoryId), header: DataTableColumnHeader({ title: "分类" }), meta: { label: "分类" } },
    { id: "handler", accessorFn: product => addonHandlerOptions[product.fulfillment.handler || "manual"].label, header: DataTableColumnHeader({ title: "服务类型" }), meta: { label: "服务类型" } },
    ...productSharedColumns(),
  ], [categoryName])
  return <section className="grid gap-3" aria-labelledby="catalog-v2-addons-title">
    <h2 id="catalog-v2-addons-title" className="font-semibold">附加服务</h2>
    <DataTableCard filters={<>
      <FilterSelect id="addon-category-filter" label="分类" value={filters.category} onValueChange={setFilter("category")} options={[{ value: ALL, label: "全部分类" }, ...categories.map(category => ({ value: category.id, label: category.name })), { value: NO_ADDON_CATEGORY, label: "未分类" }]} />
      <FilterSelect id="addon-handler-filter" label="服务类型" value={filters.handler} onValueChange={setFilter("handler")} options={[{ value: ALL, label: "全部服务类型" }, ...Object.entries(addonHandlerOptions).map(([value, item]) => ({ value, label: item.label }))]} />
      <FilterSelect id="addon-status-filter" label="状态" value={filters.status} onValueChange={setFilter("status")} options={statusOptions} />
      <FilterSelect id="addon-sale-filter" label="销售渠道" value={filters.sale} onValueChange={setFilter("sale")} options={saleOptions} />
      <FilterSelect id="addon-vip-filter" label="VIP 折扣" value={filters.vip} onValueChange={setFilter("vip")} options={vipOptions} />
    </>}><DataTable columns={columns} data={rows} searchKey="name" stateKey="addons" searchPlaceholder="搜索附加服务名称或 ID" emptyTitle="暂无附加服务" emptyDescription="没有符合当前筛选条件的附加服务" frame="card" columnLayout="content" renderMobileItem={product => <ProductMobileItem product={product} details={`${categoryName(product.addonCategoryId)} · ${productPriceLabel(product)}`} />} /></DataTableCard>
  </section>
}

export function CatalogV2ProductsPage() {
  const [products, setProducts] = React.useState<CatalogV2Product[] | null>(null)
  const [categories, setCategories] = React.useState<CatalogV2AddonCategory[]>([])
  const [groups, setGroups] = React.useState<CatalogV2LineGroup[]>([])
  const [compareAttributes, setCompareAttributes] = React.useState<CatalogV2CompareAttribute[]>([])
  const [error, setError] = React.useState("")
  React.useEffect(() => { Promise.all([fetchJson<CatalogV2Product[]>("/api/catalog-v2/products"), fetchJson<CatalogV2AddonCategory[]>("/api/catalog-v2/addon-categories"), fetchJson<CatalogV2LineGroup[]>("/api/catalog-v2/line-groups"), fetchJson<CatalogV2CompareAttribute[]>("/api/catalog-v2/compare-attributes")]).then(([rows, addonCategories, lineGroups, attributes]) => { setProducts(rows); setCategories(addonCategories); setGroups(lineGroups); setCompareAttributes(attributes) }).catch(error => setError(error.message)) }, [])
  if (!products && !error) return <div className="grid gap-4 px-4 lg:px-6"><Skeleton lines={3} /><Skeleton lines={6} /></div>
  return <div className="grid gap-4 px-4 lg:px-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><PageHeader title="商品管理" description="V2 商品是商城展示、支付、交付和线路权限的唯一数据源。" /><Button asChild><Link to="/catalog-v2/products/new"><Plus />新建商品</Link></Button></div>
    {error ? <Alert tone="danger" title={error} /> : null}
    {products ? <>
      <PlanProductsTable products={products} groups={groups} />
      <AddonProductsTable products={products} categories={categories} />
      <AddonCategoryManager categories={categories} onChange={setCategories} />
      <CompareAttributeManager attributes={compareAttributes} onChange={setCompareAttributes} />
    </> : null}
  </div>
}
function AddonFields({ product, update, categories }: { product: CatalogV2Product; update: (patch: Partial<CatalogV2Product>) => void; categories: CatalogV2AddonCategory[] }) {
  const handler = product.fulfillment.handler || "manual"
  const option = addonHandlerOptions[handler]
  function selectHandler(value: string) {
    const next = value as AddonHandler
    update({
      fulfillment: { mode: next === "traffic_credit" ? "automatic" : "manual", handler: next, config: next === "traffic_credit" ? product.fulfillment.config : {} },
      purchaseRequirement: addonHandlerOptions[next].requiresPlan ? "requires_recurring_plan" : product.purchaseRequirement,
      serviceDurationDays: next === "traffic_credit" ? null : next === "custom_node" ? product.serviceDurationDays ?? 30 : product.serviceDurationDays,
    })
  }
  return <Card title="附加服务" description="交付配置会在创建订单时复制到订单快照。"><div className="grid items-start gap-4 md:grid-cols-2">
    <div className="md:col-span-2"><Select label="服务类型" description={option.description} value={handler} onValueChange={selectHandler} id="catalog-v2-addon-handler" className="w-full" options={[...Object.entries(addonHandlerOptions).map(([value, item]) => ({ value: value, label: item.label }))]} /></div>
    <Field><FieldLabel htmlFor="catalog-v2-addon-category">分类</FieldLabel><Select label="选择" hideLabel value={product.addonCategoryId || NO_ADDON_CATEGORY} onValueChange={value => update({ addonCategoryId: value === NO_ADDON_CATEGORY ? null : value })} id="catalog-v2-addon-category" className="w-full" options={[{ value: NO_ADDON_CATEGORY, label: "未分类" }, ...categories.map(category => ({ value: category.id, label: category.name }))]} /><FieldDescription>分类在<Link className="underline underline-offset-4" to="/catalog-v2">商品管理</Link>页维护，用于用户端分组展示。</FieldDescription></Field>
    <PriceInput label="价格" id="catalog-v2-addon-price" cents={product.priceCents} onChange={priceCents => update({ priceCents })} />
    <Field><FieldLabel htmlFor="catalog-v2-addon-requirement">购买要求</FieldLabel><Select label="选择" hideLabel value={product.purchaseRequirement || "standalone"} disabled={option.requiresPlan} onValueChange={purchaseRequirement => update({ purchaseRequirement: purchaseRequirement as CatalogV2Product["purchaseRequirement"] })} id="catalog-v2-addon-requirement" className="w-full" options={[{ value: "standalone", label: "可直接购买" }, { value: "requires_recurring_plan", label: "需要有效周期套餐" }]} />{option.requiresPlan ? <FieldDescription>该服务类型必须持有有效的周期性套餐。</FieldDescription> : null}</Field>
    {handler === "traffic_credit" ? <Input label="每份流量（GB）" id="catalog-v2-addon-traffic" type="number" min="1" value={product.fulfillment.config.trafficBytes ? product.fulfillment.config.trafficBytes / GB : ""} onChange={event => update({ fulfillment: { ...product.fulfillment, config: { trafficBytes: nullableNumber(event.target.value, GB) || undefined } } })} />
      : <Input label={handler === "custom_node" ? "每份有效天数" : "服务有效天数"} description={handler === "custom_node" ? "购买多份时按份数累加。" : "填写后从交付起算，到期显示为已过期。"} id="catalog-v2-addon-days" type="number" min="1" required={handler === "custom_node"} value={product.serviceDurationDays ?? ""} onChange={event => update({ serviceDurationDays: nullableNumber(event.target.value) })} placeholder={handler === "custom_node" ? "30" : "留空表示一次性交付"} />}
    <Input label="下单必填信息" description="填写后客户结账时必须填写该项，内容显示在服务交付页；留空表示无需填写。" id="catalog-v2-addon-input" maxLength={30} value={product.buyerInputLabel} onChange={event => update({ buyerInputLabel: event.target.value })} placeholder="例如：充值账号" />
    <Input label="最大购买数量" id="catalog-v2-addon-max" type="number" min="1" value={product.maxQuantity ?? ""} onChange={event => update({ maxQuantity: nullableNumber(event.target.value) })} placeholder="留空表示只受库存限制" />
    <div className="md:col-span-2"><Textarea label="交付说明" id="catalog-v2-addon-delivery" value={product.deliveryDescription} onChange={event => update({ deliveryDescription: event.target.value })} placeholder="展示给客户的交付时效与方式，例如：付款后 24 小时内人工交付" /></div>
  </div></Card>
}

// A switch with its label (and optional description) to the right, top-aligned so rows line up in a grid.
function SwitchField({ id, label, description, checked, onCheckedChange, className }: { id: string; label: string; description?: React.ReactNode; checked: boolean; onCheckedChange: (checked: boolean) => void; className?: string }) {
  return <Field orientation="horizontal" className={cn("items-start", className)}><Switch id={id} checked={checked} onCheckedChange={onCheckedChange} /><FieldContent><FieldLabel htmlFor={id}>{label}</FieldLabel>{description ? <FieldDescription>{description}</FieldDescription> : null}</FieldContent></Field>
}

function PeriodEditor({ period, index, onChange, onRemove }: { period: CatalogV2Period; index: number; onChange: (value: CatalogV2Period) => void; onRemove: () => void }) {
  const fieldId = (name: string) => `catalog-v2-period-${index}-${name}`
  return <Card title={`周期 ${index + 1}`} description="周期标识根据时长自动生成。" headerAction={<Button variant="danger" size="icon" onClick={onRemove} aria-label={`删除周期 ${index + 1}`}><Trash2 /></Button>}><div className="grid items-start gap-4 md:grid-cols-3">
    <Input label="周期标识" id={fieldId("id")} value={period.id} readOnly />
    <NumberField label="时长（天）" id={fieldId("days")} value={period.durationDays || 0} onValueChange={next => { const durationDays = next; onChange({ ...period, id: durationDays ? `${durationDays}d` : "", durationDays }) }} locale="zh-CN" min={1} />
    <NumberField label="排序" id={fieldId("sort")} value={period.sortOrder} onValueChange={next => onChange({ ...period, sortOrder: next })} locale="zh-CN" min={0} />
    <Input label="默认流量（GB）" id={fieldId("traffic")} type="number" min="0" value={period.trafficBytes === null ? "" : period.trafficBytes / GB} onChange={event => onChange({ ...period, trafficBytes: nullableNumber(event.target.value, GB) })} placeholder="留空表示无限" />
    <NumberField label="在线IP数量" id={fieldId("devices")} value={period.deviceLimit} onValueChange={next => onChange({ ...period, deviceLimit: next })} locale="zh-CN" min={0} />
    <PriceInput label="价格" id={fieldId("price")} cents={period.priceCents} onChange={priceCents => onChange({ ...period, priceCents: priceCents ?? 0 })} />
    <SwitchField className="md:col-span-3" id={fieldId("enabled")} label="启用该周期" checked={period.isEnabled} onCheckedChange={isEnabled => onChange({ ...period, isEnabled })} />
  </div></Card>
}

export function CatalogV2ProductDetailPage() {
  const { id = "new" } = useParams()
  const isNew = id === "new"
  const navigate = useNavigate()
  const [product, setProduct] = React.useState<CatalogV2Product | null>(isNew ? defaultProduct() : null)
  const [groups, setGroups] = React.useState<CatalogV2LineGroup[]>([])
  const [addonCategories, setAddonCategories] = React.useState<CatalogV2AddonCategory[]>([])
  const [compareAttributes, setCompareAttributes] = React.useState<CatalogV2CompareAttribute[]>([])
  const [saving, setSaving] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [error, setError] = React.useState("")
  React.useEffect(() => { Promise.all([fetchJson<CatalogV2Product[]>("/api/catalog-v2/products"), fetchJson<CatalogV2LineGroup[]>("/api/catalog-v2/line-groups"), fetchJson<CatalogV2AddonCategory[]>("/api/catalog-v2/addon-categories"), fetchJson<CatalogV2CompareAttribute[]>("/api/catalog-v2/compare-attributes")]).then(([products, lineGroups, categories, attributes]) => { setGroups(lineGroups); setAddonCategories(categories); setCompareAttributes(attributes); if (!isNew) setProduct(products.find(item => item.id === id) || null) }).catch(error => setError(error.message)) }, [id, isNew])
  function update(patch: Partial<CatalogV2Product>) { setProduct(current => current ? { ...current, ...patch } : current) }
  async function save() {
    if (!product) return
    setSaving(true)
    try {
      const saved = isNew ? await postJson<CatalogV2Product>("/api/catalog-v2/products", product) : await putJson<CatalogV2Product>(`/api/catalog-v2/products/${encodeURIComponent(id)}`, product)
      toast({ type: "success", title: "V2 商品已保存" })
      if (isNew) navigate(`/catalog-v2/products/${encodeURIComponent(saved.id)}`, { replace: true }); else setProduct(saved)
    } catch (error) { toast({ type: "error", title: error instanceof Error ? error.message : "保存失败" }) } finally { setSaving(false) }
  }
  // Runs from the confirm dialog; a failure is reported and rethrown so the dialog stays open.
  async function remove() { if (!product || isNew) return; setSaving(true); try { await deleteJson(`/api/catalog-v2/products/${encodeURIComponent(id)}`); navigate("/catalog-v2", { replace: true }); toast({ type: "success", title: "商品已删除" }) } catch (error) { toast({ type: "error", title: error instanceof Error ? error.message : "删除失败" }); throw error } finally { setSaving(false) } }
  if (error) return <div className="px-4 lg:px-6"><Alert tone="danger" title={error} /></div>
  if (!product) return <div className="px-4 lg:px-6"><EmptyState title="商品不存在" description="返回新版商品录入重新选择。" /></div>
  const updatePeriod = (index: number, value: CatalogV2Period) => update({ periods: product.periods.map((period, current) => current === index ? value : period) })
  return <div className="grid gap-4 px-4 lg:px-6">
    <DetailHeader
      breadcrumbs={[{ label: "商品管理", href: "/catalog-v2", onClick: event => { event.preventDefault(); navigate("/catalog-v2") } }, { label: isNew ? "新建 V2 商品" : product.name }]}
      title={isNew ? "新建 V2 商品" : product.name}
      description="保存后会直接用于商城、支付交付和 3x-ui 权限同步。"
      actions={<><Button variant="secondary" asChild><Link to="/catalog-v2"><ArrowLeft />返回</Link></Button>{isNew ? null : <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={saving}><Trash2 />删除</Button>}<ActionButton onClick={() => void save()} label="保存商品" pending={saving} /></>}
    />
    <Card title="基础信息" description="商品 ID 创建后不可修改，只允许小写字母、数字和短横线。"><div className="grid gap-6">
      <div className="grid items-start gap-4 md:grid-cols-2">
        <Input label="商品 ID" id="catalog-v2-id" value={product.id} disabled={!isNew} onChange={event => update({ id: event.target.value.toLowerCase() })} placeholder="example-product" />
        <Select label="商品类型" value={product.type} disabled={!isNew} onValueChange={type => update({ ...defaultProduct(), id: product.id, name: product.name, type: type as CatalogV2Product["type"], vipDiscount: type !== "addon" })} id="catalog-v2-type" className="w-full" options={[...Object.entries(typeLabels).map(([value, label]) => ({ value: value, label: label }))]} />
        <div className="md:col-span-2"><Input label="商品名称" id="catalog-v2-name" value={product.name} onChange={event => update({ name: event.target.value })} /></div>
        {product.type === "addon" ? null : <div className="md:col-span-2"><Input label="一句话简介" description="显示在对比页套餐名称下方，最多 40 字；留空时显示商品描述。" id="catalog-v2-tagline" maxLength={40} value={product.tagline} onChange={event => update({ tagline: event.target.value })} placeholder="例如：适合轻量网页浏览和社交软件" /></div>}
        <NumberField label="排序" id="catalog-v2-sort" value={product.sortOrder} onValueChange={next => update({ sortOrder: next })} locale="zh-CN" min={0} />
        <Input label="库存" id="catalog-v2-stock" type="number" min="0" value={product.stock ?? ""} onChange={event => update({ stock: nullableNumber(event.target.value) })} placeholder="留空表示不限库存" />
        <div className="md:col-span-2"><Textarea label="商品描述" id="catalog-v2-description" value={product.description} onChange={event => update({ description: event.target.value })} /></div>
      </div>
      <Separator />
      <div className="grid items-start gap-4 md:grid-cols-2">
        <SwitchField id="catalog-v2-enabled" label="启用商品" checked={product.isEnabled} onCheckedChange={isEnabled => update({ isEnabled })} />
        <SwitchField id="catalog-v2-for-sale" label="对外销售" description="关闭后仅管理员可授予。" checked={product.isForSale} onCheckedChange={isForSale => update({ isForSale })} />
        <SwitchField id="catalog-v2-charge-tax" label="收取税费" description="按支付设置中的税率计税；关闭则该商品免税。" checked={product.chargeTax} onCheckedChange={chargeTax => update({ chargeTax })} />
        <SwitchField id="catalog-v2-vip-discount" label="享受 VIP 折扣" description="开启后按客户 VIP 等级打折，在优惠码之后、税费之前计算。" checked={product.vipDiscount} onCheckedChange={vipDiscount => update({ vipDiscount })} />
        {product.type === "addon" ? null : <SwitchField id="catalog-v2-recommended" label="推荐商品" checked={product.isRecommended} onCheckedChange={isRecommended => update({ isRecommended })} />}
      </div>
    </div></Card>
    {product.type !== "addon" ? <Card title="线路权限" description="必须先创建并启用线路权限组。"><div className="grid items-start gap-4 md:grid-cols-2"><Select label="线路权限组" value={product.lineGroupId || ""} onValueChange={lineGroupId => update({ lineGroupId })} id="catalog-v2-line-group" className="w-full" placeholder="选择权限组" options={[...groups.filter(group => group.isEnabled || group.id === product.lineGroupId).map(group => ({ value: group.id, label: `${group.name}${group.isEnabled ? "" : "（已停用）"}` }))]} /></div></Card> : null}
    {product.type === "recurring_plan" ? <>
      <Card title="周期规格" description="各周期共享商品库存。" headerAction={<Button variant="secondary" onClick={() => update({ periods: [...product.periods, { id: "30d", durationDays: 30, trafficBytes: 100 * GB, deviceLimit: 1, priceCents: 0, isEnabled: true, sortOrder: Math.max(-1, ...product.periods.map(period => period.sortOrder)) + 1 }] })}><Plus />添加周期</Button>}></Card>
      {product.periods.map((period, index) => <PeriodEditor key={index} period={period} index={index} onChange={value => updatePeriod(index, value)} onRemove={() => update({ periods: product.periods.filter((_, current) => current !== index) })} />)}
      <Card title="流量定制" description="每档流量按每 30 天收取每档价格。"><div className="grid items-start gap-4 md:grid-cols-3">
        <SwitchField className="md:col-span-3" id="catalog-v2-traffic-custom" label="启用流量定制" checked={product.trafficCustomization.enabled} onCheckedChange={enabled => update({ trafficCustomization: { ...product.trafficCustomization, enabled } })} />
        <Input label="每档流量（GB）" id="catalog-v2-step-traffic" type="number" min="1" value={product.trafficCustomization.stepBytes === null ? "" : product.trafficCustomization.stepBytes / GB} onChange={event => update({ trafficCustomization: { ...product.trafficCustomization, stepBytes: nullableNumber(event.target.value, GB) } })} />
        <PriceInput label="每档价格（每 30 天）" id="catalog-v2-step-price" cents={product.trafficCustomization.stepPriceCents} onChange={stepPriceCents => update({ trafficCustomization: { ...product.trafficCustomization, stepPriceCents } })} />
        <NumberField label="最多增加档数" id="catalog-v2-max-steps" value={product.trafficCustomization.maxSteps} onValueChange={next => update({ trafficCustomization: { ...product.trafficCustomization, maxSteps: next } })} locale="zh-CN" min={1} />
      </div></Card>
      <CompareFields product={product} update={update} attributes={compareAttributes} group={groups.find(group => group.id === product.lineGroupId)} />
    </> : null}
    {product.type === "lifetime_plan" ? <Card title="不限时规格" description="时长固定为永久，流量留空表示无限。"><div className="grid items-start gap-4 md:grid-cols-3">
      <Input label="默认流量（GB）" id="catalog-v2-lifetime-traffic" type="number" min="0" value={product.trafficBytes === null ? "" : product.trafficBytes / GB} onChange={event => update({ trafficBytes: nullableNumber(event.target.value, GB) })} placeholder="留空表示无限" />
      <Input label="在线IP数量" id="catalog-v2-lifetime-devices" type="number" min="0" value={product.deviceLimit ?? ""} onChange={event => update({ deviceLimit: nullableNumber(event.target.value) })} />
      <PriceInput label="价格" id="catalog-v2-lifetime-price" cents={product.priceCents} onChange={priceCents => update({ priceCents })} />
    </div></Card> : null}
    {product.type === "addon" ? <AddonFields product={product} update={update} categories={addonCategories} /> : null}
    <FeatureFields product={product} update={update} />
    <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`删除商品「${product.name}」？`} description="删除后不能恢复。" onConfirm={remove} />
  </div>
}
