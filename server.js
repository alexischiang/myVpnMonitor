const http = require("http");
const { execFileSync } = require("child_process");
const fsSync = require("fs");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { createDataStore } = require("./database");
const packageJson = require("./package.json");

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fsSync.existsSync(envPath)) return;
  const content = fsSync.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnv();

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "subscriptions.json");
const DATA_DIR = path.dirname(DATA_FILE);
const USERS_FILE = process.env.USERS_FILE || path.join(DATA_DIR, "users.json");
const BILLS_FILE = process.env.BILLS_FILE || path.join(DATA_DIR, "bills.json");
const CUSTOM_URLS_FILE = process.env.CUSTOM_URLS_FILE || path.join(DATA_DIR, "custom-urls.json");
const POOL_CACHE_DIR = process.env.POOL_CACHE_DIR || path.join(DATA_DIR, "pool-cache");
const DATABASE_URL = process.env.DATABASE_URL || "";
const DIST_DIR = path.join(__dirname, "dist");
const PUBLIC_DIR = fsSync.existsSync(path.join(DIST_DIR, "index.html")) ? DIST_DIR : path.join(__dirname, "public");
const BUILD_META_FILE = process.env.BUILD_META_FILE || path.join(__dirname, "build-meta.json");
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS || 30 * 60 * 1000);
const LOW_TRAFFIC_BYTES = Number(process.env.LOW_TRAFFIC_BYTES || 50 * 1024 * 1024 * 1024);
const EXPIRING_SOON_DAYS = Number(process.env.EXPIRING_SOON_DAYS || 3);
const RELAY_BEFORE_EXPIRY_DAYS = Number(process.env.RELAY_BEFORE_EXPIRY_DAYS || 2);
const RELAY_AFTER_EXPIRY_DAYS = Number(process.env.RELAY_AFTER_EXPIRY_DAYS || 10);
const RELAY_MAX_CUSTOMERS = Number(process.env.RELAY_MAX_CUSTOMERS || 8);
const POOL_CONFIG_CACHE_TTL_MS = Number(process.env.POOL_CONFIG_CACHE_TTL_MS || 24 * 60 * 60 * 1000);
const AUTH_COOKIE_NAME = "xela_session";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto
  .createHash("sha256")
  .update(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}:${DATA_FILE}`)
  .digest("hex");
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const REMEMBER_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
let cachedAppMeta = null;
const REQUEST_PROFILES = [
  {
    name: "shadowrocket",
    headers: {
      "User-Agent": "Shadowrocket/2.2.48 CFNetwork/1496.0.7 Darwin/23.5.0",
      "Accept": "*/*",
      "Accept-Language": "zh-CN,zh-Hans;q=0.9,en;q=0.8"
    }
  },
  {
    name: "clash",
    headers: {
      "User-Agent": "ClashforWindows/0.20.39",
      "Accept": "text/plain, application/yaml, */*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
    }
  },
  {
    name: "clash-meta",
    headers: {
      "User-Agent": "clash.meta",
      "Accept": "text/plain, application/yaml, */*"
    }
  },
  {
    name: "stash",
    headers: {
      "User-Agent": "Stash/2.5.11",
      "Accept": "*/*",
      "Accept-Language": "zh-Hans-CN;q=1"
    }
  },
  {
    name: "surge",
    headers: {
      "User-Agent": "Surge iOS/2998",
      "Accept": "*/*",
      "Accept-Language": "zh-CN,zh-Hans;q=0.9,en;q=0.8"
    }
  },
  {
    name: "quantumult-x",
    headers: {
      "User-Agent": "Quantumult%20X/1.0.30",
      "Accept": "*/*"
    }
  },
  {
    name: "sing-box",
    headers: {
      "User-Agent": "SFA/1.11.0",
      "Accept": "text/plain, application/yaml, */*"
    }
  },
  {
    name: "default",
    headers: {
      "User-Agent": "VPNSubscriptionMonitor/1.0",
      "Accept": "text/plain, application/octet-stream, application/yaml, */*"
    }
  }
];

let subscriptions = [];
let users = [];
let bills = [];
let customUrls = [];
const dataStore = createDataStore({
  dataDir: DATA_DIR,
  databaseUrl: DATABASE_URL,
  files: {
    subscriptions: DATA_FILE,
    users: USERS_FILE,
    bills: BILLS_FILE,
    customUrls: CUSTOM_URLS_FILE
  }
});

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

async function ensureDataFile() {
  await dataStore.init();
  const state = await dataStore.loadAll();
  subscriptions = state.subscriptions;
  users = state.users;
  bills = state.bills;
  customUrls = state.customUrls;

  if (state.missing.subscriptions) await saveData();
  if (state.missing.users) await saveUsers();
  if (state.missing.bills) {
    bills = initialBillsFromUsers();
    await saveBills();
  }
  if (state.missing.customUrls) await saveCustomUrls();
  if (ensureUserRelayTokens()) await saveUsers();
}

async function loadLatestData() {
  const state = await dataStore.loadAll();
  subscriptions = state.subscriptions;
  users = state.users;
  bills = state.bills;
  customUrls = state.customUrls;
}

async function saveData() {
  await dataStore.saveCollection("subscriptions", subscriptions);
}

async function saveUsers() {
  await dataStore.saveCollection("users", users);
}

async function saveBills() {
  await dataStore.saveCollection("bills", bills);
}

async function saveCustomUrls() {
  await dataStore.saveCollection("customUrls", customUrls);
}

function poolCacheUsesFiles() {
  return dataStore.kind === "json";
}

function poolCacheFileName(item) {
  const safeId = String(item.id || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safeId}.yaml`;
}

async function writePoolCachedBody(item, body) {
  const text = String(body || "");
  if (!poolCacheUsesFiles()) {
    return { body: text, bodyFile: null, bodyLength: text.length };
  }

  await fs.mkdir(POOL_CACHE_DIR, { recursive: true });
  const bodyFile = poolCacheFileName(item);
  await fs.writeFile(path.join(POOL_CACHE_DIR, bodyFile), text, "utf8");
  return { body: null, bodyFile, bodyLength: text.length };
}

async function readPoolCachedBody(item) {
  const cache = item?.cachedConfig || null;
  if (!cache) return "";
  if (typeof cache.body === "string") return cache.body;
  if (!cache.bodyFile) return "";

  try {
    return await fs.readFile(path.join(POOL_CACHE_DIR, cache.bodyFile), "utf8");
  } catch {
    return "";
  }
}

function relayToken() {
  return crypto.randomBytes(18).toString("base64url");
}

function ensureUserRelayTokens() {
  let changed = false;
  for (const user of users) {
    if (!user.subscriptionToken) {
      user.subscriptionToken = relayToken();
      changed = true;
    }
  }
  return changed;
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "pragma": "no-cache",
    "expires": "0",
    ...headers
  });
  res.end(JSON.stringify(payload));
}

