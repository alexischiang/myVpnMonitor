import type { PlanSnapshot, User } from "./types"

export const durationLabels: Record<string, string> = {
  monthly: "月付",
  quarterly: "季付",
  half_yearly: "半年付",
  yearly: "年付",
  custom: "自定义",
  lifetime: "永久",
}

// Product name plus option, without repeating the name: add-ons use the product name as their
// option label, and some option labels already start with the product name.
export function orderProductLabel(order: { planName?: string; optionLabel?: string }, separator = " / ") {
  const name = String(order.planName || "").trim()
  const option = String(order.optionLabel || "").trim()
  if (!option || option === name) return name || option
  if (!name || option.startsWith(name)) return option
  return `${name}${separator}${option}`
}

/** Product name, period label and traffic label of a plan, read only from its product snapshot; `perMonth` is false for lifetime or unlimited plans. */
export function planSnapshotParts(snapshot?: PlanSnapshot | null) {
  if (!snapshot) return { name: "-", duration: "-", traffic: "-", perMonth: false }
  const unlimited = snapshot.trafficBytes === null
  const lifetime = snapshot.productType === "lifetime_plan" || !snapshot.durationDays
  const traffic = snapshot.trafficBytes === null ? "无限流量" : `${Number((snapshot.trafficBytes / 1024 ** 3).toFixed(2))}G`
  return { name: snapshot.name || "-", duration: lifetime ? "不限时" : `${snapshot.durationDays}天`, traffic, perMonth: !lifetime && !unlimited }
}

export function planSnapshotName(snapshot?: PlanSnapshot | null) {
  if (!snapshot) return "-"
  const { name, duration, traffic } = planSnapshotParts(snapshot)
  return `${name}-${duration}-${traffic}`
}

/** The plan an order bought, from the order's own product snapshot (its V2 plan snapshot when it has one). */
export function orderPlanName(productSnapshot?: Record<string, unknown> | null) {
  if (!productSnapshot) return "-"
  const v2 = productSnapshot.v2 as PlanSnapshot | undefined
  if (v2?.productId) return planSnapshotName(v2)
  return orderProductLabel({ planName: String(productSnapshot.planName || ""), optionLabel: String(productSnapshot.optionLabel || "") }) || "-"
}

/** The checkout option id of a plan snapshot, as `v2:product` or `v2:product:period`. */
export function planSnapshotOptionId(snapshot?: PlanSnapshot | null) {
  if (!snapshot) return ""
  return snapshot.periodId ? `v2:${snapshot.productId}:${snapshot.periodId}` : `v2:${snapshot.productId}`
}

export const billTypeLabels: Record<string, string> = {
  initial: "新购套餐",
  renewal: "续费套餐",
  replacement: "覆盖套餐",
  addon: "附加服务",
  traffic_pack: "流量包",
  recharge: "余额充值",
}

export const statusLabels: Record<string, string> = {
  ok: "正常",
  expiring: "即将到期",
  invalid: "无效",
  low_traffic: "低流量",
  depleted: "流量耗尽",
  warning: "即将到期",
  expired: "已到期",
  error: "错误",
  disabled: "未启用",
  unknown: "未知",
}

export function formatBytes(bytes?: number | null) {
  if (bytes === null || bytes === undefined) return "未知"
  const units = ["B", "KB", "MB", "GB", "TB", "PB"]
  let value = Number(bytes)
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "未知"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "未知"
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })
}

export function formatUserExpiry(user?: User | null) {
  if (user?.duration === "lifetime") return "永久"
  return formatDate(user?.expiresAt)
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return "未知"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "未知"
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatDuration(ms?: number | null) {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "-"
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} 秒`
  const totalSeconds = Math.round(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  if (minutes < 60) return totalSeconds % 60 ? `${minutes} 分 ${totalSeconds % 60} 秒` : `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return minutes % 60 ? `${hours} 小时 ${minutes % 60} 分` : `${hours} 小时`
  const days = Math.floor(hours / 24)
  return hours % 24 ? `${days} 天 ${hours % 24} 小时` : `${days} 天`
}

export function formatMoney(value?: number | string | null) {
  const amount = Number(value) || 0
  return amount.toLocaleString("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 })
}

export function toDateInputValue(value: string | Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function absoluteUrl(path?: string) {
  if (!path) return ""
  if (/^https?:\/\//i.test(path)) return path
  return new URL(path, window.location.origin).href
}

export function userStatus(user?: User | null) {
  if (user?.registeredOnly) return "registered"
  const expiresAt = user?.expiresAt ? new Date(user.expiresAt).getTime() : null
  if (expiresAt && expiresAt < Date.now()) return "expired"
  if (expiresAt && expiresAt - Date.now() <= 3 * 86400000) return "warning"
  return "ok"
}

export const OPEN_IN_BROWSER_PATH = "/open-in-browser"

export function isWechatBrowser(userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent) {
  return /MicroMessenger/i.test(userAgent)
}

function copyTextWithSelection(value: string) {
  const input = document.createElement("textarea")
  input.value = value
  input.setAttribute("readonly", "")
  input.style.position = "fixed"
  input.style.opacity = "0"
  document.body.appendChild(input)
  input.select()
  const copied = document.execCommand("copy")
  input.remove()
  return copied ? Promise.resolve() : Promise.reject(new Error("copy failed"))
}

export function copyText(value: string) {
  // 微信等内置浏览器可能拒绝 Clipboard API，失败时回退到选区复制
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value).catch(() => copyTextWithSelection(value))
  return copyTextWithSelection(value)
}

export function subscriptionLabel(item: { serviceProvider?: string; provider?: string; email?: string; url?: string; metrics?: { expireAt?: string } }) {
  const tail = item.url ? item.url.slice(-4) : "????"
  return `${item.serviceProvider || item.provider || "Provider"} - ${tail} - ${formatDate(item.metrics?.expireAt)} - ${item.email || "No email"}`
}
