import * as React from "react"

import { fetchJson } from "@/api"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { CatalogV2Period, CatalogV2Product } from "@/types"
import { formatBytes } from "@/utils"

export type CatalogPurchaseOption = { value: string; label: string; product: CatalogV2Product; period: CatalogV2Period | null }

// Enabled V2 products as purchasable specs: one per enabled period of a recurring plan, one per other product.
export function catalogPurchaseOptions(products: CatalogV2Product[]): CatalogPurchaseOption[] {
  return products.filter(product => product.isEnabled).flatMap(product => product.type === "recurring_plan"
    ? product.periods.filter(period => period.isEnabled).map(period => ({ value: `v2:${product.id}:${period.id}`, label: `${product.name} · ${period.durationDays} 天`, product, period }))
    : [{ value: `v2:${product.id}`, label: `${product.name} · ${product.type === "lifetime_plan" ? "不限时" : "附加服务"}`, product, period: null }])
}

export function catalogPlanOptions(products: CatalogV2Product[]) {
  return catalogPurchaseOptions(products).filter(option => option.product.type !== "addon")
}

// Traffic, IP limit and price of a plan spec; traffic tiers add stepBytes each on limited recurring periods.
export function catalogPlanConfig(option: CatalogPurchaseOption) {
  const lifetime = option.product.type === "lifetime_plan"
  const trafficBytes = lifetime ? option.product.trafficBytes : option.period?.trafficBytes
  const customization = option.product.trafficCustomization
  return {
    option,
    lifetime,
    unlimited: trafficBytes === null,
    baseBytes: Number(trafficBytes) || 0,
    stepBytes: Number(customization.stepBytes) || 0,
    stepPriceCents: Number(customization.stepPriceCents) || 0,
    maxTier: customization.enabled ? customization.maxSteps + 1 : 1,
    targetDevices: (lifetime ? option.product.deviceLimit : option.period?.deviceLimit) || 0,
    priceCents: (lifetime ? option.product.priceCents : option.period?.priceCents) || 0,
  }
}

export type CatalogPlanConfig = ReturnType<typeof catalogPlanConfig>

export function catalogPlanHasTiers(config: CatalogPlanConfig | null) {
  return Boolean(config && !config.lifetime && !config.unlimited)
}

// Admin catalog (includes unlisted and disabled products); null while loading, [] when it fails.
export function useCatalogV2Products() {
  const [products, setProducts] = React.useState<CatalogV2Product[] | null>(null)
  React.useEffect(() => {
    let active = true
    void fetchJson<CatalogV2Product[]>("/api/catalog-v2/products").then(data => { if (active) setProducts(data) }).catch(() => { if (active) setProducts([]) })
    return () => { active = false }
  }, [])
  return products
}

// Plan spec select plus the traffic tier select for limited recurring specs.
export function CatalogPlanFields({
  idPrefix,
  options,
  value,
  onValueChange,
  trafficTier,
  onTrafficTierChange,
  disabled,
  label = "商品规格",
  placeholder = "没有可用的商品规格",
  description,
  tierDescription,
  error,
}: {
  idPrefix: string
  options: CatalogPurchaseOption[]
  value: string
  onValueChange: (value: string) => void
  trafficTier: string
  onTrafficTierChange: (value: string) => void
  disabled?: boolean
  label?: string
  placeholder?: string
  description?: React.ReactNode
  tierDescription?: React.ReactNode
  error?: React.ReactNode
}) {
  const selected = options.find(option => option.value === value)
  const config = selected ? catalogPlanConfig(selected) : null
  return (
    <>
      <Field data-invalid={Boolean(error) || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-option`}>{label}</FieldLabel>
        <Select value={value} onValueChange={onValueChange} disabled={disabled || !options.length}>
          <SelectTrigger id={`${idPrefix}-option`} className="w-full" aria-invalid={Boolean(error) || undefined}><SelectValue placeholder={placeholder} /></SelectTrigger>
          <SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
        <FieldError>{error}</FieldError>
      </Field>
      {config && catalogPlanHasTiers(config) ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-traffic-tier`}>定制流量</FieldLabel>
          <Select value={trafficTier} onValueChange={onTrafficTierChange} disabled={disabled}>
            <SelectTrigger id={`${idPrefix}-traffic-tier`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{Array.from({ length: config.maxTier }, (_, index) => index + 1).map(tier => <SelectItem key={tier} value={String(tier)}>第 {tier} 档 · {formatBytes(config.baseBytes + (tier - 1) * config.stepBytes)}</SelectItem>)}</SelectContent>
          </Select>
          {tierDescription ? <FieldDescription>{tierDescription}</FieldDescription> : null}
        </Field>
      ) : null}
    </>
  )
}
