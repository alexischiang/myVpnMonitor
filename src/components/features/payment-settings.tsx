import * as React from "react"
import { Loader2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react"
import { toast } from "@/components/features/toast"

import { deleteJson, fetchJson, postJson, putJson } from "@/api"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import type { PaymentSettings } from "@/types"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Input } from "@/components/arc/input/input"
import { PasswordField } from "@/components/arc/password-field/password-field"
import { Switch } from "@/components/arc/switch/switch"
import { SimpleTable } from "@/components/features/simple-table"
import { NumberField } from "@/components/arc/number-field/number-field"

function newPlatform(priority: number): PaymentSettings {
  return {
    id: "",
    name: "新汇支付",
    displayName: "新汇支付",
    provider: "xinhui",
    enabled: true,
    priority,
    apiBaseUrl: "https://api.shrtxs.cn",
    merchantId: "",
    merchantSecret: "",
    merchantSecretConfigured: false,
    alipayChannelCode: "alipay",
    wechatChannelCode: "wxpay",
    alipayEnabled: true,
    wechatEnabled: true,
    notifyUrl: "",
    returnUrl: "",
  }
}

function newTestPlatform(priority: number): PaymentSettings {
  return {
    ...newPlatform(priority),
    name: "测试支付",
    displayName: "测试支付",
    provider: "test",
    apiBaseUrl: "",
    merchantId: "",
    alipayChannelCode: "100",
    wechatChannelCode: "200",
  }
}

// Checkout tax rate applied to new orders; products can opt out with 收取税费 in the product editor.
function TaxRateSettingsCard() {
  const [savedRate, setSavedRate] = React.useState<number | null>(null)
  const [rate, setRate] = React.useState("")
  const [loadError, setLoadError] = React.useState("")
  const [error, setError] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => { fetchJson<{ taxRate: number }>("/api/checkout-settings").then(data => { setSavedRate(data.taxRate); setRate(String(data.taxRate)) }).catch(cause => setLoadError(cause instanceof Error ? cause.message : "税率加载失败")) }, [])
  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    try {
      const data = await putJson<{ taxRate: number }>("/api/checkout-settings", { taxRate: rate === "" ? "" : Number(rate) })
      setSavedRate(data.taxRate)
      setRate(String(data.taxRate))
      toast({ type: "success", title: `税率已保存为 ${data.taxRate}%` })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存税率失败")
    } finally { setSaving(false) }
  }
  return <Card title="税费设置" description="结账时按商品金额计算税费，仅影响之后创建的订单，已有订单保留下单时的税率。"><>
      {loadError ? <Alert tone="danger" title={loadError} />
        : savedRate === null ? <Skeleton lines={3} className="max-w-sm" />
        : <form className="max-w-sm" noValidate onSubmit={event => void save(event)}>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="checkout-tax-rate">税率（%）</FieldLabel>
            <div className="flex gap-2"><Input label="输入" hideLabel id="checkout-tax-rate" type="number" inputMode="decimal" min="0" max="100" step="0.01" className="tabular-nums" value={rate} aria-invalid={Boolean(error)} aria-describedby={error ? "checkout-tax-rate-error" : "checkout-tax-rate-help"} onChange={event => { setRate(event.target.value); setError("") }} disabled={saving} /><ActionButton type="submit" disabled={saving || rate === String(savedRate)} label="保存税率" pending={saving} /></div>
            {error ? <FieldError id="checkout-tax-rate-error">{error}</FieldError> : <FieldDescription id="checkout-tax-rate-help">0–100，最多两位小数。商品可在编辑页取消“收取税费”。</FieldDescription>}
          </Field>
        </form>}
    </></Card>
}

