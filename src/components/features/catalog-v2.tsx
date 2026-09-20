import * as React from "react"
import { ArrowLeft, Eye, Loader2, Plus, Save, Trash2 } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"

import { deleteJson, fetchJson, postJson, putJson } from "@/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, PageHeader } from "@/components/features/shared"
import type { CatalogV2LineGroup, CatalogV2Period, CatalogV2Product } from "@/types"

const GB = 1024 ** 3
const typeLabels = { recurring_plan: "周期性套餐", lifetime_plan: "不限时套餐", addon: "附加服务" } as const

function money(cents: number | null) {
  return cents === null ? "未填写" : `¥${(cents / 100).toFixed(2)}`
}

function defaultProduct(): CatalogV2Product {
  return { id: "", type: "recurring_plan", isEnabled: true, isForSale: true, stock: null, sortOrder: 0, name: "", description: "", features: [], isRecommended: false, lineGroupId: null, durationDays: null, trafficBytes: null, deviceLimit: null, priceCents: null, trafficCustomization: { enabled: false, stepBytes: null, stepPriceCents: null, maxSteps: 10 }, purchaseRequirement: null, fulfillment: { mode: null, handler: null, config: {} }, deliveryDescription: "", serviceDurationDays: null, allowQuantity: true, minQuantity: 1, maxQuantity: null, periods: [] }
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
  return <Card><CardHeader><CardTitle>商品特点</CardTitle><CardDescription>每行填写一项，分别在前端显示为支持和不支持。</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Field><FieldLabel htmlFor="catalog-v2-features">优点</FieldLabel><Textarea id="catalog-v2-features" rows={6} value={included} onChange={event => setFeatures(event.target.value, true)} /></Field><Field><FieldLabel htmlFor="catalog-v2-limitations">缺点</FieldLabel><Textarea id="catalog-v2-limitations" rows={6} value={excluded} onChange={event => setFeatures(event.target.value, false)} /></Field></CardContent></Card>
}

export function CatalogV2ProductsPage() {
  const [products, setProducts] = React.useState<CatalogV2Product[] | null>(null)
  const [error, setError] = React.useState("")
  React.useEffect(() => { fetchJson<CatalogV2Product[]>("/api/catalog-v2/products").then(setProducts).catch(error => setError(error.message)) }, [])
  if (!products && !error) return <div className="grid gap-4 px-4 lg:px-6"><Skeleton className="h-20" /><Skeleton className="h-72" /></div>
  return <div className="grid gap-4 px-4 lg:px-6">
    <PageHeader title="商品管理" description="V2 商品是商城展示、支付、交付和线路权限的唯一数据源。" />
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    <div className="flex flex-wrap gap-2"><Button asChild><Link to="/catalog-v2/products/new"><Plus />新建商品</Link></Button><Button variant="outline" asChild><Link to="/xui-inbounds">线路权限组</Link></Button></div>
    {products?.length ? <ItemGroup>{products.map(product => <Item key={product.id} variant="outline"><ItemContent><ItemTitle className="flex flex-wrap gap-2">{product.name}<Badge variant="outline">{typeLabels[product.type]}</Badge>{product.isEnabled ? <Badge variant="success">启用</Badge> : <Badge variant="secondary">停用</Badge>}{product.isForSale ? <Badge>销售</Badge> : <Badge variant="outline">仅管理员授予</Badge>}</ItemTitle><ItemDescription>{product.id} · 排序 {product.sortOrder} · {product.stock === null ? "不限库存" : `库存 ${product.stock}`}</ItemDescription><ItemDescription>{product.type === "recurring_plan" ? `${product.periods.length} 个周期` : product.type === "lifetime_plan" ? `${money(product.priceCents)} · 永久` : `${money(product.priceCents)} · ${product.fulfillment.mode === "automatic" ? "自动交付" : "人工交付"}`}</ItemDescription></ItemContent><ItemActions><Button asChild variant="ghost" size="icon"><Link to={`/catalog-v2/products/${encodeURIComponent(product.id)}`} aria-label={`编辑 ${product.name}`}><Eye /></Link></Button></ItemActions></Item>)}</ItemGroup> : <EmptyState title="尚未录入 V2 商品" description="先创建线路权限组，再录入周期性套餐、不限时套餐或附加服务。" />}
  </div>
}
function PeriodEditor({ period, index, onChange, onRemove }: { period: CatalogV2Period; index: number; onChange: (value: CatalogV2Period) => void; onRemove: () => void }) {
  return <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>周期 {index + 1}</CardTitle><CardDescription>周期标识根据时长自动生成。</CardDescription></div><Button variant="destructive" size="icon" onClick={onRemove} aria-label={`删除周期 ${index + 1}`}><Trash2 /></Button></CardHeader><CardContent className="grid gap-4 md:grid-cols-3"><Field><FieldLabel>周期标识</FieldLabel><Input value={period.id} readOnly /></Field><Field><FieldLabel>时长（天）</FieldLabel><Input type="number" min="1" value={period.durationDays || ""} onChange={event => { const durationDays = Number(event.target.value); onChange({ ...period, id: durationDays ? `${durationDays}d` : "", durationDays }) }} /></Field><Field><FieldLabel>排序</FieldLabel><Input type="number" min="0" value={period.sortOrder} onChange={event => onChange({ ...period, sortOrder: Number(event.target.value) })} /></Field><Field><FieldLabel>默认流量（GB）</FieldLabel><Input type="number" min="0" value={period.trafficBytes === null ? "" : period.trafficBytes / GB} onChange={event => onChange({ ...period, trafficBytes: nullableNumber(event.target.value, GB) })} placeholder="留空表示无限" /><FieldDescription>留空表示无限流量。</FieldDescription></Field><Field><FieldLabel>设备数</FieldLabel><Input type="number" min="0" value={period.deviceLimit} onChange={event => onChange({ ...period, deviceLimit: Number(event.target.value) })} /></Field><Field><FieldLabel>价格（元）</FieldLabel><Input type="number" min="0" step="0.01" value={period.priceCents / 100} onChange={event => onChange({ ...period, priceCents: Math.round(Number(event.target.value) * 100) })} /></Field><Field className="md:col-span-3" orientation="horizontal"><Switch checked={period.isEnabled} onCheckedChange={isEnabled => onChange({ ...period, isEnabled })} /><FieldLabel>启用该周期</FieldLabel></Field></CardContent></Card>
}

