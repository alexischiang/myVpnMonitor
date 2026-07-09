import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"

import { deleteJson, postJson } from "@/api"
import { Button } from "@/components/ui/button"
import { DataTable, DataTableColumnHeader } from "@/components/features/data-table"
import { useData } from "@/components/features/data-provider"
import { PageHeader } from "@/components/features/shared"
import type { Bill } from "@/types"
import { billTypeLabels, formatDate, formatMoney } from "@/utils"

export function BillsPage() {
  const { bills, reload, runAsync } = useData()

  async function mutate(item: Bill, action: "reverse" | "delete") {
    await runAsync(async () => {
      if (action === "delete") await deleteJson(`/api/bills/${item.id}`)
      else await postJson(`/api/bills/${item.id}/reverse`, {})
      await reload(["bills", "users"])
      toast.success(action === "delete" ? "账单已删除" : "账单已冲正")
    }, "处理账单...")
  }

  const columns = React.useMemo<ColumnDef<Bill>[]>(() => [
    {
      accessorKey: "occurredAt",
      header: DataTableColumnHeader({ title: "时间" }),
      meta: { label: "时间" },
      cell: ({ row }) => formatDate(row.original.occurredAt),
    },
    {
      id: "user",
      accessorFn: item => `${item.user?.userId || ""} ${item.userId || ""} ${item.description || ""}`,
      header: DataTableColumnHeader({ title: "用户" }),
      meta: { label: "用户" },
      cell: ({ row }) => row.original.user?.userId || row.original.userId || "-",
    },
    {
      accessorKey: "type",
      header: DataTableColumnHeader({ title: "类型" }),
      meta: { label: "类型" },
      cell: ({ row }) => billTypeLabels[row.original.type || ""] || row.original.type || "-",
    },
    {
      accessorKey: "duration",
      header: DataTableColumnHeader({ title: "周期" }),
      meta: { label: "周期" },
      cell: ({ row }) => row.original.duration || "-",
    },
    {
      accessorKey: "amount",
      header: DataTableColumnHeader({ title: "金额" }),
      meta: { label: "金额" },
      cell: ({ row }) => formatMoney(row.original.amount),
    },
    {
      accessorKey: "description",
      header: "备注",
      meta: { label: "备注" },
      cell: ({ row }) => row.original.reversedAt ? "已冲正" : row.original.description || "-",
      enableSorting: false,
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => {
        const item = row.original
        return (
          <div className="flex items-center gap-1">
            {!item.reversedAt && (
              <Button variant="ghost" size="sm" onClick={() => mutate(item, "reverse")}>
                冲正
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => mutate(item, "delete")}>
              删除
            </Button>
          </div>
        )
      },
      enableHiding: false,
      enableSorting: false,
    },
  ], [])

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <PageHeader title="账单" description="收入记录、续费记录与冲正状态。" />
      <DataTable
        columns={columns}
        data={bills}
        searchKey="user"
        searchPlaceholder="搜索账单..."
        emptyTitle="暂无账单"
      />
    </div>
  )
}
