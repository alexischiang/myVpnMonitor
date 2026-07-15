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

function loadLocalEnv({ override = false } = {}) {
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
    if (key && (override || process.env[key] === undefined)) process.env[key] = value;
  }
}

loadLocalEnv();

const PORT = Number(process.env.PORT || 3000);
const LOCAL_DATABASE_URL = process.env.VERCEL === "1" ? "" : process.env.LOCAL_DATABASE_URL || "";
const DATABASE_URL = LOCAL_DATABASE_URL || process.env.DATABASE_URL || "";
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
  { id: "basic", group: "basic", name: "BASIC", title: "基本套餐", description: "适合轻量网页浏览和社交软件", recommended: false, traffic: "每月 100G", features: ["基础线路", "流媒体支持", "在线客服"], unavailableFeatures: ["稳定 GPT 解锁", "国际内网专线", "独享级带宽体验"], monthlyDevices: 1, quarterlyDevices: 2, half_yearlyDevices: 3, yearlyDevices: 3, monthly: 39, quarterly: 109, half_yearly: 199, yearly: 369, unlimitedMonthly: 79, unlimitedQuarterly: 219, unlimitedHalfYearly: 399, unlimitedYearly: 599 },
  { id: "pro", group: "pro", name: "PRO", title: "高级套餐", description: "优质节点与稳定流媒体体验", recommended: true, traffic: "每月 200G", features: ["优质节点", "普通专线连接", "稳定 GPT 解锁"], unavailableFeatures: ["国际内网专线", "独享级带宽体验"], monthlyDevices: 3, quarterlyDevices: 3, half_yearlyDevices: 5, yearlyDevices: 5, monthly: 49, quarterly: 129, half_yearly: 229, yearly: 429, unlimitedMonthly: 95, unlimitedQuarterly: 249, unlimitedHalfYearly: 439, unlimitedYearly: 679 },
  { id: "ultra", group: "ultra", name: "ULTRA", title: "极致套餐", description: "国际内网专线与低延迟体验", recommended: false, traffic: "每月 300G", features: ["国际内网专线", "独享级带宽体验", "专属客服支持"], unavailableFeatures: [], monthlyDevices: 1, quarterlyDevices: 2, half_yearlyDevices: 3, yearlyDevices: 3, monthly: 89, quarterly: 239, half_yearly: 449, yearly: 859, unlimitedMonthly: 129, unlimitedQuarterly: 349, unlimitedHalfYearly: 659, unlimitedYearly: 1109 }
];
function publicPricing() {
  return DEFAULT_PRICING.map(defaultRow => {
    const saved = pricing.find(item => item.group === defaultRow.group) || {};
    return { ...defaultRow, ...saved, features: Array.isArray(saved.features) ? saved.features : defaultRow.features, unavailableFeatures: Array.isArray(saved.unavailableFeatures) ? saved.unavailableFeatures : defaultRow.unavailableFeatures };
  });
}
const PAYMENT_PLAN_OPTIONS = {
  "basic-30": { planId: "basic", planName: "BASIC", optionLabel: "月付 30天", priceKey: "monthly", duration: "monthly", group: "basic", fallbackPrice: 39 },
  "basic-90": { planId: "basic", planName: "BASIC", optionLabel: "季付 90天", priceKey: "quarterly", duration: "quarterly", group: "basic", fallbackPrice: 109 },
  "basic-180": { planId: "basic", planName: "BASIC", optionLabel: "半年付 180天", priceKey: "half_yearly", duration: "half_yearly", group: "basic", fallbackPrice: 199 },
  "basic-360": { planId: "basic", planName: "BASIC", optionLabel: "年付 360天", priceKey: "yearly", duration: "yearly", group: "basic", fallbackPrice: 369 },
  "basic-unlimited-30": { planId: "basic", planName: "BASIC", optionLabel: "月付 30天 无限流量", priceKey: "unlimitedMonthly", duration: "monthly", group: "basic", unlimited: true, fallbackPrice: 79 },
  "basic-unlimited-90": { planId: "basic", planName: "BASIC", optionLabel: "季付 90天 无限流量", priceKey: "unlimitedQuarterly", duration: "quarterly", group: "basic", unlimited: true, fallbackPrice: 219 },
  "basic-unlimited-180": { planId: "basic", planName: "BASIC", optionLabel: "半年付 180天 无限流量", priceKey: "unlimitedHalfYearly", duration: "half_yearly", group: "basic", unlimited: true, fallbackPrice: 399 },
  "basic-unlimited-360": { planId: "basic", planName: "BASIC", optionLabel: "年付 360天 无限流量", priceKey: "unlimitedYearly", duration: "yearly", group: "basic", unlimited: true, fallbackPrice: 599 },
  "pro-30": { planId: "pro", planName: "PRO", optionLabel: "月付 30天", priceKey: "monthly", duration: "monthly", group: "pro", fallbackPrice: 49 },
  "pro-90": { planId: "pro", planName: "PRO", optionLabel: "季付 90天", priceKey: "quarterly", duration: "quarterly", group: "pro", fallbackPrice: 129 },
  "pro-180": { planId: "pro", planName: "PRO", optionLabel: "半年付 180天", priceKey: "half_yearly", duration: "half_yearly", group: "pro", fallbackPrice: 229 },
  "pro-360": { planId: "pro", planName: "PRO", optionLabel: "年付 360天", priceKey: "yearly", duration: "yearly", group: "pro", fallbackPrice: 429 },
  "pro-unlimited-30": { planId: "pro", planName: "PRO", optionLabel: "月付 30天 无限流量", priceKey: "unlimitedMonthly", duration: "monthly", group: "pro", unlimited: true, fallbackPrice: 95 },
  "pro-unlimited-90": { planId: "pro", planName: "PRO", optionLabel: "季付 90天 无限流量", priceKey: "unlimitedQuarterly", duration: "quarterly", group: "pro", unlimited: true, fallbackPrice: 249 },
  "pro-unlimited-180": { planId: "pro", planName: "PRO", optionLabel: "半年付 180天 无限流量", priceKey: "unlimitedHalfYearly", duration: "half_yearly", group: "pro", unlimited: true, fallbackPrice: 439 },
  "pro-unlimited-360": { planId: "pro", planName: "PRO", optionLabel: "年付 360天 无限流量", priceKey: "unlimitedYearly", duration: "yearly", group: "pro", unlimited: true, fallbackPrice: 679 },
  "ultra-30": { planId: "ultra", planName: "ULTRA", optionLabel: "月付 30天", priceKey: "monthly", duration: "monthly", group: "ultra", fallbackPrice: 89 },
  "ultra-90": { planId: "ultra", planName: "ULTRA", optionLabel: "季付 90天", priceKey: "quarterly", duration: "quarterly", group: "ultra", fallbackPrice: 239 },
  "ultra-180": { planId: "ultra", planName: "ULTRA", optionLabel: "半年付 180天", priceKey: "half_yearly", duration: "half_yearly", group: "ultra", fallbackPrice: 449 },
  "ultra-360": { planId: "ultra", planName: "ULTRA", optionLabel: "年付 360天", priceKey: "yearly", duration: "yearly", group: "ultra", fallbackPrice: 859 },
  "ultra-unlimited-30": { planId: "ultra", planName: "ULTRA", optionLabel: "月付 30天 无限流量", priceKey: "unlimitedMonthly", duration: "monthly", group: "ultra", unlimited: true, fallbackPrice: 129 },
  "ultra-unlimited-90": { planId: "ultra", planName: "ULTRA", optionLabel: "季付 90天 无限流量", priceKey: "unlimitedQuarterly", duration: "quarterly", group: "ultra", unlimited: true, fallbackPrice: 349 },
  "ultra-unlimited-180": { planId: "ultra", planName: "ULTRA", optionLabel: "半年付 180天 无限流量", priceKey: "unlimitedHalfYearly", duration: "half_yearly", group: "ultra", unlimited: true, fallbackPrice: 659 },
  "ultra-unlimited-360": { planId: "ultra", planName: "ULTRA", optionLabel: "年付 360天 无限流量", priceKey: "unlimitedYearly", duration: "yearly", group: "ultra", unlimited: true, fallbackPrice: 1109 }
};
if (process.env.NODE_ENV === "test") {
  PAYMENT_PLAN_OPTIONS["pro-test-001"] = { planId: "pro", planName: "PRO", optionLabel: "支付测试 1 元", duration: "monthly", group: "pro", fallbackPrice: 1 };
}
const DEFAULT_PRICING_FAQS = [
  { id: "devices", question: "“可绑定设备”是指什么？", answer: "指同一订阅可同时使用的设备数量，手机、电脑和平板等各计为一台；具体数量以所选套餐和计费周期显示为准。", enabled: true },
  { id: "gpt", question: "哪些套餐支持 GPT 解锁？", answer: "当前 PRO 套餐明确包含稳定 GPT 解锁。其他套餐能力请以套餐卡片的功能列表为准；实际可用性可能受目标平台策略和网络环境影响。", enabled: true },
  { id: "discount", question: "季度、半年和年度套餐如何计算优惠？", answer: "页面折扣以月付价格乘以对应月数作为基准计算，周期价格旁的百分比就是相比连续月付节省的比例。", enabled: true },
  { id: "renewal", question: "套餐未到期时再次购买会怎样？", answer: "同级同流量版本的新购会延长有效期；购买不同级别，或在同一级别切换固定/无限流量版本，会立即覆盖当前套餐。覆盖时按当前套餐剩余有效期折算实付现金价值并自动抵扣，最多抵扣至新订单 0 元，不退现、不结转余额。", enabled: true },
  { id: "delivery", question: "支付后多久生效？可以退款吗？", answer: "支付成功并完成确认后套餐会自动生效。套餐属于即时交付的数字商品，购买后不支持退款。", enabled: true }
];
const DEFAULT_PAYMENT_API_BASE_URL = "http://RfBseViEKZlMAmu7ArWO.itxt002.xyz";
const USER_GROUPS = ["basic", "pro", "ultra"];
const AUTH_COOKIE_NAME = "xela_session";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto
  .createHash("sha256")
  .update(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}:${DATABASE_URL}`)
  .digest("hex");
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const REMEMBER_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const PAYMENT_ORDER_TTL_MS = 15 * 60 * 1000;
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
let accounts = [];
let bills = [];
let vendors = [];
let placeholderNodes = [];
let presets = [];
let embyUsers = [];
let embyVendors = [];
let pricing = [];
let paymentOrders = [];
let salesSettings = [];
const dataStore = createDataStore({
  databaseUrl: DATABASE_URL,
  ssl: !LOCAL_DATABASE_URL && process.env.DATABASE_SSL === "true"
});
const alertStore = {
  get: key => dataStore.getRecord("alertState", key),
  set: (key, value) => dataStore.setRecord("alertState", key, value),
  clear: key => dataStore.deleteRecord("alertState", key)
};

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
  accounts = state.accounts || [];
  bills = state.bills;
  vendors = state.vendors || [];
  presets = state.presets || [];
  placeholderNodes = state.placeholderNodes || [];
  embyUsers = state.embyUsers || [];
  embyVendors = state.embyVendors || [];
  pricing = state.pricing || [];
  paymentOrders = state.paymentOrders || [];
  salesSettings = state.salesSettings || [];
  lastLoadedAt = Date.now();
  if (!pricing.length) { pricing = DEFAULT_PRICING.map(r => ({ ...r })); await savePricing(); }
  if (!salesSettings.length) { salesSettings = [initialSalesSettings()]; await saveSalesSettings(); }
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
    accounts = state.accounts || [];
    bills = state.bills;
    vendors = state.vendors || [];
    presets = state.presets || [];
    placeholderNodes = state.placeholderNodes || [];
    embyUsers = state.embyUsers || [];
    embyVendors = state.embyVendors || [];
    pricing = state.pricing || [];
    paymentOrders = state.paymentOrders || [];
    salesSettings = state.salesSettings || [];
    lastLoadedAt = Date.now();
  }).catch(error => {
    if (lastLoadedAt > 0) {
      console.warn(`[data] loadLatestData failed; using cached in-memory data: ${error.message}`);
      lastLoadedAt = Date.now();
      return;
    }
    throw error;
  }).finally(() => { _loadingPromise = null; });
  return _loadingPromise;
}

async function loadLatestData({ force = false } = {}) {
  if (!force && Date.now() - lastLoadedAt < DATA_CACHE_TTL_MS) return;
  return _doLoad();
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

async function saveAccounts() {
  _markWritten();
  await dataStore.saveCollection("accounts", accounts);
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

async function saveSalesSettings() {
  _markWritten();
  await dataStore.saveCollection("salesSettings", salesSettings);
}

async function savePaymentOrders() {
  _markWritten();
  await dataStore.saveCollection("paymentOrders", paymentOrders);
}


async function writePoolCachedBody(item, body) {
  const text = String(body || "");
  return { body: text, bodyFile: null, bodyLength: text.length };
}

async function readPoolCachedBody(item) {
  const cache = item?.cachedConfig || null;
  if (!cache) return "";
  if (typeof cache.body === "string") return cache.body;
  return "";
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

function requestOrigin(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() || "http";
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  return host ? `${proto}://${host}` : "";
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

