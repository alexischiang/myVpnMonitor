const http = require("http");
const { execFileSync } = require("child_process");
const fsSync = require("fs");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { createDataStore } = require("./database");
const yaml = require("js-yaml");
const notifier = require("./notifier");
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
const VENDORS_FILE = process.env.VENDORS_FILE || path.join(DATA_DIR, "vendors.json");
const PLACEHOLDER_NODES_FILE = process.env.PLACEHOLDER_NODES_FILE || path.join(DATA_DIR, "placeholderNodes.json");
const EMBY_USERS_FILE = process.env.EMBY_USERS_FILE || path.join(DATA_DIR, "embyUsers.json");
const EMBY_VENDORS_FILE = process.env.EMBY_VENDORS_FILE || path.join(DATA_DIR, "embyVendors.json");
const PRESETS_FILE = process.env.PRESETS_FILE || path.join(DATA_DIR, "presets.json");
const PRICING_FILE = process.env.PRICING_FILE || path.join(DATA_DIR, "pricing.json");

const POOL_CACHE_DIR = process.env.POOL_CACHE_DIR || path.join(DATA_DIR, "pool-cache");
const ALERT_STATE_FILE = process.env.ALERT_STATE_FILE || path.join(DATA_DIR, "alert-state.json");
const alertStore = notifier.createAlertStore(ALERT_STATE_FILE);
const DATABASE_URL = process.env.DATABASE_URL || "";
const DIST_DIR = path.join(__dirname, "dist");
const PUBLIC_DIR = fsSync.existsSync(path.join(DIST_DIR, "index.html")) ? DIST_DIR : path.join(__dirname, "public");
const BUILD_META_FILE = process.env.BUILD_META_FILE || path.join(__dirname, "build-meta.json");
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS || 2 * 60 * 60 * 1000);
const LOW_TRAFFIC_BYTES = Number(process.env.LOW_TRAFFIC_BYTES || 10 * 1024 * 1024 * 1024);
const EXPIRING_SOON_DAYS = Number(process.env.EXPIRING_SOON_DAYS || 3);
const RELAY_BEFORE_EXPIRY_DAYS = Number(process.env.RELAY_BEFORE_EXPIRY_DAYS || 10);
const RELAY_AFTER_EXPIRY_DAYS = Number(process.env.RELAY_AFTER_EXPIRY_DAYS || 10);
const POOL_CONFIG_CACHE_TTL_MS = Number(process.env.POOL_CONFIG_CACHE_TTL_MS || 24 * 60 * 60 * 1000);
const SUB_CONVERTER_URL = (process.env.SUB_CONVERTER_URL || "").replace(/\/+$/, "");
const DEFAULT_SUBCONVERTER_TARGET = "clash";
const DEFAULT_SERVICE_PROVIDER = "YKK Cloud";
const DEFAULT_PRICING = [
  { id: "basic", group: "basic", monthly: 39, quarterly: 109, half_yearly: 199, yearly: 369 },
  { id: "pro",   group: "pro",   monthly: 49, quarterly: 129, half_yearly: 229, yearly: 429 },
  { id: "ultra", group: "ultra", monthly: 89, quarterly: 239, half_yearly: 449, yearly: 859 }
];
const AUTH_COOKIE_NAME = "xela_session";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto
  .createHash("sha256")
  .update(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}:${DATA_FILE}`)
  .digest("hex");
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const REMEMBER_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || SESSION_SECRET.slice(0, 32);
const LIVE_POOL_CONFIG_TTL_MS = Number(process.env.LIVE_POOL_CONFIG_TTL_MS || 60 * 1000);
const livePoolConfigs = new Map();
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
let vendors = [];
let placeholderNodes = [];
let presets = [];
let embyUsers = [];
let embyVendors = [];
let pricing = [];
const dataStore = createDataStore({
  dataDir: DATA_DIR,
  databaseUrl: DATABASE_URL,
  files: {
    subscriptions: DATA_FILE,
    users: USERS_FILE,
    bills: BILLS_FILE,
    vendors: VENDORS_FILE,
    presets: PRESETS_FILE,
    placeholderNodes: PLACEHOLDER_NODES_FILE,
    embyUsers: EMBY_USERS_FILE,
    embyVendors: EMBY_VENDORS_FILE,
    pricing: PRICING_FILE
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
  vendors = state.vendors || [];
  presets = state.presets || [];
  placeholderNodes = state.placeholderNodes || [];
  embyUsers = state.embyUsers || [];
  embyVendors = state.embyVendors || [];
  pricing = state.pricing || [];
  if (!pricing.length) { pricing = DEFAULT_PRICING.map(r => ({ ...r })); await savePricing(); }
  let embyVendorsMigrated = false;
  for (const v of embyVendors) {
    if (v.serverUrl && !v.servers) {
      v.servers = [{ url: v.serverUrl, label: "" }];
      v.website = v.website || "";
      delete v.serverUrl;
      embyVendorsMigrated = true;
    }
  }
  if (embyVendorsMigrated) await saveEmbyVendors();

  if (state.missing.subscriptions) await saveData();
  if (state.missing.users) await saveUsers();
  if (state.missing.bills) {
    bills = initialBillsFromUsers();
    await saveBills();
  }
  if (state.missing.vendors) {
    const names = [...new Set(subscriptions.map(s => s.serviceProvider).filter(Boolean))];
    vendors = names.map((name, i) => ({ id: `vendor-${i}`, name }));
    await saveVendors();
  }
  if (state.missing.placeholderNodes) await savePlaceholderNodes();
  if (state.missing.embyVendors) {
    const urls = [...new Set(embyUsers.map(u => u.serverUrl).filter(Boolean))];
    embyVendors = urls.map((url, i) => ({ id: `emby-vendor-${Date.now() + i}`, name: url, website: "", servers: [{ url, label: "" }], note: "" }));
    for (const user of embyUsers) {
      if (user.serverUrl) {
        const vendor = embyVendors.find(v => v.servers[0].url === user.serverUrl);
        if (vendor) user.embyVendorId = vendor.id;
      }
    }
    await saveEmbyVendors();
    if (embyUsers.length) await saveEmbyUsers();
  }
  if (ensureSubscriptionServiceProviders()) await saveData();
  if (ensureUserRelayTokens()) await saveUsers();

  // 预设解耦迁移：将 vendor.defaultSubconverterConfig 拆为全局预设 + 供应商覆盖字段
  const existingPreset = presets.find(p => p.id === "default");
  if (!existingPreset?.target) {
    const source = vendors.find(v => v.defaultSubconverterConfig);
    if (source) {
      const raw = source.defaultSubconverterConfig;
      const sc = raw.subconverterConfig ? { ...raw.subconverterConfig, target: raw.subconverterConfig.target || raw.target } : raw;
      if (existingPreset) {
        existingPreset.target = sc.target || DEFAULT_SUBCONVERTER_TARGET;
      } else {
        presets.push({ id: "default", target: sc.target || DEFAULT_SUBCONVERTER_TARGET, config: sc.config || "", emoji: sc.emoji !== false, udp: sc.udp !== false, scv: Boolean(sc.scv), sort: Boolean(sc.sort) });
      }
    } else if (existingPreset) {
      existingPreset.target = DEFAULT_SUBCONVERTER_TARGET;
    } else {
      presets.push({ id: "default", target: DEFAULT_SUBCONVERTER_TARGET, config: "", emoji: true, udp: true, scv: false, sort: false });
    }
    await savePresets();
  }
  let vendorMigrated = false;
  for (const v of vendors) {
    if (v.defaultSubconverterConfig) {
      const raw = v.defaultSubconverterConfig;
      const sc = raw.subconverterConfig ? { ...raw.subconverterConfig } : raw;
      v.overrideExclude = sc.exclude || "";
      v.overrideInclude = sc.include || "";
      v.overrideRename = sc.rename || "";
      delete v.defaultSubconverterConfig;
      vendorMigrated = true;
    }
  }
  if (vendorMigrated) await saveVendors();
  let userMigrated = false;
  for (const u of users) {
    if (u.scMode || u.vendorId || u.subconverterConfig) {
      delete u.scMode;
      delete u.vendorId;
      delete u.subconverterConfig;
      userMigrated = true;
    }
  }
  if (userMigrated) await saveUsers();
}

let lastLoadedAt = 0;
let _loadingPromise = null;
let _writeGen = 0;
const DATA_CACHE_TTL_MS = Number(process.env.DATA_CACHE_TTL_MS || 30000);

function _doLoad() {
  if (_loadingPromise) return _loadingPromise;
  const gen = _writeGen;
  _loadingPromise = dataStore.loadAll().then(state => {
    if (gen !== _writeGen) return;
    subscriptions = state.subscriptions;
    users = state.users;
    bills = state.bills;
    vendors = state.vendors || [];
    presets = state.presets || [];
    placeholderNodes = state.placeholderNodes || [];
    embyUsers = state.embyUsers || [];
    embyVendors = state.embyVendors || [];
    pricing = state.pricing || [];
    lastLoadedAt = Date.now();
  }).finally(() => { _loadingPromise = null; });
  return _loadingPromise;
}

async function loadLatestData({ force = false } = {}) {
  if (!force && Date.now() - lastLoadedAt < DATA_CACHE_TTL_MS) return;
  if (lastLoadedAt === 0) return _doLoad();
  _doLoad();
}

function _markWritten() { _writeGen++; lastLoadedAt = Date.now(); }

async function saveData() {
  _markWritten();
  await dataStore.saveCollection("subscriptions", subscriptions);
}

async function saveUsers() {
  _markWritten();
  await dataStore.saveCollection("users", users);
}

async function saveBills() {
  _markWritten();
  await dataStore.saveCollection("bills", bills);
}

async function saveVendors() {
  _markWritten();
  await dataStore.saveCollection("vendors", vendors);
}

async function savePresets() {
  _markWritten();
  await dataStore.saveCollection("presets", presets);
}

async function savePlaceholderNodes() {
  _markWritten();
  await dataStore.saveCollection("placeholderNodes", placeholderNodes);
}

async function saveEmbyUsers() {
  _markWritten();
  await dataStore.saveCollection("embyUsers", embyUsers);
}

async function saveEmbyVendors() {
  _markWritten();
  await dataStore.saveCollection("embyVendors", embyVendors);
}

async function savePricing() {
  _markWritten();
  await dataStore.saveCollection("pricing", pricing);
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

function normalizeServiceProvider(input = {}, existing = {}) {
  return String(
    input.serviceProvider
    || input.provider
    || existing.serviceProvider
    || existing.provider
    || DEFAULT_SERVICE_PROVIDER
  ).trim() || DEFAULT_SERVICE_PROVIDER;
}

function normalizeServiceProviderWebsite(input = {}, existing = {}, serviceProvider = DEFAULT_SERVICE_PROVIDER) {
  const hasInput = Object.prototype.hasOwnProperty.call(input, "serviceProviderWebsite")
    || Object.prototype.hasOwnProperty.call(input, "providerWebsite");
  const raw = hasInput
    ? (input.serviceProviderWebsite ?? input.providerWebsite ?? "")
    : (existing.serviceProvider === serviceProvider ? existing.serviceProviderWebsite || existing.providerWebsite || "" : "");
  const value = String(raw || "").trim();
  if (value && !/^https?:\/\//i.test(value)) throw new Error("服务商官网需以 http 或 https 开头。");
  return value;
}

function ensureSubscriptionServiceProviders() {
  let changed = false;
  for (const item of subscriptions) {
    const nextProvider = normalizeServiceProvider({}, item);
    if (item.serviceProvider !== nextProvider) {
      item.serviceProvider = nextProvider;
      item.updatedAt = item.updatedAt || new Date().toISOString();
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
    || process.env.GIT_COMMIT_TIMESTAMP
    || readGitUpdatedAt()
    || buildMeta.APP_UPDATED_AT
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
  const serviceProvider = normalizeServiceProvider(input, existing);
  const serviceProviderWebsite = normalizeServiceProviderWebsite(input, existing, serviceProvider);
  const customer = String(input.customer || existing.customer || "").trim();
  const note = String(input.note || existing.note || "").trim();

  if (!url || !/^https?:\/\//i.test(url)) throw new Error("请填写 http 或 https 开头的订阅 URL。");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("请填写该 URL 绑定的有效邮箱。");

  return {
    ...existing,
    name,
    url,
    email,
    serviceProvider,
    serviceProviderWebsite,
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

// 永久用户的到期日哨兵（须与 src/main.jsx 的 LIFETIME_EXPIRES_AT 一致）
const LIFETIME_EXPIRES_AT = "9999-12-31T00:00:00.000Z";

// custom：到期由请求的 expiresAt 决定；lifetime：永久
function isValidDuration(duration) {
  return Boolean(durationDays(duration)) || duration === "custom" || duration === "lifetime";
}

function normalizeIdList(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[\n,，;；]+/);
  return [...new Set(raw.map(item => String(item || "").trim()).filter(Boolean))];
}

function userImessageIds(user = {}) {
  return normalizeIdList(user.imessageIds !== undefined ? user.imessageIds : user.imessageId);
}

function calculateExpiry(purchasedAt, duration) {
  if (duration === "lifetime") return LIFETIME_EXPIRES_AT;
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

function recommendSubscriptionForExpiry(expiresAt, { ignoredUserId = "" } = {}) {
  const userExpiryTime = startOfUtcDate(expiresAt);
  const dayMs = 86400000;
  let noExpiry = 0;
  let outOfWindow = 0;
  const candidates = subscriptions
    .map(item => {
      const expireTime = item.metrics?.expireAt ? startOfUtcDate(item.metrics.expireAt) : null;
      if (!Number.isFinite(expireTime) || !Number.isFinite(userExpiryTime)) {
        noExpiry++;
        return null;
      }
      const diffDays = (expireTime - userExpiryTime) / dayMs;
      if (diffDays < -RELAY_BEFORE_EXPIRY_DAYS || diffDays > RELAY_AFTER_EXPIRY_DAYS) {
        outOfWindow++;
        return null;
      }
      return { item, diffDays };
    })
    .filter(Boolean)
    .map(c => ({ ...c, customerCount: subscriptionCustomerCount(c.item.id, ignoredUserId) }));

  const sorted = candidates.sort((a, b) => {
    const aAfter = a.diffDays >= 0 ? 0 : 1;
    const bAfter = b.diffDays >= 0 ? 0 : 1;
    if (aAfter !== bAfter) return aAfter - bAfter;
    return Math.abs(a.diffDays) - Math.abs(b.diffDays) || a.customerCount - b.customerCount;
  });

  if (sorted.length) {
    return { subscription: sorted[0].item, reason: null };
  }

  if (outOfWindow > 0) {
    const latest = subscriptionsByLatestExpiry()[0];
    if (latest) return { subscription: latest, reason: "用户到期日远超所有池，已推荐最晚到期的池。" };
  }

  const reason = subscriptions.length === 0
    ? "没有可用的池 URL。"
    : noExpiry > 0
    ? "池 URL 缺少到期时间，请手动选择。"
    : "没有匹配的池 URL，请手动选择。";
  return { subscription: null, reason };
}

function normalizeUser(input, existing = {}) {
  const userId = String(input.userId || existing.userId || "").trim();
  const wechatName = String(input.wechatName || existing.wechatName || "").trim();
  const imessageIds = normalizeIdList(input.imessageIds !== undefined ? input.imessageIds : (input.imessageId !== undefined ? input.imessageId : userImessageIds(existing)));
  const imessageId = imessageIds[0] || "";
  const purchasedAt = String(input.purchasedAt || existing.purchasedAt || new Date().toISOString()).trim();
  const duration = String(input.duration || existing.duration || "monthly").trim();
  const requestedSubscriptionId = String(input.subscriptionId || existing.subscriptionId || "").trim();
  const actualPaid = normalizePaymentAmount(input.actualPaid ?? existing.actualPaid ?? "");
  const calculatedExpiresAt = calculateExpiry(purchasedAt, duration);
  const requestedExpiresAt = String(input.expiresAt || "").trim();
  const requestedExpiresDate = requestedExpiresAt ? new Date(requestedExpiresAt) : null;
  const expiresAt = duration === "lifetime"
    ? LIFETIME_EXPIRES_AT
    : (requestedExpiresDate && !Number.isNaN(requestedExpiresDate.getTime())
      ? requestedExpiresDate.toISOString()
      : calculatedExpiresAt);
  const subscription = subscriptions.find(item => item.id === requestedSubscriptionId);

  if (!userId) throw new Error("请填写用户 ID。");
  if (!subscription) throw new Error("请选择已添加的 URL。");
  if (!isValidDuration(duration)) throw new Error("请选择套餐时长。");
  if (!expiresAt) throw new Error(duration === "custom" ? "请选择到期日期。" : "购买时间格式不正确。");
  if (requestedExpiresAt && (!requestedExpiresDate || Number.isNaN(requestedExpiresDate.getTime()))) throw new Error("到期时间格式不正确。");
  if (actualPaid === null) throw new Error("请填写正确的实付款金额。");

  const group = ["basic", "pro", "ultra"].includes(input.group) ? input.group : (existing.group || "pro");
  const isBusiness = input.isBusiness !== undefined ? Boolean(input.isBusiness) : Boolean(existing.isBusiness);
  const isFamilyFriend = input.isFamilyFriend !== undefined ? Boolean(input.isFamilyFriend) : Boolean(existing.isFamilyFriend);
  const level = actualPaid <= 300 ? "vip1" : (actualPaid <= 1000 ? "vip2" : "vip3");

  return {
    ...existing,
    userId,
    wechatName,
    imessageId,
    purchasedAt: new Date(purchasedAt).toISOString(),
    duration,
    actualPaid,
    group,
    level,
    isBusiness,
    isFamilyFriend,
    subscriptionId: subscription.id,
    subscriptionToken: existing.subscriptionToken || relayToken(),
    expiresAt,
    placeholderTag: String(input.placeholderTag ?? existing.placeholderTag ?? "").trim() || null,
    showUserInfo: input.showUserInfo !== undefined
      ? input.showUserInfo !== false
      : (existing.showUserInfo !== undefined ? existing.showUserInfo !== false : true),
    useDefaultPlaceholder: input.useDefaultPlaceholder !== undefined
      ? input.useDefaultPlaceholder !== false
      : (existing.useDefaultPlaceholder !== undefined ? existing.useDefaultPlaceholder !== false : true),
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


function billUserLabel(user) {
  return user.userId || user.wechatName || userImessageIds(user)[0] || "未知用户";
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
      imessageId: user.imessageId || "",
      imessageIds: userImessageIds(user)
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

  if (!isValidDuration(duration)) throw new Error("请选择续费时长。");
  if (Number.isNaN(renewedAt.getTime())) throw new Error("续费时间格式不正确。");
  if (actualPaid === null) throw new Error("请填写正确的实付款金额。");

  let expiresAt;
  if (duration === "lifetime") {
    expiresAt = LIFETIME_EXPIRES_AT;
  } else if (duration === "custom") {
    const requestedExpiresDate = input.expiresAt ? new Date(input.expiresAt) : null;
    if (!requestedExpiresDate || Number.isNaN(requestedExpiresDate.getTime())) throw new Error("请选择到期日期。");
    expiresAt = requestedExpiresDate.toISOString();
  } else {
    const baseTime = currentExpiry && currentExpiry.getTime() > renewedAt.getTime() ? currentExpiry : renewedAt;
    expiresAt = calculateExpiry(baseTime.toISOString(), duration);
  }
  const subscription = subscriptions.find(item => item.id === requestedSubscriptionId);
  if (!expiresAt) throw new Error("续费时间格式不正确。");
  if (!subscription) throw new Error("请选择已添加的 URL。");

  Object.assign(user, {
    purchasedAt: renewedAt.toISOString(),
    duration,
    actualPaid: Math.round((previousPaid + actualPaid) * 100) / 100,
    subscriptionId: subscription.id,
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
  const metrics = item.metrics;
  if (item.lastError || !metrics || metrics.unavailable) return "invalid";

  const expiresAt = metrics.expireAt ? new Date(metrics.expireAt).getTime() : NaN;
  const remaining = Number(metrics.remainingBytes);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(remaining)) return "invalid";

  if (remaining <= 0) return "depleted";

  const daysLeft = (expiresAt - Date.now()) / 86400000;
  if (daysLeft <= EXPIRING_SOON_DAYS) return "expiring";
  if (remaining <= LOW_TRAFFIC_BYTES) return "low_traffic";

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

function customerCountBySubscriptionId() {
  const counts = new Map();
  for (const user of users) {
    if (!user.subscriptionId) continue;
    counts.set(user.subscriptionId, (counts.get(user.subscriptionId) || 0) + 1);
  }
  return counts;
}

function subscriptionById() {
  return new Map(subscriptions.map(item => [item.id, item]));
}

function userById() {
  return new Map(users.map(item => [item.id, item]));
}

function publicItem(item, customerCount = null) {
  const resolvedCustomerCount = customerCount ?? users.filter(user => user.subscriptionId === item.id).length;
  return {
    ...item,
    serviceProvider: normalizeServiceProvider({}, item),
    customerCount: resolvedCustomerCount,
    status: statusFor(item, resolvedCustomerCount)
  };
}

function publicUser(user, subscriptionMap = null) {
  const subscription = subscriptionMap
    ? subscriptionMap.get(user.subscriptionId)
    : subscriptions.find(item => item.id === user.subscriptionId);
  return {
    ...user,
    userLogs: Array.isArray(user.userLogs)
      ? user.userLogs
      : (Array.isArray(user.fallbackLogs) ? user.fallbackLogs : []),
    relayPath: user.subscriptionToken ? `/sub/${user.subscriptionToken}` : "",
    subscription: subscription ? {
      id: subscription.id,
      url: subscription.url,
      email: subscription.email || "",
      serviceProvider: normalizeServiceProvider({}, subscription),
      serviceProviderWebsite: subscription.serviceProviderWebsite || "",
      name: subscription.name || ""
    } : null
  };
}

function publicBill(bill, userMap = null) {
  const user = userMap
    ? userMap.get(bill.userId)
    : users.find(item => item.id === bill.userId);
  return {
    ...bill,
    originalUserLabel: bill.userLabel || bill.userSnapshot?.userId || "",
    userLabel: user ? billUserLabel(user) : (bill.userLabel || bill.userSnapshot?.userId || "未知用户"),
    user: user ? {
      id: user.id,
      userId: user.userId,
      wechatName: user.wechatName || "",
      imessageId: user.imessageId || "",
      imessageIds: userImessageIds(user),
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

    if (bestResult.metrics && (bestScore >= existingScore || bestResult.metrics.expireAt)) {
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

function registerLivePoolConfig(config) {
  const id = crypto.randomBytes(18).toString("base64url");
  livePoolConfigs.set(id, {
    ...config,
    expiresAt: Date.now() + LIVE_POOL_CONFIG_TTL_MS
  });
  return id;
}

function readLivePoolConfig(id) {
  const config = livePoolConfigs.get(id);
  if (!config) return null;
  if (Date.now() > config.expiresAt) {
    livePoolConfigs.delete(id);
    return null;
  }
  return config;
}

function cleanupLivePoolConfigs() {
  const now = Date.now();
  for (const [id, config] of livePoolConfigs) {
    if (now > config.expiresAt) livePoolConfigs.delete(id);
  }
}

function livePoolConfigFailure(results, best) {
  const message = results.find(result => result.error)?.error
    || (best?.status ? `池 URL 获取失败（HTTP ${best.status}）。` : "没有获取到可用的 Clash YAML 配置。");
  const error = new Error(message);
  error.attempts = results.map(result => ({
    client: result.client,
    status: result.status,
    score: result.score,
    bodyLength: result.body.length,
    rawBodyLength: result.rawBodyLength,
    error: result.error
  }));
  return error;
}

async function fetchLivePoolConfig(item) {
  const profiles = REQUEST_PROFILES.filter(profile => profile.name === "clash-meta");
  const results = [];
  relayLog("live-pool-fetch-start", {
    pool: poolLogInfo(item),
    profiles: profiles.map(profile => profile.name)
  });
  for (const profile of profiles) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const requestHeaders = {
      ...profile.headers,
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    };
    relayLog("live-pool-fetch-request", {
      poolId: item?.id || "",
      url: item?.url || "",
      method: "GET",
      profile: profile.name,
      headers: headersForLog(requestHeaders)
    });
    try {
      const response = await fetch(item.url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: requestHeaders
      });
      const rawBody = await response.text();
      const body = response.ok ? extractClashConfigBody(rawBody) : "";
      const score = response.ok ? clashConfigScore(body) : -1000;
      relayLog("live-pool-fetch-response", {
        poolId: item?.id || "",
        profile: profile.name,
        ok: response.ok,
        status: response.status,
        headers: responseHeadersForLog(response),
        rawBodyLength: rawBody.length,
        extractedBodyLength: body.length,
        score,
        subscriptionUserinfo: response.headers.get("subscription-userinfo") || response.headers.get("Subscription-Userinfo") || "",
        rawBodyPreview: bodyPreview(rawBody),
        extractedBodyPreview: bodyPreview(body)
      });
      results.push({
        body,
        client: profile.name,
        status: response.status,
        score,
        rawBodyLength: rawBody.length,
        contentType: response.headers.get("content-type") || "text/plain; charset=utf-8",
        subscriptionUserinfo: response.headers.get("subscription-userinfo") || response.headers.get("Subscription-Userinfo") || "",
        error: response.ok ? null : `池 URL 获取失败（HTTP ${response.status}）：${rawBody.slice(0, 200)}`
      });
    } catch (error) {
      relayLog("live-pool-fetch-error", {
        poolId: item?.id || "",
        profile: profile.name,
        errorName: error.name,
        errorMessage: error.message
      });
      results.push({
        body: "",
        client: profile.name,
        status: null,
        score: -1000,
        rawBodyLength: 0,
        contentType: "text/plain; charset=utf-8",
        subscriptionUserinfo: "",
        error: error.name === "AbortError" ? "池 URL 请求超时。" : `池 URL 请求失败：${error.message}`
      });
    } finally {
      clearTimeout(timer);
    }
  }

  const best = results.sort((a, b) => b.score - a.score)[0];
  relayLog("live-pool-fetch-best", {
    poolId: item?.id || "",
    best: best ? {
      client: best.client,
      status: best.status,
      score: best.score,
      bodyLength: best.body.length,
      rawBodyLength: best.rawBodyLength,
      error: best.error
    } : null
  });
  if (!best?.body) {
    relayLog("live-pool-fetch-failed", {
      poolId: item?.id || "",
      attempts: results.map(result => ({
        client: result.client,
        status: result.status,
        score: result.score,
        bodyLength: result.body.length,
        rawBodyLength: result.rawBodyLength,
        error: result.error
      }))
    });
    throw livePoolConfigFailure(results, best);
  }

  return {
    body: best.body,
    status: best.status,
    client: best.client,
    fetchedAt: new Date().toISOString(),
    contentType: best.contentType,
    subscriptionUserinfo: best.subscriptionUserinfo,
    score: best.score,
    bodyLength: best.body.length,
    attempts: results.map(result => ({
      client: result.client,
      status: result.status,
      score: result.score,
      bodyLength: result.body.length,
      rawBodyLength: result.rawBodyLength,
      error: result.error
    })),
    error: null
  };
}

function poolMetricUnavailableReason(item, now = Date.now()) {
  const expireTime = item?.metrics?.expireAt ? new Date(item.metrics.expireAt).getTime() : NaN;
  if (Number.isFinite(expireTime) && expireTime <= now) return "pool-expired";
  const remaining = item?.metrics?.remainingBytes;
  if (remaining !== null && remaining !== undefined && Number(remaining) <= 0) return "pool-depleted";
  return "";
}

const fallbackReasonText = {
  "pool-expired": "\u539f\u6c60 URL \u5df2\u5230\u671f",
  "pool-depleted": "\u539f\u6c60 URL \u6d41\u91cf\u5df2\u7528\u5c3d",
  "pool-fetch-failed": "\u539f\u6c60 URL \u5b9e\u65f6\u83b7\u53d6\u5931\u8d25",
  "pool-missing": "\u539f\u6c60 URL \u4e0d\u5b58\u5728"
};

const userLogReasonText = {
  ...fallbackReasonText,
  "user-expired": "\u7528\u6237\u81ea\u8eab\u5df2\u5230\u671f",
  "custom-url-disabled": "\u8be5 URL \u672a\u542f\u7528",
  "subconverter-not-configured": "\u8ba2\u9605\u8f6c\u6362\u670d\u52a1\u672a\u914d\u7f6e",
  "subconverter-failed": "\u8ba2\u9605\u8f6c\u6362\u5931\u8d25",
  "subconverter-timeout": "\u8ba2\u9605\u8f6c\u6362\u8d85\u65f6",
  "subconverter-request-failed": "\u8ba2\u9605\u8f6c\u6362\u8bf7\u6c42\u5931\u8d25",
  "user-created": "\u7528\u6237\u521b\u5efa",
  "user-renewed": "\u7528\u6237\u7eed\u8d39",
  "user-updated": "\u7528\u6237\u8d44\u6599\u66f4\u65b0",
  "manual-pool-changed": "\u624b\u52a8\u6362\u6c60",
  "bill-reversed": "\u8d26\u5355\u51b2\u9500",
  "bill-deleted": "\u8d26\u5355\u5220\u9664",
  "user-deleted": "\u7528\u6237\u5220\u9664"
};

const userLogStatusText = {
  switched: "\u5df2\u81ea\u52a8\u6362\u6c60",
  no_usable_pool: "\u6682\u65e0\u53ef\u7528\u6c60",
  blocked: "\u5df2\u62e6\u622a",
  failed: "\u8bf7\u6c42\u5931\u8d25",
  kept_current: "\u7ee7\u7eed\u4f7f\u7528\u539f\u6c60",
  recorded: "\u5df2\u8bb0\u5f55"
};

const USER_LOG_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

function subscriptionLogLabel(item) {
  if (!item) return "";
  return item.email || item.name || item.url || item.id || "";
}

function relayLog(event, details = {}) {
  try {
    console.log(`[relay:${event}] ${JSON.stringify({
      at: new Date().toISOString(),
      ...details
    })}`);
  } catch {
    console.log(`[relay:${event}]`, details);
  }
}

function redactHeaderValue(name, value) {
  if (/authorization|cookie|token|secret|password/i.test(String(name))) return "[redacted]";
  return value;
}

function headersForLog(headers = {}) {
  const output = {};
  for (const [name, value] of Object.entries(headers || {})) {
    output[name] = redactHeaderValue(name, value);
  }
  return output;
}

function responseHeadersForLog(response) {
  const output = {};
  for (const [name, value] of response.headers.entries()) {
    output[name] = redactHeaderValue(name, value);
  }
  return output;
}

function bodyPreview(body, length = 500) {
  return String(body || "").slice(0, length).replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

function poolLogInfo(item) {
  return {
    id: item?.id || "",
    label: subscriptionLogLabel(item),
    url: item?.url || "",
    metrics: item?.metrics || null,
    metricUnavailableReason: poolMetricUnavailableReason(item) || ""
  };
}

function createUserLog({
  event = "subscription-request",
  status = "failed",
  reason = "",
  fromSubscription = null,
  toSubscription = null,
  req = null,
  target = "",
  stage = "",
  message = "",
  details = null
} = {}) {
  const log = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    event,
    status,
    statusText: userLogStatusText[status] || status,
    reason,
    reasonText: userLogReasonText[reason] || reason,
    fromSubscriptionId: fromSubscription?.id || "",
    fromSubscriptionLabel: subscriptionLogLabel(fromSubscription),
    toSubscriptionId: toSubscription?.id || "",
    toSubscriptionLabel: subscriptionLogLabel(toSubscription),
    requestPath: req?.url || "",
    target
  };
  if (stage) log.stage = stage;
  if (message) log.message = message;
  if (details) log.details = details;
  return log;
}

function dedupeUserLogs(logs = []) {
  const seen = new Set();
  return (Array.isArray(logs) ? logs : []).filter(log => {
    if (!log) return false;
    const key = log.id || [
      log.at || "",
      log.status || "",
      log.reason || "",
      log.stage || "",
      log.fromSubscriptionId || "",
      log.toSubscriptionId || "",
      log.requestPath || ""
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function appendUserLogToUser(user, log) {
  const existingLogs = dedupeUserLogs(Array.isArray(user.userLogs)
    ? user.userLogs
    : (Array.isArray(user.fallbackLogs) ? user.fallbackLogs : []));
  user.userLogs = dedupeUserLogs([log, ...existingLogs]).slice(0, 100);
  user.lastUserLogAt = log.at;
}

async function recordUserLog(user, options = {}) {
  if (!user) return null;
  const log = createUserLog(options);
  const logs = Array.isArray(user.userLogs)
    ? user.userLogs
    : (Array.isArray(user.fallbackLogs) ? user.fallbackLogs : []);
  const latest = logs[0];
  const latestAt = latest?.at ? new Date(latest.at).getTime() : NaN;
  const logAt = new Date(log.at).getTime();
  const isDuplicate = latest
    && latest.status === log.status
    && latest.reason === log.reason
    && latest.stage === log.stage
    && latest.fromSubscriptionId === log.fromSubscriptionId
    && latest.toSubscriptionId === log.toSubscriptionId
    && latest.requestPath === log.requestPath
    && Number.isFinite(latestAt)
    && logAt - latestAt <= USER_LOG_DEDUPE_WINDOW_MS;
  if (isDuplicate) {
    latest.repeatCount = Number(latest.repeatCount || 1) + 1;
    latest.lastSeenAt = log.at;
    latest.message = log.message || latest.message;
    user.userLogs = logs;
    user.lastUserLogAt = log.at;
    await saveUsers();
    relayLog("user-log-deduped", {
      userId: user?.id || "",
      log: latest
    });
    return latest;
  }
  appendUserLogToUser(user, log);
  await saveUsers();
  relayLog("user-log-saved", {
    userId: user?.id || "",
    log
  });
  return log;
}

async function recordUserActionLog(user, options = {}) {
  if (!user) return null;
  const log = createUserLog({
    event: "user-action",
    status: "recorded",
    ...options
  });
  appendUserLogToUser(user, log);
  user.updatedAt = log.at;
  await saveUsers();
  relayLog("user-action-log-saved", {
    userId: user?.id || "",
    log
  });
  return log;
}

function userSnapshotForLog(user = {}) {
  return {
    userId: user.userId || "",
    wechatName: user.wechatName || "",
    imessageIds: userImessageIds(user),
    group: user.group || "",
    isBusiness: Boolean(user.isBusiness),
    isFamilyFriend: Boolean(user.isFamilyFriend),
    purchasedAt: user.purchasedAt || "",
    duration: user.duration || "",
    actualPaid: Number(user.actualPaid) || 0,
    expiresAt: user.expiresAt || "",
    subscriptionId: user.subscriptionId || "",
    outputMode: user.outputMode || "subconverter",
    blockUserinfo: user.blockUserinfo !== false,
    placeholderTag: user.placeholderTag || "",
    showUserInfo: user.showUserInfo !== false,
    useDefaultPlaceholder: user.useDefaultPlaceholder !== false
  };
}

function summarizeUserChanges(before = {}, after = {}) {
  const labels = {
    userId: "\u7528\u6237 ID",
    wechatName: "\u5fae\u4fe1\u53f7",
    imessageIds: "iMessage ID",
    group: "\u5957\u9910",
    isBusiness: "\u4f01\u4e1a\u7528\u6237",
    isFamilyFriend: "\u4eb2\u53cb\u8d26\u6237",
    purchasedAt: "\u8d2d\u4e70\u65e5\u671f",
    duration: "\u5957\u9910\u65f6\u957f",
    actualPaid: "\u5b9e\u4ed8\u91d1\u989d",
    expiresAt: "\u5230\u671f\u65f6\u95f4",
    subscriptionId: "\u7ed1\u5b9a\u6c60",
    outputMode: "\u6295\u9012\u6a21\u5f0f",
    blockUserinfo: "\u5c4f\u853d userinfo",
    placeholderTag: "\u5360\u4f4d\u8282\u70b9",
    showUserInfo: "\u663e\u793a\u7528\u6237\u4fe1\u606f",
    useDefaultPlaceholder: "\u4f7f\u7528\u9ed8\u8ba4\u5360\u4f4d\u8282\u70b9"
  };
  return Object.keys(labels).flatMap(key => {
    const beforeValue = Array.isArray(before[key]) ? before[key].join(", ") : before[key];
    const afterValue = Array.isArray(after[key]) ? after[key].join(", ") : after[key];
    if (String(beforeValue ?? "") === String(afterValue ?? "")) return [];
    return [{
      field: key,
      label: labels[key],
      before: beforeValue ?? "",
      after: afterValue ?? ""
    }];
  });
}

function userActionMessage(reason, details = {}) {
  if (reason === "user-created") return "\u521b\u5efa\u7528\u6237";
  if (reason === "user-renewed") {
    return `\u7eed\u8d39 ${details.duration || "-"}\uff0c\u91d1\u989d ${Number(details.amount || 0).toFixed(2)}\uff0c\u5230\u671f ${details.beforeExpiresAt || "-"} -> ${details.afterExpiresAt || "-"}`;
  }
  if (reason === "manual-pool-changed") {
    const changeText = (details.changes || [])
      .map(item => `${item.label}: ${item.before || "-"} -> ${item.after || "-"}`)
      .join("\uff1b");
    return `\u624b\u52a8\u6362\u6c60\uff1a${details.fromSubscriptionLabel || "-"} -> ${details.toSubscriptionLabel || "-"}${changeText ? `\uff1b${changeText}` : ""}`;
  }
  if (reason === "user-updated") {
    const changeText = (details.changes || [])
      .map(item => `${item.label}: ${item.before || "-"} -> ${item.after || "-"}`)
      .join("\uff1b");
    return `\u66f4\u65b0\u7528\u6237\u8d44\u6599\uff1a${changeText || "\u65e0\u5b57\u6bb5\u53d8\u5316"}`;
  }
  if (reason === "bill-reversed") return `\u51b2\u9500\u8d26\u5355\uff1a${details.billType || "-"} ${Number(details.amount || 0).toFixed(2)}`;
  if (reason === "bill-deleted") return `\u5220\u9664\u8d26\u5355\uff1a${details.billType || "-"} ${Number(details.amount || 0).toFixed(2)}`;
  if (reason === "user-deleted") return "\u5220\u9664\u7528\u6237";
  return "";
}

function billDetailsForLog(bill = {}) {
  return {
    billId: bill.id || "",
    billType: bill.type || "",
    amount: Number(bill.amount) || 0,
    duration: bill.duration || "",
    occurredAt: bill.occurredAt || "",
    beforeExpiresAt: bill.beforeExpiresAt || null,
    afterExpiresAt: bill.afterExpiresAt || null,
    description: bill.description || ""
  };
}

function appendBillActionLog(bill, reason, req) {
  const user = users.find(entry => entry.id === bill?.userId);
  if (!user) return;
  const details = billDetailsForLog(bill);
  appendUserLogToUser(user, createUserLog({
    event: "user-action",
    status: "recorded",
    reason,
    req,
    message: userActionMessage(reason, details),
    details
  }));
}

function fallbackCandidateRank(item, user) {
  const userTime = user?.expiresAt ? startOfUtcDate(user.expiresAt) : null;
  const poolTime = item?.metrics?.expireAt ? startOfUtcDate(item.metrics.expireAt) : null;
  const dayMs = 86400000;
  if (!Number.isFinite(userTime) || !Number.isFinite(poolTime)) {
    return { group: 2, distance: Number.POSITIVE_INFINITY };
  }
  const diffDays = (poolTime - userTime) / dayMs;
  if (Math.abs(diffDays) > 10) return null;
  return {
    group: diffDays >= 0 ? 0 : 1,
    distance: Math.abs(diffDays)
  };
}

function fallbackCandidates(user, currentSubscription) {
  const candidates = subscriptions
    .filter(item => item.id !== currentSubscription?.id)
    .map(item => {
      const rank = fallbackCandidateRank(item, user);
      if (rank === null) return null;
      const metricReason = poolMetricUnavailableReason(item);
      return {
        item,
        rank: {
          ...rank,
          metricPenalty: metricReason ? 1 : 0,
          metricReason
        }
      };
    })
    .filter(Boolean)
    .sort((a, b) =>
      a.rank.group - b.rank.group
      || a.rank.metricPenalty - b.rank.metricPenalty
      || a.rank.distance - b.rank.distance);
  relayLog("fallback-candidates", {
    userId: user?.id || "",
    userExpiresAt: user?.expiresAt || "",
    currentPool: poolLogInfo(currentSubscription),
    candidates: candidates.map(candidate => ({
      pool: poolLogInfo(candidate.item),
      rank: candidate.rank
    }))
  });
  return candidates.map(candidate => candidate.item);
}

async function findFallbackSubscription(user, currentSubscription) {
  const errors = [];
  relayLog("fallback-search-start", {
    userId: user?.id || "",
    currentPool: poolLogInfo(currentSubscription)
  });
  for (const candidate of fallbackCandidates(user, currentSubscription)) {
    relayLog("fallback-candidate-validate-start", {
      userId: user?.id || "",
      candidatePool: poolLogInfo(candidate)
    });
    try {
      const liveConfig = await fetchLivePoolConfig(candidate);
      relayLog("fallback-candidate-validate-ok", {
        userId: user?.id || "",
        candidatePool: poolLogInfo(candidate),
        liveConfig: {
          status: liveConfig.status,
          client: liveConfig.client,
          score: liveConfig.score,
          bodyLength: liveConfig.bodyLength,
          subscriptionUserinfo: liveConfig.subscriptionUserinfo
        }
      });
      return { subscription: candidate, liveConfig, errors };
    } catch (error) {
      relayLog("fallback-candidate-validate-failed", {
        userId: user?.id || "",
        candidatePool: poolLogInfo(candidate),
        error: error.message,
        attempts: error.attempts || []
      });
      errors.push({
        subscriptionId: candidate.id,
        subscriptionLabel: subscriptionLogLabel(candidate),
        error: error.message
      });
    }
  }
  relayLog("fallback-search-empty", {
    userId: user?.id || "",
    currentPool: poolLogInfo(currentSubscription),
    errors
  });
  return { subscription: null, liveConfig: null, errors };
}

async function switchUserSubscription(user, fromSubscription, toSubscription, reason, req, target = "") {
  const log = createUserLog({
    event: "subscription-request",
    status: "switched",
    reason,
    fromSubscription,
    toSubscription,
    req,
    target
  });
  user.subscriptionId = toSubscription.id;
  user.lastFallbackAt = log.at;
  user.lastFallbackFromSubscriptionId = log.fromSubscriptionId;
  user.lastFallbackReason = reason;
  appendUserLogToUser(user, log);
  user.fallbackLogs = dedupeUserLogs([log, ...(Array.isArray(user.fallbackLogs) ? user.fallbackLogs : [])]).slice(0, 50);
  user.updatedAt = log.at;
  await saveUsers();
  relayLog("fallback-switch-saved", {
    userId: user?.id || "",
    log,
    nextSubscriptionId: user.subscriptionId
  });
  return log;
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
  await Promise.all(subscriptions.map(item => Promise.all([
    refreshSubscription(item),
    refreshPoolConfigCache(item, { force })
  ])));
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

function yamlString(value) {
  return JSON.stringify(String(value));
}

function buildUserInfoNodes(user) {
  const nodes = [];
  const expires = user.expiresAt ? new Date(user.expiresAt) : null;
  if (expires && !Number.isNaN(expires.getTime())) {
    const remaining = Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 86400000));
    nodes.push(`到期: ${expires.toISOString().slice(0, 10)} | 剩余 ${remaining} 天`);
  }
  const level = user.level || (Number(user.actualPaid) <= 300 ? "VIP 1" : Number(user.actualPaid) <= 1000 ? "VIP 2" : "VIP 3");
  const group = (user.group || "pro").toUpperCase();
  nodes.push(`${typeof level === "string" && level.startsWith("vip") ? level.replace("vip", "VIP ") : level} | ${group}`);
  return nodes;
}

function injectPlaceholderNodes(bodyBuffer, user) {
  const useDefault = user.useDefaultPlaceholder !== false;
  const showUserInfo = user.showUserInfo !== false;
  const defaultGroup = useDefault ? placeholderNodes.find(p => p.tag === "default") : null;
  const customGroup = user.placeholderTag && user.placeholderTag !== "default"
    ? placeholderNodes.find(p => p.tag === user.placeholderTag) : null;
  const defaultNodes = defaultGroup?.nodes?.length ? defaultGroup.nodes : [];
  const customNodes = customGroup?.nodes?.length ? customGroup.nodes : [];
  const userInfoNodes = showUserInfo ? buildUserInfoNodes(user) : [];
  if (!defaultNodes.length && !customNodes.length && !userInfoNodes.length) return bodyBuffer;
  try {
    const text = bodyBuffer.toString("utf8");
    const doc = yaml.load(text);
    if (!doc || typeof doc !== "object") return bodyBuffer;
    if (!Array.isArray(doc.proxies)) doc.proxies = [];
    const allNames = [...userInfoNodes, ...defaultNodes, ...customNodes];
    const firstProxy = doc.proxies[0];
    const allProxies = allNames.map(nodeName => {
      if (firstProxy) return { ...firstProxy, name: nodeName };
      return { name: nodeName, type: "ss", server: "127.0.0.1", port: 1, cipher: "aes-128-gcm", password: "placeholder" };
    });
    doc.proxies.unshift(...allProxies);
    if (Array.isArray(doc["proxy-groups"])) {
      for (const pg of doc["proxy-groups"]) {
        if (Array.isArray(pg.proxies)) {
          pg.proxies.unshift(...allNames);
        }
      }
    }
    return Buffer.from(yaml.dump(doc, { lineWidth: -1, noRefs: true }), "utf8");
  } catch {
    return bodyBuffer;
  }
}

function placeholderSubscription(user, nodeName) {
  return {
    contentType: "application/yaml; charset=utf-8",
    body: [
      "mixed-port: 7890",
      "allow-lan: false",
      "mode: rule",
      "log-level: info",
      "proxies:",
      `  - name: ${yamlString(nodeName)}`,
      "    type: ss",
      "    server: 127.0.0.1",
      "    port: 1",
      "    cipher: aes-128-gcm",
      "    password: notice",
      "proxy-groups:",
      "  - name: PROXY",
      "    type: select",
      "    proxies:",
      `      - ${yamlString(nodeName)}`,
      "rules:",
      "  - MATCH,PROXY",
      ""
    ].join("\n")
  };
}

function expiredPlaceholderSubscription(user) {
  return placeholderSubscription(user, "\u8ba2\u9605\u5df2\u5230\u671f-\u8bf7\u8054\u7cfb\u5ba2\u670d");
}

function unavailablePoolPlaceholderSubscription(user) {
  return placeholderSubscription(user, "\u6682\u65e0\u53ef\u7528\u6c60-\u8bf7\u8054\u7cfb\u5ba2\u670d");
}

function disabledCustomUrlPlaceholderSubscription(user) {
  return placeholderSubscription(user, "\u8be5URL\u672a\u542f\u7528-\u8bf7\u8054\u7cfb\u5ba2\u670d");
}

function sendExpiredPlaceholderSubscription(res, user) {
  const placeholder = expiredPlaceholderSubscription(user);
  res.writeHead(200, {
    "content-type": placeholder.contentType,
    "cache-control": "no-store, max-age=0",
    "pragma": "no-cache",
    "expires": "0"
  });
  res.end(placeholder.body);
}

function sendUnavailablePoolPlaceholderSubscription(res, user) {
  const placeholder = unavailablePoolPlaceholderSubscription(user);
  res.writeHead(200, {
    "content-type": placeholder.contentType,
    "cache-control": "no-store, max-age=0",
    "pragma": "no-cache",
    "expires": "0"
  });
  res.end(placeholder.body);
}

function sendDisabledCustomUrlPlaceholderSubscription(res, user) {
  const placeholder = disabledCustomUrlPlaceholderSubscription(user);
  res.writeHead(200, {
    "content-type": placeholder.contentType,
    "cache-control": "no-store, max-age=0",
    "pragma": "no-cache",
    "expires": "0"
  });
  res.end(placeholder.body);
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
    "expires": "0",
    "content-disposition": "attachment; filename*=UTF-8''NEXORA"
  };
  for (const name of ["content-type", "subscription-userinfo", "profile-update-interval"]) {
    const value = response.headers.get(name);
    if (value) headers[name] = value;
  }
  if (!headers["content-type"]) headers["content-type"] = "text/plain; charset=utf-8";
  return headers;
}

async function fallbackToUsableSubscription(user, currentSubscription, reason, req, target = "") {
  const fallback = await findFallbackSubscription(user, currentSubscription);
  if (!fallback.subscription) return fallback;
  await switchUserSubscription(user, currentSubscription, fallback.subscription, reason, req, target);
  console.log(`[relay] fallback switched user=${user.id} from=${currentSubscription?.id || ""} to=${fallback.subscription.id} reason=${reason}`);
  return fallback;
}

async function findDirectFallbackSubscription(user, currentSubscription, req) {
  const errors = [];
  const headers = forwardedSubscriptionHeaders(req);
  relayLog("direct-fallback-search-start", {
    userId: user?.id || "",
    currentPool: poolLogInfo(currentSubscription),
    forwardedHeaders: headersForLog(headers)
  });
  for (const candidate of fallbackCandidates(user, currentSubscription)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    relayLog("direct-fallback-request", {
      userId: user?.id || "",
      candidatePool: poolLogInfo(candidate),
      method: "GET",
      url: candidate.url,
      headers: headersForLog(headers)
    });
    try {
      const response = await fetch(candidate.url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers
      });
      if (!response.ok) throw new Error(`Fallback pool URL returned HTTP ${response.status}`);
      const body = Buffer.from(await response.arrayBuffer());
      relayLog("direct-fallback-response-ok", {
        userId: user?.id || "",
        candidatePool: poolLogInfo(candidate),
        status: response.status,
        headers: responseHeadersForLog(response),
        bodyLength: body.length,
        bodyPreview: bodyPreview(body.toString("utf8"))
      });
      return {
        subscription: candidate,
        body,
        headers: copyUpstreamHeaders(response),
        errors
      };
    } catch (error) {
      relayLog("direct-fallback-response-failed", {
        userId: user?.id || "",
        candidatePool: poolLogInfo(candidate),
        errorName: error.name,
        errorMessage: error.message
      });
      errors.push({
        subscriptionId: candidate.id,
        subscriptionLabel: subscriptionLogLabel(candidate),
        error: error.name === "AbortError" ? "Fallback pool URL request timed out" : error.message
      });
    } finally {
      clearTimeout(timer);
    }
  }
  relayLog("direct-fallback-search-empty", {
    userId: user?.id || "",
    currentPool: poolLogInfo(currentSubscription),
    errors
  });
  return { subscription: null, body: null, headers: null, errors };
}

async function handleRelaySubscription(req, res, token) {
  const relayRequestId = crypto.randomBytes(6).toString("hex");
  relayLog("request-start", {
    relayRequestId,
    method: req.method,
    url: req.url,
    tokenPrefix: String(token || "").slice(0, 8),
    headers: headersForLog(req.headers)
  });
  await loadLatestData();
  ensureUserRelayTokens();

  const user = users.find(item => item.subscriptionToken === token);
  if (!user) {
    relayLog("user-not-found", {
      relayRequestId,
      tokenPrefix: String(token || "").slice(0, 8)
    });
    sendSubscriptionMessage(res, 404, "订阅链接不存在或已被删除，请联系客服。");
    return;
  }

  const now = Date.now();
  const expiresAtTime = user?.expiresAt ? new Date(user.expiresAt).getTime() : NaN;
  const expired = isUserExpired(user, now);
  relayLog("user-date-check", {
    relayRequestId,
    userId: user.id,
    userLabel: user.userId || user.wechatName || "",
    nowIso: new Date(now).toISOString(),
    expiresAt: user.expiresAt || "",
    expiresAtTime: Number.isFinite(expiresAtTime) ? expiresAtTime : null,
    expired,
    duration: user.duration || "",
    purchasedAt: user.purchasedAt || ""
  });
  if (expired) {
    relayLog("response-placeholder-expired", {
      relayRequestId,
      userId: user.id
    });
    await recordUserLog(user, {
      status: "blocked",
      reason: "user-expired",
      fromSubscription: subscriptions.find(item => item.id === user.subscriptionId),
      req,
      stage: "user-date-check",
      message: "\u7528\u6237\u8ba2\u9605\u5df2\u5230\u671f\uff0c\u672a\u6267\u884c\u81ea\u52a8\u6362\u6c60\u3002"
    });
    sendExpiredPlaceholderSubscription(res, user);
    return;
  }

  let subscription = subscriptions.find(item => item.id === user.subscriptionId);
  const sc = (() => {
    // 用户可显式选择直链模式，绕过订阅转换
    if (user.outputMode === "direct") return null;
    const preset = presets.find(p => p.id === "default");
    if (!preset || !preset.target) return null;
    const base = { target: preset.target, config: preset.config || "", emoji: preset.emoji !== false, udp: preset.udp !== false, scv: Boolean(preset.scv), sort: Boolean(preset.sort), include: "", exclude: "", rename: "" };
    const sub = subscriptions.find(s => s.id === user.subscriptionId);
    const v = vendors.find(v => v.name === sub?.serviceProvider);
    if (v) {
      if (v.overrideExclude) base.exclude = v.overrideExclude;
      if (v.overrideInclude) base.include = v.overrideInclude;
      if (v.overrideRename) base.rename = v.overrideRename;
    }
    return base;
  })();
  let precheckedLiveConfig = null;
  const initialFallbackReason = !subscription?.url ? "pool-missing" : (sc?.target ? poolMetricUnavailableReason(subscription) : "");
  relayLog("current-pool-selected", {
    relayRequestId,
    userId: user.id,
    useSubconverter: Boolean(sc?.target),
    subconverterConfig: sc || null,
    currentPool: poolLogInfo(subscription),
    initialFallbackReason
  });
  if (!sc?.target && !subscription?.url) {
    relayLog("response-placeholder-pool-missing-before-converter", {
      relayRequestId,
      userId: user.id,
      currentPool: poolLogInfo(subscription)
    });
    await recordUserLog(user, {
      status: "no_usable_pool",
      reason: "pool-missing",
      fromSubscription: subscription,
      req,
      stage: "pool-url-check",
      message: "\u7528\u6237\u5f53\u524d\u7ed1\u5b9a\u7684\u6c60 URL \u4e0d\u5b58\u5728\uff0c\u672a\u6267\u884c\u81ea\u52a8\u6362\u6c60\u3002"
    });
    sendUnavailablePoolPlaceholderSubscription(res, user);
    return;
  }
  if (!sc?.target) {
    relayLog("response-placeholder-custom-url-disabled", {
      relayRequestId,
      userId: user.id,
      currentPool: poolLogInfo(subscription)
    });
    await recordUserLog(user, {
      status: "blocked",
      reason: "custom-url-disabled",
      fromSubscription: subscription,
      req,
      stage: "output-mode-check",
      message: "\u5f53\u524d\u8ba2\u9605\u94fe\u63a5\u672a\u542f\u7528\uff0c\u672a\u6267\u884c\u81ea\u52a8\u6362\u6c60\u3002"
    });
    sendDisabledCustomUrlPlaceholderSubscription(res, user);
    return;
  }
  if (initialFallbackReason) {
    if (subscription?.url) {
      try {
        precheckedLiveConfig = await fetchLivePoolConfig(subscription);
        relayLog("current-pool-live-precheck-ok", {
          relayRequestId,
          userId: user.id,
          reason: initialFallbackReason,
          pool: poolLogInfo(subscription),
          liveConfig: {
            status: precheckedLiveConfig.status,
            client: precheckedLiveConfig.client,
            score: precheckedLiveConfig.score,
            bodyLength: precheckedLiveConfig.bodyLength,
            subscriptionUserinfo: precheckedLiveConfig.subscriptionUserinfo
          }
        });
        await recordUserLog(user, {
          status: "kept_current",
          reason: initialFallbackReason,
          fromSubscription: subscription,
          req,
          target: sc?.target || "",
          stage: "current-pool-live-precheck",
          message: "\u539f\u6c60\u6307\u6807\u663e\u793a\u4e0d\u53ef\u7528\uff0c\u4f46\u5b9e\u65f6\u83b7\u53d6\u6210\u529f\uff0c\u7ee7\u7eed\u4f7f\u7528\u539f\u6c60\u3002"
        });
      } catch (error) {
        relayLog("current-pool-live-precheck-failed", {
          relayRequestId,
          userId: user.id,
          reason: initialFallbackReason,
          pool: poolLogInfo(subscription),
          error: error.message,
          attempts: error.attempts || []
        });
      }
    }
    if (!precheckedLiveConfig) {
      const fallback = await fallbackToUsableSubscription(user, subscription, initialFallbackReason, req, sc?.target || "");
      if (!fallback.subscription) {
        relayLog("response-placeholder-unavailable", {
          relayRequestId,
          userId: user.id,
          stage: "initial-fallback",
          reason: initialFallbackReason,
          fallbackErrors: fallback.errors || []
        });
        await recordUserLog(user, {
          status: "no_usable_pool",
          reason: initialFallbackReason,
          fromSubscription: subscription,
          req,
          target: sc?.target || "",
          stage: "initial-fallback",
          message: "\u539f\u6c60\u4e0d\u53ef\u7528\uff0c\u4f46\u672a\u627e\u5230\u53ef\u81ea\u52a8\u5207\u6362\u7684\u5907\u7528\u6c60\u3002",
          details: { fallbackErrors: fallback.errors || [] }
        });
        sendUnavailablePoolPlaceholderSubscription(res, user);
        return;
      }
      subscription = fallback.subscription;
      precheckedLiveConfig = fallback.liveConfig;
      relayLog("current-pool-replaced-by-fallback", {
        relayRequestId,
        userId: user.id,
        reason: initialFallbackReason,
        nextPool: poolLogInfo(subscription)
      });
    }
  }
  if (!subscription?.url) {
    relayLog("response-error-no-pool-url", {
      relayRequestId,
      userId: user.id,
      currentPool: poolLogInfo(subscription)
    });
    await recordUserLog(user, {
      status: "no_usable_pool",
      reason: "pool-missing",
      fromSubscription: subscription,
      req,
      target: sc?.target || "",
      stage: "pool-url-check",
      message: "\u7528\u6237\u5f53\u524d\u7ed1\u5b9a\u7684\u6c60 URL \u4e0d\u5b58\u5728\u3002"
    });
    sendSubscriptionMessage(res, 503, "订阅暂时不可用，请联系客服处理。");
    return;
  }

  // subconverter 路径：用户配置了 target 且服务端有 SUB_CONVERTER_URL
  if (sc?.target && !SUB_CONVERTER_URL) {
    relayLog("subconverter-not-configured", {
      relayRequestId,
      userId: user.id,
      target: sc.target
    });
    await recordUserLog(user, {
      status: "failed",
      reason: "subconverter-not-configured",
      fromSubscription: subscription,
      req,
      target: sc.target,
      stage: "subconverter-config-check",
      message: "\u5df2\u9009\u62e9\u8ba2\u9605\u8f6c\u6362\u6a21\u5f0f\uff0c\u4f46\u670d\u52a1\u7aef\u672a\u914d\u7f6e SUB_CONVERTER_URL\u3002"
    });
    sendSubscriptionMessage(res, 503, "服务端未配置 SUB_CONVERTER_URL，无法进行订阅转换。请联系管理员。");
    return;
  }
  if (sc?.target && SUB_CONVERTER_URL) {
    relayLog("subconverter-flow-start", {
      relayRequestId,
      userId: user.id,
      pool: poolLogInfo(subscription),
      config: sc
    });
    let liveConfig = precheckedLiveConfig;
    try {
      if (!liveConfig) liveConfig = await fetchLivePoolConfig(subscription);
    } catch (error) {
      relayLog("subconverter-current-live-fetch-failed", {
        relayRequestId,
        userId: user.id,
        pool: poolLogInfo(subscription),
        error: error.message,
        attempts: error.attempts || []
      });
      const fallback = await fallbackToUsableSubscription(user, subscription, "pool-fetch-failed", req, sc.target);
      if (!fallback.subscription) {
        relayLog("response-placeholder-unavailable", {
          relayRequestId,
          userId: user.id,
          stage: "subconverter-live-fetch",
          reason: "pool-fetch-failed",
          fallbackErrors: fallback.errors || []
        });
        await recordUserLog(user, {
          status: "no_usable_pool",
          reason: "pool-fetch-failed",
          fromSubscription: subscription,
          req,
          target: sc.target,
          stage: "subconverter-live-fetch",
          message: "\u539f\u6c60 URL \u5b9e\u65f6\u83b7\u53d6\u5931\u8d25\uff0c\u4e14\u672a\u627e\u5230\u53ef\u81ea\u52a8\u5207\u6362\u7684\u5907\u7528\u6c60\u3002",
          details: { fallbackErrors: fallback.errors || [] }
        });
        sendUnavailablePoolPlaceholderSubscription(res, user);
        return;
      }
      subscription = fallback.subscription;
      liveConfig = fallback.liveConfig;
      relayLog("subconverter-using-fallback-pool", {
        relayRequestId,
        userId: user.id,
        pool: poolLogInfo(subscription),
        liveConfig: {
          status: liveConfig.status,
          client: liveConfig.client,
          score: liveConfig.score,
          bodyLength: liveConfig.bodyLength,
          subscriptionUserinfo: liveConfig.subscriptionUserinfo
        }
      });
    }
    const liveConfigId = registerLivePoolConfig(liveConfig);
    cleanupLivePoolConfigs();
    relayLog("subconverter-live-config-registered", {
      relayRequestId,
      userId: user.id,
      pool: poolLogInfo(subscription),
      liveConfigId,
      liveConfigTtlMs: LIVE_POOL_CONFIG_TTL_MS,
      bodyLength: liveConfig.bodyLength,
      bodyPreview: bodyPreview(liveConfig.body)
    });
    const liveConfigUrl = `http://127.0.0.1:${PORT}/api/internal/pool-live/${liveConfigId}?token=${encodeURIComponent(INTERNAL_TOKEN)}`;
    const params = new URLSearchParams({ target: sc.target, url: liveConfigUrl });
    if (sc.config) params.set("config", sc.config);
    if (sc.include) params.set("include", sc.include);
    if (sc.exclude) params.set("exclude", sc.exclude);
    if (sc.emoji !== undefined) params.set("emoji", String(sc.emoji));
    if (sc.udp !== undefined) params.set("udp", String(sc.udp));
    if (sc.scv !== undefined) params.set("scv", String(sc.scv));
    if (sc.sort !== undefined) params.set("sort", String(sc.sort));
    if (sc.rename) params.set("rename", sc.rename);
    const subUrl = `${SUB_CONVERTER_URL}/sub?${params.toString()}`;
    relayLog("subconverter-request", {
      relayRequestId,
      userId: user.id,
      url: subUrl.replace(encodeURIComponent(INTERNAL_TOKEN), "[redacted]"),
      params: {
        ...Object.fromEntries(params.entries()),
        url: liveConfigUrl.replace(encodeURIComponent(INTERNAL_TOKEN), "[redacted]")
      },
      liveConfigUrl: liveConfigUrl.replace(encodeURIComponent(INTERNAL_TOKEN), "[redacted]")
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(subUrl, { signal: controller.signal });
      relayLog("subconverter-response", {
        relayRequestId,
        userId: user.id,
        ok: response.ok,
        status: response.status,
        headers: responseHeadersForLog(response)
      });
      if (!response.ok) {
        const text = await response.text();
        relayLog("subconverter-response-error-body", {
          relayRequestId,
          userId: user.id,
          bodyLength: text.length,
          bodyPreview: bodyPreview(text)
        });
        await recordUserLog(user, {
          status: "failed",
          reason: "subconverter-failed",
          fromSubscription: subscription,
          req,
          target: sc.target,
          stage: "subconverter-response",
          message: `Subconverter failed (${response.status}).`,
          details: { status: response.status, bodyPreview: bodyPreview(text) }
        });
        sendSubscriptionMessage(res, 502, `Subconverter failed (${response.status}): ${text.slice(0, 200)}`);
        return;
      }
      const body = Buffer.from(await response.arrayBuffer());
      const finalBody = injectPlaceholderNodes(body, user);
      relayLog("response-subconverter-ok", {
        relayRequestId,
        userId: user.id,
        status: response.status,
        contentType: response.headers.get("content-type") || "text/plain; charset=utf-8",
        bodyLength: finalBody.length,
        bodyPreview: bodyPreview(finalBody.toString("utf8"))
      });
      res.writeHead(response.status, {
        "content-type": response.headers.get("content-type") || "text/plain; charset=utf-8",
        "content-disposition": "attachment; filename*=UTF-8''NEXORA",
        "cache-control": "no-store, max-age=0",
        "pragma": "no-cache",
        "expires": "0",
        ...(liveConfig.subscriptionUserinfo && user.blockUserinfo === false ? { "subscription-userinfo": liveConfig.subscriptionUserinfo } : {})
      });
      res.end(finalBody);
    } catch (error) {
      relayLog("subconverter-request-error", {
        relayRequestId,
        userId: user.id,
        errorName: error.name,
        errorMessage: error.message
      });
      await recordUserLog(user, {
        status: "failed",
        reason: error.name === "AbortError" ? "subconverter-timeout" : "subconverter-request-failed",
        fromSubscription: subscription,
        req,
        target: sc.target,
        stage: "subconverter-request",
        message: error.name === "AbortError" ? "Subconverter request timed out." : error.message
      });
      sendSubscriptionMessage(res, 502, error.name === "AbortError"
        ? "Subconverter request timed out. Please retry."
        : `Subconverter request failed: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const directHeaders = forwardedSubscriptionHeaders(req);
  relayLog("direct-current-request", {
    relayRequestId,
    userId: user.id,
    pool: poolLogInfo(subscription),
    method: "GET",
    url: subscription.url,
    headers: headersForLog(directHeaders)
  });
  try {
    const response = await fetch(subscription.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: directHeaders
    });
    if (!response.ok) throw new Error(`Pool URL returned HTTP ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    relayLog("direct-current-response-ok", {
      relayRequestId,
      userId: user.id,
      pool: poolLogInfo(subscription),
      status: response.status,
      headers: responseHeadersForLog(response),
      bodyLength: body.length,
      bodyPreview: bodyPreview(body.toString("utf8"))
    });
    res.writeHead(response.status, copyUpstreamHeaders(response));
    res.end(body);
  } catch (error) {
    relayLog("direct-current-response-failed", {
      relayRequestId,
      userId: user.id,
      pool: poolLogInfo(subscription),
      errorName: error.name,
      errorMessage: error.message
    });
    const fallback = await findDirectFallbackSubscription(user, subscription, req);
    if (!fallback.subscription) {
      relayLog("response-placeholder-unavailable", {
        relayRequestId,
        userId: user.id,
        stage: "direct-fallback",
        reason: "pool-fetch-failed",
        fallbackErrors: fallback.errors || []
      });
      await recordUserLog(user, {
        status: "no_usable_pool",
        reason: "pool-fetch-failed",
        fromSubscription: subscription,
        req,
        stage: "direct-fallback",
        message: "\u539f\u6c60 URL \u76f4\u8fde\u83b7\u53d6\u5931\u8d25\uff0c\u4e14\u672a\u627e\u5230\u53ef\u81ea\u52a8\u5207\u6362\u7684\u5907\u7528\u6c60\u3002",
        details: { fallbackErrors: fallback.errors || [] }
      });
      sendUnavailablePoolPlaceholderSubscription(res, user);
      return;
    }
    await switchUserSubscription(user, subscription, fallback.subscription, "pool-fetch-failed", req);
    relayLog("response-direct-fallback-ok", {
      relayRequestId,
      userId: user.id,
      fromPool: poolLogInfo(subscription),
      toPool: poolLogInfo(fallback.subscription),
      bodyLength: fallback.body.length,
      bodyPreview: bodyPreview(fallback.body.toString("utf8"))
    });
    res.writeHead(200, fallback.headers);
    res.end(fallback.body);
  } finally {
    clearTimeout(timer);
  }
}

async function refreshAll() {
  for (const item of subscriptions) {
    await refreshSubscription(item);
    await refreshPoolConfigCache(item);
  }
  await saveData();
  await runLowTrafficCheck();
}

async function runLowTrafficCheck() {
  try {
    if (!notifier.isConfigured()) return;
    await notifier.checkAndNotifyLowTraffic(subscriptions, alertStore, { logger: console });
  } catch (error) {
    console.error("Alert check failed:", error.message);
  }
}

async function handleApi(req, res, pathname) {
  const relayApiMatch = pathname.match(/^\/api\/sub\/([^/]+)$/);
  if (relayApiMatch && req.method === "GET") {
    await handleRelaySubscription(req, res, relayApiMatch[1]);
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

  const internalLiveMatch = pathname.match(/^\/api\/internal\/pool-live\/([^/]+)$/);
  if (internalLiveMatch && req.method === "GET") {
    const url = new URL(`http://x${pathname}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`);
    relayLog("internal-live-request", {
      id: internalLiveMatch[1],
      method: req.method,
      url: req.url.replace(encodeURIComponent(INTERNAL_TOKEN), "[redacted]"),
      tokenOk: url.searchParams.get("token") === INTERNAL_TOKEN,
      headers: headersForLog(req.headers)
    });
    if (url.searchParams.get("token") !== INTERNAL_TOKEN) {
      relayLog("internal-live-forbidden", {
        id: internalLiveMatch[1]
      });
      res.writeHead(403, { "content-type": "text/plain" });
      res.end("Forbidden");
      return;
    }
    const config = readLivePoolConfig(internalLiveMatch[1]);
    if (!config) {
      relayLog("internal-live-expired-or-missing", {
        id: internalLiveMatch[1]
      });
      res.writeHead(410, { "content-type": "text/plain; charset=utf-8" });
      res.end("Live YAML expired before subconverter could fetch it. Please retry.");
      return;
    }
    relayLog("internal-live-response-ok", {
      id: internalLiveMatch[1],
      contentType: config.contentType || "text/plain; charset=utf-8",
      subscriptionUserinfo: config.subscriptionUserinfo || "",
      bodyLength: String(config.body || "").length,
      bodyPreview: bodyPreview(config.body)
    });
    res.writeHead(200, {
      "content-type": config.contentType || "text/plain; charset=utf-8",
      ...(config.subscriptionUserinfo ? { "subscription-userinfo": config.subscriptionUserinfo } : {})
    });
    res.end(config.body);
    return;
  }

  // 内部端点：供 subconverter 拉取池 URL 的缓存 YAML（不需要 session，用 INTERNAL_TOKEN 鉴权）
  const internalCacheMatch = pathname.match(/^\/api\/internal\/pool-cache\/([^/]+)$/);
  if (internalCacheMatch && req.method === "GET") {
    const url = new URL(`http://x${pathname}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`);
    if (url.searchParams.get("token") !== INTERNAL_TOKEN) {
      res.writeHead(403, { "content-type": "text/plain" });
      res.end("Forbidden");
      return;
    }
    await loadLatestData();
    const sub = subscriptions.find(s => s.id === internalCacheMatch[1]);
    if (!sub) { res.writeHead(404); res.end("Not found"); return; }
    const body = await readPoolCachedBody(sub);
    if (!body) { res.writeHead(503); res.end("Cache empty"); return; }
    res.writeHead(200, {
      "content-type": sub.cachedConfig?.contentType || "text/plain; charset=utf-8",
      ...(sub.cachedConfig?.subscriptionUserinfo ? { "subscription-userinfo": sub.cachedConfig.subscriptionUserinfo } : {})
    });
    res.end(body);
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
    const services = {};

    // Database check
    try {
      if (dataStore.kind === "postgres" && dataStore.pool) {
        const t0 = Date.now();
        await dataStore.pool.query("SELECT 1");
        services.database = { status: "ok", latency: Date.now() - t0 };
      } else {
        services.database = { status: "ok", kind: "json" };
      }
    } catch (e) {
      services.database = { status: "error", message: e.message };
    }

    // Subconverter check
    if (SUB_CONVERTER_URL) {
      try {
        const t0 = Date.now();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const resp = await fetch(`${SUB_CONVERTER_URL}/version`, { signal: ctrl.signal });
        clearTimeout(timer);
        services.subconverter = { status: resp.ok ? "ok" : "error", latency: Date.now() - t0, url: SUB_CONVERTER_URL };
      } catch (e) {
        services.subconverter = { status: "error", message: e.message, url: SUB_CONVERTER_URL };
      }
    } else {
      services.subconverter = { status: "unconfigured" };
    }

    const allOk = Object.values(services).every(s => s.status === "ok" || s.status === "unconfigured");
    sendJson(res, 200, {
      ok: allOk,
      dataStore: dataStore.kind,
      subscriptions: subscriptions.length,
      users: users.length,
      refreshedEveryMs: REFRESH_INTERVAL_MS,
      services
    });
    return;
  }

  if (pathname === "/api/cron/refresh" && (req.method === "GET" || req.method === "POST")) {
    const expectedSecret = process.env.CRON_SECRET || "";
    if (!expectedSecret) {
      sendJson(res, 503, { error: "CRON_SECRET 未配置，接口已禁用。" });
      return;
    }
    const authorization = req.headers.authorization || "";
    if (authorization !== `Bearer ${expectedSecret}`) {
      sendJson(res, 401, { error: "Unauthorized." });
      return;
    }

    await loadLatestData();
    await refreshAll();
    sendJson(res, 200, { ok: true, refreshed: subscriptions.length });
    return;
  }

  if (!requireAuth(req, res)) return;
  await loadLatestData();

  if (pathname === "/api/alerts/status" && req.method === "GET") {
    const cfg = notifier.getMailerConfig();
    sendJson(res, 200, {
      configured: notifier.isConfigured(),
      to: cfg.to,
      from: cfg.from ? `${cfg.from.slice(0, 3)}***${cfg.from.slice(cfg.from.indexOf("@"))}` : "",
      threshold: cfg.threshold,
      thresholdHuman: notifier.formatBytes(cfg.threshold),
      cooldownMs: cfg.cooldownMs
    });
    return;
  }

  if (pathname === "/api/alerts/test" && req.method === "POST") {
    try {
      if (!notifier.isConfigured()) {
        sendJson(res, 400, { error: "未配置 ALERT_EMAIL_FROM / ALERT_EMAIL_PASS。" });
        return;
      }
      const cfg = notifier.getMailerConfig();
      await notifier.sendMail({
        subject: "[XELA] 告警测试邮件",
        text: `这是一封测试邮件。告警阈值：${notifier.formatBytes(cfg.threshold)}（剩余流量低于此值时会通知到 ${cfg.to}）。`
      });
      sendJson(res, 200, { ok: true, to: cfg.to });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/alerts/check" && req.method === "POST") {
    const result = await notifier.checkAndNotifyLowTraffic(subscriptions, alertStore, { logger: console });
    sendJson(res, 200, { ok: true, ...result });
    return;
  }

  if (pathname === "/api/subscriptions" && req.method === "GET") {
    const customerCounts = customerCountBySubscriptionId();
    sendJson(res, 200, subscriptions.map(item => publicItem(item, customerCounts.get(item.id) || 0)));
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
      // 不在此处同步抓取订阅指标：抓取需请求外部链接、可能耗时数十秒，会阻塞创建请求。
      // 改为保存后由前端显式调用 /refresh 实时拉取流量/到期信息。
      await saveData();
      sendJson(res, 201, publicItem(normalized));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/subscriptions/cache-refresh" && req.method === "POST") {
    await refreshAll();
    sendJson(res, 200, { ok: true, refreshed: subscriptions.length });
    return;
  }

  if (pathname === "/api/subscriptions/recommend" && req.method === "POST") {
    const payload = await readJson(req);
    const expiresAt = payload.expiresAt || calculateExpiry(payload.purchasedAt || new Date().toISOString(), payload.duration || "monthly");
    if (!expiresAt) {
      sendJson(res, 400, { error: "参数不正确。" });
      return;
    }
    const recommendation = recommendSubscriptionForExpiry(expiresAt, {
      ignoredUserId: payload.ignoredUserId || ""
    });
    sendJson(res, 200, {
      subscription: recommendation.subscription ? publicItem(recommendation.subscription) : null,
      reason: recommendation.reason
    });
    return;
  }


  if (pathname === "/api/users" && req.method === "GET") {
    const subscriptionsById = subscriptionById();
    sendJson(res, 200, users.map(user => publicUser(user, subscriptionsById)));
    return;
  }

  if (pathname === "/api/bills" && req.method === "GET") {
    const usersById = userById();
    sendJson(res, 200, bills.map(bill => publicBill(bill, usersById)).sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)));
    return;
  }

  if (pathname === "/api/users" && req.method === "POST") {
    try {
      const payload = await readJson(req);
      const item = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString()
      };
      const normalized = normalizeUser(payload, item);
      normalized.outputMode = payload.outputMode === "direct" ? "direct" : "subconverter";
      normalized.blockUserinfo = payload.blockUserinfo !== false;
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
      appendUserLogToUser(normalized, createUserLog({
        event: "user-action",
        status: "recorded",
        reason: "user-created",
        toSubscription: subscriptions.find(entry => entry.id === normalized.subscriptionId),
        req,
        message: userActionMessage("user-created"),
        details: {
          snapshot: userSnapshotForLog(normalized),
          amount: normalized.actualPaid,
          duration: normalized.duration,
          afterExpiresAt: normalized.expiresAt
        }
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
            appendBillActionLog(bill, "bill-reversed", req);
            changed += 1;
          }
        } else {
          appendBillActionLog(bill, "bill-deleted", req);
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
      const wasReversed = Boolean(bill.reversedAt);
      reverseBill(bill);
      if (!wasReversed) appendBillActionLog(bill, "bill-reversed", req);
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
      appendBillActionLog(bill, "bill-deleted", req);
      deleteBillRecord(bill);
      await saveBills();
      await saveUsers();
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  const match = pathname.match(/^\/api\/subscriptions\/([^/]+)(?:\/(refresh|debug|cache|refresh-cache))?$/);

  if (pathname === "/api/vendors" && req.method === "GET") {
    sendJson(res, 200, vendors);
    return;
  }

  if (pathname === "/api/vendors" && req.method === "POST") {
    try {
      const payload = await readJson(req);
      const name = (payload.name || "").trim();
      if (!name) { sendJson(res, 400, { error: "供应商名称不能为空。" }); return; }
      if (vendors.find(v => v.name === name)) { sendJson(res, 400, { error: "供应商已存在。" }); return; }
      const vendor = { id: `vendor-${Date.now()}`, name };
      vendors.push(vendor);
      await saveVendors();
      sendJson(res, 201, vendor);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const vendorMatch = pathname.match(/^\/api\/vendors\/([^/]+)$/);
  if (vendorMatch) {
    const vendor = vendors.find(v => v.id === vendorMatch[1]);
    if (!vendor) { sendJson(res, 404, { error: "没有找到该供应商。" }); return; }
    if (req.method === "PUT") {
      const payload = await readJson(req);
      const name = (payload.name || "").trim();
      if (name && name !== vendor.name && vendors.find(v => v.name === name)) {
        sendJson(res, 400, { error: "供应商名称已存在。" }); return;
      }
      if (name) vendor.name = name;
      if (payload.overrideExclude !== undefined) vendor.overrideExclude = String(payload.overrideExclude || "").trim();
      if (payload.overrideInclude !== undefined) vendor.overrideInclude = String(payload.overrideInclude || "").trim();
      if (payload.overrideRename !== undefined) vendor.overrideRename = String(payload.overrideRename || "").trim();
      await saveVendors();
      sendJson(res, 200, vendor);
      return;
    }
    if (req.method === "DELETE") {
      vendors = vendors.filter(v => v.id !== vendorMatch[1]);
      await saveVendors();
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  if (pathname === "/api/presets" && req.method === "GET") {
    sendJson(res, 200, presets);
    return;
  }

  if (pathname === "/api/presets" && req.method === "PUT") {
    try {
      const payload = await readJson(req);
      let preset = presets.find(p => p.id === "default");
      if (!preset) {
        preset = { id: "default" };
        presets.push(preset);
      }
      preset.target = String(payload.target || DEFAULT_SUBCONVERTER_TARGET).trim();
      preset.config = String(payload.config || "").trim();
      preset.emoji = payload.emoji !== false;
      preset.udp = payload.udp !== false;
      preset.scv = Boolean(payload.scv);
      preset.sort = Boolean(payload.sort);
      await savePresets();
      sendJson(res, 200, preset);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  // ── Pricing ──
  if (pathname === "/api/pricing" && req.method === "GET") {
    sendJson(res, 200, pricing);
    return;
  }

  if (pathname === "/api/pricing" && req.method === "PUT") {
    try {
      const payload = await readJson(req);
      if (!Array.isArray(payload)) { sendJson(res, 400, { error: "payload must be an array." }); return; }
      const GROUPS = ["basic", "pro", "ultra"];
      const DURATIONS = ["monthly", "quarterly", "half_yearly", "yearly"];
      for (const item of payload) {
        if (!GROUPS.includes(item.group)) continue;
        let row = pricing.find(r => r.group === item.group);
        if (!row) { row = { id: item.group, group: item.group }; pricing.push(row); }
        for (const dur of DURATIONS) {
          if (item[dur] !== undefined) {
            const val = Number(item[dur]);
            if (Number.isNaN(val) || val < 0) { sendJson(res, 400, { error: `${item.group}.${dur} 价格无效。` }); return; }
            row[dur] = val;
          }
        }
      }
      await savePricing();
      sendJson(res, 200, pricing);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/placeholder-nodes" && req.method === "GET") {
    sendJson(res, 200, placeholderNodes);
    return;
  }

  if (pathname === "/api/placeholder-nodes" && req.method === "POST") {
    try {
      const payload = await readJson(req);
      const tag = (payload.tag || "").trim();
      const nodes = Array.isArray(payload.nodes) ? payload.nodes.map(n => String(n).trim()).filter(Boolean) : [];
      if (!tag) { sendJson(res, 400, { error: "标签名不能为空。" }); return; }
      if (placeholderNodes.find(p => p.tag === tag)) { sendJson(res, 400, { error: "标签名已存在。" }); return; }
      const item = { id: `ph-${Date.now()}`, tag, nodes };
      placeholderNodes.push(item);
      await savePlaceholderNodes();
      sendJson(res, 201, item);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const placeholderNodeMatch = pathname.match(/^\/api\/placeholder-nodes\/([^/]+)$/);
  if (placeholderNodeMatch) {
    const item = placeholderNodes.find(p => p.id === placeholderNodeMatch[1]);
    if (!item) { sendJson(res, 404, { error: "没有找到该占位节点组。" }); return; }
    if (req.method === "PUT") {
      const payload = await readJson(req);
      const tag = (payload.tag || "").trim();
      if (tag && tag !== item.tag && placeholderNodes.find(p => p.tag === tag)) {
        sendJson(res, 400, { error: "标签名已存在。" }); return;
      }
      if (tag) item.tag = tag;
      if (Array.isArray(payload.nodes)) {
        item.nodes = payload.nodes.map(n => String(n).trim()).filter(Boolean);
      }
      await savePlaceholderNodes();
      sendJson(res, 200, item);
      return;
    }
    if (req.method === "DELETE") {
      placeholderNodes = placeholderNodes.filter(p => p.id !== placeholderNodeMatch[1]);
      await savePlaceholderNodes();
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  if (pathname === "/api/emby-vendors" && req.method === "GET") {
    sendJson(res, 200, embyVendors);
    return;
  }

  if (pathname === "/api/emby-vendors" && req.method === "POST") {
    try {
      const payload = await readJson(req);
      const name = (payload.name || "").trim();
      const website = (payload.website || "").trim();
      const servers = Array.isArray(payload.servers) ? payload.servers.map(s => ({ url: (s.url || "").trim(), label: (s.label || "").trim() })).filter(s => s.url) : [];
      if (!name) { sendJson(res, 400, { error: "Emby 供应商名称不能为空。" }); return; }
      if (!servers.length) { sendJson(res, 400, { error: "至少需要一个服务器地址。" }); return; }
      if (embyVendors.find(v => v.name === name)) { sendJson(res, 400, { error: "Emby 供应商已存在。" }); return; }
      const vendor = { id: `emby-vendor-${Date.now()}`, name, website, servers, note: (payload.note || "").trim() };
      embyVendors.push(vendor);
      await saveEmbyVendors();
      sendJson(res, 201, vendor);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const embyVendorMatch = pathname.match(/^\/api\/emby-vendors\/([^/]+)$/);
  if (embyVendorMatch) {
    const vendor = embyVendors.find(v => v.id === embyVendorMatch[1]);
    if (!vendor) { sendJson(res, 404, { error: "没有找到该 Emby 供应商。" }); return; }
    if (req.method === "GET") {
      sendJson(res, 200, vendor);
      return;
    }
    if (req.method === "PUT") {
      const payload = await readJson(req);
      const name = (payload.name || "").trim();
      if (name && name !== vendor.name && embyVendors.find(v => v.name === name)) {
        sendJson(res, 400, { error: "Emby 供应商名称已存在。" }); return;
      }
      if (name) vendor.name = name;
      if (payload.website !== undefined) vendor.website = (payload.website || "").trim();
      if (Array.isArray(payload.servers)) {
        const servers = payload.servers.map(s => ({ url: (s.url || "").trim(), label: (s.label || "").trim() })).filter(s => s.url);
        if (!servers.length) { sendJson(res, 400, { error: "至少需要一个服务器地址。" }); return; }
        vendor.servers = servers;
      }
      if (payload.note !== undefined) vendor.note = (payload.note || "").trim();
      await saveEmbyVendors();
      sendJson(res, 200, vendor);
      return;
    }
    if (req.method === "DELETE") {
      const usersUsing = embyUsers.filter(u => u.embyVendorId === embyVendorMatch[1]);
      if (usersUsing.length > 0) {
        sendJson(res, 400, { error: `该供应商正在被 ${usersUsing.length} 个 Emby 用户使用，无法删除。` });
        return;
      }
      embyVendors = embyVendors.filter(v => v.id !== embyVendorMatch[1]);
      await saveEmbyVendors();
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  if (pathname === "/api/emby-users" && req.method === "GET") {
    sendJson(res, 200, embyUsers);
    return;
  }

  if (pathname === "/api/emby-users" && req.method === "POST") {
    try {
      const payload = await readJson(req);
      const customerName = (payload.customerName || "").trim();
      const embyVendorId = (payload.embyVendorId || "").trim() || null;
      const username = (payload.username || "").trim();
      const password = (payload.password || "").trim();
      if (!customerName) { sendJson(res, 400, { error: "客户名称不能为空。" }); return; }
      if (!embyVendorId) { sendJson(res, 400, { error: "请选择 Emby 供应商。" }); return; }
      const vendor = embyVendors.find(v => v.id === embyVendorId);
      if (!vendor) { sendJson(res, 400, { error: "Emby 供应商不存在。" }); return; }
      if (!username) { sendJson(res, 400, { error: "用户名不能为空。" }); return; }
      if (!password) { sendJson(res, 400, { error: "密码不能为空。" }); return; }
      const item = {
        id: crypto.randomUUID(),
        customerName,
        embyVendorId,
        username,
        password,
        expiresAt: payload.expiresAt || null,
        purchasedAt: payload.purchasedAt || new Date().toISOString().slice(0, 10),
        cost: Number(payload.cost) || 0,
        actualPaid: Number(payload.actualPaid) || 0,
        note: (payload.note || "").trim(),
        createdAt: new Date().toISOString()
      };
      embyUsers.push(item);
      await saveEmbyUsers();
      sendJson(res, 201, item);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const embyUserMatch = pathname.match(/^\/api\/emby-users\/([^/]+)$/);
  if (embyUserMatch) {
    const item = embyUsers.find(e => e.id === embyUserMatch[1]);
    if (!item) { sendJson(res, 404, { error: "没有找到该 Emby 用户。" }); return; }
    if (req.method === "GET") {
      sendJson(res, 200, item);
      return;
    }
    if (req.method === "PUT") {
      const payload = await readJson(req);
      if (payload.customerName !== undefined) item.customerName = (payload.customerName || "").trim();
      if (payload.embyVendorId !== undefined) item.embyVendorId = (payload.embyVendorId || "").trim() || null;
      if (payload.username !== undefined) item.username = (payload.username || "").trim();
      if (payload.password !== undefined) item.password = (payload.password || "").trim();
      if (payload.expiresAt !== undefined) item.expiresAt = payload.expiresAt;
      if (payload.purchasedAt !== undefined) item.purchasedAt = payload.purchasedAt;
      if (payload.cost !== undefined) item.cost = Number(payload.cost) || 0;
      if (payload.actualPaid !== undefined) item.actualPaid = Number(payload.actualPaid) || 0;
      if (payload.note !== undefined) item.note = (payload.note || "").trim();
      await saveEmbyUsers();
      sendJson(res, 200, item);
      return;
    }
    if (req.method === "DELETE") {
      embyUsers = embyUsers.filter(e => e.id !== embyUserMatch[1]);
      await saveEmbyUsers();
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

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
        const before = userSnapshotForLog(item);
        const fromSubscription = subscriptions.find(entry => entry.id === item.subscriptionId);
        if (payload.outputMode !== undefined) item.outputMode = payload.outputMode === "direct" ? "direct" : "subconverter";
        if (payload.blockUserinfo !== undefined) item.blockUserinfo = payload.blockUserinfo !== false;
        const renewal = renewUser(item, payload);
        const toSubscription = subscriptions.find(entry => entry.id === item.subscriptionId);
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
        appendUserLogToUser(item, createUserLog({
          event: "user-action",
          status: "recorded",
          reason: "user-renewed",
          fromSubscription,
          toSubscription,
          req,
          message: userActionMessage("user-renewed", {
            amount: renewal.amount,
            duration: item.duration,
            beforeExpiresAt: renewal.beforeExpiresAt,
            afterExpiresAt: renewal.afterExpiresAt
          }),
          details: {
            amount: renewal.amount,
            duration: item.duration,
            renewedAt: renewal.renewedAt,
            beforeExpiresAt: renewal.beforeExpiresAt,
            afterExpiresAt: renewal.afterExpiresAt,
            before,
            after: userSnapshotForLog(item)
          }
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
        const before = userSnapshotForLog(item);
        const fromSubscription = subscriptions.find(entry => entry.id === item.subscriptionId);
        Object.assign(item, normalizeUser(payload, item));
        if (payload.outputMode !== undefined) item.outputMode = payload.outputMode === "direct" ? "direct" : "subconverter";
        if (payload.blockUserinfo !== undefined) item.blockUserinfo = payload.blockUserinfo !== false;
        const after = userSnapshotForLog(item);
        const changes = summarizeUserChanges(before, after);
        const toSubscription = subscriptions.find(entry => entry.id === item.subscriptionId);
        if (changes.length) {
          const poolChanged = before.subscriptionId !== after.subscriptionId;
          appendUserLogToUser(item, createUserLog({
            event: "user-action",
            status: "recorded",
            reason: poolChanged ? "manual-pool-changed" : "user-updated",
            fromSubscription,
            toSubscription,
            req,
            message: userActionMessage(poolChanged ? "manual-pool-changed" : "user-updated", {
              changes,
              fromSubscriptionLabel: subscriptionLogLabel(fromSubscription),
              toSubscriptionLabel: subscriptionLogLabel(toSubscription)
            }),
            details: { changes }
          }));
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
    const url = new URL(`http://x${req.url}`);
    const force = url.searchParams.get("force") === "true";

    try {
      const wasFresh = !force && cacheIsFresh(item.cachedConfig);
      const cache = await refreshPoolConfigCache(item, { force });
      if (!wasFresh) await saveData();
      const body = await readPoolCachedBody(item);
      sendJson(res, 200, {
        status: cache.status || null,
        client: cache.client || "",
        score: cache.score || null,
        attempts: cache.attempts || [],
        storage: wasFresh ? "cached" : "live",
        bodyFile: "",
        fetchedAt: cache.fetchedAt || null,
        contentType: cache.contentType || "",
        subscriptionUserinfo: cache.subscriptionUserinfo || "",
        error: cache.error || null,
        body: body.slice(0, 20000),
        bodyLength: cache.bodyLength || body.length,
        truncated: body.length > 20000
      });
    } catch (error) {
      sendJson(res, 502, {
        error: error.message,
        attempts: error.attempts || []
      });
    }
    return;
  }

  if (req.method === "PUT") {
    try {
      const payload = await readJson(req);
      const previousUrl = item.url;
      Object.assign(item, normalizeSubscription(payload, item));
      if (item.url !== previousUrl) {
        // 订阅链接已变更：旧 metrics/状态属于上一个链接，清空避免展示陈旧信息。
        // 实时重新拉取由前端保存后显式调用 /refresh 完成，避免保存请求长时间阻塞。
        item.metrics = null;
        item.lastCheckedAt = null;
        item.lastError = null;
        item.httpStatus = null;
        item.lastRefreshResults = null;
      }
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

const COMPRESSIBLE_EXTS = new Set([".html", ".css", ".js", ".json", ".svg", ".xml", ".txt"]);

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
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";
    const acceptEncoding = (req.headers["accept-encoding"] || "");

    // 对可压缩类型优先尝试预压缩文件（.br / .gz）
    if (COMPRESSIBLE_EXTS.has(ext)) {
      if (acceptEncoding.includes("br")) {
        try {
          const brContent = await fs.readFile(filePath + ".br");
          res.writeHead(200, { "content-type": contentType, "content-encoding": "br", "vary": "Accept-Encoding" });
          res.end(brContent);
          return;
        } catch {}
      }
      if (acceptEncoding.includes("gzip")) {
        try {
          const gzContent = await fs.readFile(filePath + ".gz");
          res.writeHead(200, { "content-type": contentType, "content-encoding": "gzip", "vary": "Accept-Encoding" });
          res.end(gzContent);
          return;
        } catch {}
      }
    }

    const content = await fs.readFile(filePath);

    // 无预压缩文件时运行时压缩（仅对可压缩类型）
    if (COMPRESSIBLE_EXTS.has(ext) && content.length > 512) {
      if (acceptEncoding.includes("br")) {
        zlib.brotliCompress(content, (err, compressed) => {
          if (!err) {
            res.writeHead(200, { "content-type": contentType, "content-encoding": "br", "vary": "Accept-Encoding" });
            res.end(compressed);
            return;
          }
          res.writeHead(200, { "content-type": contentType });
          res.end(content);
        });
        return;
      }
      if (acceptEncoding.includes("gzip")) {
        zlib.gzip(content, (err, compressed) => {
          if (!err) {
            res.writeHead(200, { "content-type": contentType, "content-encoding": "gzip", "vary": "Accept-Encoding" });
            res.end(compressed);
            return;
          }
          res.writeHead(200, { "content-type": contentType });
          res.end(content);
        });
        return;
      }
    }

    res.writeHead(200, { "content-type": contentType });
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

    console.log(`[req] ${req.method} ${url.pathname}`);
    const relayMatch = url.pathname.match(/^\/sub\/([^/]+)$/);
    if (relayMatch && req.method === "GET") {
      await handleRelaySubscription(req, res, relayMatch[1]);
    } else if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
    } else {
      await serveStatic(req, res, url.pathname);
    }
  } catch (error) {
    console.error("[500]", error);
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
  extractClashConfigBody,
  statusFor,
  toBytes,
  poolMetricUnavailableReason,
  fallbackCandidateRank,
  startOfUtcDate
});
