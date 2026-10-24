let cachedTransporter = null;
const proxyAgents = new Map();

function getMailerConfig() {
  return {
    from: process.env.ALERT_EMAIL_FROM || "",
    pass: String(process.env.ALERT_EMAIL_PASS || "").replace(/\s/g, ""),
    resendApiKey: process.env.RESEND_API_KEY || "",
    resendFrom: process.env.RESEND_EMAIL_FROM || "",
    to: process.env.ALERT_EMAIL_TO || "alexischiangg@gmail.com",
    host: process.env.ALERT_SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.ALERT_SMTP_PORT || 465),
    secure: process.env.ALERT_SMTP_SECURE ? process.env.ALERT_SMTP_SECURE === "true" : true
  };
}

function getTelegramConfig() {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    chatId: process.env.TELEGRAM_CHAT_ID || "",
    apiBaseUrl: (process.env.TELEGRAM_API_BASE_URL || "https://api.telegram.org").replace(/\/+$/, ""),
    proxyUrl: process.env.TELEGRAM_PROXY_URL || "",
    parseMode: process.env.TELEGRAM_PARSE_MODE || ""
  };
}

function isMailConfigured() {
  const { from, pass, resendApiKey, resendFrom } = getMailerConfig();
  return Boolean((resendApiKey && resendFrom) || (from && pass));
}

function isTelegramConfigured() {
  const { botToken, chatId } = getTelegramConfig();
  return Boolean(botToken && chatId);
}

function isConfigured() {
  return isMailConfigured() || isTelegramConfigured();
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch {
    throw new Error("Missing nodemailer dependency. Please run npm install nodemailer.");
  }
  const cfg = getMailerConfig();
  if (!cfg.from || !cfg.pass) {
    throw new Error("ALERT_EMAIL_FROM / ALERT_EMAIL_PASS is not configured.");
  }
  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.from, pass: cfg.pass },
    // Payment alerts are awaited inside the commerce lock; nodemailer's defaults allow minutes per message.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  });
  return cachedTransporter;
}

function renderEmailHtml({ subject, text, html }) {
  const title = escapeHtml(subject || "NEXORA 通知");
  const content = html || escapeHtml(text || "").replace(/\n/g, "<br>");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${title}</title>
</head>
<body style="margin:0;background:#f5f5f5;color:#171717;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f5f5;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e5e5;border-radius:10px;">
        <tr><td style="padding:22px 28px;border-bottom:1px solid #e5e5e5;font-size:18px;font-weight:700;">NEXORA <span style="color:#737373;font-size:11px;">beta</span></td></tr>
        <tr><td style="padding:32px 28px;">
          <h1 style="margin:0 0 20px;font-size:22px;line-height:1.35;font-weight:600;letter-spacing:0;">${title}</h1>
          <div style="font-size:15px;line-height:1.7;color:#404040;overflow-wrap:anywhere;">${content}</div>
        </td></tr>
        <tr><td style="padding:20px 28px;border-top:1px solid #e5e5e5;color:#737373;font-size:12px;line-height:1.6;">此邮件由 NEXORA 自动发送，请勿直接回复。</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendMail({ to, subject, text, html }) {
  const cfg = getMailerConfig();
  const renderedHtml = renderEmailHtml({ subject, text, html });
  let resendError = "";
  if (cfg.resendApiKey && cfg.resendFrom) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${cfg.resendApiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: cfg.resendFrom, to: [to || cfg.to], subject, text, html: renderedHtml }),
        signal: AbortSignal.timeout(10000)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || `Resend request failed (${response.status}).`);
      return { ...result, transport: "resend" };
    } catch (error) {
      if (!cfg.from || !cfg.pass) throw error;
      console.warn(`[mail] Resend failed; falling back to SMTP: ${error.message}`);
      resendError = error.message;
    }
  }
  const transporter = getTransporter();
  const info = await transporter.sendMail({
    from: `NEXORA <${cfg.from}>`,
    to: to || cfg.to,
    subject,
    text,
    html: renderedHtml
  });
  // Callers that care (the admin test mail) can tell a Resend failure apart from a Resend delivery.
  return { ...info, transport: "smtp", ...(resendError ? { resendError } : {}) };
}

// GET /domains needs a full-access key; a send-only key answers 401 restricted_api_key, which still means the key is valid.
function classifyResendProbe(httpStatus, payload = {}) {
  if (httpStatus >= 200 && httpStatus < 300) return { status: "ok" };
  if (httpStatus === 401 && payload?.name === "restricted_api_key") return { status: "ok" };
  return { status: "error", message: payload?.message || `Resend responded ${httpStatus}.` };
}

async function checkResend({ signal } = {}) {
  const { resendApiKey } = getMailerConfig();
  const response = await fetch("https://api.resend.com/domains", {
    headers: { authorization: `Bearer ${resendApiKey}` },
    signal
  });
  const payload = await response.json().catch(() => ({}));
  return classifyResendProbe(response.status, payload);
}