function readGitUpdatedAt() {
  try {
    return execFileSync("git", ["log", "-1", "--format=%cI"], {
      cwd: __dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}

function readFallbackUpdatedAt() {
  try {
    return fsSync.statSync(path.join(PUBLIC_DIR, "index.html")).mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function readBuildMeta() {
  try {
    return JSON.parse(fsSync.readFileSync(BUILD_META_FILE, "utf8"));
  } catch {
    return {};
  }
}

function appMeta() {
  if (cachedAppMeta) return cachedAppMeta;
  const buildMeta = readBuildMeta();
  const updatedAt = process.env.APP_UPDATED_AT
    || buildMeta.APP_UPDATED_AT
    || process.env.GIT_COMMIT_TIMESTAMP
    || readGitUpdatedAt()
    || readFallbackUpdatedAt();

  cachedAppMeta = {
    version: process.env.APP_VERSION || packageJson.version || "1.0.0",
    updatedAt
  };
  return cachedAppMeta;
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "")
    .split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const index = part.indexOf("=");
      if (index === -1) return [part, ""];
      return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }));
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function signSession(payload) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

function makeSessionToken(account, maxAgeSeconds) {
  const payload = Buffer.from(JSON.stringify({
    account,
    exp: Date.now() + maxAgeSeconds * 1000
  })).toString("base64url");
  return `${payload}.${signSession(payload)}`;
}

function verifySessionToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature || !safeEqual(signature, signSession(payload))) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (session.account !== ADMIN_USERNAME || Date.now() > Number(session.exp)) return null;
    return session;
  } catch {
    return null;
  }
}

function isSecureRequest(req) {
  return req.headers["x-forwarded-proto"] === "https" || req.socket?.encrypted;
}

function authCookie(req, token, maxAgeSeconds = null) {
  const parts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (isSecureRequest(req)) parts.push("Secure");
  if (maxAgeSeconds !== null) parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join("; ");
}

function clearAuthCookie(req) {
  return authCookie(req, "", 0);
}

function currentSession(req) {
  return verifySessionToken(parseCookies(req)[AUTH_COOKIE_NAME]);
}

