import * as React from "react"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type PaginationState,
  type Row,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { pinyin } from "pinyin-pro"
import { useSearchParams } from "react-router-dom"
import { Columns3, EllipsisVertical } from "lucide-react"

import { Button } from "@/components/arc/button/button"
import { Card } from "@/components/arc/card/card"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { DropdownMenu, type DropdownItem } from "@/components/arc/dropdown-menu/dropdown-menu"
import { ListFilterChips, ListFilterMenu, type ListFilter } from "@/components/features/list-filters"
import { EmptyState } from "@/components/features/shared"
import { Pagination } from "@/components/arc/pagination/pagination"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover"
import { SearchField } from "@/components/arc/search-field/search-field"
import { Select } from "@/components/arc/select/select"
import { type DataColumn, SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table"
import { cn } from "@/lib/utils"

// The Arc version of the shared list table. TanStack Table still owns the data model (search, sorting across pages, paging, column
// visibility and the URL state), so every page keeps its column definitions; Arc's sortable data table, search field and pagination
// render it. The previous implementation stays in data-table.tsx: switching a page's import back restores it.

const normalizeSearchText = (value: unknown) => String(value ?? "").toLocaleLowerCase().replace(/\s+/g, "")
const searchVariants = new Map<string, string[]>()

function searchableText(text: string) {
  const cached = searchVariants.get(text)
  if (cached) return cached
  // ponytail: bounded whole-cache reset; use LRU only if search diversity grows substantially.
  if (searchVariants.size >= 2000) searchVariants.clear()
  const variants = [text, pinyin(text, { toneType: "none", separator: "" }), pinyin(text, { toneType: "none", pattern: "first", separator: "" })]
    .map(normalizeSearchText)
  searchVariants.set(text, variants)
  return variants
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the filter is shared by tables of any row type
const fuzzyTextFilter: FilterFn<any> = (row, columnId, filterValue) => {
  const text = String(row.getValue(columnId) ?? "")
  const query = normalizeSearchText(filterValue)
  if (!query) return true
  return searchableText(text).some(value => value.includes(query))
}

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchKey?: string
  initialSearchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  emptyTitle?: string
  emptyDescription?: string
  pageSize?: number
  toolbar?: React.ReactNode
  /** Fixed-option filters: a 筛选 menu beside the search field, and the applied ones as chips below. */
  filters?: ListFilter[]
  /** Resets every filter in one update; see ListFilterChips. */
  onClearFilters?: () => void
  className?: string
  renderMobileItem?: (item: TData) => React.ReactNode
  frame?: "default" | "card"
  /** Kept for compatibility with the previous table; Arc measures its own column widths. */
  columnLayout?: "uniform" | "content"
  stateKey?: string
}

function sortingFromParam(value: string | null): SortingState {
  if (!value) return []
  return value.split(",").flatMap(entry => {
    const [id, direction] = entry.split(":")
    return id ? [{ id, desc: direction === "desc" }] : []
  })
}

type ArcRow = Record<string, unknown> & { __id: string }
const ROW_SIZES = [10, 20, 30, 40, 50].map(size => ({ value: `${size}`, label: `${size} 条/页` }))

function columnLabel<TData>(column: { id: string; columnDef: ColumnDef<TData, unknown> }) {
  return column.columnDef.meta?.label ?? (typeof column.columnDef.header === "string" ? column.columnDef.header : column.id === "actions" ? "操作" : column.id)
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  initialSearchValue,
  onSearchChange,
  searchPlaceholder = "搜索...",
  emptyTitle = "暂无数据",
  emptyDescription,
  pageSize = 30,
  toolbar,
  filters,
  onClearFilters,
  className,
  renderMobileItem,
  frame = "default",
  stateKey,
}: DataTableProps<TData, TValue>) {
  const [searchParams, setSearchParams] = useSearchParams()
  const storesSearchInUrl = !onSearchChange
  const defaultPageSize = window.matchMedia("(min-width: 768px)").matches ? pageSize : Math.min(pageSize, 10)
  const [sorting, setSorting] = React.useState<SortingState>(() => sortingFromParam(stateKey ? searchParams.get(`${stateKey}-sort`) : null))
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    searchKey && (initialSearchValue || stateKey && searchParams.get(`${stateKey}-q`)) ? [{ id: searchKey, value: initialSearchValue || searchParams.get(`${stateKey}-q`) || "" }] : []
  )
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: Math.max(0, Number(stateKey ? searchParams.get(`${stateKey}-page`) : 1) - 1 || 0),
    pageSize: Math.min(100, Math.max(1, Number(stateKey ? searchParams.get(`${stateKey}-size`) : defaultPageSize) || defaultPageSize)),
  })
  const tableTopRef = React.useRef<HTMLDivElement>(null)
  const previousPageIndex = React.useRef(0)

  React.useEffect(() => {
    if (pagination.pageIndex === previousPageIndex.current) return
    previousPageIndex.current = pagination.pageIndex
    tableTopRef.current?.scrollIntoView({ block: "start" })
  }, [pagination.pageIndex])

  React.useEffect(() => {
    if (!stateKey) return
    const sort = sorting.map(item => `${item.id}:${item.desc ? "desc" : "asc"}`).join(",")
    const query = searchKey && storesSearchInUrl ? String(columnFilters.find(item => item.id === searchKey)?.value || "") : ""
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      if (sort) next.set(`${stateKey}-sort`, sort); else next.delete(`${stateKey}-sort`)
      if (query) next.set(`${stateKey}-q`, query); else next.delete(`${stateKey}-q`)
      if (pagination.pageIndex) next.set(`${stateKey}-page`, String(pagination.pageIndex + 1)); else next.delete(`${stateKey}-page`)
      if (pagination.pageSize !== defaultPageSize) next.set(`${stateKey}-size`, String(pagination.pageSize)); else next.delete(`${stateKey}-size`)
      return next.toString() === current.toString() ? current : next
    }, { replace: true })
  }, [columnFilters, defaultPageSize, pagination.pageIndex, pagination.pageSize, searchKey, setSearchParams, sorting, stateKey, storesSearchInUrl])

  const table = useReactTable<TData>({
    data,
    columns,
    defaultColumn: { filterFn: fuzzyTextFilter },
    state: { sorting, columnFilters, columnVisibility, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const searchableColumn = searchKey ? table.getColumn(searchKey) : undefined
  const filteredRows = table.getFilteredRowModel().rows.length
  const pageCount = Math.max(table.getPageCount(), 1)
  const pageRows = table.getRowModel().rows
  const visibleColumns = table.getVisibleLeafColumns()
  const searchValue = String(searchableColumn?.getFilterValue() ?? "").trim()
  // A search that matches nothing gets the search scene and a way out; an empty data set keeps the page's own copy.
  const emptyView = searchValue
    ? <EmptyState scene="search" title={`没有找到“${searchValue}”`} description="换个关键词，或清除搜索后再试。" action={<Button variant="secondary" size="sm" onClick={() => { searchableColumn?.setFilterValue(""); onSearchChange?.("") }}>清除搜索</Button>} />
    : <EmptyState title={emptyTitle} description={emptyDescription} />
  const hideableColumns = table.getAllColumns().filter(column => (typeof column.accessorFn !== "undefined" || Boolean(column.columnDef.meta?.label)) && column.getCanHide())

  // Arc's table takes plain rows and sorts them by their values, so each row carries the sortable value of every column;
  // the cell itself is still drawn by the page's own column definition.
  const rowsById = new Map<string, Row<TData>>(pageRows.map(row => [row.id, row]))
  const arcRows: ArcRow[] = pageRows.map(row => {
    const values: ArcRow = { __id: row.id }
    for (const column of visibleColumns) {
      const value = typeof column.accessorFn !== "undefined" ? row.getValue(column.id) : undefined
      values[column.id] = typeof value === "number" || typeof value === "string" ? value : value == null ? "" : String(value)
    }
    return values
  })
  const arcColumns: DataColumn<ArcRow>[] = visibleColumns.map(column => ({
    key: column.id,
    label: columnLabel(column as { id: string; columnDef: ColumnDef<TData, unknown> }),
    sortable: column.getCanSort() && typeof column.accessorFn !== "undefined",
    render: (_value, arcRow) => {
      const cell = rowsById.get(arcRow.__id)?.getVisibleCells().find(item => item.column.id === column.id)
      return cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null
    },
  }))

  return (
    <div ref={tableTopRef} className={cn("flex min-w-0 w-full scroll-mt-16 flex-col justify-start gap-4", frame === "card" && "p-4 lg:p-6", className)}>
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        {searchableColumn || filters?.length ? (
          <div className="flex w-full items-center gap-2 lg:max-w-md">
            {searchableColumn ? <div className="min-w-0 flex-1">
              <SearchField label={searchPlaceholder} hideLabel placeholder={searchPlaceholder} value={(searchableColumn.getFilterValue() as string) ?? ""} onValueChange={value => {
                searchableColumn.setFilterValue(value)
                onSearchChange?.(value)
              }} />
            </div> : null}
            {filters?.length ? <ListFilterMenu filters={filters} align={searchableColumn ? "end" : "start"} /> : null}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
          <div className="hidden md:block"><Select label="每页行数" hideLabel value={`${pagination.pageSize}`} onValueChange={value => table.setPageSize(Number(value))} options={ROW_SIZES} /></div>
          {/* Column choice only applies to the table; phones show cards, so the picker is left out there. Arc button CSS outranks a hidden class on the button itself. */}
          {hideableColumns.length ? (
            <div className="hidden md:block"><Popover>
              <PopoverTrigger asChild><Button variant="secondary"><Columns3 />自定义列</Button></PopoverTrigger>
              <PopoverContent align="end">
                <div className="grid gap-3">
                  {hideableColumns.map(column => <Checkbox key={column.id} label={String(column.columnDef.meta?.label ?? column.id)} checked={column.getIsVisible()} onCheckedChange={value => column.toggleVisibility(Boolean(value))} />)}
                </div>
              </PopoverContent>
            </Popover></div>
          ) : null}
          {/* The page's own actions come last, so its primary action sits at the right edge. */}
          {toolbar}
        </div>
      </div>

      {filters?.length ? <ListFilterChips filters={filters} onClearAll={onClearFilters} /> : null}

      <div className="grid gap-3 md:hidden">
        {pageRows.length ? pageRows.map(row => renderMobileItem ? <React.Fragment key={row.id}>{renderMobileItem(row.original)}</React.Fragment> : (
          <Card key={row.id}>
            <dl className="grid gap-3">
              {row.getVisibleCells().map(cell => (
                <div key={cell.id} className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">{columnLabel(cell.column as { id: string; columnDef: ColumnDef<TData, unknown> })}</dt>
                  <dd className="min-w-0 text-sm font-medium">{flexRender(cell.column.columnDef.cell, cell.getContext())}</dd>
                </div>
              ))}
            </dl>
          </Card>
        )) : emptyView}
      </div>

      <div className="hidden min-w-0 md:block">
        {pageRows.length ? (
          <SortableDataTable
            rows={arcRows}
            columns={arcColumns}
            rowKey="__id"
            caption={searchPlaceholder === "搜索..." ? "数据表" : searchPlaceholder.replace(/^搜索/, "").replace(/[.…]+$/, "") || "数据表"}
            defaultSort={sorting[0] ? { key: sorting[0].id, direction: sorting[0].desc ? "desc" : "asc" } : undefined}
            onSortChange={sort => setSorting([{ id: sort.key, desc: sort.direction === "desc" }])}
          />
        ) : emptyView}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">共 {filteredRows} 条</p>
        <Pagination label="分页" page={pagination.pageIndex + 1} pageCount={pageCount} onPageChange={page => table.setPageIndex(page - 1)} />
      </div>
    </div>
  )
}

/** Column header factory kept from the previous table: Arc draws the sortable header itself, so only the title is needed. */
export function DataTableColumnHeader({ title }: { title: string; className?: string }) {
  return function Header() {
    return <span>{title}</span>
  }
}

/** The trailing actions of a row: an optional detail link and a menu of further actions. */
export function DataTableRowActions({ detail, actions }: { detail?: React.ReactNode; actions?: DropdownItem[] }) {
  return (
    <div className="ml-auto flex w-max items-center gap-1">
      {detail}
      {actions?.length ? <DropdownMenu label="更多操作" items={actions} trigger={<Button variant="ghost" size="icon" aria-label="更多操作"><EllipsisVertical /></Button>} /> : null}
    </div>
  )
}

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    label?: string
  }
}
