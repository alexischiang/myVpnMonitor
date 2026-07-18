import * as React from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export function DataTableCard({ filters, children }: { filters?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      {filters ? <><CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 lg:p-6">{filters}</CardContent><Separator /></> : null}
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  )
}