function requireAuth(req, res) {
  if (currentSession(req)) return true;
  sendJson(res, 401, { error: "请先登录。", loginUrl: "/login" });
  return false;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function normalizeSubscription(input, existing = {}) {
  const rawUrl = String(input.url || existing.url || "").trim();
  const email = String(input.email || existing.email || "").trim();
  const generatedName = email || safeHostName(rawUrl) || existing.name || "";
  const name = String(input.name || generatedName).trim();
  const url = String(input.url || existing.url || "").trim();
  const customer = String(input.customer || existing.customer || "").trim();
  const note = String(input.note || existing.note || "").trim();

  if (!url || !/^https?:\/\//i.test(url)) throw new Error("请填写 http 或 https 开头的订阅 URL。");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("请填写该 URL 绑定的有效邮箱。");

  return {
    ...existing,
    name,
    url,
    email,
    customer,
    note,
    updatedAt: new Date().toISOString()
  };
}

function safeHostName(value) {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}

function durationDays(duration) {
  const values = {
    monthly: 30,
    quarterly: 90,
    half_yearly: 180,
    yearly: 360
  };
  return values[duration] || null;
}

function calculateExpiry(purchasedAt, duration) {
  const days = durationDays(duration);
  const start = new Date(purchasedAt);
  if (!days || Number.isNaN(start.getTime())) return null;

  const expiresAt = new Date(start.getTime());
  expiresAt.setUTCDate(expiresAt.getUTCDate() + days);
  return expiresAt.toISOString();
}

function startOfUtcDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function subscriptionCustomerCount(subscriptionId, ignoredUserId = "") {
  return users.filter(user => user.subscriptionId === subscriptionId && user.id !== ignoredUserId).length;
}

function subscriptionsByLatestExpiry() {
  return [...subscriptions].sort((a, b) => {
    const timeA = a.metrics?.expireAt ? new Date(a.metrics.expireAt).getTime() : 0;
    const timeB = b.metrics?.expireAt ? new Date(b.metrics.expireAt).getTime() : 0;
    return timeB - timeA;
  });
}

function findRecommendedSubscriptionForExpiry(expiresAt, { fallbackId = "", ignoredUserId = "" } = {}) {
  const userExpiryTime = startOfUtcDate(expiresAt);
  const dayMs = 86400000;
  const candidates = subscriptions
    .map(item => {
      const expireTime = item.metrics?.expireAt ? startOfUtcDate(item.metrics.expireAt) : null;
      if (!Number.isFinite(expireTime) || !Number.isFinite(userExpiryTime)) return null;
      const customerCount = subscriptionCustomerCount(item.id, ignoredUserId);
      const diffDays = (expireTime - userExpiryTime) / dayMs;
      if (customerCount > RELAY_MAX_CUSTOMERS || diffDays < -RELAY_BEFORE_EXPIRY_DAYS || diffDays > RELAY_AFTER_EXPIRY_DAYS) return null;
      return { item, diffDays, customerCount };
    })
    .filter(Boolean);

  const afterCandidates = candidates
    .filter(candidate => candidate.diffDays >= 0)
    .sort((a, b) => a.diffDays - b.diffDays || a.customerCount - b.customerCount);
  if (afterCandidates.length) return afterCandidates[0].item;

  const beforeCandidates = candidates
    .filter(candidate => candidate.diffDays < 0)
    .sort((a, b) => Math.abs(a.diffDays) - Math.abs(b.diffDays) || a.customerCount - b.customerCount);
  if (beforeCandidates.length) return beforeCandidates[0].item;

  return subscriptions.find(item => item.id === fallbackId) || subscriptionsByLatestExpiry()[0] || null;
}

function normalizeUser(input, existing = {}, options = {}) {
  const userId = String(input.userId || existing.userId || "").trim();
  const wechatName = String(input.wechatName || existing.wechatName || "").trim();
  const imessageId = String(input.imessageId || existing.imessageId || "").trim();
  const purchasedAt = String(input.purchasedAt || existing.purchasedAt || new Date().toISOString()).trim();
  const duration = String(input.duration || existing.duration || "monthly").trim();
  const requestedSubscriptionId = String(input.subscriptionId || existing.subscriptionId || "").trim();
  const actualPaid = normalizePaymentAmount(input.actualPaid ?? existing.actualPaid ?? "");
  const expiresAt = calculateExpiry(purchasedAt, duration);
  const subscription = options.autoSelectSubscription
    ? findRecommendedSubscriptionForExpiry(expiresAt, { fallbackId: requestedSubscriptionId, ignoredUserId: existing.id || "" })
    : subscriptions.find(item => item.id === requestedSubscriptionId);

  if (!userId) throw new Error("请填写用户 ID。");
  if (!subscription) throw new Error("请选择已添加的 URL。");
  if (!durationDays(duration)) throw new Error("请选择购买时长。");
  if (!expiresAt) throw new Error("购买时间格式不正确。");
  if (actualPaid === null) throw new Error("请填写正确的实付款金额。");

  return {
    ...existing,
    userId,
    wechatName,
    imessageId,
    purchasedAt: new Date(purchasedAt).toISOString(),
    duration,
    actualPaid,
    subscriptionId: subscription.id,
    useCustomRelay: input.useCustomRelay === undefined ? Boolean(existing.useCustomRelay) : Boolean(input.useCustomRelay),
    subscriptionToken: existing.subscriptionToken || relayToken(),
    expiresAt,
    updatedAt: new Date().toISOString()
  };
}

function normalizePaymentAmount(value) {
  const raw = String(value).trim();
  if (!raw) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

function normalizeCustomUrl(input, existing = {}) {
  const name = String(input.name || existing.name || "").trim();
  const sourceSubscriptionId = String(input.sourceSubscriptionId || existing.sourceSubscriptionId || "").trim();
  const expiresAtValue = String(input.expiresAt || existing.expiresAt || "").trim();
  const note = String(input.note || existing.note || "").trim();
  const enabled = input.enabled === undefined ? existing.enabled !== false : Boolean(input.enabled);
  const token = String(existing.token || input.token || relayToken()).trim();
  const transform = {
    mode: String(input.mode ?? existing.transform?.mode ?? "").trim(),
    replaceRules: Boolean(input.replaceRules ?? existing.transform?.replaceRules ?? false),
    prependRules: String(input.prependRules ?? existing.transform?.prependRules ?? "").trim(),
    appendRules: String(input.appendRules ?? existing.transform?.appendRules ?? "").trim(),
    customYaml: String(input.customYaml ?? existing.transform?.customYaml ?? "").trim()
  };
  const source = subscriptions.find(item => item.id === sourceSubscriptionId);
  const expiresAt = expiresAtValue ? new Date(expiresAtValue) : null;

  if (!name) throw new Error("请填写自定义 URL 名称。");
  if (!source) throw new Error("请选择一个池 URL。");
  if (expiresAtValue && Number.isNaN(expiresAt.getTime())) throw new Error("自定义 URL 到期时间格式不正确。");

  return {
    ...existing,
    name,
    token,
    sourceSubscriptionId,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    enabled,
    note,
    transform,
    updatedAt: new Date().toISOString()
  };
}

function publicCustomUrl(item) {
  const source = subscriptions.find(subscription => subscription.id === item.sourceSubscriptionId);
  return {
    ...item,
    publicPath: `/c/${item.token}`,
    source: source ? {
      id: source.id,
      url: source.url,
      email: source.email || "",
      name: source.name || "",
      cache: source.cachedConfig ? {
        fetchedAt: source.cachedConfig.fetchedAt || null,
        status: source.cachedConfig.status || null,
        bodyLength: source.cachedConfig.bodyLength || (source.cachedConfig.body ? source.cachedConfig.body.length : 0),
        error: source.cachedConfig.error || null
      } : null
    } : null
  };
}

function yamlListBlock(values) {
  const lines = String(values || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.startsWith("- ") ? line : `- ${line}`);
  return lines.join("\n");
}

function replaceYamlRules(source, rulesBlock) {
  const body = String(source || "");
  const rules = yamlListBlock(rulesBlock);
  if (!rules) return body;
  const match = body.match(/^rules:\s*\r?\n(?:(?:\s+- .*(?:\r?\n|$))*)/m);
  if (match) return body.slice(0, match.index) + `rules:\n${rules}\n` + body.slice(match.index + match[0].length);
  return `${body.trimEnd()}\n\nrules:\n${rules}\n`;
}

function appendYamlRules(source, prependRules, appendRules) {
  const body = String(source || "");
  const before = yamlListBlock(prependRules);
  const after = yamlListBlock(appendRules);
  if (!before && !after) return body;

  const match = body.match(/^rules:\s*\r?\n((?:(?:\s+- .*(?:\r?\n|$))*))/m);
  const existing = match ? match[1].trimEnd() : "";
  const nextRules = [before, existing, after].filter(Boolean).join("\n");
  if (match) return body.slice(0, match.index) + `rules:\n${nextRules}\n` + body.slice(match.index + match[0].length);
  return `${body.trimEnd()}\n\nrules:\n${nextRules}\n`;
}

function setYamlMode(source, mode) {
  const body = String(source || "");
  const value = String(mode || "").trim();
  if (!value) return body;
  if (/^mode:\s*.*$/m.test(body)) return body.replace(/^mode:\s*.*$/m, `mode: ${value}`);
  return `mode: ${value}\n${body}`;
}

function convertClashConfig(source, transform = {}) {
  let output = String(source || "");
  output = setYamlMode(output, transform.mode);
  if (transform.replaceRules) {
    output = replaceYamlRules(output, [transform.prependRules, transform.appendRules].filter(Boolean).join("\n"));
  } else {
    output = appendYamlRules(output, transform.prependRules, transform.appendRules);
  }
  if (transform.customYaml) output = `${output.trimEnd()}\n\n${transform.customYaml.trim()}\n`;
  return output;
}

function billUserLabel(user) {
  return user.userId || user.wechatName || user.imessageId || "未知用户";
}

function makeBill({ user, type, amount, occurredAt, duration, beforeExpiresAt = null, afterExpiresAt = null, description = "" }) {
  return {
    id: crypto.randomUUID(),
    type,
    userId: user.id,
    userLabel: billUserLabel(user),
    userSnapshot: {
      id: user.id,
      userId: user.userId || "",
      wechatName: user.wechatName || "",
      imessageId: user.imessageId || ""
    },
    amount: Math.round(Number(amount || 0) * 100) / 100,
    occurredAt,
    duration: duration || user.duration || "",
    beforeExpiresAt,
    afterExpiresAt,
    description,
    createdAt: new Date().toISOString(),
    reversedAt: null
  };
}

function initialBillsFromUsers() {
  return users
    .map(user => {
      const amount = Number(user.actualPaid);
      if (!Number.isFinite(amount) || amount === 0) return null;
      return makeBill({
        user,
        type: "initial",
        amount,
        occurredAt: user.purchasedAt || user.createdAt || new Date().toISOString(),
        duration: user.duration,
        afterExpiresAt: user.expiresAt || null,
        description: "用户初始购买"
      });
    })
    .filter(Boolean);
}

function reverseBill(bill) {
  if (bill.reversedAt) return bill;
  bill.reversedAt = new Date().toISOString();

  const user = users.find(entry => entry.id === bill.userId);
  if (user) {
    const currentPaid = Number(user.actualPaid) || 0;
    user.actualPaid = Math.max(Math.round((currentPaid - (Number(bill.amount) || 0)) * 100) / 100, 0);
    if (bill.type === "renewal" && bill.beforeExpiresAt && user.expiresAt === bill.afterExpiresAt) {
      user.expiresAt = bill.beforeExpiresAt;
    }
    user.updatedAt = new Date().toISOString();
  }

  return bill;
}

function deleteBillRecord(bill) {
  if (!bill.reversedAt) reverseBill(bill);
  bills = bills.filter(entry => entry.id !== bill.id);
}

function renewUser(user, input) {
  const duration = String(input.duration || "monthly").trim();
  const actualPaid = normalizePaymentAmount(input.actualPaid ?? "");
  const renewedAt = new Date(input.purchasedAt || new Date().toISOString());
  const requestedSubscriptionId = String(input.subscriptionId || user.subscriptionId || "").trim();
  const currentExpiry = user.expiresAt ? new Date(user.expiresAt) : null;
  const previousPaid = Number(user.actualPaid) || 0;

  if (!durationDays(duration)) throw new Error("请选择续费时长。");
  if (Number.isNaN(renewedAt.getTime())) throw new Error("续费时间格式不正确。");
  if (actualPaid === null) throw new Error("请填写正确的实付款金额。");

  const baseTime = currentExpiry && currentExpiry.getTime() > renewedAt.getTime() ? currentExpiry : renewedAt;
  const expiresAt = calculateExpiry(baseTime.toISOString(), duration);
  const subscription = findRecommendedSubscriptionForExpiry(expiresAt, {
    fallbackId: requestedSubscriptionId,
    ignoredUserId: user.id || ""
  });
  if (!expiresAt) throw new Error("续费时间格式不正确。");
  if (!subscription) throw new Error("请选择已添加的 URL。");

  Object.assign(user, {
    purchasedAt: renewedAt.toISOString(),
    duration,
    actualPaid: Math.round((previousPaid + actualPaid) * 100) / 100,
    subscriptionId: subscription.id,
    useCustomRelay: input.useCustomRelay === undefined ? Boolean(user.useCustomRelay) : Boolean(input.useCustomRelay),
    subscriptionToken: user.subscriptionToken || relayToken(),
    expiresAt,
    updatedAt: new Date().toISOString()
  });

  return { user, amount: actualPaid, renewedAt: renewedAt.toISOString(), beforeExpiresAt: currentExpiry?.toISOString() || null, afterExpiresAt: expiresAt };
}

function parseSubscriptionUserInfo(value) {
  if (!value) return null;
  const pairs = {};
  for (const segment of value.split(";")) {
    const [key, rawValue] = segment.trim().split("=");
    if (!key || rawValue === undefined) continue;
    const numericValue = Number(rawValue.trim());
    if (Number.isFinite(numericValue)) pairs[key.trim().toLowerCase()] = numericValue;
  }

  const upload = pairs.upload || 0;
  const download = pairs.download || 0;
  const total = pairs.total || null;
  const expire = pairs.expire || null;
  const used = upload + download;

  if (!total && !expire) return null;

  return {
    uploadBytes: upload,
    downloadBytes: download,
    usedBytes: used,
    totalBytes: total,
    remainingBytes: total ? Math.max(total - used, 0) : null,
    expireAt: expire ? new Date(expire * 1000).toISOString() : null,
    source: "subscription-userinfo"
  };
}

function parseBodyHints(text) {
  const source = normalizeSubscriptionBody(text);
  const statusMatch = source.match(/STATUS\s*=([^\r\n]*)/i);
  if (!statusMatch) return null;

  const statusText = statusMatch[1];
  const uploadMatch = statusText.match(/↑\s*:?\s*(\d+(?:\.\d+)?)\s*(tb|gb|mb|kb|tib|gib|mib|kib)?/i);
  const downloadMatch = statusText.match(/↓\s*:?\s*(\d+(?:\.\d+)?)\s*(tb|gb|mb|kb|tib|gib|mib|kib)?/i);
  const totalMatch = statusText.match(/TOT\s*:?\s*(\d+(?:\.\d+)?)\s*(tb|gb|mb|kb|tib|gib|mib|kib)?/i);
  const expireMatch = statusText.match(/Expires\s*:?\s*(\d{10,13}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/i);

  if (!uploadMatch || !downloadMatch || !totalMatch || !expireMatch) return null;

  const uploadBytes = toBytes(Number(uploadMatch[1]), uploadMatch[2] || "gb");
  const downloadBytes = toBytes(Number(downloadMatch[1]), downloadMatch[2] || "gb");
  const totalBytes = toBytes(Number(totalMatch[1]), totalMatch[2] || "gb");
  const usedBytes = uploadBytes + downloadBytes;
  const rawExpire = expireMatch[1];
  const timestamp = Number(rawExpire);

  return {
    uploadBytes,
    downloadBytes,
    usedBytes,
    totalBytes,
    remainingBytes: Math.max(totalBytes - usedBytes, 0),
    expireAt: Number.isFinite(timestamp)
      ? new Date(String(rawExpire).length === 13 ? timestamp : timestamp * 1000).toISOString()
      : new Date(rawExpire.replace(/[/.]/g, "-")).toISOString(),
    source: "status-field"
  };
}

function parseAccountUnavailable(text) {
  for (const variant of decodeBodyVariants(text)) {
    try {
      const parsed = JSON.parse(variant);
      if (String(parsed?.message || "").trim().toLowerCase() === "account unavailable") {
        return {
          uploadBytes: null,
          downloadBytes: null,
          usedBytes: null,
          totalBytes: null,
          remainingBytes: null,
          expireAt: new Date(0).toISOString(),
          unavailable: true,
          source: "account-unavailable"
        };
      }
    } catch {
      // Ignore non-JSON subscription bodies.
    }
  }

  return null;
}

function normalizeSubscriptionBody(text) {
  const raw = String(text || "");
  const candidates = [raw];
  const compact = raw.replace(/\s+/g, "");

  if (/^[A-Za-z0-9+/=_-]+$/.test(compact) && compact.length > 20) {
    for (const value of [compact, compact.replace(/-/g, "+").replace(/_/g, "/")]) {
      try {
        candidates.push(Buffer.from(value, "base64").toString("utf8"));
      } catch {
        // Ignore malformed base64 bodies.
      }
    }
  }

  try {
    candidates.push(decodeURIComponent(raw));
  } catch {
    // Ignore malformed URI-encoded bodies.
  }

  return candidates
    .filter(Boolean)
    .join("\n")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function toBytes(value, unit) {
  const units = {
    kb: 1024,
    kib: 1024,
    mb: 1024 ** 2,
    mib: 1024 ** 2,
    gb: 1024 ** 3,
    gib: 1024 ** 3,
    tb: 1024 ** 4,
    tib: 1024 ** 4
  };
  return Math.round(value * (units[String(unit).toLowerCase()] || 1));
}

function statusFor(item, customerCount = 0) {
  if (item.metrics?.unavailable) return "expired";
  if (item.lastError) return "warning";
  if (!item.metrics) return "unknown";

  const now = Date.now();
  const expiresAt = item.metrics.expireAt ? new Date(item.metrics.expireAt).getTime() : null;
  if (expiresAt && expiresAt < now) return "expired";

  const remaining = item.metrics.remainingBytes;
  if (remaining !== null && remaining !== undefined && remaining <= 0) return "depleted";

  const daysLeft = expiresAt ? (expiresAt - now) / 86400000 : null;
  if ((remaining !== null && remaining < LOW_TRAFFIC_BYTES) || (daysLeft !== null && daysLeft < EXPIRING_SOON_DAYS)) {
    return "warning";
  }
  if (customerCount >= 8) return "warning";

  return "ok";
}

function metricScore(metrics) {
  if (!metrics) return 0;
  if (metrics.unavailable) return 1000;

  let score = 0;
  if (metrics.expireAt) score += 40;
  if (metrics.totalBytes !== null && metrics.totalBytes !== undefined) score += 50;
  if (metrics.remainingBytes !== null && metrics.remainingBytes !== undefined) score += 50;
  if (metrics.usedBytes !== null && metrics.usedBytes !== undefined) score += 50;
  if (metrics.uploadBytes !== null && metrics.uploadBytes !== undefined) score += 25;
  if (metrics.downloadBytes !== null && metrics.downloadBytes !== undefined) score += 25;

  if (metrics.totalBytes !== undefined && metrics.usedBytes !== undefined && metrics.remainingBytes !== undefined) score += 60;
  if (metrics.totalBytes !== undefined && metrics.uploadBytes !== undefined && metrics.downloadBytes !== undefined) score += 40;

  return score;
}

function publicItem(item) {
  const customerCount = users.filter(user => user.subscriptionId === item.id).length;
  return {
    ...item,
    customerCount,
    status: statusFor(item, customerCount)
  };
}

function publicUser(user) {
  const subscription = subscriptions.find(item => item.id === user.subscriptionId);
  const relayPath = user.subscriptionToken ? `/sub/${user.subscriptionToken}` : "";
  return {
    ...user,
    relayPath,
    subscription: subscription ? {
      id: subscription.id,
      url: subscription.url,
      relayPath,
      email: subscription.email || "",
      name: subscription.name || ""
    } : null
  };
}

function publicBill(bill) {
  const user = users.find(item => item.id === bill.userId);
  return {
    ...bill,
    originalUserLabel: bill.userLabel || bill.userSnapshot?.userId || "",
    userLabel: user ? billUserLabel(user) : (bill.userLabel || bill.userSnapshot?.userId || "未知用户"),
    user: user ? {
      id: user.id,
      userId: user.userId,
      wechatName: user.wechatName || "",
      imessageId: user.imessageId || "",
      createdAt: user.createdAt || "",
      expiresAt: user.expiresAt
    } : null,
    isReversed: Boolean(bill.reversedAt)
  };
}

async function refreshSubscription(item) {
  const checkedAt = new Date().toISOString();
  const results = [];
  let lastError = null;

  for (const profile of REQUEST_PROFILES) {
    try {
      const result = await fetchSubscriptionMetrics(item.url, profile);
      result.score = metricScore(result.metrics);
      results.push(result);

      if (result.score >= 300) break;
    } catch (error) {
      lastError = error;
      results.push({ client: profile.name, status: null, metrics: null, score: 0, error: error.message });
    }
  }

  const bestResult = results
    .filter(result => result.metrics)
    .sort((a, b) => b.score - a.score)[0] || results[results.length - 1] || null;
  const existingScore = metricScore(item.metrics);
  const bestScore = metricScore(bestResult?.metrics);

  item.lastCheckedAt = checkedAt;
  item.lastRefreshResults = results.map(result => ({
    client: result.client,
    status: result.status,
    score: result.score || 0,
    hasExpire: Boolean(result.metrics?.expireAt),
    hasTotal: result.metrics?.totalBytes !== undefined && result.metrics?.totalBytes !== null,
    hasUsed: result.metrics?.usedBytes !== undefined && result.metrics?.usedBytes !== null,
    hasRemaining: result.metrics?.remainingBytes !== undefined && result.metrics?.remainingBytes !== null
  }));

  if (bestResult) {
    item.httpStatus = bestResult.status;
    item.lastClient = bestResult.client;

    if (bestResult.metrics && bestScore >= existingScore) {
      item.metrics = bestResult.metrics;
      item.lastError = null;
    } else if (bestResult.metrics && item.metrics) {
      item.lastError = null;
    } else {
      item.metrics = item.metrics || null;
      item.lastError = "已请求订阅，但未识别到流量或到期信息。请确认服务是否返回 subscription-userinfo，或正文是否包含剩余流量/到期时间。";
    }
  } else {
    item.lastError = lastError?.name === "AbortError" ? "检查超时。" : lastError?.message || "请求失败。";
  }

  return item;
}

function decodeBodyVariants(text) {
  const raw = String(text || "");
  const variants = [raw];
  const compact = raw.replace(/\s+/g, "");

  if (/^[A-Za-z0-9+/=_-]+$/.test(compact) && compact.length > 20) {
    for (const value of [compact, compact.replace(/-/g, "+").replace(/_/g, "/")]) {
      try {
        variants.push(Buffer.from(value, "base64").toString("utf8"));
      } catch {
        // Ignore malformed base64 bodies.
      }
    }
  }

  try {
    variants.push(decodeURIComponent(raw));
  } catch {
    // Ignore malformed URI-encoded bodies.
  }

  return [...new Set(variants)].filter(Boolean);
}

function sanitizeDebugText(value, limit = 4000) {
  return String(value || "")
    .replace(/https?:\/\/[^\s"'<>]+/g, "[url-redacted]")
    .replace(/(?:ss|ssr|vmess|vless|trojan|hysteria2?|tuic):\/\/[^\s"'<>]+/gi, "[node-redacted]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[token-redacted]")
    .slice(0, limit);
}

function interestingDebugLines(text) {
  return (String(text || "").match(/.{0,40}(剩余|流量|用量|已用|使用|总量|到期|过期|expire|traffic|upload|download|total|used|remain|left).{0,120}/gi) || [])
    .slice(0, 30)
    .map(line => sanitizeDebugText(line, 300));
}

function maybeParseJson(text) {
  try {
    const parsed = JSON.parse(text);
    return sanitizeDebugValue(parsed);
  } catch {
    return null;
  }
}

function sanitizeDebugValue(value) {
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeDebugValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 80).map(([key, val]) => [key, sanitizeDebugValue(val)]));
  }
  if (typeof value === "string") return sanitizeDebugText(value, 600);
  return value;
}

async function debugSubscription(url) {
  const results = [];

  for (const profile of REQUEST_PROFILES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          ...profile.headers,
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      });
      clearTimeout(timer);

      const body = await response.text();
      const variants = decodeBodyVariants(body);
      const headers = {};
      for (const [key, value] of response.headers) headers[key] = sanitizeDebugText(value, 1000);

      results.push({
        client: profile.name,
        status: response.status,
        statusText: response.statusText,
        headers,
        bodyLength: body.length,
        bodyVariants: variants.map((variant, index) => ({
          index,
          length: variant.length,
          parsedJson: maybeParseJson(variant),
          interestingLines: interestingDebugLines(variant),
          preview: sanitizeDebugText(variant, 2500)
        }))
      });
    } catch (error) {
      results.push({
        client: profile.name,
        error: error.name === "AbortError" ? "检查超时。" : error.message
      });
    }
  }

  return results;
}

async function fetchSubscriptionMetrics(url, profile) {
  if (user.useCustomRelay) {
    const cache = subscription.cachedConfig || null;
    const cachedBody = await readPoolCachedBody(subscription);
    if (!cachedBody) {
      sendSubscriptionMessage(res, 503, cache?.error || "池 URL 缓存为空，请先刷新缓存。");
      return;
    }

    const body = convertClashConfig(cachedBody, user.customRelayTransform || {});
    res.writeHead(200, {
      "content-type": cache.contentType || "text/plain; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "pragma": "no-cache",
      "expires": "0",
      ...(cache.subscriptionUserinfo ? { "subscription-userinfo": cache.subscriptionUserinfo } : {})
    });
    res.end(body);
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        ...profile.headers,
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    const userInfo = response.headers.get("subscription-userinfo") || response.headers.get("Subscription-Userinfo");
    let metrics = parseSubscriptionUserInfo(userInfo);

    if (!metrics) {
      const body = await response.text();
      metrics = parseAccountUnavailable(body) || parseBodyHints(body);
    }

    return {
      status: response.status,
      client: profile.name,
      metrics
    };
  } finally {
    clearTimeout(timer);
  }
}

function cacheIsFresh(cache, now = Date.now()) {
  const fetchedAt = cache?.fetchedAt ? new Date(cache.fetchedAt).getTime() : 0;
  return Boolean(cache?.body || cache?.bodyFile) && Number.isFinite(fetchedAt) && now - fetchedAt < POOL_CONFIG_CACHE_TTL_MS;
}

function clashConfigScore(body) {
  const text = String(body || "");
  let score = Math.min(text.length, 100000) / 1000;
  if (/^proxies:\s*\[\s*\]\s*$/m.test(text)) score -= 500;
  if (/^proxies:\s*\r?\n\s*-\s+/m.test(text)) score += 1000;
  if (/^proxy-groups:\s*\r?\n\s*-\s+/m.test(text)) score += 500;
  if (/^rules:\s*\r?\n\s*-\s+/m.test(text)) score += 200;
  if (/^(mixed-port|port|socks-port):\s*/m.test(text)) score += 100;
  return score;
}

function extractClashConfigBody(body) {
  const text = String(body || "").replace(/\r\n/g, "\n");
  if (!text.trim()) return "";

  const lines = text.split("\n");
  const startIndex = lines.findIndex(line => /^(mixed-port|port|socks-port|redir-port|tproxy-port|allow-lan|mode|log-level|external-controller|proxies):\s*/.test(line));
  const trimmedStart = startIndex >= 0 ? startIndex : 0;
  const scopedLines = lines.slice(trimmedStart);
  const rulesIndex = scopedLines.findIndex(line => /^rules:\s*$/.test(line));
  if (rulesIndex === -1) return scopedLines.join("\n").trimEnd() + "\n";

  let endIndex = scopedLines.length;
  for (let index = rulesIndex + 1; index < scopedLines.length; index += 1) {
    const line = scopedLines[index];
    if (/^[A-Za-z0-9_-]+:\s*/.test(line)) {
      endIndex = index;
      break;
    }
  }

  return scopedLines.slice(0, endIndex).join("\n").trimEnd() + "\n";
}

async function refreshPoolConfigCache(item, { force = false } = {}) {
  if (!force && cacheIsFresh(item.cachedConfig)) return item.cachedConfig;

  const profiles = REQUEST_PROFILES.filter(profile => profile.name === "clash-meta");
  const results = [];
  for (const profile of profiles) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(item.url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          ...profile.headers,
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      });
      const rawBody = await response.text();
      const body = extractClashConfigBody(rawBody);
      results.push({
        body,
        client: profile.name,
        status: response.status,
        score: clashConfigScore(body),
        rawBodyLength: rawBody.length,
        contentType: response.headers.get("content-type") || "text/plain; charset=utf-8",
        subscriptionUserinfo: response.headers.get("subscription-userinfo") || response.headers.get("Subscription-Userinfo") || "",
        error: null
      });
    } catch (error) {
      results.push({
        body: "",
        client: profile.name,
        status: null,
        score: -1000,
        rawBodyLength: 0,
        contentType: "text/plain; charset=utf-8",
        subscriptionUserinfo: "",
        error: error.name === "AbortError" ? "缓存请求超时。" : error.message
      });
    } finally {
      clearTimeout(timer);
    }
  }

  const best = results.sort((a, b) => b.score - a.score)[0];
  if (best?.body) {
    const storedBody = await writePoolCachedBody(item, best.body);
    item.cachedConfig = {
      ...storedBody,
      status: best.status,
      client: best.client,
      fetchedAt: new Date().toISOString(),
      contentType: best.contentType,
      subscriptionUserinfo: best.subscriptionUserinfo,
      score: best.score,
      attempts: results.map(result => ({
        client: result.client,
        status: result.status,
        score: result.score,
        bodyLength: result.body.length,
        rawBodyLength: result.rawBodyLength || result.body.length,
        error: result.error
      })),
      error: null
    };
  } else {
    item.cachedConfig = {
      ...(item.cachedConfig || {}),
      fetchedAt: new Date().toISOString(),
      attempts: results.map(result => ({
        client: result.client,
        status: result.status,
        score: result.score,
        bodyLength: result.body.length,
        rawBodyLength: result.rawBodyLength || result.body.length,
        error: result.error
      })),
      error: results.find(result => result.error)?.error || "没有获取到可缓存的 Clash 配置。"
    };
  }
  return item.cachedConfig;
}