export function PaymentSettingsPage() {
  const [platforms, setPlatforms] = React.useState<PaymentSettings[] | null>(null)
  const [draft, setDraft] = React.useState<PaymentSettings | null>(null)
  const [deleting, setDeleting] = React.useState<PaymentSettings | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    fetchJson<PaymentSettings[]>("/api/payment-settings")
      .then(setPlatforms)
      .catch(error => toast({ type: "error", title: error instanceof Error ? error.message : "支付平台加载失败" }))
  }, [])

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || saving) return
    setSaving(true)
    try {
      const next = draft.id
        ? await putJson<PaymentSettings>(`/api/payment-settings/${encodeURIComponent(draft.id)}`, draft)
        : await postJson<PaymentSettings>("/api/payment-settings", draft)
      setPlatforms(current => current ? (draft.id ? current.map(item => item.id === next.id ? next : item) : [...current, next]) : [next])
      setDraft(null)
      toast({ type: "success", title: draft.id ? "支付平台已更新" : "支付平台已添加" })
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "支付平台保存失败" })
    } finally {
      setSaving(false)
    }
  }

  async function setEnabled(platform: PaymentSettings, enabled: boolean) {
    setPlatforms(current => current?.map(item => item.id === platform.id ? { ...item, enabled } : item) || null)
    try {
      const next = await putJson<PaymentSettings>(`/api/payment-settings/${encodeURIComponent(platform.id)}`, { ...platform, enabled })
      setPlatforms(current => current?.map(item => item.id === next.id ? next : item) || null)
    } catch (error) {
      setPlatforms(current => current?.map(item => item.id === platform.id ? platform : item) || null)
      toast({ type: "error", title: error instanceof Error ? error.message : "平台状态更新失败" })
    }
  }

  async function remove() {
    if (!deleting) return
    try {
      await deleteJson(`/api/payment-settings/${encodeURIComponent(deleting.id)}`)
      setPlatforms(current => current?.filter(item => item.id !== deleting.id) || null)
      setDeleting(null)
      toast({ type: "success", title: "支付平台已删除" })
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "支付平台删除失败" })
    }
  }

  if (!platforms) return <main className="grid gap-4 px-4 lg:px-6"><Skeleton lines={3} /><Skeleton lines={6} /></main>

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 lg:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <section className="grid gap-1">
          <h2 className="text-xl font-semibold tracking-tight">支付平台</h2>
          <p className="text-sm text-muted-foreground">按优先级为新订单选择首个支持对应支付方式的平台。</p>
        </section>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setDraft(newTestPlatform(platforms.length))}><Plus />新增测试平台</Button><Button onClick={() => setDraft(newPlatform(platforms.length))}><Plus />新增线上平台</Button></div>
      </header>

      <Card title="接入列表" description={platforms.length ? `共 ${platforms.length} 个平台，数字越小优先级越高。` : "尚未配置支付平台。"}><>
          {platforms.length ? (
            <SimpleTable caption="平台列表" columns={["平台", "支付方式", "优先级", "接口地址", "状态", "操作"]} rows={platforms} rowKey={(platform) => platform.id} cells={(platform) => [<><strong className="font-medium">{platform.name}</strong>{platform.provider === "test" ? <Badge className="ml-2">本地测试</Badge> : null}</>, <span className="space-x-1">{platform.alipayEnabled ? <Badge>支付宝</Badge> : null}{platform.wechatEnabled ? <Badge>微信</Badge> : null}</span>, <>{platform.priority}</>, <span className="max-w-64 truncate font-mono text-xs">{platform.apiBaseUrl}</span>, <Switch checked={platform.enabled} onCheckedChange={enabled => void setEnabled(platform, enabled)} aria-label={`${platform.name}${platform.enabled ? "停用" : "启用"}`} />, <span className="text-right"><>
                        <Tooltip content="编辑平台"><Button variant="ghost" size="icon" onClick={() => setDraft(platform)}><Pencil /><span className="sr-only">编辑 {platform.name}</span></Button></Tooltip>
                        <Tooltip content="删除平台"><Button variant="ghost" size="icon" onClick={() => setDeleting(platform)}><Trash2 /><span className="sr-only">删除 {platform.name}</span></Button></Tooltip>
                      </></span>]} />
          ) : <Alert className="mx-6" title="支付尚未启用">新增并启用一个平台后，支付宝和微信入口会自动开放。</Alert>}
        </></Card>

      <TaxRateSettingsCard />

      <Alert title="测试平台仅在本地结算">测试订单不会请求线上网关；线上平台的凭证不会回显，异步通知地址需要可被公网 HTTPS 访问。</Alert>

      <Dialog open={Boolean(draft)} onOpenChange={open => !open && setDraft(null)}>
        <DialogContent size="xl" title={draft?.id ? "编辑支付平台" : "新增支付平台"} description="配置平台地址、商户凭证、支付通道和回调地址。">
          {draft ? <form className="grid gap-6" onSubmit={save}>
            <FieldGroup className="gap-5">
              <Card title="基础信息" description="设置后台名称、前台显示名称、调用地址和使用优先级。" headerAction={<Field orientation="horizontal"><FieldLabel htmlFor="payment-enabled">启用平台</FieldLabel><Switch id="payment-enabled" checked={draft.enabled} onCheckedChange={enabled => setDraft({ ...draft, enabled })} /></Field>}><div className="grid gap-4 sm:grid-cols-3">
                  <Input label="平台名称" id="payment-name" required maxLength={80} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} />
                  <Input label="前台显示名称" id="payment-display-name" required maxLength={80} value={draft.displayName} onChange={event => setDraft({ ...draft, displayName: event.target.value })} />
                  <NumberField label="优先级" id="payment-priority" value={draft.priority} onValueChange={next => setDraft({ ...draft, priority: next })} locale="zh-CN" min={0} max={999} />
                  {draft.provider !== "test" ? <div className="sm:col-span-3"><Input label="接口地址" id="payment-api-url" type="url" required value={draft.apiBaseUrl} onChange={event => setDraft({ ...draft, apiBaseUrl: event.target.value })} /></div> : null}
                </div></Card>

              {draft.provider !== "test" ? <Card title="商户凭证" description="用于创建订单和验证 MD5 支付通知。"><div className="grid gap-4 sm:grid-cols-2">
                  <Input label="商户 ID" id="payment-merchant-id" required autoComplete="off" value={draft.merchantId} onChange={event => setDraft({ ...draft, merchantId: event.target.value })} />
                  <Field><FieldLabel htmlFor="payment-secret">商户密钥 <Badge tone={draft.merchantSecretConfigured ? "success" : "danger"}>{draft.merchantSecretConfigured ? "已配置" : "未配置"}</Badge></FieldLabel><PasswordField label="输入" hideLabel id="payment-secret" required={!draft.merchantSecretConfigured} autoComplete="new-password" value={draft.merchantSecret || ""} onChange={event => setDraft({ ...draft, merchantSecret: event.target.value })} /></Field>
                </div></Card> : null}

              {draft.provider !== "test" ? <Card title="支付通道" description="分别设置支付宝和微信使用的通道码。"><div className="grid gap-5 sm:grid-cols-2">
                  <Field>
                    <div className="flex items-center justify-between gap-4"><FieldLabel htmlFor="payment-alipay-channel">支付宝通道码</FieldLabel><Field orientation="horizontal"><FieldLabel htmlFor="payment-alipay-enabled">启用</FieldLabel><Switch id="payment-alipay-enabled" checked={draft.alipayEnabled} onCheckedChange={alipayEnabled => setDraft({ ...draft, alipayEnabled })} /></Field></div>
                    <Input label="输入" hideLabel id="payment-alipay-channel" required value={draft.alipayChannelCode} onChange={event => setDraft({ ...draft, alipayChannelCode: event.target.value })} />
                  </Field>
                  <Field>
                    <div className="flex items-center justify-between gap-4"><FieldLabel htmlFor="payment-wechat-channel">微信通道码</FieldLabel><Field orientation="horizontal"><FieldLabel htmlFor="payment-wechat-enabled">启用</FieldLabel><Switch id="payment-wechat-enabled" checked={draft.wechatEnabled} onCheckedChange={wechatEnabled => setDraft({ ...draft, wechatEnabled })} /></Field></div>
                    <Input label="输入" hideLabel id="payment-wechat-channel" required value={draft.wechatChannelCode} onChange={event => setDraft({ ...draft, wechatChannelCode: event.target.value })} />
                  </Field>
                </div></Card> : null}

              {draft.provider !== "test" ? <Card title="回调地址" description="支付平台需要通过公网地址发送通知并返回结果。"><div className="grid gap-4 sm:grid-cols-2">
                  <Input label="异步通知地址" id="payment-notify-url" type="url" value={draft.notifyUrl} onChange={event => setDraft({ ...draft, notifyUrl: event.target.value })} placeholder="留空时根据 PUBLIC_BASE_URL 自动生成" />
                  <Input label="支付完成返回地址" id="payment-return-url" type="url" value={draft.returnUrl} onChange={event => setDraft({ ...draft, returnUrl: event.target.value })} placeholder="留空时根据 PUBLIC_BASE_URL 自动生成" />
                </div></Card> : null}
            </FieldGroup>
            <div className="mt-6 flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary" disabled={saving}>取消</Button></DialogClose><ActionButton type="submit" label="保存平台" pendingLabel="保存中..." pending={saving} /></div>
          </form> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={open => !open && setDeleting(null)}>
        <DialogContent title="删除支付平台？" description={`将删除“${deleting?.name}”的配置。已有订单仍保留记录，但删除后无法再通过该平台主动查单。`}><div className="mt-6 flex flex-wrap justify-end gap-2"><DialogClose asChild><Button variant="secondary">取消</Button></DialogClose><DialogClose asChild><Button onClick={() => void remove()}>确认删除</Button></DialogClose></div></DialogContent>
      </Dialog>
    </div>
  )
}
