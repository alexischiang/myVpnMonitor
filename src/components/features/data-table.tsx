import * as React from "react"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type PaginationState,
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
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Columns3,
  EllipsisVertical,
  Search,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/features/shared"
import { cn } from "@/lib/utils"

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

const fuzzyTextFilter: FilterFn<unknown> = (row, columnId, filterValue) => {
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
  className?: string
  renderMobileItem?: (item: TData) => React.ReactNode
  frame?: "default" | "card"
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
  className,
  renderMobileItem,
  frame = "default",
  columnLayout = "uniform",
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

  const table = useReactTable({
    data,
    columns,
    defaultColumn: { filterFn: fuzzyTextFilter },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination,
    },
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
  const selectedRows = table.getFilteredSelectedRowModel().rows.length
  const pageCount = Math.max(table.getPageCount(), 1)

  return (
    <div ref={tableTopRef} className={cn("flex min-w-0 w-full scroll-mt-16 flex-col justify-start", frame === "default" ? "gap-6" : "gap-0", className)}>
      <div className={cn("flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between", frame === "card" && "p-4 lg:p-6")}>
        {searchableColumn && (
          <div className="relative w-full lg:max-w-sm">
            {frame === "card" ? <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /> : null}
            <Input
              placeholder={searchPlaceholder}
              value={(searchableColumn.getFilterValue() as string) ?? ""}
              onChange={event => {
                searchableColumn.setFilterValue(event.target.value)
                onSearchChange?.(event.target.value)
              }}
              className={cn("w-full", frame === "card" ? "pl-9" : "h-8")}
            />
          </div>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
          {frame === "default" ? toolbar : null}
          {frame === "card" ? (
            <Select value={`${table.getState().pagination.pageSize}`} onValueChange={value => table.setPageSize(Number(value))}>
              <SelectTrigger size="sm" className="hidden md:flex" aria-label="每页行数"><SelectValue /></SelectTrigger>
              <SelectContent align="end">{[10, 20, 30, 40, 50].map(size => <SelectItem key={size} value={`${size}`}>{size}</SelectItem>)}</SelectContent>
            </Select>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="hidden md:inline-flex">
                <Columns3 />
                <span className="hidden lg:inline">自定义列</span>
                <span className="lg:hidden">列</span>
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {table
                .getAllColumns()
                .filter(column => (typeof column.accessorFn !== "undefined" || Boolean(column.columnDef.meta?.label)) && column.getCanHide())
                .map(column => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={value => column.toggleVisibility(Boolean(value))}
                  >
                    {column.columnDef.meta?.label ?? column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {frame === "card" ? toolbar : null}
        </div>
      </div>
      {frame === "card" ? <Separator /> : null}
      <ItemGroup className={cn("md:hidden", frame === "card" && "gap-0 [&>[data-slot=item]]:rounded-none [&>[data-slot=item]]:border-x-0 [&>[data-slot=item]]:border-t-0")}>
        {table.getRowModel().rows.length ? table.getRowModel().rows.map(row => renderMobileItem ? <React.Fragment key={row.id}>{renderMobileItem(row.original)}</React.Fragment> : (
          <Item key={row.id} variant="outline" className="items-start">
            <ItemContent className="gap-3">
              {row.getVisibleCells().map(cell => (
                <section key={cell.id} className="grid gap-1">
                  <ItemDescription className="text-xs">{cell.column.columnDef.meta?.label ?? (typeof cell.column.columnDef.header === "string" ? cell.column.columnDef.header : cell.column.id === "actions" ? "操作" : cell.column.id)}</ItemDescription>
                  <ItemTitle className="w-full whitespace-normal">{flexRender(cell.column.columnDef.cell, cell.getContext())}</ItemTitle>
                </section>
              ))}
            </ItemContent>
          </Item>
        )) : <Item variant="outline"><ItemContent><EmptyState title={emptyTitle} description={emptyDescription} /></ItemContent></Item>}
      </ItemGroup>
      <div className={cn("hidden w-full overflow-x-auto md:block", frame === "default" && "rounded-lg border")}>
        <Table className="min-w-full table-auto">
          {columnLayout === "uniform" ? <colgroup>
            {table.getVisibleLeafColumns().map((column, index) => (
              <col
                key={column.id}
                className={cn(
                  "w-40 min-w-40",
                  index === 0 && "w-48 min-w-48",
                  column.id === "actions" && "w-24 min-w-24"
                )}
              />
            ))}
          </colgroup> : null}
          <TableHeader className={cn("sticky top-0 z-10", frame === "default" ? "bg-muted" : "bg-card")}>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    className={cn("overflow-hidden px-4 text-left font-semibold first:pl-6", columnLayout === "uniform" && "w-40 min-w-40 first:w-48 first:min-w-48", header.column.id === "actions" && "sticky right-0 z-20 w-24 min-w-24 border-l pr-4 pl-2 text-right", header.column.id === "actions" && (frame === "default" ? "bg-muted" : "bg-card"))}
                  >
                    {header.isPlaceholder ? null : typeof header.column.columnDef.header === "string"
                      ? <div className="text-xs font-semibold">{header.column.columnDef.header}</div>
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className={cn("overflow-hidden px-4 text-left text-sm first:pl-6", columnLayout === "uniform" && "w-40 min-w-40 first:w-48 first:min-w-48", cell.column.id === "actions" && "sticky right-0 z-[1] w-24 min-w-24 border-l px-2 text-right", cell.column.id === "actions" && (frame === "default" ? "bg-background" : "bg-card"))}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {frame === "card" ? <Separator /> : null}
      <div className={cn("flex items-center justify-between px-4", frame === "card" && "py-4 lg:px-6")}>
        <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
          {frame === "card" ? `共 ${filteredRows} 条` : `${selectedRows} / ${filteredRows} 行已选择`}
        </div>
        <div className="flex w-full items-center gap-8 lg:w-fit">
          {frame === "default" ? <div className="hidden items-center gap-2 lg:flex">
            <Label htmlFor="rows-per-page" className="text-sm font-medium">
              每页行数
            </Label>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={value => table.setPageSize(Number(value))}
            >
              <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                <SelectValue placeholder={table.getState().pagination.pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 20, 30, 40, 50].map(size => (
                  <SelectItem key={size} value={`${size}`}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div> : null}
          <div className="flex w-fit items-center justify-center text-sm font-medium">
            第 {table.getState().pagination.pageIndex + 1} / {pageCount} 页
          </div>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">第一页</span>
              <ChevronsLeft />
            </Button>
            <Button
              variant="outline"
              className="size-8"
              size="icon"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">上一页</span>
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              className="size-8"
              size="icon"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">下一页</span>
              <ChevronRight />
            </Button>
            <Button
              variant="outline"
              className="hidden size-8 lg:flex"
              size="icon"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">最后一页</span>
              <ChevronsRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DataTableColumnHeader({
  title,
  className,
}: {
  title: string
  className?: string
}) {
  return function Header<TData, TValue>({ column }: { column: import("@tanstack/react-table").Column<TData, TValue> }) {
    if (!column.getCanSort()) {
      return <div className={cn("font-semibold", className)}>{title}</div>
    }

    return (
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 w-full justify-start gap-1 px-0 text-left font-semibold data-[state=open]:bg-accent has-[>svg]:px-0",
          className
        )}
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        <span>{title}</span>
        <ChevronsUpDown />
      </Button>
    )
  }
}

export function DataTableRowActions({
  detail,
  children,
}: {
  detail?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="ml-auto flex w-max items-center gap-1">
      {detail}
      {children ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="更多操作"><EllipsisVertical /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">{children}</DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    label?: string
  }
}