async function refreshAllPoolConfigCaches({ force = false } = {}) {
  for (const item of subscriptions) {
    await refreshPoolConfigCache(item, { force });
  }
  await saveData();
}

function sendSubscriptionMessage(res, status, message) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "pragma": "no-cache",
    "expires": "0"
  });
  res.end(message);
}

function isUserExpired(user, now = Date.now()) {
  const expiresAt = user?.expiresAt ? new Date(user.expiresAt).getTime() : NaN;
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

function forwardedSubscriptionHeaders(req) {
  const headers = {
    "User-Agent": req.headers["user-agent"] || REQUEST_PROFILES[0].headers["User-Agent"],
    "Accept": req.headers.accept || "text/plain, application/yaml, */*",
    "Accept-Language": req.headers["accept-language"] || "zh-CN,zh;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache"
  };
  return headers;
}

function copyUpstreamHeaders(response) {
  const headers = {
    "cache-control": "no-store, max-age=0",
    "pragma": "no-cache",
    "expires": "0"
  };
  for (const name of ["content-type", "subscription-userinfo", "profile-update-interval"]) {
    const value = response.headers.get(name);
    if (value) headers[name] = value;
  }
  if (!headers["content-type"]) headers["content-type"] = "text/plain; charset=utf-8";
  return headers;
}

async function handleRelaySubscription(req, res, token) {
  await loadLatestData();
  ensureUserRelayTokens();

  const user = users.find(item => item.subscriptionToken === token);
  if (!user) {
    sendSubscriptionMessage(res, 404, "订阅链接不存在或已被删除，请联系客服。");
    return;
  }

  if (isUserExpired(user)) {
    sendSubscriptionMessage(res, 200, `订阅已到期，请续费后继续使用。\n到期时间：${user.expiresAt || "未知"}`);
    return;
  }

  const subscription = subscriptions.find(item => item.id === user.subscriptionId);
  if (!subscription?.url) {
    sendSubscriptionMessage(res, 503, "订阅暂时不可用，请联系客服处理。");
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(subscription.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: forwardedSubscriptionHeaders(req)
    });
    const body = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, copyUpstreamHeaders(response));
    res.end(body);
  } catch (error) {
    const message = error.name === "AbortError"
      ? "订阅请求超时，请稍后重试。"
      : "订阅暂时无法读取，请稍后重试或联系客服。";
    sendSubscriptionMessage(res, 502, message);
  } finally {
    clearTimeout(timer);
  }
}

