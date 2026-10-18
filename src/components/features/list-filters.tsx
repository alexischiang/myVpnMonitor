import { ListFilter as ListFilterIcon } from "lucide-react"

import { FilterMenu, FilterToolbar, type FilterChip, type FilterField } from "@/components/arc/filter-toolbar/filter-toolbar"

/** One list filter: a field with fixed options. It counts as applied while its value differs from `defaultValue`. */
export type ListFilter = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  /** The unfiltered value. Defaults to "all". */
  defaultValue?: string
}

const defaultOf = (filter: ListFilter) => filter.defaultValue ?? "all"
const optionLabel = (filter: ListFilter, value: string) => filter.options.find(option => option.value === value)?.label ?? value

/**
 * The 筛选 trigger on Arc's filter menu, as tall as a text field so it sits in the same row as the search (icon only on phones);
 * every field shows its current value, and picking one calls that filter's `onChange`.
 */
export function ListFilterMenu({ filters, align = "end" }: { filters: ListFilter[]; align?: "start" | "end" }) {
  const fields: FilterField[] = filters.map(filter => ({ id: filter.id, label: filter.label, options: filter.options }))
  const active: FilterChip[] = filters.map(filter => ({ id: filter.id, label: filter.label, value: optionLabel(filter, filter.value) }))
  return <FilterMenu fields={fields} active={active} align={align} size="md" icon={<ListFilterIcon aria-hidden="true" />} collapse onSelect={(chip, field) => {
    const filter = filters.find(item => item.id === field.id)
    const option = filter?.options.find(item => item.label === chip.value)
    if (filter && option) filter.onChange(option.value)
  }} />
}

/**
 * The applied filters as removable Arc chips with 清除全部. Renders nothing while every filter is at its default.
 * Pages that keep filters in the URL pass `onClearAll`: React Router does not queue functional search param updates,
 * so resetting the filters one by one in the same tick keeps only the last change.
 */
export function ListFilterChips({ filters, onClearAll }: { filters: ListFilter[]; onClearAll?: () => void }) {
  const applied = filters.filter(filter => filter.value !== defaultOf(filter))
  if (!applied.length) return null
  return <FilterToolbar
    filters={applied.map(filter => ({ id: filter.id, label: filter.label, value: optionLabel(filter, filter.value) }))}
    onRemove={id => { const filter = filters.find(item => item.id === id); filter?.onChange(defaultOf(filter)) }}
    onClearAll={onClearAll ?? (() => applied.forEach(filter => filter.onChange(defaultOf(filter))))}
  />
}
