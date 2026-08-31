import * as React from "react"
import { Bell, UserRound } from "lucide-react"
import { toast } from "sonner"

import { fetchJson, putJson } from "@/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldLabel, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/features/shared"
import { useData } from "@/components/features/data-provider"
import { useSearchParamState } from "@/hooks/use-search-param-state"
import type { SalesSettings } from "@/types"

const alertRows = [
  { key: "payment", label: "用户支付提醒", description: "用户完成套餐、流量包或余额支付时提醒。" },
  { key: "ticket", label: "工单待处理提醒", description: "用户创建工单或追加回复时提醒。" },
  { key: "traffic", label: "用户流量提醒", description: "用户流量达到设定阈值时提醒。" },
] as const

export function GeneralSettingsPage() {
  const { runAsync } = useData()
  const [section, setSection] = useSearchParamState("section", "account")
  const [settings, setSettings] = React.useState<SalesSettings | null>(null)
  const [draft, setDraft] = React.useState<SalesSettings | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    fetchJson<SalesSettings>("/api/sales-settings").then(result => { setSettings(result); setDraft(result) }).catch(error => toast.error(error.message))
  }, [])

  async function save() {
    if (!draft || saving) return
    setSaving(true)
    try {
      const saved = await runAsync(() => putJson<SalesSettings>("/api/sales-settings", draft), "保存通用设置...")
      setSettings(saved)
      setDraft(saved)
      toast.success("通用设置已保存")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存通用设置失败")
    } finally {
      setSaving(false)
    }
  }

  if (!settings || !draft) return <div className="grid gap-4 px-4 lg:px-6"><Skeleton className="h-52" /><Skeleton className="h-40" /></div>

  const changed = settings.registrationMode !== draft.registrationMode || settings.onboardingEnabled !== draft.onboardingEnabled || JSON.stringify(settings.alertSettings) !== JSON.stringify(draft.alertSettings)

  return (
    <div className="grid gap-8 px-4 lg:px-6">
      <PageHeader title="通用设置" description="管理账户注册、用户中心和提醒功能。" />
      <Tabs value={section === "alerts" ? "alerts" : "account"} onValueChange={setSection} className="gap-6">
        <TabsList className="max-w-full justify-start">
          <TabsTrigger value="account"><UserRound />注册与用户中心</TabsTrigger>
          <TabsTrigger value="alerts"><Bell />提醒设置</TabsTrigger>
        </TabsList>
        <TabsContent value="account">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>注册与用户中心</CardTitle>
              <CardDescription>管理新用户注册和首次使用流程。</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldSet className="gap-0">
                <Field orientation="responsive" className="justify-between border-b pb-6">
                  <FieldContent>
                    <FieldLabel htmlFor="registration-mode">注册模式</FieldLabel>
                    <FieldDescription>设置新用户是否可以注册，以及是否必须填写邀请码。</FieldDescription>
                  </FieldContent>
                  <Select disabled={saving} value={draft.registrationMode} onValueChange={value => setDraft({ ...draft, registrationMode: value as SalesSettings["registrationMode"] })}>
                    <SelectTrigger id="registration-mode"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">允许公开注册</SelectItem>
                      <SelectItem value="invite_only">必须填写邀请码</SelectItem>
                      <SelectItem value="disabled">暂停注册</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field orientation="responsive" className="justify-between pt-6">
                  <FieldContent>
                    <FieldLabel htmlFor="onboarding-enabled">启用使用指引</FieldLabel>
                    <FieldDescription>关闭后隐藏用户中心入口，新用户登录或注册后直接进入用户总览。</FieldDescription>
                  </FieldContent>
                  <Switch id="onboarding-enabled" checked={draft.onboardingEnabled} disabled={saving} onCheckedChange={checked => setDraft({ ...draft, onboardingEnabled: checked })} />
                </Field>
              </FieldSet>
            </CardContent>
            <CardFooter className="justify-end gap-2 border-t">
              <Button variant="outline" disabled={!changed || saving} onClick={() => setDraft(settings)}>放弃更改</Button>
              <Button disabled={!changed || saving} onClick={() => void save()}>{saving ? "保存中" : "保存设置"}</Button>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="alerts">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>提醒设置</CardTitle>
              <CardDescription>分别设置管理员提醒渠道和用户流量邮件。</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-6">提醒类型</TableHead>
                    <TableHead className="text-center">Telegram</TableHead>
                    <TableHead className="pr-6 text-center">邮件</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertRows.map(row => (
                    <TableRow key={row.key}>
                      <TableCell className="px-6 whitespace-normal">
                        <p className="font-medium">{row.label}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{row.description}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox aria-label={`${row.label} Telegram`} checked={draft.alertSettings[row.key].telegram} disabled={saving} onCheckedChange={checked => setDraft({ ...draft, alertSettings: { ...draft.alertSettings, [row.key]: { ...draft.alertSettings[row.key], telegram: checked === true } } })} />
                      </TableCell>
                      <TableCell className="pr-6 text-center">
                        <Checkbox aria-label={`${row.label} 邮件`} checked={draft.alertSettings[row.key].mail} disabled={saving} onCheckedChange={checked => setDraft({ ...draft, alertSettings: { ...draft.alertSettings, [row.key]: { ...draft.alertSettings[row.key], mail: checked === true } } })} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <CardFooter className="flex-col items-stretch gap-6 border-t">
              <FieldSet className="gap-0">
                <Field orientation="responsive" className="justify-between border-b pb-6">
                  <FieldContent>
                    <FieldLabel htmlFor="traffic-user-mail">用户邮件提醒</FieldLabel>
                    <FieldDescription>达到流量阈值时，向该用户绑定的邮箱发送一次提醒。</FieldDescription>
                  </FieldContent>
                  <Switch id="traffic-user-mail" checked={draft.alertSettings.traffic.userMail} disabled={saving} onCheckedChange={checked => setDraft({ ...draft, alertSettings: { ...draft.alertSettings, traffic: { ...draft.alertSettings.traffic, userMail: checked } } })} />
                </Field>
                <Field orientation="responsive" className="justify-between pt-6">
                  <FieldContent>
                    <FieldLabel htmlFor="traffic-alert-threshold">流量提醒阈值</FieldLabel>
                    <FieldDescription>每个用户在每个流量周期内仅提醒一次；修改阈值后会按新阈值重新判断。</FieldDescription>
                  </FieldContent>
                  <div className="flex items-center gap-2">
                    <Input id="traffic-alert-threshold" type="number" min={1} max={100} step={1} value={draft.alertSettings.trafficThresholdPercent} disabled={saving} onChange={event => setDraft({ ...draft, alertSettings: { ...draft.alertSettings, trafficThresholdPercent: Number(event.target.value) } })} />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </Field>
              </FieldSet>
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={!changed || saving} onClick={() => setDraft(settings)}>放弃更改</Button>
                <Button disabled={!changed || saving} onClick={() => void save()}>{saving ? "保存中" : "保存设置"}</Button>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