async function handleCustomUrlSubscription(req, res, token) {
  await loadLatestData();

  const item = customUrls.find(entry => entry.token === token);
  if (!item || item.enabled === false) {
    sendSubscriptionMessage(res, 404, "自定义订阅链接不存在或已停用，请联系客服。");
    return;
  }

  if (item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now()) {
    sendSubscriptionMessage(res, 200, `订阅已到期，请续费后继续使用。\n到期时间：${item.expiresAt}`);
    return;
  }

  const source = subscriptions.find(subscription => subscription.id === item.sourceSubscriptionId);
  if (!source?.url) {
    sendSubscriptionMessage(res, 503, "池 URL 不存在，订阅暂时不可用。");
    return;
  }

  const cache = source.cachedConfig || null;
  const cachedBody = await readPoolCachedBody(source);
  if (!cachedBody) {
    sendSubscriptionMessage(res, 503, cache?.error || "池 URL 缓存为空，请先刷新缓存。");
    return;
  }

  const body = convertClashConfig(cachedBody, item.transform);

  res.writeHead(200, {
    "content-type": cache.contentType || "text/plain; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "pragma": "no-cache",
    "expires": "0",
    ...(cache.subscriptionUserinfo ? { "subscription-userinfo": cache.subscriptionUserinfo } : {})
  });
  res.end(body);
}

