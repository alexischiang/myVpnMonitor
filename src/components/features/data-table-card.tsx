import * as React from "react"

import { Card } from "@/components/arc/card/card"

/**
 * The card around a list page's DataTable. Filters live in the table's own toolbar (`DataTable` `filters`), so the
 * card does not clip overflow: the Arc filter menu opens in place and may extend past it.
 */
export function DataTableCard({ children }: { children: React.ReactNode }) {
  return <Card className="gap-0 py-0">{children}</Card>
}
