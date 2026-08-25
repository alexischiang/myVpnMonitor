import * as React from "react"
import { toast } from "sonner"

import { fetchJson, putJson } from "@/api"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldLabel, FieldSet } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { PageHeader } from "@/components/features/shared"
import { useData } from "@/components/features/data-provider"
import type { SalesSettings } from "@/types"

export function GeneralSettingsPage() {
  const { runAsync } = useData()
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

  const changed = settings.registrationMode !== draft.registrationMode || settings.onboardingEnabled !== draft.onboardingEnabled

  return (
    <div className="grid gap-8 px-4 lg:px-6">
      <PageHeader title="通用设置" description="管理账户注册和用户中心的通用功能。" />
      <FieldSet className="gap-0">
        <Field orientation="responsive" className="justify-between border-b py-6 first:pt-0">
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
        <Field orientation="responsive" className="justify-between border-b py-6">
          <FieldContent>
            <FieldLabel htmlFor="onboarding-enabled">启用使用指引</FieldLabel>
            <FieldDescription>关闭后隐藏用户中心入口，新用户登录或注册后直接进入用户总览。</FieldDescription>
          </FieldContent>
          <Switch id="onboarding-enabled" checked={draft.onboardingEnabled} disabled={saving} onCheckedChange={checked => setDraft({ ...draft, onboardingEnabled: checked })} />
        </Field>
      </FieldSet>
      <div className="flex justify-end"><Button disabled={!changed || saving} onClick={() => void save()}>{saving ? "保存中" : "保存设置"}</Button></div>
    </div>
  )
}
