import * as React from "react"
import { Activity, Clock3, UserPlus, UsersRound, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

type UsersSummaryCardProps = {
  total: number
  active: number
  addedToday: number
  expiring: number
}

export function UsersSummaryCard({ total, active, addedToday, expiring }: UsersSummaryCardProps) {
  const items: Array<{ label: string; value: number; icon: LucideIcon }> = [
    { label: "总用户数", value: total, icon: UsersRound },
    { label: "活跃用户", value: active, icon: Activity },
    { label: "本日新增用户", value: addedToday, icon: UserPlus },
    { label: "即将过期用户", value: expiring, icon: Clock3 },
  ]

  return (
    <Card className="gap-0 py-0">
      <CardContent className="grid p-0 sm:grid-cols-2 xl:flex xl:items-center">
        {items.map((item, index) => (
          <React.Fragment key={item.label}>
            <section className={`flex min-h-24 min-w-0 items-center justify-between gap-3 p-4 xl:flex-1 xl:border-r-0 xl:border-b-0 ${index < 3 ? "border-b" : ""} ${index % 2 === 0 ? "sm:border-r" : ""} ${index >= 2 ? "sm:border-b-0" : ""}`}>
              <div className="grid min-w-0 gap-1">
                <p className="text-2xl leading-none font-semibold tabular-nums">{item.value}</p>
                <p className="text-xs leading-tight text-muted-foreground">{item.label}</p>
              </div>
              <Badge variant="secondary" className="size-10 shrink-0 justify-center p-0 [&>svg]:size-[22px]!"><item.icon strokeWidth={2.2} /></Badge>
            </section>
            {index < items.length - 1 ? <Separator orientation="vertical" className="hidden xl:block data-[orientation=vertical]:h-12" /> : null}
          </React.Fragment>
        ))}
      </CardContent>
    </Card>
  )
}
