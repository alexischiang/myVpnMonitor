import type { ReactNode } from "react"
import { Card } from "@/components/arc/card/card"


export function SummaryCard({ label, value, detail, action }: { label: ReactNode; value: ReactNode; detail?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="@container/card" description={label} title={value}>{action ? <div className="ml-auto flex items-center gap-2">{action}</div> : null}{detail !== undefined ? <div className="mt-4 flex items-center gap-2 flex-col items-start gap-1.5 text-sm"><span className="line-clamp-1 font-medium">{detail}</span></div> : null}</Card>
  )
}
