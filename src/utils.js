export const durationLabels = {
  monthly: "月付",
  quarterly: "季付",
  half_yearly: "半年付",
  yearly: "年付",
  custom: "自定义",
  lifetime: "永久"
};

export const billTypeLabels = {
  initial: "新购",
  renewal: "续费",
  adjustment: "调整"
};

export const statusLabels = {
  ok: "正常",
  warning: "需关注",
  error: "异常",
  expired: "已到期",
  depleted: "流量耗尽",
  unknown: "未检查"
};

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "未知";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = Number(bytes);
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDate(value) {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

// 永久用户的到期日存远期哨兵，展示时翻译为「永久」
export function formatUserExpiry(user) {
  if (user?.duration === "lifetime") return "永久";
  return formatDate(user?.expiresAt);
}

export function formatDateTime(value) {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatMoney(value) {
  const amount = Number(value) || 0;
  return amount.toLocaleString("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2
  });
}

export function toDateInputValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function toDateTimeLocalValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function absoluteUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path, window.location.origin).href;
}

export function userStatus(user) {
  const expiresAt = user?.expiresAt ? new Date(user.expiresAt).getTime() : null;
  if (expiresAt && expiresAt < Date.now()) return "expired";
  if (expiresAt && expiresAt - Date.now() < 3 * 86400000) return "warning";
  return "ok";
}

export function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
  return Promise.resolve();
}
