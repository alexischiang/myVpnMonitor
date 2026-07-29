import * as React from "react"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toDateInputValue } from "@/utils"

export function DatePicker({ id, value, onChange, invalid }: { id: string; value?: string; onChange: (value: string) => void; invalid?: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [year, month, day] = value?.split("-").map(Number) || []
  const selected = year && month && day ? new Date(year, month - 1, day) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" className="w-full justify-between text-base font-normal md:text-sm" aria-invalid={invalid}>
          {selected ? selected.toLocaleDateString("zh-CN") : "选择日期"}
          <CalendarIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={date => {
            onChange(date ? toDateInputValue(date) : "")
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
