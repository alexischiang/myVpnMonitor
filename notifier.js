let cachedTransporter = null;
const proxyAgents = new Map();

function getAlertConfig() {
  return {
    threshold: Number(process.env.ALERT_REMAINING_BYTES || 10 * 1024 * 1024 * 1024),
    cooldownMs: Number(process.env.ALERT_COOLDOWN_MS || 12 * 60 * 60 * 1000)
  };
}

function getMailerConfig() {
  return {
    from: process.env.ALERT_EMAIL_FROM || "",
    pass: String(process.env.ALERT_EMAIL_PASS || "").replace(/\s/g, ""),
    resendApiKey: process.env.RESEND_API_KEY || "",
    resendFrom: process.env.RESEND_EMAIL_FROM || "",
    to: process.env.ALERT_EMAIL_TO || "alexischiangg@gmail.com",
    host: process.env.ALERT_SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.ALERT_SMTP_PORT || 465),
    secure: process.env.ALERT_SMTP_SECURE ? process.env.ALERT_SMTP_SECURE === "true" : true,
    ...getAlertConfig()
  };
}

function getTelegramConfig() {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    chatId: process.env.TELEGRAM_CHAT_ID || "",
    apiBaseUrl: (process.env.TELEGRAM_API_BASE_URL || "https://api.telegram.org").replace(/\/+$/, ""),
    proxyUrl: process.env.TELEGRAM_PROXY_URL || "",
    parseMode: process.env.TELEGRAM_PARSE_MODE || "",
    ...getAlertConfig()
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
    auth: { user: cfg.from, pass: cfg.pass }
  });
  return cachedTransporter;
}

async function sendMail({ to, subject, text, html }) {
  const cfg = getMailerConfig();
  if (cfg.resendApiKey && cfg.resendFrom) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${cfg.resendApiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: cfg.resendFrom, to: [to || cfg.to], subject, text, html }),
        signal: AbortSignal.timeout(10000)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || `Resend request failed (${response.status}).`);
      return result;
    } catch (error) {
      if (!cfg.from || !cfg.pass) throw error;
      console.warn(`[mail] Resend failed; falling back to SMTP: ${error.message}`);
    }
  }
  const transporter = getTransporter();
  return transporter.sendMail({
    from: `NEXORA <${cfg.from}>`,
    to: to || cfg.to,
    subject,
    text,
    html
  });
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

async function sendTelegram({ text, chatId }) {
  const cfg = getTelegramConfig();
  const targetChatId = chatId || cfg.chatId;
  if (!targetChatId) throw new Error("TELEGRAM_CHAT_ID is not configured.");
  const payload = { chat_id: targetChatId, text, disable_web_page_preview: true };
  if (cfg.parseMode) payload.parse_mode = cfg.parseMode;
  const response = await requestTelegram("sendMessage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
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

function buildLowTrafficAlert(item, remaining, threshold) {
  const label = item.email || item.name || item.id || "(unnamed subscription)";
  const subject = `[XELA] Low traffic alert: ${label}`;
  const lines = [
    `Subscription ${label} remaining traffic is below the alert threshold.`,
    "",
    `Remaining: ${formatBytes(remaining)}`,
    `Threshold: ${formatBytes(threshold)}`,
    `Total: ${formatBytes(item.metrics?.totalBytes)}`,
    `Used: ${formatBytes(item.metrics?.usedBytes)}`,
    `Expires at: ${item.metrics?.expireAt || "-"}`,
    `URL: ${item.url || "-"}`,
    "",
    `Checked at: ${item.lastCheckedAt || new Date().toISOString()}`
  ];
  const text = lines.join("\n");
  const html = `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.6">${escapeHtml(text)}</pre>`;
  return { subject, text, html };
}

function isExpiredItem(item, now = Date.now()) {
  const expireAt = item?.metrics?.expireAt ? new Date(item.metrics.expireAt).getTime() : NaN;
  return Number.isFinite(expireAt) && expireAt <= now;
}

async function checkAndNotifyLowTraffic(items, store, { logger = console } = {}) {
  const cfg = getAlertConfig();
  const mailConfigured = isMailConfigured();
  const telegramConfigured = isTelegramConfigured();
  if (!mailConfigured && !telegramConfigured) {
    return { sent: 0, skipped: items.length, reason: "No mail or Telegram alert channel configured." };
  }

  const now = Date.now();
  let sent = 0;
  const sentByChannel = { mail: 0, telegram: 0 };

  for (const item of items) {
    const remaining = item.metrics?.remainingBytes;
    const key = `low:${item.id}`;
    if (remaining === null || remaining === undefined) continue;

    if (isExpiredItem(item, now)) {
      await store.clear(key);
      continue;
    }

    if (remaining >= cfg.threshold) {
      await store.clear(key);
      continue;
    }

    const previous = await store.get(key);
    if (previous && now - new Date(previous.sentAt).getTime() < cfg.cooldownMs) continue;

    try {
      const alert = buildLowTrafficAlert(item, remaining, cfg.threshold);
      const channels = [];
      if (mailConfigured) {
        await sendMail(alert);
        sentByChannel.mail++;
        channels.push("mail");
      }
      if (telegramConfigured) {
        await sendTelegram({ text: alert.text });
        sentByChannel.telegram++;
        channels.push("telegram");
      }
      await store.set(key, { sentAt: new Date().toISOString(), remainingBytes: remaining, channels });
      sent++;
      logger.log?.(`[alert] low-traffic sent: channels=${channels.join(",")} item=${item.email || item.id} remaining=${remaining}`);
    } catch (error) {
      logger.error?.(`[alert] send failed for ${item.id}:`, error.message);
    }
  }

  return { sent, sentByChannel, threshold: cfg.threshold };
}

module.exports = {
  isConfigured,
  isMailConfigured,
  isTelegramConfigured,
  getMailerConfig,
  getTelegramConfig,
  checkTelegram,
  sendMail,
  sendTelegram,
  checkAndNotifyLowTraffic,
  isExpiredItem,
  formatBytes
};
