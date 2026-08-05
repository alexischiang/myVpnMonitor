import * as React from "react"
import { Loader2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { deleteJson, fetchJson, postJson, putJson } from "@/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { PaymentSettings } from "@/types"

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

export function PaymentSettingsPage() {
  const [platforms, setPlatforms] = React.useState<PaymentSettings[] | null>(null)
  const [draft, setDraft] = React.useState<PaymentSettings | null>(null)
  const [deleting, setDeleting] = React.useState<PaymentSettings | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    fetchJson<PaymentSettings[]>("/api/payment-settings")
      .then(setPlatforms)
      .catch(error => toast.error(error instanceof Error ? error.message : "支付平台加载失败"))
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
      toast.success(draft.id ? "支付平台已更新" : "支付平台已添加")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "支付平台保存失败")
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
      toast.error(error instanceof Error ? error.message : "平台状态更新失败")
    }
  }

  async function remove() {
    if (!deleting) return
    try {
      await deleteJson(`/api/payment-settings/${encodeURIComponent(deleting.id)}`)
      setPlatforms(current => current?.filter(item => item.id !== deleting.id) || null)
      setDeleting(null)
      toast.success("支付平台已删除")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "支付平台删除失败")
    }
  }

  if (!platforms) return <main className="grid gap-4 px-4 lg:px-6"><Skeleton className="h-16" /><Skeleton className="h-96" /></main>

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 lg:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <section className="grid gap-1">
          <h2 className="text-xl font-semibold tracking-tight">支付平台</h2>
          <p className="text-sm text-muted-foreground">按优先级为新订单选择首个支持对应支付方式的平台。</p>
        </section>
        <Button onClick={() => setDraft(newPlatform(platforms.length))}><Plus />新增平台</Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>接入列表</CardTitle>
          <CardDescription>{platforms.length ? `共 ${platforms.length} 个平台，数字越小优先级越高。` : "尚未配置支付平台。"}</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {platforms.length ? (
            <Table>
              <TableHeader><TableRow><TableHead>平台</TableHead><TableHead>支付方式</TableHead><TableHead>优先级</TableHead><TableHead>接口地址</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {platforms.map(platform => (
                  <TableRow key={platform.id}>
                    <TableCell><strong className="font-medium">{platform.name}</strong></TableCell>
                    <TableCell className="space-x-1">{platform.alipayEnabled ? <Badge>支付宝</Badge> : null}{platform.wechatEnabled ? <Badge variant="secondary">微信</Badge> : null}</TableCell>
                    <TableCell>{platform.priority}</TableCell>
                    <TableCell className="max-w-64 truncate font-mono text-xs">{platform.apiBaseUrl}</TableCell>
                    <TableCell><Switch checked={platform.enabled} onCheckedChange={enabled => void setEnabled(platform, enabled)} aria-label={`${platform.name}${platform.enabled ? "停用" : "启用"}`} /></TableCell>
                    <TableCell className="text-right">
                      <TooltipProvider>
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setDraft(platform)}><Pencil /><span className="sr-only">编辑 {platform.name}</span></Button></TooltipTrigger><TooltipContent>编辑平台</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setDeleting(platform)}><Trash2 /><span className="sr-only">删除 {platform.name}</span></Button></TooltipTrigger><TooltipContent>删除平台</TooltipContent></Tooltip>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <Alert className="mx-6"><ShieldCheck /><AlertTitle>支付尚未启用</AlertTitle><AlertDescription>新增并启用一个平台后，支付宝和微信入口会自动开放。</AlertDescription></Alert>}
        </CardContent>
      </Card>

      <Alert><ShieldCheck /><AlertTitle>凭证不会回显</AlertTitle><AlertDescription>编辑已有平台时留空凭证字段即可保留原值。异步通知地址需要可被支付平台通过公网 HTTPS 访问。</AlertDescription></Alert>

      <Dialog open={Boolean(draft)} onOpenChange={open => !open && setDraft(null)}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
          {draft ? <form className="grid gap-6" onSubmit={save}>
            <DialogHeader><DialogTitle>{draft.id ? "编辑支付平台" : "新增支付平台"}</DialogTitle><DialogDescription>配置平台地址、商户凭证、支付通道和回调地址。</DialogDescription></DialogHeader>
            <FieldGroup className="gap-5">
              <Card>
                <CardHeader>
                  <CardTitle>基础信息</CardTitle>
                  <CardDescription>设置后台名称、前台显示名称、调用地址和使用优先级。</CardDescription>
                  <CardAction><Field orientation="horizontal"><FieldLabel htmlFor="payment-enabled">启用平台</FieldLabel><Switch id="payment-enabled" checked={draft.enabled} onCheckedChange={enabled => setDraft({ ...draft, enabled })} /></Field></CardAction>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-3">
                  <Field><FieldLabel htmlFor="payment-name">平台名称</FieldLabel><Input id="payment-name" required maxLength={80} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></Field>
                  <Field><FieldLabel htmlFor="payment-display-name">前台显示名称</FieldLabel><Input id="payment-display-name" required maxLength={80} value={draft.displayName} onChange={event => setDraft({ ...draft, displayName: event.target.value })} /></Field>
                  <Field><FieldLabel htmlFor="payment-priority">优先级</FieldLabel><Input id="payment-priority" type="number" min={0} max={999} required value={draft.priority} onChange={event => setDraft({ ...draft, priority: Number(event.target.value) })} /></Field>
                  <Field className="sm:col-span-3"><FieldLabel htmlFor="payment-api-url">接口地址</FieldLabel><Input id="payment-api-url" type="url" required value={draft.apiBaseUrl} onChange={event => setDraft({ ...draft, apiBaseUrl: event.target.value })} /></Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>商户凭证</CardTitle>
                  <CardDescription>用于创建订单和验证 MD5 支付通知。</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <Field><FieldLabel htmlFor="payment-merchant-id">商户 ID</FieldLabel><Input id="payment-merchant-id" required autoComplete="off" value={draft.merchantId} onChange={event => setDraft({ ...draft, merchantId: event.target.value })} /></Field>
                  <Field><FieldLabel htmlFor="payment-secret">商户密钥 <Badge variant={draft.merchantSecretConfigured ? "success" : "destructive"}>{draft.merchantSecretConfigured ? "已配置" : "未配置"}</Badge></FieldLabel><Input id="payment-secret" type="password" required={!draft.merchantSecretConfigured} autoComplete="new-password" value={draft.merchantSecret || ""} onChange={event => setDraft({ ...draft, merchantSecret: event.target.value })} /></Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>支付通道</CardTitle>
                  <CardDescription>分别设置支付宝和微信使用的通道码。</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-5 sm:grid-cols-2">
                  <Field>
                    <div className="flex items-center justify-between gap-4"><FieldLabel htmlFor="payment-alipay-channel">支付宝通道码</FieldLabel><Field orientation="horizontal"><FieldLabel htmlFor="payment-alipay-enabled">启用</FieldLabel><Switch id="payment-alipay-enabled" checked={draft.alipayEnabled} onCheckedChange={alipayEnabled => setDraft({ ...draft, alipayEnabled })} /></Field></div>
                    <Input id="payment-alipay-channel" required value={draft.alipayChannelCode} onChange={event => setDraft({ ...draft, alipayChannelCode: event.target.value })} />
                  </Field>
                  <Field>
                    <div className="flex items-center justify-between gap-4"><FieldLabel htmlFor="payment-wechat-channel">微信通道码</FieldLabel><Field orientation="horizontal"><FieldLabel htmlFor="payment-wechat-enabled">启用</FieldLabel><Switch id="payment-wechat-enabled" checked={draft.wechatEnabled} onCheckedChange={wechatEnabled => setDraft({ ...draft, wechatEnabled })} /></Field></div>
                    <Input id="payment-wechat-channel" required value={draft.wechatChannelCode} onChange={event => setDraft({ ...draft, wechatChannelCode: event.target.value })} />
                  </Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>回调地址</CardTitle>
                  <CardDescription>支付平台需要通过公网地址发送通知并返回结果。</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <Field><FieldLabel htmlFor="payment-notify-url">异步通知地址</FieldLabel><Input id="payment-notify-url" type="url" value={draft.notifyUrl} onChange={event => setDraft({ ...draft, notifyUrl: event.target.value })} placeholder="留空时根据 PUBLIC_BASE_URL 自动生成" /></Field>
                  <Field><FieldLabel htmlFor="payment-return-url">支付完成返回地址</FieldLabel><Input id="payment-return-url" type="url" value={draft.returnUrl} onChange={event => setDraft({ ...draft, returnUrl: event.target.value })} placeholder="留空时根据 PUBLIC_BASE_URL 自动生成" /></Field>
                </CardContent>
              </Card>
            </FieldGroup>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={saving}>取消</Button></DialogClose><Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : null}{saving ? "保存中..." : "保存平台"}</Button></DialogFooter>
          </form> : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={open => !open && setDeleting(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除支付平台？</AlertDialogTitle><AlertDialogDescription>将删除“{deleting?.name}”的配置。已有订单仍保留记录，但删除后无法再通过该平台主动查单。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => void remove()}>确认删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