async function refreshAll() {
  for (const item of subscriptions) {
    await refreshSubscription(item);
  }
  await saveData();
}

async function handleApi(req, res, pathname) {
  const relayApiMatch = pathname.match(/^\/api\/sub\/([^/]+)$/);
  if (relayApiMatch && req.method === "GET") {
    await handleRelaySubscription(req, res, relayApiMatch[1]);
    return;
  }

  const customPublicApiMatch = pathname.match(/^\/api\/(?:c|custom)\/([^/]+)$/);
  if (customPublicApiMatch && req.method === "GET") {
    await handleCustomUrlSubscription(req, res, customPublicApiMatch[1]);
    return;
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    try {
      const payload = await readJson(req);
      const account = String(payload.account || "").trim();
      const password = String(payload.password || "");
      if (!safeEqual(account, ADMIN_USERNAME) || !safeEqual(password, ADMIN_PASSWORD)) {
        sendJson(res, 401, { error: "账号或密码不正确。" });
        return;
      }

      const remember = Boolean(payload.remember);
      const maxAgeSeconds = remember ? REMEMBER_MAX_AGE_SECONDS : SESSION_MAX_AGE_SECONDS;
      const cookieMaxAge = remember ? maxAgeSeconds : null;
      const token = makeSessionToken(account, maxAgeSeconds);
      sendJson(res, 200, { ok: true, account }, { "set-cookie": authCookie(req, token, cookieMaxAge) });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/auth/logout" && req.method === "POST") {
    sendJson(res, 200, { ok: true }, { "set-cookie": clearAuthCookie(req) });
    return;
  }

  if (pathname === "/api/auth/me" && req.method === "GET") {
    const session = currentSession(req);
    if (!session) {
      sendJson(res, 401, { error: "请先登录。", loginUrl: "/login" });
      return;
    }
    sendJson(res, 200, { ok: true, account: session.account });
    return;
  }

  if (pathname === "/api/app-meta" && req.method === "GET") {
    sendJson(res, 200, appMeta());
    return;
  }

  if (pathname === "/api/health" && req.method === "GET") {
    await loadLatestData();
    sendJson(res, 200, {
      ok: true,
      dataStore: dataStore.kind,
      subscriptions: subscriptions.length,
      users: users.length,
      refreshedEveryMs: REFRESH_INTERVAL_MS
    });
    return;
  }

  if (pathname === "/api/cron/refresh" && (req.method === "GET" || req.method === "POST")) {
    const expectedSecret = process.env.CRON_SECRET || "";
    const authorization = req.headers.authorization || "";
    if (expectedSecret && authorization !== `Bearer ${expectedSecret}`) {
      sendJson(res, 401, { error: "Unauthorized." });
      return;
    }

    await loadLatestData();
    await refreshAll();
    await refreshAllPoolConfigCaches({ force: true });
    sendJson(res, 200, { ok: true, refreshed: subscriptions.length });
    return;
  }

  if (!requireAuth(req, res)) return;
  await loadLatestData();

  if (pathname === "/api/subscriptions" && req.method === "GET") {
    sendJson(res, 200, subscriptions.map(publicItem));
    return;
  }

  if (pathname === "/api/subscriptions" && req.method === "POST") {
    try {
      const payload = await readJson(req);
      const item = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        metrics: null,
        lastCheckedAt: null,
        lastError: null,
        httpStatus: null
      };
      const normalized = normalizeSubscription(payload, item);
      subscriptions.unshift(normalized);
      await refreshSubscription(normalized);
      await saveData();
      sendJson(res, 201, publicItem(normalized));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/subscriptions/cache-refresh" && req.method === "POST") {
    await refreshAllPoolConfigCaches({ force: true });
    sendJson(res, 200, { ok: true, refreshed: subscriptions.length });
    return;
  }

  if (pathname === "/api/custom-urls" && req.method === "GET") {
    sendJson(res, 200, customUrls.map(publicCustomUrl));
    return;
  }

  if (pathname === "/api/custom-urls" && req.method === "POST") {
    try {
      const payload = await readJson(req);
      const item = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        token: relayToken(),
        lastGeneratedAt: null,
        lastError: null
      };
      const normalized = normalizeCustomUrl(payload, item);
      customUrls.unshift(normalized);
      await saveCustomUrls();
      sendJson(res, 201, publicCustomUrl(normalized));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/users" && req.method === "GET") {
    sendJson(res, 200, users.map(publicUser));
    return;
  }

  if (pathname === "/api/bills" && req.method === "GET") {
    sendJson(res, 200, bills.map(publicBill).sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)));
    return;
  }

  if (pathname === "/api/users" && req.method === "POST") {
    try {
      const payload = await readJson(req);
      const item = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString()
      };
      const normalized = normalizeUser(payload, item, { autoSelectSubscription: true });
      users.unshift(normalized);
      bills.unshift(makeBill({
        user: normalized,
        type: "initial",
        amount: normalized.actualPaid,
        occurredAt: normalized.purchasedAt,
        duration: normalized.duration,
        afterExpiresAt: normalized.expiresAt,
        description: "用户初始购买"
      }));
      await saveUsers();
      await saveBills();
      sendJson(res, 201, publicUser(normalized));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/bills/bulk" && req.method === "POST") {
    try {
      const payload = await readJson(req);
      const ids = Array.isArray(payload.ids) ? payload.ids.map(id => String(id)) : [];
      const action = String(payload.action || "");
      if (!ids.length) {
        sendJson(res, 400, { error: "请选择账单。" });
        return;
      }
      if (action !== "reverse" && action !== "delete") {
        sendJson(res, 400, { error: "不支持的批量操作。" });
        return;
      }

      let changed = 0;
      for (const id of ids) {
        const bill = bills.find(entry => entry.id === id);
        if (!bill) continue;
        if (action === "reverse") {
          if (!bill.reversedAt) {
            reverseBill(bill);
            changed += 1;
          }
        } else {
          deleteBillRecord(bill);
          changed += 1;
        }
      }

      await saveBills();
      await saveUsers();
      sendJson(res, 200, { ok: true, changed });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const billMatch = pathname.match(/^\/api\/bills\/([^/]+)\/reverse$/);
  if (billMatch) {
    const bill = bills.find(entry => entry.id === billMatch[1]);
    if (!bill) {
      sendJson(res, 404, { error: "没有找到这笔账单。" });
      return;
    }

    if (req.method === "POST") {
      reverseBill(bill);
      await saveBills();
      await saveUsers();
      sendJson(res, 200, publicBill(bill));
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  const deleteBillMatch = pathname.match(/^\/api\/bills\/([^/]+)$/);
  if (deleteBillMatch) {
    const bill = bills.find(entry => entry.id === deleteBillMatch[1]);
    if (!bill) {
      sendJson(res, 404, { error: "没有找到这笔账单。" });
      return;
    }

    if (req.method === "DELETE") {
      deleteBillRecord(bill);
      await saveBills();
      await saveUsers();
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  const customMatch = pathname.match(/^\/api\/custom-urls\/([^/]+)(?:\/(preview|refresh-cache))?$/);
  if (customMatch) {
    const id = customMatch[1];
    const action = customMatch[2];
    const item = customUrls.find(entry => entry.id === id);
    if (!item) {
      sendJson(res, 404, { error: "没有找到这个自定义 URL。" });
      return;
    }

    if (action === "preview" && req.method === "GET") {
      const source = subscriptions.find(subscription => subscription.id === item.sourceSubscriptionId);
      if (!source) {
        sendJson(res, 404, { error: "池 URL 不存在。" });
        return;
      }
      const cache = await refreshPoolConfigCache(source, { force: false });
      await saveData();
      const cachedBody = await readPoolCachedBody(source);
      if (!cachedBody) {
        sendJson(res, 503, { error: cache?.error || "池 URL 缓存为空。" });
        return;
      }
      const converted = convertClashConfig(cachedBody, item.transform);
      sendJson(res, 200, {
        body: converted.slice(0, 12000),
        bodyLength: converted.length,
        cacheFetchedAt: cache.fetchedAt || null,
        truncated: converted.length > 12000
      });
      return;
    }

    if (action === "refresh-cache" && req.method === "POST") {
      const source = subscriptions.find(subscription => subscription.id === item.sourceSubscriptionId);
      if (!source) {
        sendJson(res, 404, { error: "池 URL 不存在。" });
        return;
      }
      const cache = await refreshPoolConfigCache(source, { force: true });
      await saveData();
      sendJson(res, 200, { ok: true, cache });
      return;
    }

    if (action) {
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    if (req.method === "PUT") {
      try {
        const payload = await readJson(req);
        Object.assign(item, normalizeCustomUrl(payload, item));
        await saveCustomUrls();
        sendJson(res, 200, publicCustomUrl(item));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === "DELETE") {
      customUrls = customUrls.filter(entry => entry.id !== id);
      await saveCustomUrls();
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  const match = pathname.match(/^\/api\/subscriptions\/([^/]+)(?:\/(refresh|debug|cache|refresh-cache))?$/);
  const userMatch = pathname.match(/^\/api\/users\/([^/]+)(?:\/(renew))?$/);
  if (userMatch) {
    const id = userMatch[1];
    const action = userMatch[2];
    const item = users.find(entry => entry.id === id);
    if (!item) {
      sendJson(res, 404, { error: "没有找到这个用户。" });
      return;
    }

    if (action === "renew" && req.method === "POST") {
      try {
        const payload = await readJson(req);
        const renewal = renewUser(item, payload);
        bills.unshift(makeBill({
          user: item,
          type: "renewal",
          amount: renewal.amount,
          occurredAt: renewal.renewedAt,
          duration: item.duration,
          beforeExpiresAt: renewal.beforeExpiresAt,
          afterExpiresAt: renewal.afterExpiresAt,
          description: "用户续费"
        }));
        await saveUsers();
        await saveBills();
        sendJson(res, 200, publicUser(item));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (action) {
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    if (req.method === "PUT") {
      try {
        const payload = await readJson(req);
        const previousPaid = Number(item.actualPaid) || 0;
        Object.assign(item, normalizeUser(payload, item));
        const nextPaid = Number(item.actualPaid) || 0;
        const diff = Math.round((nextPaid - previousPaid) * 100) / 100;
        if (diff !== 0) {
          bills.unshift(makeBill({
            user: item,
            type: "adjustment",
            amount: diff,
            occurredAt: new Date().toISOString(),
            duration: item.duration,
            afterExpiresAt: item.expiresAt,
            description: "用户实付款调整"
          }));
          await saveBills();
        }
        await saveUsers();
        sendJson(res, 200, publicUser(item));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === "DELETE") {
      users = users.filter(entry => entry.id !== id);
      await saveUsers();
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  if (!match) {
    sendJson(res, 404, { error: "Not found." });
    return;
  }

  const id = match[1];
  const item = subscriptions.find(entry => entry.id === id);
  if (!item) {
    sendJson(res, 404, { error: "没有找到这条订阅。" });
    return;
  }

  if (pathname.endsWith("/refresh") && req.method === "POST") {
    await refreshSubscription(item);
    await saveData();
    sendJson(res, 200, publicItem(item));
    return;
  }

  if (pathname.endsWith("/debug") && req.method === "GET") {
    sendJson(res, 200, await debugSubscription(item.url));
    return;
  }

  if (pathname.endsWith("/cache") && req.method === "GET") {
    const cache = item.cachedConfig || null;
    const cachedBody = await readPoolCachedBody(item);
    if (!cachedBody) {
      sendJson(res, 404, {
        error: cache?.error || (cache?.bodyFile ? "缓存文件不存在，请重新刷新这条池 URL 缓存。" : "这条池 URL 还没有缓存 Clash 配置。"),
        cache
      });
      return;
    }
    sendJson(res, 200, {
      status: cache.status || null,
      client: cache.client || "",
      score: cache.score || null,
      attempts: cache.attempts || [],
      storage: cache.bodyFile ? "local-file" : "database",
      bodyFile: cache.bodyFile || "",
      fetchedAt: cache.fetchedAt || null,
      contentType: cache.contentType || "",
      subscriptionUserinfo: cache.subscriptionUserinfo || "",
      error: cache.error || null,
      body: cachedBody.slice(0, 20000),
      bodyLength: cache.bodyLength || cachedBody.length,
      truncated: cachedBody.length > 20000
    });
    return;
  }

  if (pathname.endsWith("/refresh-cache") && req.method === "POST") {
    const cache = await refreshPoolConfigCache(item, { force: true });
    await saveData();
    sendJson(res, 200, { ok: true, cache: {
      status: cache?.status || null,
      client: cache?.client || "",
      score: cache?.score || null,
      attempts: cache?.attempts || [],
      fetchedAt: cache?.fetchedAt || null,
      contentType: cache?.contentType || "",
      subscriptionUserinfo: cache?.subscriptionUserinfo || "",
      error: cache?.error || null,
      storage: cache?.bodyFile ? "local-file" : "database",
      bodyFile: cache?.bodyFile || "",
      bodyLength: cache?.bodyLength || (cache?.body ? cache.body.length : 0)
    } });
    return;
  }

  if (req.method === "PUT") {
    try {
      const payload = await readJson(req);
      const previousUrl = item.url;
      Object.assign(item, normalizeSubscription(payload, item));
      if (item.url !== previousUrl) await refreshSubscription(item);
      await saveData();
      sendJson(res, 200, publicItem(item));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === "DELETE") {
    subscriptions = subscriptions.filter(entry => entry.id !== id);
    await saveData();
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." });
}

async function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const isAppRoute = !path.extname(requestedPath);
  const isLoginRoute = requestedPath === "/login" || requestedPath === "/login.html";
  if (requestedPath === "/login.html") {
    res.writeHead(302, {
      "location": "/login",
      "cache-control": "no-store, max-age=0"
    });
    res.end();
    return;
  }
  if ((requestedPath === "/index.html" || isAppRoute) && !isLoginRoute && !currentSession(req)) {
    res.writeHead(302, {
      "location": "/login",
      "cache-control": "no-store, max-age=0"
    });
    res.end();
    return;
  }

  const staticPath = isAppRoute ? "/index.html" : requestedPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, staticPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  } catch {
    if (!path.extname(requestedPath)) {
      try {
        const content = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(content);
        return;
      } catch {}
    }
    res.writeHead(404);
    res.end("Not found");
  }
}

let initialized = false;

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (!initialized) {
      await ensureDataFile();
      initialized = true;
    }

    const customPublicMatch = url.pathname.match(/^\/(?:c|custom)\/([^/]+)$/);
    const relayMatch = url.pathname.match(/^\/sub\/([^/]+)$/);
    if (customPublicMatch && req.method === "GET") {
      await handleCustomUrlSubscription(req, res, customPublicMatch[1]);
    } else if (relayMatch && req.method === "GET") {
      await handleRelaySubscription(req, res, relayMatch[1]);
    } else if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
    } else {
      await serveStatic(req, res, url.pathname);
    }
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function main() {
  await ensureDataFile();
  initialized = true;
  const server = http.createServer(requestHandler);

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`VPN subscription monitor is running at http://localhost:${PORT}`);
  });

  setInterval(() => {
    refreshAll().catch(error => console.error("Refresh failed:", error));
  }, REFRESH_INTERVAL_MS);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = Object.assign(requestHandler, {
  ensureDataFile,
  handleApi,
  sendJson,
  parseSubscriptionUserInfo,
  parseBodyHints,
  parseAccountUnavailable,
  calculateExpiry,
  convertClashConfig,
  extractClashConfigBody,
  statusFor,
  toBytes
});
