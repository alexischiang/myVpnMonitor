import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import type { LucideIcon } from "lucide-react"

import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/** Shared corner radius for bento cards and bento buttons. */
export const bentoRadius = "rounded-4xl"

export type BentoSpan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export type BentoRowSpan = 1 | 2 | 3 | 4 | 5 | 6

// Static class maps so Tailwind can see every generated class.
// Phones stack every card; tablets use halves; desktops use the exact 1/8 span.
const spanClasses: Record<BentoSpan, string> = {
  1: "md:col-span-4 lg:col-span-1",
  2: "md:col-span-4 lg:col-span-2",
  3: "md:col-span-4 lg:col-span-3",
  4: "md:col-span-4 lg:col-span-4",
  5: "md:col-span-8 lg:col-span-5",
  6: "md:col-span-8 lg:col-span-6",
  7: "md:col-span-8 lg:col-span-7",
  8: "md:col-span-8 lg:col-span-8",
}

// Row spans apply from lg so cards pack without gaps; rows are fixed units only from xl (see BentoGrid).
const rowSpanClasses: Record<BentoRowSpan, string> = {
  1: "lg:row-span-1",
  2: "lg:row-span-2",
  3: "lg:row-span-3",
  4: "lg:row-span-4",
  5: "lg:row-span-5",
  6: "lg:row-span-6",
}

/** Eight equal columns; on wide screens every row is one `--bento-row` unit tall. */
export function BentoGrid({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="bento-grid" className={cn("grid grid-cols-8 gap-4 xl:auto-rows-(--bento-row)", className)} {...props} />
}

const bentoCardVariants = cva(`${bentoRadius} col-span-8 gap-4 xl:overflow-y-auto`, {
  variants: {
    tone: {
      default: "",
      muted: "border-transparent bg-muted",
      yellow: "bento-light-surface border-transparent bg-bento-yellow text-foreground [&_[data-slot=item]]:bg-white/50",
      green: "bento-light-surface border-transparent bg-bento-green text-foreground [&_[data-slot=item]]:bg-white/50",
    },
  },
  defaultVariants: { tone: "default" },
})

export type BentoCardProps = Omit<React.ComponentProps<typeof Card>, "title"> & VariantProps<typeof bentoCardVariants> & {
  /** How many of the 8 columns the card occupies on desktop. */
  span?: BentoSpan
  /** How many row units the card occupies on wide screens. */
  rowSpan?: BentoRowSpan
  /** Card heading, rendered in the shared bento title style. */
  title?: React.ReactNode
  /** Optional icon shown before the title; none by default. */
  icon?: LucideIcon
  /** Content aligned to the right of the title, such as a badge. */
  action?: React.ReactNode
}

export function BentoCard({ span = 8, rowSpan = 2, tone, title, icon: Icon, action, className, children, ...props }: BentoCardProps) {
  return <Card data-slot="bento-card" data-tone={tone ?? "default"} className={cn(bentoCardVariants({ tone }), spanClasses[span], rowSpanClasses[rowSpan], rowSpan === 1 && "gap-2 py-4", className)} {...props}>
    {title ? <CardHeader>
      <CardTitle className="flex min-w-0 items-center gap-2 text-lg font-bold text-foreground">{Icon ? <Icon className="size-5 shrink-0" aria-hidden /> : null}{title}</CardTitle>
      {action ? <CardAction>{action}</CardAction> : null}
    </CardHeader> : null}
    {children}
  </Card>
}

export function bentoSpanClass(span: BentoSpan, rowSpan?: BentoRowSpan) {
  return cn("col-span-8", spanClasses[span], rowSpan ? rowSpanClasses[rowSpan] : "")
}
