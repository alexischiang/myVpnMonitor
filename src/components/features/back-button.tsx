import * as React from "react"
import { ArrowLeft } from "lucide-react"

import { useBackNavigation } from "@/hooks/use-back-navigation"
import { Button } from "@/components/arc/button/button"

type BackButtonProps = Omit<React.ComponentProps<typeof Button>, "children" | "onClick" | "variant"> & {
  fallback: string
  iconOnly?: boolean
  label?: string
}

export function BackButton({ fallback, iconOnly = false, label = "返回", ...props }: BackButtonProps) {
  const goBack = useBackNavigation(fallback)
  return <Button {...props} type="button" variant="secondary" onClick={goBack}><ArrowLeft />{iconOnly ? <span className="sr-only">{label}</span> : label}</Button>
}
