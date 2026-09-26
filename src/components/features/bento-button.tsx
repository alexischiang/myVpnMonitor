import * as React from "react"

import { Button } from "@/components/ui/button"
import { bentoRadius } from "@/components/features/bento-card"
import { cn } from "@/lib/utils"

/** shadcn Button with the same corner radius as BentoCard and a 44px touch target. */
export function BentoButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return <Button className={cn(bentoRadius, "min-h-11 px-5 has-[>svg]:px-4", className)} {...props} />
}
