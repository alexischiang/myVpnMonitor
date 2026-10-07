import * as React from "react"
import { ChevronDown, SlidersHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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

export type FilterOption = { value: string; label: string }

// One labelled select for the DataTableCard filter grid.
export function FilterSelect({ id, label, value, onValueChange, options }: { id: string; label: string; value: string; onValueChange: (value: string) => void; options: FilterOption[] }) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Select value={value} onValueChange={onValueChange}><SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></Field>
}
