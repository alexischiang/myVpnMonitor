const list = document.querySelector("#subscriptionList");
const template = document.querySelector("#subscriptionTemplate");
const form = document.querySelector("#subscriptionForm");
const formMessage = document.querySelector("#formMessage");
const searchInput = document.querySelector("#search");
const summary = document.querySelector("#summary");
const refreshAllButton = document.querySelector("#refreshAll");
const debugDialog = document.querySelector("#debugDialog");
const debugOutput = document.querySelector("#debugOutput");
const closeDebug = document.querySelector("#closeDebug");

let subscriptions = [];

const statusLabels = {
  ok: "正常",
  warning: "需关注",
  error: "异常",
  expired: "已到期",
  depleted: "流量耗尽",
  unknown: "未检查"
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
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function daysLeft(value) {
  if (!value) return "";
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
  if (!Number.isFinite(days)) return "";
  if (days < 0) return `已过期 ${Math.abs(days)} 天`;
  return `剩余 ${days} 天`;
}

function usagePercent(metrics) {
  if (!metrics || !metrics.totalBytes) return 0;
  return Math.min(Math.max((metrics.usedBytes || 0) / metrics.totalBytes * 100, 0), 100);
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

  const totalRemaining = subscriptions.reduce((sum, item) => {
    const remaining = item.metrics?.remainingBytes;
    return sum + (Number.isFinite(remaining) ? remaining : 0);
  }, 0);

  const cards = [
    ["总订阅", subscriptions.length],
    ["正常", counts.ok || 0],
    ["需处理", (counts.warning || 0) + (counts.error || 0) + (counts.expired || 0) + (counts.depleted || 0)],
    ["可见剩余流量", formatBytes(totalRemaining)]
  ];

  summary.innerHTML = cards.map(([label, value]) => `
    <div class="summary-item">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
}

function renderList() {
  const keyword = searchInput.value.trim().toLowerCase();
  const visible = subscriptions.filter(item => {
    const haystack = `${item.name} ${item.customer} ${item.note} ${item.url}`.toLowerCase();
    return haystack.includes(keyword);
  });

  list.innerHTML = "";
  if (!visible.length) {
    list.innerHTML = `<div class="empty">还没有匹配的订阅。</div>`;
    return;
  }

  for (const item of visible) {
    const node = template.content.firstElementChild.cloneNode(true);
    const metrics = item.metrics || {};
    const percent = usagePercent(metrics);

    node.querySelector(".name").textContent = item.name;
    node.querySelector(".meta").textContent = `${item.customer || "未填写客户"} · ${item.url}`;
    const status = node.querySelector(".status");
    status.textContent = statusLabels[item.status] || "未知";
    status.classList.add(item.status || "unknown");
    node.querySelector(".remaining").textContent = formatBytes(metrics.remainingBytes);
    node.querySelector(".expire").textContent = `${formatDate(metrics.expireAt)}${metrics.expireAt ? `（${daysLeft(metrics.expireAt)}）` : ""}`;
    node.querySelector(".usage").textContent = `${formatBytes(metrics.usedBytes)} / ${formatBytes(metrics.totalBytes)}`;
    node.querySelector(".progress span").style.width = `${percent}%`;
    const refreshSummary = item.lastRefreshResults?.length
      ? ` · 评分：${item.lastRefreshResults.map(result => `${result.client}=${result.score}`).join(", ")}`
      : "";
    node.querySelector(".note").textContent = item.note || `上次检查：${formatDate(item.lastCheckedAt)} · HTTP ${item.httpStatus || "未知"} · 客户端：${item.lastClient || "未知"}${refreshSummary}`;
    node.querySelector(".error").textContent = item.lastError || "";
    node.querySelector(".refresh").addEventListener("click", () => refreshOne(item.id));
    node.querySelector(".debug").addEventListener("click", () => showDebug(item.id));
    node.querySelector(".delete").addEventListener("click", () => deleteOne(item.id));
    list.appendChild(node);
  }
}

function render() {
  renderSummary();
  renderList();
}

async function loadSubscriptions() {
  const response = await fetch("/api/subscriptions");
  subscriptions = await response.json();
  render();
}

async function refreshOne(id) {
  const response = await fetch(`/api/subscriptions/${id}/refresh`, { method: "POST" });
  const updated = await response.json();
  subscriptions = subscriptions.map(item => item.id === id ? updated : item);
  render();
}

async function deleteOne(id) {
  if (!confirm("确定删除这条订阅记录吗？")) return;
  await fetch(`/api/subscriptions/${id}`, { method: "DELETE" });
  subscriptions = subscriptions.filter(item => item.id !== id);
  render();
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  formMessage.textContent = "正在检查订阅 URL...";
  const payload = Object.fromEntries(new FormData(form).entries());
  const response = await fetch("/api/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    formMessage.textContent = data.error || "添加失败。";
    return;
  }
  subscriptions.unshift(data);
  form.reset();
  formMessage.textContent = "已添加。";
  render();
});

refreshAllButton.addEventListener("click", async () => {
  refreshAllButton.disabled = true;
  refreshAllButton.textContent = "刷新中...";
  for (const item of [...subscriptions]) {
    await refreshOne(item.id);
  }
  refreshAllButton.disabled = false;
  refreshAllButton.textContent = "全部刷新";
});

closeDebug.addEventListener("click", () => debugDialog.close());
searchInput.addEventListener("input", renderList);
loadSubscriptions();
