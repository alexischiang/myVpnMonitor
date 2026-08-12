import * as React from "react"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"

import { putJson } from "@/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useData } from "@/components/features/data-provider"
import { PageHeader } from "@/components/features/shared"
import type { PricingRow } from "@/types"

const periods = [
  { key: "monthly", unlimitedKey: "unlimitedMonthly", devicesKey: "monthlyDevices", label: "月付 / 30天" },
  { key: "quarterly", unlimitedKey: "unlimitedQuarterly", devicesKey: "quarterlyDevices", label: "季付 / 90天" },
  { key: "half_yearly", unlimitedKey: "unlimitedHalfYearly", devicesKey: "half_yearlyDevices", label: "半年付 / 180天" },
  { key: "yearly", unlimitedKey: "unlimitedYearly", devicesKey: "yearlyDevices", label: "年付 / 360天" },
] as const

export function PricingSettingsPage() {
  const { pricing, reload, runAsync } = useData()
  const [rows, setRows] = React.useState<PricingRow[]>(pricing)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => setRows(pricing), [pricing])

  function update(group: string, patch: Partial<PricingRow>) {
    setRows(current => current.map(row => row.group === group ? { ...row, ...patch } : row))
  }

  async function save() {
    setSaving(true)
    try {
      await runAsync(async () => {
        await putJson("/api/pricing", rows)
        await reload(["pricing"], { silent: true })
        toast.success("套餐配置已保存")
      }, "保存套餐配置...")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <PageHeader title="套餐管理" description="控制固定流量与无限流量价格、设备数和功能优缺点。" actions={<Button size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}保存配置</Button>} />
      <div className="grid gap-4">
        {rows.map(row => (
          <Card key={row.group}>
            <CardHeader>
              <CardTitle>{row.name || row.group.toUpperCase()}</CardTitle>
              <CardDescription>{row.title || "套餐配置"}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field><FieldLabel htmlFor={`${row.group}-name`}>套餐名称</FieldLabel><Input id={`${row.group}-name`} value={row.name || ""} onChange={event => update(row.group, { name: event.target.value })} /></Field>
                <Field><FieldLabel htmlFor={`${row.group}-title`}>套餐副标题</FieldLabel><Input id={`${row.group}-title`} value={row.title || ""} onChange={event => update(row.group, { title: event.target.value })} /></Field>
                <Field><FieldLabel htmlFor={`${row.group}-traffic`}>流量说明</FieldLabel><Input id={`${row.group}-traffic`} value={row.traffic || ""} onChange={event => update(row.group, { traffic: event.target.value })} /></Field>
                {row.lineType === "self_hosted" ? <Field><FieldLabel htmlFor={`${row.group}-traffic-bytes`}>3x-ui 周期额度（GB）</FieldLabel><Input id={`${row.group}-traffic-bytes`} type="number" min="0" step="1" value={row.trafficBytes === undefined ? "" : row.trafficBytes / 1024 ** 3} onChange={event => update(row.group, { trafficBytes: Number(event.target.value) * 1024 ** 3 })} /></Field> : null}
                <Field className="justify-end"><label className="flex h-9 items-center gap-2 text-sm"><Checkbox checked={Boolean(row.recommended)} onCheckedChange={checked => update(row.group, { recommended: Boolean(checked) })} />标记为推荐套餐</label></Field>
              </div>
              <Field><FieldLabel htmlFor={`${row.group}-description`}>套餐描述</FieldLabel><Input id={`${row.group}-description`} value={row.description || ""} onChange={event => update(row.group, { description: event.target.value })} /></Field>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {periods.filter(period => row.testPlan !== true || period.key === "monthly").map(period => (
                  <FieldGroup key={period.key} className="gap-4">
                    <h3 className="text-sm font-medium">{period.label}</h3>
                      <Field><FieldLabel htmlFor={`${row.group}-${period.key}`}>固定流量价格</FieldLabel><Input id={`${row.group}-${period.key}`} type="number" min="0" step="0.01" value={row[period.key] ?? ""} onChange={event => update(row.group, { [period.key]: Number(event.target.value) })} /></Field>
                      <Field><FieldLabel htmlFor={`${row.group}-${period.unlimitedKey}`}>无限流量价格</FieldLabel><Input id={`${row.group}-${period.unlimitedKey}`} type="number" min="0" step="0.01" value={row[period.unlimitedKey] ?? ""} onChange={event => update(row.group, { [period.unlimitedKey]: Number(event.target.value) })} /></Field>
                      <Field><FieldLabel htmlFor={`${row.group}-${period.devicesKey}`}>可绑定设备数</FieldLabel><Input id={`${row.group}-${period.devicesKey}`} type="number" min="0" step="1" value={row[period.devicesKey] ?? ""} onChange={event => update(row.group, { [period.devicesKey]: Number(event.target.value) })} /></Field>
                  </FieldGroup>
                ))}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field><FieldLabel htmlFor={`${row.group}-features`}>支持的优点（✓，每行一项）</FieldLabel><Textarea id={`${row.group}-features`} rows={5} value={(row.features || []).join("\n")} onChange={event => update(row.group, { features: event.target.value.split("\n") })} /></Field>
                <Field><FieldLabel htmlFor={`${row.group}-unavailable-features`}>不支持的缺点（×，每行一项）</FieldLabel><Textarea id={`${row.group}-unavailable-features`} rows={5} value={(row.unavailableFeatures || []).join("\n")} onChange={event => update(row.group, { unavailableFeatures: event.target.value.split("\n") })} /></Field>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
