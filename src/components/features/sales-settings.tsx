import * as React from "react"
import { addDays, format, startOfDay, subDays } from "date-fns"
import { CalendarIcon, Loader2, Plus, Trash2 } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { toast } from "@/components/features/toast"

import { fetchJson, putJson } from "@/api"
import { DateRangePicker } from "@/components/arc/date-range-picker/date-range-picker"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Drawer, DrawerClose, DrawerContent } from "@/components/arc/drawer/drawer"
import { PageHeader, UserAlert } from "@/components/features/shared"
import { MarkdownEditor } from "@/components/features/markdown-editor"
import { useData } from "@/components/features/data-provider"
import type { AnnouncementSetting, CouponSetting, FaqSetting, MarkdownDocumentSetting, SalesSettings, UserAlertSetting } from "@/types"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Input } from "@/components/arc/input/input"
import { Select } from "@/components/arc/select/select"
import { Textarea } from "@/components/arc/textarea/textarea"
import { Card } from "@/components/arc/card/card"
import { NumberField } from "@/components/arc/number-field/number-field"
import { Switch } from "@/components/arc/switch/switch"

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

const alertPages = [
  { value: "pricing", label: "购买套餐页" },
  { value: "checkout", label: "确认订单页" },
  { value: "account", label: "总览" },
] as const

const alertVariants = [
  { value: "default", label: "默认" },
  { value: "success", label: "成功" },
  { value: "warning", label: "警告" },
  { value: "error", label: "错误" },
] as const

const editorLabels: Record<Editor["type"], { name: string; description: string; size: "md" | "lg" | "xl" }> = {
  coupon: { name: "优惠码", description: "设置折扣、适用范围、使用限制、有效期和状态。", size: "lg" },
  faq: { name: "FAQ", description: "设置价格页显示的问题、回答和状态。", size: "md" },
  announcement: { name: "公告", description: "使用 Markdown 编写正文，可在编辑器中实时预览。", size: "xl" },
  advertisement: { name: "广告", description: "使用 Markdown 编写正文，可在编辑器中实时预览。", size: "xl" },
  alert: { name: "Alert", description: "选择显示页面和类型，填写提醒内容后可在下方预览。", size: "md" },
}

