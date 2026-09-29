import type { ReactNode } from "react"
import { Check, X } from "lucide-react"

import { CardContent } from "@/components/ui/card"
import { Item } from "@/components/ui/item"
import { BentoCard, type BentoCardProps } from "@/components/features/bento-card"
import { cn } from "@/lib/utils"

export type PlanOfferSpec = {
  label: ReactNode
  value: ReactNode
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
    <CardContent className="flex flex-1 flex-col gap-5">
      {description ? <div className="-mt-2 text-sm text-muted-foreground">{description}</div> : null}
      <section aria-label="价格" className="flex flex-wrap items-baseline gap-2">
        <strong className="text-4xl font-semibold tracking-tight tabular-nums">{price}</strong>
        {priceUnit ? <span className="text-sm text-muted-foreground">{priceUnit}</span> : null}
        {priceExtra}
      </section>
      {specs.length ? <dl className="grid grid-cols-2 gap-2">
        {specs.map((spec, index) => <Item key={index} className="grid content-start gap-1 rounded-2xl bg-background p-3">
          <dt className="text-xs text-muted-foreground">{spec.label}</dt>
          <dd className="truncate text-xl font-semibold tabular-nums">{spec.value}</dd>
        </Item>)}
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
    </CardContent>
  </BentoCard>
}
