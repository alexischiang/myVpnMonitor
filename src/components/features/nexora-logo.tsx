import { Link } from "react-router-dom"

import { cn } from "@/lib/utils"

export function NexoraLogo({ to, className }: { to?: string; className?: string }) {
  const content = <>NEXORA<span className="text-[10px] font-bold leading-none text-muted-foreground">.beta</span></>
  const classes = cn("inline-flex w-fit items-end text-base font-semibold", className)
  return to ? <Link to={to} className={classes}>{content}</Link> : <span className={classes}>{content}</span>
}
