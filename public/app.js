const subscriptionRows = document.querySelector("#subscriptionRows");
const form = document.querySelector("#subscriptionForm");
const formMessage = document.querySelector("#formMessage");
const searchInput = document.querySelector("#search");
const summary = document.querySelector("#summary");
const refreshAllButton = document.querySelector("#refreshAll");
const logoutButton = document.querySelector("#logoutButton");
const debugDialog = document.querySelector("#debugDialog");
const debugOutput = document.querySelector("#debugOutput");
const closeDebug = document.querySelector("#closeDebug");
const tabs = document.querySelectorAll(".tab");
const pages = document.querySelectorAll(".page");
const userForm = document.querySelector("#userForm");
const userFormMessage = document.querySelector("#userFormMessage");
const userRows = document.querySelector("#userRows");
const billRows = document.querySelector("#billRows");
const userSearchInput = document.querySelector("#userSearch");
const billSearchInput = document.querySelector("#billSearch");
const billMonthFilter = document.querySelector("#billMonthFilter");
const billTotalAmount = document.querySelector("#billTotalAmount");
const billTotalMeta = document.querySelector("#billTotalMeta");
const subscriptionSelect = document.querySelector("#subscriptionSelect");
const urlDialog = document.querySelector("#urlDialog");
const userDialog = document.querySelector("#userDialog");
const renewDialog = document.querySelector("#renewDialog");
const urlDialogTitle = document.querySelector("#urlDialogTitle");
const userDialogTitle = document.querySelector("#userDialogTitle");
const renewDialogTitle = document.querySelector("#renewDialogTitle");
const addUrlButton = document.querySelector("#addUrlButton");
const addUserButton = document.querySelector("#addUserButton");
const renewForm = document.querySelector("#renewForm");
const renewFormMessage = document.querySelector("#renewFormMessage");
const expirySortButton = document.querySelector("#expirySortButton");
const expirySortIcon = document.querySelector("#expirySortIcon");
const customerSortButton = document.querySelector("#customerSortButton");
const customerSortIcon = document.querySelector("#customerSortIcon");
const userExpirySortButton = document.querySelector("#userExpirySortButton");
const userExpirySortIcon = document.querySelector("#userExpirySortIcon");
const userPurchaseSortButton = document.querySelector("#userPurchaseSortButton");
const userPurchaseSortIcon = document.querySelector("#userPurchaseSortIcon");
const userPaidSortButton = document.querySelector("#userPaidSortButton");
const userPaidSortIcon = document.querySelector("#userPaidSortIcon");
const billTimeSortButton = document.querySelector("#billTimeSortButton");
const billTimeSortIcon = document.querySelector("#billTimeSortIcon");
const billAmountSortButton = document.querySelector("#billAmountSortButton");
const billAmountSortIcon = document.querySelector("#billAmountSortIcon");
const userDetailDialog = document.querySelector("#userDetailDialog");
const userDetailContent = document.querySelector("#userDetailContent");
const purchaseSuccessDialog = document.querySelector("#purchaseSuccessDialog");
const purchaseSuccessContent = document.querySelector("#purchaseSuccessContent");
const urlDetailDialog = document.querySelector("#urlDetailDialog");
const urlDetailContent = document.querySelector("#urlDetailContent");
const urlColumnButton = document.querySelector("#urlColumnButton");
const urlColumnDialog = document.querySelector("#urlColumnDialog");
const urlColumnOptions = document.querySelector("#urlColumnOptions");
const resetUrlColumns = document.querySelector("#resetUrlColumns");
const refreshOverlay = document.querySelector("#refreshOverlay");
const refreshProgressText = document.querySelector("#refreshProgressText");
const refreshProgressBar = document.querySelector("#refreshProgressBar");
const dataLoadingOverlay = document.querySelector("#dataLoadingOverlay");
const dataLoadingText = document.querySelector("#dataLoadingText");
const appVersion = document.querySelector("#appVersion");
const appUpdatedAt = document.querySelector("#appUpdatedAt");

let subscriptions = [];
let users = [];
let bills = [];
let urlSortKey = "expire";
let urlSortDirection = "desc";
let userSortKey = "purchasedAt";
let userSortDirection = "desc";
let billSortKey = "occurredAt";
let billSortDirection = "desc";
let userManuallySelectedSubscription = false;
const dialogFormSnapshots = new WeakMap();
let dataLoadingCount = 0;
let isInitialLoading = true;

