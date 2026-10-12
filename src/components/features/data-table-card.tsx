import * as React from "react"
import { ChevronDown, SlidersHorizontal } from "lucide-react"

import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Select } from "@/components/arc/select/select"

export function DataTableCard({ filters, children }: { filters?: React.ReactNode; children: React.ReactNode }) {
  const [filtersOpen, setFiltersOpen] = React.useState(false)

  return (
    <Card className="gap-0 overflow-hidden py-0">{filters ? <>
        <div className="md:hidden">
          <Button variant="secondary" className="w-full justify-between" onClick={() => setFiltersOpen(open => !open)} aria-expanded={filtersOpen}><span className="flex items-center gap-2"><SlidersHorizontal />筛选</span><ChevronDown className={cn("transition-transform", filtersOpen && "rotate-180")} /></Button>
        </div>
        <div className={cn("gap-4 p-4 sm:grid-cols-2 md:grid lg:grid-cols-3 lg:p-6", filtersOpen ? "grid" : "hidden")}>{filters}</div>
        <Separator />
      </> : null}<>{children}</></Card>
  )
}

export type FilterOption = { value: string; label: string }

// One labelled select for the DataTableCard filter grid.
export function FilterSelect({ id, label, value, onValueChange, options }: { id: string; label: string; value: string; onValueChange: (value: string) => void; options: FilterOption[] }) {
  return <Select label={label} value={value} onValueChange={onValueChange} id={id} className="w-full" options={[...options.map(option => ({ value: option.value, label: option.label }))]} />
}
