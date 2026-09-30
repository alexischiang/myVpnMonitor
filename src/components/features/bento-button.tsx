import * as React from "react"
import { Link } from "react-router-dom"

import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { bentoRadius } from "@/components/features/bento-card"
import { cn } from "@/lib/utils"

/** shadcn Button with the same corner radius as BentoCard and a 44px touch target. */
export function BentoButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return <Button className={cn(bentoRadius, "min-h-11 px-5 has-[>svg]:px-4", className)} {...props} />
}

/** Round icon-only link placed in a bento card's bottom-right corner; `label` is its accessible name. */
export function BentoIconLink({ to, label, icon: Icon, className }: { to: string; label: string; icon: LucideIcon; className?: string }) {
  return <Button asChild variant="outline" size="icon" className={cn("-mr-2 size-11 shrink-0 rounded-full border-transparent bg-background shadow-none md:size-10 dark:border-transparent dark:bg-background", className)}>
    <Link to={to} aria-label={label}><Icon /></Link>
  </Button>
}
