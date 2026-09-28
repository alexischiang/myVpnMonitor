import * as React from "react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

export type CategoryPillOption = { value: string; label: string; icon?: React.ReactNode }

// Single-choice pill row for filtering a list by category. Scrolls sideways when the pills
// do not fit; clicking the active pill keeps it selected.
export function CategoryPills({ options, value, onValueChange, label, className }: {
  options: CategoryPillOption[]
  value: string
  onValueChange: (value: string) => void
  label: string
  className?: string
}) {
  return <div className={cn("-mx-1 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
    <ToggleGroup type="single" spacing={2} value={value} onValueChange={next => { if (next) onValueChange(next) }} aria-label={label} className="flex-nowrap">
      {options.map(option => <ToggleGroupItem key={option.value} value={option.value} className="h-11 rounded-full border bg-card px-4 text-sm data-[spacing=0]:rounded-full sm:h-9 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90 data-[state=on]:hover:text-primary-foreground">
        {option.icon}
        {option.label}
      </ToggleGroupItem>)}
    </ToggleGroup>
  </div>
}
