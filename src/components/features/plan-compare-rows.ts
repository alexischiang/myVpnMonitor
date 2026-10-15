import type { CatalogV2CompareAttribute, CatalogV2LineGroupCoverage, CatalogV2Period, CatalogV2Product } from "@/types"
import { formatBytes } from "@/utils"

// Values the comparison table understands: true/false render as included / not included, null as a dash.
export type CompareCellValue = string | boolean | null

export const networkLevelLabels = { premium: "精品线路", optimized: "优化线路", standard: "普通线路" } as const

// Rows taken from fields every recurring plan already has; the comparison rows configured by the admin follow them.
export const builtInCompareRows = [
  { id: "traffic", label: "每月流量" },
  { id: "devices", label: "在线IP数量" },
  { id: "traffic-addon", label: "流量加购" },
  { id: "regions", label: "可用地区" },
  { id: "network-level", label: "线路等级" },
] as const

export type BuiltInCompareRowId = typeof builtInCompareRows[number]["id"]

export function compareTrafficLabel(bytes: number | null) {
  return bytes === null ? "不限" : formatBytes(bytes)
}

export function trafficCustomizationSummary(product: CatalogV2Product): CompareCellValue {
  const { enabled, stepBytes, stepPriceCents, maxSteps } = product.trafficCustomization
  return enabled && stepBytes && stepPriceCents ? `最多 +${formatBytes(stepBytes * maxSteps)}` : false
}

export function regionsSummary(coverage?: CatalogV2LineGroupCoverage | null): CompareCellValue {
  const regions = coverage?.regions || []
  if (!regions.length) return null
  return regions.length <= 3 ? regions.join("、") : `${regions.slice(0, 3).join("、")} 等 ${regions.length} 个`
}

export function networkLevelSummary(coverage?: CatalogV2LineGroupCoverage | null): CompareCellValue {
  const levels = coverage?.networkLevels || []
  return levels.length ? levels.map(level => networkLevelLabels[level]).join("、") : null
}

// Traffic and online IPs change with the period; a plan not sold in the period shows dashes.
export function builtInCompareValues(product: CatalogV2Product, period: CatalogV2Period | undefined, coverage?: CatalogV2LineGroupCoverage | null): Record<BuiltInCompareRowId, CompareCellValue> {
  return {
    traffic: period ? compareTrafficLabel(period.trafficBytes) : null,
    devices: period ? String(period.deviceLimit) : null,
    "traffic-addon": trafficCustomizationSummary(product),
    regions: regionsSummary(coverage),
    "network-level": networkLevelSummary(coverage),
  }
}

export function compareAttributeValue(attribute: CatalogV2CompareAttribute, raw: string | undefined): CompareCellValue {
  if (!raw) return null
  return attribute.kind === "boolean" ? raw === "yes" : raw
}

const periodNames: Record<number, string> = { 30: "月付", 90: "季付", 180: "半年付", 360: "年付" }

export function comparePeriodLabel(durationDays: number) {
  return periodNames[durationDays] || `${durationDays} 天`
}
