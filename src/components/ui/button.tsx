import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm leading-none font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        success:
          "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500",
        orange:
          "bg-orange-600 text-white shadow-xs hover:bg-orange-700 active:bg-orange-800 focus-visible:border-orange-900 focus-visible:ring-orange-600/30",
        "orange-soft":
          "bg-orange-200 text-orange-1100 hover:bg-orange-300 active:bg-orange-400 focus-visible:border-orange-700 focus-visible:ring-orange-600/25 dark:bg-orange-1100 dark:text-orange-100 dark:hover:bg-orange-1000",
        "orange-outline":
          "border border-orange-700 bg-transparent text-orange-1000 shadow-xs hover:bg-orange-100 hover:text-orange-1100 focus-visible:border-orange-900 focus-visible:ring-orange-600/25 dark:border-orange-500 dark:text-orange-300 dark:hover:bg-orange-1100",
        "orange-ghost":
          "text-orange-1000 hover:bg-orange-100 hover:text-orange-1100 focus-visible:ring-orange-600/25 dark:text-orange-300 dark:hover:bg-orange-1100",
        "orange-link":
          "text-orange-900 underline-offset-4 hover:text-orange-1000 hover:underline focus-visible:ring-orange-600/25 dark:text-orange-400 dark:hover:text-orange-300",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 pt-2.5 pb-2 has-[>svg]:px-3 [&_svg]:-translate-y-px",
        sm: "h-8 gap-1.5 rounded-md px-3 pt-0.5 text-xs has-[>svg]:px-2.5 [&_svg]:-translate-y-px [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 rounded-md px-6 pt-0.5 has-[>svg]:px-4 [&_svg]:-translate-y-px",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "sm",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
