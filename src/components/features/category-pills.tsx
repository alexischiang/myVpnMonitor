import * as React from "react"

import SegmentedControl from "@/components/arc/segmented-control/segmented-control"
import { cn } from "@/lib/utils"

export type CategoryPillOption = { value: string; label: string; icon?: React.ReactNode }

// Single-choice row for filtering a list by category. Scrolls sideways when the options do not fit.
export function CategoryPills({ options, value, onValueChange, label, className }: {
  options: CategoryPillOption[]
  value: string
  onValueChange: (value: string) => void
  label: string
  className?: string
}) {
  return <div className={cn("-mx-1 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
    <SegmentedControl label={label} value={value} onValueChange={onValueChange} options={options.map(option => ({ value: option.value, label: option.label, accessory: option.icon }))} />
  </div>
}
