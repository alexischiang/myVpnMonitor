import * as React from "react"
import { Link, Navigate, useParams } from "react-router-dom"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { fetchJson } from "@/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Cashier } from "./cashier"
import type { PaymentOrder } from "./cashier-types"

// Standalone route shell. The authenticated order endpoint enforces ownership;
// this page deliberately has no dependency on the account/dashboard shell.
export function CashierPage() {
  const { id = "" } = useParams()
  const { resolvedTheme, setTheme } = useTheme()
  const [order, setOrder] = React.useState<PaymentOrder | null>(null)
  const [error, setError] = React.useState("")
  const [attempt, setAttempt] = React.useState(0)
  React.useEffect(() => {
    let cancelled = false
    setOrder(null)
    setError("")
    fetchJson<PaymentOrder>(`/api/orders/${encodeURIComponent(id)}`)
      .then(result => { if (!cancelled) setOrder(result) })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "订单暂时无法加载") })
    return () => { cancelled = true }
  }, [id, attempt])
  if (order && order.checkoutVersion !== 2) return <Navigate to={`/account/orders/${encodeURIComponent(id)}`} replace />
  return <main className="min-h-svh bg-muted/20 px-4 py-6 sm:py-12">
    <div className="mx-auto mb-2 flex max-w-md justify-end sm:absolute sm:right-6 sm:top-5 sm:mb-0">
      <Button variant="ghost" size="icon" className="min-h-11 min-w-11 rounded-full" aria-label={resolvedTheme === "dark" ? "切换浅色主题" : "切换深色主题"} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>{resolvedTheme === "dark" ? <Sun /> : <Moon />}</Button>
    </div>
    {order ? <Cashier key={order.id} initialOrder={order} /> : <section className="mx-auto grid max-w-md gap-4" aria-label="加载收银台">
      {error ? <><Alert variant="warning"><AlertTitle>订单暂时无法加载</AlertTitle><AlertDescription>{error}</AlertDescription></Alert><Button onClick={() => setAttempt(value => value + 1)}>重新加载订单</Button><Button asChild variant="ghost"><Link to="/account/orders">返回我的订单</Link></Button></> : <><Skeleton className="h-32" /><Skeleton className="h-96" /></>}
    </section>}
  </main>
}
