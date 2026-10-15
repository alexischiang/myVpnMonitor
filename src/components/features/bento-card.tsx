import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/arc/badge/badge"
import { Card } from "@/components/arc/card/card"

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

/** Eight equal columns; on wide screens every row is at least one `--bento-row` unit tall and grows with its content. */
export function BentoGrid({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="bento-grid" className={cn("grid grid-cols-8 gap-4 xl:auto-rows-[minmax(var(--bento-row),auto)]", className)} {...props} />
}

// Arc's card sets its own surface and border, and its stylesheet outranks utility classes, so the bento surface of each tone
// is applied as an inline style. The light tones also switch their text and controls to dark through bento-light-surface.
const bentoSurface: Record<"default" | "muted" | "yellow" | "green", string> = {
  default: "var(--bento-surface)",
  muted: "var(--muted)",
  yellow: "var(--color-bento-yellow)",
  green: "var(--color-bento-green)",
}

/** The surface style of a bento tone, for Arc components placed in the grid that are not a BentoCard. */
export function bentoSurfaceStyle(tone: keyof typeof bentoSurface = "default"): React.CSSProperties {
  return { background: bentoSurface[tone], borderColor: "transparent", boxShadow: "none" }
}

const bentoCardVariants = cva("", {
  variants: {
    tone: {
      default: "",
      muted: "",
      yellow: "bento-light-surface",
      green: "bento-light-surface",
    },
  },
  defaultVariants: { tone: "default" },
})

export type BentoCardProps = Omit<React.ComponentProps<typeof Card>, "title"> & VariantProps<typeof bentoCardVariants> & {
  /** How many of the 8 columns the card occupies on desktop; null when the card is placed outside a BentoGrid. */
  span?: BentoSpan | null
  /** How many row units the card occupies on wide screens; null when the card is placed outside a BentoGrid. */
  rowSpan?: BentoRowSpan | null
  /** Card heading, rendered in the shared bento title style. */
  title?: React.ReactNode
  /** Optional icon shown before the title; none by default. */
  icon?: LucideIcon
  /** Content aligned to the right of the title, such as a badge. */
  action?: React.ReactNode
}

export function BentoCard({ span = 8, rowSpan = 2, tone, title, icon: Icon, action, className, style, children, ...props }: BentoCardProps) {
  return <Card fill data-slot="bento-card" data-tone={tone ?? "default"} className={cn(bentoCardVariants({ tone }), span && bentoSpanClass(span), rowSpan && rowSpanClasses[rowSpan], className)} style={{ ...bentoSurfaceStyle(tone ?? "default"), ...style }} {...props}>
    <div className="flex flex-1 flex-col gap-3">
      {title || action ? <div className="flex min-w-0 items-start justify-between gap-3">
        {title ? <h3 className="flex min-w-0 items-center gap-2 text-base font-semibold text-foreground">{Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}{title}</h3> : <span />}
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div> : null}
      {children}
    </div>
  </Card>
}

// The Arc badge sets its own colors (also on hover) and outranks utility classes, so the green tone is written inline.
const greenBadgeStyle: React.CSSProperties = { background: "var(--color-bento-green-strong)", borderColor: "transparent", color: "var(--color-white)" }

/** Small pill for a bento card's secondary figure, usually passed as the card `action`. */
export function BentoCardBadge({ icon: Icon, tone = "default", className, style, children, ...props }: Omit<React.ComponentProps<typeof Badge>, "tone" | "icon"> & { icon?: LucideIcon; tone?: "default" | "green" }) {
  return <Badge data-slot="bento-card-badge" data-tone={tone} className={cn("h-7 gap-1.5 rounded-full border-transparent bg-background px-2.5 text-xs font-medium", className)} style={tone === "green" ? { ...greenBadgeStyle, ...style } : style} {...props}>
    {Icon ? <Icon aria-hidden /> : null}{children}
  </Badge>
}

export function bentoSpanClass(span: BentoSpan, rowSpan?: BentoRowSpan) {
  return cn("col-span-8", spanClasses[span], rowSpan ? rowSpanClasses[rowSpan] : "")
}
