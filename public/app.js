const subscriptionRows = document.querySelector("#subscriptionRows");
const form = document.querySelector("#subscriptionForm");
const formMessage = document.querySelector("#formMessage");
const searchInput = document.querySelector("#search");
const summary = document.querySelector("#summary");
const refreshAllButton = document.querySelector("#refreshAll");
const debugDialog = document.querySelector("#debugDialog");
const debugOutput = document.querySelector("#debugOutput");
const closeDebug = document.querySelector("#closeDebug");
const tabs = document.querySelectorAll(".tab");
const pages = document.querySelectorAll(".page");
const userForm = document.querySelector("#userForm");
const userFormMessage = document.querySelector("#userFormMessage");
const userRows = document.querySelector("#userRows");
const userSearchInput = document.querySelector("#userSearch");
const subscriptionSelect = document.querySelector("#subscriptionSelect");
const urlDialog = document.querySelector("#urlDialog");
const userDialog = document.querySelector("#userDialog");
const urlDialogTitle = document.querySelector("#urlDialogTitle");
const userDialogTitle = document.querySelector("#userDialogTitle");
const addUrlButton = document.querySelector("#addUrlButton");
const addUserButton = document.querySelector("#addUserButton");
const expirySortButton = document.querySelector("#expirySortButton");
const expirySortIcon = document.querySelector("#expirySortIcon");
const userDetailDialog = document.querySelector("#userDetailDialog");
const userDetailContent = document.querySelector("#userDetailContent");
const urlDetailDialog = document.querySelector("#urlDetailDialog");
const urlDetailContent = document.querySelector("#urlDetailContent");
const urlColumnButton = document.querySelector("#urlColumnButton");
const urlColumnDialog = document.querySelector("#urlColumnDialog");
const urlColumnOptions = document.querySelector("#urlColumnOptions");
const resetUrlColumns = document.querySelector("#resetUrlColumns");
const refreshOverlay = document.querySelector("#refreshOverlay");
const refreshProgressText = document.querySelector("#refreshProgressText");
const refreshProgressBar = document.querySelector("#refreshProgressBar");

let subscriptions = [];
let users = [];
let expirySortDirection = "desc";

