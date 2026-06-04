const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");

let cachedTransporter = null;

function getMailerConfig() {
  return {
    from: process.env.ALERT_EMAIL_FROM || "",
    pass: process.env.ALERT_EMAIL_PASS || "",
    to: process.env.ALERT_EMAIL_TO || "alexischiangg@gmail.com",
    host: process.env.ALERT_SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.ALERT_SMTP_PORT || 465),
    secure: process.env.ALERT_SMTP_SECURE ? process.env.ALERT_SMTP_SECURE === "true" : true,
    threshold: Number(process.env.ALERT_REMAINING_BYTES || 50 * 1024 * 1024 * 1024),
    cooldownMs: Number(process.env.ALERT_COOLDOWN_MS || 12 * 60 * 60 * 1000)
  };
}

function isConfigured() {
  const { from, pass } = getMailerConfig();
  return Boolean(from && pass);
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch {
    throw new Error("缺少 nodemailer 依赖，请先 npm install nodemailer。");
  }
  const cfg = getMailerConfig();
  if (!cfg.from || !cfg.pass) {
    throw new Error("未配置 ALERT_EMAIL_FROM / ALERT_EMAIL_PASS。");
  }
  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.from, pass: cfg.pass }
  });
  return cachedTransporter;
}

async function sendMail({ subject, text, html }) {
  const cfg = getMailerConfig();
  const transporter = getTransporter();
  return transporter.sendMail({
    from: `XELA monitor <${cfg.from}>`,
    to: cfg.to,
    subject,
    text,
    html
  });
}

function createAlertStore(filePath) {
  let state = null;

  async function load() {
    if (state) return state;
    try {
      const raw = await fs.readFile(filePath, "utf8");
      state = JSON.parse(raw) || {};
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      state = {};
    }
    return state;
  }

  async function save() {
    if (!state) return;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(state, null, 2));
  }

  return {
    async get(key) {
      const data = await load();
      return data[key] || null;
    },
    async set(key, value) {
      const data = await load();
      data[key] = value;
      await save();
    },
    async clear(key) {
      const data = await load();
      if (data[key]) {
        delete data[key];
        await save();
      }
    }
  };
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

function buildLowTrafficMail(item, remaining, threshold) {
  const subject = `[XELA] 低流量告警：${item.email || item.name || item.id}`;
  const label = item.email || item.name || item.id || "(未命名订阅)";
  const lines = [
    `订阅 ${label} 的剩余流量已低于阈值。`,
    "",
    `剩余流量：${formatBytes(remaining)}`,
    `告警阈值：${formatBytes(threshold)}`,
    `总流量　：${formatBytes(item.metrics?.totalBytes)}`,
    `已用流量：${formatBytes(item.metrics?.usedBytes)}`,
    `到期时间：${item.metrics?.expireAt || "-"}`,
    `URL　　：${item.url || "-"}`,
    "",
    `检测时间：${item.lastCheckedAt || new Date().toISOString()}`
  ];
  const text = lines.join("\n");
  const html = `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.6">${
    lines.join("\n").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))
  }</pre>`;
  return { subject, text, html };
}

async function checkAndNotifyLowTraffic(items, store, { logger = console } = {}) {
  if (!isConfigured()) return { sent: 0, skipped: items.length, reason: "未配置邮箱发件账号。" };
  const cfg = getMailerConfig();
  const now = Date.now();
  let sent = 0;

  for (const item of items) {
    const remaining = item.metrics?.remainingBytes;
    const key = `low:${item.id}`;
    if (remaining === null || remaining === undefined) continue;

    if (remaining >= cfg.threshold) {
      await store.clear(key);
      continue;
    }

    const previous = await store.get(key);
    if (previous && now - new Date(previous.sentAt).getTime() < cfg.cooldownMs) continue;

    try {
      const mail = buildLowTrafficMail(item, remaining, cfg.threshold);
      await sendMail(mail);
      await store.set(key, { sentAt: new Date().toISOString(), remainingBytes: remaining });
      sent++;
      logger.log?.(`[alert] low-traffic mail sent: ${item.email || item.id} remaining=${remaining}`);
    } catch (error) {
      logger.error?.(`[alert] send failed for ${item.id}:`, error.message);
    }
  }
  return { sent, threshold: cfg.threshold };
}

module.exports = {
  isConfigured,
  getMailerConfig,
  sendMail,
  createAlertStore,
  checkAndNotifyLowTraffic,
  formatBytes
};