function makeSessionToken(session, maxAgeSeconds) {
  const payload = Buffer.from(JSON.stringify({
    ...session,
    exp: Date.now() + maxAgeSeconds * 1000
  })).toString("base64url");
  return `${payload}.${signSession(payload)}`;
}

function verifySessionToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature || !safeEqual(signature, signSession(payload))) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Date.now() > Number(session.exp)) return null;
    if (!session.role && session.account === ADMIN_USERNAME) return { ...session, role: "admin" };
    if (session.role === "admin" && session.account === ADMIN_USERNAME) return session;
    if (session.role === "user" && accounts.some(item => item.id === session.accountId && item.status === "active")) return session;
    return null;
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

function requireAdmin(req, res) {
  const session = currentSession(req);
  if (session?.role === "admin") return session;
  sendJson(res, 403, { error: "需要管理员权限。" });
  return null;
}

function requireUser(req, res) {
  const session = currentSession(req);
  if (session?.role === "user") return session;
  sendJson(res, 401, { error: "请先登录用户账户。", loginUrl: "/login" });
  return null;
}

function normalizeAccountEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("请输入有效邮箱。");
  return email;
}

function validateAccountPassword(value) {
  const password = String(value || "");
  if (password.length < 8) throw new Error("密码至少需要 8 位。");
  if (password.length > 128) throw new Error("密码不能超过 128 位。");
  return password;
}

function hashAccountPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyAccountPassword(password, stored) {
  const [method, salt, expected] = String(stored || "").split("$");
  if (method !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return safeEqual(actual, expected);
}

function accountBySession(session) {
  return session?.role === "user" ? accounts.find(item => item.id === session.accountId && item.status === "active") : null;
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function accountActionUrl(req, pathName, token) {
  const base = String(process.env.PUBLIC_BASE_URL || requestOrigin(req)).replace(/\/+$/, "");
  return `${base}${pathName}?token=${encodeURIComponent(token)}`;
}

async function sendAccountActionMail({ to, subject, title, url }) {
  await notifier.sendMail({
    to,
    subject,
    text: `${title}\n\n${url}\n\n链接 30 分钟内有效，且只能使用一次。`,
    html: `<p>${title}</p><p><a href="${url}">${url}</a></p><p>链接 30 分钟内有效，且只能使用一次。</p>`
  });
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

function readText(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > limit) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function readPaymentCallback(req) {
  const text = await readText(req);
  if (!text) return {};
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (contentType.includes("application/json")) return JSON.parse(text);
  return Object.fromEntries(new URLSearchParams(text));
}

function paymentConfig() {
  loadLocalEnv({ override: false });
  const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  return {
    apiBaseUrl: (process.env.PAYMENT_API_BASE_URL || DEFAULT_PAYMENT_API_BASE_URL).replace(/\/+$/, ""),
    merchantId: process.env.PAYMENT_MERCHANT_ID || "",
    merchantSecret: process.env.PAYMENT_MERCHANT_SECRET || "",
    channelCode: process.env.PAYMENT_CHANNEL_CODE || "",
    notifyUrl: process.env.PAYMENT_NOTIFY_URL || (publicBaseUrl ? `${publicBaseUrl}/api/payments/callback` : ""),
    returnUrl: process.env.PAYMENT_RETURN_URL || (publicBaseUrl ? `${publicBaseUrl}/account/payment/result` : "")
  };
}

function paymentSign(params, secret = paymentConfig().merchantSecret) {
  const pairs = Object.entries(params || {})
    .filter(([key, value]) => key !== "sign" && value !== undefined && value !== null && String(value) !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${String(value)}`);
  return crypto.createHash("md5").update(`${pairs.join("&")}&${secret}`).digest("hex").toUpperCase();
}

function verifyPaymentSign(params) {
  const config = paymentConfig();
  const actual = String(params?.sign || "").trim().toUpperCase();
  if (!actual || !config.merchantSecret) return false;
  return safeEqual(actual, paymentSign(params, config.merchantSecret));
}

function requirePaymentConfig() {
  const config = paymentConfig();
  const missing = [];
  if (!config.merchantId) missing.push("PAYMENT_MERCHANT_ID");
  if (!config.merchantSecret) missing.push("PAYMENT_MERCHANT_SECRET");
  if (!config.channelCode) missing.push("PAYMENT_CHANNEL_CODE");
  if (missing.length) throw new Error(`Payment config missing: ${missing.join(", ")}`);
  return config;
}

function normalizePaymentEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Please enter a valid email address.");
  return email;
}

function deliveryUrlForUser(user, req) {
  return user?.subscriptionToken ? `${requestOrigin(req)}/delivery/${encodeURIComponent(user.subscriptionToken)}` : "";
}

function publicPaymentOrder(order) {
  if (!order) return null;
  const status = order.status === "pending" && isPaymentOrderExpired(order) ? "closed" : order.status;
  const vipSpendAmount = Number(order.vipSpendAmount) || 0;
  const currentVipSpend = userVipSpend(userForAccount(accounts.find(item => item.id === order.accountId)));
  const vipSpendAfter = Number.isFinite(Number(order.vipSpendAfter)) ? Number(order.vipSpendAfter) : currentVipSpend;
  return {
    id: order.id,
    merOrderTid: order.merOrderTid,
    tid: order.tid || "",
    planId: order.planId,
    planName: order.planName,
    optionId: order.optionId,
    optionLabel: order.optionLabel,
    amount: order.amount,
    originalAmount: order.originalAmount ?? order.amount,
    discountAmount: order.discountAmount || 0,
    vipLevel: order.vipLevel || "vip1",
    vipDiscountPercent: order.vipDiscountPercent || 0,
    vipDiscountAmount: order.vipDiscountAmount || 0,
    vipSpendAmount,
    vipSpendBefore: Number.isFinite(Number(order.vipSpendBefore)) ? Number(order.vipSpendBefore) : Math.max(vipSpendAfter - vipSpendAmount, 0),
    vipSpendAfter,
    subtotal: order.subtotal ?? order.amount,
    taxAmount: order.taxAmount || 0,
    beforeCreditAmount: order.beforeCreditAmount ?? order.amount,
    cashCredit: order.cashCredit || 0,
    purchaseAction: order.purchaseAction || "initial",
    channelCode: order.channelCode || "",
    couponCode: order.couponCode || "",
    payUrl: order.payUrl || "",
    status,
    statusText: paymentStatusText(status),
    userId: order.userId || "",
    accountId: order.accountId || "",
    deliveryUrl: order.deliveryUrl || "",
    fulfillmentStatus: order.fulfillmentStatus || "",
    fulfillmentError: order.fulfillmentError ? "支付成功，但套餐发放失败，请联系客服处理。" : "",
    paymentError: order.paymentError || "",
    createdAt: order.createdAt,
    expiresAt: paymentOrderExpiresAt(order),
    paidAt: order.paidAt || "",
    updatedAt: order.updatedAt || order.createdAt
  };
}

function paymentStatusText(status) {
  return ({
    pending: "待付款",
    paid: "已支付",
    failed: "支付失败",
    abnormal: "支付异常",
    closed: "已关闭"
  })[status] || "待付款";
}

function platformStatusToOrderStatus(value) {
  const status = Number(value);
  if (status === 1) return "paid";
  if (status === 2) return "failed";
  if (status === 3) return "abnormal";
  if (status === 4) return "closed";
  return "pending";
}

function paymentStatusError(status) {
  return ({
    failed: "支付平台返回支付失败。",
    abnormal: "支付平台返回支付异常。",
    closed: "订单已超时关闭。"
  })[status] || "";
}

function paymentAmountError(expected, actual) {
  const paid = Number(actual);
  if (Number.isFinite(paid) && paid === Number(expected)) return "";
  return `支付金额校验失败：应付 ¥${Number(expected).toFixed(2)}，平台返回 ${Number.isFinite(paid) ? `¥${paid.toFixed(2)}` : "无效金额"}。`;
}

function compactPaymentParams(params) {
  return Object.fromEntries(
    Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && String(value) !== "")
  );
}

async function postPaymentForm(endpoint, params, config = paymentConfig()) {
  const response = await fetch(`${config.apiBaseUrl}${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(compactPaymentParams(params))
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Payment gateway returned non-JSON response (${response.status}).`);
  }
  if (!response.ok) throw new Error(payload?.errMsg || `Payment gateway request failed: ${response.status}`);
  if (payload.status !== 0) throw new Error(payload.errMsg || "Payment gateway rejected the order.");
  return payload.result || {};
}

function makePaymentOrderId() {
  return `${Date.now()}${crypto.randomInt(1000, 9999)}`;
}

function paymentOrderExpiresAt(order) {
  const createdAt = new Date(order?.createdAt || 0).getTime();
  return Number.isFinite(createdAt) ? new Date(createdAt + PAYMENT_ORDER_TTL_MS).toISOString() : "";
}

function isPaymentOrderExpired(order, now = Date.now()) {
  const expiresAt = new Date(paymentOrderExpiresAt(order)).getTime();
  return Number.isFinite(expiresAt) && now >= expiresAt;
}

function normalizePaymentAmountForGateway(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid payment amount.");
  return amount.toFixed(2);
}

function resolvePaymentPlanOption(optionId) {
  const option = PAYMENT_PLAN_OPTIONS[String(optionId || "")];
  if (!option) throw new Error("Unsupported pricing option.");
  const priceRow = pricing.find(item => item.group === option.planId);
  const managedPrice = option.priceKey ? Number(priceRow?.[option.priceKey]) : NaN;
  const amount = Number.isFinite(managedPrice) && managedPrice > 0 ? managedPrice : option.fallbackPrice;
  return { ...option, amount };
}

function paymentChannelCode(value) {
  const channelCode = String(value || "").trim();
  if (!new Set(["100", "200"]).has(channelCode)) throw new Error("不支持的支付方式。");
  return channelCode;
}

function legacyPaymentCoupons(value = process.env.PAYMENT_COUPONS || "") {
  return String(value).split(",").map(entry => entry.split(":").map(part => part.trim())).filter(([code, percent]) => code && Number(percent) > 0 && Number(percent) < 100).map(([code, percent]) => ({ id: code.toUpperCase(), code: code.toUpperCase(), percent: Number(percent), enabled: true, validFrom: "", validUntil: "", applicableGroups: [], applicableDurations: [], totalLimit: 0, perAccountLimit: 0 }));
}

function initialSalesSettings() {
  return { id: "default", coupons: legacyPaymentCoupons(), faqs: DEFAULT_PRICING_FAQS.map(item => ({ ...item })), announcements: [] };
}

function currentSalesSettings() {
  const settings = salesSettings[0];
  return settings ? { ...settings, announcements: settings.announcements || [] } : initialSalesSettings();
}

function paymentCoupons(value) {
  const coupons = value === undefined ? currentSalesSettings().coupons : Array.isArray(value) ? value : legacyPaymentCoupons(value);
  const now = Date.now();
  return new Map(coupons.filter(item => item.enabled !== false && (!item.validFrom || Date.parse(item.validFrom) <= now) && (!item.validUntil || Date.parse(item.validUntil) > now)).map(item => [String(item.code).toUpperCase(), item]));
}

function couponUsageOrders(code) {
  const normalizedCode = String(code || "").toUpperCase();
  return paymentOrders.filter(order => String(order.couponCode || "").toUpperCase() === normalizedCode && (order.status === "paid" || (order.status === "pending" && !isPaymentOrderExpired(order))));
}

function validateCouponUsage(coupon, option, accountId = "") {
  const groups = Array.isArray(coupon.applicableGroups) ? coupon.applicableGroups : [];
  const durations = Array.isArray(coupon.applicableDurations) ? coupon.applicableDurations : [];
  if (groups.length && !groups.includes(option.group)) throw new Error("该优惠码不适用于当前套餐。");
  if (durations.length && !durations.includes(option.duration)) throw new Error("该优惠码不适用于当前计费周期。");
  const orders = couponUsageOrders(coupon.code);
  const totalLimit = Number(coupon.totalLimit) || 0;
  if (totalLimit > 0 && orders.length >= totalLimit) throw new Error("该优惠码已领完。");
  const perAccountLimit = Number(coupon.perAccountLimit) || 0;
  if (accountId && perAccountLimit > 0 && orders.filter(order => order.accountId === accountId).length >= perAccountLimit) throw new Error("该账户使用此优惠码的次数已达上限。");
}

function salesSettingsWithCouponUsage() {
  const settings = currentSalesSettings();
  return { ...settings, coupons: settings.coupons.map(coupon => ({ ...coupon, usedCount: couponUsageOrders(coupon.code).length })) };
}

function normalizeCouponDate(value, label) {
  if (!value) return "";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`${label}无效。`);
  return new Date(time).toISOString();
}

function normalizeSalesSettings(payload) {
  const coupons = Array.isArray(payload?.coupons) ? payload.coupons.slice(0, 50) : [];
  const seenCodes = new Set();
  const couponGroups = new Set(["basic", "pro", "ultra"]);
  const couponDurations = new Set(["monthly", "quarterly", "half_yearly", "yearly"]);
  const normalizedCoupons = coupons.map(item => {
    const code = String(item.code || "").trim().toUpperCase();
    const percent = Number(item.percent);
    if (!/^[A-Z0-9_-]{2,32}$/.test(code)) throw new Error("优惠码需为 2-32 位字母、数字、下划线或连字符。");
    if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) throw new Error(`${code} 的折扣比例需在 1-99 之间。`);
    if (seenCodes.has(code)) throw new Error(`优惠码 ${code} 重复。`);
    seenCodes.add(code);
    const validFrom = normalizeCouponDate(item.validFrom, `${code} 的生效时间`);
    const validUntil = normalizeCouponDate(item.validUntil, `${code} 的失效时间`);
    if (validFrom && validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) throw new Error(`${code} 的失效时间需晚于生效时间。`);
    const applicableGroups = [...new Set((Array.isArray(item.applicableGroups) ? item.applicableGroups : []).map(String).filter(value => couponGroups.has(value)))];
    const applicableDurations = [...new Set((Array.isArray(item.applicableDurations) ? item.applicableDurations : []).map(String).filter(value => couponDurations.has(value)))];
    const totalLimit = Number(item.totalLimit || 0);
    const perAccountLimit = Number(item.perAccountLimit || 0);
    if (!Number.isInteger(totalLimit) || totalLimit < 0) throw new Error(`${code} 的总数量限制需为非负整数。`);
    if (!Number.isInteger(perAccountLimit) || perAccountLimit < 0) throw new Error(`${code} 的单账户限制需为非负整数。`);
    return { id: String(item.id || crypto.randomUUID()), code, percent, enabled: item.enabled !== false, validFrom, validUntil, applicableGroups, applicableDurations, totalLimit, perAccountLimit };
  });
  const faqs = (Array.isArray(payload?.faqs) ? payload.faqs : []).slice(0, 20).map(item => {
    const question = String(item.question || "").trim().slice(0, 120);
    const answer = String(item.answer || "").trim().slice(0, 500);
    if (!question || !answer) throw new Error("FAQ 的问题和回答不能为空。");
    return { id: String(item.id || crypto.randomUUID()), question, answer, enabled: item.enabled !== false };
  });
  const announcements = (Array.isArray(payload?.announcements) ? payload.announcements : []).slice(0, 50).map(item => {
    const title = String(item.title || "").trim();
    const content = String(item.content || "").trim();
    if (!title || !content) throw new Error("公告标题和正文不能为空。");
    if (title.length > 80 || content.length > 2000) throw new Error("公告标题最多 80 字，正文最多 2000 字。");
    return {
      id: String(item.id || crypto.randomUUID()),
      title,
      content,
      publishedAt: normalizeCouponDate(item.publishedAt, `${title} 的发布时间`) || new Date().toISOString(),
      enabled: item.enabled !== false
    };
  });
  return { id: "default", coupons: normalizedCoupons, faqs, announcements };
}

function publicAnnouncements() {
  return currentSalesSettings().announcements
    .filter(item => item.enabled !== false)
    .slice()
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .map(({ id, title, content, publishedAt }) => ({ id, title, content, publishedAt }));
}

const VIP_TIERS = {
  vip1: { minSpend: 0, discountPercent: 0 },
  vip2: { minSpend: 360, discountPercent: 5 },
  vip3: { minSpend: 900, discountPercent: 10 }
};

function userVipSpend(user = {}) {
  const record = user || {};
  const vipSpend = Number(record.vipSpend);
  return Number.isFinite(vipSpend) && vipSpend >= 0 ? vipSpend : Math.max(Number(record.actualPaid) || 0, 0);
}

function vipLevelForSpend(value) {
  const spend = Math.max(Number(value) || 0, 0);
  return spend >= VIP_TIERS.vip3.minSpend ? "vip3" : spend >= VIP_TIERS.vip2.minSpend ? "vip2" : "vip1";
}

function vipDiscountPercent(level) {
  return VIP_TIERS[level]?.discountPercent || 0;
}

function userVipLevel(user = {}) {
  return vipLevelForSpend(userVipSpend(user));
}

function userForAccount(account) {
  if (!account) return null;
  if (account.linkedUserId) return users.find(item => item.id === account.linkedUserId) || null;
  const email = String(account.email || "").toLowerCase();
  return users.find(item => String(item.email || item.userId || "").toLowerCase() === email) || null;
}

function remainingPlanCashValue(user, now = new Date()) {
  if (!user) return 0;
  const valuedAt = new Date(user.cashValueAt || user.purchasedAt || 0).getTime();
  const expiresAt = new Date(user.expiresAt || 0).getTime();
  const currentTime = now.getTime();
  const cashValue = Math.max(Number(user.cashValue ?? user.actualPaid) || 0, 0);
  if (!Number.isFinite(valuedAt) || !Number.isFinite(expiresAt) || expiresAt <= currentTime || expiresAt <= valuedAt) return 0;
  return Math.round(cashValue * Math.min(Math.max((expiresAt - currentTime) / (expiresAt - valuedAt), 0), 1) * 100) / 100;
}

function paymentPurchaseTerms(user, option, beforeCreditAmount, now = new Date()) {
  const active = user && new Date(user.expiresAt || 0).getTime() > now.getTime();
  if (!active) return { purchaseAction: "initial", cashCredit: 0 };
  const replaces = activeUserGroup(user) !== option.group || Boolean(user.unlimited) !== Boolean(option.unlimited);
  const cashCredit = replaces ? Math.min(remainingPlanCashValue(user, now), beforeCreditAmount) : 0;
  return { purchaseAction: replaces ? "replace" : "extend", cashCredit };
}

function paymentQuote(optionId, couponCode = "", couponConfig, vipLevel = "vip1", accountId = "") {
  const option = resolvePaymentPlanOption(optionId);
  const code = String(couponCode || "").trim().toUpperCase();
  const coupon = code ? paymentCoupons(couponConfig).get(code) : null;
  if (code && !coupon) throw new Error("优惠码无效。");
  if (coupon) validateCouponUsage(coupon, option, accountId);
  const percent = Number(coupon?.percent) || 0;
  const originalAmount = Number(option.amount.toFixed(2));
  const originalCents = Math.round(originalAmount * 100);
  const discountCents = Math.round(originalCents * percent / 100);
  const discountAmount = discountCents / 100;
  const vipPercent = vipDiscountPercent(vipLevel);
  const afterCouponCents = originalCents - discountCents;
  const subtotalCents = Math.round(afterCouponCents * (100 - vipPercent) / 100);
  const vipDiscountAmount = (afterCouponCents - subtotalCents) / 100;
  const subtotal = subtotalCents / 100;
  const taxAmount = Math.round(subtotalCents * 0.03) / 100;
  const beforeCreditAmount = Number((subtotal + taxAmount).toFixed(2));
  const account = accounts.find(item => item.id === accountId);
  const terms = paymentPurchaseTerms(userForAccount(account), option, beforeCreditAmount);
  const plan = publicPricing().find(item => item.group === option.planId) || {};
  const cycles = Object.entries(PAYMENT_PLAN_OPTIONS)
    .filter(([, item]) => item.planId === option.planId && Boolean(item.unlimited) === Boolean(option.unlimited) && (item.priceKey || item.unlimited))
    .map(([id, item]) => ({ optionId: id, label: item.optionLabel, amount: resolvePaymentPlanOption(id).amount, devices: Number(plan[`${item.duration}Devices`] || 0) }));
  if (!cycles.some(item => item.optionId === String(optionId))) cycles.unshift({ optionId: String(optionId), label: option.optionLabel, amount: originalAmount, devices: 0 });
  return {
    ...option,
    optionId: String(optionId),
    originalAmount,
    discountAmount,
    vipLevel,
    vipDiscountPercent: vipPercent,
    vipDiscountAmount,
    subtotal,
    taxRate: 3,
    taxAmount,
    beforeCreditAmount,
    cashCredit: terms.cashCredit,
    purchaseAction: terms.purchaseAction,
    amount: Number((beforeCreditAmount - terms.cashCredit).toFixed(2)),
    couponCode: code,
    discountPercent: percent || 0,
    title: plan.title || option.planName,
    description: plan.description || "",
    traffic: option.unlimited ? "无限流量" : plan.traffic || "",
    features: Array.isArray(plan.features) ? plan.features : [],
    devices: Number(plan[`${option.duration}Devices`] || 0),
    cycles
  };
}

async function fulfillPaymentOrder(order, req) {
  if (!order || order.status !== "paid" || order.fulfilledAt) return order;
  const email = normalizePaymentEmail(order.email);
  const selectedOption = resolvePaymentPlanOption(order.optionId);
  const purchasedAt = order.paidAt || new Date().toISOString();
  const account = order.accountId ? accounts.find(item => item.id === order.accountId) : null;
  let user = account?.linkedUserId
    ? users.find(item => item.id === account.linkedUserId)
    : users.find(item => String(item.userId || "").toLowerCase() === email);
  if (user && !user.email) user.email = email;
  const vipSpendBefore = userVipSpend(user);
  const expiresAt = nextUserExpiry(user, purchasedAt, selectedOption.duration, order.purchaseAction === "replace");
  const recommendation = recommendSubscriptionForExpiry(expiresAt);
  if (!recommendation.subscription) throw new Error(recommendation.reason || "No available subscription pool.");

  if (user) {
    const previousSubscription = subscriptions.find(item => item.id === user.subscriptionId) || null;
    const poolChanged = previousSubscription?.id !== recommendation.subscription.id;
    const renewal = renewUser(user, {
      purchasedAt,
      actualPaid: order.amount,
      vipSpendAmount: order.vipSpendAmount ?? order.subtotal ?? order.amount,
      duration: selectedOption.duration,
      group: selectedOption.group,
      unlimited: Boolean(selectedOption.unlimited),
      replace: order.purchaseAction === "replace",
      subscriptionId: recommendation.subscription.id
    });
    bills.unshift(makeBill({
      user,
      type: order.purchaseAction === "replace" ? "replacement" : "renewal",
      paymentOrderId: order.id,
      amount: order.amount,
      vipSpendAmount: renewal.vipSpendAmount,
      occurredAt: renewal.renewedAt,
      duration: user.duration,
      beforeExpiresAt: renewal.beforeExpiresAt,
      afterExpiresAt: renewal.afterExpiresAt,
      description: order.purchaseAction === "replace" ? "Payment order replacement" : "Payment order renewal"
    }));
    appendUserLogToUser(user, createUserLog({
      event: "user-action",
      status: poolChanged ? "switched" : "recorded",
      reason: poolChanged ? "purchase-pool-changed" : "user-renewed",
      fromSubscription: poolChanged ? previousSubscription : null,
      toSubscription: recommendation.subscription,
      req,
      message: userActionMessage(poolChanged ? "purchase-pool-changed" : "user-renewed", {
        amount: renewal.amount,
        duration: user.duration,
        afterExpiresAt: renewal.afterExpiresAt,
        fromSubscriptionLabel: subscriptionLogLabel(previousSubscription),
        toSubscriptionLabel: subscriptionLogLabel(recommendation.subscription)
      }),
      details: {
        paymentOrderId: order.id,
        merOrderTid: order.merOrderTid,
        amount: renewal.amount,
        duration: user.duration,
        afterExpiresAt: renewal.afterExpiresAt
      }
    }));
  } else {
    const item = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    user = normalizeUser({
      userId: email,
      email,
      wechatName: "",
      purchasedAt,
      actualPaid: order.amount,
      vipSpend: order.vipSpendAmount ?? order.subtotal ?? order.amount,
      duration: selectedOption.duration,
      group: selectedOption.group,
      activeGroup: selectedOption.group,
      unlimited: Boolean(selectedOption.unlimited),
      cashValue: order.beforeCreditAmount ?? order.amount,
      cashValueAt: purchasedAt,
      subscriptionId: recommendation.subscription.id,
      outputMode: "subconverter",
      blockUserinfo: true
    }, item);
    user.outputMode = "subconverter";
    user.blockUserinfo = true;
    users.unshift(user);
    bills.unshift(makeBill({
      user,
      type: "initial",
      paymentOrderId: order.id,
      amount: order.amount,
      vipSpendAmount: userVipSpend(user),
      occurredAt: user.purchasedAt,
      duration: user.duration,
      afterExpiresAt: user.expiresAt,
      description: "Payment order purchase"
    }));
    appendUserLogToUser(user, createUserLog({
      event: "user-action",
      status: "recorded",
      reason: "user-created",
      toSubscription: recommendation.subscription,
      req,
      message: userActionMessage("user-created"),
      details: {
        paymentOrderId: order.id,
        merOrderTid: order.merOrderTid,
        snapshot: userSnapshotForLog(user),
        amount: user.actualPaid,
        duration: user.duration,
        afterExpiresAt: user.expiresAt
      }
    }));
  }

  order.userId = user.id;
  order.vipSpendBefore = vipSpendBefore;
  order.vipSpendAfter = userVipSpend(user);
  if (account && account.linkedUserId !== user.id) {
    account.linkedUserId = user.id;
    account.updatedAt = new Date().toISOString();
    await saveAccounts();
  }
  order.deliveryUrl = deliveryUrlForUser(user, req);
  order.fulfilledAt = new Date().toISOString();
  order.fulfillmentStatus = "fulfilled";
  order.fulfillmentError = "";
  await saveUsers();
  await saveBills();
  await savePaymentOrders();
  return order;
}

function paymentReturnUrl(config, req, merOrderTid, fallbackUrl = "") {
  const base = String(config.returnUrl || fallbackUrl || `${requestOrigin(req)}/pricing`).trim();
  if (!base || !/^https?:\/\//i.test(base)) return "";
  const url = new URL(base);
  url.searchParams.set("paymentOrder", merOrderTid);
  return url.toString();
}

async function createPaymentOrder(payload, req, account) {
  const selectedOption = paymentQuote(payload.optionId, payload.couponCode, undefined, userVipLevel(userForAccount(account)), account.id);
  if (paymentOrders.some(order => order.accountId === account.id && order.status === "pending" && !isPaymentOrderExpired(order))) {
    throw new Error("已有待支付订单，请先完成或等待订单关闭。");
  }
  const config = selectedOption.amount > 0 ? requirePaymentConfig() : null;
  const channelCode = config ? paymentChannelCode(payload.channelCode || config.channelCode) : "cash-credit";
  const email = normalizePaymentEmail(account.email);
  const amount = selectedOption.amount > 0 ? normalizePaymentAmountForGateway(selectedOption.amount) : "0.00";
  const id = crypto.randomUUID();
  const merOrderTid = makePaymentOrderId();
  let compactParams = {};
  let result = {};
  if (config) {
    const notifyUrl = config.notifyUrl || `${requestOrigin(req)}/api/payments/callback`;
    if (!/^https?:\/\//i.test(notifyUrl)) throw new Error("Payment notify URL is unavailable.");
    const requestParams = {
      mid: config.merchantId,
      merOrderTid,
      money: amount,
      channelCode,
      notifyUrl,
      clientUserPayRemark: selectedOption.optionLabel,
      clientUserId: String(payload.clientUserId || "").trim(),
      clientUserName: String(payload.clientUserName || "").trim(),
      returnUrl: paymentReturnUrl(config, req, id, payload.returnUrl)
    };
    compactParams = compactPaymentParams(requestParams);
    compactParams.sign = paymentSign(compactParams, config.merchantSecret);
    result = await postPaymentForm("/api/services/app/Api_PayOrder/CreateOrderPay", compactParams, config);
  }

  const now = new Date().toISOString();
  const order = {
    id,
    merOrderTid,
    tid: result.tid || "",
    planId: selectedOption.planId,
    planName: selectedOption.planName,
    optionId: String(payload.optionId || "").trim(),
    optionLabel: selectedOption.optionLabel,
    duration: selectedOption.duration,
    group: selectedOption.group,
    unlimited: Boolean(selectedOption.unlimited),
    originalAmount: selectedOption.originalAmount,
    discountAmount: selectedOption.discountAmount,
    vipLevel: selectedOption.vipLevel,
    vipDiscountPercent: selectedOption.vipDiscountPercent,
    vipDiscountAmount: selectedOption.vipDiscountAmount,
    subtotal: selectedOption.subtotal,
    taxAmount: selectedOption.taxAmount,
    beforeCreditAmount: selectedOption.beforeCreditAmount,
    cashCredit: selectedOption.cashCredit,
    purchaseAction: selectedOption.purchaseAction,
    vipSpendAmount: Math.round((Number(amount) / 1.03) * 100) / 100,
    couponCode: selectedOption.couponCode,
    channelCode,
    amount: Number(amount),
    email,
    accountId: account.id,
    payUrl: result.payUrl || "",
    status: config ? platformStatusToOrderStatus(result.payOrderStatus) : "paid",
    platformStatus: result.payOrderStatus ?? null,
    requestParams: compactParams,
    paidAt: config ? "" : now,
    createdAt: now,
    expiresAt: new Date(Date.now() + PAYMENT_ORDER_TTL_MS).toISOString(),
    updatedAt: now
  };
  paymentOrders.unshift(order);
  await savePaymentOrders();
  if (!config) await fulfillPaymentOrder(order, req);
  return order;
}

async function refreshPaymentOrder(order) {
  const config = requirePaymentConfig();
  const params = {
    mid: config.merchantId,
    merOrderTid: order.merOrderTid
  };
  params.sign = paymentSign(params, config.merchantSecret);
  const result = await postPaymentForm("/api/services/app/Api_PayOrder/QueryPayOrder", params, config);
  order.tid = result.tid || order.tid || "";
  order.payUrl = result.payUrl || order.payUrl || "";
  order.platformStatus = result.payOrderStatus ?? order.platformStatus;
  order.status = platformStatusToOrderStatus(result.payOrderStatus);
  if (order.status === "pending" && isPaymentOrderExpired(order)) order.status = "closed";
  const amountError = order.status === "paid" ? paymentAmountError(order.amount, result.money) : "";
  if (amountError) order.status = "abnormal";
  order.paymentError = amountError || paymentStatusError(order.status);
  order.updatedAt = new Date().toISOString();
  if (order.status === "paid" && !order.paidAt) order.paidAt = order.updatedAt;
  await savePaymentOrders();
  return order;
}

async function handlePaymentCallback(req) {
  const payload = await readPaymentCallback(req);
  const merOrderTid = String(payload.merOrderTid || "").trim();
  const order = paymentOrders.find(item => item.merOrderTid === merOrderTid);
  if (!verifyPaymentSign(payload)) {
    if (order) {
      order.paymentError = "支付通知签名验证失败，请点击检测支付状态或联系客服。";
      order.updatedAt = new Date().toISOString();
      await savePaymentOrders();
    }
    return { ok: false, statusCode: 400, body: "invalid sign" };
  }
  if (order) {
    const now = new Date().toISOString();
    order.tid = String(payload.tid || order.tid || "");
    order.platformStatus = Number(payload.status);
    order.status = platformStatusToOrderStatus(payload.status);
    const amountError = order.status === "paid" ? paymentAmountError(order.amount, payload.money) : "";
    if (amountError) {
      order.status = "abnormal";
      order.fulfillmentStatus = "failed";
    }
    order.paymentError = amountError || paymentStatusError(order.status);
    order.callbackPayload = payload;
    order.updatedAt = now;
    if (order.status === "paid" && !order.paidAt) order.paidAt = now;
    await savePaymentOrders();
    if (order.status === "paid") {
      try {
        await fulfillPaymentOrder(order, req);
      } catch (error) {
        order.fulfillmentStatus = "failed";
        order.fulfillmentError = error.message;
        order.updatedAt = new Date().toISOString();
        await savePaymentOrders();
        console.error(`Payment fulfillment failed for ${order.merOrderTid}:`, error.message);
      }
    }
  }
  return { ok: true, statusCode: 200, body: "success" };
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
  const enabled = input.enabled !== undefined ? Boolean(input.enabled) : existing.enabled !== false;

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
    enabled,
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

function normalizeUserGroup(value, fallback = "pro") {
  const group = String(value || "").trim().toLowerCase();
  return USER_GROUPS.includes(group) ? group : fallback;
}

function activeUserGroup(user = {}) {
  return normalizeUserGroup(user.activeGroup || user.group, "pro");
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

function nextUserExpiry(user, purchasedAt, duration, replace = false) {
  const purchased = new Date(purchasedAt);
  const currentExpiry = user?.expiresAt ? new Date(user.expiresAt) : null;
  const base = !replace && currentExpiry && currentExpiry.getTime() > purchased.getTime() ? currentExpiry : purchased;
  return calculateExpiry(base.toISOString(), duration);
}

function calculateGiftExpiry(user, days, now = new Date()) {
  const giftDays = Number(days);
  if (!Number.isSafeInteger(giftDays) || giftDays <= 0) return null;
  if (user?.duration === "lifetime") return LIFETIME_EXPIRES_AT;
  const currentExpiry = user?.expiresAt ? new Date(user.expiresAt) : null;
  const base = currentExpiry && !Number.isNaN(currentExpiry.getTime()) && currentExpiry > now ? currentExpiry : new Date(now);
  base.setUTCDate(base.getUTCDate() + giftDays);
  return base.toISOString();
}

function userHasClaimedAccount(userId) {
  return accounts.some(account => account.linkedUserId === userId && account.status === "active");
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
  const eligibleSubscriptions = subscriptions.filter(item => item.enabled !== false && Date.parse(item.metrics?.expireAt || "") > Date.now());
  const candidates = eligibleSubscriptions
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
    const latest = subscriptionsByLatestExpiry().find(item => eligibleSubscriptions.includes(item));
    if (latest) return { subscription: latest, reason: "用户到期日远超所有池，已推荐最晚到期的池。" };
  }

  const reason = eligibleSubscriptions.length === 0
    ? "没有可用的池 URL。"
    : noExpiry > 0
    ? "池 URL 缺少到期时间，请手动选择。"
    : "没有匹配的池 URL，请手动选择。";
  return { subscription: null, reason };
}

function normalizeUser(input, existing = {}) {
  const userId = String(input.userId || existing.userId || "").trim();
  const wechatName = String(input.wechatName || existing.wechatName || "").trim();
  const rawEmail = String(input.email !== undefined ? input.email : (existing.email || "")).trim();
  const email = rawEmail ? normalizeAccountEmail(rawEmail) : "";
  const imessageIds = normalizeIdList(input.imessageIds !== undefined ? input.imessageIds : (input.imessageId !== undefined ? input.imessageId : (input.imessage !== undefined ? input.imessage : userImessageIds(existing))));
  const imessageId = imessageIds[0] || "";
  const purchasedAt = String(input.purchasedAt || existing.purchasedAt || new Date().toISOString()).trim();
  const duration = String(input.duration || existing.duration || "monthly").trim();
  const requestedSubscriptionId = String(input.subscriptionId || existing.subscriptionId || "").trim();
  const actualPaid = normalizePaymentAmount(input.actualPaid ?? existing.actualPaid ?? "");
  const vipSpend = normalizePaymentAmount(input.vipSpend !== undefined ? input.vipSpend : input.actualPaid !== undefined ? input.actualPaid : existing.vipSpend ?? actualPaid ?? "");
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
  if (vipSpend === null) throw new Error("请填写正确的累计消费金额。");

  const cashValue = normalizePaymentAmount(input.cashValue ?? existing.cashValue ?? actualPaid);
  const cashValueAt = String(input.cashValueAt || existing.cashValueAt || purchasedAt);
  if (cashValue === null || Number.isNaN(new Date(cashValueAt).getTime())) throw new Error("Invalid cash value.");

  const group = normalizeUserGroup(input.group, existing.activeGroup || existing.group || "pro");
  const activeGroup = normalizeUserGroup(
    input.activeGroup !== undefined ? input.activeGroup : input.group,
    existing.activeGroup || group
  );
  const isBusiness = input.isBusiness !== undefined ? Boolean(input.isBusiness) : Boolean(existing.isBusiness);
  const isFamilyFriend = input.isFamilyFriend !== undefined ? Boolean(input.isFamilyFriend) : Boolean(existing.isFamilyFriend);
  const unlimited = input.unlimited !== undefined ? Boolean(input.unlimited) : Boolean(existing.unlimited);
  const level = vipLevelForSpend(vipSpend);

  return {
    ...existing,
    userId,
    wechatName,
    email,
    imessage: imessageId,
    imessageId,
    imessageIds,
    purchasedAt: new Date(purchasedAt).toISOString(),
    duration,
    actualPaid,
    vipSpend,
    group,
    activeGroup,
    unlimited,
    cashValue,
    cashValueAt: new Date(cashValueAt).toISOString(),
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

function makeBill({ user, type, paymentOrderId = "", amount, vipSpendAmount = amount, occurredAt, duration, beforeExpiresAt = null, afterExpiresAt = null, description = "" }) {
  return {
    id: crypto.randomUUID(),
    type,
    paymentOrderId,
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
    vipSpendAmount: Math.round(Number(vipSpendAmount || 0) * 100) / 100,
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
        vipSpendAmount: userVipSpend(user),
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
    const currentVipSpend = userVipSpend(user);
    user.actualPaid = Math.max(Math.round((currentPaid - (Number(bill.amount) || 0)) * 100) / 100, 0);
    user.vipSpend = Math.max(Math.round((currentVipSpend - (Number(bill.vipSpendAmount ?? bill.amount) || 0)) * 100) / 100, 0);
    user.level = vipLevelForSpend(user.vipSpend);
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
  const group = normalizeUserGroup(input.group, activeUserGroup(user));
  const currentExpiry = user.expiresAt ? new Date(user.expiresAt) : null;
  const previousPaid = Number(user.actualPaid) || 0;
  const previousVipSpend = userVipSpend(user);
  const vipSpendAmount = normalizePaymentAmount(input.vipSpendAmount ?? actualPaid);
  const replace = input.replace === true;
  const currentCashValue = remainingPlanCashValue(user, renewedAt);
  const addedCashValue = normalizePaymentAmount(input.cashValueAmount ?? actualPaid);

  if (!isValidDuration(duration)) throw new Error("请选择续费时长。");
  if (Number.isNaN(renewedAt.getTime())) throw new Error("续费时间格式不正确。");
  if (actualPaid === null) throw new Error("请填写正确的实付款金额。");
  if (vipSpendAmount === null) throw new Error("请填写正确的累计消费金额。");
  if (addedCashValue === null) throw new Error("现金价值金额不正确。");

  let expiresAt;
  if (duration === "lifetime") {
    expiresAt = LIFETIME_EXPIRES_AT;
  } else if (duration === "custom") {
    const requestedExpiresDate = input.expiresAt ? new Date(input.expiresAt) : null;
    if (!requestedExpiresDate || Number.isNaN(requestedExpiresDate.getTime())) throw new Error("请选择到期日期。");
    expiresAt = requestedExpiresDate.toISOString();
  } else {
    expiresAt = nextUserExpiry(user, renewedAt.toISOString(), duration, replace);
  }
  const subscription = subscriptions.find(item => item.id === requestedSubscriptionId);
  if (!expiresAt) throw new Error("续费时间格式不正确。");
  if (!subscription) throw new Error("请选择已添加的 URL。");

  const vipSpend = Math.round((previousVipSpend + vipSpendAmount) * 100) / 100;
  Object.assign(user, {
    purchasedAt: renewedAt.toISOString(),
    duration,
    actualPaid: Math.round((previousPaid + actualPaid) * 100) / 100,
    vipSpend,
    level: vipLevelForSpend(vipSpend),
    group,
    activeGroup: group,
    unlimited: input.unlimited !== undefined ? Boolean(input.unlimited) : Boolean(user.unlimited),
    cashValue: Math.round((replace ? addedCashValue : currentCashValue + addedCashValue) * 100) / 100,
    cashValueAt: renewedAt.toISOString(),
    subscriptionId: subscription.id,
    subscriptionToken: user.subscriptionToken || relayToken(),
    expiresAt,
    updatedAt: new Date().toISOString()
  });

  return { user, amount: actualPaid, vipSpendAmount, renewedAt: renewedAt.toISOString(), beforeExpiresAt: currentExpiry?.toISOString() || null, afterExpiresAt: expiresAt };
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
    status: item.enabled === false ? "disabled" : statusFor(item, resolvedCustomerCount)
  };
}

function publicUserLogs(user) {
  const logs = Array.isArray(user.userLogs) ? user.userLogs : (Array.isArray(user.fallbackLogs) ? user.fallbackLogs : []);
  let currentSubscription = null;
  return logs.slice().reverse().map(log => {
    const target = log.toSubscriptionId || log.toSubscriptionLabel
      ? { id: log.toSubscriptionId || "", label: log.toSubscriptionLabel || "" }
      : null;
    let output = log;
    if (log.reason === "user-renewed" && !log.fromSubscriptionId && currentSubscription && target
      && (currentSubscription.id || currentSubscription.label) !== (target.id || target.label)) {
      output = {
        ...log,
        status: "switched",
        statusText: userLogStatusText.switched,
        reason: "purchase-pool-changed",
        reasonText: userLogReasonText["purchase-pool-changed"],
        fromSubscriptionId: currentSubscription.id,
        fromSubscriptionLabel: currentSubscription.label,
        message: `\u7eed\u8d39\u89e6\u53d1\u81ea\u52a8\u6362\u6c60\uff1a${currentSubscription.label || "-"} -> ${target.label || "-"}`
      };
    }
    if (target) currentSubscription = target;
    return output;
  }).reverse();
}

function publicUser(user, subscriptionMap = null) {
  const subscription = subscriptionMap
    ? subscriptionMap.get(user.subscriptionId)
    : subscriptions.find(item => item.id === user.subscriptionId);
  const linkedAccount = accounts.find(item => item.linkedUserId === user.id);
  return {
    ...user,
    email: user.email || linkedAccount?.email || "",
    accountStatus: linkedAccount?.status || "unclaimed",
    userLogs: publicUserLogs(user),
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
      accountStatus: userHasClaimedAccount(user.id) ? "active" : "unclaimed",
      wechatName: user.wechatName || "",
      imessageId: user.imessageId || "",
      imessageIds: userImessageIds(user),
      createdAt: user.createdAt || "",
      expiresAt: user.expiresAt
    } : null,
    isReversed: Boolean(bill.reversedAt)
  };
}

function paymentOrderForBill(bill) {
  if (bill.paymentOrderId) return paymentOrders.find(order => order.id === bill.paymentOrderId) || null;
  return paymentOrders.find(order => order.userId === bill.userId
    && order.status === "paid"
    && Number(order.amount) === Number(bill.amount)
    && order.paidAt === bill.occurredAt) || null;
}

function publicBillDetail(bill) {
  return { ...publicBill(bill), payment: publicPaymentOrder(paymentOrderForBill(bill)) };
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

async function liveConfigFromCachedPoolConfig(item) {
  if (!cacheIsFresh(item?.cachedConfig)) return null;
  const body = await readPoolCachedBody(item);
  if (!body) return null;
  return {
    body,
    status: item.cachedConfig.status || 200,
    client: `${item.cachedConfig.client || "pool"}-cache`,
    fetchedAt: item.cachedConfig.fetchedAt,
    contentType: item.cachedConfig.contentType || "text/plain; charset=utf-8",
    subscriptionUserinfo: item.cachedConfig.subscriptionUserinfo || "",
    score: item.cachedConfig.score || clashConfigScore(body),
    bodyLength: body.length,
    attempts: item.cachedConfig.attempts || [],
    error: null,
    cached: true
  };
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
  "user-gifted": "\u8d60\u9001\u65f6\u957f",
  "purchase-pool-changed": "\u8d2d\u4e70\u540e\u81ea\u52a8\u6362\u6c60",
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
  const provider = normalizeServiceProvider({}, item);
  const label = item.email || item.name || item.url || item.id || "";
  if (provider && label) return `${provider} - ${label}`;
  return provider || label;
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
    activeGroup: activeUserGroup(user),
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
    activeGroup: "当前生效套餐等级",
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
  if (reason === "user-gifted") return `\u8d60\u9001 ${details.days || 0} \u5929\uff0c\u5230\u671f ${details.beforeExpiresAt || "-"} -> ${details.afterExpiresAt || "-"}`;
  if (reason === "purchase-pool-changed") return `\u7eed\u8d39\u89e6\u53d1\u81ea\u52a8\u6362\u6c60\uff1a${details.fromSubscriptionLabel || "-"} -> ${details.toSubscriptionLabel || "-"}`;
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
  const level = userVipLevel(user);
  const group = activeUserGroup(user).toUpperCase();
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

function isBrowserNavigationRequest(req) {
  const accept = String(req?.headers?.accept || "");
  const userAgent = String(req?.headers?.["user-agent"] || "");
  const secFetchDest = String(req?.headers?.["sec-fetch-dest"] || "");
  const looksLikeBrowser = /(Mozilla|Chrome|Safari|Firefox|Edg|OPR)\//i.test(userAgent);
  const looksLikeSubscriptionClient = /(Clash|Stash|Shadowrocket|Quantumult|Surge|sing-box|SFA|VPNSubscriptionMonitor)/i.test(userAgent);
  return !looksLikeSubscriptionClient && looksLikeBrowser && (
    /\btext\/html\b/i.test(accept) || secFetchDest === "document"
  );
}

function normalizeSubconverterConfigParam(value) {
  const config = String(value || "").trim();
  if (/^\/config\//i.test(config)) return config.slice(1);
  return config;
}

function defaultSubconverterPreset() {
  const preset = presets.find(p => p.id === "default") || {};
  return {
    target: String(preset.target || DEFAULT_SUBCONVERTER_TARGET).trim() || DEFAULT_SUBCONVERTER_TARGET,
    config: normalizeSubconverterConfigParam(preset.config),
    emoji: preset.emoji !== false,
    udp: preset.udp !== false,
    scv: Boolean(preset.scv),
    sort: Boolean(preset.sort)
  };
}

function userOutputMode(user = {}) {
  return String(user.outputMode || "subconverter").trim().toLowerCase() === "direct"
    ? "direct"
    : "subconverter";
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
  const outputMode = userOutputMode(user);
  const sc = (() => {
    // 用户可显式选择直链模式，绕过订阅转换
    if (outputMode === "direct") return null;
    const base = { ...defaultSubconverterPreset(), include: "", exclude: "", rename: "" };
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
    outputMode,
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
  if (outputMode !== "direct" && !sc?.target) {
    relayLog("response-placeholder-custom-url-disabled", {
      relayRequestId,
      userId: user.id,
      outputMode,
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
      liveConfig = await liveConfigFromCachedPoolConfig(subscription);
      if (liveConfig) {
        relayLog("subconverter-current-cache-fallback-ok", {
          relayRequestId,
          userId: user.id,
          pool: poolLogInfo(subscription),
          cachedConfig: {
            client: liveConfig.client,
            fetchedAt: liveConfig.fetchedAt,
            score: liveConfig.score,
            bodyLength: liveConfig.bodyLength,
            subscriptionUserinfo: liveConfig.subscriptionUserinfo
          }
        });
        await recordUserLog(user, {
          status: "kept_current",
          reason: "pool-fetch-failed",
          fromSubscription: subscription,
          req,
          target: sc.target,
          stage: "subconverter-cache-fallback",
          message: "\u539f\u6c60 URL \u5b9e\u65f6\u83b7\u53d6\u5931\u8d25\uff0c\u4f46\u5df2\u4f7f\u7528\u65b0\u9c9c\u7f13\u5b58\u7ee7\u7eed\u8f6c\u6362\uff0c\u672a\u6267\u884c\u81ea\u52a8\u6362\u6c60\u3002"
        });
      }
      if (!liveConfig) {
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
      const browserInline = isBrowserNavigationRequest(req);
      relayLog("response-subconverter-ok", {
        relayRequestId,
        userId: user.id,
        status: response.status,
        contentType: response.headers.get("content-type") || "text/plain; charset=utf-8",
        browserInline,
        bodyLength: finalBody.length,
        bodyPreview: bodyPreview(finalBody.toString("utf8"))
      });
      const responseHeaders = {
        "content-type": browserInline ? "text/plain; charset=utf-8" : (response.headers.get("content-type") || "text/plain; charset=utf-8"),
        "cache-control": "no-store, max-age=0",
        "pragma": "no-cache",
        "expires": "0",
        ...(liveConfig.subscriptionUserinfo && user.blockUserinfo === false ? { "subscription-userinfo": liveConfig.subscriptionUserinfo } : {})
      };
      if (browserInline) {
        responseHeaders["content-disposition"] = "inline; filename*=UTF-8''NEXORA.txt";
        responseHeaders["x-content-type-options"] = "nosniff";
      } else {
        responseHeaders["content-disposition"] = "attachment; filename*=UTF-8''NEXORA";
      }
      res.writeHead(response.status, responseHeaders);
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

function isLocalRequest(req) {
  const address = req.socket?.remoteAddress || "";
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address);
}

async function sendAlertTestMessage({ mailOnly = false } = {}) {
  if (!notifier.isConfigured()) {
    const error = new Error("No mail or Telegram alert channel configured.");
    error.statusCode = 400;
    throw error;
  }
  const cfg = notifier.getMailerConfig();
  const text = `NEXORA alert test.\nThreshold: ${notifier.formatBytes(cfg.threshold)}`;
  const sent = [];
  if (notifier.isMailConfigured()) {
    await notifier.sendMail({
      subject: "[NEXORA] Alert test",
      text: `${text}\nMail target: ${cfg.to}`
    });
    sent.push("mail");
  }
  if (!mailOnly && notifier.isTelegramConfigured()) {
    await notifier.sendTelegram({ text });
    sent.push("telegram");
  }
  return { sent, to: cfg.to };
}

function telegramAuthorizedChat(chatId) {
  const allowed = String(notifier.getTelegramConfig().chatId || "").trim();
  return Boolean(allowed) && String(chatId || "") === allowed;
}

function telegramCommandText(update = {}) {
  const message = update.message || update.edited_message || null;
  return {
    message,
    chatId: message?.chat?.id,
    text: String(message?.text || "").trim()
  };
}

function telegramHelpText() {
  return [
    "XELA monitor bot",
    "",
    "Commands:",
    "/user <keyword> - query VPN user",
    "/u <keyword> - same as /user",
    "查询用户 <关键词>",
    "",
    "Keyword can be user ID, WeChat name, iMessage ID, or bound pool email."
  ].join("\n");
}

function parseTelegramCommand(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { name: "", query: "" };
  const normalized = trimmed.replace(/\s+/g, " ");
  const lower = normalized.toLowerCase();
  for (const prefix of ["/start", "/help", "help", "帮助"]) {
    if (lower === prefix || normalized === prefix) return { name: "help", query: "" };
  }
  const userMatch = normalized.match(/^(?:\/user|\/u|查询用户|用户)\s+(.+)$/i);
  if (userMatch) return { name: "user", query: userMatch[1].trim() };
  return { name: "unknown", query: "" };
}

function formatTelegramDate(value) {
  if (!value) return "-";
  if (value === LIFETIME_EXPIRES_AT) return "Lifetime";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function userTelegramStatus(user) {
  if (isUserExpired(user)) return "expired";
  const expires = user?.expiresAt ? new Date(user.expiresAt).getTime() : NaN;
  if (Number.isFinite(expires) && expires - Date.now() <= EXPIRING_SOON_DAYS * 86400000) return "expiring";
  return "ok";
}

function deliveryTutorials() {
  return [
    { platform: "iOS（美区账号密码联系客服）", client: "Shadowrocket", url: "https://pan.baidu.com/s/1EfxrUShiOj5Zmx9TEMIdlw?pwd=nT76" },
    { platform: "Android", client: "Clash", url: "https://oka.lanzouy.com/iq07G2xbb65e" },
    { platform: "Windows", client: "Sparkle", url: "https://oka.lanzouu.com/ijFzd39od4sh" },
    { platform: "macOS", client: "Sparkle", url: "https://oka.lanzouu.com/iVJA93lp0mre" }
  ];
}

function publicDeliveryPayload(user, req) {
  const origin = requestOrigin(req);
  const token = user.subscriptionToken || "";
  return {
    expiresAt: user.expiresAt || "",
    activeGroup: activeUserGroup(user),
    vipLevel: userVipLevel(user),
    subscriptionUrl: `${origin}/sub/${token}`,
    tutorials: deliveryTutorials()
  };
}

function findUsersForTelegram(query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return [];
  const subscriptionMap = subscriptionById();
  return users
    .map(user => ({ user, subscription: subscriptionMap.get(user.subscriptionId) || null }))
    .filter(({ user, subscription }) => {
      const haystack = [
        user.userId,
        user.wechatName,
        user.imessageId,
        ...userImessageIds(user),
        subscription?.email,
        subscription?.serviceProvider,
        subscription?.provider,
        subscription?.url
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(needle);
    })
    .slice(0, 5);
}

function formatTelegramUserResult({ user, subscription }) {
  return [
    `User: ${user.userId || user.wechatName || user.id}`,
    `Status: ${userTelegramStatus(user)}`,
    `Expires: ${formatTelegramDate(user.expiresAt)}`,
    `Duration: ${user.duration || "-"}`,
    `Active group: ${activeUserGroup(user)}`,
    `Paid: ${user.actualPaid ?? "-"}`,
    `iMessage: ${userImessageIds(user).join(", ") || "-"}`,
    `Pool: ${subscription?.email || subscription?.name || "-"}`,
    `Provider: ${normalizeServiceProvider({}, subscription || {})}`,
    `Pool expires: ${formatTelegramDate(subscription?.metrics?.expireAt)}`,
    `Remaining: ${notifier.formatBytes(subscription?.metrics?.remainingBytes)}`,
    `Mode: ${user.outputMode || "subconverter"}`
  ].join("\n");
}

async function handleTelegramCommand(update) {
  const { chatId, text } = telegramCommandText(update);
  if (!chatId || !text) return { ignored: true };
  if (!telegramAuthorizedChat(chatId)) {
    await notifier.sendTelegram({ chatId, text: "Unauthorized chat." });
    return { ok: true, unauthorized: true };
  }

  const command = parseTelegramCommand(text);
  if (command.name === "help") {
    await notifier.sendTelegram({ chatId, text: telegramHelpText() });
    return { ok: true, command: "help" };
  }
  if (command.name === "user") {
    const matches = findUsersForTelegram(command.query);
    const response = matches.length
      ? matches.map(formatTelegramUserResult).join("\n\n---\n\n")
      : `No user matched: ${command.query}`;
    await notifier.sendTelegram({ chatId, text: response.slice(0, 3900) });
    return { ok: true, command: "user", matches: matches.length };
  }

  await notifier.sendTelegram({ chatId, text: telegramHelpText() });
  return { ok: true, command: "unknown" };
}

async function handleApi(req, res, pathname) {
  const relayApiMatch = pathname.match(/^\/api\/sub\/([^/]+)$/);
  if (relayApiMatch && req.method === "GET") {
    await handleRelaySubscription(req, res, relayApiMatch[1]);
    return;
  }

  const publicDeliveryMatch = pathname.match(/^\/api\/public\/delivery\/([^/]+)$/);
  if (publicDeliveryMatch && req.method === "GET") {
    await loadLatestData();
    const token = decodeURIComponent(publicDeliveryMatch[1]);
    const user = users.find(item => item.subscriptionToken === token);
    if (!user) {
      sendJson(res, 404, { error: "订阅不存在或已失效，请联系客服。" });
      return;
    }
    sendJson(res, 200, publicDeliveryPayload(user, req));
    return;
  }


  if (pathname === "/api/auth/register" && req.method === "POST") {
    try {
      await loadLatestData();
      const payload = await readJson(req);
      const email = normalizeAccountEmail(payload.email);
      const password = validateAccountPassword(payload.password);
      if (accounts.some(item => item.email === email)) {
        sendJson(res, 409, { error: "该邮箱已有账户，请直接登录或重置密码。" });
        return;
      }
      if (users.some(item => String(item.userId || item.email || "").trim().toLowerCase() === email)) {
        sendJson(res, 409, { error: "该邮箱已有历史订阅，请联系管理员发送账户认领邮件。" });
        return;
      }
      const now = new Date().toISOString();
      const account = { id: crypto.randomUUID(), email, passwordHash: hashAccountPassword(password), status: "active", linkedUserId: "", createdAt: now, updatedAt: now };
      accounts.unshift(account);
      await saveAccounts();
      const token = makeSessionToken({ role: "user", accountId: account.id, email }, REMEMBER_MAX_AGE_SECONDS);
      sendJson(res, 201, { ok: true, role: "user", email }, { "set-cookie": authCookie(req, token, REMEMBER_MAX_AGE_SECONDS) });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    try {
      const payload = await readJson(req);
      const account = String(payload.account || payload.email || "").trim();
      const password = String(payload.password || "");
      const remember = Boolean(payload.remember);
      const maxAgeSeconds = remember ? REMEMBER_MAX_AGE_SECONDS : SESSION_MAX_AGE_SECONDS;
      const cookieMaxAge = remember ? maxAgeSeconds : null;
      if (safeEqual(account, ADMIN_USERNAME) && safeEqual(password, ADMIN_PASSWORD)) {
        const token = makeSessionToken({ role: "admin", account: ADMIN_USERNAME }, maxAgeSeconds);
        sendJson(res, 200, { ok: true, role: "admin", account: ADMIN_USERNAME }, { "set-cookie": authCookie(req, token, cookieMaxAge) });
        return;
      }
      void loadLatestData();
      const email = normalizeAccountEmail(account);
      const userAccount = accounts.find(item => item.email === email && item.status === "active");
      if (!userAccount || !verifyAccountPassword(password, userAccount.passwordHash)) {
        sendJson(res, 401, { error: "邮箱或密码不正确。" });
        return;
      }
      const token = makeSessionToken({ role: "user", accountId: userAccount.id, email }, maxAgeSeconds);
      sendJson(res, 200, { ok: true, role: "user", email }, { "set-cookie": authCookie(req, token, cookieMaxAge) });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/auth/forgot-password" && req.method === "POST") {
    try {
      await loadLatestData();
      const payload = await readJson(req);
      const email = normalizeAccountEmail(payload.email);
      let account = accounts.find(item => item.email === email && item.status === "active");
      if (!account) {
        const user = users.find(item => item.email === email);
        account = user ? accounts.find(item => item.linkedUserId === user.id && item.status === "active") : null;
        if (account) {
          account.email = email;
          account.updatedAt = new Date().toISOString();
          await saveAccounts();
        }
      }
      if (account) {
        const token = crypto.randomBytes(32).toString("base64url");
        account.resetTokenHash = tokenHash(token);
        account.resetTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        account.updatedAt = new Date().toISOString();
        await saveAccounts();
        try {
          await sendAccountActionMail({ to: email, subject: "重置账户密码", title: "请点击下面的链接重置密码", url: accountActionUrl(req, "/reset-password", token) });
        } catch (error) {
          console.error(`Password reset email failed for ${email}:`, error.message);
        }
      }
      sendJson(res, 200, { ok: true, message: "如果该邮箱存在，重置链接将发送到邮箱。" });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/auth/reset-password" && req.method === "POST") {
    try {
      await loadLatestData();
      const payload = await readJson(req);
      const password = validateAccountPassword(payload.password);
      const hash = tokenHash(payload.token);
      const account = accounts.find(item => (item.resetTokenHash === hash || item.claimTokenHash === hash));
      const expiresAt = account?.resetTokenHash === hash ? account.resetTokenExpiresAt : account?.claimTokenExpiresAt;
      if (!account || !expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
        sendJson(res, 400, { error: "链接无效或已过期。" });
        return;
      }
      account.passwordHash = hashAccountPassword(password);
      account.status = "active";
      delete account.resetTokenHash;
      delete account.resetTokenExpiresAt;
      delete account.claimTokenHash;
      delete account.claimTokenExpiresAt;
      account.updatedAt = new Date().toISOString();
      await saveAccounts();
      sendJson(res, 200, { ok: true });
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
    sendJson(res, 200, {
      ok: true,
      role: session.role,
      account: session.role === "admin" ? session.account : session.email,
      email: session.email || ""
    });
    return;
  }

  if (pathname === "/api/auth/password" && req.method === "PUT") {
    const session = requireUser(req, res);
    if (!session) return;
    try {
      const account = accountBySession(session);
      const payload = await readJson(req);
      if (!account || !verifyAccountPassword(payload.currentPassword, account.passwordHash)) {
        sendJson(res, 400, { error: "当前密码不正确。" });
        return;
      }
      account.passwordHash = hashAccountPassword(validateAccountPassword(payload.password));
      account.updatedAt = new Date().toISOString();
      await saveAccounts();
      sendJson(res, 200, { ok: true }, { "set-cookie": clearAuthCookie(req) });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/account/overview" && req.method === "GET") {
    const session = requireUser(req, res);
    if (!session) return;
    await loadLatestData();
    const account = accountBySession(session);
    const user = account?.linkedUserId ? users.find(item => item.id === account.linkedUserId) : null;
    const plan = user ? publicPricing().find(item => item.group === activeUserGroup(user)) : null;
    sendJson(res, 200, {
      email: account.email,
      createdAt: account.createdAt,
      vipLevel: user ? userVipLevel(user) : "vip1",
      vipSpend: user ? userVipSpend(user) : 0,
      vipDiscountPercent: vipDiscountPercent(user ? userVipLevel(user) : "vip1"),
      subscription: user ? {
        ...publicDeliveryPayload(user, req),
        id: user.id,
        status: isUserExpired(user) ? "expired" : "active",
        purchasedAt: user.purchasedAt || "",
        duration: user.duration || "",
        cashValue: remainingPlanCashValue(user),
        traffic: plan?.traffic || "-",
        devices: plan?.[`${user.duration}Devices`] || "-"
      } : null,
      orders: paymentOrders.filter(item => item.accountId === account.id).slice(0, 5).map(publicPaymentOrder),
      announcements: publicAnnouncements()
    });
    return;
  }

  if (pathname === "/api/account/orders" && req.method === "GET") {
    const session = requireUser(req, res);
    if (!session) return;
    await loadLatestData();
    sendJson(res, 200, paymentOrders.filter(item => item.accountId === session.accountId).map(publicPaymentOrder));
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
      if (dataStore.kind === "postgres") {
        const startedAt = Date.now();
        await dataStore.ping();
        services.database = { status: "ok", latency: Date.now() - startedAt };
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

    if (notifier.isTelegramConfigured()) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const startedAt = Date.now();
      try {
        await notifier.checkTelegram({ signal: controller.signal });
        services.telegram = { status: "ok", latency: Date.now() - startedAt };
      } catch (error) {
        services.telegram = { status: "error", message: error.message };
      } finally {
        clearTimeout(timer);
      }
    } else {
      services.telegram = { status: "unconfigured" };
    }

    const mailConfig = notifier.getMailerConfig();
    if (mailConfig.resendApiKey) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const startedAt = Date.now();
      try {
        const response = await fetch("https://api.resend.com/domains", {
          headers: { authorization: `Bearer ${mailConfig.resendApiKey}` },
          signal: controller.signal
        });
        services.resend = { status: response.status < 500 ? "ok" : "error", latency: Date.now() - startedAt };
      } catch (error) {
        services.resend = { status: "error", message: error.message };
      } finally {
        clearTimeout(timer);
      }
    } else {
      services.resend = { status: "unconfigured" };
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

  if (pathname === "/api/alerts/test" && req.method === "GET" && isLocalRequest(req)) {
    try {
      const result = await sendAlertTestMessage();
      sendJson(res, 200, { ok: true, localOnly: true, ...result });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/payments/config-status" && req.method === "GET" && isLocalRequest(req)) {
    const config = paymentConfig();
    sendJson(res, 200, {
      apiBaseUrl: config.apiBaseUrl,
      merchantId: Boolean(config.merchantId),
      merchantSecret: Boolean(config.merchantSecret),
      channelCode: Boolean(config.channelCode),
      notifyUrl: config.notifyUrl || `${requestOrigin(req)}/api/payments/callback`
    });
    return;
  }

  if (pathname === "/api/public/pricing" && req.method === "GET") {
    await loadLatestData();
    sendJson(res, 200, publicPricing());
    return;
  }

  if (pathname === "/api/public/sales-settings" && req.method === "GET") {
    await loadLatestData();
    sendJson(res, 200, { faqs: currentSalesSettings().faqs.filter(item => item.enabled !== false).map(({ id, question, answer }) => ({ id, question, answer })) });
    return;
  }

  const telegramWebhookMatch = pathname.match(/^\/api\/telegram\/webhook\/([^/]+)$/);
  if (telegramWebhookMatch && req.method === "POST") {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET || INTERNAL_TOKEN;
    if (!safeEqual(telegramWebhookMatch[1], expectedSecret)) {
      sendJson(res, 403, { error: "Forbidden." });
      return;
    }
    try {
      await loadLatestData();
      const update = await readJson(req);
      const result = await handleTelegramCommand(update);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      console.error("Telegram webhook failed:", error.message);
      sendJson(res, 200, { ok: false, error: error.message });
    }
    return;
  }

  if (pathname === "/api/payments/callback" && req.method === "POST") {
    try {
      const result = await handlePaymentCallback(req);
      res.writeHead(result.statusCode, { "content-type": "text/plain; charset=utf-8" });
      res.end(result.body);
    } catch (error) {
      console.error("Payment callback failed:", error.message);
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("fail");
    }
    return;
  }

  if (pathname === "/api/payments/orders" && req.method === "POST") {
    const session = requireUser(req, res);
    if (!session) return;
    try {
      const payload = await readJson(req);
      const account = accountBySession(session);
      const order = await createPaymentOrder(payload, req, account);
      sendJson(res, 201, publicPaymentOrder(order));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/payments/quote" && req.method === "POST") {
    const session = requireUser(req, res);
    if (!session) return;
    try {
      const payload = await readJson(req);
      const account = accountBySession(session);
      sendJson(res, 200, paymentQuote(payload.optionId, payload.couponCode, undefined, userVipLevel(userForAccount(account)), account.id));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const publicPaymentOrderMatch = pathname.match(/^\/api\/payments\/orders\/([^/]+)$/);
  if (publicPaymentOrderMatch && req.method === "GET") {
    try {
      const order = paymentOrders.find(item => item.id === publicPaymentOrderMatch[1]);
      if (!order) {
        sendJson(res, 404, { error: "Payment order not found." });
        return;
      }
      if (order.accountId) {
        const session = requireUser(req, res);
        if (!session) return;
        if (order.accountId !== session.accountId) {
          sendJson(res, 404, { error: "Payment order not found." });
          return;
        }
      }
      const config = paymentConfig();
      const shouldQueryGateway = order.status === "pending" && config.merchantId && config.merchantSecret;
      const refreshedOrder = shouldQueryGateway ? await refreshPaymentOrder(order) : order;
      if (refreshedOrder.status === "paid") {
        try {
          await fulfillPaymentOrder(refreshedOrder, req);
        } catch (error) {
          refreshedOrder.fulfillmentStatus = "failed";
          refreshedOrder.fulfillmentError = error.message;
          refreshedOrder.updatedAt = new Date().toISOString();
          await savePaymentOrders();
        }
      }
      sendJson(res, 200, publicPaymentOrder(refreshedOrder));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (!requireAdmin(req, res)) return;
  await loadLatestData();

  if (pathname === "/api/sales-settings" && req.method === "GET") {
    sendJson(res, 200, salesSettingsWithCouponUsage());
    return;
  }

  if (pathname === "/api/sales-settings" && req.method === "PUT") {
    try {
      salesSettings = [normalizeSalesSettings(await readJson(req))];
      await saveSalesSettings();
      sendJson(res, 200, salesSettingsWithCouponUsage());
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const accountInviteMatch = pathname.match(/^\/api\/users\/([^/]+)\/account-invite$/);
  if (accountInviteMatch && req.method === "POST") {
    const user = users.find(item => item.id === accountInviteMatch[1]);
    if (!user) {
      sendJson(res, 404, { error: "用户不存在。" });
      return;
    }
    try {
      const payload = await readJson(req);
      const email = normalizeAccountEmail(payload.email || user.email || userImessageIds(user).find(value => value.includes("@")) || user.userId);
      let account = accounts.find(item => item.email === email || item.linkedUserId === user.id);
      if (account?.status === "active") {
        sendJson(res, 409, { error: "该用户已经认领账户。" });
        return;
      }
      const now = new Date().toISOString();
      if (!account) {
        account = { id: crypto.randomUUID(), email, passwordHash: "", status: "invited", linkedUserId: user.id, createdAt: now, updatedAt: now };
        accounts.unshift(account);
      }
      const token = crypto.randomBytes(32).toString("base64url");
      account.email = email;
      account.linkedUserId = user.id;
      account.status = "invited";
      account.claimTokenHash = tokenHash(token);
      account.claimTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      account.updatedAt = now;
      await saveAccounts();
      await sendAccountActionMail({ to: email, subject: "认领你的订阅账户", title: "请点击下面的链接设置密码并认领订阅", url: accountActionUrl(req, "/reset-password", token) });
      sendJson(res, 200, { ok: true, status: "invited" });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/alerts/status" && req.method === "GET") {
    const cfg = notifier.getMailerConfig();
    const telegramCfg = notifier.getTelegramConfig();
    sendJson(res, 200, {
      configured: notifier.isConfigured(),
      channels: {
        mail: {
          configured: notifier.isMailConfigured(),
          to: cfg.to,
          from: cfg.from ? `${cfg.from.slice(0, 3)}***${cfg.from.slice(cfg.from.indexOf("@"))}` : ""
        },
        telegram: {
          configured: notifier.isTelegramConfigured(),
          chatId: telegramCfg.chatId ? `${String(telegramCfg.chatId).slice(0, 4)}***` : ""
        }
      },
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
      const result = await sendAlertTestMessage();
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/alerts/test-mail" && req.method === "POST") {
    try {
      if (!notifier.isMailConfigured()) throw Object.assign(new Error("邮件服务尚未配置。"), { statusCode: 400 });
      const result = await sendAlertTestMessage({ mailOnly: true });
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { error: error.message });
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
      reason: recommendation.reason,
      expiresAt
    });
    return;
  }


  if (pathname === "/api/users" && req.method === "GET") {
    await loadLatestData();
    const subscriptionsById = subscriptionById();
    sendJson(res, 200, users.map(user => publicUser(user, subscriptionsById)));
    return;
  }

  if (pathname === "/api/bills" && req.method === "GET") {
    await loadLatestData();
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
      normalized.outputMode = userOutputMode(payload);
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
      if (ids.some(id => {
        const bill = bills.find(entry => entry.id === id);
        return bill && userHasClaimedAccount(bill.userId);
      })) throw new Error("已认领账户的账单不能冲正或删除。");

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
      if (userHasClaimedAccount(bill.userId)) {
        sendJson(res, 400, { error: "已认领账户的账单不能冲正。" });
        return;
      }
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

    if (req.method === "GET") {
      sendJson(res, 200, publicBillDetail(bill));
      return;
    }

    if (req.method === "DELETE") {
      if (userHasClaimedAccount(bill.userId)) {
        sendJson(res, 400, { error: "已认领账户的账单不能删除。" });
        return;
      }
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
    sendJson(res, 200, publicPricing());
    return;
  }

  if (pathname === "/api/pricing" && req.method === "PUT") {
    try {
      const payload = await readJson(req);
      if (!Array.isArray(payload)) { sendJson(res, 400, { error: "payload must be an array." }); return; }
      const GROUPS = ["basic", "pro", "ultra"];
      const DURATIONS = ["monthly", "quarterly", "half_yearly", "yearly"];
      const UNLIMITED_PRICE_KEYS = { monthly: "unlimitedMonthly", quarterly: "unlimitedQuarterly", half_yearly: "unlimitedHalfYearly", yearly: "unlimitedYearly" };
      const TEXT_FIELDS = ["name", "title", "description", "traffic"];
      for (const item of payload) {
        if (!GROUPS.includes(item.group)) continue;
        let row = pricing.find(r => r.group === item.group);
        if (!row) { row = { id: item.group, group: item.group }; pricing.push(row); }
        for (const dur of DURATIONS) {
          for (const priceKey of [dur, UNLIMITED_PRICE_KEYS[dur]]) {
            if (item[priceKey] === undefined) continue;
            const val = Number(item[priceKey]);
            if (Number.isNaN(val) || val < 0) { sendJson(res, 400, { error: `${item.group}.${priceKey} 价格无效。` }); return; }
            row[priceKey] = val;
          }
          const devicesKey = `${dur}Devices`;
          if (item[devicesKey] !== undefined) {
            const devices = Number(item[devicesKey]);
            if (!Number.isInteger(devices) || devices < 0) { sendJson(res, 400, { error: `${item.group}.${devicesKey} 设备数无效。` }); return; }
            row[devicesKey] = devices;
          }
        }
        for (const field of TEXT_FIELDS) row[field] = String(item[field] ?? "").trim().slice(0, field === "description" ? 120 : 60);
        row.recommended = Boolean(item.recommended);
        row.features = Array.isArray(item.features) ? item.features.map(value => String(value).trim()).filter(Boolean).slice(0, 10) : [];
        row.unavailableFeatures = Array.isArray(item.unavailableFeatures) ? item.unavailableFeatures.map(value => String(value).trim()).filter(Boolean).slice(0, 10) : [];
      }
      await savePricing();
      sendJson(res, 200, publicPricing());
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

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)(?:\/(renew|pool|gift))?$/);
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
        if (userHasClaimedAccount(item.id)) throw new Error("已认领用户只能通过自主购买变更付款信息。");
        const payload = await readJson(req);
        const before = userSnapshotForLog(item);
        const fromSubscription = subscriptions.find(entry => entry.id === item.subscriptionId);
        if (payload.outputMode !== undefined) item.outputMode = userOutputMode(payload);
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

    if (action === "gift" && req.method === "POST") {
      try {
        const payload = await readJson(req);
        const expiresAt = calculateGiftExpiry(item, payload.days);
        if (!expiresAt) throw new Error("请输入正确的赠送天数。");
        const recommendation = recommendSubscriptionForExpiry(expiresAt, { ignoredUserId: item.id });
        if (payload.preview === true) {
          sendJson(res, 200, {
            expiresAt,
            subscription: recommendation.subscription ? publicItem(recommendation.subscription) : null,
            reason: recommendation.reason
          });
          return;
        }
        const toSubscription = subscriptions.find(entry => entry.id === String(payload.subscriptionId || recommendation.subscription?.id || ""));
        if (!toSubscription) throw new Error("请选择有效的订阅池。");
        const poolExpiresAt = Date.parse(toSubscription.metrics?.expireAt || "");
        if (toSubscription.enabled === false || !Number.isFinite(poolExpiresAt) || poolExpiresAt <= Date.now()) throw new Error("请选择已启用且未过期的订阅池。");
        const beforeExpiresAt = item.expiresAt || null;
        const fromSubscription = subscriptions.find(entry => entry.id === item.subscriptionId) || null;
        item.expiresAt = expiresAt;
        item.subscriptionId = toSubscription.id;
        item.updatedAt = new Date().toISOString();
        appendUserLogToUser(item, createUserLog({
          event: "user-action",
          status: "recorded",
          reason: "user-gifted",
          fromSubscription,
          toSubscription,
          req,
          message: userActionMessage("user-gifted", { days: Number(payload.days), beforeExpiresAt, afterExpiresAt: expiresAt }),
          details: { days: Number(payload.days), beforeExpiresAt, afterExpiresAt: expiresAt }
        }));
        await saveUsers();
        sendJson(res, 200, publicUser(item));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (action === "pool" && req.method === "POST") {
      try {
        const payload = await readJson(req);
        const toSubscription = subscriptions.find(entry => entry.id === String(payload.subscriptionId || ""));
        if (!toSubscription) throw new Error("请选择有效的订阅池。");
        const poolExpiresAt = Date.parse(toSubscription.metrics?.expireAt || "");
        if (!Number.isFinite(poolExpiresAt) || poolExpiresAt <= Date.now()) throw new Error("无有效到期日或已过期的订阅池不能绑定用户。");
        if (toSubscription.enabled === false && payload.allowDisabled !== true) throw new Error("该订阅池尚未启用。");
        const fromSubscription = subscriptions.find(entry => entry.id === item.subscriptionId) || null;
        if (fromSubscription?.id !== toSubscription.id) {
          item.subscriptionId = toSubscription.id;
          item.updatedAt = new Date().toISOString();
          appendUserLogToUser(item, createUserLog({
            event: "user-action",
            status: "recorded",
            reason: "manual-pool-changed",
            fromSubscription,
            toSubscription,
            req,
            message: userActionMessage("manual-pool-changed", {
              fromSubscriptionLabel: subscriptionLogLabel(fromSubscription),
              toSubscriptionLabel: subscriptionLogLabel(toSubscription)
            })
          }));
          await saveUsers();
        }
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
        if (userHasClaimedAccount(item.id)) throw new Error("已认领账户仅允许换池或赠送时长。");
        const linkedAccount = accounts.find(account => account.linkedUserId === item.id);
        const before = userSnapshotForLog(item);
        const fromSubscription = subscriptions.find(entry => entry.id === item.subscriptionId);
        Object.assign(item, normalizeUser(payload, item));
        if (payload.outputMode !== undefined) item.outputMode = userOutputMode(payload);
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
        const accountEmailChanged = payload.email !== undefined && linkedAccount && linkedAccount.email !== item.email;
        if (accountEmailChanged) {
          if (accounts.some(account => account.id !== linkedAccount.id && account.email === item.email)) throw new Error("该邮箱已被其他账户使用。");
          linkedAccount.email = item.email;
          linkedAccount.updatedAt = new Date().toISOString();
        }
        await saveUsers();
        if (accountEmailChanged) await saveAccounts();
        sendJson(res, 200, publicUser(item));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === "DELETE") {
      if (userHasClaimedAccount(item.id)) {
        sendJson(res, 400, { error: "已认领账户不能删除。" });
        return;
      }
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
  const isLoginRoute = /^\/(?:login|register|forgot-password|reset-password)\/?$/.test(requestedPath) || requestedPath === "/login.html";
  const isPublicAppRoute = /^\/delivery\/[^/]+\/?$/.test(requestedPath) || /^\/(?:pricing|buy)\/?$/.test(requestedPath) || isLoginRoute;
  const session = currentSession(req);
  if (requestedPath === "/login.html") {
    res.writeHead(302, {
      "location": "/login",
      "cache-control": "no-store, max-age=0"
    });
    res.end();
    return;
  }
  if ((requestedPath === "/index.html" || isAppRoute) && !isPublicAppRoute && !session) {
    res.writeHead(302, {
      "location": "/login",
      "cache-control": "no-store, max-age=0"
    });
    res.end();
    return;
  }
  if (requestedPath === "/index.html" && session?.role === "user") {
    res.writeHead(302, { "location": "/account", "cache-control": "no-store, max-age=0" });
    res.end();
    return;
  }
  if (isAppRoute && requestedPath.startsWith("/account") && session?.role !== "user") {
    res.writeHead(302, { "location": session?.role === "admin" ? "/dashboard" : "/login", "cache-control": "no-store, max-age=0" });
    res.end();
    return;
  }
  if (isAppRoute && !isPublicAppRoute && !requestedPath.startsWith("/account") && session?.role === "user") {
    res.writeHead(302, { "location": "/account", "cache-control": "no-store, max-age=0" });
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
  closeDataStore: () => dataStore.close(),
  ensureDataFile,
  handleApi,
  sendJson,
  parseSubscriptionUserInfo,
  parseBodyHints,
  parseAccountUnavailable,
  calculateExpiry,
  calculateGiftExpiry,
  extractClashConfigBody,
  statusFor,
  toBytes,
  isBrowserNavigationRequest,
  normalizeSubconverterConfigParam,
  defaultSubconverterPreset,
  userOutputMode,
  poolMetricUnavailableReason,
  fallbackCandidateRank,
  startOfUtcDate,
  paymentQuote,
  vipLevelForSpend,
  vipDiscountPercent,
  paymentChannelCode,
  paymentStatusError,
  paymentAmountError,
  paymentOrderExpiresAt,
  isPaymentOrderExpired,
  normalizeSalesSettings
});
