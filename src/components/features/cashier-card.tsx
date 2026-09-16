import type { ReactNode } from "react"
import { Globe2 } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function CashierCard({ amount, notice, children }: { amount: string; notice?: ReactNode; children: ReactNode }) {
  return <Card className="gap-4 rounded-2xl border-0 shadow-[0_0_56px_-10px] shadow-foreground/20">
    <CardHeader className="gap-3">
      <CardTitle className="flex items-center gap-2 text-base"><Globe2 className="size-5" />NEXORA <span className="text-xs font-normal text-muted-foreground">收银台</span></CardTitle>
      <p className="flex w-fit items-baseline gap-2 text-[38px] font-[800] leading-none tabular-nums" aria-label={amount} aria-live="polite"><span aria-hidden="true">{amount.slice(0, 1)}</span><span aria-hidden="true" className="tracking-[0.015em]">{amount.slice(1)}</span></p>
      {notice}
    </CardHeader>
    <CardContent className="grid gap-3">{children}</CardContent>
  </Card>
}
