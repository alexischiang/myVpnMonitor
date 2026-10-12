import { DatePicker as ArcDatePicker } from "@/components/arc/date-picker/date-picker"
import { toDateInputValue } from "@/utils"

/** A date field that reads and writes the yyyy-mm-dd strings the forms store. The visible label comes from the surrounding field. */
export function DatePicker({ id, label = "日期", value, onChange, invalid }: { id: string; label?: string; value?: string; onChange: (value: string) => void; invalid?: boolean }) {
  const [year, month, day] = value?.split("-").map(Number) || []
  const selected = year && month && day ? new Date(year, month - 1, day) : undefined
  return <ArcDatePicker id={id} label={label} hideLabel value={selected} onChange={date => onChange(date ? toDateInputValue(date) : "")} aria-invalid={invalid} format={{ year: "numeric", month: "numeric", day: "numeric" }} />
}
