import * as React from "react"
import { addDays, format, startOfDay, subDays } from "date-fns"
import { CalendarIcon, Loader2, Plus, Trash2 } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { toast } from "sonner"

import { fetchJson, putJson } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageHeader } from "@/components/features/shared"
import { MarkdownEditor } from "@/components/features/markdown-editor"
import { useData } from "@/components/features/data-provider"
import type { AnnouncementSetting, CouponSetting, FaqSetting, MarkdownDocumentSetting, SalesSettings, UserAlertSetting } from "@/types"

type Editor =
  | { type: "coupon"; value: CouponSetting; isNew: boolean }
  | { type: "faq"; value: FaqSetting; isNew: boolean }
  | { type: "announcement"; value: AnnouncementSetting; isNew: boolean }
  | { type: "advertisement"; value: MarkdownDocumentSetting; isNew: boolean }
  | { type: "alert"; value: UserAlertSetting; isNew: boolean }

const couponGroups = [
  { value: "basic", label: "BASIC" },
  { value: "pro", label: "PRO" },
  { value: "ultra", label: "ULTRA" },
] as const

const couponDurations = [
  { value: "monthly", label: "月付" },
  { value: "quarterly", label: "季付" },
  { value: "half_yearly", label: "半年付" },
  { value: "yearly", label: "年付" },
] as const

function couponDateRange(coupon: CouponSetting): DateRange | undefined {
  if (!coupon.validFrom && !coupon.validUntil) return undefined
  return {
    from: coupon.validFrom ? startOfDay(new Date(coupon.validFrom)) : undefined,
    to: coupon.validUntil ? subDays(startOfDay(new Date(coupon.validUntil)), 1) : undefined,
  }
}

function couponValidity(coupon: CouponSetting) {
  const range = couponDateRange(coupon)
  if (range?.from && range.to) return `有效期：${format(range.from, "yyyy/MM/dd")} 至 ${format(range.to, "yyyy/MM/dd")}`
  if (range?.from) return `${format(range.from, "yyyy/MM/dd")} 起生效`
  if (range?.to) return `有效至 ${format(range.to, "yyyy/MM/dd")}`
  return "长期有效"
}

function couponScope(coupon: CouponSetting) {
  const groups = coupon.applicableGroups?.length && coupon.applicableGroups.length < couponGroups.length ? couponGroups.filter(item => coupon.applicableGroups?.includes(item.value)).map(item => item.label).join(" / ") : "全部套餐"
  const durations = coupon.applicableDurations?.length && coupon.applicableDurations.length < couponDurations.length ? couponDurations.filter(item => coupon.applicableDurations?.includes(item.value)).map(item => item.label).join(" / ") : "全部周期"
  return `${groups} · ${durations}`
}

function couponLimit(coupon: CouponSetting) {
  const total = coupon.totalLimit ? `总量 ${coupon.totalLimit}（已占用 ${coupon.usedCount || 0}）` : "不限总量"
  const account = coupon.perAccountLimit ? `每账户 ${coupon.perAccountLimit} 次` : "不限账户次数"
  return `${total} · ${account}`
}

function MarkdownDocumentList({ title, description, empty, items, onAdd, onEdit }: { title: string; description: string; empty: string; items: MarkdownDocumentSetting[]; onAdd: () => void; onEdit: (value: MarkdownDocumentSetting) => void }) {
  return (
    <section className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3"><div className="grid gap-1"><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div><Button variant="outline" size="sm" onClick={onAdd}><Plus />添加内容</Button></header>
      {items.length ? <ItemGroup>{items.map(item => <Item key={item.id} variant="outline"><ItemContent><ItemTitle>{item.title}<Badge variant="outline">{item.category || "未分类"}</Badge><Badge variant={item.enabled ? "default" : "secondary"}>{item.enabled ? "已启用" : "草稿"}</Badge></ItemTitle>{item.description ? <ItemDescription>{item.description}</ItemDescription> : null}</ItemContent><ItemActions><Button variant="link" size="sm" onClick={() => onEdit(item)}>编辑</Button></ItemActions></Item>)}</ItemGroup> : <p className="py-6 text-sm text-muted-foreground">{empty}</p>}
    </section>
  )
}