function alertSummary(item: UserAlertSetting) {
  const page = alertPages.find(option => option.value === item.page)?.label || item.page
  const variant = alertVariants.find(option => option.value === item.variant)?.label || item.variant
  return [page, variant, item.message].filter(Boolean).join(" · ")
}

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
      <header className="flex flex-wrap items-end justify-between gap-3"><div className="grid gap-1"><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div><Button variant="secondary" size="sm" onClick={onAdd}><Plus />添加内容</Button></header>
      {items.length ? <div className="grid gap-3">{items.map(item => <Card key={item.id} title={<>{item.title}<Badge>{item.category || "未分类"}</Badge><Badge tone={item.enabled ? "neutral" : "neutral"}>{item.enabled ? "已启用" : "草稿"}</Badge></>} headerAction={<><Button variant="link" size="sm" onClick={() => onEdit(item)}>编辑</Button></>}>{item.description ? <p className="text-sm text-muted-foreground">{item.description}</p> : null}</Card>)}</div> : <p className="py-6 text-sm text-muted-foreground">{empty}</p>}
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
    fetchJson<SalesSettings>("/api/sales-settings").then(setSettings).catch(error => toast({ type: "error", title: error.message }))
  }, [])

  async function persist(next: SalesSettings, message: string) {
    setSaving(true)
    try {
      const saved = await runAsync(() => putJson<SalesSettings>("/api/sales-settings", next), "保存销售设置...")
      setSettings(saved)
      toast({ type: "success", title: message })
      return true
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "保存销售设置失败" })
      return false
    } finally {
      setSaving(false)
    }
  }

  async function toggleUserAlerts(enabled: boolean) {
    if (!settings) return
    const previous = settings
    const next = { ...settings, userAlertsEnabled: enabled }
    setSettings(next)
    if (!(await persist(next, enabled ? "已开启用户端 Alert" : "已隐藏全部用户端 Alert"))) setSettings(previous)
  }

  async function saveEditor() {
    if (!settings || !editor) return
    if (editor.type === "coupon" && Boolean(editor.value.validFrom) !== Boolean(editor.value.validUntil)) {
      toast({ type: "error", title: "请选择完整的生效日期区间" })
      return
    }
    if (editor.type === "coupon" && (!editor.value.applicableGroups?.length || !editor.value.applicableDurations?.length)) {
      toast({ type: "error", title: "优惠码至少需要选择一个套餐和一个计费周期" })
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

  if (!settings) return <div className="grid gap-4 px-4 lg:px-6"><Skeleton lines={5} /><Skeleton lines={6} /></div>

  return (
    <div className="grid gap-8 px-4 lg:px-6">
      <PageHeader title="销售设置" description="管理结算优惠码、套餐价格页常见问题和用户中心公告。" />
      <Tabs defaultValue="coupons" className="min-w-0 gap-6">
        <TabsList>
          <TabsTrigger value="coupons">优惠码</TabsTrigger>
          <TabsTrigger value="faqs">价格页 FAQ</TabsTrigger>
          <TabsTrigger value="announcements">网站公告</TabsTrigger>
          <TabsTrigger value="advertisements">广告草稿</TabsTrigger>
          <TabsTrigger value="alerts">Alert 管理</TabsTrigger>
        </TabsList>
        <TabsContent value="coupons">
          <section className="grid gap-4">
            <header className="flex flex-wrap items-end justify-between gap-3"><div className="grid gap-1"><h2 className="text-lg font-semibold">优惠码</h2><p className="text-sm text-muted-foreground">设置适用套餐、计费周期、总量及单账户使用次数。</p></div><Button variant="secondary" size="sm" onClick={() => setEditor({ type: "coupon", value: { id: crypto.randomUUID(), code: "", percent: 10, enabled: true, validFrom: "", validUntil: "", applicableGroups: couponGroups.map(item => item.value), applicableDurations: couponDurations.map(item => item.value), totalLimit: 0, perAccountLimit: 0 }, isNew: true })}><Plus />添加优惠码</Button></header>
            {settings.coupons.length ? <div className="grid gap-3">{settings.coupons.map(coupon => <Card key={coupon.id} title={<>{coupon.code}<Badge tone={coupon.enabled ? "neutral" : "neutral"}>{coupon.enabled ? "已启用" : "已停用"}</Badge></>} description={`优惠 ${coupon.percent}% · ${couponValidity(coupon)} · ${couponScope(coupon)} · ${couponLimit(coupon)}`} headerAction={<><Button variant="link" size="sm" onClick={() => setEditor({ type: "coupon", value: { ...coupon, applicableGroups: coupon.applicableGroups?.length ? coupon.applicableGroups : couponGroups.map(item => item.value), applicableDurations: coupon.applicableDurations?.length ? coupon.applicableDurations : couponDurations.map(item => item.value) }, isNew: false })}>编辑</Button></>} />)}</div> : <p className="py-6 text-sm text-muted-foreground">暂无优惠码</p>}
          </section>
        </TabsContent>
        <TabsContent value="alerts">
          <section className="grid gap-4">
            <header className="flex flex-wrap items-end justify-between gap-3"><div className="grid gap-1"><h2 className="text-lg font-semibold">Alert 管理</h2><p className="text-sm text-muted-foreground">在用户端页面顶部常驻显示提醒。</p></div><Button variant="secondary" size="sm" onClick={() => setEditor({ type: "alert", value: { id: crypto.randomUUID(), page: "pricing", variant: "warning", title: "", message: "", enabled: true }, isNew: true })}><Plus />添加 Alert</Button></header>
            <Card>
              <Field orientation="horizontal" className="justify-between gap-6">
                <FieldContent>
                  <FieldLabel htmlFor="user-alerts-enabled">在用户端显示 Alert</FieldLabel>
                  <FieldDescription>{settings.userAlertsEnabled ? "已启用的 Alert 会显示在对应页面顶部。" : "已隐藏全部 Alert，下方各条的设置会保留，重新开启后恢复显示。"}</FieldDescription>
                </FieldContent>
                <Switch id="user-alerts-enabled" checked={settings.userAlertsEnabled} disabled={saving} onCheckedChange={checked => void toggleUserAlerts(checked)} />
              </Field>
            </Card>
            {settings.userAlerts.length ? <div className={`grid gap-3 transition-opacity ${settings.userAlertsEnabled ? "" : "opacity-60"}`}>{settings.userAlerts.map(item => <Card key={item.id} title={<>{item.title || "提示"}<Badge tone={item.enabled && settings.userAlertsEnabled ? "success" : "neutral"}>{!item.enabled ? "已停用" : settings.userAlertsEnabled ? "显示中" : "已隐藏"}</Badge></>} description={alertSummary(item)} headerAction={<Button variant="link" size="sm" onClick={() => setEditor({ type: "alert", value: { ...item }, isNew: false })}>编辑</Button>} />)}</div> : <p className="py-6 text-sm text-muted-foreground">暂无 Alert，点击“添加 Alert”在用户端页面顶部显示提醒。</p>}
          </section>
        </TabsContent>
        <TabsContent value="faqs">
          <section className="grid gap-4">
            <header className="flex flex-wrap items-end justify-between gap-3"><div className="grid gap-1"><h2 className="text-lg font-semibold">价格页 FAQ</h2><p className="text-sm text-muted-foreground">启用的问题会按当前顺序显示在套餐价格页面底部。</p></div><Button variant="secondary" size="sm" onClick={() => setEditor({ type: "faq", value: { id: crypto.randomUUID(), question: "", answer: "", enabled: true }, isNew: true })}><Plus />添加 FAQ</Button></header>
            {settings.faqs.length ? <div className="grid gap-3">{settings.faqs.map(faq => <Card key={faq.id} title={<>{faq.question}<Badge tone={faq.enabled !== false ? "neutral" : "neutral"}>{faq.enabled !== false ? "显示" : "隐藏"}</Badge></>} headerAction={<><Button variant="link" size="sm" onClick={() => setEditor({ type: "faq", value: { ...faq }, isNew: false })}>编辑</Button></>} />)}</div> : <p className="py-6 text-sm text-muted-foreground">暂无 FAQ</p>}
          </section>
        </TabsContent>
        <TabsContent value="announcements">
          <section className="grid gap-4">
            <header className="flex flex-wrap items-end justify-between gap-3"><div className="grid gap-1"><h2 className="text-lg font-semibold">网站公告</h2><p className="text-sm text-muted-foreground">启用的公告会按发布时间从新到旧显示在用户总览。</p></div><Button variant="secondary" size="sm" onClick={() => setEditor({ type: "announcement", value: { id: crypto.randomUUID(), title: "", content: "", publishedAt: new Date().toISOString(), enabled: true }, isNew: true })}><Plus />添加公告</Button></header>
            {settings.announcements.length ? <div className="grid gap-3">{settings.announcements.slice().sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).map(announcement => <Card key={announcement.id} title={<>{announcement.title}<Badge tone={announcement.enabled ? "neutral" : "neutral"}>{announcement.enabled ? "已启用" : "已停用"}</Badge></>} description={format(new Date(announcement.publishedAt), "yyyy/MM/dd HH:mm")} headerAction={<><Button variant="link" size="sm" onClick={() => setEditor({ type: "announcement", value: { ...announcement }, isNew: false })}>编辑</Button></>} />)}</div> : <p className="py-6 text-sm text-muted-foreground">暂无公告</p>}
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
      <Drawer open={Boolean(editor)} onOpenChange={open => { if (!open && !saving) setEditor(null) }}>
        <DrawerContent size={editor ? editorLabels[editor.type].size : "md"} title={editor ? `${editor.isNew ? "添加" : "编辑"} ${editorLabels[editor.type].name}` : ""} description={editor ? editorLabels[editor.type].description : undefined}>
          {editor ? <div className="grid gap-6">
            <div>
              {editor.type === "alert" ? <FieldGroup className="gap-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="显示页面" id="sales-alert-page" value={editor.value.page} onValueChange={page => setEditor({ ...editor, value: { ...editor.value, page: page as UserAlertSetting["page"] } })} options={[...alertPages]} />
                  <Select label="Alert 类型" id="sales-alert-variant" value={editor.value.variant} onValueChange={variant => setEditor({ ...editor, value: { ...editor.value, variant: variant as UserAlertSetting["variant"] } })} options={[...alertVariants]} />
                </div>
                <Input label="标题" id="sales-alert-title" autoFocus maxLength={120} value={editor.value.title} onChange={event => setEditor({ ...editor, value: { ...editor.value, title: event.target.value } })} />
                <Textarea label="内容（可选）" id="sales-alert-message" maxLength={500} rows={3} value={editor.value.message} onChange={event => setEditor({ ...editor, value: { ...editor.value, message: event.target.value } })} />
                <Field>
                  <FieldLabel>预览</FieldLabel>
                  <UserAlert item={editor.value} />
                  {!settings.userAlertsEnabled ? <FieldDescription>用户端 Alert 总开关已关闭，保存后暂不显示。</FieldDescription> : null}
                </Field>
                <Field orientation="horizontal" className="justify-between gap-6 border-t pt-5">
                  <FieldContent>
                    <FieldLabel htmlFor="sales-alert-enabled">启用此 Alert</FieldLabel>
                    <FieldDescription>关闭后保留设置，不在用户端显示。</FieldDescription>
                  </FieldContent>
                  <Switch id="sales-alert-enabled" checked={editor.value.enabled} onCheckedChange={enabled => setEditor({ ...editor, value: { ...editor.value, enabled } })} />
                </Field>
              </FieldGroup> : editor.type === "coupon" ? <FieldGroup className="gap-5">
                <Input label="优惠码" id="sales-coupon-code" autoFocus value={editor.value.code} onChange={event => setEditor({ ...editor, value: { ...editor.value, code: event.target.value.toUpperCase() } })} />
                <Input label="优惠百分比" id="sales-coupon-percent" type="number" min="1" max="99" value={editor.value.percent} onChange={event => setEditor({ ...editor, value: { ...editor.value, percent: Number(event.target.value) } })} />
                <Field><FieldLabel>适用套餐</FieldLabel><div className="grid grid-cols-3 gap-2">{couponGroups.map(item => <label key={item.value} className="flex items-center gap-2 text-sm"><Checkbox checked={Boolean(editor.value.applicableGroups?.includes(item.value))} onCheckedChange={checked => toggleCouponScope("applicableGroups", item.value, checked === true, couponGroups)} />{item.label}</label>)}</div></Field>
                <Field><FieldLabel>适用计费周期</FieldLabel><div className="grid grid-cols-2 gap-2">{couponDurations.map(item => <label key={item.value} className="flex items-center gap-2 text-sm"><Checkbox checked={Boolean(editor.value.applicableDurations?.includes(item.value))} onCheckedChange={checked => toggleCouponScope("applicableDurations", item.value, checked === true, couponDurations)} />{item.label}</label>)}</div></Field>
                <div className="grid grid-cols-2 gap-3">
                  <NumberField label="总数量（0 不限）" id="sales-coupon-total-limit" value={editor.value.totalLimit || 0} onValueChange={next => setEditor({ ...editor, value: { ...editor.value, totalLimit: next } })} locale="zh-CN" min={0} />
                  <NumberField label="每账户次数（0 不限）" id="sales-coupon-account-limit" value={editor.value.perAccountLimit || 0} onValueChange={next => setEditor({ ...editor, value: { ...editor.value, perAccountLimit: next } })} locale="zh-CN" min={0} />
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
                  <DateRangePicker
                    label="生效日期区间"
                    placeholder="选择日期范围"
                    value={date?.from && date.to ? { start: date.from, end: date.to } : null}
                    onChange={range => setEditor({ ...editor, value: {
                      ...editor.value,
                      validFrom: startOfDay(range.start).toISOString(),
                      validUntil: addDays(startOfDay(range.end), 1).toISOString(),
                    } })}
                  />
                </Field> : null}
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={editor.value.enabled} onCheckedChange={checked => setEditor({ ...editor, value: { ...editor.value, enabled: checked === true } })} />启用优惠码</label>
              </FieldGroup> : editor.type === "faq" ? <FieldGroup className="gap-5">
                <Input label="问题" id="sales-faq-question" autoFocus maxLength={120} value={editor.value.question} onChange={event => setEditor({ ...editor, value: { ...editor.value, question: event.target.value } })} />
                <Textarea label="回答" id="sales-faq-answer" maxLength={500} rows={8} value={editor.value.answer} onChange={event => setEditor({ ...editor, value: { ...editor.value, answer: event.target.value } })} />
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={editor.value.enabled !== false} onCheckedChange={checked => setEditor({ ...editor, value: { ...editor.value, enabled: checked === true } })} />在价格页显示</label>
              </FieldGroup> : editor.type === "announcement" ? <FieldGroup className="gap-5">
                <Input label="标题" id="sales-announcement-title" autoFocus maxLength={80} value={editor.value.title} onChange={event => setEditor({ ...editor, value: { ...editor.value, title: event.target.value } })} />
                <Field><FieldLabel htmlFor="sales-announcement-content">Markdown 正文</FieldLabel><MarkdownEditor id="sales-announcement-content" value={editor.value.content} onChange={content => setEditor({ ...editor, value: { ...editor.value, content } })} /></Field>
                <Input label="发布时间" id="sales-announcement-published-at" type="datetime-local" required value={format(new Date(editor.value.publishedAt), "yyyy-MM-dd'T'HH:mm")} onChange={event => { if (event.target.value) setEditor({ ...editor, value: { ...editor.value, publishedAt: new Date(event.target.value).toISOString() } }) }} />
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={editor.value.enabled} onCheckedChange={checked => setEditor({ ...editor, value: { ...editor.value, enabled: checked === true } })} />在用户中心显示</label>
              </FieldGroup> : <FieldGroup className="gap-5">
                <Input label="分类" id="sales-markdown-category" maxLength={40} value={editor.value.category || ""} onChange={event => setEditor({ ...editor, value: { ...editor.value, category: event.target.value } })} />
                <Input label="标题" id="sales-markdown-title" autoFocus maxLength={80} value={editor.value.title} onChange={event => setEditor({ ...editor, value: { ...editor.value, title: event.target.value } })} />
                <Input label="简介" id="sales-markdown-description" maxLength={200} value={editor.value.description} onChange={event => setEditor({ ...editor, value: { ...editor.value, description: event.target.value } })} />
                <Field><FieldLabel htmlFor="sales-markdown-content">Markdown 正文</FieldLabel><MarkdownEditor id="sales-markdown-content" value={editor.value.content} onChange={content => setEditor({ ...editor, value: { ...editor.value, content } })} /></Field>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={editor.value.enabled} onCheckedChange={checked => setEditor({ ...editor, value: { ...editor.value, enabled: checked === true } })} />标记为可用</label>
              </FieldGroup>}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t pt-5">
              {!editor.isNew ? <ActionButton variant="danger" onClick={removeEditor} disabled={saving} label="删除" pending={savingAction === "delete"} arrow={false} /> : null}
              <div className="ml-auto flex gap-2">
                <DrawerClose asChild><Button variant="secondary" disabled={saving}>取消</Button></DrawerClose>
                <ActionButton onClick={saveEditor} disabled={saving} label={editor.isNew ? "添加" : "保存修改"} pendingLabel="保存中..." pending={savingAction === "save"} />
              </div>
            </div>
          </div> : null}
        </DrawerContent>
      </Drawer>
    </div>
  )
}