export function CatalogV2ProductDetailPage() {
  const { id = "new" } = useParams()
  const isNew = id === "new"
  const navigate = useNavigate()
  const [product, setProduct] = React.useState<CatalogV2Product | null>(isNew ? defaultProduct() : null)
  const [groups, setGroups] = React.useState<CatalogV2LineGroup[]>([])
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")
  React.useEffect(() => { Promise.all([fetchJson<CatalogV2Product[]>("/api/catalog-v2/products"), fetchJson<CatalogV2LineGroup[]>("/api/catalog-v2/line-groups")]).then(([products, lineGroups]) => { setGroups(lineGroups); if (!isNew) setProduct(products.find(item => item.id === id) || null) }).catch(error => setError(error.message)) }, [id, isNew])
  function update(patch: Partial<CatalogV2Product>) { setProduct(current => current ? { ...current, ...patch } : current) }
  async function save() {
    if (!product) return
    setSaving(true)
    try {
      const saved = isNew ? await postJson<CatalogV2Product>("/api/catalog-v2/products", product) : await putJson<CatalogV2Product>(`/api/catalog-v2/products/${encodeURIComponent(id)}`, product)
      toast.success("V2 商品已保存")
      if (isNew) navigate(`/catalog-v2/products/${encodeURIComponent(saved.id)}`, { replace: true }); else setProduct(saved)
    } catch (error) { toast.error(error instanceof Error ? error.message : "保存失败") } finally { setSaving(false) }
  }
  async function remove() { if (!product || isNew || !window.confirm(`确认删除 ${product.name}？`)) return; setSaving(true); try { await deleteJson(`/api/catalog-v2/products/${encodeURIComponent(id)}`); navigate("/catalog-v2", { replace: true }); toast.success("商品已删除") } catch (error) { toast.error(error instanceof Error ? error.message : "删除失败") } finally { setSaving(false) } }
  if (error) return <div className="px-4 lg:px-6"><Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert></div>
  if (!product) return <div className="px-4 lg:px-6"><EmptyState title="商品不存在" description="返回新版商品录入重新选择。" /></div>
  const updatePeriod = (index: number, value: CatalogV2Period) => update({ periods: product.periods.map((period, current) => current === index ? value : period) })
  return <div className="grid gap-4 px-4 lg:px-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><PageHeader title={isNew ? "新建 V2 商品" : product.name} description="保存后会直接用于商城、支付交付和 3x-ui 权限同步。" /><div className="flex gap-2"><Button variant="outline" asChild><Link to="/catalog-v2"><ArrowLeft />返回</Link></Button>{isNew ? null : <Button variant="destructive" onClick={() => void remove()} disabled={saving}><Trash2 />删除</Button>}<Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}保存商品</Button></div></div>
    <Card><CardHeader><CardTitle>基础信息</CardTitle><CardDescription>商品 ID 创建后不可修改，只允许小写字母、数字和短横线。</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Field><FieldLabel htmlFor="catalog-v2-id">商品 ID</FieldLabel><Input id="catalog-v2-id" value={product.id} disabled={!isNew} onChange={event => update({ id: event.target.value.toLowerCase() })} placeholder="example-product" /></Field><Field><FieldLabel>商品类型</FieldLabel><Select value={product.type} disabled={!isNew} onValueChange={type => update({ ...defaultProduct(), id: product.id, name: product.name, type: type as CatalogV2Product["type"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field><FieldLabel>商品名称</FieldLabel><Input value={product.name} onChange={event => update({ name: event.target.value })} /></Field><Field><FieldLabel>排序</FieldLabel><Input type="number" min="0" value={product.sortOrder} onChange={event => update({ sortOrder: Number(event.target.value) })} /></Field><Field><FieldLabel>库存</FieldLabel><Input type="number" min="0" value={product.stock ?? ""} onChange={event => update({ stock: nullableNumber(event.target.value) })} placeholder="留空表示不限库存" /></Field><Field className="md:col-span-2"><FieldLabel>商品描述</FieldLabel><Textarea value={product.description} onChange={event => update({ description: event.target.value })} /></Field><Field orientation="horizontal"><Switch checked={product.isEnabled} onCheckedChange={isEnabled => update({ isEnabled })} /><FieldLabel>启用商品</FieldLabel></Field><Field orientation="horizontal"><Switch checked={product.isForSale} onCheckedChange={isForSale => update({ isForSale })} /><FieldLabel>对外销售</FieldLabel></Field>{product.type === "addon" ? null : <Field orientation="horizontal"><Checkbox checked={product.isRecommended} onCheckedChange={value => update({ isRecommended: value === true })} /><FieldLabel>推荐商品</FieldLabel></Field>}</CardContent></Card>
    {product.type !== "addon" ? <Card><CardHeader><CardTitle>线路权限</CardTitle><CardDescription>必须先创建并启用线路权限组。</CardDescription></CardHeader><CardContent><Field><FieldLabel>线路权限组</FieldLabel><Select value={product.lineGroupId || ""} onValueChange={lineGroupId => update({ lineGroupId })}><SelectTrigger><SelectValue placeholder="选择权限组" /></SelectTrigger><SelectContent>{groups.filter(group => group.isEnabled || group.id === product.lineGroupId).map(group => <SelectItem key={group.id} value={group.id}>{group.name}{group.isEnabled ? "" : "（已停用）"}</SelectItem>)}</SelectContent></Select></Field></CardContent></Card> : null}
    {product.type === "recurring_plan" ? <><Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>周期规格</CardTitle><CardDescription>各周期共享商品库存。</CardDescription></div><Button variant="outline" onClick={() => update({ periods: [...product.periods, { id: "30d", durationDays: 30, trafficBytes: 100 * GB, deviceLimit: 1, priceCents: 0, isEnabled: true, sortOrder: Math.max(-1, ...product.periods.map(period => period.sortOrder)) + 1 }] })}><Plus />添加周期</Button></CardHeader></Card>{product.periods.map((period, index) => <PeriodEditor key={index} period={period} index={index} onChange={value => updatePeriod(index, value)} onRemove={() => update({ periods: product.periods.filter((_, current) => current !== index) })} />)}<Card><CardHeader><CardTitle>流量定制</CardTitle><CardDescription>固定按每档流量和每档金额加价。</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-3"><Field orientation="horizontal" className="md:col-span-3"><Switch checked={product.trafficCustomization.enabled} onCheckedChange={enabled => update({ trafficCustomization: { ...product.trafficCustomization, enabled } })} /><FieldLabel>启用流量定制</FieldLabel></Field><Field><FieldLabel>每档流量（GB）</FieldLabel><Input type="number" min="1" value={product.trafficCustomization.stepBytes === null ? "" : product.trafficCustomization.stepBytes / GB} onChange={event => update({ trafficCustomization: { ...product.trafficCustomization, stepBytes: nullableNumber(event.target.value, GB) } })} /></Field><Field><FieldLabel>每档价格（元）</FieldLabel><Input type="number" min="0.01" step="0.01" value={product.trafficCustomization.stepPriceCents === null ? "" : product.trafficCustomization.stepPriceCents / 100} onChange={event => update({ trafficCustomization: { ...product.trafficCustomization, stepPriceCents: nullableNumber(event.target.value, 100) } })} /></Field><Field><FieldLabel>最多增加档数</FieldLabel><Input type="number" min="1" value={product.trafficCustomization.maxSteps} onChange={event => update({ trafficCustomization: { ...product.trafficCustomization, maxSteps: Number(event.target.value) } })} /></Field></CardContent></Card></> : null}
    {product.type === "lifetime_plan" ? <Card><CardHeader><CardTitle>不限时规格</CardTitle><CardDescription>时长固定为永久，流量留空表示无限。</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-3"><Field><FieldLabel>默认流量（GB）</FieldLabel><Input type="number" min="0" value={product.trafficBytes === null ? "" : product.trafficBytes / GB} onChange={event => update({ trafficBytes: nullableNumber(event.target.value, GB) })} placeholder="留空表示无限" /></Field><Field><FieldLabel>设备数</FieldLabel><Input type="number" min="0" value={product.deviceLimit ?? ""} onChange={event => update({ deviceLimit: nullableNumber(event.target.value) })} /></Field><Field><FieldLabel>价格（元）</FieldLabel><Input type="number" min="0" step="0.01" value={product.priceCents === null ? "" : product.priceCents / 100} onChange={event => update({ priceCents: nullableNumber(event.target.value, 100) })} /></Field></CardContent></Card> : null}
    {product.type === "addon" ? <Card><CardHeader><CardTitle>附加服务</CardTitle><CardDescription>交付配置会在未来创建订单时复制到订单快照。</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Field><FieldLabel>价格（元）</FieldLabel><Input type="number" min="0" step="0.01" value={product.priceCents === null ? "" : product.priceCents / 100} onChange={event => update({ priceCents: nullableNumber(event.target.value, 100) })} /></Field><Field><FieldLabel>购买要求</FieldLabel><Select value={product.purchaseRequirement || "standalone"} onValueChange={purchaseRequirement => update({ purchaseRequirement: purchaseRequirement as CatalogV2Product["purchaseRequirement"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="standalone">可直接购买</SelectItem><SelectItem value="requires_recurring_plan">需要有效周期套餐</SelectItem></SelectContent></Select></Field><Field><FieldLabel>交付方式</FieldLabel><Select value={product.fulfillment.mode || "manual"} onValueChange={mode => update({ fulfillment: mode === "automatic" ? { mode: "automatic", handler: "traffic_credit", config: product.fulfillment.config } : { mode: "manual", handler: "manual", config: {} } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">人工交付</SelectItem><SelectItem value="automatic">自动增加流量</SelectItem></SelectContent></Select></Field>{product.fulfillment.mode === "automatic" ? <Field><FieldLabel>自动交付流量（GB）</FieldLabel><Input type="number" min="1" value={product.fulfillment.config.trafficBytes ? product.fulfillment.config.trafficBytes / GB : ""} onChange={event => update({ fulfillment: { ...product.fulfillment, config: { trafficBytes: nullableNumber(event.target.value, GB) || undefined } } })} /></Field> : null}<Field><FieldLabel>服务有效天数</FieldLabel><Input type="number" min="1" value={product.serviceDurationDays ?? ""} onChange={event => update({ serviceDurationDays: nullableNumber(event.target.value) })} placeholder="留空表示不限制" /></Field><Field><FieldLabel>最大购买数量</FieldLabel><Input type="number" min="1" value={product.maxQuantity ?? ""} onChange={event => update({ maxQuantity: nullableNumber(event.target.value) })} placeholder="留空表示只受库存限制" /></Field><Field className="md:col-span-2"><FieldLabel>交付说明</FieldLabel><Textarea value={product.deliveryDescription} onChange={event => update({ deliveryDescription: event.target.value })} /></Field></CardContent></Card> : null}
    <FeatureFields product={product} update={update} />
  </div>
}