const COLUMN_WIDTH_VERSION = "2026-05-29-compact-table-v1";
const DEFAULT_COLUMN_WIDTHS = {
  urlTable: [56, 190, 360, 86, 110, 118, 170, 96, 140, 168, 258],
  userTable: [56, 150, 122, 104, 108, 360, 190, 118, 96, 210]
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
  error: "异常",
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function formatDateTime(value) {
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

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "未知";
  return amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toDatetimeLocalValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function userStatus(user) {
  const expiresAt = user.expiresAt ? new Date(user.expiresAt).getTime() : null;
  if (!expiresAt) return "unknown";
  if (expiresAt < Date.now()) return "expired";
  if ((expiresAt - Date.now()) / 86400000 <= 7) return "warning";
  return "ok";
}

function isCurrentNaturalMonth(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function expiryTime(item) {
  const time = item.metrics?.expireAt ? new Date(item.metrics.expireAt).getTime() : null;
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function compareExpiry(a, b) {
  const aTime = expiryTime(a);
  const bTime = expiryTime(b);
  const aValue = Number.isFinite(aTime) ? aTime : (expirySortDirection === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
  const bValue = Number.isFinite(bTime) ? bTime : (expirySortDirection === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
  const diff = aValue - bValue;
  return expirySortDirection === "asc" ? diff : -diff;
}

function statusBadge(statusName) {
  const badge = document.createElement("span");
  badge.className = `status ${statusName || "unknown"}`;
  badge.textContent = statusLabels[statusName] || "未知";
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
  const text = document.createElement("span");
  text.className = "url-text";
  const prefix = document.createTextNode(url.slice(0, -4));
  const suffix = document.createElement("mark");
  suffix.className = "url-suffix";
  suffix.textContent = url.slice(-4);
  const copy = actionButton("复制", "secondary compact copy-button", async () => {
    await copyText(url);
    copy.textContent = "已复制";
    setTimeout(() => {
      copy.textContent = "复制";
    }, 1200);
  });

  text.append(prefix, suffix);
  content.append(text, copy);
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
          col.style.width = `${width}px`;
          header.style.width = `${width}px`;
          updateTableWidth(table);
        };

        const onUp = () => {
          document.body.classList.remove("is-resizing-column");
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          const widths = Array.from(colgroup.children).map((item, itemIndex) => {
            const width = parseFloat(item.style.width) || item.getBoundingClientRect().width;
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
  const total = cols.reduce((sum, col) => {
    if (col.classList.contains("hidden-column")) return sum;
    const width = parseFloat(col.style.width) || col.getBoundingClientRect().width || 0;
    return sum + width;
  }, 0);
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
        ["购买时间", formatDate(user.purchasedAt)],
        ["购买时长", durationLabels[user.duration] || "未知"],
        ["用户到期", formatDate(user.expiresAt)],
        ["绑定邮箱", subscription.email || "未填写"],
        ["使用 URL", subscription.url || "关联 URL 已不存在"]
      ]
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
      labelNode.textContent = label;
      valueNode.textContent = value || "未知";
      grid.append(labelNode, valueNode);
    });
    section.append(heading, grid);
    userDetailContent.appendChild(section);
  });
  userDetailDialog.showModal();
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
  urlDetailDialog.showModal();
}

async function showDebug(id) {
  debugOutput.textContent = "正在读取订阅返回...";
  debugDialog.showModal();
  const response = await fetch(`/api/subscriptions/${id}/debug`);
  const payload = await response.json();
  debugOutput.textContent = formatDebugPayload(payload);
}

function renderSummary() {
  const counts = subscriptions.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  const paidTotal = users.reduce((sum, user) => {
    const amount = Number(user.actualPaid);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  const monthlyPaidTotal = users.reduce((sum, user) => {
    const amount = Number(user.actualPaid);
    return sum + (isCurrentNaturalMonth(user.purchasedAt) && Number.isFinite(amount) ? amount : 0);
  }, 0);
  const expiringUsers = users.filter(user => userStatus(user) === "warning").length;
  const cards = [
    ["URL 总数", subscriptions.length],
    ["用户总数", users.length],
    ["本月总收入", formatMoney(monthlyPaidTotal)],
    ["需处理 URL", counts.error || 0],
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
  subscriptionSelect.replaceChildren();
  if (!subscriptions.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "请先添加 URL";
    subscriptionSelect.appendChild(option);
    subscriptionSelect.disabled = true;
    return;
  }

  subscriptionSelect.disabled = false;
  subscriptions.forEach((item, index) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `#${index + 1} ${item.email || item.name} - ${item.url}`;
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
  if (expirySortDirection) {
    visible.sort(compareExpiry);
  }
  expirySortIcon.textContent = expirySortDirection === "asc" ? "↑" : expirySortDirection === "desc" ? "↓" : "↕";

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

    textCell(row, String(index + 1), "index-cell", "index");
    textCell(row, item.email || item.name || "未填写邮箱", "", "email");
    renderUrlCell(row, item.url);
    textCell(row, String(customerCount), "count-cell", "customerCount");
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

  userRows.innerHTML = "";
  if (!visible.length) {
    emptyRows(userRows, 10, "还没有匹配的用户。");
    return;
  }

  visible.forEach((user, index) => {
    const row = userRows.insertRow();
    const statusName = userStatus(user);
    const subscription = user.subscription || {};

    textCell(row, String(index + 1), "index-cell");
    textCell(row, user.userId);
    textCell(row, formatDate(user.purchasedAt));
    textCell(row, durationLabels[user.duration] || "未知");
    textCell(row, formatMoney(user.actualPaid));
    renderUrlCell(row, subscription.url || "关联 URL 已不存在");
    textCell(row, subscription.email || "");
    textCell(row, formatDate(user.expiresAt));
    row.insertCell().appendChild(statusBadge(statusName));

    actionCell(row, [
      actionButton("详情", "secondary compact", () => showUserDetail(user)),
      actionButton("编辑", "secondary compact", () => openUserDialog(user)),
      actionButton("删除", "danger compact", () => deleteUser(user.id))
    ]);
  });
}

function render() {
  renderSummary();
  renderSubscriptionSelect();
  renderList();
  renderUsers();
}

async function loadSubscriptions() {
  const response = await fetch("/api/subscriptions");
  subscriptions = await response.json();
}

async function loadUsers() {
  const response = await fetch("/api/users");
  users = await response.json();
}

function openUrlDialog(item = null) {
  form.reset();
  formMessage.textContent = "";
  urlDialogTitle.textContent = item ? "编辑 URL" : "添加 URL";
  form.elements.id.value = item?.id || "";
  form.elements.url.value = item?.url || "";
  form.elements.email.value = item?.email || "";
  form.elements.note.value = item?.note || "";
  urlDialog.showModal();
}

function openUserDialog(user = null) {
  userForm.reset();
  userFormMessage.textContent = "";
  userDialogTitle.textContent = user ? "编辑用户" : "添加用户";
  renderSubscriptionSelect();
  userForm.elements.id.value = user?.id || "";
  userForm.elements.userId.value = user?.userId || "";
  userForm.elements.wechatName.value = user?.wechatName || "";
  userForm.elements.imessageId.value = user?.imessageId || "";
  userForm.elements.purchasedAt.value = user?.purchasedAt ? toDatetimeLocalValue(new Date(user.purchasedAt)) : toDatetimeLocalValue();
  userForm.elements.actualPaid.value = user?.actualPaid ?? "";
  userForm.elements.duration.value = user?.duration || "monthly";
  userForm.elements.subscriptionId.value = user?.subscriptionId || subscriptions[0]?.id || "";
  userDialog.showModal();
}

async function refreshOne(id) {
  const response = await fetch(`/api/subscriptions/${id}/refresh`, { method: "POST" });
  const updated = await response.json();
  subscriptions = subscriptions.map(item => item.id === id ? updated : item);
  render();
}

function setRefreshPending(isPending, completed = 0, total = 0) {
  document.body.classList.toggle("is-refreshing", isPending);
  refreshOverlay.hidden = !isPending;
  const percent = total ? Math.round(completed / total * 100) : 0;
  refreshProgressBar.style.width = `${percent}%`;
  refreshProgressText.textContent = total ? `已完成 ${completed} / ${total}` : "准备开始...";
}

async function deleteOne(id) {
  if (!confirm("确定删除这个 URL 吗？关联用户也会一起删除。")) return;
  await fetch(`/api/subscriptions/${id}`, { method: "DELETE" });
  subscriptions = subscriptions.filter(item => item.id !== id);
  users = users.filter(user => user.subscriptionId !== id);
  render();
}

async function deleteUser(id) {
  if (!confirm("确定删除这个用户吗？")) return;
  await fetch(`/api/users/${id}`, { method: "DELETE" });
  users = users.filter(user => user.id !== id);
  render();
}

function switchPage(pageName) {
  tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.page === pageName));
  pages.forEach(page => page.classList.toggle("active", page.id === `${pageName}Page`));
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const id = form.elements.id.value;
  formMessage.textContent = id ? "正在保存 URL..." : "正在检查订阅 URL...";
  const payload = Object.fromEntries(new FormData(form).entries());
  delete payload.id;
  const response = await fetch(id ? `/api/subscriptions/${id}` : "/api/subscriptions", {
    method: id ? "PUT" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    formMessage.textContent = data.error || "保存失败。";
    return;
  }

  if (id) {
    subscriptions = subscriptions.map(item => item.id === id ? data : item);
  } else {
    subscriptions.unshift(data);
  }
  urlDialog.close();
  render();
});

userForm.addEventListener("submit", async event => {
  event.preventDefault();
  const id = userForm.elements.id.value;
  userFormMessage.textContent = "正在保存用户...";
  const payload = Object.fromEntries(new FormData(userForm).entries());
  delete payload.id;
  const response = await fetch(id ? `/api/users/${id}` : "/api/users", {
    method: id ? "PUT" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    userFormMessage.textContent = data.error || "保存失败。";
    return;
  }

  if (id) {
    users = users.map(user => user.id === id ? data : user);
  } else {
    users.unshift(data);
  }
  userDialog.close();
  render();
});

refreshAllButton.addEventListener("click", async () => {
  const items = [...subscriptions];
  if (!items.length) return;
  refreshAllButton.disabled = true;
  refreshAllButton.textContent = "刷新中...";
  setRefreshPending(true, 0, items.length);
  try {
    for (const [index, item] of items.entries()) {
      await refreshOne(item.id);
      setRefreshPending(true, index + 1, items.length);
    }
  } finally {
    setRefreshPending(false);
    refreshAllButton.disabled = false;
    refreshAllButton.textContent = "全部刷新";
  }
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
  button.addEventListener("click", () => document.querySelector(`#${button.dataset.close}`).close());
});

addUrlButton.addEventListener("click", () => openUrlDialog());
addUserButton.addEventListener("click", () => openUserDialog());
urlColumnButton.addEventListener("click", () => {
  initUrlColumnControls();
  urlColumnDialog.showModal();
});
resetUrlColumns.addEventListener("click", () => {
  saveUrlColumnState(defaultUrlColumnState());
  initUrlColumnControls();
  applyUrlColumnVisibility();
});
closeDebug.addEventListener("click", () => debugDialog.close());
searchInput.addEventListener("input", renderList);
userSearchInput.addEventListener("input", renderUsers);
expirySortButton.addEventListener("click", () => {
  expirySortDirection = expirySortDirection === "asc" ? "desc" : expirySortDirection === "desc" ? null : "asc";
  renderList();
});

Promise.all([loadSubscriptions(), loadUsers()]).then(() => {
  render();
  setupResizableTables();
  initUrlColumnControls();
  applyUrlColumnVisibility();
});
