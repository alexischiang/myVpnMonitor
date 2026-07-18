import type { User } from "./types"

export const durationLabels: Record<string, string> = {
  monthly: "月付",
  quarterly: "季付",
  half_yearly: "半年付",
  yearly: "年付",
  custom: "自定义",
  lifetime: "永久",
}

export const billTypeLabels: Record<string, string> = {
  initial: "新购",
  renewal: "续费延长",
  replacement: "覆盖",
  adjustment: "调整",
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
  const expiresAt = user?.expiresAt ? new Date(user.expiresAt).getTime() : null
  if (expiresAt && expiresAt < Date.now()) return "expired"
  if (expiresAt && expiresAt - Date.now() <= 3 * 86400000) return "warning"
  return "ok"
}

export function copyText(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value)
  const input = document.createElement("textarea")
  input.value = value
  input.setAttribute("readonly", "")
  input.style.position = "fixed"
  input.style.opacity = "0"
  document.body.appendChild(input)
  input.select()
  document.execCommand("copy")
  input.remove()
  return Promise.resolve()
}

export function subscriptionLabel(item: { serviceProvider?: string; provider?: string; email?: string; url?: string; metrics?: { expireAt?: string } }) {
  const tail = item.url ? item.url.slice(-4) : "????"
  return `${item.serviceProvider || item.provider || "Provider"} - ${tail} - ${formatDate(item.metrics?.expireAt)} - ${item.email || "No email"}`
}