export function SalesSettingsPage() {
  const { runAsync } = useData()
  const [settings, setSettings] = React.useState<SalesSettings | null>(null)
  const [editor, setEditor] = React.useState<Editor | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [savingAction, setSavingAction] = React.useState<"save" | "delete" | "">("")
  const date = editor?.type === "coupon" ? couponDateRange(editor.value) : undefined

  function toggleCouponScope(key: "applicableGroups" | "applicableDurations", value: string, checked: boolean, options: readonly { value: string }[]) {
    if (editor?.type !== "coupon") return
    const allValues = options.map(item => item.value)
    const selected = editor.value[key]?.length ? editor.value[key] : allValues
    const next = checked ? [...new Set([...selected, value])] : selected.filter(item => item !== value)
    setEditor({ ...editor, value: { ...editor.value, [key]: next } })
  }

  React.useEffect(() => {
    fetchJson<SalesSettings>("/api/sales-settings").then(setSettings).catch(error => toast.error(error.message))
  }, [])

  async function persist(next: SalesSettings, message: string) {
    setSaving(true)
    try {
      const saved = await runAsync(() => putJson<SalesSettings>("/api/sales-settings", next), "保存销售设置...")
      setSettings(saved)
      toast.success(message)
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存销售设置失败")
      return false
    } finally {
      setSaving(false)
    }
  }

  async function saveEditor() {
    if (!settings || !editor) return
    if (editor.type === "coupon" && Boolean(editor.value.validFrom) !== Boolean(editor.value.validUntil)) {
      toast.error("请选择完整的生效日期区间")
      return
    }
    if (editor.type === "coupon" && (!editor.value.applicableGroups?.length || !editor.value.applicableDurations?.length)) {
      toast.error("优惠码至少需要选择一个套餐和一个计费周期")
      return
    }
    const next = editor.type === "coupon"
      ? { ...settings, coupons: editor.isNew ? [...settings.coupons, editor.value] : settings.coupons.map(item => item.id === editor.value.id ? editor.value : item) }
      : editor.type === "faq"
        ? { ...settings, faqs: editor.isNew ? [...settings.faqs, editor.value] : settings.faqs.map(item => item.id === editor.value.id ? editor.value : item) }
        : editor.type === "announcement"
          ? { ...settings, announcements: editor.isNew ? [...settings.announcements, editor.value] : settings.announcements.map(item => item.id === editor.value.id ? editor.value : item) }
          : editor.type === "advertisement" ? { ...settings, advertisements: editor.isNew ? [...settings.advertisements, editor.value] : settings.advertisements.map(item => item.id === editor.value.id ? editor.value : item) }
            : { ...settings, userAlerts: editor.isNew ? [...settings.userAlerts, editor.value] : settings.userAlerts.map(item => item.id === editor.value.id ? editor.value : item) }
    setSavingAction("save")
    try {
      if (await persist(next, editor.isNew ? "已添加" : "修改已保存")) setEditor(null)
    } finally {
      setSavingAction("")
    }
  }

  async function removeEditor() {
    if (!settings || !editor || editor.isNew) return
    const next = editor.type === "coupon"
      ? { ...settings, coupons: settings.coupons.filter(item => item.id !== editor.value.id) }
      : editor.type === "faq"
        ? { ...settings, faqs: settings.faqs.filter(item => item.id !== editor.value.id) }
        : editor.type === "announcement"
          ? { ...settings, announcements: settings.announcements.filter(item => item.id !== editor.value.id) }
          : editor.type === "advertisement" ? { ...settings, advertisements: settings.advertisements.filter(item => item.id !== editor.value.id) } : { ...settings, userAlerts: settings.userAlerts.filter(item => item.id !== editor.value.id) }
    setSavingAction("delete")
    try {
      if (await persist(next, "已删除")) setEditor(null)
    } finally {
      setSavingAction("")
    }
  }

  if (!settings) return <div className="grid gap-4 px-4 lg:px-6"><Skeleton className="h-52" /><Skeleton className="h-72" /></div>

  return (
    <div className="grid gap-8 px-4 lg:px-6">
      <PageHeader title="销售设置" description="管理结算优惠码、套餐价格页常见问题和用户中心公告。" />
      <Tabs defaultValue="coupons" className="gap-6">
        <TabsList>
          <TabsTrigger value="coupons">优惠码</TabsTrigger>
          <TabsTrigger value="faqs">价格页 FAQ</TabsTrigger>
          <TabsTrigger value="announcements">网站公告</TabsTrigger>
          <TabsTrigger value="advertisements">广告草稿</TabsTrigger>
          <TabsTrigger value="alerts">Alert 管理</TabsTrigger>
        </TabsList>
        <TabsContent value="coupons">
          <section className="grid gap-4">
            <header className="flex flex-wrap items-end justify-between gap-3"><div className="grid gap-1"><h2 className="text-lg font-semibold">优惠码</h2><p className="text-sm text-muted-foreground">设置适用套餐、计费周期、总量及单账户使用次数。</p></div><Button variant="outline" size="sm" onClick={() => setEditor({ type: "coupon", value: { id: crypto.randomUUID(), code: "", percent: 10, enabled: true, validFrom: "", validUntil: "", applicableGroups: couponGroups.map(item => item.value), applicableDurations: couponDurations.map(item => item.value), totalLimit: 0, perAccountLimit: 0 }, isNew: true })}><Plus />添加优惠码</Button></header>
            {settings.coupons.length ? <ItemGroup>{settings.coupons.map(coupon => <Item key={coupon.id} variant="outline"><ItemContent><ItemTitle>{coupon.code}<Badge variant={coupon.enabled ? "default" : "secondary"}>{coupon.enabled ? "已启用" : "已停用"}</Badge></ItemTitle><ItemDescription>优惠 {coupon.percent}% · {couponValidity(coupon)} · {couponScope(coupon)} · {couponLimit(coupon)}</ItemDescription></ItemContent><ItemActions><Button variant="link" size="sm" onClick={() => setEditor({ type: "coupon", value: { ...coupon, applicableGroups: coupon.applicableGroups?.length ? coupon.applicableGroups : couponGroups.map(item => item.value), applicableDurations: coupon.applicableDurations?.length ? coupon.applicableDurations : couponDurations.map(item => item.value) }, isNew: false })}>编辑</Button></ItemActions></Item>)}</ItemGroup> : <p className="py-6 text-sm text-muted-foreground">暂无优惠码</p>}
          </section>
        </TabsContent>
        <TabsContent value="alerts"><section className="grid gap-4"><header className="flex flex-wrap items-end justify-between gap-3"><div className="grid gap-1"><h2 className="text-lg font-semibold">Alert 管理</h2><p className="text-sm text-muted-foreground">在用户端页面顶部常驻显示提醒。</p></div><Button variant="outline" size="sm" onClick={() => setEditor({ type: "alert", value: { id: crypto.randomUUID(), page: "pricing", variant: "warning", title: "", message: "", enabled: true }, isNew: true })}><Plus />添加 Alert</Button></header>{settings.userAlerts.length ? <ItemGroup>{settings.userAlerts.map(item => <Item key={item.id} variant="outline"><ItemContent><ItemTitle>{item.title}<Badge variant={item.enabled ? "default" : "secondary"}>{item.enabled ? "已启用" : "已停用"}</Badge></ItemTitle><ItemDescription>{item.page === "pricing" ? "购买套餐页" : item.page === "checkout" ? "确认订单页" : "总览"} · {item.variant} · {item.message}</ItemDescription></ItemContent><ItemActions><Button variant="link" size="sm" onClick={() => setEditor({ type: "alert", value: { ...item }, isNew: false })}>编辑</Button></ItemActions></Item>)}</ItemGroup> : <p className="py-6 text-sm text-muted-foreground">暂无 Alert</p>}</section></TabsContent>
        <TabsContent value="faqs">
          <section className="grid gap-4">
            <header className="flex flex-wrap items-end justify-between gap-3"><div className="grid gap-1"><h2 className="text-lg font-semibold">价格页 FAQ</h2><p className="text-sm text-muted-foreground">启用的问题会按当前顺序显示在套餐价格页面底部。</p></div><Button variant="outline" size="sm" onClick={() => setEditor({ type: "faq", value: { id: crypto.randomUUID(), question: "", answer: "", enabled: true }, isNew: true })}><Plus />添加 FAQ</Button></header>
            {settings.faqs.length ? <ItemGroup>{settings.faqs.map(faq => <Item key={faq.id} variant="outline"><ItemContent><ItemTitle>{faq.question}<Badge variant={faq.enabled !== false ? "default" : "secondary"}>{faq.enabled !== false ? "显示" : "隐藏"}</Badge></ItemTitle></ItemContent><ItemActions><Button variant="link" size="sm" onClick={() => setEditor({ type: "faq", value: { ...faq }, isNew: false })}>编辑</Button></ItemActions></Item>)}</ItemGroup> : <p className="py-6 text-sm text-muted-foreground">暂无 FAQ</p>}
          </section>
        </TabsContent>
        <TabsContent value="announcements">
          <section className="grid gap-4">
            <header className="flex flex-wrap items-end justify-between gap-3"><div className="grid gap-1"><h2 className="text-lg font-semibold">网站公告</h2><p className="text-sm text-muted-foreground">启用的公告会按发布时间从新到旧显示在用户总览。</p></div><Button variant="outline" size="sm" onClick={() => setEditor({ type: "announcement", value: { id: crypto.randomUUID(), title: "", content: "", publishedAt: new Date().toISOString(), enabled: true }, isNew: true })}><Plus />添加公告</Button></header>
            {settings.announcements.length ? <ItemGroup>{settings.announcements.slice().sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).map(announcement => <Item key={announcement.id} variant="outline"><ItemContent><ItemTitle>{announcement.title}<Badge variant={announcement.enabled ? "default" : "secondary"}>{announcement.enabled ? "已启用" : "已停用"}</Badge></ItemTitle><ItemDescription>{format(new Date(announcement.publishedAt), "yyyy/MM/dd HH:mm")}</ItemDescription></ItemContent><ItemActions><Button variant="link" size="sm" onClick={() => setEditor({ type: "announcement", value: { ...announcement }, isNew: false })}>编辑</Button></ItemActions></Item>)}</ItemGroup> : <p className="py-6 text-sm text-muted-foreground">暂无公告</p>}
          </section>
        </TabsContent>
        <TabsContent value="advertisements">
          <MarkdownDocumentList
            title="广告草稿"
            description="先用 Markdown 编写和保存，暂不在前台展示。"
            empty="暂无广告草稿"
            items={settings.advertisements}
            onAdd={() => setEditor({ type: "advertisement", value: { id: crypto.randomUUID(), category: "广告", title: "", description: "", content: "", enabled: false }, isNew: true })}
            onEdit={value => setEditor({ type: "advertisement", value: { ...value }, isNew: false })}
          />
        </TabsContent>
      </Tabs>
      <Sheet open={Boolean(editor)} onOpenChange={open => { if (!open && !saving) setEditor(null) }}>
        <SheetContent className="w-full sm:max-w-4xl">
          {editor ? <>
            <SheetHeader><SheetTitle>{editor.isNew ? "添加" : "编辑"}{editor.type === "coupon" ? "优惠码" : editor.type === "faq" ? " FAQ" : editor.type === "announcement" ? "公告" : editor.type === "advertisement" ? "广告" : "Alert"}</SheetTitle><SheetDescription>{editor.type === "coupon" ? "设置折扣、适用范围、使用限制、有效期和状态。" : editor.type === "faq" ? "设置价格页显示的问题、回答和状态。" : editor.type === "alert" ? "选择显示页面、类型并填写提醒内容。" : "使用 Markdown 编写正文，可在编辑器中实时预览。"}</SheetDescription></SheetHeader>
            <div className="grid gap-4 overflow-y-auto px-4">
               {editor.type === "alert" ? <FieldGroup><Field><FieldLabel>显示页面</FieldLabel><Select value={editor.value.page} onValueChange={page => setEditor({ ...editor, value: { ...editor.value, page: page as UserAlertSetting["page"] } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pricing">购买套餐页</SelectItem><SelectItem value="checkout">确认订单页</SelectItem><SelectItem value="account">总览</SelectItem></SelectContent></Select></Field><Field><FieldLabel>Alert 类型</FieldLabel><Select value={editor.value.variant} onValueChange={variant => setEditor({ ...editor, value: { ...editor.value, variant: variant as UserAlertSetting["variant"] } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">默认</SelectItem><SelectItem value="success">成功</SelectItem><SelectItem value="warning">警告</SelectItem><SelectItem value="error">错误</SelectItem></SelectContent></Select></Field><Field><FieldLabel htmlFor="sales-alert-title">标题</FieldLabel><Input id="sales-alert-title" autoFocus maxLength={120} value={editor.value.title} onChange={event => setEditor({ ...editor, value: { ...editor.value, title: event.target.value } })} /></Field><Field><FieldLabel htmlFor="sales-alert-message">内容</FieldLabel><Textarea id="sales-alert-message" maxLength={500} rows={4} value={editor.value.message} onChange={event => setEditor({ ...editor, value: { ...editor.value, message: event.target.value } })} /></Field><label className="flex items-center gap-2 text-sm"><Checkbox checked={editor.value.enabled} onCheckedChange={checked => setEditor({ ...editor, value: { ...editor.value, enabled: checked === true } })} />启用</label></FieldGroup> : editor.type === "coupon" ? <FieldGroup>
                <Field><FieldLabel htmlFor="sales-coupon-code">优惠码</FieldLabel><Input id="sales-coupon-code" autoFocus value={editor.value.code} onChange={event => setEditor({ ...editor, value: { ...editor.value, code: event.target.value.toUpperCase() } })} /></Field>
                <Field><FieldLabel htmlFor="sales-coupon-percent">优惠百分比</FieldLabel><Input id="sales-coupon-percent" type="number" min="1" max="99" value={editor.value.percent} onChange={event => setEditor({ ...editor, value: { ...editor.value, percent: Number(event.target.value) } })} /></Field>
                <Field><FieldLabel>适用套餐</FieldLabel><div className="grid grid-cols-3 gap-2">{couponGroups.map(item => <label key={item.value} className="flex items-center gap-2 text-sm"><Checkbox checked={Boolean(editor.value.applicableGroups?.includes(item.value))} onCheckedChange={checked => toggleCouponScope("applicableGroups", item.value, checked === true, couponGroups)} />{item.label}</label>)}</div></Field>
                <Field><FieldLabel>适用计费周期</FieldLabel><div className="grid grid-cols-2 gap-2">{couponDurations.map(item => <label key={item.value} className="flex items-center gap-2 text-sm"><Checkbox checked={Boolean(editor.value.applicableDurations?.includes(item.value))} onCheckedChange={checked => toggleCouponScope("applicableDurations", item.value, checked === true, couponDurations)} />{item.label}</label>)}</div></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field><FieldLabel htmlFor="sales-coupon-total-limit">总数量（0 不限）</FieldLabel><Input id="sales-coupon-total-limit" type="number" min="0" step="1" value={editor.value.totalLimit || 0} onChange={event => setEditor({ ...editor, value: { ...editor.value, totalLimit: Number(event.target.value) } })} /></Field>
                  <Field><FieldLabel htmlFor="sales-coupon-account-limit">每账户次数（0 不限）</FieldLabel><Input id="sales-coupon-account-limit" type="number" min="0" step="1" value={editor.value.perAccountLimit || 0} onChange={event => setEditor({ ...editor, value: { ...editor.value, perAccountLimit: Number(event.target.value) } })} /></Field>
                </div>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={!editor.value.validFrom && !editor.value.validUntil} onCheckedChange={checked => {
                  if (checked === true) {
                    setEditor({ ...editor, value: { ...editor.value, validFrom: "", validUntil: "" } })
                    return
                  }
                  const from = startOfDay(new Date())
                  const to = addDays(from, 30)
                  setEditor({ ...editor, value: { ...editor.value, validFrom: from.toISOString(), validUntil: addDays(to, 1).toISOString() } })
                }} />长期有效</label>
                {editor.value.validFrom || editor.value.validUntil ? <Field>
                  <FieldLabel htmlFor="sales-coupon-validity">生效日期区间</FieldLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button id="sales-coupon-validity" type="button" variant="outline" className="w-full justify-start px-2.5 font-normal">
                        <CalendarIcon data-icon="inline-start" />
                        {date?.from ? (
                          date.to ? (
                            <>
                              {format(date.from, "yyyy/MM/dd")} -{" "}
                              {format(date.to, "yyyy/MM/dd")}
                            </>
                          ) : (
                            format(date.from, "yyyy/MM/dd")
                          )
                        ) : (
                          <span>选择日期范围</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={range => setEditor({ ...editor, value: {
                          ...editor.value,
                          validFrom: range?.from ? startOfDay(range.from).toISOString() : "",
                          validUntil: range?.to ? addDays(startOfDay(range.to), 1).toISOString() : "",
                        } })}
                        numberOfMonths={2}
                        classNames={{ months: "flex flex-col gap-4 sm:flex-row" }}
                      />
                    </PopoverContent>
                  </Popover>
                </Field> : null}
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={editor.value.enabled} onCheckedChange={checked => setEditor({ ...editor, value: { ...editor.value, enabled: checked === true } })} />启用优惠码</label>
              </FieldGroup> : editor.type === "faq" ? <FieldGroup>
                <Field><FieldLabel htmlFor="sales-faq-question">问题</FieldLabel><Input id="sales-faq-question" autoFocus maxLength={120} value={editor.value.question} onChange={event => setEditor({ ...editor, value: { ...editor.value, question: event.target.value } })} /></Field>
                <Field><FieldLabel htmlFor="sales-faq-answer">回答</FieldLabel><Textarea id="sales-faq-answer" maxLength={500} rows={8} value={editor.value.answer} onChange={event => setEditor({ ...editor, value: { ...editor.value, answer: event.target.value } })} /></Field>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={editor.value.enabled !== false} onCheckedChange={checked => setEditor({ ...editor, value: { ...editor.value, enabled: checked === true } })} />在价格页显示</label>
              </FieldGroup> : editor.type === "announcement" ? <FieldGroup>
                <Field><FieldLabel htmlFor="sales-announcement-title">标题</FieldLabel><Input id="sales-announcement-title" autoFocus maxLength={80} value={editor.value.title} onChange={event => setEditor({ ...editor, value: { ...editor.value, title: event.target.value } })} /></Field>
                <Field><FieldLabel htmlFor="sales-announcement-content">Markdown 正文</FieldLabel><MarkdownEditor id="sales-announcement-content" value={editor.value.content} onChange={content => setEditor({ ...editor, value: { ...editor.value, content } })} /></Field>
                <Field><FieldLabel htmlFor="sales-announcement-published-at">发布时间</FieldLabel><Input id="sales-announcement-published-at" type="datetime-local" required value={format(new Date(editor.value.publishedAt), "yyyy-MM-dd'T'HH:mm")} onChange={event => { if (event.target.value) setEditor({ ...editor, value: { ...editor.value, publishedAt: new Date(event.target.value).toISOString() } }) }} /></Field>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={editor.value.enabled} onCheckedChange={checked => setEditor({ ...editor, value: { ...editor.value, enabled: checked === true } })} />在用户中心显示</label>
              </FieldGroup> : <FieldGroup>
                <Field><FieldLabel htmlFor="sales-markdown-category">分类</FieldLabel><Input id="sales-markdown-category" maxLength={40} value={editor.value.category || ""} onChange={event => setEditor({ ...editor, value: { ...editor.value, category: event.target.value } })} /></Field>
                <Field><FieldLabel htmlFor="sales-markdown-title">标题</FieldLabel><Input id="sales-markdown-title" autoFocus maxLength={80} value={editor.value.title} onChange={event => setEditor({ ...editor, value: { ...editor.value, title: event.target.value } })} /></Field>
                <Field><FieldLabel htmlFor="sales-markdown-description">简介</FieldLabel><Input id="sales-markdown-description" maxLength={200} value={editor.value.description} onChange={event => setEditor({ ...editor, value: { ...editor.value, description: event.target.value } })} /></Field>
                <Field><FieldLabel htmlFor="sales-markdown-content">Markdown 正文</FieldLabel><MarkdownEditor id="sales-markdown-content" value={editor.value.content} onChange={content => setEditor({ ...editor, value: { ...editor.value, content } })} /></Field>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={editor.value.enabled} onCheckedChange={checked => setEditor({ ...editor, value: { ...editor.value, enabled: checked === true } })} />标记为可用</label>
              </FieldGroup>}
            </div>
            <SheetFooter>
              {!editor.isNew ? <Button variant="destructive" onClick={removeEditor} disabled={saving}>{savingAction === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 />}删除</Button> : null}
              <SheetClose asChild><Button variant="outline" disabled={saving}>取消</Button></SheetClose>
              <Button onClick={saveEditor} disabled={saving}>{savingAction === "save" ? <Loader2 className="animate-spin" /> : null}{savingAction === "save" ? "保存中..." : "保存修改"}</Button>
            </SheetFooter>
          </> : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
