export type SalesPeriod = "30" | "90" | "365" | "all" | "custom"

type SalesMoney = { realCashAmount?: number; totalAmount?: number; amount?: number }
type DateRange = { from?: Date; to?: Date }
type SalesOrderLink = { userId?: string; amount?: number; paidAt?: string; status: string }
type SalesBillLink = { paymentOrderId?: string; userId?: string; amount?: number; occurredAt?: string; reversedAt?: string | null }

export function salesAmount(order: SalesMoney) {
  return Number(order.realCashAmount ?? order.totalAmount ?? order.amount) || 0
}

export function salesDateKey(date: Date, monthly: boolean) {
  return monthly
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function unlinkedSalesBills<T extends SalesBillLink>(orders: SalesOrderLink[], bills: T[]) {
  const legacyOrderKeys = new Set(orders
    .filter(order => order.status === "paid")
    .map(order => `${order.userId || ""}\0${Number(order.amount) || 0}\0${order.paidAt || ""}`))

  return bills.filter(bill => !bill.reversedAt && !bill.paymentOrderId && bill.occurredAt && Number(bill.amount) > 0
    && !legacyOrderKeys.has(`${bill.userId || ""}\0${Number(bill.amount) || 0}\0${bill.occurredAt}`))
}

export function salesDateRange(period: SalesPeriod, customRange: DateRange = {}, now = new Date()) {
  if (period === "all") return { start: null, end: now, previousStart: null, monthly: true }

  const start = period === "custom" && customRange.from
    ? new Date(customRange.from.getFullYear(), customRange.from.getMonth(), customRange.from.getDate())
    : new Date(now.getFullYear(), now.getMonth(), now.getDate() - Number(period) + 1)
  const selectedEnd = period === "custom" && customRange.to
    ? new Date(customRange.to.getFullYear(), customRange.to.getMonth(), customRange.to.getDate() + 1, 0, 0, 0, -1)
    : now
  const end = selectedEnd > now ? now : selectedEnd
  const calendarDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5
  const periodDays = calendarDay(end) - calendarDay(start) + 1
  const previousStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - periodDays)

  return { start, end, previousStart, monthly: periodDays >= 180 }
}

export function salesMonthRange(month: number, year = new Date().getFullYear()) {
  return { from: new Date(year, month - 1, 1), to: new Date(year, month, 0) }
}
