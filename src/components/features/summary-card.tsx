import type { ReactNode } from "react"

import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export function SummaryCard({ label, value, detail, action }: { label: ReactNode; value: ReactNode; detail?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{value}</CardTitle>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      {detail !== undefined ? <CardFooter className="flex-col items-start gap-1.5 text-sm"><span className="line-clamp-1 font-medium">{detail}</span></CardFooter> : null}
    </Card>
  )
}
