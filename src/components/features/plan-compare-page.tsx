import * as React from "react"
import { Link } from "react-router-dom"

import { fetchJson } from "@/api"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { PlanComparison, type PlanComparisonPeriod, type PlanComparisonPlan, type PlanComparisonRow } from "@/components/arc/blocks/plan-comparison/plan-comparison"
import { Button } from "@/components/arc/button/button"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { builtInCompareRows, builtInCompareValues, compareAttributeValue, comparePeriodLabel } from "@/components/features/plan-compare-rows"
import type { CatalogV2CompareAttribute, CatalogV2LineGroupCoverage, CatalogV2Product } from "@/types"
import { formatMoney } from "@/utils"

type CompareData = { products: CatalogV2Product[]; attributes: CatalogV2CompareAttribute[]; lineGroups: Record<string, CatalogV2LineGroupCoverage> }

const periodKey = (durationDays: number) => String(durationDays)

function savingPercent(product: CatalogV2Product, durationDays: number) {
  const monthly = product.periods.find(period => period.isEnabled && period.durationDays === 30)
  const current = product.periods.find(period => period.isEnabled && period.durationDays === durationDays)
  if (!monthly || !current || durationDays <= 30) return 0
  return Math.max(0, Math.round((1 - current.priceCents / (monthly.priceCents * durationDays / 30)) * 100))
}

// Recurring plans side by side in the Arc plan comparison block. Prices show the period total with the
// per-month equivalent below; rows come from product data plus the comparison rows set up by the admin.
export function RecurringPlanComparePage() {
  const [data, setData] = React.useState<CompareData | null>(null)
  const [error, setError] = React.useState("")
  const [period, setPeriod] = React.useState("")
  const [selected, setSelected] = React.useState<string | null>(null)

  React.useEffect(() => {
    Promise.all([fetchJson<CatalogV2Product[]>("/api/public/catalog-v2"), fetchJson<Omit<CompareData, "products">>("/api/public/catalog-v2/compare")])
      .then(([rows, compare]) => {
        const products = rows.filter(row => row.type === "recurring_plan" && row.stock !== 0 && row.periods.some(item => item.isEnabled))
        setData({ products, ...compare })
        const days = [...new Set(products.flatMap(product => product.periods.filter(item => item.isEnabled).map(item => item.durationDays)))].sort((left, right) => left - right)
        setPeriod(current => current || (days.length ? periodKey(days[0]) : ""))
        setSelected(current => current ?? products.find(product => product.isRecommended)?.id ?? null)
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : "套餐加载失败"))
  }, [])

  const view = React.useMemo(() => {
    if (!data) return null
    const days = [...new Set(data.products.flatMap(product => product.periods.filter(item => item.isEnabled).map(item => item.durationDays)))].sort((left, right) => left - right)
    const periods: PlanComparisonPeriod[] = days.map(durationDays => {
      const best = Math.max(0, ...data.products.map(product => savingPercent(product, durationDays)))
      return { value: periodKey(durationDays), label: comparePeriodLabel(durationDays), note: best ? `按 ${durationDays} 天计费，最多省 ${best}%` : `按 ${durationDays} 天计费` }
    })
    const durationDays = Number(period)
    const periodOf = (product: CatalogV2Product) => product.periods.find(item => item.isEnabled && item.durationDays === durationDays)
    const plans: PlanComparisonPlan[] = data.products.map(product => ({
      id: product.id,
      name: product.name,
      tagline: product.tagline || product.description,
      badge: product.isRecommended ? <Badge tone="info" size="sm">推荐</Badge> : product.stock !== null ? <Badge tone="danger" size="sm">限量</Badge> : null,
      prices: Object.fromEntries(product.periods.filter(item => item.isEnabled).map(item => {
        const saving = savingPercent(product, item.durationDays)
        const perMonth = item.durationDays > 30 ? `≈ ${formatMoney(item.priceCents / 100 / (item.durationDays / 30))} / 月` : ""
        return [periodKey(item.durationDays), { amount: item.priceCents / 100, unit: `/ ${item.durationDays} 天`, note: [perMonth, saving ? `省 ${saving}%` : ""].filter(Boolean).join(" · ") || undefined }]
      })),
    }))
    const builtIn = Object.fromEntries(data.products.map(product => [product.id, builtInCompareValues(product, periodOf(product), product.lineGroupId ? data.lineGroups[product.lineGroupId] : null)]))
    const rows: PlanComparisonRow[] = [
      ...builtInCompareRows.map(row => ({ id: row.id, label: row.label, values: Object.fromEntries(data.products.map(product => [product.id, builtIn[product.id][row.id]])) })),
      ...data.attributes.map(attribute => ({ id: `attr-${attribute.id}`, label: attribute.label, values: Object.fromEntries(data.products.map(product => [product.id, compareAttributeValue(attribute, product.compareValues?.[attribute.id])])) })),
    ]
    const chosen = data.products.find(product => product.id === selected)
    const chosenPeriod = chosen ? periodOf(chosen) : undefined
    return { periods, plans, rows, chosen, chosenPeriod }
  }, [data, period, selected])

  if (error) return <div className="pt-4"><Alert tone="danger" title="套餐加载失败">{error}</Alert></div>
  if (!view) return <div className="grid gap-4 pt-4"><Skeleton lines={3} /><Skeleton lines={8} /></div>
  if (!view.plans.length) return <div className="pt-4"><EmptyState title="当前暂无可购买的周期性套餐" description="请稍后再试或联系客服。" /></div>

  const { chosen, chosenPeriod } = view
  const action = chosen && chosenPeriod
    ? <Button asChild><Link to={`/account/plans/checkout?option=${encodeURIComponent(`v2:${chosen.id}:${chosenPeriod.id}`)}`}>购买 {chosen.name} · {comparePeriodLabel(chosenPeriod.durationDays)}</Link></Button>
    : <Button disabled>{chosen ? "该套餐在当前周期未开放" : "先选择一个套餐"}</Button>

  return <div className="grid gap-6 pt-4">
    <PlanComparison
      title="周期性套餐"
      description="按付款周期计费，每月重置流量。切换周期查看价格，开启「只看差异」快速比较。"
      periods={view.periods}
      period={period}
      onPeriodChange={setPeriod}
      plans={view.plans}
      rows={view.rows}
      selected={selected}
      onSelectedChange={setSelected}
      currency="¥"
      footer="价格以人民币计，支付成功后立即生效；所有套餐一经支付不支持退款。"
      action={action}
      labels={{
        periodControl: "付款周期",
        compareTitle: "套餐对比",
        featureHeader: "对比项",
        differencesOnly: "只看差异",
        featureCount: (visible, total) => <>{visible} / {total} 项</>,
        included: "支持",
        notIncluded: "不支持",
        select: plan => `选择 ${plan.name}`,
        selected: "已选择",
        unavailable: "当前周期未开放",
        selectedStatus: plan => `已选择 ${plan.name}`,
        matrix: "周期性套餐对比",
      }}
    />
  </div>
}