function syncAppHeight() {
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${Math.round(viewportHeight)}px`);
}

function loginPageUrl() {
  if (window.location.protocol === "file:") return new URL("login.html", window.location.href).href;
  return "/login.html";
}

const COLUMN_WIDTH_VERSION = "2026-05-31-user-sort-v1";
const DEFAULT_COLUMN_WIDTHS = {
  urlTable: [56, 190, 360, 86, 110, 118, 170, 96, 140, 168, 258],
  userTable: [56, 150, 110, 122, 104, 118, 360, 190, 130, 300],
  billTable: [56, 150, 150, 90, 100, 90, 220, 150, 92]
};

const URL_COLUMNS = [
  { key: "index", label: "#", defaultVisible: true, locked: true },
  { key: "email", label: "绑定邮箱", defaultVisible: true },
  { key: "url", label: "订阅 URL", defaultVisible: true },
  { key: "customerCount", label: "客户数", defaultVisible: true },
  { key: "remaining", label: "剩余流量", defaultVisible: true },
  { key: "expire", label: "URL 到期", defaultVisible: true },
  { key: "usage", label: "已用 / 总量", defaultVisible: true },
  { key: "status", label: "状态", defaultVisible: true },
  { key: "note", label: "备注", defaultVisible: false },
  { key: "lastChecked", label: "上次检查", defaultVisible: true },
  { key: "actions", label: "操作", defaultVisible: true, locked: true }
];

const statusLabels = {
  ok: "正常",
  warning: "需关注",
  error: "需关注",
  expired: "已到期",
  depleted: "流量耗尽",
  unknown: "未检查"
};

const durationLabels = {
  monthly: "月付",
  quarterly: "季付",
  half_yearly: "半年付",
  yearly: "年付"
};

const billTypeLabels = {
  initial: "新购",
  renewal: "续费",
  adjustment: "调整"
};

function formatBillExpiryChange(bill) {
  if (bill.type === "initial") return `新购至 ${formatDate(bill.afterExpiresAt)}`;
  if (bill.type === "renewal") return `${formatDate(bill.beforeExpiresAt)} 延至 ${formatDate(bill.afterExpiresAt)}`;
  if (bill.type === "adjustment") return "未改变到期日";
  if (bill.beforeExpiresAt || bill.afterExpiresAt) return `${formatDate(bill.beforeExpiresAt)} → ${formatDate(bill.afterExpiresAt)}`;
  return "—";
}

function activeUserBills(userId) {
  return bills.filter(bill => bill.userId === userId && !bill.reversedAt);
}

function userTotalPaid(user) {
  const total = billAmountTotal(activeUserBills(user.id));
  if (total !== 0) return total;
  return Number(user.actualPaid) || 0;
}

function dateParts(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function billMonthValue(value) {
  const parts = dateParts(value);
  if (parts) return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function compareBills(a, b) {
  if (billSortKey === "amount") {
    const diff = (Number(a.amount) || 0) - (Number(b.amount) || 0);
    if (diff !== 0) return billSortDirection === "asc" ? diff : -diff;
  } else {
    const diff = new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
    if (diff !== 0) return billSortDirection === "asc" ? diff : -diff;
  }

  return new Date(b.createdAt || b.occurredAt).getTime() - new Date(a.createdAt || a.occurredAt).getTime();
}

function updateBillSortIcons() {
  billTimeSortIcon.textContent = billSortKey === "occurredAt" ? (billSortDirection === "asc" ? "↑" : "↓") : "↕";
  billAmountSortIcon.textContent = billSortKey === "amount" ? (billSortDirection === "asc" ? "↑" : "↓") : "↕";
}

function formatBytes(bytes) {
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

function formatDate(value) {
  if (!value) return "未知";
  const parts = dateParts(value);
  if (parts) return `${parts.year}/${String(parts.month).padStart(2, "0")}/${String(parts.day).padStart(2, "0")}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function formatDateTime(value) {
  return formatDate(value);
}

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "未知";
  return amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function activeBills() {
  return bills.filter(bill => !bill.reversedAt);
}

function billAmountTotal(list) {
  return list.reduce((sum, bill) => {
    const amount = Number(bill.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

function serializeForm(formElement) {
  return JSON.stringify(Array.from(new FormData(formElement).entries()));
}

function rememberDialogForm(dialog) {
  const formElement = dialog.querySelector("form");
  if (formElement) dialogFormSnapshots.set(dialog, serializeForm(formElement));
}

function hasUnsavedDialogForm(dialog) {
  const formElement = dialog.querySelector("form");
  if (!formElement || !dialogFormSnapshots.has(dialog)) return false;
  return dialogFormSnapshots.get(dialog) !== serializeForm(formElement);
}

function closeDialogSafely(dialog) {
  if (!dialog?.open) return;
  if (hasUnsavedDialogForm(dialog) && !confirm("该信息还未保存是否关闭")) return;
  dialog.close();
}

function updateDialogScrollLock() {
  const hasOpenDialog = Array.from(document.querySelectorAll("dialog")).some(dialog => dialog.open);
  document.body.classList.toggle("has-open-dialog", hasOpenDialog);
}

function showDialog(dialog) {
  syncAppHeight();
  dialog.showModal();
  updateDialogScrollLock();
}

function keepFieldVisible(event) {
  const field = event.target;
  if (!field.matches("input, textarea, select")) return;
  window.setTimeout(() => {
    syncAppHeight();
    field.scrollIntoView({ block: "center", inline: "nearest" });
  }, 120);
}

function toDateInputValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function durationMonths(duration) {
  const values = {
    monthly: 1,
    quarterly: 3,
    half_yearly: 6,
    yearly: 12
  };
  return values[duration] || null;
}

function calculateUserExpiry(purchasedAt, duration) {
  const months = durationMonths(duration);
  const start = new Date(purchasedAt);
  if (!months || Number.isNaN(start.getTime())) return null;

  const expiresAt = new Date(start.getTime());
  const day = expiresAt.getDate();
  expiresAt.setDate(1);
  expiresAt.setMonth(expiresAt.getMonth() + months);
  const lastDay = new Date(expiresAt.getFullYear(), expiresAt.getMonth() + 1, 0).getDate();
  expiresAt.setDate(Math.min(day, lastDay));
  return expiresAt;
}

function calculateRecommendationExpiry(purchasedAt, duration) {
  const months = durationMonths(duration);
  const start = new Date(purchasedAt);
  if (!months || Number.isNaN(start.getTime())) return null;

  const expiresAt = new Date(start.getTime());
  expiresAt.setMonth(expiresAt.getMonth() + months);
  return expiresAt;
}

function userStatus(user) {
  const expiresAt = user.expiresAt ? new Date(user.expiresAt).getTime() : null;
  if (!expiresAt) return "unknown";
  if (expiresAt < Date.now()) return "expired";
  if ((expiresAt - Date.now()) / 86400000 <= 7) return "warning";
  return "ok";
}

function userType(user) {
  return userStatus(user) === "expired" ? "expired" : "active";
}

function isCurrentNaturalMonth(value) {
  const parts = dateParts(value);
  if (parts) {
    const now = new Date();
    return parts.year === now.getFullYear() && parts.month === now.getMonth() + 1;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function expiryTime(item) {
  const time = item.metrics?.expireAt ? new Date(item.metrics.expireAt).getTime() : null;
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function compareExpiry(a, b, direction = urlSortDirection) {
  const aTime = expiryTime(a);
  const bTime = expiryTime(b);
  const aValue = Number.isFinite(aTime) ? aTime : (direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
  const bValue = Number.isFinite(bTime) ? bTime : (direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
  const diff = aValue - bValue;
  return direction === "asc" ? diff : -diff;
}

function subscriptionsByLatestExpiry(list = subscriptions) {
  return [...list].sort((a, b) => compareExpiry(a, b, "desc"));
}

function userExpiryTime(user) {
  const time = user.expiresAt ? new Date(user.expiresAt).getTime() : null;
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function compareUserExpiry(a, b) {
  const aTime = userExpiryTime(a);
  const bTime = userExpiryTime(b);
  const fallback = userSortDirection === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const aValue = Number.isFinite(aTime) ? aTime : fallback;
  const bValue = Number.isFinite(bTime) ? bTime : fallback;
  const diff = aValue - bValue;
  return userSortDirection === "asc" ? diff : -diff;
}

function userPurchaseTime(user) {
  const time = user.purchasedAt ? new Date(user.purchasedAt).getTime() : null;
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function compareUserPurchase(a, b) {
  const diff = userPurchaseTime(a) - userPurchaseTime(b);
  if (diff !== 0) return userSortDirection === "asc" ? diff : -diff;
  return compareUserExpiry(a, b);
}

function compareUserPaid(a, b) {
  const diff = userTotalPaid(a) - userTotalPaid(b);
  if (diff !== 0) return userSortDirection === "asc" ? diff : -diff;
  return compareUserPurchase(a, b);
}

function compareUsers(a, b) {
  if (userSortKey === "expiresAt") return compareUserExpiry(a, b);
  if (userSortKey === "totalPaid") return compareUserPaid(a, b);
  return compareUserPurchase(a, b);
}

function compareCustomerCount(a, b) {
  const diff = customerCountForSubscription(a.id) - customerCountForSubscription(b.id);
  if (diff === 0) return compareExpiry(a, b, "desc");
  return urlSortDirection === "asc" ? diff : -diff;
}

function updateSortIcons() {
  expirySortIcon.textContent = urlSortKey === "expire" ? (urlSortDirection === "asc" ? "↑" : "↓") : "↕";
  customerSortIcon.textContent = urlSortKey === "customerCount" ? (urlSortDirection === "asc" ? "↑" : "↓") : "↕";
  userExpirySortIcon.textContent = userSortKey === "expiresAt" ? (userSortDirection === "asc" ? "↑" : "↓") : "↕";
  userPurchaseSortIcon.textContent = userSortKey === "purchasedAt" ? (userSortDirection === "asc" ? "↑" : "↓") : "↕";
  userPaidSortIcon.textContent = userSortKey === "totalPaid" ? (userSortDirection === "asc" ? "↑" : "↓") : "↕";
}

function statusBadge(statusName) {
  const badge = document.createElement("span");
  badge.className = `status ${statusName || "unknown"}`;
  badge.textContent = statusLabels[statusName] || "未知";
  return badge;
}

function userTypeBadge(user) {
  const type = userType(user);
  const badge = document.createElement("span");
  badge.className = `status ${type === "active" ? "ok" : "expired"}`;
  badge.textContent = type === "active" ? "活跃用户" : "已过期用户";
  return badge;
}

function textCell(row, value, className = "", columnKey = "") {
  const cell = row.insertCell();
  cell.className = ["text-cell", className].filter(Boolean).join(" ");
  if (columnKey) cell.dataset.column = columnKey;
  cell.textContent = value;
  return cell;
}

function renderUrlCell(row, url, columnKey = "url") {
  const cell = row.insertCell();
  cell.className = "url-cell";
  if (columnKey) cell.dataset.column = columnKey;
  const content = document.createElement("div");
  content.className = "url-content";
  const badge = document.createElement("mark");
  badge.className = "url-prefix-badge";
  badge.textContent = url.slice(-4);
  const text = document.createElement("span");
  text.className = "url-text";
  const fullUrl = document.createTextNode(url);
  const copy = actionButton("复制", "secondary compact copy-button", async () => {
    await copyText(url);
    copy.textContent = "已复制";
    setTimeout(() => {
      copy.textContent = "复制";
    }, 1200);
  });

  text.append(fullUrl);
  content.append(badge, text, copy);
  cell.appendChild(content);
  return cell;
}

function usagePercent(metrics) {
  if (!metrics?.totalBytes) return null;
  return Math.min(Math.max((metrics.usedBytes || 0) / metrics.totalBytes * 100, 0), 100);
}

function renderUsageCell(row, metrics, isExpired, columnKey = "usage") {
  const cell = row.insertCell();
  if (columnKey) cell.dataset.column = columnKey;
  if (isExpired) {
    cell.className = "muted-cell";
    cell.textContent = "—";
    return cell;
  }

  const percent = usagePercent(metrics);
  const wrap = document.createElement("div");
  wrap.className = "usage-cell";
  const meta = document.createElement("div");
  meta.className = "usage-meta";
  const text = document.createElement("span");
  text.textContent = `${formatBytes(metrics.usedBytes)} / ${formatBytes(metrics.totalBytes)}`;
  const percentText = document.createElement("strong");
  percentText.textContent = percent === null ? "未知" : `${Math.round(percent)}%`;
  const track = document.createElement("div");
  track.className = "usage-track";
  const fill = document.createElement("span");
  fill.className = "usage-fill";
  if (percent !== null && percent >= 90) fill.classList.add("danger");
  else if (percent !== null && percent >= 70) fill.classList.add("warning");
  fill.style.width = `${percent || 0}%`;

  meta.append(text, percentText);
  track.appendChild(fill);
  wrap.append(meta, track);
  cell.appendChild(wrap);
  return cell;
}

function duplicateUserNumber(user) {
  if (!user?.userId) return null;
  const sameNameUsers = users
    .filter(item => item.userId === user.userId)
    .sort((a, b) => {
      const timeDiff = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      if (timeDiff !== 0) return timeDiff;
      return String(a.id).localeCompare(String(b.id));
    });
  if (sameNameUsers.length <= 1) return null;
  const index = sameNameUsers.findIndex(item => item.id === user.id);
  return index >= 0 ? index + 1 : null;
}

function appendUserIdentity(target, user, fallbackLabel = "未知用户") {
  const wrap = document.createElement("div");
  wrap.className = "user-identity";
  const label = document.createElement("span");
  label.className = "user-identity-label";
  label.textContent = user?.userId || fallbackLabel;
  wrap.appendChild(label);

  const duplicateNumber = duplicateUserNumber(user);
  if (duplicateNumber) {
    const badge = document.createElement("span");
    badge.className = "duplicate-user-badge";
    badge.textContent = `同名 #${duplicateNumber}`;
    wrap.appendChild(badge);
  }

  target.appendChild(wrap);
  return target;
}

function renderUserIdentityCell(row, user) {
  const cell = row.insertCell();
  appendUserIdentity(cell, user);
  return cell;
}

function copyButton(value) {
  const button = actionButton("复制", "secondary compact", async () => {
    await copyText(value);
    button.textContent = "已复制";
    setTimeout(() => {
      button.textContent = "复制";
    }, 1200);
  });
  return button;
}

function showPurchaseSuccess(user) {
  const subscription = user.subscription || {};
  const userBills = activeUserBills(user.id);
  const purchaseCount = userBills.length;
  const totalPaid = billAmountTotal(userBills);
  const url = subscription.url || "关联 URL 已不存在";

  purchaseSuccessContent.replaceChildren();

  const hero = document.createElement("section");
  hero.className = "detail-hero success-hero";
  const avatar = document.createElement("div");
  avatar.className = "detail-avatar";
  avatar.textContent = "✓";
  const titleWrap = document.createElement("div");
  titleWrap.className = "detail-title";
  const title = document.createElement("strong");
  title.textContent = user.userId || "未知用户";
  const subtitle = document.createElement("span");
  subtitle.textContent = `${durationLabels[user.duration] || "未知"} · ${formatMoney(user.actualPaid)}`;
  titleWrap.append(title, subtitle);
  hero.append(avatar, titleWrap, statusBadge(userStatus(user)));
  purchaseSuccessContent.appendChild(hero);

  const stats = document.createElement("section");
  stats.className = "detail-stats";
  [
    ["购买次数", `${purchaseCount} 次`],
    ["购买总付款", formatMoney(totalPaid)],
    ["本次金额", formatMoney(user.actualPaid)]
  ].forEach(([label, value]) => {
    const card = document.createElement("div");
    const labelNode = document.createElement("span");
    const valueNode = document.createElement("strong");
    labelNode.textContent = label;
    valueNode.textContent = value;
    card.append(labelNode, valueNode);
    stats.appendChild(card);
  });
  purchaseSuccessContent.appendChild(stats);

  const section = document.createElement("section");
  section.className = "detail-card";
  const heading = document.createElement("h3");
  heading.textContent = "本次购买";
  const grid = document.createElement("div");
  grid.className = "detail-card-grid";
  [
    ["起始日期", formatDate(user.purchasedAt)],
    ["到期日期", formatDate(user.expiresAt)],
    ["绑定 URL", url]
  ].forEach(([label, value]) => {
    const labelNode = document.createElement("div");
    const valueNode = document.createElement("div");
    labelNode.className = "detail-label";
    valueNode.className = "detail-value";
    labelNode.textContent = label;
    if (label.includes("URL")) {
      valueNode.dataset.kind = "url";
      const wrap = document.createElement("div");
      wrap.className = "success-url-row";
      const text = document.createElement("span");
      text.textContent = value;
      wrap.append(text, copyButton(value));
      valueNode.appendChild(wrap);
    } else {
      valueNode.textContent = value;
    }
    grid.append(labelNode, valueNode);
  });
  section.append(heading, grid);
  purchaseSuccessContent.appendChild(section);
  showDialog(purchaseSuccessDialog);
}

function renderBillUserCell(row, bill) {
  const cell = row.insertCell();
  cell.className = "bill-user-cell";
  const wrap = document.createElement("div");
  wrap.className = "bill-user-wrap";
  const linkedUser = bill.user ? users.find(user => user.id === bill.user.id) || bill.user : null;
  appendUserIdentity(wrap, linkedUser, bill.userLabel || "未知用户");

  if (!bill.user) {
    const badge = document.createElement("span");
    badge.className = "bill-deleted-badge";
    badge.textContent = "已删除用户";
    wrap.appendChild(badge);
  }

  cell.appendChild(wrap);
  return cell;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function actionButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function urlActionButton(label, action, id, className) {
  const button = actionButton(label, className, () => {});
  button.dataset.urlAction = action;
  button.dataset.urlId = id;
  return button;
}

function actionCell(row, buttons, columnKey = "actions") {
  const cell = row.insertCell();
  cell.className = "action-cell";
  if (columnKey) cell.dataset.column = columnKey;
  const group = document.createElement("div");
  group.className = "row-actions";
  group.append(...buttons);
  cell.appendChild(group);
  return cell;
}

function emptyRows(target, colspan, message) {
  target.innerHTML = "";
  const row = target.insertRow();
  const cell = row.insertCell();
  cell.colSpan = colspan;
  cell.className = "empty-cell";
  cell.textContent = message;
}

function customerCountForSubscription(subscriptionId) {
  return users.filter(user => user.subscriptionId === subscriptionId).length;
}

function customerCountClass(count) {
  if (count <= 4) return "count-low";
  if (count <= 8) return "count-medium";
  return "count-high";
}

function startOfLocalDate(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function findRecommendedSubscription(userExpiryDate) {
  if (!userExpiryDate) return null;
  const userExpiryTime = startOfLocalDate(userExpiryDate);
  const dayMs = 86400000;
  const candidates = subscriptions
    .map(item => {
      const expireAt = item.metrics?.expireAt ? new Date(item.metrics.expireAt) : null;
      const expireTime = expireAt && !Number.isNaN(expireAt.getTime()) ? startOfLocalDate(expireAt) : null;
      if (!Number.isFinite(expireTime)) return null;
      const customerCount = customerCountForSubscription(item.id);
      const diffDays = (expireTime - userExpiryTime) / dayMs;
      if (customerCount > 8 || diffDays < -2 || diffDays > 10) return null;
      return { item, diffDays };
    })
    .filter(Boolean);

  const afterCandidates = candidates
    .filter(candidate => candidate.diffDays >= 0)
    .sort((a, b) => a.diffDays - b.diffDays);
  if (afterCandidates.length) return afterCandidates[0].item;

  const beforeCandidates = candidates
    .filter(candidate => candidate.diffDays < 0)
    .sort((a, b) => Math.abs(a.diffDays) - Math.abs(b.diffDays));
  return beforeCandidates[0]?.item || null;
}

function isRecommendationMessage(value) {
  return value.startsWith("已推荐") || value.startsWith("暂无符合");
}

function updateRecommendedSubscription() {
  const isEditing = Boolean(userForm.elements.id.value);
  if (isEditing || userManuallySelectedSubscription) return;

  const duration = userForm.elements.duration.value;
  const canRecommend = duration === "monthly" || duration === "quarterly";
  if (!canRecommend) {
    if (isRecommendationMessage(userFormMessage.textContent)) userFormMessage.textContent = "";
    return;
  }

  const userExpiryDate = calculateRecommendationExpiry(userForm.elements.purchasedAt.value, duration);
  const recommended = findRecommendedSubscription(userExpiryDate);
  if (!recommended) {
    subscriptionSelect.value = subscriptionsByLatestExpiry()[0]?.id || "";
    userFormMessage.textContent = `暂无符合 ${formatDate(userExpiryDate)} 到期窗口的 URL，请手动选择。`;
    return;
  }

  subscriptionSelect.value = recommended.id;
  userFormMessage.textContent = `已推荐 ${formatDate(recommended.metrics?.expireAt)} 到期的 URL。`;
}

function setupResizableTables() {
  if (localStorage.getItem("column-width-version") !== COLUMN_WIDTH_VERSION) {
    Object.keys(DEFAULT_COLUMN_WIDTHS).forEach(tableId => localStorage.removeItem(`column-widths:${tableId}`));
    localStorage.setItem("column-width-version", COLUMN_WIDTH_VERSION);
  }

  document.querySelectorAll(".table-wrap table").forEach(table => {
    if (table.dataset.resizable === "true") return;
    table.dataset.resizable = "true";
    const tableId = table.id || `table-${Math.random().toString(36).slice(2)}`;
    const headers = Array.from(table.querySelectorAll("thead th"));
    const colgroup = document.createElement("colgroup");
    const savedWidths = JSON.parse(localStorage.getItem(`column-widths:${tableId}`) || "[]");
    const defaultWidths = DEFAULT_COLUMN_WIDTHS[tableId] || [];

    headers.forEach((header, index) => {
      const col = document.createElement("col");
      colgroup.appendChild(col);
      const minWidth = minimumColumnWidth(tableId, index);
      const initialWidth = Math.max(Number(savedWidths[index]) || defaultWidths[index] || Math.max(header.offsetWidth || 120, 80), minWidth);
      col.dataset.userWidth = String(initialWidth);
      col.style.width = `${initialWidth}px`;
      header.style.width = `${initialWidth}px`;

      const handle = document.createElement("span");
      handle.className = "resize-handle";
      handle.addEventListener("mousedown", event => {
        event.preventDefault();
        document.body.classList.add("is-resizing-column");
        const startX = event.clientX;
        const startWidth = col.getBoundingClientRect().width || initialWidth;

        const onMove = moveEvent => {
          const width = Math.max(startWidth + moveEvent.clientX - startX, minWidth);
          col.dataset.userWidth = String(width);
          col.style.width = `${width}px`;
          header.style.width = `${width}px`;
          updateTableWidth(table);
        };

        const onUp = () => {
          document.body.classList.remove("is-resizing-column");
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          const widths = Array.from(colgroup.children).map((item, itemIndex) => {
            const width = parseFloat(item.dataset.userWidth) || parseFloat(item.style.width) || item.getBoundingClientRect().width;
            return Math.round(Math.max(width, minimumColumnWidth(tableId, itemIndex)));
          });
          localStorage.setItem(`column-widths:${tableId}`, JSON.stringify(widths));
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
      header.appendChild(handle);
    });

    table.prepend(colgroup);
    updateTableWidth(table);
  });
}

function minimumColumnWidth(tableId, index) {
  const defaultWidth = DEFAULT_COLUMN_WIDTHS[tableId]?.[index] || 96;
  return Math.max(Math.round(defaultWidth * 0.55), 56);
}

function updateTableWidth(table) {
  if (!table) return;
  const cols = Array.from(table.querySelectorAll("col"));
  let total = cols.reduce((sum, col, index) => {
    if (col.classList.contains("hidden-column")) return sum;
    const width = parseFloat(col.dataset.userWidth) || parseFloat(col.style.width) || col.getBoundingClientRect().width || 0;
    col.style.width = `${width}px`;
    const header = table.querySelector(`thead th:nth-child(${index + 1})`);
    if (header) header.style.width = `${width}px`;
    return sum + width;
  }, 0);
  const wrapWidth = table.closest(".table-wrap")?.clientWidth || 0;

  if (wrapWidth > total) {
    const fillIndexMap = {
      urlTable: [2, 8],
      userTable: [6, 9],
      billTable: [6, 7]
    };
    const fillIndexes = fillIndexMap[table.id] || [cols.length - 1];
    const fillCols = fillIndexes.map(index => cols[index]).filter(Boolean);
    const extra = wrapWidth - total;
    fillCols.forEach(col => {
      const index = cols.indexOf(col);
      const baseWidth = parseFloat(col.dataset.userWidth) || parseFloat(col.style.width) || 0;
      const width = baseWidth + extra / fillCols.length;
      col.style.width = `${width}px`;
      const header = table.querySelector(`thead th:nth-child(${index + 1})`);
      if (header) header.style.width = `${width}px`;
    });
    total = wrapWidth;
  }

  if (total > 0) table.style.width = `${Math.ceil(total)}px`;
}

function defaultUrlColumnState() {
  return Object.fromEntries(URL_COLUMNS.map(column => [column.key, column.defaultVisible]));
}

function getUrlColumnState() {
  try {
    return { ...defaultUrlColumnState(), ...JSON.parse(localStorage.getItem("url-column-visibility") || "{}") };
  } catch {
    return defaultUrlColumnState();
  }
}

function saveUrlColumnState(state) {
  localStorage.setItem("url-column-visibility", JSON.stringify(state));
}

function initUrlColumnControls() {
  urlColumnOptions.replaceChildren();
  const state = getUrlColumnState();
  URL_COLUMNS.forEach(column => {
    const label = document.createElement("label");
    label.className = "column-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(state[column.key]);
    checkbox.disabled = Boolean(column.locked);
    checkbox.addEventListener("change", () => {
      const nextState = getUrlColumnState();
      nextState[column.key] = checkbox.checked;
      saveUrlColumnState(nextState);
      applyUrlColumnVisibility();
    });
    const text = document.createElement("span");
    text.textContent = column.label;
    label.append(checkbox, text);
    urlColumnOptions.appendChild(label);
  });
}

function applyUrlColumnVisibility() {
  const state = getUrlColumnState();
  URL_COLUMNS.forEach((column, index) => {
    const visible = column.locked || Boolean(state[column.key]);
    document.querySelectorAll(`#urlTable [data-column="${column.key}"]`).forEach(node => {
      node.hidden = false;
      node.classList.toggle("hidden-table-cell", !visible);
      if (visible) {
        node.removeAttribute("aria-hidden");
      } else {
        node.setAttribute("aria-hidden", "true");
      }
    });
    const col = document.querySelector(`#urlTable col:nth-child(${index + 1})`);
    if (col) col.classList.toggle("hidden-column", !visible);
  });
  updateTableWidth(document.querySelector("#urlTable"));
}

function formatDebugPayload(payload) {
  return payload.map(result => {
    const lines = [
      `客户端：${result.client}`,
      result.error ? `错误：${result.error}` : `状态：${result.status} ${result.statusText || ""}`
    ];

    if (result.headers) {
      lines.push("", "响应头：", JSON.stringify(result.headers, null, 2));
    }

    for (const variant of result.bodyVariants || []) {
      lines.push("", `正文版本 #${variant.index}，长度：${variant.length}`);
      if (variant.parsedJson) lines.push("JSON：", JSON.stringify(variant.parsedJson, null, 2));
      if (variant.interestingLines?.length) lines.push("疑似相关字段：", variant.interestingLines.join("\n"));
      lines.push("预览：", variant.preview || "（空）");
    }

    return lines.join("\n");
  }).join("\n\n==============================\n\n");
}

function showUserDetail(user) {
  const subscription = user.subscription || {};
  const statusName = userStatus(user);
  const userBills = bills
    .filter(bill => bill.userId === user.id)
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  const groups = [
    {
      title: "联系信息",
      items: [
        ["微信名", user.wechatName || "未填写"],
        ["iMessage ID", user.imessageId || "未填写"]
      ]
    },
    {
      title: "订阅信息",
      items: [
        ["最近购买日", formatDate(user.purchasedAt)],
        ["当前到期日", formatDate(user.expiresAt)],
        ["使用 URL", subscription.url || "关联 URL 已不存在"]
      ]
    },
    {
      title: "购买记录",
      items: userBills.length
        ? userBills.map(bill => [
          `${formatDate(bill.occurredAt)} · ${billTypeLabels[bill.type] || bill.type || "账单"}`,
          `${bill.reversedAt ? "已撤销 · " : ""}${formatMoney(bill.amount)} · ${durationLabels[bill.duration] || bill.duration || "—"} · ${formatBillExpiryChange(bill)}`
        ])
        : [["记录", "暂无购买记录"]]
    },
    {
      title: "系统信息",
      items: [
        ["创建时间", formatDateTime(user.createdAt)],
        ["更新时间", formatDateTime(user.updatedAt)]
      ]
    }
  ];

  userDetailContent.replaceChildren();

  const hero = document.createElement("section");
  hero.className = "detail-hero";
  const avatar = document.createElement("div");
  avatar.className = "detail-avatar";
  avatar.textContent = (user.userId || "?").trim().slice(0, 1).toUpperCase();
  const titleWrap = document.createElement("div");
  titleWrap.className = "detail-title";
  const title = document.createElement("strong");
  title.textContent = user.userId || "未知用户";
  const subtitle = document.createElement("span");
  subtitle.textContent = subscription.email || "未绑定邮箱";
  titleWrap.append(title, subtitle);
  hero.append(avatar, titleWrap, statusBadge(statusName));
  userDetailContent.appendChild(hero);

  const stats = document.createElement("section");
  stats.className = "detail-stats";
  [
    ["实付款", formatMoney(user.actualPaid)],
    ["购买时长", durationLabels[user.duration] || "未知"],
    ["到期日期", formatDate(user.expiresAt)]
  ].forEach(([label, value]) => {
    const card = document.createElement("div");
    const labelNode = document.createElement("span");
    const valueNode = document.createElement("strong");
    labelNode.textContent = label;
    valueNode.textContent = value;
    card.append(labelNode, valueNode);
    stats.appendChild(card);
  });
  userDetailContent.appendChild(stats);

  groups.forEach(group => {
    const section = document.createElement("section");
    section.className = "detail-card";
    const heading = document.createElement("h3");
    heading.textContent = group.title;
    const grid = document.createElement("div");
    grid.className = "detail-card-grid";
    group.items.forEach(([label, value]) => {
      const labelNode = document.createElement("div");
      const valueNode = document.createElement("div");
      labelNode.className = "detail-label";
      valueNode.className = "detail-value";
      const lowerLabel = String(label).toLowerCase();
      if (lowerLabel.includes("url")) valueNode.dataset.kind = "url";
      if (lowerLabel.includes("邮箱") || lowerLabel.includes("email")) valueNode.dataset.kind = "email";
      labelNode.textContent = label;
      valueNode.textContent = value || "未知";
      grid.append(labelNode, valueNode);
    });
    section.append(heading, grid);
    userDetailContent.appendChild(section);
  });
  showDialog(userDetailDialog);
}

function renderDetailSections(target, heroConfig, statsItems, groups) {
  target.replaceChildren();

  const hero = document.createElement("section");
  hero.className = "detail-hero";
  const avatar = document.createElement("div");
  avatar.className = "detail-avatar";
  avatar.textContent = heroConfig.avatar;
  const titleWrap = document.createElement("div");
  titleWrap.className = "detail-title";
  const title = document.createElement("strong");
  title.textContent = heroConfig.title;
  const subtitle = document.createElement("span");
  subtitle.textContent = heroConfig.subtitle;
  titleWrap.append(title, subtitle);
  hero.append(avatar, titleWrap, statusBadge(heroConfig.status));
  target.appendChild(hero);

  const stats = document.createElement("section");
  stats.className = "detail-stats";
  statsItems.forEach(([label, value]) => {
    const card = document.createElement("div");
    const labelNode = document.createElement("span");
    const valueNode = document.createElement("strong");
    labelNode.textContent = label;
    valueNode.textContent = value;
    card.append(labelNode, valueNode);
    stats.appendChild(card);
  });
  target.appendChild(stats);

  groups.forEach(group => {
    const section = document.createElement("section");
    section.className = "detail-card";
    const heading = document.createElement("h3");
    heading.textContent = group.title;
    const grid = document.createElement("div");
    grid.className = "detail-card-grid";
    group.items.forEach(([label, value]) => {
      const labelNode = document.createElement("div");
      const valueNode = document.createElement("div");
      labelNode.className = "detail-label";
      valueNode.className = "detail-value";
      const lowerLabel = String(label).toLowerCase();
      if (lowerLabel.includes("url")) valueNode.dataset.kind = "url";
      if (lowerLabel.includes("邮箱") || lowerLabel.includes("email")) valueNode.dataset.kind = "email";
      labelNode.textContent = label;
      valueNode.textContent = value || "未知";
      grid.append(labelNode, valueNode);
    });
    section.append(heading, grid);
    target.appendChild(section);
  });
}

function showUrlDetail(item) {
  const metrics = item.metrics || {};
  const isExpired = item.status === "expired";
  const boundUsers = users.filter(user => user.subscriptionId === item.id);
  const statusName = item.status || "unknown";

  renderDetailSections(
    urlDetailContent,
    {
      avatar: String(boundUsers.length),
      title: item.email || item.name || "未填写邮箱",
      subtitle: item.url,
      status: statusName
    },
    [
      ["绑定客户", `${boundUsers.length}`],
      ["剩余流量", isExpired ? "—" : formatBytes(metrics.remainingBytes)],
      ["到期日期", isExpired ? "—" : formatDate(metrics.expireAt)]
    ],
    [
      {
        title: "订阅信息",
        items: [
          ["绑定邮箱", item.email || "未填写"],
          ["订阅 URL", item.url],
          ["客户数", `${boundUsers.length}`],
          ["备注", item.note || "未填写"]
        ]
      },
      {
        title: "监控信息",
        items: [
          ["状态", statusLabels[statusName] || "未知"],
          ["剩余流量", isExpired ? "—" : formatBytes(metrics.remainingBytes)],
          ["URL 到期", isExpired ? "—" : formatDate(metrics.expireAt)],
          ["已用 / 总量", isExpired ? "—" : `${formatBytes(metrics.usedBytes)} / ${formatBytes(metrics.totalBytes)}`],
          ["上次检查", formatDateTime(item.lastCheckedAt)],
          ["客户端", item.lastClient || "未知"],
          ["HTTP 状态", item.httpStatus || "未知"],
          ["错误信息", item.lastError || "无"]
        ]
      },
      {
        title: "绑定客户",
        items: boundUsers.length
          ? boundUsers.map(user => [user.userId, `${durationLabels[user.duration] || "未知"} · 到期 ${formatDate(user.expiresAt)} · 实付款 ${formatMoney(user.actualPaid)}`])
          : [["客户", "暂无绑定客户"]]
      },
      {
        title: "系统信息",
        items: [
          ["创建时间", formatDateTime(item.createdAt)],
          ["更新时间", formatDateTime(item.updatedAt)]
        ]
      }
    ]
  );
  showDialog(urlDetailDialog);
}

async function showDebug(id) {
  debugOutput.textContent = "正在读取订阅返回...";
  showDialog(debugDialog);
  const response = await apiFetch(`/api/subscriptions/${id}/debug`, {}, "正在读取订阅返回...");
  const payload = await response.json();
  debugOutput.textContent = formatDebugPayload(payload);
}

function renderSummary() {
  const counts = subscriptions.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  const paidTotal = billAmountTotal(activeBills());
  const monthlyPaidTotal = billAmountTotal(activeBills().filter(bill => isCurrentNaturalMonth(bill.occurredAt)));
  const expiringUsers = users.filter(user => userStatus(user) === "warning").length;
  const cards = [
    ["URL 总数", subscriptions.length],
    ["用户总数", users.length],
    ["本月总收入", formatMoney(monthlyPaidTotal)],
    ["需关注 URL", counts.warning || 0],
    ["即将到期用户", expiringUsers],
    ["实付款合计", formatMoney(paidTotal)]
  ];

  summary.innerHTML = cards.map(([label, value]) => `
    <div class="summary-item">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
}

function renderSubscriptionSelect() {
  const currentValue = subscriptionSelect.value;
  const sortedSubscriptions = subscriptionsByLatestExpiry();
  subscriptionSelect.replaceChildren();
  if (!sortedSubscriptions.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "请先添加 URL";
    subscriptionSelect.appendChild(option);
    subscriptionSelect.disabled = true;
    return;
  }

  subscriptionSelect.disabled = false;
  sortedSubscriptions.forEach((item, index) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `#${index + 1} ${item.url.slice(-4)} · ${formatDate(item.metrics?.expireAt)}`;
    subscriptionSelect.appendChild(option);
  });
  if (subscriptions.some(item => item.id === currentValue)) subscriptionSelect.value = currentValue;
}

function renderList() {
  const keyword = searchInput.value.trim().toLowerCase();
  const visible = subscriptions.filter(item => {
    const haystack = `${item.name} ${item.email} ${item.note} ${item.url}`.toLowerCase();
    return haystack.includes(keyword);
  });
  if (urlSortKey === "customerCount") {
    visible.sort(compareCustomerCount);
  } else {
    visible.sort(compareExpiry);
  }
  updateSortIcons();

  subscriptionRows.innerHTML = "";
  if (!visible.length) {
    emptyRows(subscriptionRows, URL_COLUMNS.length, "还没有匹配的 URL。");
    return;
  }

  visible.forEach((item, index) => {
    const row = subscriptionRows.insertRow();
    const metrics = item.metrics || {};
    const isExpired = item.status === "expired";
    const customerCount = customerCountForSubscription(item.id);
    const customerCountTextClass = customerCountClass(customerCount);

    textCell(row, String(index + 1), "index-cell", "index");
    textCell(row, item.email || item.name || "未填写邮箱", "", "email");
    renderUrlCell(row, item.url);
    textCell(row, String(customerCount), `count-cell ${customerCountTextClass}`, "customerCount");
    textCell(row, isExpired ? "—" : formatBytes(metrics.remainingBytes), isExpired ? "muted-cell" : "", "remaining");
    textCell(row, isExpired ? "—" : formatDate(metrics.expireAt), isExpired ? "muted-cell" : "", "expire");
    renderUsageCell(row, metrics, isExpired);
    const statusCell = row.insertCell();
    statusCell.dataset.column = "status";
    statusCell.appendChild(statusBadge(item.status));
    textCell(row, item.note || "", "", "note");
    textCell(row, `${formatDateTime(item.lastCheckedAt)} · ${item.lastClient || "未知"}`, "", "lastChecked");

    actionCell(row, [
      urlActionButton("详情", "detail", item.id, "secondary compact"),
      urlActionButton("编辑", "edit", item.id, "secondary compact"),
      urlActionButton("刷新", "refresh", item.id, "secondary compact"),
      urlActionButton("查看返回", "debug", item.id, "secondary compact"),
      urlActionButton("删除", "delete", item.id, "danger compact")
    ]);
  });
  applyUrlColumnVisibility();
}

function renderUsers() {
  const keyword = userSearchInput.value.trim().toLowerCase();
  const visible = users.filter(user => {
    const subscription = user.subscription || {};
    const haystack = `${user.userId} ${subscription.email || ""} ${subscription.url || ""}`.toLowerCase();
    return haystack.includes(keyword);
  });
  visible.sort(compareUsers);
  updateSortIcons();

  userRows.innerHTML = "";
  if (!visible.length) {
    emptyRows(userRows, 10, "还没有匹配的用户。");
    return;
  }

  visible.forEach((user, index) => {
    const row = userRows.insertRow();
    const subscription = user.subscription || {};

    textCell(row, String(index + 1), "index-cell");
    renderUserIdentityCell(row, user);
    row.insertCell().appendChild(userTypeBadge(user));
    textCell(row, formatDate(user.expiresAt));
    textCell(row, durationLabels[user.duration] || "未知");
    textCell(row, formatMoney(userTotalPaid(user)), "money-cell positive");
    renderUrlCell(row, subscription.url || "关联 URL 已不存在");
    textCell(row, subscription.email || "");
    textCell(row, formatDate(user.purchasedAt));

    actionCell(row, [
      actionButton("详情", "secondary compact", () => showUserDetail(user)),
      actionButton("续费", "secondary compact", () => openRenewDialog(user)),
      actionButton("编辑", "secondary compact", () => openUserDialog(user)),
      actionButton("删除", "danger compact", () => deleteUser(user.id))
    ]);
  });
}

function renderBills() {
  const keyword = billSearchInput.value.trim().toLowerCase();
  const month = billMonthFilter.value;
  const visible = bills.filter(bill => {
    const linkedUser = bill.user ? users.find(user => user.id === bill.user.id) || bill.user : null;
    const userLabel = linkedUser?.userId || bill.userLabel || "";
    const haystack = `${userLabel} ${billTypeLabels[bill.type] || bill.type || ""} ${bill.description || ""}`.toLowerCase();
    const matchesKeyword = haystack.includes(keyword);
    const matchesMonth = !month || billMonthValue(bill.occurredAt) === month;
    return matchesKeyword && matchesMonth;
  }).sort(compareBills);
  const activeVisible = visible.filter(bill => !bill.reversedAt);
  const total = billAmountTotal(activeVisible);

  updateBillSortIcons();
  billTotalAmount.textContent = formatMoney(total);
  billTotalAmount.className = ["money-cell", total < 0 ? "negative" : "positive"].join(" ");
  billTotalMeta.textContent = `${activeVisible.length} 笔有效账单`;

  billRows.innerHTML = "";
  if (!visible.length) {
    emptyRows(billRows, 9, "还没有匹配的账单。");
    return;
  }

  visible.forEach((bill, index) => {
    const row = billRows.insertRow();
    const amount = Number(bill.amount) || 0;
    const changeText = formatBillExpiryChange(bill);

    textCell(row, String(index + 1), "index-cell");
    textCell(row, formatDateTime(bill.occurredAt));
    renderBillUserCell(row, bill);
    textCell(row, billTypeLabels[bill.type] || bill.type || "未知");
    textCell(row, `${amount < 0 ? "-" : ""}${formatMoney(Math.abs(amount))}`, `money-cell ${amount < 0 ? "negative" : "positive"}`);
    textCell(row, durationLabels[bill.duration] || bill.duration || "—");
    textCell(row, changeText);
    textCell(row, bill.reversedAt ? `已撤销 · ${formatDateTime(bill.reversedAt)}` : "有效", bill.reversedAt ? "muted-cell" : "");
    const button = bill.reversedAt
      ? actionButton("已撤销", "secondary compact", () => {})
      : actionButton("撤销", "danger compact", () => reverseBill(bill.id));
    if (bill.reversedAt) button.disabled = true;
    actionCell(row, [button]);
  });
}

function render() {
  renderSummary();
  renderSubscriptionSelect();
  renderList();
  renderUsers();
  renderBills();
}

function skeletonBlock(className = "") {
  const element = document.createElement("span");
  element.className = ["skeleton-block", className].filter(Boolean).join(" ");
  return element;
}

function renderSkeletonRows(target, columns, rows = 6) {
  target.replaceChildren();
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const row = target.insertRow();
    row.className = "skeleton-row";
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const cell = row.insertCell();
      cell.appendChild(skeletonBlock(columnIndex === 0 ? "short" : ""));
    }
  }
}

function renderInitialSkeleton() {
  document.body.classList.add("is-initial-loading");
  summary.innerHTML = Array.from({ length: 6 }, () => `
    <div class="summary-item skeleton-summary">
      <span class="skeleton-block label"></span>
      <strong class="skeleton-block value"></strong>
    </div>
  `).join("");
  renderSkeletonRows(subscriptionRows, URL_COLUMNS.length, 6);
  renderSkeletonRows(userRows, 10, 6);
  renderSkeletonRows(billRows, 9, 6);
}

function clearInitialSkeleton() {
  isInitialLoading = false;
  document.body.classList.remove("is-initial-loading");
}

function setDataLoading(isLoading, message = "请稍候，正在处理请求...") {
  dataLoadingCount = Math.max(0, dataLoadingCount + (isLoading ? 1 : -1));
  const active = dataLoadingCount > 0;
  document.body.classList.toggle("is-loading-data", active);
  if (dataLoadingOverlay) dataLoadingOverlay.hidden = !active;
  if (dataLoadingText && message) dataLoadingText.textContent = message;
}

async function apiFetch(url, options = {}, pendingMessage = "请稍候，正在处理请求...") {
  const shouldShowPending = !isInitialLoading;
  if (shouldShowPending) setDataLoading(true, pendingMessage);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.headers || {})
      }
    });
    if (response.status === 401 && window.location.protocol !== "file:") {
      window.location.href = loginPageUrl();
    }
    return response;
  } finally {
    if (shouldShowPending) setDataLoading(false);
  }
}

async function fetchJson(url, pendingMessage = "请稍候，正在从数据库拉取...") {
  const response = await apiFetch(url, {}, pendingMessage);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
  return payload;
}

async function loadSubscriptions(message) {
  subscriptions = await fetchJson("/api/subscriptions", message);
}

async function loadUsers(message) {
  users = await fetchJson("/api/users", message);
}

async function loadBills(message) {
  bills = await fetchJson("/api/bills", message);
}

async function reloadAllData(message = "请稍候，正在从数据库拉取...") {
  await Promise.all([
    loadSubscriptions(message),
    loadUsers(message),
    loadBills(message)
  ]);
}

async function reloadAfterMutation(message = "正在同步最新数据...") {
  await reloadAllData(message);
  render();
}

async function loadAppMeta() {
  const response = await apiFetch("/api/app-meta", {}, "正在读取版本信息...");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
  if (appVersion) appVersion.textContent = `Version ${payload.version || "--"}`;
  if (appUpdatedAt) appUpdatedAt.textContent = `Latest updated: ${formatDateTime(payload.updatedAt)}`;
}

function openUrlDialog(item = null) {
  form.reset();
  formMessage.textContent = "";
  urlDialogTitle.textContent = item ? "编辑 URL" : "添加 URL";
  form.elements.id.value = item?.id || "";
  form.elements.url.value = item?.url || "";
  form.elements.email.value = item?.email || "";
  form.elements.note.value = item?.note || "";
  rememberDialogForm(urlDialog);
  showDialog(urlDialog);
}

function openUserDialog(user = null) {
  userForm.reset();
  userFormMessage.textContent = "";
  userManuallySelectedSubscription = false;
  userDialogTitle.textContent = user ? "编辑用户" : "添加用户";
  renderSubscriptionSelect();
  userForm.elements.id.value = user?.id || "";
  userForm.elements.userId.value = user?.userId || "";
  userForm.elements.wechatName.value = user?.wechatName || "";
  userForm.elements.imessageId.value = user?.imessageId || "";
  userForm.elements.purchasedAt.value = user?.purchasedAt ? toDateInputValue(new Date(user.purchasedAt)) : toDateInputValue();
  userForm.elements.actualPaid.value = user?.actualPaid ?? "";
  userForm.elements.duration.value = user?.duration || "monthly";
  userForm.elements.subscriptionId.value = user?.subscriptionId || subscriptionsByLatestExpiry()[0]?.id || "";
  if (!user) updateRecommendedSubscription();
  rememberDialogForm(userDialog);
  showDialog(userDialog);
}

function openRenewDialog(user) {
  renewForm.reset();
  renewFormMessage.textContent = "";
  renewDialogTitle.textContent = `${user.userId || "用户"} 续费`;
  renewForm.elements.id.value = user.id;
  renewForm.elements.purchasedAt.value = toDateInputValue();
  renewForm.elements.actualPaid.value = "";
  renewForm.elements.duration.value = user.duration || "monthly";
  rememberDialogForm(renewDialog);
  showDialog(renewDialog);
}

async function refreshOne(id, { sync = true } = {}) {
  const response = await apiFetch(`/api/subscriptions/${id}/refresh`, { method: "POST" }, "正在刷新 URL...");
  const updated = await response.json();
  if (sync) {
    await reloadAfterMutation("正在同步最新数据...");
    return;
  }
  subscriptions = subscriptions.map(item => item.id === id ? updated : item);
}

function setRefreshPending(isPending, completed = 0, total = 0) {
  document.body.classList.toggle("is-refreshing", isPending);
  refreshOverlay.hidden = !isPending;
  const percent = total ? Math.round(completed / total * 100) : 0;
  refreshProgressBar.style.width = `${percent}%`;
  refreshProgressText.textContent = total ? `已完成 ${completed} / ${total}` : "准备开始...";
}

async function deleteOne(id) {
  if (!confirm("确定删除这个 URL 吗？已关联的用户会保留。")) return;
  await apiFetch(`/api/subscriptions/${id}`, { method: "DELETE" }, "正在删除 URL...");
  await reloadAfterMutation("正在同步最新数据...");
}

async function deleteUser(id) {
  if (!confirm("确定删除这个用户吗？")) return;
  await apiFetch(`/api/users/${id}`, { method: "DELETE" }, "正在删除用户...");
  await reloadAfterMutation("正在同步最新数据...");
}

async function reverseBill(id) {
  if (!confirm("确定撤销这笔账单吗？收入统计会同步扣回。")) return;
  const response = await apiFetch(`/api/bills/${id}/reverse`, { method: "POST" }, "正在撤销账单...");
  const data = await response.json();
  if (!response.ok) {
    alert(data.error || "撤销账单失败。");
    return;
  }
  await reloadAfterMutation("正在同步最新数据...");
}

async function switchPage(pageName) {
  tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.page === pageName));
  pages.forEach(page => page.classList.toggle("active", page.id === `${pageName}Page`));
  document.querySelectorAll(".table-wrap table").forEach(updateTableWidth);
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const id = form.elements.id.value;
  formMessage.textContent = id ? "正在保存 URL..." : "正在检查订阅 URL...";
  const payload = Object.fromEntries(new FormData(form).entries());
  delete payload.id;
  const response = await apiFetch(id ? `/api/subscriptions/${id}` : "/api/subscriptions", {
    method: id ? "PUT" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  }, id ? "正在保存 URL..." : "正在检查并添加 URL...");
  const data = await response.json();
  if (!response.ok) {
    formMessage.textContent = data.error || "保存失败。";
    return;
  }

  urlDialog.close();
  await reloadAfterMutation("正在同步最新数据...");
});

userForm.addEventListener("submit", async event => {
  event.preventDefault();
  const id = userForm.elements.id.value;
  userFormMessage.textContent = "正在保存用户...";
  const payload = Object.fromEntries(new FormData(userForm).entries());
  delete payload.id;
  const response = await apiFetch(id ? `/api/users/${id}` : "/api/users", {
    method: id ? "PUT" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  }, id ? "正在保存用户..." : "正在添加用户...");
  const data = await response.json();
  if (!response.ok) {
    userFormMessage.textContent = data.error || "保存失败。";
    return;
  }

  userDialog.close();
  await reloadAfterMutation("正在同步最新数据...");
  if (!id) showPurchaseSuccess(data);
});

renewForm.addEventListener("submit", async event => {
  event.preventDefault();
  const id = renewForm.elements.id.value;
  renewFormMessage.textContent = "正在续费...";
  const payload = Object.fromEntries(new FormData(renewForm).entries());
  delete payload.id;
  const response = await apiFetch(`/api/users/${id}/renew`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  }, "正在续费用户...");
  const data = await response.json();
  if (!response.ok) {
    renewFormMessage.textContent = data.error || "续费失败。";
    return;
  }

  renewDialog.close();
  await reloadAfterMutation("正在同步最新数据...");
});

refreshAllButton.addEventListener("click", async () => {
  const items = [...subscriptions];
  if (!items.length) return;
  refreshAllButton.disabled = true;
  refreshAllButton.textContent = "刷新中...";
  setRefreshPending(true, 0, items.length);
  try {
    for (const [index, item] of items.entries()) {
      await refreshOne(item.id, { sync: false });
      setRefreshPending(true, index + 1, items.length);
    }
    await reloadAfterMutation("正在同步最新数据...");
  } finally {
    setRefreshPending(false);
    refreshAllButton.disabled = false;
    refreshAllButton.textContent = "全部刷新";
  }
});

logoutButton.addEventListener("click", async () => {
  localStorage.removeItem("xela-login");
  if (window.location.protocol !== "file:") {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store"
      });
    } catch {}
  }
  window.location.href = loginPageUrl();
});

tabs.forEach(tab => {
  tab.addEventListener("click", () => switchPage(tab.dataset.page));
});

subscriptionRows.addEventListener("click", event => {
  const button = event.target.closest("[data-url-action]");
  if (!button) return;
  const item = subscriptions.find(entry => entry.id === button.dataset.urlId);
  if (!item) return;

  const actions = {
    detail: () => showUrlDetail(item),
    edit: () => openUrlDialog(item),
    refresh: () => refreshOne(item.id),
    debug: () => showDebug(item.id),
    delete: () => deleteOne(item.id)
  };
  actions[button.dataset.urlAction]?.();
});

document.querySelectorAll(".close-dialog").forEach(button => {
  button.addEventListener("click", () => closeDialogSafely(document.querySelector(`#${button.dataset.close}`)));
});

document.querySelectorAll("dialog").forEach(dialog => {
  dialog.addEventListener("click", event => {
    if (event.target === dialog) closeDialogSafely(dialog);
  });
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    closeDialogSafely(dialog);
  });
  dialog.addEventListener("close", updateDialogScrollLock);
});

