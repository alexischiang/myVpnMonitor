import * as React from "react"
import { HelpCircle, Save } from "lucide-react"

import { fetchJson, putJson } from "@/api"
import { toast } from "@/components/features/toast"
import { ActionButton } from "@/components/arc/action-button/action-button"
import { Badge } from "@/components/arc/badge/badge"
import { Input } from "@/components/arc/input/input"
import { Select } from "@/components/arc/select/select"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { formatMoney } from "@/utils"

// VPS monthly cost of a Node Hub machine, keyed by its billing guid (hub-m<id>). The sales
// profitability report prices each machine's traffic with it.

export type MachineCostConfig = { purchaseDate: string; monthlyFee: number; trafficQuotaGiB: number; trafficMode: "in_out" | "out_only" }
type CostDraft = { purchaseDate: string; monthlyFee: string; trafficQuotaGiB: string; trafficMode: "in_out" | "out_only" }
type MonitorRows = { configured: boolean; nodes?: Array<{ guid: string; costConfig: MachineCostConfig | null }> }

/** Current cost settings of every machine, by guid; reload after a save or with the page. */
export function useMachineCosts() {
  const [costs, setCosts] = React.useState<Record<string, MachineCostConfig | null>>({})
  const reload = React.useCallback(async (background = false) => {
    try {
      const result = await fetchJson<MonitorRows>("/api/xui-monitor", { background })
      setCosts(Object.fromEntries((result.nodes || []).map(node => [node.guid, node.costConfig])))
    } catch {
      // The machine list still works without costs; the column shows "-" until the next reload.
    }
  }, [])
  React.useEffect(() => { void reload() }, [reload])
  const setCost = React.useCallback((guid: string, costConfig: MachineCostConfig) => setCosts(current => ({ ...current, [guid]: costConfig })), [])
  return { costs, reload, setCost }
}

export function MachineCostSummary({ cost }: { cost: MachineCostConfig | null | undefined }) {
  if (cost === undefined) return <span className="text-muted-foreground">-</span>
  if (!cost) return <Badge tone="warning">未设置成本</Badge>
  return <div className="grid"><span className="tabular-nums">{formatMoney(cost.monthlyFee)} / 月</span><span className="text-xs text-muted-foreground tabular-nums">{cost.trafficQuotaGiB} GiB · {cost.trafficMode === "out_only" ? "out" : "in + out"}</span></div>
}

function draftFrom(cost: MachineCostConfig | null | undefined): CostDraft {
  return {
    purchaseDate: cost?.purchaseDate || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }),
    monthlyFee: cost ? String(cost.monthlyFee) : "",
    trafficQuotaGiB: cost ? String(cost.trafficQuotaGiB) : "",
    trafficMode: cost?.trafficMode || "in_out",
  }
}

export function MachineCostSection({ guid, cost, onSaved }: { guid: string; cost: MachineCostConfig | null | undefined; onSaved: (cost: MachineCostConfig) => void }) {
  const [draft, setDraft] = React.useState(() => draftFrom(cost))
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => { setDraft(draftFrom(cost)) }, [cost, guid])
  const changed = !cost
    ? Boolean(draft.monthlyFee || draft.trafficQuotaGiB)
    : draft.purchaseDate !== cost.purchaseDate || Number(draft.monthlyFee) !== cost.monthlyFee || Number(draft.trafficQuotaGiB) !== cost.trafficQuotaGiB || draft.trafficMode !== cost.trafficMode
  const complete = Boolean(draft.purchaseDate && draft.monthlyFee !== "" && draft.trafficQuotaGiB)

  async function save() {
    setSaving(true)
    try {
      const result = await putJson<{ costConfig: MachineCostConfig }>(`/api/sales-traffic/nodes/${encodeURIComponent(guid)}/cost`, { costConfig: { ...draft, monthlyFee: Number(draft.monthlyFee), trafficQuotaGiB: Number(draft.trafficQuotaGiB) } })
      onSaved(result.costConfig)
      toast({ type: "success", title: "VPS 成本已保存" })
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "保存 VPS 成本失败" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="grid gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">VPS 月度成本
        <Tooltip content="用户扣量始终按 in + out；VPS 成本计量按这里的设置使用 in + out 或仅 out。"><button type="button" className="text-muted-foreground" aria-label="说明用户扣量与 VPS 成本计量"><HelpCircle className="size-4" /></button></Tooltip>
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="购买日期" id={`cost-date-${guid}`} type="date" description="月度计费周期的起点；费用或额度变化时按变更日期保存。" value={draft.purchaseDate} onChange={event => setDraft(current => ({ ...current, purchaseDate: event.target.value }))} />
        <Input label="月费（¥）" id={`cost-fee-${guid}`} type="number" min="0" step="0.01" value={draft.monthlyFee} onChange={event => setDraft(current => ({ ...current, monthlyFee: event.target.value }))} />
        <Input label="流量额度（GiB）" id={`cost-quota-${guid}`} type="number" min="0.01" step="0.01" value={draft.trafficQuotaGiB} onChange={event => setDraft(current => ({ ...current, trafficQuotaGiB: event.target.value }))} />
        <Select label="VPS 流量计算方式" id={`cost-mode-${guid}`} value={draft.trafficMode} onValueChange={(trafficMode: "in_out" | "out_only") => setDraft(current => ({ ...current, trafficMode }))} options={[{ value: "in_out", label: "in + out" }, { value: "out_only", label: "out only" }]} />
      </div>
      <div className="flex flex-wrap justify-end gap-2"><ActionButton icon={<Save />} onClick={() => void save()} disabled={saving || !changed || !complete} pending={saving} label="保存 VPS 成本" /></div>
    </section>
  )
}
