import type { ReactNode } from "react"
import { Check, X } from "lucide-react"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type ProductCardFeature = {
  label: ReactNode
  available?: boolean
}

export function ProductCard({
  title,
  description,
  price,
  priceUnit,
  priceExtra,
  featuresTitle,
  features,
  action,
  recommended = false,
  recommendationLabel = "推荐套餐",
}: {
  title: ReactNode
  description: ReactNode
  price: ReactNode
  priceUnit?: ReactNode
  priceExtra?: ReactNode
  featuresTitle: ReactNode
  features: ProductCardFeature[]
  action: ReactNode
  recommended?: boolean
  recommendationLabel?: ReactNode
}) {
  const product = (
    <Card className="flex-1 gap-0">
        <CardHeader className="gap-3 pb-6">
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription className="leading-relaxed">{description}</CardDescription>
        </CardHeader>
        <CardContent className="grid flex-1 content-start gap-6">
          <section aria-label="价格" className="flex flex-wrap items-baseline gap-2">
            <strong className="text-4xl font-semibold tracking-tight tabular-nums">{price}</strong>
            {priceUnit ? <span className="text-sm text-muted-foreground">{priceUnit}</span> : null}
            {priceExtra}
          </section>
          <Separator />
          <section aria-label="套餐内容" className="grid gap-3 text-sm">
            <h3 className="font-semibold">{featuresTitle}</h3>
            {features.map((feature, index) => {
              const available = feature.available !== false
              const Icon = available ? Check : X
              return <p key={index} className={cn("flex items-start gap-2", !available && "text-muted-foreground")}><Icon className={cn("mt-0.5 size-4 shrink-0", available && "text-orange-700 dark:text-orange-400")} />{available ? null : <span className="sr-only">不支持：</span>}<span>{feature.label}</span></p>
            })}
          </section>
        </CardContent>
        <CardFooter className="pt-8 [&>*]:w-full">{action}</CardFooter>
    </Card>
  )

  return <article className="flex min-w-0 flex-col">
    {recommended ? <Card className="relative -mx-[3px] -mt-8 -mb-[3px] flex-1 gap-0 border-0 bg-orange-600 px-[3px] pt-8 pb-[3px] text-white dark:bg-orange-600">
      <p className="absolute inset-x-4 top-2 text-center text-xs font-medium">{recommendationLabel}</p>
      {product}
    </Card> : product}
  </article>
}
