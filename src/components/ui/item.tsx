"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const itemVariants = cva(
  "group/item flex min-w-0 items-center rounded-md border border-transparent text-sm transition-colors",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border-border",
        muted: "bg-muted/50",
      },
      size: {
        default: "gap-4 p-4",
        sm: "gap-2.5 px-3 py-2",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

function Item({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"div"> & VariantProps<typeof itemVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div"
  return <Comp data-slot="item" data-variant={variant} data-size={size} className={cn(itemVariants({ variant, size }), className)} {...props} />
}

function ItemGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-group" className={cn("grid gap-3", className)} {...props} />
}

function ItemContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-content" className={cn("flex min-w-0 flex-1 flex-col gap-1", className)} {...props} />
}

function ItemTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-title" className={cn("flex w-fit items-center gap-2 text-sm leading-snug font-medium", className)} {...props} />
}

function ItemDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="item-description" className={cn("line-clamp-2 text-sm leading-normal text-muted-foreground", className)} {...props} />
}

function ItemActions({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-actions" className={cn("flex shrink-0 items-center gap-2", className)} {...props} />
}

export { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle, itemVariants }
