import * as React from "react"

import { type DataColumn, SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table"

type SimpleRow = Record<string, unknown> & { __id: string }

/**
 * A plain read-only table on Arc's data table, for the small tables inside pages and dialogs: column titles, the rows,
 * and one function that returns a row's cells in column order. Lists that need search, paging or sorting use DataTable.
 */
export function SimpleTable<T>({ caption, columns, rows, rowKey, cells, emptyMessage = "暂无数据", minWidth }: {
  /** Names the table for assistive tech. */
  caption: string
  /** A title, or a title with richer header content (an info tooltip, for example). */
  columns: Array<string | { label: string; header: React.ReactNode }>
  rows: readonly T[] | null | undefined
  rowKey: (row: T, index: number) => string | number
  /** The cells of one row, in the order of `columns`. */
  cells: (row: T, index: number) => React.ReactNode[]
  emptyMessage?: string
  /** The narrowest the table may get before it scrolls sideways. */
  minWidth?: number
}) {
  const cellsById = new Map<string, React.ReactNode[]>()
  const arcRows: SimpleRow[] = (rows ?? []).map((row, index) => {
    const id = String(rowKey(row, index))
    cellsById.set(id, cells(row, index))
    return { __id: id }
  })
  const arcColumns: DataColumn<SimpleRow>[] = columns.map((column, index) => ({
    key: `c${index}`,
    label: typeof column === "string" ? column : column.label,
    header: typeof column === "string" ? undefined : column.header,
    sortable: false,
    render: (_value, row) => cellsById.get(row.__id)?.[index] ?? null,
  }))
  return <SortableDataTable rows={arcRows} columns={arcColumns} rowKey="__id" caption={caption} emptyMessage={emptyMessage} minWidth={minWidth ?? (columns.length > 5 ? columns.length * 130 : undefined)} />
}
