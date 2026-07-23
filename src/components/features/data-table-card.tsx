import * as React from "react"
import { ChevronDown, SlidersHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export function DataTableCard({ filters, children }: { filters?: React.ReactNode; children: React.ReactNode }) {
  const [filtersOpen, setFiltersOpen] = React.useState(false)

  return (
    <Card className="gap-0 overflow-hidden py-0">
      {filters ? <>
        <CardContent className="p-4 md:hidden">
          <Button variant="outline" className="w-full justify-between" onClick={() => setFiltersOpen(open => !open)} aria-expanded={filtersOpen}><span className="flex items-center gap-2"><SlidersHorizontal />筛选</span><ChevronDown className={cn("transition-transform", filtersOpen && "rotate-180")} /></Button>
        </CardContent>
        <CardContent className={cn("gap-4 p-4 sm:grid-cols-2 md:grid lg:grid-cols-3 lg:p-6", filtersOpen ? "grid" : "hidden")}>{filters}</CardContent>
        <Separator />
      </> : null}
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  )
}
