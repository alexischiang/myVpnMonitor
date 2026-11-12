import * as React from "react"
import { Bell, Gift, Pencil, UserRound } from "lucide-react"
import { Link } from "react-router-dom"
import { toast } from "@/components/features/toast"

import { fetchJson, putJson } from "@/api"
import { Field, FieldContent, FieldDescription, FieldLabel, FieldSet } from "@/components/ui/field"
import { PageHeader } from "@/components/features/shared"
import { useData } from "@/components/features/data-provider"
import { useSearchParamState } from "@/hooks/use-search-param-state"
import type { CatalogV2Product, SalesSettings } from "@/types"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Input } from "@/components/arc/input/input"
import { Select } from "@/components/arc/select/select"
import { Switch } from "@/components/arc/switch/switch"
import { SimpleTable } from "@/components/features/simple-table"

const alertRows = [
  { key: "payment", label: "用户支付提醒", description: "用户完成套餐、流量包或余额支付时提醒。" },
  { key: "ticket", label: "工单待处理提醒", description: "用户创建工单或追加回复时提醒。" },
  { key: "delivery", label: "待交付提醒", description: "用户付款后有服务等待人工交付时提醒。" },
  { key: "traffic", label: "用户流量提醒", description: "用户流量达到设定阈值时提醒。" },
  { key: "subscriptionShare", label: "订阅疑似分享提醒", description: "24 小时内同一订阅链接从境内两个以上城市拉取时提醒，同一用户 24 小时内只提醒一次（出现新城市除外）。" },
] as const

// The server grants the first enabled period of the trial product.
function trialPeriod(product: CatalogV2Product) {
  return product.periods.filter(period => period.isEnabled).sort((a, b) => a.sortOrder - b.sortOrder)[0]
}

function trialProductSummary(product: CatalogV2Product) {
  const period = trialPeriod(product)
  if (!period) return ""
  const traffic = period.trafficBytes === null ? "无限流量" : `${Number((period.trafficBytes / 1024 ** 3).toFixed(2))} GB`
  return `${period.durationDays} 天 · ${traffic} · ${period.deviceLimit} 个在线 IP · 总名额 ${product.stock ?? "不限"}`
}