window.addEventListener("resize", syncAppHeight);
window.addEventListener("orientationchange", syncAppHeight);
window.visualViewport?.addEventListener("resize", syncAppHeight);
window.visualViewport?.addEventListener("scroll", syncAppHeight);
document.addEventListener("focusin", keepFieldVisible);
document.addEventListener("focusout", () => {
  window.setTimeout(syncAppHeight, 80);
});
syncAppHeight();

document.querySelectorAll('input[type="number"]').forEach(input => {
  input.addEventListener("wheel", event => {
    event.preventDefault();
  }, { passive: false });
});

addUrlButton.addEventListener("click", () => openUrlDialog());
addUserButton.addEventListener("click", () => openUserDialog());
urlColumnButton.addEventListener("click", () => {
  initUrlColumnControls();
  showDialog(urlColumnDialog);
});
resetUrlColumns.addEventListener("click", () => {
  saveUrlColumnState(defaultUrlColumnState());
  initUrlColumnControls();
  applyUrlColumnVisibility();
});
closeDebug.addEventListener("click", () => closeDialogSafely(debugDialog));
searchInput.addEventListener("input", renderList);
userSearchInput.addEventListener("input", renderUsers);
billSearchInput.addEventListener("input", renderBills);
billMonthFilter.addEventListener("input", renderBills);
subscriptionSelect.addEventListener("change", () => {
  userManuallySelectedSubscription = true;
});
userForm.elements.purchasedAt.addEventListener("change", () => {
  updateRecommendedSubscription();
});
userForm.querySelectorAll('input[name="duration"]').forEach(input => {
  input.addEventListener("change", () => {
    updateRecommendedSubscription();
  });
});
expirySortButton.addEventListener("click", () => {
  urlSortDirection = urlSortKey === "expire" && urlSortDirection === "desc" ? "asc" : "desc";
  urlSortKey = "expire";
  renderList();
});
customerSortButton.addEventListener("click", () => {
  urlSortDirection = urlSortKey === "customerCount" && urlSortDirection === "desc" ? "asc" : "desc";
  urlSortKey = "customerCount";
  renderList();
});
userExpirySortButton.addEventListener("click", () => {
  userSortDirection = userSortKey === "expiresAt" && userSortDirection === "asc" ? "desc" : "asc";
  userSortKey = "expiresAt";
  renderUsers();
});
userPurchaseSortButton.addEventListener("click", () => {
  userSortDirection = userSortKey === "purchasedAt" && userSortDirection === "desc" ? "asc" : "desc";
  userSortKey = "purchasedAt";
  renderUsers();
});
userPaidSortButton.addEventListener("click", () => {
  userSortDirection = userSortKey === "totalPaid" && userSortDirection === "desc" ? "asc" : "desc";
  userSortKey = "totalPaid";
  renderUsers();
});
billTimeSortButton.addEventListener("click", () => {
  billSortDirection = billSortKey === "occurredAt" && billSortDirection === "desc" ? "asc" : "desc";
  billSortKey = "occurredAt";
  renderBills();
});
billAmountSortButton.addEventListener("click", () => {
  billSortDirection = billSortKey === "amount" && billSortDirection === "desc" ? "asc" : "desc";
  billSortKey = "amount";
  renderBills();
});
window.addEventListener("resize", () => {
  document.querySelectorAll(".table-wrap table").forEach(updateTableWidth);
});

renderInitialSkeleton();

reloadAllData("正在加载最新数据...").then(() => {
  clearInitialSkeleton();
  render();
  setupResizableTables();
  initUrlColumnControls();
  applyUrlColumnVisibility();
  return loadAppMeta();
}).catch(error => {
  clearInitialSkeleton();
  console.error(error);
  alert("加载最新数据失败，请稍后再试。");
});
