import type { ReactNode } from "react"
import { Check, X, type LucideIcon } from "lucide-react"

import { BentoCard, type BentoCardProps } from "@/components/features/bento-card"
import { cn } from "@/lib/utils"

export type PlanOfferSpec = {
  label: ReactNode
  value: ReactNode
  /** Shown in a small tile at the start of the row; `color` also tints the row. */
  icon?: LucideIcon
  color?: PlanOfferSpecColor
}

// Tailwind 500 shades, written out because Tailwind only emits the palette variables a class uses; the icon tile mixes them
// with transparent and the foreground so it reads in both themes.
const specColors = { sky: "oklch(68.5% 0.169 237.323)", violet: "oklch(60.6% 0.25 292.717)", emerald: "oklch(69.6% 0.17 162.48)", amber: "oklch(76.9% 0.188 70.08)" }
export type PlanOfferSpecColor = keyof typeof specColors

function specIconStyle(color: PlanOfferSpecColor = "sky") {
  const value = specColors[color]
  return { background: `color-mix(in oklab, ${value} 16%, transparent)`, color: `color-mix(in oklab, ${value} 75%, var(--foreground))` }
}

function specRowStyle(color: PlanOfferSpecColor = "sky") {
  return { background: `color-mix(in oklab, ${specColors[color]} 8%, transparent)` }
}

export type PlanOfferFeature = {
  label: ReactNode
  available?: boolean
}

type PlanOfferCardProps = Pick<BentoCardProps, "tone" | "className"> & {
  title: ReactNode
  description?: ReactNode
  price: ReactNode
  priceUnit?: ReactNode
  /** Content after the price, such as a discount badge. */
  priceExtra?: ReactNode
  /** Key quantities (traffic, online IPs, ...) shown as separate tiles, apart from the feature list. */
  specs?: PlanOfferSpec[]
  featuresTitle?: ReactNode
  features?: PlanOfferFeature[]
  /** Primary action, stretched to the card width and anchored to the bottom. */
  action: ReactNode
}

/** Purchasable offer in the bento card style of the account overview, sized by its parent grid. */
export function PlanOfferCard({ title, description, price, priceUnit, priceExtra, specs = [], featuresTitle, features = [], action, tone, className }: PlanOfferCardProps) {
  return <BentoCard span={null} rowSpan={null} tone={tone} title={title} className={cn("min-w-0", className)}>
    <div className="flex flex-1 flex-col gap-5">
      {description ? <div className="-mt-2 text-sm text-muted-foreground">{description}</div> : null}
      <section aria-label="价格" className="flex flex-wrap items-baseline gap-2">
        <strong className="text-4xl font-semibold tracking-tight tabular-nums">{price}</strong>
        {priceUnit ? <span className="text-sm text-muted-foreground">{priceUnit}</span> : null}
        {priceExtra}
      </section>
      {specs.length ? <dl className="grid gap-1.5">
        {specs.map((spec, index) => {
          const Icon = spec.icon
          return <div key={index} className="flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2" style={specRowStyle(spec.color)}>
            {Icon ? <span className="grid size-7 shrink-0 place-items-center rounded-lg" style={specIconStyle(spec.color)}><Icon className="size-4" aria-hidden /></span> : null}
            <dt className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{spec.label}</dt>
            <dd className="shrink-0 text-base font-semibold tabular-nums">{spec.value}</dd>
          </div>
        })}
      </dl> : null}
      {features.length ? <section aria-label={typeof featuresTitle === "string" ? featuresTitle : "套餐内容"} className="grid gap-3 text-sm">
        {featuresTitle ? <h3 className="font-semibold">{featuresTitle}</h3> : null}
        {features.map((feature, index) => {
          const available = feature.available !== false
          const Icon = available ? Check : X
          return <p key={index} className={cn("flex items-start gap-2", !available && "text-muted-foreground")}><Icon className={cn("mt-0.5 size-4 shrink-0", available && "text-orange-700 dark:text-orange-400")} />{available ? null : <span className="sr-only">不支持：</span>}<span>{feature.label}</span></p>
        })}
      </section> : null}
      <div className="mt-auto grid pt-2 [&>*]:w-full">{action}</div>
    </div>
  </BentoCard>
}