async function requestTelegram(method, options = {}) {
  const cfg = getTelegramConfig();
  if (!cfg.botToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  const fetchOptions = { ...options };
  let fetchImpl = globalThis.fetch;
  if (cfg.proxyUrl) {
    let ProxyAgent;
    let undiciFetch;
    try {
      ({ ProxyAgent, fetch: undiciFetch } = require("undici"));
    } catch (error) {
      throw new Error(`Telegram proxy requires undici, but it could not be loaded: ${error.message}`);
    }
    if (!proxyAgents.has(cfg.proxyUrl)) proxyAgents.set(cfg.proxyUrl, new ProxyAgent(cfg.proxyUrl));
    fetchOptions.dispatcher = proxyAgents.get(cfg.proxyUrl);
    fetchImpl = undiciFetch;
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Telegram API requires global fetch. Please use Node.js 18+.");
  }
  try {
    return await fetchImpl(`${cfg.apiBaseUrl}/bot${cfg.botToken}/${method}`, fetchOptions);
  } catch (error) {
    const cause = error.cause;
    const detail = cause?.code || cause?.message || error.message;
    throw new Error(`Telegram ${method} request failed: ${detail}`);
  }
}

async function sendTelegram({ text, chatId, parseMode }) {
  const cfg = getTelegramConfig();
  const targetChatId = chatId || cfg.chatId;
  if (!targetChatId) throw new Error("TELEGRAM_CHAT_ID is not configured.");
  const payload = { chat_id: targetChatId, text, disable_web_page_preview: true };
  const resolvedParseMode = parseMode === undefined ? cfg.parseMode : parseMode;
  if (resolvedParseMode) payload.parse_mode = resolvedParseMode;
  const response = await requestTelegram("sendMessage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    // Payment alerts are awaited inside the commerce lock, so a stalled Telegram call must not hang it.
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendMessage failed (${response.status}): ${body.slice(0, 300)}`);
  }
  return response.json();
}

async function checkTelegram({ signal } = {}) {
  const response = await requestTelegram("getMe", { signal });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.description || `Telegram getMe failed (${response.status}).`);
  return payload.result;
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes);
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(2)} ${units[i]}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// Amounts in cents: the order total before any deduction, each deduction that applies, and what the customer actually paid.
// The deductions and the paid amount always add up to the total.
function paymentAlertAmounts(order) {
  const cents = value => Math.max(0, Math.round(Number(value || 0) * 100));
  const payable = cents(order.totalAmount ?? order.amount);
  const deductions = [
    [`优惠码抵扣${order.couponCode ? `（${order.couponCode}）` : ""}`, cents(order.discountAmount)],
    [`VIP 折扣${order.vipDiscountPercent ? `（${order.vipDiscountPercent}%）` : ""}`, cents(order.vipDiscountAmount)],
    ["余额抵扣", cents(order.walletAmount)]
  ].filter(([, value]) => value > 0);
  const paid = Math.max(0, payable - cents(order.walletAmount));
  return { total: payable + cents(order.discountAmount) + cents(order.vipDiscountAmount), deductions, paid };
}

function buildPaymentAlert(order) {
  const recharge = order.purpose === "recharge";
  const trafficPack = order.purpose === "traffic_pack";
  const total = Number(order.totalAmount ?? order.amount ?? 0).toFixed(2);
  const amounts = paymentAlertAmounts(order);
  const yuan = value => `¥${(value / 100).toFixed(2)}`;
  const channel = { "100": "支付宝", alipay: "支付宝", "200": "微信支付", wxpay: "微信支付", manual: "人工收款", wallet: "账户余额", "cash-credit": "现金价值全额抵扣" }[order.channelCode] || order.channelCode || "-";
  const platform = order.paymentPlatformName || { manual: "人工收款", wallet: "站内钱包" }[order.paymentProvider] || order.paymentProvider || "-";
  const paidAt = new Date(order.paidAt || Date.now()).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
  const lines = [
    "🔔 用户消费提醒",
    `📧 用户邮箱：${order.email || "-"}`,
    `🛒 消费类型：${recharge ? "余额充值" : trafficPack ? "流量包购买" : "套餐购买"}`,
  ];
  if (!recharge && !trafficPack && order.purpose !== "addon") lines.push(`👤 客户类型：${Number(order.purchaseCountBefore) >= 1 ? "老客复购" : "新客购买"}`);
  return lines.concat([
    `📦 消费详情：${recharge ? `充值 ¥${total}` : `${order.planName || "-"} / ${order.optionLabel || "-"}`}`,
    `🧮 总金额：${yuan(amounts.total)}`,
    ...amounts.deductions.map(([label, value]) => `🎟️ ${label}：-${yuan(value)}`),
    `💰 实付金额：${yuan(amounts.paid)}`,
    `💳 付款渠道：${channel}`,
    `🏦 支付平台：${platform}`,
    `🧾 订单编号：${order.merOrderTid || order.id || "-"}`,
    `🕒 消费时间：${paidAt}`
  ]).join("\n");
}

function buildPendingDeliveryAlert(order, url) {
  const services = (order.addOnSnapshots || []).map(item => `${item.name}${item.regionName ? `（${item.regionName}）` : ""}${Number(item.quantity) > 1 ? ` ×${item.quantity}` : ""}`).join("、") || order.planName || "-";
  const paidAt = new Date(order.paidAt || Date.now()).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
  return [
    "📦 待交付提醒",
    `📧 用户邮箱：${order.email || "-"}`,
    `🛍️ 待交付服务：${services}`,
    `🧾 订单编号：${order.merOrderTid || order.id || "-"}`,
    `🕒 付款时间：${paidAt}`,
    "",
    `前往交付：${url}`
  ].join("\n");
}

module.exports = {
  isConfigured,
  isMailConfigured,
  isTelegramConfigured,
  getMailerConfig,
  getTelegramConfig,
  checkTelegram,
  checkResend,
  classifyResendProbe,
  sendMail,
  sendTelegram,
  renderEmailHtml,
  buildPaymentAlert,
  buildPendingDeliveryAlert,
  formatBytes
};