export function GeneralSettingsPage() {
  const { runAsync } = useData()
  const [section, setSection] = useSearchParamState("section", "account")
  const [settings, setSettings] = React.useState<SalesSettings | null>(null)
  const [draft, setDraft] = React.useState<SalesSettings | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [trialProducts, setTrialProducts] = React.useState<CatalogV2Product[]>([])

  React.useEffect(() => {
    fetchJson<SalesSettings>("/api/sales-settings").then(result => { setSettings(result); setDraft(result) }).catch(error => toast({ type: "error", title: error.message }))
    fetchJson<CatalogV2Product[]>("/api/catalog-v2/products").then(products => setTrialProducts(products
      .filter(product => product.type === "recurring_plan" && product.isEnabled && !product.isForSale && trialPeriod(product)?.priceCents === 0))).catch(error => toast({ type: "error", title: error.message }))
  }, [])

  async function save() {
    if (!draft || saving) return
    setSaving(true)
    try {
      const saved = await runAsync(() => putJson<SalesSettings>("/api/sales-settings", draft), "保存通用设置...")
      setSettings(saved)
      setDraft(saved)
      toast({ type: "success", title: "通用设置已保存" })
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "保存通用设置失败" })
    } finally {
      setSaving(false)
    }
  }

  if (!settings || !draft) return <div className="grid gap-4 px-4 lg:px-6"><Skeleton lines={5} /><Skeleton lines={4} /></div>

  const selectedTrialProduct = trialProducts.find(product => product.id === draft.trial.productId)
  const changed = settings.registrationMode !== draft.registrationMode || settings.onboardingEnabled !== draft.onboardingEnabled || JSON.stringify(settings.trial) !== JSON.stringify(draft.trial) || JSON.stringify(settings.alertSettings) !== JSON.stringify(draft.alertSettings)

  return (
    <div className="grid gap-8 px-4 lg:px-6">
      <PageHeader title="通用设置" description="管理账户注册、用户中心、试用套餐和提醒功能。" />
      <Tabs value={section === "alerts" || section === "trial" ? section : "account"} onValueChange={setSection} className="gap-6">
        <TabsList className="max-w-full justify-start">
          <TabsTrigger value="account"><UserRound />注册与用户中心</TabsTrigger>
          <TabsTrigger value="trial"><Gift />试用套餐</TabsTrigger>
          <TabsTrigger value="alerts"><Bell />提醒设置</TabsTrigger>
        </TabsList>
        <TabsContent value="account">
          <Card title="注册与用户中心" description="管理新用户注册和首次使用流程。"><FieldSet className="gap-0">
                <Field orientation="responsive" className="justify-between border-b pb-6">
                  <FieldContent>
                    <FieldLabel htmlFor="registration-mode">注册模式</FieldLabel>
                    <FieldDescription>设置新用户是否可以注册，以及是否必须填写邀请码。</FieldDescription>
                  </FieldContent>
                  <Select label="选择" hideLabel disabled={saving} value={draft.registrationMode} onValueChange={value => setDraft({ ...draft, registrationMode: value as SalesSettings["registrationMode"] })} id="registration-mode" options={[{ value: "open", label: "允许公开注册" }, { value: "invite_only", label: "必须填写邀请码" }, { value: "disabled", label: "暂停注册" }]} />
                </Field>
                <Field orientation="responsive" className="justify-between pt-6">
                  <FieldContent>
                    <FieldLabel htmlFor="onboarding-enabled">启用使用指引</FieldLabel>
                    <FieldDescription>关闭后隐藏用户中心入口，新用户登录或注册后直接进入用户总览。</FieldDescription>
                  </FieldContent>
                  <Switch id="onboarding-enabled" checked={draft.onboardingEnabled} disabled={saving} onCheckedChange={checked => setDraft({ ...draft, onboardingEnabled: checked })} />
                </Field>
              </FieldSet><div className="mt-4 flex items-center gap-2 justify-end gap-2 border-t">
              <Button variant="secondary" disabled={!changed || saving} onClick={() => setDraft(settings)}>放弃更改</Button>
              <Button disabled={!changed || saving} onClick={() => void save()}>{saving ? "保存中" : "保存设置"}</Button>
            </div></Card>
        </TabsContent>
        <TabsContent value="trial">
          <Card title="试用套餐" description="通过邀请码注册的新账户自动开通试用套餐；超出限制时账户仍可注册，但不发放试用。"><FieldSet className="gap-0">
                <Field orientation="responsive" className="justify-between border-b pb-6">
                  <FieldContent>
                    <FieldLabel htmlFor="trial-enabled">邀请注册赠送试用</FieldLabel>
                    <FieldDescription>开启前需要先选择试用商品。</FieldDescription>
                  </FieldContent>
                  <Switch id="trial-enabled" checked={draft.trial.enabled} disabled={saving} onCheckedChange={checked => setDraft({ ...draft, trial: { ...draft.trial, enabled: checked } })} />
                </Field>
                <Field orientation="responsive" className="justify-between border-b py-6">
                  <FieldContent>
                    <FieldLabel htmlFor="trial-product">试用商品</FieldLabel>
                    <FieldDescription>{selectedTrialProduct ? trialProductSummary(selectedTrialProduct) : trialProducts.length ? "可选已启用、未公开销售且价格为 ¥0 的周期套餐。" : "暂无可用商品，请先创建未公开销售且价格为 ¥0 的周期套餐。"}</FieldDescription>
                  </FieldContent>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="secondary"><Link to={selectedTrialProduct ? `/catalog-v2/products/${encodeURIComponent(selectedTrialProduct.id)}` : "/catalog-v2/products/new"}><Pencil />{selectedTrialProduct ? "编辑时长、流量和名额" : "新建试用商品"}</Link></Button>
                    <Select label="选择" hideLabel disabled={saving} value={draft.trial.productId} onValueChange={value => setDraft({ ...draft, trial: { ...draft.trial, productId: value } })} id="trial-product" options={trialProducts.map(product => ({ value: product.id, label: product.name }))} />
                  </div>
                </Field>
                <Field orientation="responsive" className="justify-between border-b py-6">
                  <FieldContent>
                    <FieldLabel htmlFor="trial-ip-limit">单个 IP 领取上限</FieldLabel>
                    <FieldDescription>同一注册 IP 累计最多领取的次数，不会随时间重置，IPv6 按 /64 网段计算；0 表示不限。</FieldDescription>
                  </FieldContent>
                  <Input label="输入" hideLabel id="trial-ip-limit" type="number" min={0} step={1} value={draft.trial.ipLimit} disabled={saving} onChange={event => setDraft({ ...draft, trial: { ...draft.trial, ipLimit: Number(event.target.value) } })} />
                </Field>
                <Field orientation="responsive" className="justify-between border-b py-6">
                  <FieldContent>
                    <FieldLabel htmlFor="trial-inviter-limit">单个邀请码每日上限</FieldLabel>
                    <FieldDescription>每个邀请码 24 小时内最多发放的次数；0 表示不限。</FieldDescription>
                  </FieldContent>
                  <Input label="输入" hideLabel id="trial-inviter-limit" type="number" min={0} step={1} value={draft.trial.inviterDailyLimit} disabled={saving} onChange={event => setDraft({ ...draft, trial: { ...draft.trial, inviterDailyLimit: Number(event.target.value) } })} />
                </Field>
                <Field orientation="responsive" className="justify-between pt-6">
                  <FieldContent>
                    <FieldLabel htmlFor="trial-speed-limit">试用限速</FieldLabel>
                    <FieldDescription>升级正式套餐后自动解除；0 表示不限速。</FieldDescription>
                  </FieldContent>
                  <div className="flex items-center gap-2">
                    <Input label="输入" hideLabel id="trial-speed-limit" type="number" min={0} step={1} value={draft.trial.speedLimitMbps} disabled={saving} onChange={event => setDraft({ ...draft, trial: { ...draft.trial, speedLimitMbps: Number(event.target.value) } })} />
                    <span className="text-sm text-muted-foreground">Mbps</span>
                  </div>
                </Field>
              </FieldSet><div className="mt-4 flex items-center gap-2 justify-end gap-2 border-t">
              <Button variant="secondary" disabled={!changed || saving} onClick={() => setDraft(settings)}>放弃更改</Button>
              <Button disabled={!changed || saving} onClick={() => void save()}>{saving ? "保存中" : "保存设置"}</Button>
            </div></Card>
        </TabsContent>
        <TabsContent value="alerts">
          <Card title="提醒设置" description="分别设置管理员提醒渠道和用户流量邮件。"><SimpleTable caption="提醒类型列表" columns={["提醒类型", "Telegram", "邮件"]} rows={alertRows} rowKey={(row) => row.key} cells={(row) => [<span className="whitespace-normal"><p className="font-medium">{row.label}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{row.description}</p></span>, <span className="text-center"><Checkbox aria-label={`${row.label} Telegram`} checked={draft.alertSettings[row.key].telegram} disabled={saving} onCheckedChange={checked => setDraft({ ...draft, alertSettings: { ...draft.alertSettings, [row.key]: { ...draft.alertSettings[row.key], telegram: checked === true } } })} /></span>, <span className="text-center"><Checkbox aria-label={`${row.label} 邮件`} checked={draft.alertSettings[row.key].mail} disabled={saving} onCheckedChange={checked => setDraft({ ...draft, alertSettings: { ...draft.alertSettings, [row.key]: { ...draft.alertSettings[row.key], mail: checked === true } } })} /></span>]} /><div className="mt-4 flex items-center gap-2 flex-col items-stretch gap-6 border-t">
              <FieldSet className="gap-0">
                <Field orientation="responsive" className="justify-between border-b pb-6">
                  <FieldContent>
                    <FieldLabel htmlFor="traffic-user-mail">用户邮件提醒</FieldLabel>
                    <FieldDescription>达到流量阈值时，向该用户绑定的邮箱发送一次提醒。</FieldDescription>
                  </FieldContent>
                  <Switch id="traffic-user-mail" checked={draft.alertSettings.traffic.userMail} disabled={saving} onCheckedChange={checked => setDraft({ ...draft, alertSettings: { ...draft.alertSettings, traffic: { ...draft.alertSettings.traffic, userMail: checked } } })} />
                </Field>
                <Field orientation="responsive" className="justify-between border-b py-6">
                  <FieldContent>
                    <FieldLabel htmlFor="traffic-alert-threshold">流量提醒阈值</FieldLabel>
                    <FieldDescription>每个用户在每个流量周期内仅提醒一次；修改阈值后会按新阈值重新判断。</FieldDescription>
                  </FieldContent>
                  <div className="flex items-center gap-2">
                    <Input label="输入" hideLabel id="traffic-alert-threshold" type="number" min={1} max={100} step={1} value={draft.alertSettings.trafficThresholdPercent} disabled={saving} onChange={event => setDraft({ ...draft, alertSettings: { ...draft.alertSettings, trafficThresholdPercent: Number(event.target.value) } })} />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </Field>
                <Field orientation="responsive" className="justify-between pt-6">
                  <FieldContent>
                    <FieldLabel htmlFor="traffic-user-depleted-mail">流量用尽邮件提醒</FieldLabel>
                    <FieldDescription>用户流量达到 100%、服务暂停时，向该用户绑定的邮箱发送一次提醒。</FieldDescription>
                  </FieldContent>
                  <Switch id="traffic-user-depleted-mail" checked={draft.alertSettings.traffic.userDepletedMail} disabled={saving} onCheckedChange={checked => setDraft({ ...draft, alertSettings: { ...draft.alertSettings, traffic: { ...draft.alertSettings.traffic, userDepletedMail: checked } } })} />
                </Field>
              </FieldSet>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" disabled={!changed || saving} onClick={() => setDraft(settings)}>放弃更改</Button>
                <Button disabled={!changed || saving} onClick={() => void save()}>{saving ? "保存中" : "保存设置"}</Button>
              </div>
            </div></Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
