import * as React from "react"
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { fetchJson, putJson } from "@/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import type { PaymentSettings } from "@/types"

export function PaymentSettingsPage() {
  const [settings, setSettings] = React.useState<PaymentSettings | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    fetchJson<PaymentSettings>("/api/payment-settings")
      .then(setSettings)
      .catch(error => toast.error(error instanceof Error ? error.message : "支付设置加载失败"))
  }, [])

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!settings || saving) return
    setSaving(true)
    try {
      const next = await putJson<PaymentSettings>("/api/payment-settings", settings)
      setSettings(next)
      toast.success("支付设置已保存")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "支付设置保存失败")
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return <main className="grid gap-4 px-4 lg:px-6"><Skeleton className="h-16" /><Skeleton className="h-96" /></main>
  }

  return (
    <form className="mx-auto grid w-full max-w-7xl gap-6 px-4 lg:px-6" onSubmit={save}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <header className="grid gap-1">
          <h2 className="text-xl font-semibold tracking-tight">支付渠道配置</h2>
          <p className="text-sm text-muted-foreground">配置支付平台连接、商户凭证和回调地址。保存后新订单立即使用。</p>
        </header>
        <Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}{saving ? "保存中..." : "保存设置"}</Button>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <section className="grid gap-4" aria-label="支付接入配置">
          <Card>
            <CardHeader>
              <CardTitle>支付接入</CardTitle>
              <CardDescription>配置平台接口以及支付宝、微信对应的通道。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <Field>
                <FieldLabel htmlFor="payment-api-base-url">支付平台地址</FieldLabel>
                <Input id="payment-api-base-url" type="url" required value={settings.apiBaseUrl} onChange={event => setSettings({ ...settings, apiBaseUrl: event.target.value })} placeholder="https://pay.example.com" />
                <FieldDescription>无需填写末尾斜杠。</FieldDescription>
              </Field>
              <Separator />
              <div className="grid gap-6 md:grid-cols-2">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="payment-alipay-channel">支付宝通道码</FieldLabel>
                    <Input id="payment-alipay-channel" required maxLength={64} value={settings.alipayChannelCode} onChange={event => setSettings({ ...settings, alipayChannelCode: event.target.value })} placeholder="例如：100" />
                    <FieldDescription>用户选择支付宝时发送给支付平台。</FieldDescription>
                  </Field>
                  <Field orientation="horizontal">
                    <Checkbox id="payment-alipay-enabled" checked={settings.alipayEnabled} onCheckedChange={checked => setSettings({ ...settings, alipayEnabled: checked === true })} />
                    <FieldLabel htmlFor="payment-alipay-enabled">启用支付宝支付</FieldLabel>
                  </Field>
                </FieldGroup>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="payment-wechat-channel">微信通道码</FieldLabel>
                    <Input id="payment-wechat-channel" required maxLength={64} value={settings.wechatChannelCode} onChange={event => setSettings({ ...settings, wechatChannelCode: event.target.value })} placeholder="例如：200" />
                    <FieldDescription>用户选择微信支付时发送给支付平台。</FieldDescription>
                  </Field>
                  <Field orientation="horizontal">
                    <Checkbox id="payment-wechat-enabled" checked={settings.wechatEnabled} onCheckedChange={checked => setSettings({ ...settings, wechatEnabled: checked === true })} />
                    <FieldLabel htmlFor="payment-wechat-enabled">启用微信支付</FieldLabel>
                  </Field>
                </FieldGroup>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>回调地址</CardTitle>
              <CardDescription>支付平台必须能通过公网 HTTPS 访问异步通知地址。</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="payment-notify-url">异步通知地址</FieldLabel>
                  <Input id="payment-notify-url" type="url" required value={settings.notifyUrl} onChange={event => setSettings({ ...settings, notifyUrl: event.target.value })} placeholder="https://example.com/api/payments/callback" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="payment-return-url">支付完成返回地址</FieldLabel>
                  <Input id="payment-return-url" type="url" required value={settings.returnUrl} onChange={event => setSettings({ ...settings, returnUrl: event.target.value })} placeholder="https://example.com/account/payment/result" />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </section>
        <aside className="grid gap-4 xl:sticky xl:top-4" aria-label="商户凭证配置">
          <Card>
            <CardHeader>
              <CardTitle>商户凭证</CardTitle>
              <CardDescription>用于创建、查询订单和验证支付通知签名。</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="payment-merchant-id">商户 ID</FieldLabel>
                  <Input id="payment-merchant-id" required autoComplete="off" value={settings.merchantId} onChange={event => setSettings({ ...settings, merchantId: event.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="payment-merchant-secret">商户密钥 <Badge variant={settings.merchantSecretConfigured ? "success" : "destructive"}>{settings.merchantSecretConfigured ? "已配置" : "未配置"}</Badge></FieldLabel>
                  <Input id="payment-merchant-secret" required autoComplete="off" value={settings.merchantSecret || ""} onChange={event => setSettings({ ...settings, merchantSecret: event.target.value })} />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
          <Alert>
            <ShieldCheck />
            <AlertTitle>凭证仅管理员可见</AlertTitle>
            <AlertDescription>修改并保存后，新支付请求和回调验签立即使用新凭证。</AlertDescription>
          </Alert>
        </aside>
      </div>
    </form>
  )
}
