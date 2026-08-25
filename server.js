const http = require("http");
const { execFileSync } = require("child_process");
const fsSync = require("fs");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { createDataStore } = require("./database");
const { customerIDFromUUID, nextCustomerID } = require("./customer-id");
const { loadLocalEnv } = require("./env");
const { assertXuiRequestAllowed, requestXui, requestXuiService } = require("./xui-client");
const yaml = require("js-yaml");
const notifier = require("./notifier");
const packageJson = require("./package.json");

loadLocalEnv();

const logger = require("./logger");
const xuiLogger = logger.child({ component: "xui" });
const PORT = Number(process.env.PORT || 3000);
const LOCAL_DATABASE_URL = process.env.VERCEL === "1" ? "" : process.env.LOCAL_DATABASE_URL || "";
const DATABASE_URL = LOCAL_DATABASE_URL || process.env.DATABASE_URL || "";
const DIST_DIR = path.join(__dirname, "dist");
const PUBLIC_DIR = fsSync.existsSync(path.join(DIST_DIR, "index.html")) ? DIST_DIR : path.join(__dirname, "public");
const MARKDOWN_UPLOAD_DIR = path.resolve(process.env.MARKDOWN_UPLOAD_DIR || path.join(__dirname, "data", "markdown-uploads"));
const MARKDOWN_IMAGE_MAX_BYTES = Number(process.env.MARKDOWN_IMAGE_MAX_BYTES || 8 * 1024 * 1024);
const BUILD_META_FILE = process.env.BUILD_META_FILE || path.join(__dirname, "build-meta.json");
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS || 24 * 60 * 60 * 1000);
const LOW_TRAFFIC_BYTES = Number(process.env.LOW_TRAFFIC_BYTES || 10 * 1024 * 1024 * 1024);
const EXPIRING_SOON_DAYS = Number(process.env.EXPIRING_SOON_DAYS || 3);
const RELAY_BEFORE_EXPIRY_DAYS = Number(process.env.RELAY_BEFORE_EXPIRY_DAYS || 10);
const RELAY_AFTER_EXPIRY_DAYS = Number(process.env.RELAY_AFTER_EXPIRY_DAYS || 10);
const RELAY_DEBUG_LOGS = process.env.RELAY_DEBUG_LOGS === "true";
const POOL_CONFIG_CACHE_TTL_MS = Number(process.env.POOL_CONFIG_CACHE_TTL_MS || 24 * 60 * 60 * 1000);
const REFRESH_CONCURRENCY = Math.max(1, Number(process.env.REFRESH_CONCURRENCY || 5));
const SUB_CONVERTER_URL = (process.env.SUB_CONVERTER_URL || "").replace(/\/+$/, "");
const XUI_BASE_URL = (process.env.XUI_BASE_URL || "").replace(/\/+$/, "");
const XUI_API_TOKEN = String(process.env.XUI_API_TOKEN || "").trim();
const XUI_PANEL_NAME = String(process.env.XUI_PANEL_NAME || "主面板").trim();
const XUI_SUBSCRIPTION_BASE_URL = (process.env.XUI_SUBSCRIPTION_BASE_URL || "https://panel.webprovider.top:2096").replace(/\/+$/, "");
const XUI_TIMEOUT_MS = Math.max(1000, Number(process.env.XUI_TIMEOUT_MS || 15000));
const XUI_METADATA_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const XUI_SERVICE_URL = (process.env.XUI_SERVICE_URL || "").replace(/\/+$/, "");
const XUI_SERVICE_TOKEN = String(process.env.XUI_SERVICE_TOKEN || "").trim();
const XUI_READ_ONLY = process.env.XUI_READ_ONLY === "true";
const XUI_TRAFFIC_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const XUI_DEFAULT_TRAFFIC_BYTES = 100 * 1024 ** 3;
const XUI_VISION_FLOW = "xtls-rprx-vision";
const LEGACY_RECURRING_TRAFFIC_GB = Object.freeze({ basic: 50, pro: 100, ultra: 100 });
const TRAFFIC_PACK_BYTES = 100 * 1024 ** 3;
const TRAFFIC_PACK_PRICE = 20;
const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;
const DEFAULT_SUBCONVERTER_TARGET = "clash";
const SUBCONVERTER_BOOLEAN_DEFAULTS = Object.freeze({
  emoji: true,
  udp: true,
  tfo: false,
  scv: false,
  sort: false,
  list: false,
  fdn: true,
  insert: true,
  expand: true,
  classic: false,
  new_name: false,
  append_type: false,
  append_info: true,
  strict: false
});
const DEFAULT_SERVICE_PROVIDER = "YKK Cloud";
const FRIENDS_PRODUCT_ID = "friends-lifetime-unlimited";
const LEGACY_CUSTOM_PRODUCT_ID = "legacy-custom-entitlement";
const DEFAULT_PRICING = [
  { id: "basic", group: "basic", name: "BASIC", title: "基本套餐", description: "适合轻量网页浏览和社交软件", recommended: false, traffic: "每月 50G", trafficBaseGb: 50, trafficMaxTier: 10, trafficTierMarkupPercent: 50, features: ["基础线路", "流媒体支持", "在线客服"], unavailableFeatures: ["稳定 GPT 解锁", "国际内网专线", "独享级带宽体验"], monthlyDevices: 1, quarterlyDevices: 2, half_yearlyDevices: 3, yearlyDevices: 3, monthly: 39, quarterly: 109, half_yearly: 199, yearly: 369, lifetimeName: "BASIC 不限时", lifetimeTitle: "固定流量不限时长", lifetimeDescription: "流量用完为止，不设到期时间", lifetimeTraffic: "100G 固定流量", lifetimeTrafficBytes: 100 * 1024 ** 3, lifetimePrice: 79, lifetimeDevices: 1, lineType: "self_hosted" },
  { id: "pro", group: "pro", name: "PRO", title: "高级套餐", description: "优质节点与稳定流媒体体验", recommended: true, traffic: "每月 200G", trafficBaseGb: 200, trafficMaxTier: 10, trafficTierMarkupPercent: 50, features: ["优质节点", "普通专线连接", "稳定 GPT 解锁"], unavailableFeatures: ["国际内网专线", "独享级带宽体验"], monthlyDevices: 3, quarterlyDevices: 3, half_yearlyDevices: 5, yearlyDevices: 5, monthly: 49, quarterly: 129, half_yearly: 229, yearly: 429, lifetimeName: "PRO 不限时", lifetimeTitle: "固定流量不限时长", lifetimeDescription: "流量用完为止，不设到期时间", lifetimeTraffic: "200G 固定流量", lifetimeTrafficBytes: 200 * 1024 ** 3, lifetimePrice: 95, lifetimeDevices: 3, lifetimeRecommended: true, lineType: "self_hosted" },
  { id: "ultra", group: "ultra", name: "ULTRA", title: "极致套餐", description: "国际内网专线与低延迟体验", recommended: false, traffic: "每月 300G", trafficBaseGb: 300, trafficMaxTier: 10, trafficTierMarkupPercent: 50, features: ["国际内网专线", "独享级带宽体验", "专属客服支持"], unavailableFeatures: [], monthlyDevices: 1, quarterlyDevices: 2, half_yearlyDevices: 3, yearlyDevices: 3, monthly: 89, quarterly: 239, half_yearly: 449, yearly: 859, lifetimeName: "ULTRA 不限时", lifetimeTitle: "固定流量不限时长", lifetimeDescription: "流量用完为止，不设到期时间", lifetimeTraffic: "300G 固定流量", lifetimeTrafficBytes: 300 * 1024 ** 3, lifetimePrice: 129, lifetimeDevices: 1, lineType: "self_hosted" },
  { id: FRIENDS_PRODUCT_ID, group: FRIENDS_PRODUCT_ID, productKind: "plan", internal: true, name: "亲友永久不限量", title: "后台免费授予的永久不限量服务", description: "仅用于亲友账户，不在用户购买页面展示。", enabled: true, recurringDeleted: true, lifetimeName: "亲友永久不限量", lifetimeTitle: "永久有效 · 不限流量", lifetimeDescription: "后台内部授予，不公开售卖。", lifetimeTraffic: "不限流量", lifetimeTrafficBytes: 0, lifetimePrice: 0, lifetimeDevices: 5, lifetimeUnlimited: true, lineType: "self_hosted", features: ["自研线路", "永久有效", "不限流量"], unavailableFeatures: ["不可购买流量包", "不可叠加附加服务"] },
  { id: "traffic_pack", group: "traffic_pack", productKind: "addon", addonType: "traffic_pack", name: "流量包", title: "临时补充当前周期流量", description: "仅适用于已生效的周期性固定流量套餐。", enabled: true, addonPrice: 20, addonTrafficGb: 100, addonUnit: "100 GB", addonDeliveryMode: "automatic", addonDeliveryDescription: "支付成功后立即加入当前周期，套餐续费、更换或月度重置后失效。" },
  { id: "home_ip", group: "home_ip", productKind: "addon", addonType: "home_ip", name: "家宽 IP 定制", title: "按地区提供家庭宽带出口 IP", description: "可随周期性套餐购买，服务有效期 30 天。", enabled: true, addonPrice: 0, addonUnit: "30 天", addonDurationDays: 30, addonDeliveryMode: "manual", addonDeliveryDescription: "支付成功后进入人工交付，客服将联系确认使用信息。", addonRegions: [{ id: "us", name: "美国", price: 40 }, { id: "uk", name: "英国", price: 40 }, { id: "th", name: "泰国", price: 55 }, { id: "vn", name: "越南", price: 60 }] },
  { id: "tiktok_custom", group: "tiktok_custom", productKind: "custom", addonType: "manual", name: "TikTok 专线定制", title: "根据地区、账号规模和业务场景人工报价", description: "提交需求后由客服确认线路与最终价格。", enabled: true, addonPrice: 0, addonUnit: "项", addonDeliveryMode: "manual", addonDeliveryDescription: "联系客服提交需求，确认方案后创建人工订单。" },
  { id: "emby_custom", group: "emby_custom", productKind: "custom", addonType: "manual", name: "Emby 影视服务", title: "人工确认服务器与使用期限", description: "由客服根据库存和服务周期报价交付。", enabled: true, addonPrice: 0, addonUnit: "项", addonDeliveryMode: "manual", addonDeliveryDescription: "联系客服确认账号、期限和交付方式。" }
];
function publicPricing() {
  return (pricing.length ? pricing : DEFAULT_PRICING).map(saved => {
    const defaultRow = DEFAULT_PRICING.find(item => item.group === saved.group) || {};
    const product = { ...defaultRow, ...saved, ...(!["addon", "custom"].includes(saved.productKind) ? { lineType: "self_hosted" } : {}), enabled: saved.enabled !== false, features: Array.isArray(saved.features) ? saved.features : defaultRow.features || [], unavailableFeatures: Array.isArray(saved.unavailableFeatures) ? saved.unavailableFeatures : defaultRow.unavailableFeatures || [] };
    const isPlan = !product.productKind || product.productKind === "plan";
    return { ...product, availability: { recurring: isPlan && product.enabled && product.recurringDeleted !== true && product.stock !== 0, lifetime: isPlan && product.enabled && product.lifetimeDeleted !== true && product.lifetimeEnabled !== false && product.lifetimeStock !== 0 && Number.isFinite(Number(product.lifetimePrice)), addon: ["addon", "custom"].includes(product.productKind || "") && product.enabled && product.stock !== 0 } };
  });
}

function productVariantAvailable(product, variant) {
  return product?.availability?.[variant] === true;
}
const PRICING_PERIODS = {
  30: { priceKey: "monthly", duration: "monthly", label: "月付 30天" },
  90: { priceKey: "quarterly", duration: "quarterly", label: "季付 90天" },
  180: { priceKey: "half_yearly", duration: "half_yearly", label: "半年付 180天" },
  360: { priceKey: "yearly", duration: "yearly", label: "年付 360天" }
};

function pricingProduct(group) {
  return publicPricing().find(item => item.group === group) || null;
}

function recurringTrafficConfig(plan = {}) {
  const parsed = String(plan.traffic || "").match(/(\d+(?:\.\d+)?)\s*(?:GB|G)/i);
  const baseGb = Number(plan.trafficBaseGb ?? parsed?.[1]);
  const maxTier = Number(plan.trafficMaxTier ?? 10);
  const markupPercent = Number(plan.trafficTierMarkupPercent ?? 50);
  return {
    baseGb: Number.isFinite(baseGb) && baseGb > 0 ? baseGb : 0,
    maxTier: Number.isSafeInteger(maxTier) && maxTier > 0 ? Math.min(maxTier, 50) : 1,
    markupPercent: Number.isFinite(markupPercent) && markupPercent >= 0 ? Math.min(markupPercent, 1000) : 0
  };
}

function normalizeTrafficTier(plan, value) {
  const { maxTier } = recurringTrafficConfig(plan);
  const tier = Number(value ?? 1);
  if (!Number.isSafeInteger(tier) || tier < 1 || tier > maxTier) throw new Error(`流量档位必须为 1-${maxTier} 档。`);
  return tier;
}

function dynamicPaymentPlanOption(optionId) {
  const id = String(optionId || "");
  const lifetimeMatch = id.match(/^(.+)-lifetime$/);
  if (lifetimeMatch) {
    const plan = pricingProduct(lifetimeMatch[1]);
    if (!plan || plan.internal === true || !productVariantAvailable(plan, "lifetime") || plan.lifetimeStock === 0 || !Number.isFinite(Number(plan.lifetimePrice))) return null;
    return { planId: plan.group, planName: plan.lifetimeName || `${plan.name || plan.group} 不限时`, optionLabel: "固定流量 · 不限时", priceKey: "lifetimePrice", duration: "lifetime", group: plan.group, lineType: "self_hosted", lifetime: true, fallbackPrice: Number(plan.lifetimePrice) };
  }
  const recurringMatch = id.match(/^(.+)-(30|90|180|360)$/);
  if (!recurringMatch) return null;
  const plan = pricingProduct(recurringMatch[1]);
  const period = PRICING_PERIODS[recurringMatch[2]];
  if (!plan || plan.internal === true || !productVariantAvailable(plan, "recurring") || plan.stock === 0 || !Number.isFinite(Number(plan[period.priceKey]))) return null;
  return { planId: plan.group, planName: plan.name || plan.group.toUpperCase(), optionLabel: period.label, priceKey: period.priceKey, duration: period.duration, group: plan.group, lineType: "self_hosted", fallbackPrice: Number(plan[period.priceKey]) };
}

function planCycleOptions(plan, selectedOption) {
  if (selectedOption.lifetime) return [{ optionId: `${plan.group}-lifetime`, label: "固定流量 · 不限时", amount: Number(plan.lifetimePrice), devices: Number(plan.lifetimeDevices || 0) }];
  return Object.entries(PRICING_PERIODS).flatMap(([days, period]) => Number.isFinite(Number(plan[period.priceKey]))
    ? [{ optionId: `${plan.group}-${days}`, label: period.label, amount: Number(plan[period.priceKey]), devices: Number(plan[`${period.duration}Devices`] || 0) }]
    : []);
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
for (const row of DEFAULT_PRICING.filter(item => item.lifetimePrice !== undefined && item.internal !== true)) {
  PAYMENT_PLAN_OPTIONS[`${row.group}-lifetime`] = { planId: row.group, planName: row.lifetimeName, optionLabel: "固定流量 · 不限时", priceKey: "lifetimePrice", duration: "lifetime", group: row.group, lifetime: true, fallbackPrice: row.lifetimePrice };
}
if (process.env.NODE_ENV === "test") {
  PAYMENT_PLAN_OPTIONS["pro-test-001"] = { planId: "pro", planName: "PRO", optionLabel: "支付测试 1 元", duration: "monthly", group: "pro", fallbackPrice: 1 };
}
const DEFAULT_PRICING_FAQS = [
  { id: "devices", question: "“可绑定设备”是指什么？", answer: "指同一订阅可同时使用的设备数量，手机、电脑和平板等各计为一台；具体数量以所选套餐和计费周期显示为准。", enabled: true },
  { id: "gpt", question: "哪些套餐支持 GPT 解锁？", answer: "当前 PRO 套餐明确包含稳定 GPT 解锁。其他套餐能力请以套餐卡片的功能列表为准；实际可用性可能受目标平台策略和网络环境影响。", enabled: true },
  { id: "discount", question: "季度、半年和年度套餐如何计算优惠？", answer: "页面折扣以月付价格乘以对应月数作为基准计算，周期价格旁的百分比就是相比连续月付节省的比例。", enabled: true },
  { id: "renewal", question: "套餐未到期时再次购买会怎样？", answer: "新套餐支付成功后会立即覆盖当前套餐，原套餐剩余有效期和流量不再保留。提交订单前会要求再次确认。", enabled: true },
  { id: "delivery", question: "支付后多久生效？可以退款吗？", answer: "支付成功并完成确认后套餐会自动生效。套餐属于即时交付的数字商品，购买后不支持退款。", enabled: true }
];
const DEFAULT_PAYMENT_API_BASE_URL = "http://RfBseViEKZlMAmu7ArWO.itxt002.xyz";
const USER_GROUPS = ["basic", "pro", "ultra"];
const VENDOR_RATINGS = ["S", "A", "B", "C"];
const RATING_OVERRIDE_WINDOW_DAYS = 20;
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
      "User-Agent": "ClashMetaForAndroid/2.11.3.Meta",
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
let paymentSettings = [];
let referralRewards = [];
const dataStore = createDataStore({
  databaseUrl: DATABASE_URL,
  ssl: !LOCAL_DATABASE_URL && process.env.DATABASE_SSL === "true"
});
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

let dataInitializationPromise = null;
let dataInitialized = false;

const PRODUCT_CATALOG_MIGRATION_ID = "product-catalog-v3";

async function ensureProductCatalog() {
  const previous = await dataStore.getRecord("migrationState", PRODUCT_CATALOG_MIGRATION_ID);
  if (previous?.completedAt) return previous;
  let added = 0;
  let backfilled = 0;
  for (const defaultRow of DEFAULT_PRICING) {
    const existing = pricing.find(row => row.group === defaultRow.group);
    if (!existing) {
      pricing.push(structuredClone(defaultRow));
      added++;
      continue;
    }
    for (const [key, value] of Object.entries(defaultRow)) {
      if (existing[key] !== undefined) continue;
      existing[key] = structuredClone(value);
      backfilled++;
    }
  }
  if (added || backfilled) await savePricing();
  const obsoleteInUse = users.some(user => user.currentProductId === "self_hosted" || user.currentOptionId === "self-hosted-test-30" || user.activeGroup === "self_hosted" || user.group === "self_hosted");
  const beforeCleanup = pricing.length;
  if (!obsoleteInUse) pricing = pricing.filter(item => item.group !== "self_hosted");
  const removed = beforeCleanup - pricing.length;
  if (removed) await savePricing();
  const report = { id: PRODUCT_CATALOG_MIGRATION_ID, added, backfilled, removed, completedAt: new Date().toISOString() };
  await dataStore.setRecord("migrationState", PRODUCT_CATALOG_MIGRATION_ID, report);
  console.log(`[migration:${PRODUCT_CATALOG_MIGRATION_ID}] ${JSON.stringify({ added, backfilled, removed })}`);
  return report;
}

async function initializeDataFile() {
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
  paymentSettings = state.paymentSettings || [];
  referralRewards = state.referralRewards || [];
  if (ensureReferralAccountFields()) await saveAccounts();
  lastLoadedAt = Date.now();
  await ensureProductCatalog();
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
  const usersMigrated = ensureUserRelayTokens();
  const cashValuesMigrated = ensureUserCashValues();
  if (usersMigrated || cashValuesMigrated) await saveUsers();
  await ensureUserProductBindings();

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

async function ensureDataFile() {
  if (dataInitialized) return;
  if (dataInitializationPromise) return dataInitializationPromise;

  dataInitializationPromise = initializeDataFile()
    .then(() => {
      dataInitialized = true;
    })
    .finally(() => {
      dataInitializationPromise = null;
    });
  return dataInitializationPromise;
}

let lastLoadedAt = 0;
let _loadingPromise = null;
let _writeGen = 0;
const DATA_CACHE_TTL_MS = Number(process.env.DATA_CACHE_TTL_MS || 5 * 60 * 1000);

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
    paymentSettings = state.paymentSettings || [];
    referralRewards = state.referralRewards || [];
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

async function saveUser(user) {
  _markWritten();
  await dataStore.setRecord("users", user.id, user);
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

async function savePaymentSettings() {
  _markWritten();
  await dataStore.saveCollection("paymentSettings", paymentSettings);
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

function normalizeVendorRating(value) {
  const rating = String(value || "").trim().toUpperCase();
  return VENDOR_RATINGS.includes(rating) ? rating : "";
}

function vendorRatingByName(name) {
  const vendor = vendors.find(item => item.name === name);
  return !vendor || vendor.rating === undefined ? "C" : normalizeVendorRating(vendor.rating);
}

function vendorRatingIndex() {
  const ratings = new Map(subscriptions.map(item => [normalizeServiceProvider({}, item), "C"]));
  for (const vendor of vendors) ratings.set(vendor.name, vendor.rating === undefined ? "C" : normalizeVendorRating(vendor.rating));
  return ratings;
}

function vendorRatingRank(rating) {
  const index = VENDOR_RATINGS.indexOf(normalizeVendorRating(rating));
  return index < 0 ? VENDOR_RATINGS.length : index;
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
  let body = Buffer.from(JSON.stringify(payload));
  if (body.length >= 1024 && /\bgzip\b/.test(String(res.req?.headers?.["accept-encoding"] || ""))) {
    body = zlib.gzipSync(body);
    headers = { ...headers, "content-encoding": "gzip", "vary": "Accept-Encoding" };
  }
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store, max-age=0",
    "pragma": "no-cache",
    "expires": "0",
    ...headers
  });
  res.end(body);
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

function validAccountActionToken(token) {
  const hash = tokenHash(token);
  const account = accounts.find(item => item.resetTokenHash === hash || item.claimTokenHash === hash);
  const expiresAt = account?.resetTokenHash === hash ? account.resetTokenExpiresAt : account?.claimTokenExpiresAt;
  return account && expiresAt && new Date(expiresAt).getTime() > Date.now() ? { account, hash } : null;
}

function accountActionUrl(req, pathName, token) {
  const base = String(process.env.PUBLIC_BASE_URL || requestOrigin(req)).replace(/\/+$/, "");
  return `${base}${pathName}?token=${encodeURIComponent(token)}`;
}

async function sendAccountActionMail({ to, subject, title, url }) {
  await notifier.sendMail({
    to,
    subject,
    text: `${title}\n\n${url}\n\n⚠️请勿直接在邮箱APP点击链接，需要复制到手机浏览器中打开。\n\n链接 30 分钟内有效，且只能使用一次。`,
    html: `<p>${title}</p><p><a href="${url}">${url}</a></p><p style="color:#dc2626;font-weight:700;">⚠️请勿直接在邮箱APP点击链接，需要复制到手机浏览器中打开。</p><p>链接 30 分钟内有效，且只能使用一次。</p>`
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
  if (req.method === "GET") return Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
  const text = await readText(req);
  if (!text) return {};
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (contentType.includes("application/json")) return JSON.parse(text);
  return Object.fromEntries(new URLSearchParams(text));
}

function paymentConfigs() {
  loadLocalEnv({ override: false });
  const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  const source = paymentSettings.length ? paymentSettings : [{
    id: "default",
    name: "默认支付平台",
    provider: "legacy",
    apiBaseUrl: process.env.PAYMENT_API_BASE_URL || DEFAULT_PAYMENT_API_BASE_URL,
    merchantId: process.env.PAYMENT_MERCHANT_ID || "",
    merchantSecret: process.env.PAYMENT_MERCHANT_SECRET || "",
    alipayChannelCode: process.env.PAYMENT_CHANNEL_CODE || "",
    wechatChannelCode: process.env.PAYMENT_WECHAT_CHANNEL_CODE || "200",
    notifyUrl: process.env.PAYMENT_NOTIFY_URL || "",
    returnUrl: process.env.PAYMENT_RETURN_URL || ""
  }];
  return source.map((settings, index) => ({
    ...settings,
    id: settings.id || (index ? `payment-${index + 1}` : "default"),
    name: settings.name || (index ? `支付平台 ${index + 1}` : "默认支付平台"),
    displayName: settings.displayName || settings.name || (index ? `支付平台 ${index + 1}` : "默认支付平台"),
    provider: ["legacy", "xinhui", "test"].includes(settings.provider) ? settings.provider : "legacy",
    enabled: settings.enabled !== false,
    priority: Number.isInteger(Number(settings.priority)) ? Number(settings.priority) : index,
    apiBaseUrl: settings.provider === "test" ? "" : String(settings.apiBaseUrl || DEFAULT_PAYMENT_API_BASE_URL).replace(/\/+$/, ""),
    merchantId: settings.merchantId || "",
    merchantSecret: settings.merchantSecret || "",
    alipayChannelCode: settings.alipayChannelCode || settings.channelCode || "",
    wechatChannelCode: settings.wechatChannelCode || "200",
    alipayEnabled: settings.alipayEnabled !== false,
    wechatEnabled: settings.wechatEnabled !== false,
    notifyUrl: settings.notifyUrl || (publicBaseUrl ? `${publicBaseUrl}/api/payments/callback` : ""),
    returnUrl: settings.returnUrl || (publicBaseUrl ? `${publicBaseUrl}/account/payment/result` : "")
  })).sort((a, b) => a.priority - b.priority);
}

function paymentConfig(id = "") {
  const configs = paymentConfigs();
  return configs.find(item => item.id === id) || configs.find(item => item.enabled) || configs[0] || {};
}

function normalizePaymentSettings(payload, current = {}) {
  const url = (value, label) => {
    const normalized = String(value || "").trim().replace(/\/+$/, "");
    if (normalized && !/^https?:\/\//i.test(normalized)) throw new Error(`${label}必须是 HTTP 或 HTTPS 地址。`);
    return normalized;
  };
  const provider = String(payload?.provider || current.provider || "legacy");
  if (!["legacy", "xinhui", "test"].includes(provider)) throw new Error("不支持的支付平台类型。");
  const name = String(payload?.name || current.name || "").trim();
  if (!name || name.length > 80) throw new Error("平台名称不能为空且不能超过 80 个字符。");
  const displayName = String(payload?.displayName || current.displayName || name).trim();
  if (!displayName || displayName.length > 80) throw new Error("前台显示名称不能为空且不能超过 80 个字符。");
  const merchantId = provider === "test" ? "" : String(payload?.merchantId || "").trim();
  if (provider !== "test" && !merchantId) throw new Error("商户 ID 不能为空。");
  const merchantSecret = provider === "test" ? "" : String(payload?.merchantSecret || "").trim() || current.merchantSecret || "";
  if (provider !== "test" && !merchantSecret) throw new Error("商户密钥不能为空。");
  const alipayChannelCode = paymentChannelCode(provider === "test" ? "100" : payload?.alipayChannelCode || payload?.channelCode);
  const wechatChannelCode = paymentChannelCode(provider === "test" ? "200" : payload?.wechatChannelCode);
  const apiBaseUrl = provider === "test" ? "" : url(payload?.apiBaseUrl, "支付平台地址") || (provider === "xinhui" ? "https://api.shrtxs.cn" : "");
  if (provider !== "test" && !apiBaseUrl) throw new Error("支付平台地址不能为空。");
  return {
    id: current.id || String(payload?.id || crypto.randomUUID()),
    name,
    displayName,
    provider,
    enabled: payload?.enabled !== false,
    priority: Math.max(0, Math.min(999, Math.floor(Number(payload?.priority) || 0))),
    apiBaseUrl,
    merchantId,
    merchantSecret,
    alipayChannelCode,
    wechatChannelCode,
    alipayEnabled: payload?.alipayEnabled !== false,
    wechatEnabled: payload?.wechatEnabled !== false,
    notifyUrl: url(payload?.notifyUrl, "异步通知地址"),
    returnUrl: url(payload?.returnUrl, "支付完成返回地址")
  };
}

function publicPaymentSettings() {
  return paymentConfigs().map(config => ({
    id: config.id,
    name: config.name,
    displayName: config.displayName,
    provider: config.provider,
    enabled: config.enabled,
    priority: config.priority,
    apiBaseUrl: config.apiBaseUrl,
    merchantId: config.merchantId,
    merchantSecret: "",
    merchantSecretConfigured: Boolean(config.merchantSecret),
    alipayChannelCode: config.alipayChannelCode,
    wechatChannelCode: config.wechatChannelCode,
    alipayEnabled: config.alipayEnabled,
    wechatEnabled: config.wechatEnabled,
    notifyUrl: config.notifyUrl,
    returnUrl: config.returnUrl
  }));
}

function paymentSignContent(params) {
  return Object.entries(params || {})
    .filter(([key, value]) => !["sign", "sign_type"].includes(key) && value !== undefined && value !== null && String(value) !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");
}

function paymentSign(params, config = paymentConfig()) {
  const content = paymentSignContent(params);
  if (typeof config === "string") return crypto.createHash("md5").update(`${content}&${config}`).digest("hex").toUpperCase();
  const secret = config.merchantSecret;
  if (config.provider === "xinhui") return crypto.createHash("md5").update(`${content}${secret}`).digest("hex");
  return crypto.createHash("md5").update(`${content}&${secret}`).digest("hex").toUpperCase();
}

function verifyPaymentSign(params, config = paymentConfig()) {
  const actual = String(params?.sign || "").trim();
  if (!actual) return false;
  if (config.provider === "xinhui") return Boolean(config.merchantSecret) && safeEqual(actual.toLowerCase(), paymentSign(params, config));
  return Boolean(config.merchantSecret) && safeEqual(actual.toUpperCase(), paymentSign(params, config));
}

function paymentConfigCredentialsReady(config) {
  return config?.provider === "test" || Boolean(config?.merchantId && config.merchantSecret && config.alipayChannelCode && config.wechatChannelCode);
}

function paymentConfigReady(config, method = "") {
  const methodEnabled = method === "200" ? config.wechatEnabled : method === "100" ? config.alipayEnabled : true;
  return Boolean(config.enabled && methodEnabled && paymentConfigCredentialsReady(config));
}

function requirePaymentConfig(method = "", id = "") {
  const config = id ? paymentConfigs().find(item => item.id === id) : paymentConfigs().find(item => paymentConfigReady(item, method));
  if (!config || (id ? !config.enabled || !paymentConfigCredentialsReady(config) : !paymentConfigReady(config, method))) throw new Error("没有可用的支付平台，请检查后台支付平台配置。");
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

function paymentMoneyBreakdown(order) {
  return {
    realCash: Math.max(0, Number(order?.amount || 0) + Number(order?.walletCashAmount || 0) + Number(order?.walletReferralAmount || 0)),
    virtualCash: Math.max(0, Number(order?.walletGiftAmount || 0))
  };
}

function publicPaymentOrder(order) {
  if (!order) return null;
  const status = order.reversedAt ? "reversed" : order.status === "pending" && isPaymentOrderExpired(order) ? "closed" : order.status;
  const vipSpendAmount = Number(order.vipSpendAmount) || 0;
  const currentVipSpend = userVipSpend(userForAccount(accounts.find(item => item.id === order.accountId)));
  const vipSpendAfter = Number.isFinite(Number(order.vipSpendAfter)) ? Number(order.vipSpendAfter) : currentVipSpend;
  const money = paymentMoneyBreakdown(order);
  const poolFulfillmentError = {
    "没有可用的池 URL。": `目前没有可用 ${order.planName} 池发放。`,
    "池 URL 缺少到期时间，请手动选择。": `${order.planName} 池缺少有效到期时间，暂时无法发放。`,
    "没有匹配的池 URL，请手动选择。": `目前没有匹配 ${order.planName} 套餐期限的池发放。`
  }[order.fulfillmentError];
  return {
    id: order.id,
    merOrderTid: order.merOrderTid,
    tid: order.tid || "",
    planId: order.planId,
    planName: order.planName,
    optionId: order.optionId,
    optionLabel: order.optionLabel,
    purpose: order.purpose || "plan",
    addOns: order.addOns || [],
    addOnSnapshots: order.addOnSnapshots || [],
    addOnAmount: order.addOnAmount || 0,
    productSnapshot: order.productSnapshot || null,
    trafficTier: order.trafficTier || 1,
    trafficBaseGb: order.trafficBaseGb || 0,
    trafficGb: order.trafficGb ?? null,
    trafficMaxTier: order.trafficMaxTier || 1,
    trafficTierMarkupPercent: order.trafficTierMarkupPercent || 0,
    baseAmount: order.baseAmount ?? order.originalAmount ?? order.amount,
    planPayableAmount: order.planPayableAmount ?? order.totalAmount ?? order.amount,
    amount: order.amount,
    totalAmount: order.totalAmount ?? order.amount,
    walletAmount: order.walletAmount || 0,
    walletCashAmount: order.walletCashAmount || 0,
    walletGiftAmount: order.walletGiftAmount || 0,
    walletReferralAmount: order.walletReferralAmount || 0,
    realCashAmount: money.realCash,
    virtualCashAmount: money.virtualCash,
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
    paymentProvider: order.paymentProvider || "",
    couponCode: order.couponCode || "",
    payUrl: order.payUrl || "",
    status,
    statusText: paymentStatusText(status),
    userId: order.userId || "",
    accountId: order.accountId || "",
    deliveryUrl: order.deliveryUrl || "",
    fulfillmentStatus: order.fulfillmentStatus || "",
    fulfillmentStartedAt: order.fulfillmentStartedAt || "",
    fulfilledAt: order.fulfilledAt || "",
    deliveryNote: order.deliveryNote || "",
    fulfillmentError: poolFulfillmentError || (order.fulfillmentError ? (order.purpose === "recharge" ? "充值暂未成功入账。" : order.purpose === "traffic_pack" ? "流量包暂未成功发放。" : order.purpose === "addon" ? "附加服务暂未进入交付流程。" : "套餐暂未成功发放。") : ""),
    paymentError: order.paymentError || "",
    createdAt: order.createdAt,
    expiresAt: paymentOrderExpiresAt(order),
    paidAt: order.paidAt || "",
    updatedAt: order.updatedAt || order.createdAt
  };
}

function adminPaymentOrder(order) {
  const account = accounts.find(item => item.id === order.accountId);
  return {
    ...publicPaymentOrder(order),
    email: order.email || account?.email || "",
    userId: order.userId || account?.linkedUserId || (account ? `account:${account.id}` : ""),
    duration: order.duration || "",
    group: order.group || "",
    internalFulfillmentError: order.fulfillmentError || "",
    reversible: order.status === "paid" && Boolean(order.rollbackSnapshot) && !order.reversedAt,
    reversedAt: order.reversedAt || "",
    reversalError: order.reversalError || ""
  };
}

function paymentStatusText(status) {
  return ({
    pending: "待付款",
    paid: "已支付",
    reversed: "业务已撤销",
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

async function postXinhuiForm(endpoint, params, config) {
  const signed = { ...compactPaymentParams(params), sign_type: "MD5" };
  signed.sign = paymentSign(signed, config);
  const response = await fetch(`${config.apiBaseUrl}${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(signed)
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`新汇返回了非 JSON 响应（${response.status}）。`);
  }
  if (!response.ok) throw new Error(payload?.msg || `新汇请求失败：${response.status}`);
  if (Number(payload.code) !== 1) throw new Error(payload.msg || "新汇拒绝了请求。");
  return payload;
}

function requestIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "127.0.0.1")
    .split(",")[0].trim().replace(/^::ffff:/, "");
}

async function createGatewayPayment(config, params) {
  if (config.provider === "test") return { result: { tid: `test-${params.merOrderTid}`, payOrderStatus: 0 }, requestParams: {} };
  if (config.provider !== "xinhui") {
    const signed = compactPaymentParams(params);
    signed.sign = paymentSign(signed, config);
    return { result: await postPaymentForm("/api/services/app/Api_PayOrder/CreateOrderPay", signed, config), requestParams: signed };
  }
  const requestParams = {
    pid: config.merchantId,
    type: params.channelCode,
    out_trade_no: params.merOrderTid,
    notify_url: params.notifyUrl,
    return_url: params.returnUrl,
    name: params.clientUserPayRemark,
    money: params.money,
    clientip: params.clientip,
    device: "jump"
  };
  const payload = await postXinhuiForm("/mapi.php", requestParams, config);
  return {
    requestParams: { ...requestParams, sign_type: "MD5" },
    result: { tid: payload.trade_no, payUrl: payload.payurl || payload.qrcode || payload.urlscheme, payOrderStatus: 0 }
  };
}

async function queryGatewayPayment(config, order) {
  if (config.provider !== "xinhui") {
    const params = { mid: config.merchantId, merOrderTid: order.merOrderTid };
    params.sign = paymentSign(params, config);
    return postPaymentForm("/api/services/app/Api_PayOrder/QueryPayOrder", params, config);
  }
  const url = new URL(`${config.apiBaseUrl}/api.php`);
  url.search = new URLSearchParams({ act: "order", pid: config.merchantId, key: config.merchantSecret, out_trade_no: order.merOrderTid });
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok || Number(payload.code) !== 1) throw new Error(payload.msg || `新汇查单失败：${response.status}`);
  const status = Number(payload.status);
  return {
    tid: payload.trade_no,
    money: payload.money,
    payOrderStatus: status === 1 ? 1 : status === 0 ? 0 : 3
  };
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

function resolvePaymentPlanOption(optionId, { allowLegacy = false } = {}) {
  const id = String(optionId || "");
  const option = dynamicPaymentPlanOption(id)
    || ((allowLegacy || (process.env.NODE_ENV === "test" && id === "pro-test-001")) ? PAYMENT_PLAN_OPTIONS[id] : null);
  if (!option) throw new Error("Unsupported pricing option.");
  const priceRow = pricingProduct(option.planId);
  const managedPrice = option.priceKey ? Number(priceRow?.[option.priceKey]) : NaN;
  const amount = Number.isFinite(managedPrice) && managedPrice >= 0 ? managedPrice : option.fallbackPrice;
  return { ...option, amount };
}

function paymentChannelCode(value) {
  const channelCode = String(value || "").trim();
  if (!/^\S{1,64}$/.test(channelCode)) throw new Error("支付通道码必须为 1-64 位且不能包含空格。");
  return channelCode;
}

function configuredPaymentChannel(config, method) {
  if (method === "200") {
    if (config.wechatEnabled === false) throw new Error("微信支付维护中，请选择其他支付方式。");
    return paymentChannelCode(config.wechatChannelCode);
  }
  if (!method || method === "100") {
    if (config.alipayEnabled === false) throw new Error("支付宝支付维护中，请选择其他支付方式。");
    return paymentChannelCode(config.alipayChannelCode);
  }
  throw new Error("不支持的支付方式。");
}

function publicPaymentMethods() {
  const configs = paymentConfigs();
  return {
    alipay: configs.some(config => paymentConfigReady(config, "100")),
    wechat: configs.some(config => paymentConfigReady(config, "200"))
  };
}

function paymentMethodForPlatform(config) {
  if (paymentConfigReady(config, "100")) return "100";
  if (paymentConfigReady(config, "200")) return "200";
  throw new Error("该支付平台没有可用支付通道，请检查后台配置。");
}

function publicPaymentPlatforms() {
  return paymentConfigs().map(config => ({
    id: config.id,
    name: config.displayName,
    provider: config.provider,
    enabled: config.enabled,
    ready: paymentConfigReady(config, "100") || paymentConfigReady(config, "200"),
    methods: {
      alipay: paymentConfigReady(config, "100"),
      wechat: paymentConfigReady(config, "200")
    }
  }));
}

function legacyPaymentCoupons(value = process.env.PAYMENT_COUPONS || "") {
  return String(value).split(",").map(entry => entry.split(":").map(part => part.trim())).filter(([code, percent]) => code && Number(percent) > 0 && Number(percent) < 100).map(([code, percent]) => ({ id: code.toUpperCase(), code: code.toUpperCase(), percent: Number(percent), enabled: true, validFrom: "", validUntil: "", applicableGroups: [], applicableDurations: [], totalLimit: 0, perAccountLimit: 0 }));
}

function initialSalesSettings() {
  return { id: "default", registrationMode: "open", onboardingEnabled: true, coupons: legacyPaymentCoupons(), faqs: DEFAULT_PRICING_FAQS.map(item => ({ ...item })), announcements: [], advertisements: [] };
}

function readBuffer(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("图片不能超过 8MB。"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function imageExtension(content) {
  if (content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return ".jpg";
  if (content.length >= 12 && content.subarray(0, 4).toString("ascii") === "RIFF" && content.subarray(8, 12).toString("ascii") === "WEBP") return ".webp";
  if (content.length >= 6 && ["GIF87a", "GIF89a"].includes(content.subarray(0, 6).toString("ascii"))) return ".gif";
  return "";
}

function currentSalesSettings() {
  const settings = salesSettings[0];
  return settings ? { ...settings, registrationMode: settings.registrationMode || "open", onboardingEnabled: settings.onboardingEnabled !== false, announcements: settings.announcements || [], advertisements: settings.advertisements || [] } : initialSalesSettings();
}

function paymentCoupons(value) {
  const coupons = value === undefined ? currentSalesSettings().coupons : Array.isArray(value) ? value : legacyPaymentCoupons(value);
  const now = Date.now();
  return new Map(coupons.filter(item => item.enabled !== false && (!item.validFrom || Date.parse(item.validFrom) <= now) && (!item.validUntil || Date.parse(item.validUntil) > now)).map(item => [String(item.code).toUpperCase(), item]));
}

function couponUsageOrders(code) {
  const normalizedCode = String(code || "").toUpperCase();
  return paymentOrders.filter(order => String(order.couponCode || "").toUpperCase() === normalizedCode && order.status === "paid" && !order.reversedAt);
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
  const registrationMode = ["open", "invite_only", "disabled"].includes(payload?.registrationMode) ? payload.registrationMode : "open";
  const onboardingEnabled = payload?.onboardingEnabled !== false;
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
    if (title.length > 80 || content.length > 20000) throw new Error("公告标题最多 80 字，正文最多 20000 字。");
    return {
      id: String(item.id || crypto.randomUUID()),
      title,
      content,
      publishedAt: normalizeCouponDate(item.publishedAt, `${title} 的发布时间`) || new Date().toISOString(),
      enabled: item.enabled !== false
    };
  });
  const advertisements = (Array.isArray(payload?.advertisements) ? payload.advertisements : []).slice(0, 50).map(item => {
    const category = String(item.category || "广告").trim();
    const title = String(item.title || "").trim();
    const description = String(item.description || "").trim();
    const content = String(item.content || "").trim();
    if (!category || (item.enabled !== false && (!title || !content))) throw new Error("广告分类、标题和正文不能为空。");
    if (category.length > 40 || title.length > 80 || description.length > 200 || content.length > 20000) throw new Error("广告分类最多 40 字，标题最多 80 字，简介最多 200 字，正文最多 20000 字。");
    return { id: String(item.id || crypto.randomUUID()), category, title, description, content, enabled: item.enabled !== false };
  });
  return { id: "default", registrationMode, onboardingEnabled, coupons: normalizedCoupons, faqs, announcements, advertisements };
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

async function saveReferralRewards() {
  _markWritten();
  await dataStore.saveCollection("referralRewards", referralRewards);
}

function moneyCents(value, label = "金额") {
  const raw = String(value ?? "").trim();
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  if (!/^\d+(\.\d{1,2})?$/.test(raw) || !Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - cents) > 0.000001) throw new Error(`${label}必须是最多两位小数的正数。`);
  return cents;
}

function initialWalletVipCents(account) {
  return Math.round(userVipSpend(userForAccount(account)) * 100);
}

async function walletForAccount(account) {
  return dataStore.getWallet(account.id, initialWalletVipCents(account));
}

function publicWallet(wallet) {
  const realCashCents = wallet.cashCents + wallet.referralCents;
  const virtualCashCents = wallet.giftCents;
  const availableRealCashCents = wallet.availableCashCents + wallet.availableReferralCents;
  const availableVirtualCashCents = wallet.availableGiftCents;
  return {
    cashBalance: wallet.cashCents / 100,
    giftBalance: wallet.giftCents / 100,
    balance: (wallet.cashCents + wallet.giftCents + wallet.referralCents) / 100,
    availableCashBalance: wallet.availableCashCents / 100,
    availableGiftBalance: wallet.availableGiftCents / 100,
    availableReferralBalance: wallet.availableReferralCents / 100,
    availableBalance: (wallet.availableCashCents + wallet.availableGiftCents + wallet.availableReferralCents) / 100,
    realCashBalance: realCashCents / 100,
    virtualCashBalance: virtualCashCents / 100,
    availableRealCashBalance: availableRealCashCents / 100,
    availableVirtualCashBalance: availableVirtualCashCents / 100,
    heldBalance: (wallet.cashHeldCents + wallet.giftHeldCents + wallet.referralHeldCents) / 100,
    referralBalance: wallet.referralCents / 100,
    vipSpend: wallet.vipSpendCents / 100
  };
}

function normalizeReferralCode(value) {
  const code = String(value || "").trim();
  return /^\d{6}$/.test(code) ? code : "";
}

function accountServiceInstances(accountId, now = Date.now()) {
  return paymentOrders.filter(order => order.accountId === accountId && order.status === "paid" && !order.reversedAt).flatMap(order => (order.addOnSnapshots || []).map((item, index) => {
    const startedAt = order.paidAt || order.createdAt;
    const durationDays = Number(item.durationDays || 0);
    const expiresAt = durationDays ? new Date(new Date(startedAt).getTime() + durationDays * 864e5).toISOString() : "";
    const status = expiresAt && new Date(expiresAt).getTime() <= now ? "expired" : order.fulfillmentStatus === "manual_pending" ? "pending" : order.fulfillmentStatus === "fulfilled" ? "active" : "processing";
    return { id: `${order.id}:${index}`, orderId: order.id, name: item.name, optionId: item.optionId, regionName: item.regionName || "", amount: item.amount, durationDays, startedAt, expiresAt, status, deliveryNote: order.deliveryNote || "" };
  }));
}

function publicInviterLabel(account, linkedUser = userForAccount(account)) {
  const name = [linkedUser?.userId, linkedUser?.wechatName]
    .map(value => String(value || "").trim())
    .find(value => value && !value.includes("@"));
  if (name) return name.slice(0, 32);
  const email = [linkedUser?.email, account?.email, linkedUser?.userId]
    .map(value => String(value || "").trim())
    .find(value => value.includes("@"));
  if (email) return email.slice(0, 254);
  const customerID = linkedUser?.customerID || account?.customerID;
  return customerID ? `#${customerID}` : "一位用户";
}

function randomReferralCode() {
  let code = "";
  do code = String(Math.floor(100000 + Math.random() * 900000));
  while (accounts.some(account => account.referralCode === code));
  return code;
}

function ensureReferralAccountFields() {
  let changed = false;
  for (const account of accounts) {
    if (!normalizeReferralCode(account.referralCode)) { account.referralCode = randomReferralCode(); changed = true; }
    if (!account.referralRate && account.referralRate !== 0) { account.referralRate = 10; changed = true; }
    if (account.recurringReferral === undefined) { account.recurringReferral = false; changed = true; }
  }
  return changed;
}

function referralRewardBaseCents(order) {
  if (Number.isFinite(Number(order.planCashValueAmount))) return Math.max(0, Math.round(Number(order.planCashValueAmount) * 100));
  return Math.max(0, Math.round((Number(order.amount || 0) + Number(order.walletCashAmount || 0)) * 100));
}

async function settleReferralRewards() {
  const now = Date.now();
  let changed = false;
  for (const reward of referralRewards) {
    if (reward.status !== "pending" || new Date(reward.availableAt).getTime() > now) continue;
    const account = accounts.find(item => item.id === reward.inviterAccountId);
    if (!account) { reward.status = "rejected"; reward.reason = "inviter-missing"; changed = true; continue; }
    await dataStore.creditReferralReward({
      id: crypto.randomUUID(), accountId: account.id, sourceId: reward.id,
      amountCents: reward.rewardCents, idempotencyKey: `referral:${reward.id}`,
      description: `邀请返利：${reward.sourceOrderId}`, initialVipCents: initialWalletVipCents(account)
    });
    reward.status = "available";
    reward.settledAt = new Date().toISOString();
    changed = true;
  }
  if (changed) await saveReferralRewards();
}

async function createReferralReward(order, account) {
  const inviterId = account?.referredByAccountId;
  if (!inviterId) return;
  const inviter = accounts.find(item => item.id === inviterId);
  const baseCents = referralRewardBaseCents(order);
  if (!inviter || !baseCents) return;
  const priorPaid = paymentOrders.some(item => item.accountId === account.id && item.id !== order.id && (!item.purpose || item.purpose === "plan") && item.status === "paid");
  if (priorPaid && inviter.recurringReferral !== true) return;
  if (referralRewards.some(item => item.sourceOrderId === order.id)) return;
  const rate = Math.max(0, Math.min(100, Number(inviter.referralRate ?? 10)));
  const rewardCents = Math.floor(baseCents * rate / 100);
  if (!rewardCents) return;
  const now = new Date();
  referralRewards.unshift({
    id: crypto.randomUUID(), sourceOrderId: order.id, inviterAccountId: inviter.id,
    inviteeAccountId: account.id, baseCents, rate, rewardCents,
    status: "pending", availableAt: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(), createdAt: now.toISOString()
  });
  await saveReferralRewards();
}

function syncWalletVip(account, wallet) {
  const vipSpend = wallet.vipSpendCents / 100;
  account.vipSpend = vipSpend;
  const user = userForAccount(account);
  if (user) {
    user.vipSpend = vipSpend;
    user.level = vipLevelForSpend(vipSpend);
  }
}

function quoteWithWallet(quote, wallet, useBalance = true) {
  const payableCents = Math.round(quote.amount * 100);
  const walletGiftCents = useBalance ? Math.min(payableCents, wallet.availableGiftCents) : 0;
  const walletReferralCents = useBalance ? Math.min(payableCents - walletGiftCents, wallet.availableReferralCents) : 0;
  const walletCashCents = useBalance ? Math.min(payableCents - walletGiftCents - walletReferralCents, wallet.availableCashCents) : 0;
  return {
    ...quote,
    payableAmount: payableCents / 100,
    walletGiftAmount: walletGiftCents / 100,
    walletReferralAmount: walletReferralCents / 100,
    walletCashAmount: walletCashCents / 100,
    walletAmount: (walletGiftCents + walletReferralCents + walletCashCents) / 100,
    amount: (payableCents - walletGiftCents - walletReferralCents - walletCashCents) / 100,
    paymentMethods: publicPaymentMethods(),
    paymentPlatforms: publicPaymentPlatforms(),
    wallet: publicWallet(wallet)
  };
}

function requireTrafficPackUser(account) {
  const user = userForAccount(account);
  if (!user || isUserExpired(user)) throw new Error("当前没有生效中的套餐。");
  if (!isSelfHostedUser(user)) throw new Error("流量包仅适用于自研线路套餐。");
  if (user.duration === "lifetime") throw new Error("不限时套餐不能购买附加服务。");
  if (user.unlimited) throw new Error("无限流量套餐无需购买流量包。");
  if (isUserAccountDisabled(user)) throw new Error("当前账户已停用，暂时无法购买流量包。");
  if (!user.xuiClientEmail) throw new Error("当前套餐尚未关联 3x-ui Client。");
  if (user.xuiLastTraffic?.remainingBytes == null || !Number.isFinite(Number(user.xuiLastTraffic.remainingBytes))) throw new Error("当前流量尚未完成同步，请稍后重试。");
  return user;
}

function trafficPackConfig() {
  const product = pricingProduct("traffic_pack") || {};
  const trafficGb = Number(product.addonTrafficGb);
  const price = Number(product.addonPrice);
  return {
    product,
    trafficGb: Number.isFinite(trafficGb) && trafficGb > 0 ? trafficGb : TRAFFIC_PACK_BYTES / 1024 ** 3,
    price: Number.isFinite(price) && price >= 0 ? price : TRAFFIC_PACK_PRICE
  };
}

function trafficPackQuote(account) {
  const user = requireTrafficPackUser(account);
  const { product, trafficGb, price } = trafficPackConfig();
  if (product.enabled === false) throw new Error("流量包暂未开放。");
  return {
    optionId: "traffic-pack-100g",
    planId: "traffic-pack",
    planName: "流量包",
    group: activeUserGroup(user),
    optionLabel: `${trafficGb} GB`,
    title: `${trafficGb} GB ${product.name || "流量包"}`,
    description: product.addonDeliveryDescription || product.description || "购买后立即叠加到当前周期，月度重置、续费或更换套餐后失效。",
    traffic: `当前周期增加 ${trafficGb} GB 流量`,
    features: Array.isArray(product.features) && product.features.length ? product.features : ["支付成功后立即生效", "同一周期可重复购买并累计"],
    devices: 0,
    trafficGb,
    originalAmount: price,
    discountAmount: 0,
    vipLevel: "vip1",
    vipDiscountPercent: 0,
    vipDiscountAmount: 0,
    subtotal: price,
    taxRate: 0,
    taxAmount: 0,
    beforeCreditAmount: price,
    cashCredit: 0,
    purchaseAction: "add_on",
    amount: price,
    couponCode: "",
    discountPercent: 0,
    cycles: []
  };
}

function requireRecurringPlanUser(account) {
  const user = userForAccount(account);
  if (!user || isUserExpired(user)) throw new Error("当前没有生效中的套餐。");
  if (user.duration === "lifetime") throw new Error("不限时套餐不能购买附加服务。");
  if (isUserAccountDisabled(user)) throw new Error("当前账户已停用，暂时无法购买附加服务。");
  return user;
}

function homeIpQuote(account, requestedOptionId = "") {
  const user = requireRecurringPlanUser(account);
  const product = pricingProduct("home_ip");
  const regions = Array.isArray(product?.addonRegions) ? product.addonRegions : [];
  if (!product || product.enabled === false || product.stock === 0 || !regions.length) throw new Error("家宽 IP 暂未开放。");
  const requestedRegionId = String(requestedOptionId || "").replace(/^home_ip:/, "");
  const region = regions.find(item => item.id === requestedRegionId) || (!requestedRegionId ? regions[0] : null);
  if (!region) throw new Error("家宽 IP 地区无效。");
  const amount = Number(region.price);
  const snapshot = { id: "home_ip", optionId: `home_ip:${region.id}`, name: product.name || "家宽 IP 定制", regionId: region.id, regionName: region.name, amount, durationDays: Number(product.addonDurationDays || 30), deliveryMode: "manual", deliveryDescription: product.addonDeliveryDescription || "" };
  return {
    optionId: snapshot.optionId,
    planId: "home_ip",
    planName: product.name || "家宽 IP 定制",
    group: activeUserGroup(user),
    optionLabel: `${region.name} · ${snapshot.durationDays} 天`,
    title: product.title || "家宽 IP 定制",
    description: product.description || "按地区提供家庭宽带出口 IP。",
    traffic: "",
    features: Array.isArray(product.features) ? product.features : [],
    devices: 0,
    originalAmount: amount,
    baseAmount: amount,
    discountAmount: 0,
    vipLevel: "vip1",
    vipDiscountPercent: 0,
    vipDiscountAmount: 0,
    subtotal: amount,
    taxRate: 0,
    taxAmount: 0,
    beforeCreditAmount: amount,
    cashCredit: 0,
    purchaseAction: "add_on",
    amount,
    couponCode: "",
    discountPercent: 0,
    selectedAddOns: [snapshot.optionId],
    selectedAddOnSnapshots: [snapshot],
    addOnAmount: 0,
    cycles: regions.map(item => ({ optionId: `home_ip:${item.id}`, label: item.name, amount: Number(item.price), devices: 0 }))
  };
}

function planQuoteWithAddOns(quote, requestedAddOns) {
  const selectedAddOns = [...new Set(Array.isArray(requestedAddOns) ? requestedAddOns.map(String) : [])];
  const homeIp = pricingProduct("home_ip");
  const homeIpAvailable = !quote.lifetime && homeIp?.productKind === "addon" && homeIp.enabled !== false && homeIp.stock !== 0;
  const regions = Array.isArray(homeIp?.addonRegions) ? homeIp.addonRegions : [];
  const selectedAddOnSnapshots = selectedAddOns.map(id => {
    const match = id.match(/^home_ip:([a-z0-9_-]+)$/i);
    const region = match && regions.find(item => item.id === match[1]);
    if (!homeIpAvailable || !region) throw new Error(quote.lifetime ? "不限时套餐不能购买附加服务。" : "家宽 IP 地区无效。");
    return { id: "home_ip", optionId: id, name: homeIp.name || "家宽 IP 定制", regionId: region.id, regionName: region.name, amount: Number(region.price), durationDays: Number(homeIp.addonDurationDays || 30), deliveryMode: homeIp.addonDeliveryMode || "manual", deliveryDescription: homeIp.addonDeliveryDescription || "" };
  });
  const addOnAmount = selectedAddOnSnapshots.reduce((sum, item) => sum + item.amount, 0);
  return {
    ...quote,
    planAmount: quote.amount,
    addOnAmount,
    amount: Number((quote.amount + addOnAmount).toFixed(2)),
    selectedAddOns,
    selectedAddOnSnapshots,
    availableAddOns: homeIp ? [{ id: "home_ip", name: homeIp.name || "家宽 IP 定制", description: homeIp.description || "按地区定制家庭宽带出口 IP。", available: homeIpAvailable, unavailableReason: homeIpAvailable ? "" : "仅适用于周期性套餐", options: regions.map(region => ({ id: `home_ip:${region.id}`, label: region.name, amount: Number(region.price) })) }] : []
  };
}

async function paymentQuoteForAccount(payload, account) {
  const wallet = await walletForAccount(account);
  const quote = payload.product === "traffic_pack" ? trafficPackQuote(account)
    : payload.product === "home_ip" ? homeIpQuote(account, payload.optionId)
    : planQuoteWithAddOns(paymentQuote(payload.optionId, payload.couponCode, undefined, vipLevelForSpend(wallet.vipSpendCents / 100), account.id, payload.trafficTier), payload.addOns);
  return quoteWithWallet(quote, wallet, payload.useBalance !== false);
}

function planCashValueFromBills(user, userBills = bills) {
  let cashValue = 0;
  let valuedAt = 0;
  let expiresAt = 0;
  let found = false;

  for (const bill of userBills
    .filter(item => item.userId === user.id && !item.reversedAt)
    .sort((a, b) => new Date(a.createdAt || a.occurredAt) - new Date(b.createdAt || b.occurredAt))) {
    const occurredAt = new Date(bill.occurredAt || 0).getTime();
    const afterExpiresAt = new Date(bill.afterExpiresAt || 0).getTime();
    const amount = billCashValueAmount(bill);
    if (!Number.isFinite(occurredAt) || !Number.isFinite(afterExpiresAt) || !Number.isFinite(amount)) continue;

    const nextValuedAt = Math.max(occurredAt, valuedAt);
    const replaces = bill.type === "initial" || bill.type === "replacement";
    const remaining = !replaces && expiresAt > nextValuedAt && expiresAt > valuedAt
      ? cashValue * (expiresAt - nextValuedAt) / (expiresAt - valuedAt)
      : 0;
    cashValue = Math.max(remaining + amount, 0);
    valuedAt = nextValuedAt;
    expiresAt = afterExpiresAt;
    found = true;
  }

  return found ? { cashValue: Math.round(cashValue * 100) / 100, valuedAt } : null;
}

function ensureUserCashValues() {
  let changed = false;
  for (const user of users) {
    const rebuilt = planCashValueFromBills(user);
    const valuedAt = rebuilt?.valuedAt ?? new Date(user.purchasedAt || 0).getTime();
    if (!Number.isFinite(valuedAt)) continue;
    const cashValue = rebuilt?.cashValue ?? 0;
    const cashValueAt = new Date(valuedAt).toISOString();
    if (Number(user.cashValue) !== cashValue || user.cashValueAt !== cashValueAt) {
      user.cashValue = cashValue;
      user.cashValueAt = cashValueAt;
      changed = true;
    }
  }
  return changed;
}

function remainingPlanCashValue(user, now = new Date(), userBills = bills) {
  if (!user) return 0;
  const legacyValue = user.cashValue === undefined || user.cashValue === null ? planCashValueFromBills(user, userBills) : null;
  const valuedAt = legacyValue?.valuedAt ?? new Date(user.cashValueAt || user.purchasedAt || 0).getTime();
  const expiresAt = new Date(user.expiresAt || 0).getTime();
  const currentTime = now.getTime();
  const cashValue = Math.max(Number(user.cashValue ?? legacyValue?.cashValue ?? user.actualPaid) || 0, 0);
  if (!Number.isFinite(valuedAt) || !Number.isFinite(expiresAt) || expiresAt <= currentTime || expiresAt <= valuedAt) return 0;
  return Math.round(cashValue * Math.min(Math.max((expiresAt - currentTime) / (expiresAt - valuedAt), 0), 1) * 100) / 100;
}

function paymentPurchaseTerms(user, now = new Date()) {
  const active = user && new Date(user.expiresAt || 0).getTime() > now.getTime();
  if (!active) return { purchaseAction: "initial", cashCredit: 0 };
  return { purchaseAction: "replace", cashCredit: 0 };
}

function billCashValueAmount(bill) {
  const order = paymentOrders.find(item => item.id === bill.paymentOrderId);
  if (!order) return Math.max(Number(bill.amount) || 0, 0);
  if (Number.isFinite(Number(order.planCashValueAmount))) return Math.max(Number(order.planCashValueAmount), 0);
  return Math.max(Number(order.amount || 0) + Number(order.walletCashAmount || 0), 0);
}

const PRODUCT_BINDING_MIGRATION_ID = "user-product-binding-v5";
const PRODUCT_DURATION_SUFFIX = Object.freeze({ monthly: "30", quarterly: "90", half_yearly: "180", yearly: "360" });

function inferCustomUserDuration(user = {}) {
  const group = activeUserGroup(user);
  const prices = pricingProduct(group) || {};
  const logs = Array.isArray(user.userLogs) ? user.userLogs : [];
  const customLog = logs.find(log => log.details?.duration === "custom" && Number(log.details.amount) > 0);
  const amount = Number(customLog?.details?.amount ?? user.actualPaid);
  const exactPrice = Object.keys(PRODUCT_DURATION_SUFFIX).find(duration => Number(prices[duration]) === amount);
  if (exactPrice) return { duration: exactPrice, rule: `金额匹配${exactPrice}` };
  const monthlyPrice = Number(prices.monthly);
  const monthlyUnits = amount / monthlyPrice;
  if (monthlyPrice > 0 && Number.isInteger(monthlyUnits) && monthlyUnits >= 1 && monthlyUnits <= 12) {
    return { duration: "monthly", rule: `金额为月付价格的 ${monthlyUnits} 倍` };
  }
  for (const log of logs) {
    const change = log.details?.changes?.find(item => item.field === "duration" && item.after === "custom" && PRODUCT_DURATION_SUFFIX[item.before]);
    if (change) return { duration: change.before, rule: `日志记录由 ${change.before} 改为 custom` };
  }
  const days = (Date.parse(user.expiresAt || "") - Date.parse(user.purchasedAt || "")) / 864e5;
  if (!Number.isFinite(days) || days <= 0) return { error: "自定义期限缺少有效的购买或到期时间" };
  const duration = Object.keys(PRODUCT_DURATION_SUFFIX).reduce((best, candidate) => Math.abs(durationDays(candidate) - days) < Math.abs(durationDays(best) - days) ? candidate : best, "monthly");
  return { duration, rule: `有效期 ${Number(days.toFixed(1))} 天，映射到最接近的标准周期` };
}

function inferUserProductBinding(user = {}) {
  let duration = String(user.duration || "");
  const group = activeUserGroup(user);
  if (duration === "lifetime") {
    return productBinding(FRIENDS_PRODUCT_ID, `${FRIENDS_PRODUCT_ID}-lifetime`, user, {
      name: "亲友永久不限量",
      optionLabel: "永久有效 · 不限流量",
      internal: true,
      lifetime: true,
      unlimited: true
    });
  }
  if (duration === "custom") {
    const inferred = inferCustomUserDuration(user);
    if (inferred.error) return inferred;
    duration = inferred.duration;
    const optionId = `${group}-${PRODUCT_DURATION_SUFFIX[duration]}`;
    let option;
    try { option = resolvePaymentPlanOption(optionId, { allowLegacy: true }); } catch { return { error: `找不到匹配商品：${optionId}` }; }
    return { ...productBinding(option.planId, optionId, user, { name: option.planName, optionLabel: option.optionLabel, duration, mappingRule: inferred.rule }), normalizedDuration: duration };
  }
  const suffix = duration === "lifetime" ? "lifetime" : PRODUCT_DURATION_SUFFIX[duration];
  if (!suffix) return { error: `无法识别套餐周期：${duration || "空"}` };
  const optionId = `${group}${user.unlimited && suffix !== "lifetime" ? "-unlimited" : ""}-${suffix}`;
  let option;
  try { option = resolvePaymentPlanOption(optionId, { allowLegacy: true }); } catch { return { error: `找不到匹配商品：${optionId}` }; }
  return productBinding(option.planId, optionId, user, {
    name: option.planName,
    optionLabel: option.optionLabel,
    lifetime: Boolean(option.lifetime),
    unlimited: Boolean(option.unlimited)
  });
}

function productBinding(productId, optionId, user, details = {}) {
  return {
    productId,
    optionId,
    snapshot: {
      version: 1,
      productId,
      optionId,
      name: details.name || productId,
      optionLabel: details.optionLabel || optionId,
      productKind: details.custom ? "legacy_custom_plan" : "plan",
      internal: details.internal === true,
      group: activeUserGroup(user),
      duration: details.duration || String(user.duration || ""),
      lifetime: details.lifetime === true,
      unlimited: details.unlimited === true,
      trafficTier: Number(user.trafficTier || 1),
      trafficGb: user.purchasedTrafficGb ?? null,
      expiresAt: user.expiresAt || "",
      ...(details.mappingRule ? { mappingRule: details.mappingRule, migratedFromDuration: "custom" } : {})
    }
  };
}

function bindUserProduct(user, binding, { source, orderId = "", boundAt = new Date().toISOString() } = {}) {
  if (!user || binding?.error || !binding?.productId || !binding?.optionId) return false;
  if (binding.productId === FRIENDS_PRODUCT_ID) {
    user.duration = "lifetime";
    user.expiresAt = LIFETIME_EXPIRES_AT;
    user.unlimited = true;
    if (isSelfHostedUser(user)) {
      user.xuiTrafficLimitBytes = 0;
      if (user.xuiWeightedTraffic) Object.assign(user.xuiWeightedTraffic, { totalBytes: 0, remainingBytes: null, usagePercent: null, depleted: false });
      if (user.xuiLastTraffic) Object.assign(user.xuiLastTraffic, { totalBytes: 0, remainingBytes: null, usagePercent: null, status: "active" });
    }
  }
  if (binding.normalizedDuration) user.duration = binding.normalizedDuration;
  Object.assign(user, {
    currentProductId: binding.productId,
    currentOptionId: binding.optionId,
    currentProductOrderId: orderId,
    currentProductSource: source || "unknown",
    currentProductBoundAt: boundAt,
    currentProductSnapshot: structuredClone(binding.snapshot)
  });
  return true;
}

function bindUserProductFromOrder(user, order) {
  const snapshot = {
    version: 1,
    ...(order.productSnapshot || {}),
    productId: order.planId,
    optionId: order.optionId,
    name: order.planName,
    optionLabel: order.optionLabel,
    productKind: "plan",
    internal: false,
    group: order.group,
    duration: order.duration,
    lifetime: order.duration === "lifetime",
    unlimited: Boolean(order.unlimited),
    trafficTier: order.trafficTier || 1,
    trafficGb: order.trafficGb ?? null
  };
  return bindUserProduct(user, { productId: order.planId, optionId: order.optionId, snapshot }, { source: order.paymentProvider === "manual" ? "manual_order" : "payment_order", orderId: order.id, boundAt: order.paidAt || new Date().toISOString() });
}

function latestMatchingPlanOrder(user) {
  const account = accounts.find(item => item.linkedUserId === user.id);
  return paymentOrders
    .filter(order => order.status === "paid" && !order.reversedAt && (order.purpose || "plan") === "plan" && (order.userId === user.id || account && order.accountId === account.id) && order.group === activeUserGroup(user) && order.duration === user.duration)
    .sort((a, b) => Date.parse(b.paidAt || b.createdAt || 0) - Date.parse(a.paidAt || a.createdAt || 0))[0] || null;
}

function familyGrantOrder(user, binding, now) {
  const account = accounts.find(item => item.linkedUserId === user.id);
  const id = `family-grant-${user.id}`;
  return {
    id,
    merOrderTid: id,
    purpose: "plan",
    planId: binding.productId,
    planName: binding.snapshot.name,
    optionId: binding.optionId,
    optionLabel: binding.snapshot.optionLabel,
    duration: "lifetime",
    group: activeUserGroup(user),
    unlimited: true,
    trafficTier: 1,
    trafficGb: null,
    baseAmount: 0,
    originalAmount: 0,
    subtotal: 0,
    taxAmount: 0,
    beforeCreditAmount: 0,
    cashCredit: 0,
    totalAmount: 0,
    amount: 0,
    purchaseAction: "grant",
    productSnapshot: binding.snapshot,
    paymentProvider: "manual",
    paymentPlatformName: "后台内部授予",
    channelCode: "manual",
    status: "paid",
    fulfillmentStatus: "fulfilled",
    accountId: account?.id || "",
    userId: user.id,
    email: user.email || account?.email || "",
    createdAt: now,
    updatedAt: now,
    paidAt: now,
    planFulfilledAt: now,
    fulfilledAt: now
  };
}

async function ensureUserProductBindings() {
  const previous = await dataStore.getRecord("migrationState", PRODUCT_BINDING_MIGRATION_ID);
  if (previous?.completedAt) return previous;
  const now = new Date().toISOString();
  const report = { id: PRODUCT_BINDING_MIGRATION_ID, startedAt: now, total: users.length, mapped: 0, alreadyBound: 0, familyGrants: 0, lifetimeMapped: 0, customMapped: 0, deprecatedSelfHostedMapped: 0, failed: [] };
  let ordersChanged = false;
  for (const user of users) {
    const remapCustom = user.duration === "custom" || user.currentProductId === LEGACY_CUSTOM_PRODUCT_ID;
    const remapDeprecatedSelfHosted = user.currentProductId === "self_hosted" || user.currentOptionId === "self-hosted-test-30" || user.activeGroup === "self_hosted" || user.group === "self_hosted";
    const remapLifetime = user.duration === "lifetime" && (user.currentProductId !== FRIENDS_PRODUCT_ID || user.unlimited !== true || isSelfHostedUser(user) && Number(user.xuiTrafficLimitBytes) !== 0);
    if (user.currentProductId && user.currentOptionId && !remapCustom && !remapDeprecatedSelfHosted && !remapLifetime) { report.alreadyBound++; continue; }
    if ((user.currentProductId || user.currentOptionId) && !(user.currentProductId && user.currentOptionId)) {
      report.failed.push({ userId: user.id, reason: "商品绑定字段不完整" });
      continue;
    }
    const binding = inferUserProductBinding(remapDeprecatedSelfHosted ? { ...user, group: "pro", activeGroup: "pro" } : user);
    if (binding.error) { report.failed.push({ userId: user.id, reason: binding.error }); continue; }
    if (remapDeprecatedSelfHosted) { user.group = "pro"; user.activeGroup = "pro"; }
    let order = latestMatchingPlanOrder(user);
    let source = order ? "payment_order_migration" : "legacy_migration";
    if (binding.productId === FRIENDS_PRODUCT_ID) {
      user.unlimited = true;
      const grantId = `family-grant-${user.id}`;
      order = paymentOrders.find(item => item.id === grantId) || familyGrantOrder(user, binding, now);
      if (!paymentOrders.some(item => item.id === grantId)) { paymentOrders.unshift(order); ordersChanged = true; }
      source = "family_friend_grant";
      report.familyGrants++;
    }
    if (remapCustom) report.customMapped++;
    if (user.duration === "lifetime") report.lifetimeMapped++;
    if (remapDeprecatedSelfHosted) report.deprecatedSelfHostedMapped++;
    bindUserProduct(user, binding, { source, orderId: order?.id || "", boundAt: now });
    appendUserLogToUser(user, createUserLog({ event: "system", status: "recorded", reason: "product-binding-migrated", message: `已绑定商品：${binding.snapshot.name} / ${binding.snapshot.optionLabel}`, details: { migrationId: PRODUCT_BINDING_MIGRATION_ID, productBinding: binding, orderId: order?.id || "" } }));
    report.mapped++;
  }
  if (report.mapped) await saveUsers();
  if (ordersChanged) await savePaymentOrders();
  if (!users.some(user => user.currentProductId === LEGACY_CUSTOM_PRODUCT_ID || user.currentProductId === "self_hosted")) {
    const nextPricing = pricing.filter(item => item.group !== LEGACY_CUSTOM_PRODUCT_ID && item.group !== "self_hosted");
    if (nextPricing.length !== pricing.length) { pricing = nextPricing; await savePricing(); }
  }
  report.completedAt = new Date().toISOString();
  report.status = report.failed.length ? "needs_review" : "completed";
  await dataStore.setRecord("migrationState", PRODUCT_BINDING_MIGRATION_ID, report);
  console.log(`[migration:${PRODUCT_BINDING_MIGRATION_ID}] ${JSON.stringify({ total: report.total, mapped: report.mapped, alreadyBound: report.alreadyBound, familyGrants: report.familyGrants, lifetimeMapped: report.lifetimeMapped, customMapped: report.customMapped, deprecatedSelfHostedMapped: report.deprecatedSelfHostedMapped, failed: report.failed.length })}`);
  return report;
}

function paymentQuote(optionId, couponCode = "", couponConfig, vipLevel = "vip1", accountId = "", requestedTrafficTier = 1) {
  const option = resolvePaymentPlanOption(optionId);
  const plan = pricingProduct(option.planId) || {};
  const trafficConfig = recurringTrafficConfig(plan);
  const trafficTier = option.lifetime || option.unlimited ? 1 : normalizeTrafficTier(plan, requestedTrafficTier);
  const trafficGb = option.lifetime ? planTrafficBytes({ activeGroup: option.group, duration: "lifetime", unlimited: Boolean(option.unlimited) }) / 1024 ** 3 : trafficConfig.baseGb * trafficTier;
  const trafficPriceFactor = option.lifetime || option.unlimited ? 1 : 1 + (trafficTier - 1) * trafficConfig.markupPercent / 100;
  const code = String(couponCode || "").trim().toUpperCase();
  const coupon = code ? paymentCoupons(couponConfig).get(code) : null;
  if (code && !coupon) throw new Error("优惠码无效。");
  if (coupon) validateCouponUsage(coupon, option, accountId);
  const percent = Number(coupon?.percent) || 0;
  const baseAmount = Number(option.amount.toFixed(2));
  const originalAmount = Number((baseAmount * trafficPriceFactor).toFixed(2));
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
  const terms = paymentPurchaseTerms(userForAccount(account));
  const cycleSource = option.unlimited
    ? Object.entries(PAYMENT_PLAN_OPTIONS).filter(([, item]) => item.planId === option.planId && item.unlimited).map(([id, item]) => ({ optionId: id, label: item.optionLabel, amount: resolvePaymentPlanOption(id).amount, devices: Number(plan[`${item.duration}Devices`] || 0) }))
    : planCycleOptions(plan, option);
  const cycles = cycleSource.map(item => ({ ...item, amount: Number((item.amount * trafficPriceFactor).toFixed(2)) }));
  if (!cycles.some(item => item.optionId === String(optionId))) cycles.unshift({ optionId: String(optionId), label: option.optionLabel, amount: originalAmount, devices: 0 });
  return {
    ...option,
    optionId: String(optionId),
    baseAmount,
    originalAmount,
    trafficTier,
    trafficBaseGb: trafficConfig.baseGb,
    trafficGb,
    trafficMaxTier: trafficConfig.maxTier,
    trafficTierMarkupPercent: trafficConfig.markupPercent,
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
    amount: beforeCreditAmount,
    couponCode: code,
    discountPercent: percent || 0,
    title: option.lifetime ? plan.lifetimeTitle || option.planName : plan.title || option.planName,
    description: option.lifetime ? plan.lifetimeDescription || "" : plan.description || "",
    traffic: option.lifetime ? trafficGb ? `${Number.isInteger(trafficGb) ? trafficGb : Number(trafficGb.toFixed(2))}G 固定流量` : plan.lifetimeTraffic || "固定流量" : option.unlimited ? "无限流量" : `每月 ${trafficGb} GB`,
    features: option.lifetime ? Array.isArray(plan.lifetimeFeatures) ? plan.lifetimeFeatures : [] : Array.isArray(plan.features) ? plan.features : [],
    devices: Number(option.lifetime ? plan.lifetimeDevices : plan[`${option.duration}Devices`] || 0),
    cycles
  };
}

async function fulfillTrafficPackOrderOnce(order, req) {
  const account = accounts.find(item => item.id === order.accountId);
  if (!account) throw new Error("购买账户不存在。");
  const user = requireTrafficPackUser(account);
  const wallet = await dataStore.settleWalletPurchase({
    id: crypto.randomUUID(),
    accountId: account.id,
    orderId: order.id,
    vipDeltaCents: 0,
    description: "100 GB 流量包",
    initialVipCents: initialWalletVipCents(account)
  });
  syncWalletVip(account, wallet);
  const trafficPackBytes = Math.round(Number(order.trafficGb || trafficPackConfig().trafficGb) * 1024 ** 3);
  const grant = grantTrafficPack(user, order.id, trafficPackBytes);
  await enableXuiClientAfterTrafficPack(user);
  if (!grant.replayed) {
    appendUserLogToUser(user, createUserLog({
      event: "user-action",
      status: "recorded",
      reason: "traffic-pack-purchased",
      req,
      message: `购买流量包：当前周期增加 ${order.trafficGb || trafficPackConfig().trafficGb} GB`,
      details: { paymentOrderId: order.id, merOrderTid: order.merOrderTid, trafficPackBytes, remainingBytesBefore: grant.remainingBytesBefore, remainingBytesAfter: grant.remainingBytesAfter }
    }));
  }
  order.userId = user.id;
  order.vipSpendAmount = 0;
  order.vipSpendBefore = wallet.vipSpendCents / 100;
  order.vipSpendAfter = wallet.vipSpendCents / 100;
  order.trafficPackBytes = trafficPackBytes;
  order.trafficCycleKey = user.xuiTrafficCycleKey || "";
  order.fulfilledAt = new Date().toISOString();
  order.fulfillmentStatus = "fulfilled";
  order.fulfillmentError = "";
  await saveUsers();
  await saveAccounts();
  await savePaymentOrders();
  await notifyPaymentOrder(order);
  return order;
}

async function fulfillStandaloneAddOnOrderOnce(order, req) {
  const account = accounts.find(item => item.id === order.accountId);
  if (!account) throw new Error("购买账户不存在。");
  const user = requireRecurringPlanUser(account);
  const wallet = await dataStore.settleWalletPurchase({ id: crypto.randomUUID(), accountId: account.id, orderId: order.id, vipDeltaCents: 0, description: `${order.planName} ${order.optionLabel}`, initialVipCents: initialWalletVipCents(account) });
  syncWalletVip(account, wallet);
  order.userId = user.id;
  order.vipSpendAmount = 0;
  order.vipSpendBefore = wallet.vipSpendCents / 100;
  order.vipSpendAfter = wallet.vipSpendCents / 100;
  order.fulfillmentStartedAt = new Date().toISOString();
  order.fulfillmentStatus = "manual_pending";
  order.fulfillmentError = "";
  appendUserLogToUser(user, createUserLog({ event: "user-action", status: "recorded", reason: "addon-purchased", req, message: `购买附加服务：${order.addOnSnapshots?.map(item => `${item.name}${item.regionName ? `（${item.regionName}）` : ""}`).join("、") || order.planName}`, details: { paymentOrderId: order.id, merOrderTid: order.merOrderTid, amount: order.totalAmount ?? order.amount, addOns: order.addOnSnapshots || [] } }));
  await saveUsers();
  await saveAccounts();
  await savePaymentOrders();
  await notifyPaymentOrder(order);
  return order;
}

const paymentFulfillmentTasks = new Map();

async function fulfillPaymentOrderOnce(order, req) {
  if (!order || order.status !== "paid" || order.reversedAt || ["fulfilled", "manual_pending"].includes(order.fulfillmentStatus)) return order;
  if (order.purpose === "recharge") {
    const account = accounts.find(item => item.id === order.accountId);
    if (!account) throw new Error("充值账户不存在。");
    if (!order.rollbackSnapshot) {
      order.rollbackSnapshot = { version: 1, purpose: "recharge", capturedAt: new Date().toISOString() };
      await savePaymentOrders();
    }
    const wallet = await dataStore.creditWalletRecharge({
      id: crypto.randomUUID(),
      accountId: account.id,
      orderId: order.id,
      amountCents: Math.round(order.amount * 100),
      description: "余额充值",
      initialVipCents: initialWalletVipCents(account)
    });
    syncWalletVip(account, wallet);
    order.vipSpendAmount = order.amount;
    order.vipSpendBefore = (wallet.vipSpendCents - Math.round(order.amount * 100)) / 100;
    order.vipSpendAfter = wallet.vipSpendCents / 100;
    order.fulfilledAt = new Date().toISOString();
    order.fulfillmentStatus = "fulfilled";
    order.fulfillmentError = "";
    await saveAccounts();
    if (userForAccount(account)) await saveUsers();
    await savePaymentOrders();
    await notifyPaymentOrder(order);
    return order;
  }
  if (order.purpose === "traffic_pack") return fulfillTrafficPackOrderOnce(order, req);
  if (order.purpose === "addon") return fulfillStandaloneAddOnOrderOnce(order, req);
  const email = normalizePaymentEmail(order.email);
  const selectedOption = { ...resolvePaymentPlanOption(order.optionId, { allowLegacy: true }), ...(order.productSnapshot || {}) };
  const selectedTrafficBytes = Number(order.trafficGb) > 0 ? Math.round(Number(order.trafficGb) * 1024 ** 3) : 0;
  const purchasedAt = order.paidAt || new Date().toISOString();
  const account = order.accountId ? accounts.find(item => item.id === order.accountId) : null;
  let user = account?.linkedUserId
    ? users.find(item => item.id === account.linkedUserId)
    : users.find(item => String(item.userId || "").toLowerCase() === email);
  if (!order.rollbackSnapshot) {
    order.rollbackSnapshot = {
      version: 1,
      purpose: "plan",
      capturedAt: new Date().toISOString(),
      accountLinkedUserId: account?.linkedUserId || "",
      userId: user?.id || "",
      user: user ? structuredClone(user) : null
    };
    await savePaymentOrders();
  }
  if (user && !user.email) user.email = email;
  const planGatewayAmount = Number.isFinite(Number(order.planGatewayAmount)) ? Number(order.planGatewayAmount) : Number(order.amount || 0);
  const planCashValueAmount = Number.isFinite(Number(order.planCashValueAmount)) ? Number(order.planCashValueAmount) : Number(order.amount || 0) + Number(order.walletCashAmount || 0);
  const wallet = await dataStore.settleWalletPurchase({
    id: crypto.randomUUID(),
    accountId: account.id,
    orderId: order.id,
    vipDeltaCents: Math.round(planGatewayAmount * 100),
    description: `${order.planName} ${order.optionLabel}`,
    initialVipCents: initialWalletVipCents(account)
  });
  const vipSpendBefore = (wallet.vipSpendCents - Math.round(planGatewayAmount * 100)) / 100;
  syncWalletVip(account, wallet);
  const expiresAt = nextUserExpiry(user, purchasedAt, selectedOption.duration, order.purchaseAction === "replace");
  const recommendation = { subscription: null, reason: "商品统一使用自研线路。", details: null };

  if (user) {
    const previousUserState = structuredClone(user);
    const previousSubscription = subscriptions.find(item => item.id === user.subscriptionId) || null;
    const poolChanged = false;
    let renewal;
    try {
      renewal = renewUser(user, {
        purchasedAt,
        actualPaid: planCashValueAmount,
        vipSpendAmount: planGatewayAmount,
        cashValueAmount: planCashValueAmount,
        duration: selectedOption.duration,
        group: selectedOption.group,
        lineType: "self_hosted",
        unlimited: Boolean(selectedOption.unlimited),
        trafficTier: order.trafficTier || 1,
        trafficLimitBytes: selectedTrafficBytes,
        replace: order.purchaseAction === "replace",
        subscriptionId: recommendation.subscription?.id || ""
      });
      bindUserProductFromOrder(user, order);
      await provisionXuiClient(user);
      await resetXuiTrafficAfterPlanPurchase(user, order);
    } catch (error) {
      Object.keys(user).forEach(key => delete user[key]);
      Object.assign(user, previousUserState);
      throw error;
    }
    bills.unshift(makeBill({
      user,
      type: order.purchaseAction === "replace" ? "replacement" : "renewal",
      paymentOrderId: order.id,
      amount: planCashValueAmount,
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
      toSubscription: recommendation.subscription || null,
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
        productSnapshot: order.productSnapshot || null,
        trafficTier: order.trafficTier || 1,
        trafficGb: order.trafficGb ?? null,
        addOns: order.addOnSnapshots || [],
        duration: user.duration,
        afterExpiresAt: renewal.afterExpiresAt,
        recommendation: recommendation.details || null
      }
    }));
  } else {
    const item = {
      id: crypto.randomUUID(),
      customerID: account?.customerID,
      createdAt: new Date().toISOString()
    };
    user = normalizeUser({
      userId: email,
      email,
      wechatName: "",
      purchasedAt,
      actualPaid: planCashValueAmount,
      vipSpend: wallet.vipSpendCents / 100,
      duration: selectedOption.duration,
      group: selectedOption.group,
      activeGroup: selectedOption.group,
      lineType: "self_hosted",
      unlimited: Boolean(selectedOption.unlimited),
      trafficTier: order.trafficTier || 1,
      xuiTrafficLimitBytes: selectedTrafficBytes || undefined,
      cashValue: planCashValueAmount,
      cashValueAt: purchasedAt,
      subscriptionId: recommendation.subscription?.id || "",
      outputMode: "subconverter",
       blockUserinfo: false
    }, item);
    user.outputMode = "subconverter";
    user.blockUserinfo = false;
    user.trafficTier = order.trafficTier || 1;
    if (selectedTrafficBytes) user.xuiTrafficLimitBytes = selectedTrafficBytes;
    bindUserProductFromOrder(user, order);
    await provisionXuiClient(user);
    await resetXuiTrafficAfterPlanPurchase(user, order);
    users.unshift(user);
    bills.unshift(makeBill({
      user,
      type: "initial",
      paymentOrderId: order.id,
      amount: planCashValueAmount,
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
        productSnapshot: order.productSnapshot || null,
        trafficTier: order.trafficTier || 1,
        trafficGb: order.trafficGb ?? null,
        addOns: order.addOnSnapshots || [],
        amount: user.actualPaid,
        duration: user.duration,
        afterExpiresAt: user.expiresAt,
        recommendation: recommendation.details || null
      }
    }));
  }

  if (selectedTrafficBytes) user.xuiTrafficLimitBytes = selectedTrafficBytes;
  user.trafficTier = order.trafficTier || 1;
  user.purchasedTrafficGb = order.trafficGb ?? null;
  if (Array.isArray(order.addOnSnapshots) && order.addOnSnapshots.length) {
    order.fulfillmentStatus = "manual_pending";
    order.fulfillmentStartedAt = new Date().toISOString();
    appendUserLogToUser(user, createUserLog({ event: "user-action", status: "recorded", reason: "addon-purchased", req, message: `订单包含附加服务：${order.addOnSnapshots.map(item => `${item.name}${item.regionName ? `（${item.regionName}）` : ""}`).join("、")}`, details: { paymentOrderId: order.id, merOrderTid: order.merOrderTid, addOns: order.addOnSnapshots } }));
  }

  order.userId = user.id;
  order.vipSpendBefore = vipSpendBefore;
  user.vipSpend = wallet.vipSpendCents / 100;
  user.level = vipLevelForSpend(user.vipSpend);
  order.vipSpendAfter = wallet.vipSpendCents / 100;
  if (account && account.linkedUserId !== user.id) {
    account.linkedUserId = user.id;
    account.updatedAt = new Date().toISOString();
    await saveAccounts();
  }
  order.deliveryUrl = deliveryUrlForUser(user, req);
  order.planFulfilledAt = new Date().toISOString();
  await saveUsers();
  await saveAccounts();
  await saveBills();
  await createReferralReward(order, account);
  order.fulfilledAt = order.fulfillmentStatus === "manual_pending" ? "" : new Date().toISOString();
  order.fulfillmentStatus = order.fulfillmentStatus === "manual_pending" ? "manual_pending" : "fulfilled";
  order.fulfillmentError = "";
  await savePaymentOrders();
  await notifyPaymentOrder(order);
  return order;
}

async function fulfillPaymentOrder(order, req) {
  if (!order || order.status !== "paid" || order.reversedAt || (order.fulfilledAt && order.fulfillmentStatus !== "failed")) return order;
  const key = String(order.id || order.merOrderTid || "");
  const activeTask = paymentFulfillmentTasks.get(key);
  if (activeTask) return activeTask;

  const task = fulfillPaymentOrderOnce(order, req);
  paymentFulfillmentTasks.set(key, task);
  try {
    return await task;
  } catch (error) {
    order.fulfilledAt = "";
    throw error;
  } finally {
    if (paymentFulfillmentTasks.get(key) === task) paymentFulfillmentTasks.delete(key);
  }
}

const paymentReversalTasks = new Map();

async function reversePaymentOrderOnce(order) {
  if (order.reversedAt) return order;
  if (order.status !== "paid") throw new Error("只有已付款订单可以撤销。");
  if (!order.rollbackSnapshot) throw new Error("该订单创建时尚未记录撤销快照，无法安全地一键撤销。");
  if (!order.fulfilledAt && order.fulfillmentStatus !== "failed") throw new Error("该订单尚未产生可撤销的发放结果。");

  if (order.purpose !== "recharge") {
    const orderIndex = paymentOrders.findIndex(item => item.id === order.id);
    const laterOrder = paymentOrders.find((item, index) =>
      item.id !== order.id && item.accountId === order.accountId && (!item.purpose || item.purpose === "plan") &&
      item.status === "paid" && item.fulfillmentStatus === "fulfilled" && !item.reversedAt &&
      index < orderIndex
    );
    if (laterOrder) throw new Error(`请先撤销后续套餐订单 ${laterOrder.merOrderTid}。`);
  }

  const entryPrefix = order.purpose === "recharge" ? "recharge" : "purchase";
  const originalEntryKey = `${entryPrefix}:${order.id}`;
  const reversalEntryKey = `reversal:${entryPrefix}:${order.id}`;
  const reward = referralRewards.find(item => item.sourceOrderId === order.id);
  await dataStore.checkWalletEntryReversal(originalEntryKey, reversalEntryKey);
  if (reward?.status === "available") {
    await dataStore.checkWalletEntryReversal(`referral:${reward.id}`, `reversal:referral:${reward.id}`);
  }

  if (reward?.status === "available") {
    await dataStore.reverseWalletEntry({
      id: crypto.randomUUID(),
      originalIdempotencyKey: `referral:${reward.id}`,
      idempotencyKey: `reversal:referral:${reward.id}`,
      sourceId: order.id,
      description: `撤销订单返利：${order.merOrderTid}`
    });
  }
  if (reward && reward.status !== "reversed") {
    reward.reversalPreviousStatus = reward.status;
    reward.status = "reversed";
    reward.reversedAt = new Date().toISOString();
    await saveReferralRewards();
  }

  const wallet = await dataStore.reverseWalletEntry({
    id: crypto.randomUUID(),
    originalIdempotencyKey: originalEntryKey,
    idempotencyKey: reversalEntryKey,
    sourceId: order.id,
    description: `撤销订单：${order.merOrderTid}`
  });
  const account = accounts.find(item => item.id === order.accountId);
  if (!account) throw new Error("订单账户不存在，无法完成撤销。");

  if (order.purpose === "recharge") {
    syncWalletVip(account, wallet);
  } else {
    const snapshot = order.rollbackSnapshot;
    for (const bill of bills.filter(item => item.paymentOrderId === order.id)) reverseBill(bill);
    const currentUserId = order.userId || snapshot.userId || snapshot.user?.id || "";
    const currentIndex = users.findIndex(item => item.id === currentUserId);
    if (snapshot.user) {
      const restoredUser = structuredClone(snapshot.user);
      if (currentIndex >= 0) users[currentIndex] = restoredUser;
      else users.unshift(restoredUser);
    } else if (currentIndex >= 0) {
      users.splice(currentIndex, 1);
    }
    account.linkedUserId = snapshot.accountLinkedUserId || "";
    account.updatedAt = new Date().toISOString();
    syncWalletVip(account, wallet);
    await saveBills();
  }

  order.reversedAt = new Date().toISOString();
  order.fulfillmentStatus = "reversed";
  order.reversalError = "";
  order.updatedAt = order.reversedAt;
  await saveUsers();
  await saveAccounts();
  await savePaymentOrders();
  return order;
}

async function reversePaymentOrder(order) {
  const key = String(order?.id || "");
  const activeTask = paymentReversalTasks.get(key);
  if (activeTask) return activeTask;
  const task = reversePaymentOrderOnce(order);
  paymentReversalTasks.set(key, task);
  try {
    return await task;
  } finally {
    if (paymentReversalTasks.get(key) === task) paymentReversalTasks.delete(key);
  }
}

async function notifyPaymentOrder(order) {
  if (process.env.NODE_ENV === "test") return;
  if (!notifier.isTelegramConfigured()) return;
  try {
    await notifier.sendTelegram({ text: notifier.buildPaymentAlert(order) });
  } catch (error) {
    console.error(`Payment notification failed for ${order.merOrderTid}:`, error.message);
  }
}

function assertPendingPaymentOrderLimit(accountId) {
  if (paymentOrders.some(order => order.accountId === accountId && order.status === "pending" && !isPaymentOrderExpired(order))) {
    throw new Error("已有待支付订单，请先完成或取消该订单。");
  }
}

function paymentReturnUrl(config, req, merOrderTid, fallbackUrl = "") {
  const base = String(config.returnUrl || fallbackUrl || `${requestOrigin(req)}/pricing`).trim();
  if (!base || !/^https?:\/\//i.test(base)) return "";
  const url = new URL(base);
  url.searchParams.set("paymentOrder", merOrderTid);
  return url.toString();
}

async function createPaymentOrder(payload, req, account, paymentSource = "online") {
  const manualPayment = paymentSource === "manual";
  const wallet = await walletForAccount(account);
  const trafficPackPurchase = payload.product === "traffic_pack";
  const homeIpPurchase = payload.product === "home_ip";
  const addOnPurchase = trafficPackPurchase || homeIpPurchase;
  const selectedOption = trafficPackPurchase ? trafficPackQuote(account)
    : homeIpPurchase ? homeIpQuote(account, payload.optionId)
    : planQuoteWithAddOns(paymentQuote(payload.optionId, payload.couponCode, undefined, vipLevelForSpend(wallet.vipSpendCents / 100), account.id, payload.trafficTier), payload.addOns);
  if (!manualPayment && !addOnPurchase && selectedOption.purchaseAction === "replace" && payload.confirmReplacement !== true) throw new Error("请确认新套餐将立即覆盖当前套餐。");
  assertPendingPaymentOrderLimit(account.id);
  const email = normalizePaymentEmail(account.email);
  const id = crypto.randomUUID();
  const merOrderTid = makePaymentOrderId();
  const payableCents = manualPayment ? moneyCents(payload.amount, "人工收款金额") : Math.round(selectedOption.amount * 100);
  if (manualPayment && payableCents > 1000000) throw new Error("单次人工收款不能超过 ¥10,000.00。");
  const expiresAt = new Date(Date.now() + PAYMENT_ORDER_TTL_MS).toISOString();
  const hold = payload.useBalance === false || payableCents === 0
    ? { cashCents: 0, giftCents: 0, referralCents: 0 }
    : await dataStore.reserveWallet({ accountId: account.id, orderId: id, amountCents: payableCents, expiresAt, initialVipCents: initialWalletVipCents(account) });
  const gatewayCents = payableCents - hold.cashCents - hold.giftCents - hold.referralCents;
  const planAmountCents = addOnPurchase ? 0 : manualPayment ? payableCents : Math.round(Number(selectedOption.planAmount ?? selectedOption.amount) * 100);
  const planAfterGiftCents = Math.max(planAmountCents - Math.min(planAmountCents, hold.giftCents), 0);
  const planAfterReferralCents = Math.max(planAfterGiftCents - Math.min(planAfterGiftCents, hold.referralCents), 0);
  const planWalletCashCents = Math.min(planAfterReferralCents, hold.cashCents);
  const planGatewayCents = Math.max(planAfterReferralCents - planWalletCashCents, 0);
  const amount = (gatewayCents / 100).toFixed(2);
  let config;
  let channelCode;
  let compactParams = {};
  let result = {};
  try {
    const requestedMethod = String(payload.channelCode || "").trim();
    if (requestedMethod && requestedMethod !== "100" && requestedMethod !== "200") throw new Error("不支持的支付方式。");
    config = !manualPayment && gatewayCents > 0 ? requirePaymentConfig(requestedMethod, String(payload.paymentPlatformId || "").trim()) : null;
    const method = config ? (requestedMethod || paymentMethodForPlatform(config)) : "";
    channelCode = manualPayment ? "manual" : config ? configuredPaymentChannel(config, method) : hold.cashCents + hold.giftCents + hold.referralCents > 0 ? "wallet" : "cash-credit";
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
        returnUrl: paymentReturnUrl(config, req, id, payload.returnUrl),
        ...(config.provider === "xinhui" ? { clientip: requestIp(req) } : {})
      };
      ({ result, requestParams: compactParams } = await createGatewayPayment(config, requestParams));
    }
  } catch (error) {
    await dataStore.releaseWalletHold(id);
    throw error;
  }

  const now = new Date().toISOString();
  const order = {
    id,
    merOrderTid,
    purpose: trafficPackPurchase ? "traffic_pack" : homeIpPurchase ? "addon" : "plan",
    tid: result.tid || "",
    planId: selectedOption.planId,
    planName: selectedOption.planName,
    optionId: String(selectedOption.optionId || payload.optionId || "").trim(),
    optionLabel: selectedOption.optionLabel,
    duration: selectedOption.duration,
    group: selectedOption.group,
    unlimited: Boolean(selectedOption.unlimited),
    trafficTier: selectedOption.trafficTier || 1,
    trafficBaseGb: selectedOption.trafficBaseGb || 0,
    trafficGb: selectedOption.trafficGb ?? null,
    trafficMaxTier: selectedOption.trafficMaxTier || 1,
    trafficTierMarkupPercent: selectedOption.trafficTierMarkupPercent || 0,
    baseAmount: selectedOption.baseAmount ?? selectedOption.originalAmount,
    originalAmount: selectedOption.originalAmount,
    discountAmount: manualPayment ? 0 : selectedOption.discountAmount,
    vipLevel: selectedOption.vipLevel,
    vipDiscountPercent: manualPayment ? 0 : selectedOption.vipDiscountPercent,
    vipDiscountAmount: manualPayment ? 0 : selectedOption.vipDiscountAmount,
    subtotal: manualPayment ? payableCents / 100 : selectedOption.subtotal,
    taxAmount: manualPayment ? 0 : selectedOption.taxAmount,
    beforeCreditAmount: manualPayment ? payableCents / 100 : selectedOption.beforeCreditAmount,
    cashCredit: manualPayment ? 0 : selectedOption.cashCredit,
    purchaseAction: selectedOption.purchaseAction,
    addOns: selectedOption.selectedAddOns || [],
    addOnSnapshots: selectedOption.selectedAddOnSnapshots || [],
    addOnAmount: selectedOption.addOnAmount || 0,
    productSnapshot: {
      planId: selectedOption.planId,
      planName: selectedOption.planName,
      optionId: String(selectedOption.optionId || payload.optionId || "").trim(),
      optionLabel: selectedOption.optionLabel,
      duration: selectedOption.duration,
      group: selectedOption.group,
      lineType: "self_hosted",
      lifetime: Boolean(selectedOption.lifetime),
      trafficTier: selectedOption.trafficTier || 1,
      trafficGb: selectedOption.trafficGb ?? null,
      baseAmount: selectedOption.baseAmount ?? selectedOption.originalAmount,
      originalAmount: selectedOption.originalAmount,
      addOns: selectedOption.selectedAddOnSnapshots || []
    },
    planPayableAmount: planAmountCents / 100,
    planGatewayAmount: planGatewayCents / 100,
    planCashValueAmount: (planGatewayCents + planWalletCashCents) / 100,
    vipSpendAmount: planGatewayCents / 100,
    couponCode: selectedOption.couponCode,
    channelCode,
    paymentPlatformId: config?.id || "",
    paymentPlatformName: manualPayment ? "人工收款" : config?.name || "",
    paymentProvider: manualPayment ? "manual" : config?.provider || "wallet",
    totalAmount: payableCents / 100,
    walletAmount: (hold.cashCents + hold.giftCents + hold.referralCents) / 100,
    walletCashAmount: hold.cashCents / 100,
    walletGiftAmount: hold.giftCents / 100,
    walletReferralAmount: hold.referralCents / 100,
    amount: Number(amount),
    email,
    accountId: account.id,
    payUrl: result.payUrl || "",
    status: config ? platformStatusToOrderStatus(result.payOrderStatus) : "paid",
    platformStatus: result.payOrderStatus ?? null,
    requestParams: compactParams,
    paidAt: config ? "" : now,
    createdAt: now,
    expiresAt,
    updatedAt: now
  };
  paymentOrders.unshift(order);
  try {
    await savePaymentOrders();
  } catch (error) {
    paymentOrders = paymentOrders.filter(item => item.id !== order.id);
    await dataStore.releaseWalletHold(order.id);
    throw error;
  }
  if (order.status === "paid") {
    order.paidAt ||= now;
    try {
      await fulfillPaymentOrder(order, req);
    } catch (error) {
      order.fulfillmentStatus = "failed";
      order.fulfillmentError = error.message;
      order.updatedAt = new Date().toISOString();
      await savePaymentOrders();
      console.error(`Immediate payment fulfillment failed for ${order.merOrderTid}:`, error.message);
    }
  } else if (["failed", "abnormal", "closed"].includes(order.status)) await dataStore.releaseWalletHold(order.id);
  return order;
}

async function createRechargeOrder(payload, req, account) {
  assertPendingPaymentOrderLimit(account.id);
  const amountCents = moneyCents(payload.amount, "充值金额");
  if (amountCents > 1000000) throw new Error("单次充值不能超过 ¥10,000.00。");
  const config = requirePaymentConfig(payload.channelCode);
  const channelCode = configuredPaymentChannel(config, payload.channelCode);
  const id = crypto.randomUUID();
  const merOrderTid = makePaymentOrderId();
  const amount = (amountCents / 100).toFixed(2);
  const notifyUrl = config.notifyUrl || `${requestOrigin(req)}/api/payments/callback`;
  if (!/^https?:\/\//i.test(notifyUrl)) throw new Error("Payment notify URL is unavailable.");
  const requestParams = {
    mid: config.merchantId,
    merOrderTid,
    money: amount,
    channelCode,
    notifyUrl,
    clientUserPayRemark: "余额充值",
    returnUrl: paymentReturnUrl(config, req, id, payload.returnUrl),
    ...(config.provider === "xinhui" ? { clientip: requestIp(req) } : {})
  };
  const { result, requestParams: compactParams } = await createGatewayPayment(config, requestParams);
  const now = new Date().toISOString();
  const order = {
    id,
    merOrderTid,
    tid: result.tid || "",
    purpose: "recharge",
    planId: "wallet",
    planName: "账户余额",
    optionId: "wallet-recharge",
    optionLabel: `充值 ¥${amount}`,
    amount: Number(amount),
    totalAmount: Number(amount),
    vipSpendAmount: Number(amount),
    channelCode,
    paymentPlatformId: config.id,
    paymentPlatformName: config.name,
    paymentProvider: config.provider,
    email: normalizePaymentEmail(account.email),
    accountId: account.id,
    payUrl: result.payUrl || "",
    status: platformStatusToOrderStatus(result.payOrderStatus),
    platformStatus: result.payOrderStatus ?? null,
    requestParams: compactParams,
    paidAt: "",
    createdAt: now,
    expiresAt: new Date(Date.now() + PAYMENT_ORDER_TTL_MS).toISOString(),
    updatedAt: now
  };
  paymentOrders.unshift(order);
  try {
    await savePaymentOrders();
  } catch (error) {
    paymentOrders = paymentOrders.filter(item => item.id !== order.id);
    throw error;
  }
  if (order.status === "paid") {
    order.paidAt = now;
    await fulfillPaymentOrder(order, req);
  }
  return order;
}

async function refreshPaymentOrder(order) {
  if (order.paymentProvider === "test") return order;
  const config = requirePaymentConfig("", order.paymentPlatformId);
  const result = await queryGatewayPayment(config, order);
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
  if (["failed", "abnormal", "closed"].includes(order.status)) await dataStore.releaseWalletHold(order.id);
  await savePaymentOrders();
  return order;
}

async function cancelPaymentOrder(order, req) {
  if (order.status !== "pending" || isPaymentOrderExpired(order)) throw new Error("只有待支付订单可以取消。");
  const refreshedOrder = await refreshPaymentOrder(order);
  if (refreshedOrder.status === "paid") {
    await fulfillPaymentOrder(refreshedOrder, req);
    throw new Error("订单已经支付，无法取消。");
  }
  if (refreshedOrder.status !== "pending") throw new Error("订单已经关闭，无法取消。");
  const now = new Date().toISOString();
  refreshedOrder.status = "closed";
  refreshedOrder.cancelledAt = now;
  refreshedOrder.paymentError = "";
  refreshedOrder.updatedAt = now;
  await dataStore.releaseWalletHold(refreshedOrder.id);
  await savePaymentOrders();
  return refreshedOrder;
}

async function handlePaymentCallback(req) {
  const payload = await readPaymentCallback(req);
  const merOrderTid = String(payload.out_trade_no || payload.merOrderTid || "").trim();
  const order = paymentOrders.find(item => item.merOrderTid === merOrderTid);
  let config = order?.paymentPlatformId
    ? paymentConfigs().find(item => item.id === order.paymentPlatformId)
    : paymentConfigs().find(item => item.merchantId === String(payload.pid || payload.mid || ""));
  if (!config) config = paymentConfigs().find(item => verifyPaymentSign(payload, item));
  if (!config || !verifyPaymentSign(payload, config)) {
    if (order) {
      order.paymentError = "支付通知签名验证失败，请点击检测支付状态或联系客服。";
      order.updatedAt = new Date().toISOString();
      await savePaymentOrders();
    }
    return { ok: false, statusCode: 400, body: "invalid sign" };
  }
  if (order) {
    const now = new Date().toISOString();
    order.tid = String(payload.trade_no || payload.tid || order.tid || "");
    const xinhuiSuccess = config.provider === "xinhui" && payload.trade_status === "TRADE_SUCCESS";
    order.platformStatus = config.provider === "xinhui" ? (xinhuiSuccess ? 1 : 0) : Number(payload.status);
    const callbackStatus = config.provider === "xinhui" ? (xinhuiSuccess ? "paid" : "pending") : platformStatusToOrderStatus(payload.status);
    const paidAfterCancellation = Boolean(order.cancelledAt) && callbackStatus === "paid";
    order.status = order.cancelledAt ? (paidAfterCancellation ? "abnormal" : "closed") : callbackStatus;
    const amountError = callbackStatus === "paid" && !paidAfterCancellation ? paymentAmountError(order.amount, payload.money) : "";
    if (paidAfterCancellation) {
      order.fulfillmentStatus = "failed";
      order.paymentError = "订单取消后支付平台仍收到款项，请联系客服退款。";
    } else if (amountError) {
      order.status = "abnormal";
      order.fulfillmentStatus = "failed";
    }
    if (!paidAfterCancellation) order.paymentError = amountError || paymentStatusError(order.status);
    order.callbackPayload = payload;
    order.updatedAt = now;
    if (order.status === "paid" && !order.paidAt) order.paidAt = now;
    if (["failed", "abnormal", "closed"].includes(order.status)) await dataStore.releaseWalletHold(order.id);
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

function subscriptionSourceType(item = {}) {
  const sourceType = String(item.sourceType || "").trim().toLowerCase();
  return sourceType === "manual" || sourceType === "yaml" ? sourceType : "url";
}

function isManualSubscription(item = {}) {
  return subscriptionSourceType(item) !== "url";
}

function subscriptionHasUsableSource(item = {}) {
  return isManualSubscription(item) ? Boolean(item.manualContent) : Boolean(item.url);
}

function normalizeManualSubscriptionContent(value) {
  const content = String(value || "").replace(/\s+/g, "");
  if (!content) throw new Error("请粘贴 Base64 订阅内容。");
  if (content.length > 750_000) throw new Error("Base64 订阅内容不能超过 750 KB。");
  if (!/^[A-Za-z0-9+/_=-]+$/.test(content)) throw new Error("手动订阅内容不是有效的 Base64。");

  const decoded = Buffer.from(content.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  if (!/(?:^|\s)(?:ss|ssr|vmess|vless|trojan|hysteria2?|tuic):\/\//im.test(decoded)) {
    throw new Error("Base64 内容中没有识别到可用的代理节点。");
  }
  return content;
}

function normalizeManualYamlContent(value) {
  const content = String(value || "").trim();
  if (!content) throw new Error("请粘贴完整的 YAML 配置。");
  if (Buffer.byteLength(content, "utf8") > 750_000) throw new Error("手动 YAML 配置不能超过 750 KB。");
  let doc;
  try {
    doc = yaml.load(content);
  } catch (error) {
    throw new Error(`手动 YAML 配置无法解析：${error.message}`);
  }
  if (!doc || typeof doc !== "object") throw new Error("手动 YAML 配置必须是一个配置对象。");
  normalizeClashKeys(doc);
  if (!Array.isArray(doc.proxies) || !doc.proxies.length) throw new Error("手动 YAML 配置中没有找到 proxies 节点。");
  return content;
}

function normalizeManualContent(item, value = item?.manualContent) {
  return subscriptionSourceType(item) === "yaml"
    ? normalizeManualYamlContent(value)
    : normalizeManualSubscriptionContent(value);
}

function normalizeManualExpiry(value) {
  const input = String(value || "").trim();
  if (!input) return "";
  const timestamp = Date.parse(input);
  if (!Number.isFinite(timestamp)) throw new Error("手动订阅到期日无效。");
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? `${input}T23:59:59.999Z` : new Date(timestamp).toISOString();
}

function normalizeSubscription(input, existing = {}) {
  if (input.sourceType !== undefined && !["url", "manual", "yaml"].includes(String(input.sourceType).trim().toLowerCase())) {
    throw new Error("配置来源必须是远程 URL、手动 Base64 或手动 YAML。");
  }
  const sourceType = input.sourceType !== undefined
    ? subscriptionSourceType({ sourceType: input.sourceType })
    : subscriptionSourceType(existing);
  const rawUrl = sourceType === "url" ? String(input.url ?? existing.url ?? "").trim() : "";
  const email = String(input.email || existing.email || "").trim();
  const generatedName = email || safeHostName(rawUrl) || existing.name || (sourceType === "yaml" ? "手动 YAML 配置" : sourceType === "manual" ? "手动订阅" : "");
  const name = String(input.name || generatedName).trim();
  const url = sourceType === "url" ? rawUrl : "";
  const manualContent = isManualSubscription({ sourceType })
    ? normalizeManualContent({ sourceType }, input.manualContent ?? existing.manualContent ?? "")
    : "";
  const serviceProvider = normalizeServiceProvider(input, existing);
  const serviceProviderWebsite = normalizeServiceProviderWebsite(input, existing, serviceProvider);
  const customer = String(input.customer || existing.customer || "").trim();
  const note = String(input.note || existing.note || "").trim();
  const enabled = input.enabled !== undefined ? Boolean(input.enabled) : existing.enabled !== false;
  const excludeFromAutoSwitch = input.excludeFromAutoSwitch !== undefined
    ? Boolean(input.excludeFromAutoSwitch)
    : Boolean(existing.excludeFromAutoSwitch);
  const useCachedConfigForFallback = input.useCachedConfigForFallback !== undefined
    ? Boolean(input.useCachedConfigForFallback)
    : Boolean(existing.useCachedConfigForFallback);
  const manualTrafficDepleted = isManualSubscription({ sourceType })
    ? Boolean(input.manualTrafficDepleted ?? existing.manualTrafficDepleted)
    : false;
  const maxUsers = Number(input.maxUsers ?? existing.maxUsers ?? 15);
  const manualExpiryRequired = isManualSubscription({ sourceType }) && (!existing.id || input.sourceType !== undefined || input.manualContent !== undefined);
  const manualExpireAt = isManualSubscription({ sourceType })
    ? normalizeManualExpiry(input.expiresAt ?? existing.metrics?.expireAt)
    : "";
  const metrics = manualExpireAt ? { ...(existing.metrics || {}), expireAt: manualExpireAt } : existing.metrics || null;
  const allowedGroups = [...new Set((Array.isArray(input.allowedGroups) ? input.allowedGroups : (Array.isArray(existing.allowedGroups) ? existing.allowedGroups : USER_GROUPS))
    .map(value => String(value).trim().toLowerCase())
    .filter(value => USER_GROUPS.includes(value)))];

  if (sourceType === "url" && (!url || !/^https?:\/\//i.test(url))) throw new Error("请填写 http 或 https 开头的订阅 URL。");
  if (manualExpiryRequired && !manualExpireAt) throw new Error("请填写手动订阅的到期日。");
  if (!allowedGroups.length) throw new Error("至少选择一个允许的套餐等级。");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("请填写该订阅绑定的有效邮箱。");
  if (!Number.isSafeInteger(maxUsers) || maxUsers <= 0) throw new Error("人数上限必须是大于 0 的整数。");

  return {
    ...existing,
    name,
    sourceType,
    url,
    manualContent,
    metrics,
    email,
    serviceProvider,
    serviceProviderWebsite,
    customer,
    note,
    enabled,
    excludeFromAutoSwitch,
    useCachedConfigForFallback,
    manualTrafficDepleted,
    maxUsers,
    allowedGroups,
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

function isSelfHostedUser(user = {}) {
  return user.lineType === "self_hosted";
}

function normalizeXuiInboundGroups(value = {}) {
  const source = value.groups || value;
  return Object.fromEntries(USER_GROUPS.map(group => [group, [...new Set((Array.isArray(source?.[group]) ? source[group] : [])
    .map(Number).filter(id => Number.isSafeInteger(id) && id > 0))]]));
}

function normalizeXuiInboundMetadata(value = {}) {
  const source = value.metadata || value;
  const levels = new Set(["premium", "optimized", "standard"]);
  return Object.fromEntries(Object.entries(source || {}).flatMap(([key, item]) => {
    const networkLevel = levels.has(item?.networkLevel) ? item.networkLevel : "";
    const region = String(item?.region || "").trim().slice(0, 64);
    return key && key.length <= 256 && (networkLevel || region) ? [[key, { networkLevel, region }]] : [];
  }));
}

function normalizeXuiInboundEnable(idValue, enable) {
  const id = Number(idValue);
  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error("入站 ID 无效。");
    error.statusCode = 400;
    throw error;
  }
  if (typeof enable !== "boolean") {
    const error = new Error("enable 必须是布尔值。");
    error.statusCode = 400;
    throw error;
  }
  return { id, enable };
}

function pricingForUser(user = {}) {
  return publicPricing().find(item => item.group === activeUserGroup(user)) || null;
}

function planTrafficBytes(user = {}) {
  if (user.unlimited) return 0;
  const plan = pricingForUser(user);
  const lifetime = user.duration === "lifetime";
  const configured = Number(lifetime ? plan?.lifetimeTrafficBytes : plan?.trafficBytes);
  if (Number.isFinite(configured) && configured >= 0) return Math.round(configured);
  const match = String(lifetime ? plan?.lifetimeTraffic : plan?.traffic || "").match(/(\d+(?:\.\d+)?)\s*(TB|GB|G|MB|M)/i);
  if (!match) return 0;
  const factors = { TB: 1024 ** 4, GB: 1024 ** 3, G: 1024 ** 3, MB: 1024 ** 2, M: 1024 ** 2 };
  return Math.round(Number(match[1]) * factors[match[2].toUpperCase()]);
}

function xuiTrafficLimitBytes(user = {}, remote = {}) {
  const managed = Number(user.xuiTrafficLimitBytes);
  if (Number.isFinite(managed) && managed >= 0) return Math.round(managed);
  if (user.unlimited) return 0;
  const remoteLimit = Number(remote.totalGB);
  return Number.isFinite(remoteLimit) && remoteLimit > 0 ? Math.round(remoteLimit) : planTrafficBytes(user) || XUI_DEFAULT_TRAFFIC_BYTES;
}

function grantTrafficPack(user, orderId, trafficPackBytes = Math.round(trafficPackConfig().trafficGb * 1024 ** 3)) {
  const appliedOrderIds = Array.isArray(user.xuiTrafficPackOrderIds) ? user.xuiTrafficPackOrderIds : [];
  if (appliedOrderIds.includes(orderId)) return { replayed: true };
  const usedBytes = Math.max(0, Number(user.xuiLastTraffic?.usedBytes) || 0);
  const remainingBytesBefore = Math.max(0, Number(user.xuiLastTraffic?.remainingBytes) || 0);
  const totalBytes = usedBytes + remainingBytesBefore + trafficPackBytes;
  user.xuiTrafficLimitBytes = totalBytes;
  user.xuiTrafficPackBytes = Math.max(0, Number(user.xuiTrafficPackBytes) || 0) + trafficPackBytes;
  user.xuiTrafficPackCycleKey = user.xuiTrafficCycleKey || "";
  user.xuiTrafficPackOrderIds = [...appliedOrderIds, orderId];
  if (user.xuiWeightedTraffic) {
    user.xuiWeightedTraffic.totalBytes = totalBytes;
    user.xuiWeightedTraffic.remainingBytes = remainingBytesBefore + trafficPackBytes;
    user.xuiWeightedTraffic.usagePercent = totalBytes ? Math.min(100, Math.round(usedBytes / totalBytes * 1000) / 10) : null;
    user.xuiWeightedTraffic.depleted = false;
  }
  if (user.xuiLastTraffic) {
    user.xuiLastTraffic.totalBytes = totalBytes;
    user.xuiLastTraffic.remainingBytes = remainingBytesBefore + trafficPackBytes;
    user.xuiLastTraffic.usagePercent = totalBytes ? Math.min(100, Math.round(usedBytes / totalBytes * 1000) / 10) : null;
    user.xuiLastTraffic.status = "active";
  }
  return { replayed: false, remainingBytesBefore, remainingBytesAfter: remainingBytesBefore + trafficPackBytes, totalBytes };
}

function ensureTrafficPackSnapshot(user) {
  if (user.xuiLastTraffic?.remainingBytes != null && Number.isFinite(Number(user.xuiLastTraffic.remainingBytes))) return;
  const totalBytes = xuiTrafficLimitBytes(user);
  const usedBytes = Math.max(0, Number(user.xuiWeightedTraffic?.usedBytes) || 0);
  const remainingBytes = Math.max(totalBytes - usedBytes, 0);
  const now = new Date().toISOString();
  user.xuiWeightedTraffic = { ...(user.xuiWeightedTraffic || {}), rawUsedBytes: Number(user.xuiWeightedTraffic?.rawUsedBytes) || usedBytes, usedBytes, totalBytes, remainingBytes, usagePercent: totalBytes ? Math.min(100, Math.round(usedBytes / totalBytes * 1000) / 10) : null, depleted: totalBytes > 0 && usedBytes >= totalBytes, inbounds: user.xuiWeightedTraffic?.inbounds || [], nodes: user.xuiWeightedTraffic?.nodes || [], lastSyncedAt: user.xuiWeightedTraffic?.lastSyncedAt || now };
  user.xuiLastTraffic = { ...(user.xuiLastTraffic || {}), available: true, status: "active", uploadBytes: Number(user.xuiLastTraffic?.uploadBytes) || 0, downloadBytes: Number(user.xuiLastTraffic?.downloadBytes) || 0, rawUsedBytes: Number(user.xuiLastTraffic?.rawUsedBytes) || usedBytes, usedBytes, totalBytes, remainingBytes, usagePercent: totalBytes ? Math.min(100, Math.round(usedBytes / totalBytes * 1000) / 10) : null, connectedIpCount: user.xuiLastTraffic?.connectedIpCount ?? null, ipLimit: Number(user.xuiLastTraffic?.ipLimit) || planDeviceLimit(user), nextResetAt: user.xuiNextTrafficResetAt || "", expiresAt: user.expiresAt, inbounds: user.xuiLastTraffic?.inbounds || [], nodes: user.xuiLastTraffic?.nodes || [], lastSyncedAt: user.xuiLastTraffic?.lastSyncedAt || now };
}

function expireUserTrafficPacks(user) {
  if (!(Number(user.xuiTrafficPackBytes) > 0)) return false;
  const totalBytes = planTrafficBytes(user);
  const usedBytes = Math.max(0, Number(user.xuiLastTraffic?.usedBytes) || 0);
  user.xuiTrafficLimitBytes = totalBytes;
  user.xuiTrafficPackBytes = 0;
  user.xuiTrafficPackCycleKey = "";
  if (user.xuiWeightedTraffic) {
    user.xuiWeightedTraffic.totalBytes = totalBytes;
    user.xuiWeightedTraffic.remainingBytes = Math.max(totalBytes - usedBytes, 0);
    user.xuiWeightedTraffic.usagePercent = totalBytes ? Math.min(100, Math.round(usedBytes / totalBytes * 1000) / 10) : null;
    user.xuiWeightedTraffic.depleted = totalBytes > 0 && usedBytes >= totalBytes;
  }
  if (user.xuiLastTraffic) {
    user.xuiLastTraffic.totalBytes = totalBytes;
    user.xuiLastTraffic.remainingBytes = Math.max(totalBytes - usedBytes, 0);
    user.xuiLastTraffic.usagePercent = totalBytes ? Math.min(100, Math.round(usedBytes / totalBytes * 1000) / 10) : null;
  }
  return true;
}

async function enableXuiClientAfterTrafficPack(user) {
  const email = xuiClientEmail(user);
  const remote = await getXuiClientByEmail(email);
  await xuiRequest(`/panel/api/clients/update/${encodeURIComponent(email)}`, { method: "POST", body: xuiClientWritePayload(remote, { ...remote, totalGB: user.xuiTrafficLimitBytes, reset: 0, flow: XUI_VISION_FLOW, enable: true }) });
  await xuiRequest("/panel/api/clients/bulkEnable", { method: "POST", body: { emails: [email] } });
  const state = await getXuiBillingState();
  if (state.users[email]) {
    state.users[email].totalBytes = user.xuiTrafficLimitBytes;
    state.users[email].disabled = false;
    await saveXuiBillingState(state);
  }
}

function chinaDateParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const shifted = new Date(date.getTime() + CHINA_TIME_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

function xuiMonthlyResetAt(anchorDay, after = Date.now()) {
  const day = Math.min(31, Math.max(1, Number(anchorDay) || 1));
  const current = chinaDateParts(after);
  if (!current) return "";
  for (let offset = 0; offset < 2; offset += 1) {
    const monthIndex = current.month + offset;
    const year = current.year + Math.floor(monthIndex / 12);
    const month = ((monthIndex % 12) + 12) % 12;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const timestamp = Date.UTC(year, month, Math.min(day, daysInMonth)) - CHINA_TIME_OFFSET_MS;
    if (timestamp > Number(after)) return new Date(timestamp).toISOString();
  }
  return "";
}

function initializeXuiTrafficSchedule(user, remote = {}, mode = "import", now = Date.now()) {
  const purchased = chinaDateParts(user.purchasedAt || user.createdAt || now);
  user.xuiManagementMode = mode;
  user.xuiTrafficLimitBytes = mode === "link" && Number(remote.totalGB) > 0
    ? Math.round(Number(remote.totalGB))
    : XUI_DEFAULT_TRAFFIC_BYTES;
  user.xuiTrafficResetAnchorDay = purchased?.day || chinaDateParts(now).day;
  user.xuiTrafficCycleKey = `linked:${new Date(now).toISOString()}`;
  user.xuiNextTrafficResetAt = xuiMonthlyResetAt(user.xuiTrafficResetAnchorDay, now);
  user.xuiLastTrafficResetAt = "";
}

function legacyMigrationTrafficLimitBytes(user = {}) {
  if (user.unlimited) return 0;
  if (user.duration === "lifetime") return planTrafficBytes(user);
  return (LEGACY_RECURRING_TRAFFIC_GB[activeUserGroup(user)] || 100) * 1024 ** 3;
}

function initializeLegacyXuiMigration(user, existing, now = Date.now()) {
  const purchased = chinaDateParts(user.purchasedAt || user.createdAt || now);
  user.xuiManagementMode = existing ? "link" : "import";
  user.xuiTrafficLimitBytes = legacyMigrationTrafficLimitBytes(user);
  user.xuiTrafficResetAnchorDay ||= purchased?.day || chinaDateParts(now).day;
  user.xuiTrafficCycleKey ||= `migration:${new Date(now).toISOString()}`;
  user.xuiNextTrafficResetAt ||= user.duration === "lifetime" ? "" : xuiMonthlyResetAt(user.xuiTrafficResetAnchorDay, now);
  user.xuiLastTrafficResetAt ||= "";
  user.xuiTrafficBaselinePending = Boolean(existing);
  user.xuiTrafficBaselineVersion = existing ? 0 : 2;
}

function planDeviceLimit(user = {}) {
  const plan = pricingForUser(user);
  const value = Number(user.duration === "lifetime" ? plan?.lifetimeDevices : plan?.[`${user.duration}Devices`]);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function xuiConfigured() {
  return Boolean(XUI_BASE_URL && XUI_API_TOKEN && SUB_CONVERTER_URL && XUI_SUBSCRIPTION_BASE_URL);
}

function validAccountEmail(value) {
  try { return normalizeAccountEmail(value); } catch { return ""; }
}

function nexoraUserEmail(user = {}) {
  const linkedAccount = accounts.find(item => item.linkedUserId === user.id);
  return [user.email, linkedAccount?.email, user.userId].map(validAccountEmail).find(Boolean) || "";
}

function xuiClientEmail(user = {}) {
  const email = String(user.xuiClientEmail || nexoraUserEmail(user)).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("自研线路用户缺少有效的注册邮箱。");
  return email;
}

function legacyXuiClientEmail(user = {}) {
  return `nexora_${String(user.customerID || user.id || "user").replace(/[^a-zA-Z0-9_-]/g, "_")}@internal`.toLowerCase();
}

function xuiClientComment(user = {}) {
  const name = String(user.wechatName || "").trim() || "unknown";
  const customerId = String(user.customerID || "").replace(/\D/g, "").padStart(6, "0").slice(-6);
  return `${name}#${customerId}`;
}

async function persistXuiAudit(entry) {
  try {
    await dataStore.appendXuiAuditLog(entry);
  } catch (error) {
    xuiLogger.error({ error: error.message }, "Failed to persist 3x-ui audit log");
  }
}

async function xuiRequestAt(baseUrl, apiToken, apiPath, { method = "GET", body } = {}) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const logContext = { event: "xui.request", requestId, method, apiPath, panelHost: new URL(baseUrl).host, readOnly: XUI_READ_ONLY };
  if (XUI_SERVICE_URL) {
    return requestXui({
      serviceUrl: XUI_SERVICE_URL,
      serviceToken: XUI_SERVICE_TOKEN,
      baseUrl,
      apiToken,
      apiPath,
      method,
      body,
      requestId,
      timeoutMs: XUI_TIMEOUT_MS + 1000
    });
  }
  try {
    assertXuiRequestAllowed(XUI_READ_ONLY, method, apiPath);
  } catch (error) {
    const entry = { ...logContext, level: "warn", transport: "guard", allowed: false, statusCode: error.statusCode, durationMs: Date.now() - startedAt, error: error.message };
    xuiLogger.warn(entry, "3x-ui request blocked");
    await persistXuiAudit(entry);
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), XUI_TIMEOUT_MS);
  let statusCode = 502;
  try {
    const response = await fetch(`${baseUrl}${apiPath}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        ...(body === undefined ? {} : { "content-type": "application/json" })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    statusCode = response.status;
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; } catch { throw new Error(`3x-ui 返回了无效响应（HTTP ${response.status}）。`); }
    if (!response.ok || payload.success !== true) {
      const error = new Error(payload.msg || payload.error || `3x-ui 请求失败（HTTP ${response.status}）。`);
      error.statusCode = response.status;
      throw error;
    }
    const entry = { ...logContext, level: "info", transport: "direct", allowed: true, statusCode, durationMs: Date.now() - startedAt };
    xuiLogger.info(entry, "3x-ui request completed");
    await persistXuiAudit(entry);
    return payload.obj;
  } catch (error) {
    const requestError = error.name === "AbortError" ? Object.assign(new Error("3x-ui 请求超时。"), { statusCode: 504 }) : error;
    const entry = { ...logContext, level: "warn", transport: "direct", allowed: true, statusCode: requestError.statusCode || statusCode, durationMs: Date.now() - startedAt, error: requestError.message };
    xuiLogger.warn(entry, "3x-ui request failed");
    await persistXuiAudit(entry);
    throw requestError;
  } finally {
    clearTimeout(timer);
  }
}

async function xuiRequest(apiPath, options) {
  if (!XUI_BASE_URL || !XUI_API_TOKEN) throw new Error("3x-ui 尚未配置，请设置 XUI_BASE_URL 和 XUI_API_TOKEN。");
  return xuiRequestAt(XUI_BASE_URL, XUI_API_TOKEN, apiPath, options);
}

function xuiNodeBaseUrl(node = {}) {
  const scheme = String(node.scheme || "https").toLowerCase();
  if (!['http', 'https'].includes(scheme) || !node.address) throw new Error("节点 API 地址无效。");
  const basePath = String(node.basePath || "").replace(/^\/+|\/+$/g, "");
  return `${scheme}://${node.address}${node.port ? `:${node.port}` : ""}${basePath ? `/${basePath}` : ""}`;
}

function sealXuiNodeToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", crypto.createHash("sha256").update(XUI_API_TOKEN).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(String(token), "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function openXuiNodeToken(value) {
  const [version, iv, tag, encrypted] = String(value || "").split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) return "";
  const decipher = crypto.createDecipheriv("aes-256-gcm", crypto.createHash("sha256").update(XUI_API_TOKEN).digest(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

function normalizeXuiClientResult(value, fallbackEmail = "") {
  const root = value && typeof value === "object" ? value : {};
  const client = root.client && typeof root.client === "object" ? root.client : root;
  const traffic = client.traffic || root.traffic || {};
  const upload = Math.max(0, Number(traffic.up ?? client.up ?? root.up) || 0);
  const download = Math.max(0, Number(traffic.down ?? client.down ?? root.down) || 0);
  const usedTraffic = Math.max(0, Number(root.usedTraffic ?? client.usedTraffic ?? traffic.usedTraffic) || upload + download);
  return {
    ...client,
    email: String(client.email || fallbackEmail),
    inboundIds: (Array.isArray(root.inboundIds) ? root.inboundIds : Array.isArray(client.inboundIds) ? client.inboundIds : []).map(Number).filter(Number.isSafeInteger),
    usedTraffic,
    traffic: {
      up: upload,
      down: download,
      enable: traffic.enable !== false
    }
  };
}

function normalizeXuiInboundIds(value) {
  const rows = Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : Array.isArray(value?.inbounds) ? value.inbounds : [];
  return [...new Set(rows.map(item => Number(item?.id ?? item)).filter(Number.isSafeInteger))];
}

function normalizeXuiMonitor(status = {}, value = []) {
  const rows = Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : Array.isArray(value?.nodes) ? value.nodes : [];
  const nodes = rows.map((item, index) => {
    const heartbeat = Math.max(0, Number(item?.lastHeartbeat) || 0);
    return {
      id: String(item?.id ?? index),
      guid: String(item?.guid || `node:${item?.id ?? index}`),
      name: String(item?.remark || item?.name || `Node ${item?.id ?? index + 1}`),
      address: String(item?.address || ""),
      port: Number(item?.port) || null,
      enabled: item?.enable !== false,
      status: String(item?.status || "unknown"),
      lastHeartbeat: heartbeat ? new Date(heartbeat < 1e12 ? heartbeat * 1000 : heartbeat).toISOString() : "",
      latencyMs: Math.max(0, Number(item?.latencyMs) || 0),
      cpu: Math.max(0, Number(item?.cpuPct) || 0),
      memory: Math.max(0, Number(item?.memPct) || 0),
      uptime: Math.max(0, Number(item?.uptimeSecs) || 0),
      uploadBytes: Math.max(0, Number(item?.netUp) || 0),
      downloadBytes: Math.max(0, Number(item?.netDown) || 0),
      xrayState: String(item?.xrayState || "unknown"),
      xrayVersion: String(item?.xrayVersion || ""),
      panelVersion: String(item?.panelVersion || ""),
      inboundCount: Math.max(0, Number(item?.inboundCount) || 0),
      clientCount: Math.max(0, Number(item?.clientCount) || 0),
      onlineCount: Math.max(0, Number(item?.onlineCount) || 0),
      lastError: String(item?.lastError || item?.xrayError || "")
    };
  });
  const memory = status?.mem || status?.memory || {};
  const disk = status?.disk || {};
  const net = status?.netTraffic || {};
  const netIO = status?.netIO || {};
  return {
    system: {
      cpu: Math.max(0, Number(status?.cpu) || 0),
      cpuCores: Math.max(0, Number(status?.cpuCores) || 0),
      memoryUsed: Math.max(0, Number(memory?.current ?? memory?.used) || 0),
      memoryTotal: Math.max(0, Number(memory?.total) || 0),
      diskUsed: Math.max(0, Number(disk?.current ?? disk?.used) || 0),
      diskTotal: Math.max(0, Number(disk?.total) || 0),
      uptime: Math.max(0, Number(status?.uptime) || 0),
      xrayState: String(status?.xray?.state ?? status?.xrayState ?? "unknown"),
      xrayVersion: String(status?.xray?.version ?? status?.xrayVersion ?? ""),
      sentBytes: Math.max(0, Number(net?.sent ?? netIO?.up) || 0),
      receivedBytes: Math.max(0, Number(net?.recv ?? netIO?.down) || 0)
    },
    nodes
  };
}

function normalizeXuiConnectedIps(value, email) {
  const target = String(email || "").trim().toLowerCase();
  const ips = new Set();
  for (const clients of Object.values(value && typeof value === "object" ? value : {})) {
    if (!clients || typeof clients !== "object") continue;
    for (const [clientEmail, entries] of Object.entries(clients)) {
      if (String(clientEmail).trim().toLowerCase() !== target) continue;
      for (const entry of Array.isArray(entries) ? entries : []) {
        const ip = String(entry?.ip || entry || "").trim().split(" ")[0];
        if (ip) ips.add(ip);
      }
    }
  }
  return [...ips];
}

function normalizeXuiInbounds(value = []) {
  const rows = Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : Array.isArray(value?.inbounds) ? value.inbounds : [];
  return rows.map((item, index) => ({
    id: String(item?.id ?? index),
    name: String(item?.remark || item?.tag || `Inbound ${item?.id ?? index + 1}`),
    protocol: String(item?.protocol || "unknown"),
    port: Number(item?.port) || null,
    enabled: item?.enable !== false,
    clients: Array.isArray(item?.clientStats) ? item.clientStats.length : Array.isArray(item?.settings?.clients) ? item.settings.clients.length : 0,
    uploadBytes: Math.max(0, Number(item?.up) || 0),
    downloadBytes: Math.max(0, Number(item?.down) || 0),
    totalBytes: Math.max(0, Number(item?.total) || 0),
    expiryTime: Math.max(0, Number(item?.expiryTime) || 0)
  }));
}

function xuiInboundKey(inbound = {}) {
  return `${String(inbound.originNodeGuid || `node:${inbound.nodeId || "local"}`)}:${String(inbound.id ?? "")}`;
}

function xuiActiveInboundKeys(value) {
  const keys = new Set();
  if (!value || typeof value !== "object") return keys;
  for (const [guid, tags] of Object.entries(value)) {
    for (const tag of Array.isArray(tags) ? tags : []) keys.add(`${guid}:${tag}`);
  }
  return keys;
}

function normalizeXuiPresence(onlinesByGuid, lastOnline, nodes = [], status = {}) {
  const onlineByGuid = {};
  for (const [guid, emails] of Object.entries(onlinesByGuid && typeof onlinesByGuid === "object" ? onlinesByGuid : {})) {
    onlineByGuid[String(guid)] = [...new Set((Array.isArray(emails) ? emails : []).map(email => String(email).trim().toLowerCase()).filter(Boolean))];
  }
  const normalizedLastOnline = Object.fromEntries(Object.entries(lastOnline && typeof lastOnline === "object" ? lastOnline : {})
    .map(([email, timestamp]) => {
      const value = Math.max(0, Number(timestamp) || 0);
      return [String(email).trim().toLowerCase(), value > 1e12 ? Math.floor(value / 1000) : value];
    }).filter(([email]) => email));
  const nodeNames = Object.fromEntries((Array.isArray(nodes) ? nodes : []).map(node => [String(node?.guid || `node:${node?.id}`), String(node?.remark || node?.name || node?.address || node?.guid || node?.id)]));
  nodeNames[String(status?.panelGuid || "node:local")] = XUI_PANEL_NAME;
  return {
    onlineEmails: [...new Set(Object.values(onlineByGuid).flat())],
    onlineByGuid,
    lastOnline: normalizedLastOnline,
    nodeNames
  };
}

async function getXuiState(key, legacyCollection) {
  if (!XUI_SERVICE_URL) return dataStore.getRecord(legacyCollection, "state");
  return requestXuiService({
    serviceUrl: XUI_SERVICE_URL,
    serviceToken: XUI_SERVICE_TOKEN,
    path: `/internal/state/${encodeURIComponent(key)}`,
    timeoutMs: XUI_TIMEOUT_MS
  });
}

async function setXuiState(key, legacyCollection, value) {
  if (!XUI_SERVICE_URL) return dataStore.setRecord(legacyCollection, "state", value);
  return requestXuiService({
    serviceUrl: XUI_SERVICE_URL,
    serviceToken: XUI_SERVICE_TOKEN,
    path: `/internal/state/${encodeURIComponent(key)}`,
    method: "PUT",
    body: value,
    timeoutMs: XUI_TIMEOUT_MS
  });
}

function xuiTrafficByUser(value = []) {
  const rows = Array.isArray(value) ? value : [];
  const result = {};
  for (const inbound of rows) {
    const nodeGuid = String(inbound?.originNodeGuid || `node:${inbound?.nodeId || "local"}`);
    for (const client of Array.isArray(inbound?.clientStats) ? inbound.clientStats : []) {
      const email = String(client?.email || "").trim().toLowerCase();
      if (!email) continue;
      result[email] ||= {};
      result[email][nodeGuid] = Math.max(result[email][nodeGuid] || 0, Math.max(0, Number(client?.up) || 0) + Math.max(0, Number(client?.down) || 0));
    }
  }
  return result;
}

function chinaDateKey(value = Date.now()) {
  const parts = chinaDateParts(value);
  return parts ? `${parts.year}-${String(parts.month + 1).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}` : "";
}

function xuiDailyNodeTraffic(traffic = {}, previous = {}) {
  const currentByNode = {};
  for (const byNode of Object.values(traffic)) for (const [guid, bytes] of Object.entries(byNode || {})) currentByNode[guid] = (currentByNode[guid] || 0) + Math.max(0, Number(bytes) || 0);
  const date = chinaDateKey();
  const baseline = previous.date === date ? previous.nodes || {} : {};
  const nodes = {};
  for (const [guid, current] of Object.entries(currentByNode)) {
    const prior = baseline[guid] || { baselineBytes: current, usedBytes: 0 };
    const delta = current >= Number(prior.baselineBytes) ? current - Number(prior.baselineBytes) : current;
    nodes[guid] = { baselineBytes: current, usedBytes: Math.max(0, Number(prior.usedBytes) || 0) + delta };
  }
  return { date, nodes };
}

function xuiMultiplier(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 1;
}

function calculateXuiBillingLedger(previous, currentByNode, multipliers, cycleKey) {
  const cycleBase = value => String(value || "").replace(/\|direct-(?:nodes|inbounds)-v\d+$/, "");
  const reset = Boolean(previous?.cycleKey && cycleBase(previous.cycleKey) !== cycleBase(cycleKey));
  const inboundMigration = !reset && previous?.inbounds && !previous?.nodes;
  const carriedRawBytes = reset ? 0 : Math.max(0, Number(previous?.carriedRawBytes) || 0);
  const carriedWeightedBytes = reset ? 0 : Math.max(0, Number(previous?.carriedWeightedBytes) || 0);
  const nodes = reset ? {} : structuredClone(previous?.nodes || {});
  if (inboundMigration) for (const [key, item] of Object.entries(previous.inbounds)) {
    const nodeGuid = key.slice(0, key.lastIndexOf(":"));
    const prior = nodes[nodeGuid] || {};
    nodes[nodeGuid] = {
      baselineBytes: Math.max(Number(prior.baselineBytes) || 0, Number(item.baselineBytes) || 0),
      rawBytes: Math.max(Number(prior.rawBytes) || 0, Number(item.rawBytes) || 0),
      weightedBytes: Math.max(Number(prior.weightedBytes) || 0, Number(item.weightedBytes) || 0)
    };
  }
  for (const [nodeGuid, currentBytes] of Object.entries(currentByNode || {})) {
    const prior = nodes[nodeGuid];
    const current = Math.max(0, Number(currentBytes) || 0);
    const delta = reset ? 0 : prior ? (current >= prior.baselineBytes ? current - prior.baselineBytes : current) : current;
    const multiplier = xuiMultiplier(multipliers?.[nodeGuid]);
    nodes[nodeGuid] = {
      baselineBytes: current,
      rawBytes: Math.max(0, Number(prior?.rawBytes) || 0) + delta,
      weightedBytes: Math.max(0, Number(prior?.weightedBytes) || 0) + Math.round(delta * multiplier)
    };
  }
  return {
    cycleKey,
    cycleReset: Boolean(reset),
    disabled: reset ? false : previous?.disabled === true,
    carriedRawBytes,
    carriedWeightedBytes,
    nodes,
    rawBytes: carriedRawBytes + Object.values(nodes).reduce((sum, item) => sum + item.rawBytes, 0),
    weightedBytes: carriedWeightedBytes + Object.values(nodes).reduce((sum, item) => sum + item.weightedBytes, 0),
    updatedAt: new Date().toISOString()
  };
}

function createXuiBillingBaseline(currentByNode, cycleKey, multipliers = {}) {
  const nodes = Object.fromEntries(Object.entries(currentByNode || {}).map(([key, value]) => [key, {
    baselineBytes: Math.max(0, Number(value) || 0),
    rawBytes: Math.max(0, Number(value) || 0),
    weightedBytes: Math.round(Math.max(0, Number(value) || 0) * xuiMultiplier(multipliers[key]))
  }]));
  return { cycleKey, cycleReset: false, disabled: false, carriedRawBytes: 0, carriedWeightedBytes: 0, nodes, rawBytes: Object.values(nodes).reduce((sum, item) => sum + item.rawBytes, 0), weightedBytes: Object.values(nodes).reduce((sum, item) => sum + item.weightedBytes, 0), updatedAt: new Date().toISOString() };
}

function xuiClientCycleKey(client = {}, now = Date.now()) {
  const createdAt = Number(client.createdAt) || now;
  const createdMs = createdAt < 1e12 ? createdAt * 1000 : createdAt;
  const resetDays = Math.max(0, Number(client.reset) || 0);
  const period = resetDays ? Math.max(0, Math.floor((now - createdMs) / (resetDays * 86400000))) : 0;
  return `${createdAt}|${resetDays}|${period}|${Number(client.expiryTime) || 0}`;
}

let xuiBillingMutation = Promise.resolve();

function withXuiBillingLock(operation) {
  const next = xuiBillingMutation.catch(() => undefined).then(operation);
  xuiBillingMutation = next;
  return next;
}

async function getXuiBillingState() {
  const value = await getXuiState("billing", "xuiBilling");
  return { multipliers: {}, nodeTokens: {}, nodeResults: {}, nodeNames: {}, users: {}, ...(value || {}) };
}

async function saveXuiBillingState(state) {
  await setXuiState("billing", "xuiBilling", { ...state, updatedAt: new Date().toISOString() });
}

async function xuiTrafficFromNodes(status, nodes, centralInbounds, state) {
  const localGuid = String(status?.panelGuid || "node:local");
  const inbounds = (Array.isArray(centralInbounds) ? centralInbounds : [])
    .filter(item => String(item?.originNodeGuid || `node:${item?.nodeId || "local"}`) === localGuid)
    .map(item => ({ ...item, originNodeGuid: localGuid }));
  const nodeResults = { [localGuid]: { configured: true, error: "" } };
  await Promise.all((Array.isArray(nodes) ? nodes : []).map(async node => {
    const guid = String(node?.guid || `node:${node?.id}`);
    const sealedToken = state.nodeTokens[guid];
    if (!sealedToken) {
      nodeResults[guid] = { configured: false, error: "" };
      return;
    }
    try {
      const token = openXuiNodeToken(sealedToken);
      const rows = await xuiRequestAt(xuiNodeBaseUrl(node), token, "/panel/api/inbounds/list");
      inbounds.push(...(Array.isArray(rows) ? rows : []).map(item => ({ ...item, originNodeGuid: guid })));
      nodeResults[guid] = { configured: true, error: "" };
    } catch (error) {
      nodeResults[guid] = { configured: true, error: error.message };
    }
  }));
  return { traffic: xuiTrafficByUser(inbounds), nodeResults, inbounds };
}

function xuiResetReference(value) {
  const parts = chinaDateParts(value);
  return parts ? `${parts.year}-${String(parts.month + 1).padStart(2, "0")}` : "";
}

async function resetXuiClientTraffic(user, reset = {}) {
  const paymentOrderId = typeof reset === "object" ? String(reset.paymentOrderId || "") : "";
  if (XUI_SERVICE_URL) {
    await requestXuiService({
      serviceUrl: XUI_SERVICE_URL,
      serviceToken: XUI_SERVICE_TOKEN,
      path: `/internal/clients/${encodeURIComponent(user.id)}/traffic-reset`,
      method: "POST",
      body: paymentOrderId ? { reason: "paid", paymentOrderId } : { reason: "calendar_month", month: xuiResetReference(reset) },
      timeoutMs: XUI_TIMEOUT_MS
    });
  } else {
    await xuiRequest(`/panel/api/clients/resetTraffic/${encodeURIComponent(xuiClientEmail(user))}`, { method: "POST" });
  }
  if (!isUserExpired(user) && !isUserAccountDisabled(user)) {
    await xuiRequest("/panel/api/clients/bulkEnable", { method: "POST", body: { emails: [xuiClientEmail(user)] } });
  }
}

async function resetXuiTrafficAfterPlanPurchase(user, order) {
  await resetXuiClientTraffic(user, { paymentOrderId: order.id });
  const now = new Date().toISOString();
  const totalBytes = xuiTrafficLimitBytes(user);
  user.xuiTrafficCycleKey = `purchase:${order.id}`;
  user.xuiLastTrafficResetAt = now;
  user.xuiNextTrafficResetAt = user.duration === "lifetime" ? "" : xuiMonthlyResetAt(user.xuiTrafficResetAnchorDay || chinaDateParts(user.purchasedAt)?.day || 1, user.purchasedAt || now);
  user.xuiWeightedTraffic = { rawUsedBytes: 0, usedBytes: 0, totalBytes, remainingBytes: totalBytes ? totalBytes : null, usagePercent: totalBytes ? 0 : null, depleted: false, nodes: [], lastSyncedAt: now };
  user.xuiLastTraffic = { ...(user.xuiLastTraffic || {}), available: true, status: "active", uploadBytes: 0, downloadBytes: 0, rawUsedBytes: 0, usedBytes: 0, totalBytes, remainingBytes: totalBytes ? totalBytes : null, usagePercent: totalBytes ? 0 : null, nextResetAt: user.xuiNextTrafficResetAt || "", expiresAt: user.expiresAt, nodes: [], lastSyncedAt: now };
  await clearXuiBillingLedger(xuiClientEmail(user));
}

async function resetDueXuiTraffic() {
  const now = Date.now();
  let changed = false;
  for (const user of users.filter(item => isSelfHostedUser(item) && item.xuiClientEmail)) {
    if (user.duration === "lifetime") {
      const lifetimeLimit = xuiTrafficLimitBytes(user);
      if (user.xuiTrafficLimitBytes !== lifetimeLimit || user.xuiNextTrafficResetAt) {
        user.xuiTrafficLimitBytes = lifetimeLimit;
        user.xuiNextTrafficResetAt = "";
        changed = true;
      }
      continue;
    }
    if (!user.xuiTrafficResetAnchorDay) {
      user.xuiTrafficResetAnchorDay = chinaDateParts(user.purchasedAt || user.createdAt || now)?.day || 1;
      user.xuiNextTrafficResetAt = xuiMonthlyResetAt(user.xuiTrafficResetAnchorDay, now);
      user.xuiTrafficCycleKey ||= `legacy:${user.purchasedAt || user.createdAt || user.id}`;
      user.xuiTrafficLimitBytes = xuiTrafficLimitBytes(user);
      changed = true;
    }
    const dueAt = Date.parse(user.xuiNextTrafficResetAt || "");
    if (!Number.isFinite(dueAt) || dueAt > now) continue;
    try {
      await resetXuiClientTraffic(user, dueAt);
      const trafficPackExpired = expireUserTrafficPacks(user);
      if (trafficPackExpired) await provisionXuiClient(user);
      user.xuiTrafficCycleKey = `reset:${user.xuiNextTrafficResetAt}`;
      user.xuiLastTrafficResetAt = new Date().toISOString();
      user.xuiNextTrafficResetAt = xuiMonthlyResetAt(user.xuiTrafficResetAnchorDay, now);
      user.xuiLastError = "";
    } catch (error) {
      user.xuiLastError = `月度流量重置失败：${error.message}`;
    }
    changed = true;
  }
  if (changed) await saveUsers();
}

function markMissingXuiClients(appUsersByEmail, remoteEmails, checkedAt = new Date().toISOString()) {
  const changed = [];
  for (const [email, user] of appUsersByEmail) {
    if (remoteEmails.has(email)) continue;
    if (user.xuiClientPresent !== false) user.xuiClientMissingAt = checkedAt;
    user.xuiClientPresent = false;
    user.xuiLastError = "3x-ui Client 已被删除或不存在。";
    changed.push(user);
  }
  return changed;
}

async function syncXuiWeightedTraffic(snapshot = {}) {
  if (!XUI_BASE_URL || !XUI_API_TOKEN) return getXuiBillingState();
  return withXuiBillingLock(async () => {
    await loadLatestData();
    if (!XUI_READ_ONLY) await resetDueXuiTraffic();
    const [status, nodes, inbounds, clients, clientIpsByGuid, onlinesByGuid, lastOnline] = await Promise.all([
      snapshot.status || xuiRequest("/panel/api/server/status"),
      snapshot.nodes || xuiRequest("/panel/api/nodes/list"),
      snapshot.inbounds || xuiRequest("/panel/api/inbounds/list"),
      snapshot.clients || xuiRequest("/panel/api/clients/list"),
      xuiRequest("/panel/api/clients/clientIpsByGuid", { method: "POST" }).catch(() => null),
      xuiRequest("/panel/api/clients/onlinesByGuid", { method: "POST" }).catch(() => null),
      xuiRequest("/panel/api/clients/lastOnline", { method: "POST" }).catch(() => null)
    ]);
    const state = await getXuiBillingState();
    const { traffic, nodeResults } = await xuiTrafficFromNodes(status, nodes, inbounds, state);
    state.dailyTraffic = xuiDailyNodeTraffic(traffic, state.dailyTraffic);
    const localGuid = String(status?.panelGuid || "node:local");
    const nodeNames = { [localGuid]: XUI_PANEL_NAME, ...Object.fromEntries((Array.isArray(nodes) ? nodes : []).map(item => [String(item?.guid || `node:${item?.id}`), String(item?.remark || item?.name || item?.guid || item?.id)])) };
    const nodeMultipliers = state.multipliers || {};
    const disableEmails = [];
    const enableEmails = [];
    const changedUsers = [];
    const appUsersByEmail = new Map(users.filter(item => isSelfHostedUser(item) && item.xuiClientEmail).map(item => [String(item.xuiClientEmail).toLowerCase(), item]));
    const remoteEmails = new Set();

    for (const remote of Array.isArray(clients) ? clients : []) {
      const email = String(remote?.email || "").trim().toLowerCase();
      if (!email) continue;
      remoteEmails.add(email);
      const user = appUsersByEmail.get(email);
      const previous = state.users[email];
      const planBytes = user ? xuiTrafficLimitBytes(user, remote) : Math.max(0, Number(previous?.totalBytes ?? remote.totalGB) || 0);
      const cycleKey = `${user ? user.xuiTrafficCycleKey || `legacy:${user.purchasedAt || user.createdAt || user.id}` : xuiClientCycleKey(remote)}|direct-nodes-v2`;
      const baselinePending = user?.xuiTrafficBaselinePending || (user?.xuiManagementMode === "link" && user.xuiTrafficBaselineVersion !== 2);
      const ledger = baselinePending
        ? createXuiBillingBaseline(traffic[email] || {}, cycleKey, nodeMultipliers)
        : calculateXuiBillingLedger(state.users[email], traffic[email] || {}, nodeMultipliers, cycleKey);
      const totalBytes = planBytes;
      const expired = user ? isUserExpired(user) : Number(remote.expiryTime) > 0 && Number(remote.expiryTime) < Date.now();
      const depleted = totalBytes > 0 && ledger.weightedBytes >= totalBytes;
      if (depleted && remote.enable !== false && !expired) disableEmails.push(email);
      if (baselinePending && remote.enable === false && !expired && !isUserAccountDisabled(user)) enableEmails.push(email);
      ledger.disabled = ledger.disabled || depleted;
      ledger.totalBytes = totalBytes;
      state.users[email] = ledger;
      const weightedTraffic = {
        rawUsedBytes: ledger.rawBytes,
        usedBytes: ledger.weightedBytes,
        totalBytes,
        remainingBytes: totalBytes ? Math.max(totalBytes - ledger.weightedBytes, 0) : null,
        usagePercent: totalBytes ? Math.min(100, Math.round(ledger.weightedBytes / totalBytes * 1000) / 10) : null,
        depleted,
        nodes: [
          ...(ledger.carriedRawBytes || ledger.carriedWeightedBytes ? [{ key: "legacy", name: "历史节点统计结转", multiplier: 1, rawBytes: ledger.carriedRawBytes, weightedBytes: ledger.carriedWeightedBytes }] : []),
          ...Object.entries(ledger.nodes).map(([key, item]) => ({ key, name: nodeNames[key] || key, multiplier: xuiMultiplier(nodeMultipliers[key]), rawBytes: item.rawBytes, weightedBytes: item.weightedBytes }))
        ],
        lastSyncedAt: ledger.updatedAt
      };
      if (user) {
        user.xuiClientPresent = true;
        delete user.xuiClientMissingAt;
        user.xuiTrafficBaselinePending = false;
        if (baselinePending) user.xuiTrafficBaselineVersion = 2;
        user.xuiWeightedTraffic = weightedTraffic;
        user.xuiLastTraffic = xuiTrafficPayload(user, remote, clientIpsByGuid ? normalizeXuiConnectedIps(clientIpsByGuid, email).length : null);
        user.xuiLastSyncedAt = weightedTraffic.lastSyncedAt;
        user.xuiLastError = "";
        changedUsers.push(user);
      }

      const quotaChanged = Number(remote.totalGB) !== totalBytes;
      if (!XUI_READ_ONLY && user && (quotaChanged || previous?.disabled) && !depleted && !expired && !isUserAccountDisabled(user)) {
        try {
          await xuiRequest(`/panel/api/clients/update/${encodeURIComponent(email)}`, { method: "POST", body: xuiClientWritePayload(remote, { ...remote, totalGB: totalBytes, reset: 0, flow: XUI_VISION_FLOW, enable: true }) });
          ledger.disabled = false;
        } catch (error) {
          console.warn(`[xui-billing] Failed to re-enable ${email}: ${error.message}`);
        }
      }
    }

    const activeUsersByEmail = new Map([...appUsersByEmail].filter(([, user]) => !isUserExpired(user) && !isUserAccountDisabled(user)));
    for (const user of markMissingXuiClients(activeUsersByEmail, remoteEmails)) if (!changedUsers.includes(user)) changedUsers.push(user);

    if (!XUI_READ_ONLY && disableEmails.length) {
      await xuiRequest("/panel/api/clients/bulkDisable", { method: "POST", body: { emails: disableEmails } });
      for (const email of disableEmails) state.users[email].disabled = true;
    }
    if (!XUI_READ_ONLY && enableEmails.length) await xuiRequest("/panel/api/clients/bulkEnable", { method: "POST", body: { emails: enableEmails } });
    state.nodeResults = nodeResults;
    state.nodeNames = nodeNames;
    state.presence = { ...normalizeXuiPresence(onlinesByGuid, lastOnline, nodes, status), checkedAt: new Date().toISOString() };
    await saveXuiBillingState(state);
    await Promise.all(changedUsers.map(saveUser));
    return { ...state, nodeResults, nodeNames };
  });
}

async function getAllXuiInboundIds() {
  let lastError;
  for (const apiPath of ["/panel/api/inbounds/list", "/panel/api/inbounds/list/slim", "/panel/api/inbounds/options"]) {
    try {
      const ids = normalizeXuiInboundIds(await xuiRequest(apiPath));
      if (ids.length) return ids;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(lastError ? `无法读取3x-ui入站列表：${lastError.message}` : "3x-ui中没有可关联的入站。");
}

async function syncXuiClientAccess(emails, group, inboundIds, allInboundIds = null) {
  if (!emails.length) return;
  const allIds = allInboundIds || await getAllXuiInboundIds();
  const detachIds = allIds.filter(id => !inboundIds.includes(id));
  if (inboundIds.length) await xuiRequest("/panel/api/clients/bulkAttach", { method: "POST", body: { emails, inboundIds } });
  if (detachIds.length) await xuiRequest("/panel/api/clients/bulkDetach", { method: "POST", body: { emails, inboundIds: detachIds } });
  await xuiRequest("/panel/api/clients/groups/bulkAdd", { method: "POST", body: { emails, group } });
}

async function getXuiClientByEmail(email) {
  let value;
  try {
    value = await xuiRequest(`/panel/api/clients/get/${encodeURIComponent(email)}`);
  } catch (error) {
    if (error.statusCode !== 404 && !/not found|不存在|找不到/i.test(error.message)) throw error;
  }
  if (value) return normalizeXuiClientResult(value, email);
  const listed = await xuiRequest("/panel/api/clients/list");
  const match = (Array.isArray(listed) ? listed : []).find(item => String(item?.client?.email || item?.email || "").toLowerCase() === email);
  if (match) return normalizeXuiClientResult(match, email);
  const error = new Error("3x-ui Client 不存在。");
  error.statusCode = 404;
  throw error;
}

async function getXuiClient(user) {
  return getXuiClientByEmail(xuiClientEmail(user));
}

async function getXuiClientAfterMutation(user) {
  let lastError;
  for (const delayMs of [0, 200, 500]) {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    try {
      return await getXuiClient(user);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function xuiClientWritePayload(existing, desired) {
  const writableFields = ["email", "enable", "expiryTime", "totalGB", "limitIp", "reset", "subId", "uuid", "id", "password", "auth", "flow", "tgId", "comment", "security", "reverse", "groupName"];
  const payload = Object.fromEntries(writableFields
    .filter(key => desired[key] !== undefined || existing?.[key] !== undefined)
    .map(key => [key, desired[key] !== undefined ? desired[key] : existing[key]]));
  for (const key of ["uuid", "id"]) if (/^\d+$/.test(String(payload[key] ?? ""))) delete payload[key];
  if (payload.id != null) payload.id = String(payload.id);
  return payload;
}

async function getXuiInboundGroups() {
  return normalizeXuiInboundGroups((await getXuiState("inbound-groups", "xuiInboundGroups")) || {});
}

async function xuiInboundIdsForGroup(group) {
  return (await getXuiInboundGroups())[normalizeUserGroup(group, "")] || [];
}

async function xuiInboundManagementData() {
  if (!XUI_BASE_URL || !XUI_API_TOKEN) return { configured: false, groups: normalizeXuiInboundGroups(), metadata: {}, inbounds: [] };
  const [status, nodes, inbounds, settings, activeInbounds] = await Promise.all([
    xuiRequest("/panel/api/server/status"),
    xuiRequest("/panel/api/nodes/list"),
    xuiRequest("/panel/api/inbounds/list"),
    getXuiState("inbound-groups", "xuiInboundGroups"),
    xuiRequest("/panel/api/clients/activeInbounds", { method: "POST" }).catch(() => null)
  ]);
  const groups = normalizeXuiInboundGroups(settings || {});
  const metadata = normalizeXuiInboundMetadata(settings || {});
  const localGuid = String(status?.panelGuid || "node:local");
  const nodeNames = Object.fromEntries((Array.isArray(nodes) ? nodes : []).map(node => [String(node?.guid || `node:${node?.id}`), String(node?.remark || node?.name || node?.address || node?.guid || node?.id)]));
  nodeNames[localGuid] = XUI_PANEL_NAME;
  const activeInboundKeys = activeInbounds === null ? null : xuiActiveInboundKeys(activeInbounds);
  return {
    configured: true,
    groups,
    metadata,
    inbounds: (Array.isArray(inbounds) ? inbounds : []).map(inbound => {
      const nodeGuid = String(inbound?.originNodeGuid || `node:${inbound?.nodeId || "local"}`);
      const key = `${nodeGuid}:${inbound.id}`;
      const activityReported = activeInbounds !== null && Object.prototype.hasOwnProperty.call(activeInbounds, nodeGuid);
      return {
        id: Number(inbound.id),
        key,
        name: String(inbound.remark || inbound.name || inbound.tag || `Inbound ${inbound.id}`),
        tag: String(inbound.tag || ""),
        protocol: String(inbound.protocol || ""),
        port: Number(inbound.port) || null,
        enabled: inbound.enable !== false,
        recentlyActive: activityReported ? activeInboundKeys.has(`${nodeGuid}:${String(inbound.tag || "")}`) : null,
        nodeGuid,
        nodeName: nodeNames[nodeGuid] || nodeGuid,
        clientCount: Array.isArray(inbound.clientStats) ? inbound.clientStats.length : 0,
        networkLevel: metadata[key]?.networkLevel || "",
        region: metadata[key]?.region || ""
      };
    }).filter(inbound => Number.isSafeInteger(inbound.id) && inbound.id > 0)
  };
}

async function syncXuiInboundGroup(group, inboundIds, allInboundIds) {
  const targets = users.filter(user => isSelfHostedUser(user) && activeUserGroup(user) === group && user.xuiClientEmail);
  const emails = targets.map(user => String(user.xuiClientEmail).toLowerCase());
  if (!emails.length) return { group, users: 0 };
  await syncXuiClientAccess(emails, group, inboundIds, allInboundIds);
  const syncedAt = new Date().toISOString();
  for (const user of targets) {
    user.xuiInboundIds = inboundIds;
    user.xuiLastSyncedAt = syncedAt;
    user.xuiLastError = "";
    await saveXuiClientProjection(user, true);
  }
  await saveUsers();
  return { group, users: emails.length };
}

function xuiClientNeedsUpdate(existing, desired) {
  return ["email", "totalGB", "expiryTime", "limitIp", "reset", "flow", "groupName", "comment", "enable"]
    .some(key => String(existing?.[key] ?? "") !== String(desired[key] ?? ""));
}

function isUserAccountDisabled(user) {
  return accounts.some(account => account.linkedUserId === user?.id && account.status === "disabled");
}

async function saveXuiClientProjection(user, enabled) {
  if (!XUI_SERVICE_URL) return;
  await requestXuiService({
    serviceUrl: XUI_SERVICE_URL,
    serviceToken: XUI_SERVICE_TOKEN,
    path: `/internal/clients/${encodeURIComponent(user.id)}`,
    method: "PUT",
    body: {
      userId: user.id,
      email: user.xuiClientEmail || "",
      subId: user.xuiSubId || "",
      inboundIds: user.xuiInboundIds || [],
      enabled,
      lastSyncedAt: user.xuiLastSyncedAt || "",
      lastError: user.xuiLastError || ""
    },
    timeoutMs: XUI_TIMEOUT_MS
  });
}

async function provisionXuiClient(user, { allowLegacyEmail = true } = {}) {
  if (!xuiConfigured()) throw new Error("自研线路尚未完成3x-ui配置。");
  const email = xuiClientEmail(user);
  const inboundIds = await xuiInboundIdsForGroup(activeUserGroup(user));
  let existing = null;
  let existingEmail = email;
  try { existing = await getXuiClientByEmail(email); } catch (error) {
    if (error.statusCode !== 404 && !/not found|不存在|找不到/i.test(error.message)) throw error;
  }
  if (!existing && allowLegacyEmail) {
    const legacyEmail = legacyXuiClientEmail(user);
    if (legacyEmail !== email) {
      try {
        existing = await getXuiClientByEmail(legacyEmail);
        existingEmail = legacyEmail;
      } catch (error) {
        if (error.statusCode !== 404 && !/not found|不存在|找不到/i.test(error.message)) throw error;
      }
    }
  }
  const desired = {
    ...(existing || {}),
    email,
    totalGB: xuiTrafficLimitBytes(user, existing || {}),
    expiryTime: new Date(user.expiresAt).getTime(),
    limitIp: Number.isFinite(Number(user.xuiIpLimit)) ? Math.max(0, Number(user.xuiIpLimit)) : planDeviceLimit(user),
    reset: 0,
    flow: XUI_VISION_FLOW,
    groupName: activeUserGroup(user),
    comment: xuiClientComment(user),
    enable: !isUserExpired(user) && !isUserAccountDisabled(user)
  };
  delete desired.traffic;
  delete desired.inboundIds;
  let mutationResult = null;
  if (existing?.email) {
    if (xuiClientNeedsUpdate(existing, desired)) {
      mutationResult = await xuiRequest(`/panel/api/clients/update/${encodeURIComponent(existingEmail)}`, { method: "POST", body: xuiClientWritePayload(existing, desired) });
    }
  } else {
    mutationResult = await xuiRequest("/panel/api/clients/add", { method: "POST", body: { client: xuiClientWritePayload(null, desired), inboundIds } });
  }
  await syncXuiClientAccess([email], activeUserGroup(user), inboundIds, existing?.inboundIds || []);
  let remote;
  try {
    remote = await getXuiClientAfterMutation({ ...user, xuiClientEmail: email });
  } catch (error) {
    const mutationClient = normalizeXuiClientResult(mutationResult, email);
    if (!mutationClient.subId) throw error;
    remote = { ...mutationClient, inboundIds: mutationClient.inboundIds.length ? mutationClient.inboundIds : inboundIds };
  }
  user.lineType = "self_hosted";
  user.subscriptionId = "";
  user.xuiClientEmail = email;
  user.xuiSubId = String(remote.subId || user.xuiSubId || "");
  user.xuiInboundIds = inboundIds;
  user.xuiLastSyncedAt = new Date().toISOString();
  user.xuiLastError = "";
  user.xuiMetadataSyncedAt = new Date().toISOString();
  await saveXuiClientProjection(user, desired.enable);
  return remote;
}

async function clearXuiBillingLedger(email) {
  const state = await getXuiBillingState();
  delete state.users[String(email || "").trim().toLowerCase()];
  await saveXuiBillingState(state);
}

const xuiUserMigrationTasks = new Map();

function withXuiUserMigrationLock(userId, operation) {
  const key = String(userId || "");
  if (xuiUserMigrationTasks.has(key)) return xuiUserMigrationTasks.get(key);
  // ponytail: process-local lock is sufficient for the current single-VPS deployment; use a DB advisory lock before adding app replicas.
  const task = Promise.resolve().then(operation).finally(() => {
    if (xuiUserMigrationTasks.get(key) === task) xuiUserMigrationTasks.delete(key);
  });
  xuiUserMigrationTasks.set(key, task);
  return task;
}

async function migrateLegacyUserOnSubscriptionRefresh(user, req) {
  return withXuiUserMigrationLock(user.id, async () => {
    if (isSelfHostedUser(user)) return { status: "completed", inboundIds: user.xuiInboundIds || [] };
    const email = nexoraUserEmail(user);
    const fromSubscription = subscriptions.find(item => item.id === user.subscriptionId) || null;
    if (!email) {
      if (user.xuiMigrationStatus !== "activation_required") {
        user.xuiMigrationStatus = "activation_required";
        user.xuiMigrationError = "缺少有效邮箱";
        user.xuiMigrationUpdatedAt = new Date().toISOString();
        appendUserLogToUser(user, createUserLog({ event: "subscription-request", status: "blocked", reason: "xui-migration-activation-required", fromSubscription, req, stage: "xui-migration", message: "旧套餐迁移暂停：缺少有效邮箱，请联系客服激活账户。" }));
        await saveUsers();
      }
      return { status: "activation_required", inboundIds: [] };
    }

    const previous = structuredClone(user);
    try {
      const conflict = users.find(item => item.id !== user.id && String(item.xuiClientEmail || "").trim().toLowerCase() === email);
      if (conflict) throw new Error("该邮箱对应的3x-ui Client已关联其他用户。");
      let existing = null;
      try { existing = await getXuiClientByEmail(email); } catch (error) {
        if (error.statusCode !== 404 && !/not found|不存在|找不到/i.test(error.message)) throw error;
      }
      user.email ||= email;
      user.xuiClientEmail = email;
      if (existing) user.xuiIpLimit = Math.max(0, Number(existing.limitIp) || 0);
      initializeLegacyXuiMigration(user, existing);
      const remote = await provisionXuiClient(user, { allowLegacyEmail: false });
      await clearXuiBillingLedger(email);
      user.xuiMigrationStatus = "completed";
      user.xuiMigrationSource = existing ? "linked_existing" : "created";
      user.xuiMigrationError = "";
      user.xuiMigratedAt = new Date().toISOString();
      user.xuiMigrationUpdatedAt = user.xuiMigratedAt;
      appendUserLogToUser(user, createUserLog({
        event: "subscription-request",
        status: "recorded",
        reason: "xui-migration-completed",
        fromSubscription,
        req,
        stage: "xui-migration",
        message: existing ? "旧套餐已关联现有3x-ui Client并完成迁移。" : "旧套餐已创建3x-ui Client并完成迁移。",
        details: { source: user.xuiMigrationSource, email, group: activeUserGroup(user), trafficLimitBytes: user.xuiTrafficLimitBytes, resetAnchorDay: user.xuiTrafficResetAnchorDay, nextResetAt: user.xuiNextTrafficResetAt, flow: XUI_VISION_FLOW, inboundIds: user.xuiInboundIds || [], inheritedUsedTrafficBytes: existing ? remote.usedTraffic : 0 }
      }));
      await saveUsers();
      return { status: "completed", inboundIds: user.xuiInboundIds || [] };
    } catch (error) {
      Object.keys(user).forEach(key => delete user[key]);
      Object.assign(user, previous, { xuiMigrationStatus: "failed", xuiMigrationError: error.message, xuiMigrationUpdatedAt: new Date().toISOString() });
      appendUserLogToUser(user, createUserLog({ event: "subscription-request", status: "failed", reason: "xui-migration-failed", fromSubscription, req, stage: "xui-migration", message: `旧套餐迁移失败：${error.message}`, details: { email, group: activeUserGroup(user), flow: XUI_VISION_FLOW } }));
      await saveUsers();
      throw error;
    }
  });
}

async function connectXuiClient(user, { mode, email = "", importedIpLimit } = {}) {
  if (!new Set(["import", "link"]).has(mode)) throw new Error("请选择导入或关联方式。");
  if (!xuiConfigured()) throw new Error("自研线路尚未完成3x-ui配置。");
  await xuiInboundIdsForGroup(activeUserGroup(user));
  const userEmail = nexoraUserEmail(user);
  if (!userEmail) throw new Error("自研线路用户缺少有效的注册邮箱。");
  user.email = userEmail;
  let remote = null;
  if (mode === "import") {
    const importEmail = userEmail;
    try { remote = await getXuiClientByEmail(importEmail); } catch (error) {
      if (error.statusCode !== 404 && !/not found|不存在|找不到/i.test(error.message)) throw error;
    }
    if (remote) throw Object.assign(new Error("同邮箱的3x-ui Client已存在，请使用关联已有 Client。"), { statusCode: 409 });
    user.xuiClientEmail = importEmail;
    user.xuiIpLimit = Math.max(0, Number(importedIpLimit) || 0);
    initializeXuiTrafficSchedule(user, {}, mode);
  } else {
    let linkedEmail = String(email || "").trim().toLowerCase();
    if (!linkedEmail) throw new Error("请选择要关联的3x-ui Client。");
    const conflict = users.find(item => item.id !== user.id && String(item.xuiClientEmail || "").trim().toLowerCase() === linkedEmail);
    if (conflict) throw Object.assign(new Error("该3x-ui Client已关联其他用户。"), { statusCode: 409 });
    remote = await getXuiClientByEmail(linkedEmail);
    if (linkedEmail !== userEmail) {
      let target = null;
      try { target = await getXuiClientByEmail(userEmail); } catch (error) {
        if (error.statusCode !== 404 && !/not found|不存在|找不到/i.test(error.message)) throw error;
      }
      if (target) throw Object.assign(new Error("Nexora用户邮箱已被另一个3x-ui Client使用，请直接选择该 Client。"), { statusCode: 409 });
      await xuiRequest(`/panel/api/clients/update/${encodeURIComponent(linkedEmail)}`, { method: "POST", body: xuiClientWritePayload(remote, { ...remote, email: userEmail }) });
      linkedEmail = userEmail;
      remote = { ...remote, email: userEmail };
    }
    const targetConflict = users.find(item => item.id !== user.id && String(item.xuiClientEmail || "").trim().toLowerCase() === linkedEmail);
    if (targetConflict) throw Object.assign(new Error("Nexora用户邮箱已关联其他用户。"), { statusCode: 409 });
    user.xuiClientEmail = linkedEmail;
    user.xuiIpLimit = Math.max(0, Number(remote.limitIp) || 0);
    initializeXuiTrafficSchedule(user, remote, mode);
  }
  user.lineType = "self_hosted";
  user.subscriptionId = "";
  remote = await provisionXuiClient(user);
  await clearXuiBillingLedger(user.xuiClientEmail);
  user.xuiTrafficBaselinePending = true;
  user.xuiTrafficBaselineVersion = 0;
  return remote;
}

async function disableXuiClient(user) {
  if (!user?.xuiClientEmail || !XUI_BASE_URL || !XUI_API_TOKEN) return;
  await xuiRequest("/panel/api/clients/bulkDisable", { method: "POST", body: { emails: [user.xuiClientEmail] } });
  user.xuiLastSyncedAt = new Date().toISOString();
  await saveXuiClientProjection(user, false);
}

function xuiTrafficPayload(user, remote, connectedIpCount = null) {
  const uploadBytes = remote.traffic.up;
  const downloadBytes = remote.traffic.down;
  const billing = user.xuiWeightedTraffic;
  const usedBytes = billing ? billing.usedBytes : 0;
  const totalBytes = billing?.totalBytes ?? planTrafficBytes(user);
  return {
    available: true,
    status: billing?.depleted ? "depleted" : remote.enable === false || remote.traffic.enable === false ? "disabled" : isUserExpired(user) ? "expired" : "active",
    uploadBytes,
    downloadBytes,
    rawUsedBytes: billing?.rawUsedBytes ?? usedBytes,
    usedBytes,
    totalBytes,
    remainingBytes: totalBytes ? Math.max(totalBytes - usedBytes, 0) : null,
    usagePercent: totalBytes ? Math.min(100, Math.round(usedBytes / totalBytes * 1000) / 10) : null,
    connectedIpCount,
    ipLimit: Math.max(0, Number(remote.limitIp) || 0),
    nextResetAt: user.xuiNextTrafficResetAt || "",
    expiresAt: user.expiresAt,
    inbounds: billing?.inbounds || [],
    nodes: billing?.nodes || [],
    lastSyncedAt: billing?.lastSyncedAt || new Date().toISOString()
  };
}

function poolSelectionGroup(user = {}) {
  return user.isSuperAccount ? "" : activeUserGroup(user);
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

function batchGiftTargets({ days, group = "", allowDisabled = false } = {}) {
  const giftDays = Number(days);
  if (!Number.isSafeInteger(giftDays) || giftDays <= 0) throw new Error("赠送天数必须是正整数。");
  const selectedGroup = ["basic", "pro", "ultra"].includes(String(group)) ? String(group) : "";
  return users
    .filter(user => {
      const expiresAt = Date.parse(user.expiresAt || "");
      return !isSelfHostedUser(user) && Number.isFinite(expiresAt) && expiresAt > Date.now() && (!selectedGroup || activeUserGroup(user) === selectedGroup);
    })
    .map(user => {
      const expiresAt = calculateGiftExpiry(user, giftDays);
      const currentPool = subscriptions.find(item => item.id === user.subscriptionId);
      const recommendation = recommendSubscriptionForExpiry(expiresAt, { ignoredUserId: user.id, group: poolSelectionGroup(user), allowDisabled });
      return { user, giftDays, expiresAt, toSubscription: currentPool || recommendation.subscription };
    });
}

function userHasClaimedAccount(userId) {
  return accounts.some(account => account.linkedUserId === userId && ["active", "disabled"].includes(account.status));
}

function startOfUtcDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function subscriptionCustomerCount(subscriptionId, ignoredUserId = "") {
  return users.filter(user => user.subscriptionId === subscriptionId && user.id !== ignoredUserId).length;
}

function subscriptionAtCapacity(subscription, ignoredUserId = "") {
  return subscriptionCustomerCount(subscription.id, ignoredUserId) >= Number(subscription.maxUsers ?? 15);
}

function subscriptionAllowsGroup(subscription, group = "") {
  const allowedGroups = Array.isArray(subscription.allowedGroups) ? subscription.allowedGroups : USER_GROUPS;
  return !group || allowedGroups.includes(normalizeUserGroup(group));
}

function subscriptionsByLatestExpiry() {
  return [...subscriptions].sort((a, b) => {
    const timeA = a.metrics?.expireAt ? new Date(a.metrics.expireAt).getTime() : 0;
    const timeB = b.metrics?.expireAt ? new Date(b.metrics.expireAt).getTime() : 0;
    return timeB - timeA;
  });
}

function recommendSubscriptionForExpiry(expiresAt, { ignoredUserId = "", group = "", allowDisabled = false } = {}) {
  const userExpiryTime = startOfUtcDate(expiresAt);
  const dayMs = 86400000;
  const ratings = vendorRatingIndex();
  let noExpiry = 0;
  let outOfWindow = 0;
  let ungraded = 0;
  const eligibleSubscriptions = subscriptions.filter(item => {
    const provider = normalizeServiceProvider({}, item);
    if (!ratings.get(provider)) { ungraded++; return false; }
    const unavailableReason = poolMetricUnavailableReason(item.enabled === false && allowDisabled ? { ...item, enabled: true } : item);
    return !unavailableReason && !item.excludeFromAutoSwitch && subscriptionAllowsGroup(item, group) && !subscriptionAtCapacity(item, ignoredUserId) && Date.parse(item.metrics?.expireAt || "") > Date.now();
  });
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
      return { item, diffDays, absDiffDays: Math.abs(diffDays), rating: ratings.get(normalizeServiceProvider({}, item)) };
    })
    .filter(Boolean)
    .map(c => ({ ...c, customerCount: subscriptionCustomerCount(c.item.id, ignoredUserId) }));

  const sorted = candidates.sort((a, b) => {
    const aWithin = a.absDiffDays <= RATING_OVERRIDE_WINDOW_DAYS;
    const bWithin = b.absDiffDays <= RATING_OVERRIDE_WINDOW_DAYS;
    if (aWithin !== bWithin) return aWithin ? -1 : 1;
    return vendorRatingRank(a.rating) - vendorRatingRank(b.rating)
      || a.absDiffDays - b.absDiffDays
      || a.customerCount - b.customerCount;
  });

  if (sorted.length) {
    const candidate = sorted[0];
    return {
      subscription: candidate.item,
      reason: candidate.absDiffDays <= RATING_OVERRIDE_WINDOW_DAYS
        ? `供应商评级 ${candidate.rating} 优先（到期差 ${Math.round(candidate.absDiffDays)} 天）`
        : `所有候选池到期差均超过 ${RATING_OVERRIDE_WINDOW_DAYS} 天，按供应商评级 ${candidate.rating} 兜底`,
      details: {
        provider: normalizeServiceProvider({}, candidate.item),
        rating: candidate.rating,
        expiryDiffDays: candidate.absDiffDays,
        withinRatingOverrideWindow: candidate.absDiffDays <= RATING_OVERRIDE_WINDOW_DAYS,
        ungradedExcluded: ungraded,
        candidateCount: candidates.length
      }
    };
  }

  if (outOfWindow > 0) {
    const latest = subscriptionsByLatestExpiry().find(item => eligibleSubscriptions.includes(item));
    if (latest) return { subscription: latest, reason: "用户到期日远超所有池，已推荐最晚到期的池。" };
  }

  const reason = eligibleSubscriptions.length === 0 && ungraded > 0
    ? "没有可用的已评级池 URL，未评级供应商不会自动推荐。"
    : eligibleSubscriptions.length === 0
    ? "没有可用的池 URL。"
    : noExpiry > 0
    ? "池 URL 缺少到期时间，请手动选择。"
    : "没有匹配的池 URL，请手动选择。";
  return { subscription: null, reason };
}

function clearSubscriptionSourceState(item) {
  const manualExpireAt = isManualSubscription(item) ? item.metrics?.expireAt : "";
  item.metrics = manualExpireAt ? { expireAt: manualExpireAt } : null;
  item.lastCheckedAt = null;
  item.lastError = null;
  item.httpStatus = null;
  item.lastRefreshResults = null;
  item.cachedConfig = null;
}

function classifyCurrentPoolFit({
  poolExists = true,
  enabled = true,
  health = "ok",
  healthReason = "",
  groupAllowed = true,
  group = "",
  userExpiryValid = true,
  poolExpiryValid = true,
  poolExpired = false,
  expiryDiffDays = 0,
  customerCount = 0,
  maxUsers = 15,
  excludedFromAutoSwitch = false,
  rated = true
} = {}) {
  const priority = { high: 0, usable: 1, adjust: 2, unknown: 3, incompatible: 4 };
  let status = "high";
  const reasons = [];
  const add = (nextStatus, reason) => {
    if (priority[nextStatus] > priority[status]) status = nextStatus;
    reasons.push(reason);
  };

  if (!poolExists) return { status: "incompatible", reasons: ["当前用户未绑定有效的池 URL。"] };
  if (!enabled) add("incompatible", "当前池已停用，不能参与自动推荐。");
  if (poolExpired) add("incompatible", "当前池已经到期，无法继续正常使用。");
  if (health === "invalid") add("incompatible", healthReason ? `当前池状态异常：${healthReason}` : "当前池状态异常，无法提供有效订阅内容。");
  if (health === "depleted") add("incompatible", "当前池剩余流量为 0，无法继续正常使用。");
  if (health === "low_traffic") add("adjust", "当前池剩余流量不足，建议关注并准备换池。");
  if (!groupAllowed) add("incompatible", `当前池不支持用户的 ${String(group || "当前").toUpperCase()} 套餐。`);

  if (!userExpiryValid) add("unknown", "用户缺少有效到期时间，暂时无法判断到期适配度。");
  if (!poolExpiryValid) add("unknown", "当前池缺少有效到期时间，暂时无法判断到期适配度。");
  if (userExpiryValid && poolExpiryValid && expiryDiffDays < -RATING_OVERRIDE_WINDOW_DAYS) {
    add("incompatible", `当前池比用户早到期 ${Math.abs(Math.round(expiryDiffDays))} 天，超过 ${RATING_OVERRIDE_WINDOW_DAYS} 天边界，存在服务中断风险。`);
  } else if (userExpiryValid && poolExpiryValid && expiryDiffDays > RATING_OVERRIDE_WINDOW_DAYS) {
    add("adjust", `当前池比用户晚到期 ${Math.round(expiryDiffDays)} 天，超过 ${RATING_OVERRIDE_WINDOW_DAYS} 天边界，供应商评级不再覆盖该差异。`);
  }

  if (customerCount > maxUsers) add("adjust", `当前池已有 ${customerCount} 人，超过 ${maxUsers} 人上限。`);
  if (excludedFromAutoSwitch) add("adjust", "当前池已设置为禁止自动切入，不会进入自动推荐候选。");
  if (!rated) add("adjust", "当前池供应商未评级，不会进入自动推荐候选。");
  return { status, reasons };
}

function poolExpiryDifference(pool, userExpiryTime) {
  const poolExpiryTime = pool?.metrics?.expireAt ? startOfUtcDate(pool.metrics.expireAt) : NaN;
  return Number.isFinite(poolExpiryTime) && Number.isFinite(userExpiryTime)
    ? Math.round((poolExpiryTime - userExpiryTime) / 86400000)
    : null;
}

function poolCompatibilityLabel(pool) {
  const provider = normalizeServiceProvider({}, pool);
  const identifier = pool?.email || pool?.name;
  return provider && identifier ? `${provider} · ${identifier}` : provider || identifier || pool?.url || "未命名池";
}

function currentPoolCompatibility(user) {
  if (isSelfHostedUser(user)) return null;
  if (!user || user.registeredOnly) return null;
  const currentPool = subscriptions.find(item => item.id === user.subscriptionId);
  if (!currentPool) return {
    status: "incompatible",
    statusText: "不适配",
    reasons: ["当前用户未绑定有效的池 URL。"],
    recommendedPool: null
  };

  const userExpiryTime = startOfUtcDate(user.expiresAt);
  const expiryDiffDays = poolExpiryDifference(currentPool, userExpiryTime);
  const customerCount = subscriptionCustomerCount(currentPool.id);
  const maxUsers = Number(currentPool.maxUsers ?? 15);
  const provider = normalizeServiceProvider({}, currentPool);
  const rating = vendorRatingByName(provider);
  const health = statusFor(currentPool, customerCount);
  const assessment = classifyCurrentPoolFit({
    enabled: currentPool.enabled !== false,
    health,
    healthReason: currentPool.lastError || "",
    groupAllowed: subscriptionAllowsGroup(currentPool, poolSelectionGroup(user)),
    group: activeUserGroup(user),
    userExpiryValid: Number.isFinite(userExpiryTime),
    poolExpiryValid: expiryDiffDays !== null,
    poolExpired: Date.parse(currentPool.metrics?.expireAt || "") <= Date.now(),
    expiryDiffDays: expiryDiffDays ?? 0,
    customerCount,
    maxUsers,
    excludedFromAutoSwitch: currentPool.excludeFromAutoSwitch === true,
    rated: Boolean(rating)
  });
  const recommendation = Number.isFinite(userExpiryTime)
    ? recommendSubscriptionForExpiry(user.expiresAt, { ignoredUserId: user.id, group: poolSelectionGroup(user) })
    : { subscription: null };
  const recommended = recommendation.subscription;

  if (assessment.status === "high" && recommended?.id !== currentPool.id) {
    assessment.status = "usable";
    if (recommended) {
      const recommendedProvider = normalizeServiceProvider({}, recommended);
      assessment.reasons.push(
        `当前池满足基本条件，但按当前规则更推荐“${poolCompatibilityLabel(recommended)}”（供应商 ${vendorRatingByName(recommendedProvider) || "未评级"} 级，到期差 ${Math.abs(poolExpiryDifference(recommended, userExpiryTime) ?? 0)} 天）；当前池为 ${rating || "未评级"} 级，到期差 ${Math.abs(expiryDiffDays ?? 0)} 天。`
      );
    } else {
      assessment.reasons.push("当前池满足基本绑定条件，但当前自动推荐规则没有可用候选。");
    }
  }

  const latestBindingLog = (Array.isArray(user.userLogs) ? user.userLogs : [])
    .find(log => log.toSubscriptionId === currentPool.id && ["manual-pool-changed", "purchase-pool-changed", "user-created"].includes(log.reason));
  const statusText = { high: "高适配", usable: "可以使用", adjust: "建议调整", unknown: "暂无法评估", incompatible: "不适配" }[assessment.status];
  return {
    ...assessment,
    statusText,
    provider,
    rating: rating || null,
    poolExpiresAt: currentPool.metrics?.expireAt || null,
    expiryDiffDays,
    customerCount,
    maxUsers,
    groupAllowed: subscriptionAllowsGroup(currentPool, poolSelectionGroup(user)),
    binding: latestBindingLog ? {
      type: latestBindingLog.reason === "manual-pool-changed" ? "manual" : "system",
      at: latestBindingLog.at || null
    } : null,
    recommendedPool: recommended && recommended.id !== currentPool.id ? {
      id: recommended.id,
      label: poolCompatibilityLabel(recommended),
      provider: normalizeServiceProvider({}, recommended),
      rating: vendorRatingByName(normalizeServiceProvider({}, recommended)) || null,
      expiryDiffDays: poolExpiryDifference(recommended, userExpiryTime)
    } : null
  };
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
  const requestedGroup = normalizeUserGroup(input.activeGroup !== undefined ? input.activeGroup : input.group, existing.activeGroup || existing.group || "pro");
  const lineType = String(input.lineType || existing.lineType || "upstream");
  if (!["upstream", "self_hosted"].includes(lineType)) throw new Error("请选择有效的线路类型。");
  const selfHosted = lineType === "self_hosted";
  const subscription = selfHosted ? null : subscriptions.find(item => item.id === requestedSubscriptionId);

  if (!userId) throw new Error("请填写用户 ID。");
  if (!selfHosted && !subscription) throw new Error("请选择已添加的 URL。");
  if (!isValidDuration(duration)) throw new Error("请选择套餐时长。");
  if (!expiresAt) throw new Error(duration === "custom" ? "请选择到期日期。" : "购买时间格式不正确。");
  if (requestedExpiresAt && (!requestedExpiresDate || Number.isNaN(requestedExpiresDate.getTime()))) throw new Error("到期时间格式不正确。");
  if (actualPaid === null) throw new Error("请填写正确的实付款金额。");
  if (vipSpend === null) throw new Error("请填写正确的累计消费金额。");

  const cashValue = normalizePaymentAmount(input.cashValue ?? existing.cashValue ?? actualPaid);
  const cashValueAt = String(input.cashValueAt || (input.purchasedAt !== undefined ? purchasedAt : existing.cashValueAt) || purchasedAt);
  if (cashValue === null || Number.isNaN(new Date(cashValueAt).getTime())) throw new Error("Invalid cash value.");

  const group = requestedGroup;
  const activeGroup = normalizeUserGroup(
    input.activeGroup !== undefined ? input.activeGroup : input.group,
    existing.activeGroup || group
  );
  const isBusiness = input.isBusiness !== undefined ? Boolean(input.isBusiness) : Boolean(existing.isBusiness);
  const isFamilyFriend = input.isFamilyFriend !== undefined ? Boolean(input.isFamilyFriend) : Boolean(existing.isFamilyFriend);
  const isSuperAccount = input.isSuperAccount !== undefined ? Boolean(input.isSuperAccount) : Boolean(existing.isSuperAccount);
  const unlimited = input.unlimited !== undefined ? Boolean(input.unlimited) : Boolean(existing.unlimited);
  const level = vipLevelForSpend(vipSpend);

  return {
    ...existing,
    customerID: existing.customerID || nextCustomerID(existing.id, [...users, ...accounts]),
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
    isSuperAccount,
    lineType,
    subscriptionId: subscription?.id || "",
    subscriptionToken: existing.subscriptionToken || relayToken(),
    planExpiresAt: existing.planExpiresAt || expiresAt,
    giftedDays: Number.isSafeInteger(existing.giftedDays) ? existing.giftedDays : 0,
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
    const rebuilt = planCashValueFromBills(user);
    user.cashValue = rebuilt?.cashValue || 0;
    user.cashValueAt = rebuilt ? new Date(rebuilt.valuedAt).toISOString() : user.purchasedAt;
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
  const selfHosted = input.lineType === "self_hosted";
  const subscription = selfHosted ? null : subscriptions.find(item => item.id === requestedSubscriptionId);
  if (!expiresAt) throw new Error("续费时间格式不正确。");
  if (!selfHosted && !subscription) throw new Error("请选择已添加的 URL。");

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
    trafficTier: Number(input.trafficTier || 1),
    ...(Number.isFinite(Number(input.trafficLimitBytes)) && Number(input.trafficLimitBytes) >= 0 ? { xuiTrafficLimitBytes: Math.round(Number(input.trafficLimitBytes)) } : {}),
    cashValue: Math.round((replace ? addedCashValue : currentCashValue + addedCashValue) * 100) / 100,
    cashValueAt: renewedAt.toISOString(),
    lineType: selfHosted ? "self_hosted" : "upstream",
    subscriptionId: subscription?.id || "",
    subscriptionToken: user.subscriptionToken || relayToken(),
    expiresAt,
    updatedAt: new Date().toISOString()
  });
  expireUserTrafficPacks(user);

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
  if (isManualSubscription(item)) {
    if (item.lastError || !item.manualContent) return "invalid";
    if (item.manualTrafficDepleted) return "depleted";
    return Date.parse(item.metrics?.expireAt || "") <= Date.now() ? "expired" : "ok";
  }
  const metrics = item.metrics;
  if (item.lastError || metrics?.unavailable) return "invalid";
  if (!metrics) return "unknown";

  const expiresAt = metrics.expireAt ? new Date(metrics.expireAt).getTime() : NaN;
  const remaining = Number(metrics.remainingBytes);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(remaining)) return "unknown";

  if (remaining <= 0) return "depleted";
  if (expiresAt <= Date.now()) return "expired";

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
  const publicFields = { ...item };
  delete publicFields.cachedConfig;
  return {
    ...publicFields,
    serviceProvider: normalizeServiceProvider({}, item),
    serviceProviderRating: vendorRatingByName(normalizeServiceProvider({}, item)) || null,
    customerCount: resolvedCustomerCount,
    status: item.enabled === false ? "disabled" : statusFor(item, resolvedCustomerCount)
  };
}

function publicRegisteredAccount(account) {
  const id = `account:${account.id}`;
  return {
    id,
    ...(account.customerID !== undefined ? { customerID: account.customerID } : {}),
    accountId: account.id,
    registeredOnly: true,
    accountStatus: account.status,
    email: account.email,
    userId: account.email,
    createdAt: account.createdAt,
    actualPaid: 0,
    vipSpend: 0,
    vipLevel: "vip1",
    subscriptionId: "",
    subscription: null,
    activeGroup: "",
    expiresAt: null,
    userLogs: []
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
  const publicFields = { ...user };
  delete publicFields.fallbackLogs;
  return {
    ...publicFields,
    customerID: user.customerID,
    email: user.email || linkedAccount?.email || "",
    activeGroup: activeUserGroup(user),
    deviceLimit: planDeviceLimit(user),
    vipLevel: userVipLevel(user),
    accountStatus: linkedAccount?.status || "unclaimed",
    accountId: linkedAccount?.id || "",
    referralCode: linkedAccount?.referralCode || "",
    referralRate: Number(linkedAccount?.referralRate ?? 10),
    recurringReferral: linkedAccount?.recurringReferral === true,
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
  try {
    await fetchLivePoolConfig(item);
  } catch {
    // The unified fetch records the failure while preserving the last usable data.
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

function cacheIsFresh(cache, now = Date.now()) {
  const fetchedAt = cache?.bodyFetchedAt || cache?.fetchedAt;
  const fetchedTime = fetchedAt ? new Date(fetchedAt).getTime() : 0;
  const body = typeof cache?.body === "string" ? extractClashConfigBody(cache.body) : cache?.bodyFile;
  return Boolean(body) && Number.isFinite(fetchedTime) && now - fetchedTime < POOL_CONFIG_CACHE_TTL_MS;
}

function batchItems(items, size) {
  const batchSize = Math.max(1, Math.floor(Number(size) || 1));
  return Array.from({ length: Math.ceil(items.length / batchSize) }, (_, index) => items.slice(index * batchSize, (index + 1) * batchSize));
}

async function refreshSubscriptions(items) {
  for (const batch of batchItems(items, REFRESH_CONCURRENCY)) {
    await Promise.all(batch.map(item => refreshSubscription(item)));
  }
}

async function liveConfigFromCachedPoolConfig(item, { allowStale = false } = {}) {
  if (!allowStale && !cacheIsFresh(item?.cachedConfig)) return null;
  const body = extractClashConfigBody(await readPoolCachedBody(item));
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
  if (/^\s*<(?:!doctype\s+html|html)\b/i.test(text)) return "";

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

function poolRefreshAttempts(results) {
  return results.map(result => ({
    client: result.client,
    status: result.status,
    score: result.score,
    bodyLength: result.body.length,
    rawBodyLength: result.rawBodyLength,
    error: result.error
  }));
}

function updatePoolMetrics(item, result, fetchedAt) {
  const existingScore = metricScore(item.metrics);
  const nextScore = metricScore(result?.metrics);

  item.lastCheckedAt = fetchedAt;
  item.httpStatus = result?.status ?? null;
  item.lastClient = result?.client || "";
  item.lastRefreshResults = result ? [{
    client: result.client,
    status: result.status,
    score: nextScore,
    hasExpire: Boolean(result.metrics?.expireAt),
    hasTotal: result.metrics?.totalBytes !== undefined && result.metrics?.totalBytes !== null,
    hasUsed: result.metrics?.usedBytes !== undefined && result.metrics?.usedBytes !== null,
    hasRemaining: result.metrics?.remainingBytes !== undefined && result.metrics?.remainingBytes !== null
  }] : [];

  if (isManualSubscription(item) && result?.body) {
    const manualExpireAt = item.metrics?.expireAt;
    item.metrics = result.metrics || item.metrics || null;
    if (manualExpireAt) item.metrics = { ...(item.metrics || {}), expireAt: manualExpireAt };
    item.lastError = null;
  } else if (result?.metrics && (nextScore >= existingScore || result.metrics.expireAt)) {
    item.metrics = result.metrics;
    item.lastError = null;
  } else if (result?.metrics && item.metrics) {
    item.lastError = null;
  } else if (result?.body) {
    item.metrics = null;
    item.lastError = null;
  }
}

async function applyPoolRefreshResult(item, result, results, fetchedAt) {
  updatePoolMetrics(item, result, fetchedAt);
  const storedBody = await writePoolCachedBody(item, result.body);
  item.cachedConfig = {
    ...storedBody,
    status: result.status,
    client: result.client,
    fetchedAt,
    bodyFetchedAt: fetchedAt,
    contentType: result.contentType,
    subscriptionUserinfo: result.subscriptionUserinfo,
    score: result.score,
    attempts: poolRefreshAttempts(results),
    error: null
  };
}

function applyPoolRefreshFailure(item, results, error, fetchedAt) {
  const best = results[0] || null;
  updatePoolMetrics(item, best, fetchedAt);
  item.lastError = error.name === "AbortError" ? "检查超时。" : error.message || "请求失败。";
  item.cachedConfig = {
    ...(item.cachedConfig || {}),
    fetchedAt,
    bodyFetchedAt: item.cachedConfig?.bodyFetchedAt || item.cachedConfig?.fetchedAt || null,
    attempts: poolRefreshAttempts(results),
    error: error.message || "没有获取到可用的订阅配置。"
  };
}

async function fetchLivePoolConfig(item) {
  if (isManualSubscription(item)) {
    const sourceType = subscriptionSourceType(item);
    const body = normalizeManualContent(item);
    const fetchedAt = new Date().toISOString();
    const result = {
      body,
      client: sourceType === "yaml" ? "manual-yaml" : "manual-base64",
      status: 200,
      score: clashConfigScore(body),
      rawBodyLength: body.length,
      contentType: "text/plain; charset=utf-8",
      subscriptionUserinfo: "",
      metrics: parseBodyHints(body),
      error: null
    };
    await applyPoolRefreshResult(item, result, [result], fetchedAt);
    return {
      ...result,
      fetchedAt,
      bodyLength: body.length,
      attempts: poolRefreshAttempts([result])
    };
  }

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
      const subscriptionUserinfo = response.headers.get("subscription-userinfo") || response.headers.get("Subscription-Userinfo") || "";
      const metrics = parseSubscriptionUserInfo(subscriptionUserinfo) || parseAccountUnavailable(rawBody) || parseBodyHints(rawBody);
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
        subscriptionUserinfo,
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
        subscriptionUserinfo,
        metrics,
        error: response.ok
          ? (body ? null : "响应不是有效的订阅配置。")
          : `池 URL 获取失败（HTTP ${response.status}）：${rawBody.slice(0, 200)}`
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
    const error = livePoolConfigFailure(results, best);
    applyPoolRefreshFailure(item, results, error, new Date().toISOString());
    throw error;
  }

  const fetchedAt = new Date().toISOString();
  const liveConfig = {
    body: best.body,
    status: best.status,
    client: best.client,
    fetchedAt,
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
  await applyPoolRefreshResult(item, best, results, fetchedAt);
  return liveConfig;
}

function poolMetricUnavailableReason(item, now = Date.now()) {
  if (item?.enabled === false) return "pool-disabled";
  const expireTime = item?.metrics?.expireAt ? new Date(item.metrics.expireAt).getTime() : NaN;
  if (Number.isFinite(expireTime) && expireTime <= now) return "pool-expired";
  if (item && isManualSubscription(item) && item.manualTrafficDepleted) return "pool-depleted";
  const remaining = item?.metrics?.remainingBytes;
  if (remaining !== null && remaining !== undefined && Number(remaining) <= 0) return "pool-depleted";
  return "";
}

function evaluatePool(item, userOrGroup = {}, { fetchFailed = false } = {}) {
  const group = typeof userOrGroup === "string" ? userOrGroup : poolSelectionGroup(userOrGroup || {});
  const exitReason = item?.enabled === false
    ? "pool-disabled"
    : !subscriptionHasUsableSource(item)
      ? "pool-missing"
      : !subscriptionAllowsGroup(item, group)
        ? "pool-group-mismatch"
        : poolMetricUnavailableReason(item) || (fetchFailed ? "pool-fetch-failed" : "");
  const entryBlockReason = exitReason
    || (item?.excludeFromAutoSwitch ? "pool-auto-entry-disabled" : "")
    || (item && subscriptionAtCapacity(item, userOrGroup && typeof userOrGroup === "object" ? userOrGroup.id || "" : "") ? "pool-full" : "");
  const status = !item ? "invalid" : item.enabled === false ? "disabled" : statusFor(item);
  return {
    canServeCurrent: !exitReason,
    canAutoEnter: !entryBlockReason,
    exitReason,
    entryBlockReason,
    warning: ["low_traffic", "expiring", "unknown"].includes(status) ? status : ""
  };
}

function initialPoolFallbackReason(item, _useSubconverter, group = "") {
  return evaluatePool(item, group).exitReason;
}

const fallbackReasonText = {
  "pool-disabled": "\u539f\u6c60 URL \u5df2\u505c\u7528",
  "pool-expired": "\u539f\u6c60 URL \u5df2\u5230\u671f",
  "pool-depleted": "\u539f\u6c60 URL \u6d41\u91cf\u5df2\u7528\u5c3d",
  "pool-fetch-failed": "\u539f\u6c60 URL \u5b9e\u65f6\u83b7\u53d6\u5931\u8d25",
  "pool-group-mismatch": "\u539f\u6c60 URL \u4e0d\u9002\u7528\u4e8e\u5f53\u524d\u5957\u9910\u7b49\u7ea7",
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
  "xui-migration-activation-required": "\u7b49\u5f85\u6fc0\u6d3b\u8d26\u6237",
  "xui-migration-completed": "\u65e7\u5957\u9910\u8fc1\u79fb\u5b8c\u6210",
  "xui-migration-failed": "\u65e7\u5957\u9910\u8fc1\u79fb\u5931\u8d25",
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
  if (!RELAY_DEBUG_LOGS) return;
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
    await saveUser(user);
    relayLog("user-log-deduped", {
      userId: user?.id || "",
      log: latest
    });
    return latest;
  }
  appendUserLogToUser(user, log);
  await saveUser(user);
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
  await saveUser(user);
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
    isSuperAccount: Boolean(user.isSuperAccount),
    purchasedAt: user.purchasedAt || "",
    duration: user.duration || "",
    currentProductId: user.currentProductId || "",
    currentOptionId: user.currentOptionId || "",
    currentProductOrderId: user.currentProductOrderId || "",
    currentProductSource: user.currentProductSource || "",
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
    isSuperAccount: "\u8d85\u7ea7\u8d26\u6237",
    purchasedAt: "\u8d2d\u4e70\u65e5\u671f",
    duration: "\u5957\u9910\u65f6\u957f",
    currentProductId: "当前商品",
    currentOptionId: "当前商品规格",
    currentProductOrderId: "商品来源订单",
    currentProductSource: "商品绑定来源",
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
  if (item?.enabled === false) return null;
  const userTime = user?.expiresAt ? startOfUtcDate(user.expiresAt) : null;
  const poolTime = item?.metrics?.expireAt ? startOfUtcDate(item.metrics.expireAt) : null;
  const dayMs = 86400000;
  if (!Number.isFinite(userTime) || !Number.isFinite(poolTime)) {
    return { group: 4, distance: Number.POSITIVE_INFINITY };
  }
  const diffDays = (poolTime - userTime) / dayMs;
  return {
    group: Math.abs(diffDays) <= 10 ? (diffDays >= 0 ? 0 : 1) : (diffDays >= 0 ? 2 : 3),
    distance: Math.abs(diffDays)
  };
}

function fallbackCandidates(user, currentSubscription) {
  const candidates = subscriptions
    .filter(item => item.id !== currentSubscription?.id && evaluatePool(item, user).canAutoEnter)
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
      const liveConfig = candidate.useCachedConfigForFallback
        ? await liveConfigFromCachedPoolConfig(candidate, { allowStale: true }) || await fetchLivePoolConfig(candidate)
        : await fetchLivePoolConfig(candidate);
      const entryBlockReason = evaluatePool(candidate, user).entryBlockReason;
      if (entryBlockReason) throw new Error(fallbackReasonText[entryBlockReason] || entryBlockReason);
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
  await saveUser(user);
  relayLog("fallback-switch-saved", {
    userId: user?.id || "",
    log,
    nextSubscriptionId: user.subscriptionId
  });
  return log;
}

async function refreshPoolConfigCache(item, { force = false } = {}) {
  if (!force && cacheIsFresh(item.cachedConfig)) return item.cachedConfig;
  await refreshSubscription(item);
  return item.cachedConfig;
}

async function cachedPoolConfig(item) {
  const cached = await liveConfigFromCachedPoolConfig(item);
  if (cached) return cached;

  const cache = await refreshPoolConfigCache(item);
  await saveData();
  const refreshed = await liveConfigFromCachedPoolConfig(item);
  if (refreshed) return refreshed;

  const error = new Error(cache?.error || "\u6ca1\u6709\u83b7\u53d6\u5230\u53ef\u7528\u7684\u8ba2\u9605\u914d\u7f6e\u3002");
  error.attempts = cache?.attempts || [];
  throw error;
}

async function refreshAllPoolConfigCaches() {
  await refreshSubscriptions(subscriptions);
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
  const remainingBytes = isSelfHostedUser(user) ? user.xuiLastTraffic?.remainingBytes : subscriptions.find(item => item.id === user.subscriptionId)?.metrics?.remainingBytes;
  const remainingTraffic = Number.isFinite(Number(remainingBytes)) ? `${Number((Math.max(0, Number(remainingBytes)) / 1024 ** 3).toFixed(2))}G` : "未知";
  nodes.push(`${typeof level === "string" && level.startsWith("vip") ? level.replace("vip", "VIP ") : level} | ${group} | 剩余流量${remainingTraffic}`);
  return nodes;
}

function normalizeClashKeys(doc) {
  let normalized = false;
  for (const [legacyKey, key] of [["Proxy", "proxies"], ["Proxy Group", "proxy-groups"], ["Rule", "rules"]]) {
    if (!(legacyKey in doc)) continue;
    if (!(key in doc)) doc[key] = doc[legacyKey];
    delete doc[legacyKey];
    normalized = true;
  }
  return normalized;
}

function injectPlaceholderNodes(bodyBuffer, user, groups = placeholderNodes) {
  const useDefault = user.useDefaultPlaceholder !== false;
  const showUserInfo = user.showUserInfo !== false;
  const defaultGroup = useDefault ? groups.find(p => p.tag === "default") : null;
  const customGroup = user.placeholderTag && user.placeholderTag !== "default"
    ? groups.find(p => p.tag === user.placeholderTag) : null;
  const defaultNodes = defaultGroup?.nodes?.length ? defaultGroup.nodes : [];
  const customNodes = customGroup?.nodes?.length ? customGroup.nodes : [];
  const userInfoNodes = showUserInfo ? buildUserInfoNodes(user) : [];
  try {
    const text = bodyBuffer.toString("utf8");
    const doc = yaml.load(text);
    if (!doc || typeof doc !== "object") return bodyBuffer;
    normalizeClashKeys(doc);
    const proxies = Array.isArray(doc.proxies)
      ? doc.proxies
      : (doc.proxies = []);
    const allNames = [...userInfoNodes, ...defaultNodes, ...customNodes].map(nodeName => String(nodeName).startsWith("*") ? String(nodeName) : `*${nodeName}`);
    const firstProxy = proxies[0];
    const allProxies = allNames.map(nodeName => {
      if (firstProxy) return { ...firstProxy, name: nodeName };
      return { name: nodeName, type: "ss", server: "127.0.0.1", port: 1, cipher: "aes-128-gcm", password: "placeholder" };
    });
    proxies.unshift(...allProxies);
    const proxyGroups = doc["proxy-groups"];
    if (Array.isArray(proxyGroups)) {
      for (const pg of proxyGroups) {
        if (String(pg.name || "").includes("全球直连")) pg.proxies = ["DIRECT"];
        else if (String(pg.name || "").includes("全球拦截")) pg.proxies = ["REJECT"];
        else if (["🐟 漏网之鱼", "🤖 AI服务", "♻️ 自动选择"].includes(String(pg.name || ""))) continue;
        else if (Array.isArray(pg.proxies)) pg.proxies.push(...allNames);
      }
    }
    return Buffer.from(yaml.dump(doc, { lineWidth: -1, noRefs: true }), "utf8");
  } catch {
    return bodyBuffer;
  }
}

function restoreUpstreamClashConfig(convertedBody, upstreamBody, { include = "", exclude = "" } = {}) {
  try {
    const converted = yaml.load(convertedBody.toString("utf8"));
    const upstream = yaml.load(upstreamBody.toString("utf8"));
    if (!converted || typeof converted !== "object" || !upstream || typeof upstream !== "object") return convertedBody;
    normalizeClashKeys(converted);
    normalizeClashKeys(upstream);
    const sourceProxies = Array.isArray(upstream.proxies) ? upstream.proxies : [];
    const convertedProxies = Array.isArray(converted.proxies) ? converted.proxies : [];
    const identity = item => JSON.stringify([item?.type, item?.server, item?.port, item?.uuid, item?.password, item?.username]);
    const buckets = key => sourceProxies.reduce((map, item, index) => {
      const value = key(item);
      map.set(value, [...(map.get(value) || []), index]);
      return map;
    }, new Map());
    const nameBuckets = buckets(item => item?.name);
    const identityBuckets = buckets(identity);
    const used = new Set();
    const convertedToSourceName = new Map();
    const take = bucket => {
      while (bucket?.length) {
        const index = bucket.shift();
        if (!used.has(index)) return index;
      }
      return -1;
    };
    for (const item of convertedProxies) {
      let index = take(nameBuckets.get(item?.name));
      if (index === -1) index = take(identityBuckets.get(identity(item)));
      if (index === -1) continue;
      used.add(index);
      convertedToSourceName.set(item.name, sourceProxies[index].name);
    }
    const filtersActive = Boolean(include || exclude);
    const restored = { ...upstream };
    restored.proxies = sourceProxies.length
      ? sourceProxies.filter((_, index) => !filtersActive || used.has(index))
      : convertedProxies;
    const selectedNames = new Set(restored.proxies.map(item => item?.name));
    const convertedNames = new Set(convertedProxies.map(item => item?.name));
    if (Array.isArray(converted["proxy-groups"])) {
      restored["proxy-groups"] = converted["proxy-groups"].map(group => ({
        ...group,
        ...(Array.isArray(group.proxies) ? {
          proxies: [...new Set(group.proxies.flatMap(name => {
            if (!convertedNames.has(name)) return [name];
            const sourceName = convertedToSourceName.get(name);
            return sourceName && selectedNames.has(sourceName) ? [sourceName] : [];
          }))]
        } : {})
      }));
    }
    for (const key of ["rules", "proxy-providers", "rule-providers"]) {
      if (key in converted) restored[key] = converted[key];
    }
    return Buffer.from(yaml.dump(restored, { lineWidth: -1, noRefs: true }), "utf8");
  } catch {
    return convertedBody;
  }
}

function postSubconverter(convertedBody, upstreamBody, user, config = {}) {
  if (config.postSubconverter === false) return convertedBody;
  const restoredBody = restoreUpstreamClashConfig(convertedBody, upstreamBody, config);
  let adaptedBody = restoredBody;
  try {
    const upstream = yaml.load(upstreamBody.toString("utf8"));
    const restored = yaml.load(restoredBody.toString("utf8"));
    if (upstream && typeof upstream === "object" && restored && typeof restored === "object") {
      normalizeClashKeys(upstream);
      normalizeClashKeys(restored);
      if (Array.isArray(upstream.proxies) && upstream.proxies.length && !restored.proxies?.length) {
        throw new Error("Subconverter filters removed every upstream node.");
      }
      if (config.nextinCompatible && delete restored["global-client-fingerprint"]) {
        adaptedBody = Buffer.from(yaml.dump(restored, { lineWidth: -1, noRefs: true }), "utf8");
      }
    }
  } catch (error) {
    if (/removed every upstream node/.test(error.message)) throw error;
  }
  return injectPlaceholderNodes(adaptedBody, user);
}

function placeholderSubscription(user, nodeName) {
  return {
    contentType: "text/plain; charset=utf-8",
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

function disabledAccountPlaceholderSubscription(user) {
  return placeholderSubscription(user, "\u8be5\u8d26\u6237\u5df2\u505c\u7528\uff0c\u8bf7\u8054\u7cfb\u5b98\u7f51\u5ba2\u670d\u3002");
}

function activationRequiredPlaceholderSubscription(user) {
  return placeholderSubscription(user, "请联系客服激活账户");
}

function personalInfoPlaceholderSubscription(user) {
  const body = injectPlaceholderNodes(Buffer.from("proxies: []\nproxy-groups:\n  - name: PROXY\n    type: select\n    proxies: []\nrules:\n  - MATCH,PROXY\n"), user, []);
  return { contentType: "application/yaml; charset=utf-8", body };
}

function sendPlaceholderSubscription(res, placeholder) {
  res.writeHead(200, { "content-type": placeholder.contentType, "cache-control": "no-store, max-age=0", pragma: "no-cache", expires: "0" });
  res.end(placeholder.body);
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

function sendDisabledAccountPlaceholderSubscription(res, user) {
  const placeholder = disabledAccountPlaceholderSubscription(user);
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
  const userAgent = String(req?.headers?.["user-agent"] || "");
  const looksLikeBrowser = /(Mozilla|Chrome|Safari|Firefox|Edg|OPR)\//i.test(userAgent);
  const looksLikeSubscriptionClient = /(Clash|Stash|Shadowrocket|Quantumult|Surge|sing-box|SFA|VPNSubscriptionMonitor)/i.test(userAgent);
  return !looksLikeSubscriptionClient && looksLikeBrowser;
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
    postSubconverter: preset.postSubconverter !== false,
    nextinCompatible: preset.nextinCompatible === true,
    ...Object.fromEntries(Object.entries(SUBCONVERTER_BOOLEAN_DEFAULTS).map(([key, defaultValue]) => [
      key,
      preset[key] === undefined ? defaultValue : Boolean(preset[key])
    ]))
  };
}

function relaySubconverterConfig(subscription, vendorList = vendors) {
  const config = { ...defaultSubconverterPreset(), target: DEFAULT_SUBCONVERTER_TARGET, include: "", exclude: "", rename: "" };
  const provider = String(subscription?.serviceProvider || "").trim().toLowerCase();
  const vendor = vendorList.find(item => String(item.name || "").trim().toLowerCase() === provider);
  if (vendor?.overrideExclude) config.exclude = vendor.overrideExclude;
  if (vendor?.overrideInclude) config.include = vendor.overrideInclude;
  if (vendor?.overrideRename) config.rename = vendor.overrideRename;
  return config;
}

function userOutputMode(user = {}) {
  return String(user.outputMode || "subconverter").trim().toLowerCase() === "direct"
    ? "direct"
    : "subconverter";
}

function copyUpstreamHeaders(response, req) {
  const browserInline = isBrowserNavigationRequest(req);
  const headers = {
    "cache-control": "no-store, max-age=0",
    "pragma": "no-cache",
    "expires": "0",
    "content-disposition": browserInline ? "inline; filename*=UTF-8''NEXORA.yaml" : "attachment; filename*=UTF-8''NEXORA"
  };
  for (const name of ["content-type", "subscription-userinfo", "profile-update-interval"]) {
    const value = response.headers.get(name);
    if (value) headers[name] = value;
  }
  if (!headers["content-type"]) headers["content-type"] = "text/plain; charset=utf-8";
  if (browserInline) {
    headers["content-type"] = "text/plain; charset=utf-8";
    headers["x-content-type-options"] = "nosniff";
  }
  return headers;
}

function subscriptionCanBeManuallyAssigned(subscription, now = Date.now()) {
  if (isManualSubscription(subscription)) return Boolean(subscription?.manualContent);
  const expiresAt = Date.parse(subscription?.metrics?.expireAt || "");
  return Number.isFinite(expiresAt) && expiresAt > now;
}

function manualSubscriptionHeaders(req, subscription) {
  const browserInline = isBrowserNavigationRequest(req);
  const extension = subscriptionSourceType(subscription) === "yaml" ? "yaml" : "txt";
  return {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "pragma": "no-cache",
    "expires": "0",
    "content-disposition": browserInline ? `inline; filename*=UTF-8''NEXORA.${extension}` : "attachment; filename*=UTF-8''NEXORA"
  };
}

async function fallbackToUsableSubscription(user, currentSubscription, reason, req, target = "") {
  const fallback = await findFallbackSubscription(user, currentSubscription);
  if (!fallback.subscription) return fallback;
  await switchUserSubscription(user, currentSubscription, fallback.subscription, reason, req, target);
  console.log(`[relay] fallback switched user=${user.id} from=${currentSubscription?.id || ""} to=${fallback.subscription.id} reason=${reason}`);
  return fallback;
}

function selfHostedUserinfo(user, remote) {
  const upload = Math.max(0, Number(remote?.traffic?.up) || 0);
  const download = Math.max(0, Number(remote?.traffic?.down) || 0);
  const total = Math.max(0, Number(remote?.totalGB) || planTrafficBytes(user));
  const expire = Math.floor(new Date(user.expiresAt).getTime() / 1000);
  return `upload=${upload}; download=${download}; total=${total}; expire=${expire}`;
}

async function fetchSelfHostedSubscription(user, remote) {
  const subId = String(remote?.subId || user?.xuiSubId || "").trim();
  if (!subId) throw new Error("3x-ui Client 缺少 subId。");
  const sourceUrl = `${XUI_SUBSCRIPTION_BASE_URL}/clash/${encodeURIComponent(subId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), XUI_TIMEOUT_MS);
  try {
    const response = await fetch(sourceUrl, { signal: controller.signal, redirect: "follow", headers: { "User-Agent": "subconverter", Accept: "text/yaml, text/plain, */*", "Cache-Control": "no-cache" } });
    const body = await response.text();
    if (!response.ok || !body.trim()) throw new Error(`3x-ui Clash 订阅请求失败（HTTP ${response.status}）。`);
    return { body, status: response.status, client: "3x-ui-clash", sourceUrl, fetchedAt: new Date().toISOString(), contentType: response.headers.get("content-type") || "text/yaml; charset=utf-8", subscriptionUserinfo: selfHostedUserinfo(user, remote), score: body.length, bodyLength: body.length, attempts: [], error: null };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("3x-ui Clash 订阅请求超时。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function sendSubconverterSubscription({ req, res, user, relayRequestId, subscription, liveConfig, sc }) {
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
  for (const key of Object.keys(SUBCONVERTER_BOOLEAN_DEFAULTS)) {
    if (sc[key] !== undefined) params.set(key, String(sc[key]));
  }
  if (sc.rename) params.set("rename", sc.rename);
  const subUrl = `${SUB_CONVERTER_URL}/sub?${params.toString()}`;
  relayLog("subconverter-request", {
    relayRequestId,
    userId: user.id,
    url: subUrl.replace(encodeURIComponent(INTERNAL_TOKEN), "[redacted]"),
    params: { ...Object.fromEntries(params.entries()), url: liveConfigUrl.replace(encodeURIComponent(INTERNAL_TOKEN), "[redacted]") },
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
      relayLog("subconverter-response-error-body", { relayRequestId, userId: user.id, bodyLength: text.length, bodyPreview: bodyPreview(text) });
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
    const finalBody = postSubconverter(body, Buffer.from(liveConfig.body), user, sc);
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
      ...(liveConfig.subscriptionUserinfo && (isSelfHostedUser(user) || user.blockUserinfo === false) ? { "subscription-userinfo": liveConfig.subscriptionUserinfo } : {})
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
    relayLog("subconverter-request-error", { relayRequestId, userId: user.id, errorName: error.name, errorMessage: error.message });
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
}

async function handleSelfHostedRelay(req, res, user, relayRequestId) {
  if (!Array.isArray(user.xuiInboundIds) || !user.xuiInboundIds.length) {
    sendPlaceholderSubscription(res, personalInfoPlaceholderSubscription(user));
    return;
  }
  if (!SUB_CONVERTER_URL) {
    sendSubscriptionMessage(res, 503, "服务端未配置 SUB_CONVERTER_URL，无法转换自研线路订阅。");
    return;
  }
  if (!xuiConfigured()) {
    sendSubscriptionMessage(res, 503, "自研线路尚未完成3x-ui配置，请联系客服。");
    return;
  }
  try {
    let remote = await getXuiClient(user);
    const metadataSyncedAt = Date.parse(user.xuiMetadataSyncedAt || "");
    if (!user.xuiSubId || remote.enable === false || !Number.isFinite(metadataSyncedAt) || Date.now() - metadataSyncedAt >= XUI_METADATA_SYNC_INTERVAL_MS) {
      remote = await provisionXuiClient(user);
      await saveUsers();
    }
    const source = { id: `xui:${user.id}`, url: `${XUI_SUBSCRIPTION_BASE_URL}/clash/${encodeURIComponent(remote.subId || user.xuiSubId)}`, sourceType: "url", serviceProvider: "3x-ui", enabled: true };
    const liveConfig = await fetchSelfHostedSubscription(user, remote);
    await sendSubconverterSubscription({ req, res, user, relayRequestId, subscription: source, liveConfig, sc: relaySubconverterConfig(source) });
  } catch (error) {
    relayLog("self-hosted-relay-failed", { relayRequestId, userId: user.id, error: error.message });
    sendSubscriptionMessage(res, 502, `自研线路订阅生成失败：${error.message}`);
  }
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
    if (isManualSubscription(candidate)) {
      try {
        const body = Buffer.from(normalizeManualContent(candidate), "utf8");
        return { subscription: candidate, body, headers: manualSubscriptionHeaders(req, candidate), errors };
      } catch (error) {
        errors.push({ subscriptionId: candidate.id, subscriptionLabel: subscriptionLogLabel(candidate), error: error.message });
        continue;
      }
    }
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
      const rawBody = body.toString("utf8");
      const subscriptionUserinfo = response.headers.get("subscription-userinfo") || "";
      updatePoolMetrics(candidate, {
        body: rawBody,
        status: response.status,
        client: "direct",
        metrics: parseSubscriptionUserInfo(subscriptionUserinfo) || parseAccountUnavailable(rawBody) || parseBodyHints(rawBody)
      }, new Date().toISOString());
      const entryBlockReason = evaluatePool(candidate, user).entryBlockReason;
      if (entryBlockReason) throw new Error(fallbackReasonText[entryBlockReason] || entryBlockReason);
      await saveData();
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
        headers: copyUpstreamHeaders(response, req),
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

  if (isUserAccountDisabled(user)) {
    relayLog("response-placeholder-account-disabled", {
      relayRequestId,
      userId: user.id
    });
    sendDisabledAccountPlaceholderSubscription(res, user);
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

  if (!isSelfHostedUser(user)) {
    try {
      const migration = await migrateLegacyUserOnSubscriptionRefresh(user, req);
      if (migration.status === "activation_required") {
        sendPlaceholderSubscription(res, activationRequiredPlaceholderSubscription(user));
        return;
      }
    } catch (error) {
      relayLog("xui-migration-failed", { relayRequestId, userId: user.id, error: error.message });
      sendPlaceholderSubscription(res, placeholderSubscription(user, "账户迁移失败-请联系客服"));
      return;
    }
  }

  if (isSelfHostedUser(user)) {
    await handleSelfHostedRelay(req, res, user, relayRequestId);
    return;
  }

  let subscription = subscriptions.find(item => item.id === user.subscriptionId);
  const outputMode = userOutputMode(user);
  let sc = (() => {
    // 用户可显式选择直链模式，绕过订阅转换
    return outputMode === "direct" ? null : relaySubconverterConfig(subscription);
  })();
  let precheckedLiveConfig = null;
  const initialFallbackReason = initialPoolFallbackReason(subscription, Boolean(sc?.target), poolSelectionGroup(user));
  relayLog("current-pool-selected", {
    relayRequestId,
    userId: user.id,
    outputMode,
    useSubconverter: Boolean(sc?.target),
    subconverterConfig: sc || null,
    currentPool: poolLogInfo(subscription),
    initialFallbackReason
  });
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
    if (sc) sc = relaySubconverterConfig(subscription);
    precheckedLiveConfig = fallback.liveConfig;
    relayLog("current-pool-replaced-by-fallback", {
      relayRequestId,
      userId: user.id,
      reason: initialFallbackReason,
      nextPool: poolLogInfo(subscription)
    });
  }
  if (!subscriptionHasUsableSource(subscription)) {
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
      message: "\u7528\u6237\u5f53\u524d\u7ed1\u5b9a\u7684\u6c60\u914d\u7f6e\u4e0d\u5b58\u5728\u3002"
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
      if (!liveConfig) liveConfig = await cachedPoolConfig(subscription);
      const refreshedReason = evaluatePool(subscription, user).exitReason;
      if (refreshedReason) throw Object.assign(new Error(fallbackReasonText[refreshedReason]), { fallbackReason: refreshedReason });
    } catch (error) {
      relayLog("subconverter-current-live-fetch-failed", {
        relayRequestId,
        userId: user.id,
        pool: poolLogInfo(subscription),
        error: error.message,
        attempts: error.attempts || []
      });
      liveConfig = error.fallbackReason ? null : await liveConfigFromCachedPoolConfig(subscription);
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
      const fallbackReason = error.fallbackReason || "pool-fetch-failed";
      const fallback = await fallbackToUsableSubscription(user, subscription, fallbackReason, req, sc.target);
      if (!fallback.subscription) {
        relayLog("response-placeholder-unavailable", {
          relayRequestId,
          userId: user.id,
          stage: "subconverter-live-fetch",
          reason: fallbackReason,
          fallbackErrors: fallback.errors || []
        });
        await recordUserLog(user, {
          status: "no_usable_pool",
          reason: fallbackReason,
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
      sc = relaySubconverterConfig(subscription);
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
    await sendSubconverterSubscription({ req, res, user, relayRequestId, subscription, liveConfig, sc });
    return;
  }

  if (isManualSubscription(subscription)) {
    try {
      const body = Buffer.from(normalizeManualContent(subscription), "utf8");
      res.writeHead(200, manualSubscriptionHeaders(req, subscription));
      res.end(body);
    } catch (error) {
      sendSubscriptionMessage(res, 502, `手动订阅内容无效：${error.message}`);
    }
    return;
  }

  relayLog("direct-current-cache", {
    relayRequestId,
    userId: user.id,
    pool: poolLogInfo(subscription)
  });
  try {
    const liveConfig = await cachedPoolConfig(subscription);
    const refreshedReason = evaluatePool(subscription, user).exitReason;
    if (refreshedReason) throw Object.assign(new Error(fallbackReasonText[refreshedReason]), { fallbackReason: refreshedReason });
    relayLog("direct-current-cache-ok", {
      relayRequestId,
      userId: user.id,
      pool: poolLogInfo(subscription),
      fetchedAt: liveConfig.fetchedAt,
      bodyLength: liveConfig.bodyLength,
      bodyPreview: bodyPreview(liveConfig.body)
    });
    res.writeHead(200, {
      ...manualSubscriptionHeaders(req, { sourceType: "yaml" }),
      "content-type": isBrowserNavigationRequest(req) ? "text/plain; charset=utf-8" : (liveConfig.contentType || "text/plain; charset=utf-8"),
      "profile-update-interval": String(Math.max(1, Math.round(POOL_CONFIG_CACHE_TTL_MS / 3600000))),
      ...(liveConfig.subscriptionUserinfo ? { "subscription-userinfo": liveConfig.subscriptionUserinfo } : {})
    });
    res.end(liveConfig.body);
  } catch (error) {
    relayLog("direct-current-response-failed", {
      relayRequestId,
      userId: user.id,
      pool: poolLogInfo(subscription),
      errorName: error.name,
      errorMessage: error.message
    });
    const fallbackReason = error.fallbackReason || "pool-fetch-failed";
    const fallback = await findDirectFallbackSubscription(user, subscription, req);
    if (!fallback.subscription) {
      relayLog("response-placeholder-unavailable", {
        relayRequestId,
        userId: user.id,
        stage: "direct-fallback",
        reason: fallbackReason,
        fallbackErrors: fallback.errors || []
      });
      await recordUserLog(user, {
        status: "no_usable_pool",
        reason: fallbackReason,
        fromSubscription: subscription,
        req,
        stage: "direct-fallback",
        message: "\u539f\u6c60 URL \u76f4\u8fde\u83b7\u53d6\u5931\u8d25\uff0c\u4e14\u672a\u627e\u5230\u53ef\u81ea\u52a8\u5207\u6362\u7684\u5907\u7528\u6c60\u3002",
        details: { fallbackErrors: fallback.errors || [] }
      });
      sendUnavailablePoolPlaceholderSubscription(res, user);
      return;
    }
    await switchUserSubscription(user, subscription, fallback.subscription, fallbackReason, req);
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
  }
}

async function refreshAll() {
  await refreshSubscriptions(subscriptions);
  await saveData();
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
  const text = "NEXORA alert test.";
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
    planExpiresAt: user.planExpiresAt || user.expiresAt || "",
    giftedDays: Number(user.giftedDays) || 0,
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
      const referralCode = normalizeReferralCode(payload.referralCode);
      const registrationMode = currentSalesSettings().registrationMode;
      if (registrationMode === "disabled") throw new Error("当前暂不开放注册");
      if (registrationMode === "invite_only" && !referralCode) throw new Error("仅限使用推荐码注册");
      if (payload.referralCode && !referralCode) throw new Error("邀请码必须是 6 位数字");
      if (accounts.some(item => item.email === email)) {
        sendJson(res, 409, { error: "该邮箱已有账户，请直接登录或重置密码。" });
        return;
      }
      if (users.some(item => String(item.userId || item.email || "").trim().toLowerCase() === email)) {
        sendJson(res, 409, { error: "该邮箱已有历史订阅，请联系管理员发送账户认领邮件。" });
        return;
      }
      const now = new Date().toISOString();
      const inviter = referralCode ? accounts.find(item => item.referralCode === referralCode) : null;
      if (referralCode && (!inviter || inviter.email === email)) {
        sendJson(res, 400, { error: "邀请码无效" });
        return;
      }
      const account = { id: crypto.randomUUID(), email, passwordHash: hashAccountPassword(password), status: "active", linkedUserId: "", referralCode: randomReferralCode(), referredByAccountId: inviter?.id || "", referralRate: 10, recurringReferral: false, referralBoundAt: inviter ? now : "", createdAt: now, updatedAt: now };
      account.customerID = nextCustomerID(account.id, [...users, ...accounts]);
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
      const userAccount = accounts.find(item => item.email === email);
      if (!userAccount || !verifyAccountPassword(password, userAccount.passwordHash)) {
        sendJson(res, 401, { error: "邮箱或密码不正确。" });
        return;
      }
      if (userAccount.status === "disabled") {
        sendJson(res, 403, { error: "该账户已停用，请联系右下角客服。" });
        return;
      }
      if (userAccount.status !== "active") {
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
      const match = validAccountActionToken(payload.token);
      if (!match) {
        sendJson(res, 400, { error: "链接无效或已过期。" });
        return;
      }
      const { account } = match;
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
    await settleReferralRewards();
    const user = account?.linkedUserId ? users.find(item => item.id === account.linkedUserId) : null;
    const wallet = await walletForAccount(account);
    const walletVipLevel = vipLevelForSpend(wallet.vipSpendCents / 100);
    const plan = user ? publicPricing().find(item => item.group === activeUserGroup(user)) : null;
    sendJson(res, 200, {
      customerID: account.customerID,
      email: account.email,
      createdAt: account.createdAt,
      isBusiness: Boolean(user?.isBusiness),
      isFamilyFriend: Boolean(user?.isFamilyFriend),
      isSuperAccount: Boolean(user?.isSuperAccount),
      vipLevel: walletVipLevel,
      vipSpend: wallet.vipSpendCents / 100,
      vipDiscountPercent: vipDiscountPercent(walletVipLevel),
      wallet: publicWallet(wallet),
      referral: {
        code: account.referralCode,
        balance: wallet.referralCents / 100,
        rate: Number(account.referralRate ?? 10),
        recurring: account.recurringReferral === true
      },
      subscription: user ? {
        ...publicDeliveryPayload(user, req),
        id: user.id,
        lineType: isSelfHostedUser(user) ? "self_hosted" : "upstream",
        status: isUserExpired(user) ? "expired" : "active",
        purchasedAt: user.purchasedAt || "",
        duration: user.duration || "",
        unlimited: Boolean(user.unlimited),
        traffic: user.unlimited ? "无限流量" : Number(user.purchasedTrafficGb) > 0 ? `每月 ${user.purchasedTrafficGb} GB` : (plan?.traffic || "-"),
        devices: plan?.[`${user.duration}Devices`] || "-"
      } : null,
      services: accountServiceInstances(account.id),
      trafficPack: (() => { const config = trafficPackConfig(); return { trafficGb: config.trafficGb, price: config.price, enabled: config.product.enabled !== false }; })(),
      homeIp: (() => { const product = pricingProduct("home_ip"); return { enabled: Boolean(product && product.enabled !== false && product.stock !== 0), regions: Array.isArray(product?.addonRegions) ? product.addonRegions : [] }; })(),
      orders: paymentOrders.filter(item => item.accountId === account.id).slice(0, 5).map(publicPaymentOrder),
      announcements: publicAnnouncements()
    });
    return;
  }

  if (pathname === "/api/account/self-hosted-traffic" && req.method === "GET") {
    const session = requireUser(req, res);
    if (!session) return;
    await loadLatestData();
    const account = accountBySession(session);
    const user = account?.linkedUserId ? users.find(item => item.id === account.linkedUserId) : null;
    if (!user || !isSelfHostedUser(user)) {
      sendJson(res, 404, { error: "当前用户不是自研线路套餐。" });
      return;
    }
    if (user.xuiLastTraffic) sendJson(res, 200, user.xuiLastTraffic);
    else sendJson(res, 503, { error: "流量数据正在进行首次同步，请稍后查看。" });
    return;
  }

  if (pathname === "/api/account/orders" && req.method === "GET") {
    const session = requireUser(req, res);
    if (!session) return;
    await loadLatestData();
    sendJson(res, 200, paymentOrders.filter(item => item.accountId === session.accountId).map(publicPaymentOrder));
    return;
  }

  if (pathname === "/api/auth/token-status" && req.method === "POST") {
    await loadLatestData();
    const payload = await readJson(req);
    if (!validAccountActionToken(payload.token)) {
      sendJson(res, 400, { error: "链接无效或已过期。" });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/account/wallet" && req.method === "GET") {
    const session = requireUser(req, res);
    if (!session) return;
    await loadLatestData();
    const account = accountBySession(session);
    const [wallet, entries] = await Promise.all([
      walletForAccount(account),
      dataStore.listWalletEntries(account.id)
    ]);
    sendJson(res, 200, {
      ...publicWallet(wallet),
      paymentMethods: publicPaymentMethods(),
      entries: entries.map(entry => ({
        id: entry.id,
        type: entry.type,
        cashDelta: entry.cashDeltaCents / 100,
        giftDelta: entry.giftDeltaCents / 100,
        vipDelta: entry.vipDeltaCents / 100,
        referralDelta: entry.referralDeltaCents / 100,
        realCashDelta: (entry.cashDeltaCents + entry.referralDeltaCents) / 100,
        virtualCashDelta: entry.giftDeltaCents / 100,
        balance: (entry.cashBalanceCents + entry.giftBalanceCents + entry.referralBalanceCents) / 100,
        sourceId: entry.sourceId,
        description: entry.description,
        createdAt: entry.createdAt
      }))
    });
    return;
  }

  if (pathname === "/api/account/referrals" && req.method === "GET") {
    const session = requireUser(req, res);
    if (!session) return;
    await loadLatestData();
    await settleReferralRewards();
    const account = accountBySession(session);
    const wallet = await walletForAccount(account);
    const accountRewards = referralRewards.filter(item => item.inviterAccountId === account.id);
    const pendingCents = accountRewards.filter(item => item.status === "pending").reduce((sum, item) => sum + Number(item.rewardCents || 0), 0);
    const earnedCents = accountRewards.filter(item => item.status === "available").reduce((sum, item) => sum + Number(item.rewardCents || 0), 0);
    sendJson(res, 200, {
      code: account.referralCode,
      invitedCount: accounts.filter(item => item.referredByAccountId === account.id).length,
      referralBalance: wallet.referralCents / 100,
      pendingAmount: pendingCents / 100,
      earnedAmount: earnedCents / 100,
      referralRate: Number(account.referralRate ?? 10),
      recurringReferral: account.recurringReferral === true,
      rewards: accountRewards.map(item => ({ ...item, baseAmount: item.baseCents / 100, rewardAmount: item.rewardCents / 100 }))
    });
    return;
  }

  if (pathname === "/api/app-meta" && req.method === "GET") {
    sendJson(res, 200, appMeta());
    return;
  }

  if (pathname === "/api/health" && req.method === "GET") {
    const services = {};
    const mailConfig = notifier.getMailerConfig();
    await Promise.all([
      (async () => {
        try {
          if (dataStore.kind !== "postgres") {
            services.database = { status: "ok", kind: "json" };
            return;
          }
          const startedAt = Date.now();
          await dataStore.ping();
          services.database = { status: "ok", latency: Date.now() - startedAt };
        } catch (error) {
          services.database = { status: "error", message: error.message };
        }
      })(),
      (async () => {
        if (!XUI_SERVICE_URL) {
          services.xuiService = { status: "unconfigured" };
          return;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const startedAt = Date.now();
        try {
          const response = await fetch(`${XUI_SERVICE_URL}/health`, { signal: controller.signal });
          services.xuiService = { status: response.ok ? "ok" : "error", latency: Date.now() - startedAt };
        } catch (error) {
          services.xuiService = { status: "error", message: error.message };
        } finally {
          clearTimeout(timer);
        }
      })(),
      (async () => {
        if (!SUB_CONVERTER_URL) {
          services.subconverter = { status: "unconfigured" };
          return;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const startedAt = Date.now();
        try {
          const response = await fetch(`${SUB_CONVERTER_URL}/version`, { signal: controller.signal });
          services.subconverter = { status: response.ok ? "ok" : "error", latency: Date.now() - startedAt, url: SUB_CONVERTER_URL };
        } catch (error) {
          services.subconverter = { status: "error", message: error.message, url: SUB_CONVERTER_URL };
        } finally {
          clearTimeout(timer);
        }
      })(),
      (async () => {
        if (!notifier.isTelegramConfigured()) {
          services.telegram = { status: "unconfigured" };
          return;
        }
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
      })(),
      (async () => {
        if (!mailConfig.resendApiKey) {
          services.resend = { status: "unconfigured" };
          return;
        }
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
      })()
    ]);

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
    const configs = paymentConfigs();
    sendJson(res, 200, {
      platforms: configs.map(config => ({ id: config.id, name: config.name, provider: config.provider, ready: paymentConfigCredentialsReady(config), enabled: config.enabled })),
      paymentMethods: publicPaymentMethods(),
      notifyUrl: `${requestOrigin(req)}/api/payments/callback`
    });
    return;
  }

  if (pathname === "/api/public/pricing" && req.method === "GET") {
    await loadLatestData();
    sendJson(res, 200, publicPricing().filter(item => item.internal !== true));
    return;
  }

  if (pathname === "/api/public/sales-settings" && req.method === "GET") {
    await loadLatestData();
    const settings = currentSalesSettings();
    sendJson(res, 200, { registrationMode: settings.registrationMode, onboardingEnabled: settings.onboardingEnabled, faqs: settings.faqs.filter(item => item.enabled !== false).map(({ id, question, answer }) => ({ id, question, answer })) });
    return;
  }

  const publicReferralMatch = pathname.match(/^\/api\/public\/referrals\/(\d{6})$/);
  if (publicReferralMatch && req.method === "GET") {
    await loadLatestData();
    const inviter = accounts.find(item => item.referralCode === publicReferralMatch[1]);
    if (!inviter) {
      sendJson(res, 404, { error: "邀请码无效" });
      return;
    }
    sendJson(res, 200, { inviterLabel: publicInviterLabel(inviter) });
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

  if (pathname === "/api/payments/callback" && ["GET", "POST"].includes(req.method)) {
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

  if (pathname === "/api/wallet/recharge" && req.method === "POST") {
    const session = requireUser(req, res);
    if (!session) return;
    try {
      const payload = await readJson(req);
      const account = accountBySession(session);
      const order = await createRechargeOrder(payload, req, account);
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
      sendJson(res, 200, await paymentQuoteForAccount(payload, account));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const testPaymentStatusMatch = pathname.match(/^\/api\/payments\/orders\/([^/]+)\/test-status$/);
  if (testPaymentStatusMatch && req.method === "PUT") {
    const session = requireUser(req, res);
    if (!session) return;
    try {
      const order = paymentOrders.find(item => item.id === testPaymentStatusMatch[1] && item.accountId === session.accountId);
      if (!order || order.paymentProvider !== "test") throw new Error("测试支付订单不存在。");
      if (order.status !== "pending") throw new Error("只能设置待付款测试订单的状态。");
      const { status } = await readJson(req);
      if (!["paid", "failed", "closed"].includes(status)) throw new Error("不支持的测试付款状态。");
      order.status = status;
      order.platformStatus = ({ paid: 1, failed: 2, closed: 4 })[status];
      order.paidAt = status === "paid" ? new Date().toISOString() : "";
      order.updatedAt = new Date().toISOString();
      order.paymentError = paymentStatusError(status);
      await savePaymentOrders();
      if (status === "paid") {
        try {
          await fulfillPaymentOrder(order, req);
        } catch (error) {
          order.fulfillmentStatus = "failed";
          order.fulfillmentError = error.message;
          await savePaymentOrders();
        }
      } else await dataStore.releaseWalletHold(order.id);
      sendJson(res, 200, publicPaymentOrder(order));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const publicPaymentOrderMatch = pathname.match(/^\/api\/payments\/orders\/([^/]+)$/);
  if (publicPaymentOrderMatch && req.method === "DELETE") {
    const session = requireUser(req, res);
    if (!session) return;
    try {
      const order = paymentOrders.find(item => item.id === publicPaymentOrderMatch[1] && item.accountId === session.accountId);
      if (!order) {
        sendJson(res, 404, { error: "Payment order not found." });
        return;
      }
      sendJson(res, 200, publicPaymentOrder(await cancelPaymentOrder(order, req)));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }
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
      const config = paymentConfig(order.paymentPlatformId);
      const shouldQueryGateway = order.status === "pending" && order.paymentProvider !== "test" && paymentConfigCredentialsReady(config);
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

  if (pathname === "/api/admin-data" && req.method === "GET") {
    const customerCounts = customerCountBySubscriptionId();
    const subscriptionsById = subscriptionById();
    const usersById = userById();
    const registeredAccounts = accounts
      .filter(account => ["active", "disabled"].includes(account.status) && !userForAccount(account))
      .map(publicRegisteredAccount);
    sendJson(res, 200, {
      subscriptions: subscriptions.map(item => publicItem(item, customerCounts.get(item.id) || 0)),
      users: [...users.map(user => ({ ...publicUser(user, subscriptionsById), userLogs: [] })), ...registeredAccounts],
      bills: bills.map(bill => publicBill(bill, usersById)).sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)),
      vendors,
      presets,
      placeholderNodes,
      embyUsers,
      embyVendors,
      pricing: publicPricing(),
      meta: appMeta()
    });
    return;
  }

  if (pathname === "/api/xui-logs" && req.method === "GET") {
    try {
      const requestUrl = new URL(req.url, "http://localhost");
      const options = Object.fromEntries(requestUrl.searchParams);
      const data = XUI_SERVICE_URL
        ? await requestXuiService({
          serviceUrl: XUI_SERVICE_URL,
          serviceToken: XUI_SERVICE_TOKEN,
          path: `/internal/logs?${requestUrl.searchParams}`,
          timeoutMs: XUI_TIMEOUT_MS
        })
        : await dataStore.listXuiAuditLogs(options);
      sendJson(res, 200, data);
    } catch (error) {
      sendJson(res, error.statusCode || 500, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/xui-clients" && req.method === "GET") {
    try {
      const requestUrl = new URL(req.url, "http://localhost");
      const user = users.find(item => item.id === String(requestUrl.searchParams.get("userId") || ""));
      if (!user) throw Object.assign(new Error("用户不存在。"), { statusCode: 404 });
      const clients = await xuiRequest("/panel/api/clients/list");
      const linkedByEmail = new Map(users.filter(item => item.xuiClientEmail).map(item => [String(item.xuiClientEmail).toLowerCase(), item]));
      const resetDay = chinaDateParts(user.purchasedAt || user.createdAt || Date.now())?.day || 1;
      sendJson(res, 200, { importPreview: {
        email: nexoraUserEmail(user),
        totalBytes: XUI_DEFAULT_TRAFFIC_BYTES,
        limitIp: planDeviceLimit(user),
        expiresAt: user.expiresAt || "",
        resetDay
      }, clients: (Array.isArray(clients) ? clients : []).map(value => {
        const client = normalizeXuiClientResult(value);
        const linked = linkedByEmail.get(client.email.toLowerCase());
        return {
          email: client.email,
          subId: String(client.subId || ""),
          totalBytes: Math.max(0, Number(client.totalGB) || 0),
          usedBytes: client.usedTraffic,
          limitIp: Math.max(0, Number(client.limitIp) || 0),
          expiryTime: Math.max(0, Number(client.expiryTime) || 0),
          enabled: client.enable !== false,
          inboundIds: client.inboundIds,
          linkedUserId: linked?.id || "",
          linkedUserName: linked?.userId || linked?.email || ""
        };
      }).filter(item => item.email) });
    } catch (error) {
      sendJson(res, error.statusCode || 502, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/xui-inbounds" && req.method === "GET") {
    try {
      sendJson(res, 200, await xuiInboundManagementData());
    } catch (error) {
      sendJson(res, 502, { error: error.message });
    }
    return;
  }

  const xuiInboundEnableMatch = pathname.match(/^\/api\/xui-inbounds\/(\d+)\/set-enable$/);
  if (xuiInboundEnableMatch && req.method === "POST") {
    try {
      const payload = await readJson(req);
      const { id, enable } = normalizeXuiInboundEnable(xuiInboundEnableMatch[1], payload.enable);
      await xuiRequest(`/panel/api/inbounds/setEnable/${id}`, { method: "POST", body: { enable } });
      sendJson(res, 200, { id, enabled: enable });
    } catch (error) {
      sendJson(res, error.statusCode === 400 ? 400 : 502, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/xui-inbound-groups" && req.method === "PUT") {
    try {
      const payload = await readJson(req);
      const next = normalizeXuiInboundGroups(payload);
      const management = await xuiInboundManagementData();
      const allInboundIds = management.inbounds.map(inbound => inbound.id);
      const validIds = new Set(allInboundIds);
      const validKeys = new Set(management.inbounds.map(inbound => inbound.key));
      const metadata = Object.fromEntries(Object.entries(normalizeXuiInboundMetadata(payload.metadata === undefined ? management.metadata : payload.metadata)).filter(([key]) => validKeys.has(key)));
      for (const [group, ids] of Object.entries(next)) {
        if (ids.some(id => !validIds.has(id))) throw new Error(`${group.toUpperCase()} 包含不存在的入站。`);
      }
      await setXuiState("inbound-groups", "xuiInboundGroups", { groups: next, metadata });
      const synced = [];
      if (payload.syncGroups !== false) for (const group of USER_GROUPS) synced.push(await syncXuiInboundGroup(group, next[group], allInboundIds));
      sendJson(res, 200, { groups: next, metadata, synced });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/xui-presence" && req.method === "GET") {
    if (!XUI_BASE_URL || !XUI_API_TOKEN) {
      sendJson(res, 200, { configured: false, checkedAt: new Date().toISOString(), onlineEmails: [], onlineByGuid: {}, lastOnline: {}, nodeNames: {} });
      return;
    }
    const state = await getXuiBillingState();
      sendJson(res, 200, { configured: true, ...(state.presence || { checkedAt: "", onlineEmails: [], onlineByGuid: {}, lastOnline: {}, nodeNames: {} }), dailyTraffic: state.dailyTraffic || { date: chinaDateKey(), nodes: {} } });
    return;
  }

  if (pathname === "/api/xui-monitor" && req.method === "GET") {
    if (!XUI_BASE_URL || !XUI_API_TOKEN) {
      sendJson(res, 200, { configured: false, system: null, nodes: [] });
      return;
    }
    try {
      const startedAt = Date.now();
      const [status, nodes, inbounds, onlinesByGuid] = await Promise.all([
        xuiRequest("/panel/api/server/status"),
        xuiRequest("/panel/api/nodes/list"),
        xuiRequest("/panel/api/inbounds/list"),
        xuiRequest("/panel/api/clients/onlinesByGuid", { method: "POST" }).catch(error => {
          console.warn(`[xui-monitor] Failed to read online clients: ${error.message}`);
          return null;
        })
      ]);
      const billing = await getXuiBillingState();
      const monitor = normalizeXuiMonitor(status, nodes);
      const localGuid = String(status?.panelGuid || "node:local");
      const panelUrl = new URL(XUI_BASE_URL);
      const localInbounds = (Array.isArray(inbounds) ? inbounds : []).filter(item => String(item?.originNodeGuid || `node:${item?.nodeId || "local"}`) === localGuid);
      monitor.nodes.unshift({
        id: "local",
        guid: localGuid,
        name: XUI_PANEL_NAME,
        address: panelUrl.hostname,
        port: Number(panelUrl.port) || (panelUrl.protocol === "https:" ? 443 : 80),
        enabled: true,
        status: "online",
        lastHeartbeat: new Date().toISOString(),
        latencyMs: 0,
        cpu: monitor.system.cpu,
        memory: monitor.system.memoryTotal ? monitor.system.memoryUsed / monitor.system.memoryTotal * 100 : 0,
        uptime: monitor.system.uptime,
        uploadBytes: monitor.system.sentBytes,
        downloadBytes: monitor.system.receivedBytes,
        xrayState: monitor.system.xrayState,
        xrayVersion: monitor.system.xrayVersion,
        panelVersion: String(status?.panelVersion || ""),
        inboundCount: localInbounds.length,
        clientCount: new Set(localInbounds.flatMap(item => (item.clientStats || []).map(client => String(client.email || "").toLowerCase()).filter(Boolean))).size,
        onlineCount: 0,
        lastError: ""
      });
      monitor.nodes.forEach(node => {
        const trafficStatus = billing.nodeResults[node.guid] || {};
        node.trafficTokenRequired = node.id !== "local";
        node.trafficConfigured = trafficStatus.configured === true;
        node.trafficError = String(trafficStatus.error || "");
        node.multiplier = xuiMultiplier(billing.multipliers[node.guid]);
        if (onlinesByGuid && Object.prototype.hasOwnProperty.call(onlinesByGuid, node.guid)) {
          node.onlineCount = new Set((Array.isArray(onlinesByGuid[node.guid]) ? onlinesByGuid[node.guid] : []).map(email => String(email).toLowerCase())).size;
        }
      });
      const onlineUsers = onlinesByGuid ? normalizeXuiPresence(onlinesByGuid, {}).onlineEmails.length : null;
      sendJson(res, 200, { configured: true, latency: Date.now() - startedAt, checkedAt: new Date().toISOString(), onlineUsers, ...monitor });
    } catch (error) {
      sendJson(res, 502, { error: error.message });
    }
    return;
  }

  const xuiCredentialsMatch = pathname.match(/^\/api\/xui-monitor\/nodes\/([^/]+)\/credentials$/);
  if (xuiCredentialsMatch && req.method === "PUT") {
    try {
      const payload = await readJson(req);
      const apiToken = String(payload.apiToken || "").trim();
      if (!apiToken || apiToken.length > 4096) throw new Error("请输入有效的节点 API Token。");
      const guid = decodeURIComponent(xuiCredentialsMatch[1]);
      const nodes = await xuiRequest("/panel/api/nodes/list");
      if (!(Array.isArray(nodes) ? nodes : []).some(node => String(node?.guid) === guid)) throw new Error("节点不存在。");
      await withXuiBillingLock(async () => {
        const state = await getXuiBillingState();
        state.nodeTokens[guid] = sealXuiNodeToken(apiToken);
        await saveXuiBillingState(state);
      });
      sendJson(res, 200, { ok: true, guid, configured: true });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const xuiNodeSettingsMatch = pathname.match(/^\/api\/xui-monitor\/nodes\/([^/]+)\/settings$/);
  if (xuiNodeSettingsMatch && req.method === "PUT") {
    try {
      const payload = await readJson(req);
      const multiplier = Number(payload.multiplier);
      if (payload.multiplier === "" || !Number.isFinite(multiplier) || multiplier < 0 || multiplier > 100) throw new Error("节点倍率必须在 0 到 100 之间。");
      const guid = decodeURIComponent(xuiNodeSettingsMatch[1]);
      const [status, nodes] = await Promise.all([xuiRequest("/panel/api/server/status"), xuiRequest("/panel/api/nodes/list")]);
      const localGuid = String(status?.panelGuid || "node:local");
      if (guid !== localGuid && !(Array.isArray(nodes) ? nodes : []).some(node => String(node?.guid) === guid)) throw new Error("节点不存在。");
      const apiToken = String(payload.apiToken || "").trim();
      if (apiToken.length > 4096) throw new Error("节点 API Token 无效。");
      await withXuiBillingLock(async () => {
        const state = await getXuiBillingState();
        state.multipliers[guid] = multiplier;
        if (apiToken) state.nodeTokens[guid] = sealXuiNodeToken(apiToken);
        await saveXuiBillingState(state);
      });
      sendJson(res, 200, { ok: true, guid, multiplier, configured: guid === localGuid || apiToken ? true : undefined });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/markdown/images" && req.method === "POST") {
    try {
      const contentLength = Number(req.headers["content-length"] || 0);
      if (!contentLength || contentLength > MARKDOWN_IMAGE_MAX_BYTES) throw new Error("请选择不超过 8MB 的图片。");
      const content = await readBuffer(req, MARKDOWN_IMAGE_MAX_BYTES);
      const extension = imageExtension(content);
      if (!extension) throw new Error("仅支持 PNG、JPEG、WebP 和 GIF 图片。");
      await fs.mkdir(MARKDOWN_UPLOAD_DIR, { recursive: true });
      const filename = `${crypto.randomUUID()}${extension}`;
      await fs.writeFile(path.join(MARKDOWN_UPLOAD_DIR, filename), content, { flag: "wx" });
      sendJson(res, 201, { url: `/uploads/markdown/${filename}` });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

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

  if (pathname === "/api/payment-settings" && req.method === "GET") {
    sendJson(res, 200, publicPaymentSettings());
    return;
  }

  if (pathname === "/api/payment-settings" && req.method === "POST") {
    try {
      const next = normalizePaymentSettings(await readJson(req));
      paymentSettings.push(next);
      await savePaymentSettings();
      sendJson(res, 201, publicPaymentSettings().find(item => item.id === next.id));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const paymentSettingsMatch = pathname.match(/^\/api\/payment-settings\/([^/]+)$/);
  if (paymentSettingsMatch && req.method === "PUT") {
    try {
      const index = paymentSettings.findIndex(item => item.id === paymentSettingsMatch[1]);
      const current = index >= 0 ? paymentSettings[index] : paymentConfigs().find(item => item.id === paymentSettingsMatch[1]);
      if (!current) throw Object.assign(new Error("支付平台不存在。"), { statusCode: 404 });
      const next = normalizePaymentSettings(await readJson(req), current);
      if (index >= 0) paymentSettings[index] = next;
      else paymentSettings.push(next);
      await savePaymentSettings();
      sendJson(res, 200, publicPaymentSettings().find(item => item.id === next.id));
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: error.message });
    }
    return;
  }

  if (paymentSettingsMatch && req.method === "DELETE") {
    const index = paymentSettings.findIndex(item => item.id === paymentSettingsMatch[1]);
    if (index < 0) sendJson(res, 404, { error: "支付平台不存在。" });
    else {
      paymentSettings.splice(index, 1);
      await savePaymentSettings();
      sendJson(res, 200, { ok: true });
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
      if (["active", "disabled"].includes(account?.status)) {
        sendJson(res, 409, { error: "该用户已经认领账户。" });
        return;
      }
      const now = new Date().toISOString();
      if (!account) {
        account = { id: crypto.randomUUID(), customerID: user.customerID, email, passwordHash: "", status: "invited", linkedUserId: user.id, createdAt: now, updatedAt: now };
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
      ignoredUserId: payload.ignoredUserId || "",
      group: payload.group || ""
    });
    sendJson(res, 200, {
      subscription: recommendation.subscription ? publicItem(recommendation.subscription) : null,
      reason: recommendation.reason,
      recommendation: recommendation.details || null,
      expiresAt
    });
    return;
  }


  if (pathname === "/api/users" && req.method === "GET") {
    await loadLatestData();
    const subscriptionsById = subscriptionById();
    const registeredAccounts = accounts
      .filter(account => ["active", "disabled"].includes(account.status) && !userForAccount(account))
      .map(publicRegisteredAccount);
    sendJson(res, 200, [...users.map(user => publicUser(user, subscriptionsById)), ...registeredAccounts]);
    return;
  }

  if (["/api/admin/manual-payments/quote", "/api/admin/manual-payments"].includes(pathname) && req.method === "POST") {
    try {
      const payload = await readJson(req);
      const account = accounts.find(item => item.id === String(payload.accountId || "") && item.status === "active");
      if (!account) throw new Error("只有已启用的认领账户可以人工收款。");
      const input = { ...payload, useBalance: false };
      if (pathname.endsWith("/quote")) {
        sendJson(res, 200, await paymentQuoteForAccount(input, account));
      } else {
        const order = await createPaymentOrder(input, req, account, "manual");
        sendJson(res, 201, adminPaymentOrder(order));
      }
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/admin/orders" && req.method === "GET") {
    sendJson(res, 200, paymentOrders.map(adminPaymentOrder).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    return;
  }

  const adminOrderReverseMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/reverse$/);
  if (adminOrderReverseMatch && req.method === "POST") {
    await loadLatestData({ force: true });
    const order = paymentOrders.find(item => item.id === adminOrderReverseMatch[1]);
    if (!order) {
      sendJson(res, 404, { error: "没有找到这个订单。" });
      return;
    }
    try {
      await reversePaymentOrder(order);
      sendJson(res, 200, adminPaymentOrder(order));
    } catch (error) {
      order.reversalError = error.message;
      order.updatedAt = new Date().toISOString();
      await savePaymentOrders();
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const adminOrderMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if (adminOrderMatch && req.method === "PUT") {
    const order = paymentOrders.find(item => item.id === adminOrderMatch[1]);
    if (!order) { sendJson(res, 404, { error: "没有找到这个订单。" }); return; }
    if (order.status !== "paid" || order.fulfillmentStatus !== "manual_pending") { sendJson(res, 400, { error: "该订单没有待交付的人工服务。" }); return; }
    try {
      const payload = await readJson(req);
      const deliveryNote = String(payload.deliveryNote || "").trim();
      if (!deliveryNote) throw new Error("请填写交付说明。");
      order.deliveryNote = deliveryNote.slice(0, 1000);
      order.fulfillmentStatus = "fulfilled";
      order.fulfilledAt = new Date().toISOString();
      order.updatedAt = order.fulfilledAt;
      const user = users.find(item => item.id === order.userId);
      if (user) {
        appendUserLogToUser(user, createUserLog({ event: "user-action", status: "recorded", reason: "addon-delivered", req, message: `附加服务已完成交付：${order.addOnSnapshots?.map(item => item.name).join("、") || order.planName}`, details: { paymentOrderId: order.id, merOrderTid: order.merOrderTid, deliveryNote: order.deliveryNote, addOns: order.addOnSnapshots || [] } }));
        await saveUsers();
      }
      await savePaymentOrders();
      sendJson(res, 200, adminPaymentOrder(order));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }
  if (adminOrderMatch && req.method === "POST") {
    // A failed fulfillment may have already mutated the in-memory snapshot.
    // Always retry from the last successfully persisted state.
    await loadLatestData({ force: true });
    const order = paymentOrders.find(item => item.id === adminOrderMatch[1]);
    if (!order) {
      sendJson(res, 404, { error: "没有找到这个订单。" });
      return;
    }
    if (order.status !== "paid") {
      sendJson(res, 400, { error: "只有已付款订单可以重新发放。" });
      return;
    }
    try {
      await fulfillPaymentOrder(order, req);
      sendJson(res, 200, adminPaymentOrder(order));
    } catch (error) {
      order.fulfillmentStatus = "failed";
      order.fulfillmentError = error.message;
      order.updatedAt = new Date().toISOString();
      await savePaymentOrders();
      sendJson(res, 400, { error: error.message });
    }
    return;
  }
  if (adminOrderMatch && req.method === "GET") {
    const order = paymentOrders.find(item => item.id === adminOrderMatch[1]);
    if (!order) {
      sendJson(res, 404, { error: "没有找到这个订单。" });
      return;
    }
    sendJson(res, 200, adminPaymentOrder(order));
    return;
  }

  if (pathname === "/api/bills" && req.method === "GET") {
    await loadLatestData();
    const usersById = userById();
    sendJson(res, 200, bills.map(bill => publicBill(bill, usersById)).sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)));
    return;
  }

  const referralAccountMatch = pathname.match(/^\/api\/referrals\/accounts\/([^/]+)$/);
  if (referralAccountMatch && req.method === "PUT") {
    if (!requireAdmin(req, res)) return;
    try {
      const account = accounts.find(item => item.id === referralAccountMatch[1]);
      if (!account) throw new Error("账户不存在");
      const payload = await readJson(req);
      const rate = Number(payload.referralRate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("返利比例必须在 0 到 100 之间");
      account.referralRate = rate;
      account.recurringReferral = payload.recurringReferral === true;
      account.updatedAt = new Date().toISOString();
      await saveAccounts();
      sendJson(res, 200, { ok: true, referralRate: rate, recurringReferral: account.recurringReferral });
    } catch (error) { sendJson(res, 400, { error: error.message }); }
    return;
  }

  if (pathname === "/api/users" && req.method === "POST") {
    try {
      const payload = await readJson(req);
      if (payload.lineType !== "self_hosted" || payload.subscriptionId) throw new Error("池 URL 分配入口已停用，请创建自研线路用户。");
      const item = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString()
      };
      const normalized = normalizeUser(payload, item);
      const productBinding = inferUserProductBinding(normalized);
      if (productBinding.error) throw new Error(productBinding.error);
      bindUserProduct(normalized, productBinding, { source: productBinding.productId === FRIENDS_PRODUCT_ID ? "family_friend_grant" : "admin_create" });
      if (productBinding.productId === FRIENDS_PRODUCT_ID) { normalized.lineType = "self_hosted"; normalized.subscriptionId = ""; }
      const selectedSubscription = subscriptions.find(entry => entry.id === normalized.subscriptionId);
      if (selectedSubscription && subscriptionAtCapacity(selectedSubscription) && payload.allowFull !== true) throw new Error("该URL使用人数已满，请勾选使用满人池。");
      normalized.outputMode = userOutputMode(payload);
      normalized.blockUserinfo = isSelfHostedUser(normalized) ? false : payload.blockUserinfo !== false;
      users.unshift(normalized);
      try {
        if (isSelfHostedUser(normalized)) await provisionXuiClient(normalized);
      } catch (error) {
        users = users.filter(entry => entry.id !== normalized.id);
        throw error;
      }
      if (productBinding.productId === FRIENDS_PRODUCT_ID) {
        const grantOrder = familyGrantOrder(normalized, productBinding, new Date().toISOString());
        paymentOrders.unshift(grantOrder);
        normalized.currentProductOrderId = grantOrder.id;
        await savePaymentOrders();
      }
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
      if (payload.rating && !normalizeVendorRating(payload.rating)) { sendJson(res, 400, { error: "供应商评级必须是 S、A、B 或 C。" }); return; }
      if (!name) { sendJson(res, 400, { error: "供应商名称不能为空。" }); return; }
      if (vendors.find(v => v.name === name)) { sendJson(res, 400, { error: "供应商已存在。" }); return; }
      const vendor = {
        id: `vendor-${Date.now()}`,
        name,
        overrideExclude: String(payload.overrideExclude || "").trim(),
        overrideInclude: String(payload.overrideInclude || "").trim(),
        overrideRename: String(payload.overrideRename || "").trim(),
        rating: payload.rating === undefined ? "C" : normalizeVendorRating(payload.rating)
      };
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
      if (payload.rating !== undefined) {
        const rating = normalizeVendorRating(payload.rating);
        if (payload.rating && !rating) { sendJson(res, 400, { error: "供应商评级必须是 S、A、B 或 C。" }); return; }
        vendor.rating = rating;
      }
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
      preset.postSubconverter = payload.postSubconverter === undefined ? true : Boolean(payload.postSubconverter);
      preset.nextinCompatible = payload.nextinCompatible === true;
      for (const [key, defaultValue] of Object.entries(SUBCONVERTER_BOOLEAN_DEFAULTS)) {
        preset[key] = payload[key] === undefined ? defaultValue : Boolean(payload[key]);
      }
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
      const DURATIONS = ["monthly", "quarterly", "half_yearly", "yearly"];
      const UNLIMITED_PRICE_KEYS = { monthly: "unlimitedMonthly", quarterly: "unlimitedQuarterly", half_yearly: "unlimitedHalfYearly", yearly: "unlimitedYearly" };
      const TEXT_FIELDS = ["name", "title", "description", "traffic", "lifetimeName", "lifetimeTitle", "lifetimeDescription", "lifetimeTraffic", "addonUnit", "addonDeliveryDescription"];
      const nextPricing = [];
      for (const item of payload) {
        const group = String(item.group || "").trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(group)) { sendJson(res, 400, { error: "商品标识必须为 2-32 位小写字母、数字、下划线或短横线。" }); return; }
        if (nextPricing.some(row => row.group === group)) { sendJson(res, 400, { error: `商品标识 ${group} 重复。` }); return; }
        const existing = pricing.find(row => row.group === group) || DEFAULT_PRICING.find(row => row.group === group) || {};
        const row = { ...existing, id: group, group };
        row.productKind = ["addon", "custom"].includes(item.productKind) ? item.productKind : "plan";
        row.lineType = row.productKind === "plan" ? "self_hosted" : undefined;
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
        row.enabled = item.enabled !== false;
        row.recurringDeleted = Boolean(item.recurringDeleted);
        if (row.productKind === "plan" && item.recurringDeleted !== true) {
          for (const [field, fallback] of [["trafficBaseGb", 0], ["trafficMaxTier", 10], ["trafficTierMarkupPercent", 50]]) {
            const value = Number(item[field] ?? fallback);
            const valid = field === "trafficMaxTier" ? Number.isSafeInteger(value) && value >= 1 && value <= 50 : field === "trafficBaseGb" ? Number.isFinite(value) && value > 0 : Number.isFinite(value) && value >= 0;
            if (!valid) { sendJson(res, 400, { error: `${group}.${field} 无效。` }); return; }
            row[field] = value;
          }
        }
        if (["addon", "custom"].includes(row.productKind)) {
          const addonPrice = Number(item.addonPrice);
          if (!Number.isFinite(addonPrice) || addonPrice < 0) { sendJson(res, 400, { error: `${group}.addonPrice 价格无效。` }); return; }
          row.addonPrice = addonPrice;
          row.addonType = ["traffic_pack", "home_ip", "manual"].includes(item.addonType) ? item.addonType : "manual";
          const addonTrafficGb = Number(item.addonTrafficGb || 0);
          const addonDurationDays = Number(item.addonDurationDays || 0);
          if (!Number.isFinite(addonTrafficGb) || addonTrafficGb < 0) { sendJson(res, 400, { error: `${group}.addonTrafficGb 无效。` }); return; }
          if (!Number.isSafeInteger(addonDurationDays) || addonDurationDays < 0) { sendJson(res, 400, { error: `${group}.addonDurationDays 无效。` }); return; }
          row.addonTrafficGb = addonTrafficGb;
          row.addonDurationDays = addonDurationDays;
          row.addonRegions = Array.isArray(item.addonRegions) ? item.addonRegions.map(region => ({ id: String(region.id || "").trim().toLowerCase(), name: String(region.name || "").trim().slice(0, 30), price: Number(region.price) })).filter(region => /^[a-z0-9_-]{1,24}$/.test(region.id) && region.name && Number.isFinite(region.price) && region.price >= 0).slice(0, 30) : [];
          row.addonDeliveryMode = item.addonDeliveryMode === "automatic" ? "automatic" : "manual";
        }
        if (item.stock === undefined || item.stock === null || item.stock === "") delete row.stock;
        else {
          const stock = Number(item.stock);
          if (!Number.isSafeInteger(stock) || stock < 0) { sendJson(res, 400, { error: `${group}.stock 库存无效。` }); return; }
          row.stock = stock;
        }
        for (const field of ["lifetimePrice", "lifetimeDevices", "lifetimeTrafficBytes"]) {
          if (item[field] === undefined) continue;
          const value = Number(item[field]);
          if (!Number.isFinite(value) || value < 0 || (field !== "lifetimePrice" && !Number.isSafeInteger(value))) { sendJson(res, 400, { error: `${group}.${field} 无效。` }); return; }
          row[field] = value;
        }
        row.lifetimeEnabled = item.lifetimeEnabled !== false;
        row.lifetimeRecommended = Boolean(item.lifetimeRecommended);
        row.lifetimeDeleted = Boolean(item.lifetimeDeleted);
        if (item.lifetimeStock === undefined || item.lifetimeStock === null || item.lifetimeStock === "") delete row.lifetimeStock;
        else {
          const lifetimeStock = Number(item.lifetimeStock);
          if (!Number.isSafeInteger(lifetimeStock) || lifetimeStock < 0) { sendJson(res, 400, { error: `${group}.lifetimeStock 库存无效。` }); return; }
          row.lifetimeStock = lifetimeStock;
        }
        row.features = Array.isArray(item.features) ? item.features.map(value => String(value).trim()).filter(Boolean).slice(0, 10) : [];
        row.unavailableFeatures = Array.isArray(item.unavailableFeatures) ? item.unavailableFeatures.map(value => String(value).trim()).filter(Boolean).slice(0, 10) : [];
        row.lifetimeFeatures = Array.isArray(item.lifetimeFeatures) ? item.lifetimeFeatures.map(value => String(value).trim()).filter(Boolean).slice(0, 10) : [];
        row.lifetimeUnavailableFeatures = Array.isArray(item.lifetimeUnavailableFeatures) ? item.lifetimeUnavailableFeatures.map(value => String(value).trim()).filter(Boolean).slice(0, 10) : [];
        nextPricing.push(row);
      }
      for (const product of DEFAULT_PRICING.filter(item => item.internal === true && !nextPricing.some(row => row.group === item.group))) nextPricing.push(structuredClone(product));
      pricing = nextPricing;
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

  if (pathname === "/api/users/batch-gift" && req.method === "POST") {
    try {
      const payload = await readJson(req);
      const targets = batchGiftTargets(payload);
      const unavailable = targets.filter(target => !target.toSubscription);
      if (payload.preview === true) {
        sendJson(res, 200, {
          eligibleCount: targets.length,
          readyCount: targets.length,
          unavailableCount: unavailable.length,
          unavailableUsers: unavailable.map(target => target.user.userId || target.user.email || target.user.id),
          days: Number(payload.days),
          group: ["basic", "pro", "ultra"].includes(String(payload.group)) ? String(payload.group) : ""
        });
        return;
      }
      const batchId = crypto.randomUUID();
      for (const target of targets) {
        const { user, toSubscription, expiresAt, giftDays } = target;
        const beforeExpiresAt = user.expiresAt || null;
        const fromSubscription = subscriptions.find(entry => entry.id === user.subscriptionId) || null;
        user.planExpiresAt ||= beforeExpiresAt;
        user.giftedDays = (Number(user.giftedDays) || 0) + giftDays;
        user.expiresAt = expiresAt;
        if (toSubscription) user.subscriptionId = toSubscription.id;
        user.updatedAt = new Date().toISOString();
        appendUserLogToUser(user, createUserLog({
          event: "user-action",
          status: "recorded",
          reason: "user-gifted",
          fromSubscription,
          toSubscription,
          req,
          message: userActionMessage("user-gifted", { days: giftDays, beforeExpiresAt, afterExpiresAt: expiresAt }),
          details: { days: giftDays, beforeExpiresAt, afterExpiresAt: expiresAt, batchId }
        }));
      }
      await saveUsers();
      sendJson(res, 200, { batchId, updatedCount: targets.length });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)(?:\/(renew|pool|gift|wallet|wallet-gift|account-status|type|line|xui|xui-recover))?$/);
  if (userMatch) {
    const id = userMatch[1];
    const action = userMatch[2];
    const item = users.find(entry => entry.id === id);
    const registeredAccount = id.startsWith("account:")
      ? accounts.find(entry => entry.id === id.slice("account:".length))
      : null;
    if (!item && !registeredAccount) {
      sendJson(res, 404, { error: "没有找到这个用户。" });
      return;
    }

    if (!action && req.method === "GET") {
      sendJson(res, 200, registeredAccount
        ? publicRegisteredAccount(registeredAccount)
        : { ...publicUser(item), poolCompatibility: currentPoolCompatibility(item) });
      return;
    }

    if (action === "wallet" && req.method === "GET") {
      try {
        const account = registeredAccount || accounts.find(entry => entry.linkedUserId === item.id && entry.status === "active");
        if (!account) throw new Error("用户尚未认领账户。");
        sendJson(res, 200, publicWallet(await walletForAccount(account)));
      } catch (error) {
        sendJson(res, 200, { availableBalance: 0, balance: 0, error: error.message });
      }
      return;
    }

    if (action === "renew" && req.method === "POST") {
      const previousUserState = structuredClone(item);
      try {
        if (userHasClaimedAccount(item.id)) throw new Error("已认领用户只能通过自主购买变更付款信息。");
        const payload = await readJson(req);
        const before = userSnapshotForLog(item);
        const fromSubscription = subscriptions.find(entry => entry.id === item.subscriptionId);
        if (payload.outputMode !== undefined) item.outputMode = userOutputMode(payload);
        if (isSelfHostedUser(item)) item.blockUserinfo = false;
        else if (payload.blockUserinfo !== undefined) item.blockUserinfo = payload.blockUserinfo !== false;
        const renewal = renewUser(item, payload);
        if (isSelfHostedUser(item)) await provisionXuiClient(item);
        else if (item.xuiClientEmail) await disableXuiClient(item);
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
        const renewalLog = createUserLog({
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
        });
        appendUserLogToUser(item, renewalLog);
        const productBinding = inferUserProductBinding(item);
        if (productBinding.error) throw new Error(productBinding.error);
        bindUserProduct(item, productBinding, { source: "admin_renewal" });
        renewalLog.details.after = userSnapshotForLog(item);
        await saveUsers();
        await saveBills();
        sendJson(res, 200, publicUser(item));
      } catch (error) {
        Object.keys(item).forEach(key => delete item[key]);
        Object.assign(item, previousUserState);
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (action === "gift" && req.method === "POST") {
      const previousUserState = structuredClone(item);
      try {
        const payload = await readJson(req);
        const expiresAt = calculateGiftExpiry(item, payload.days);
        if (!expiresAt) throw new Error("请输入正确的赠送天数。");
        const selfHosted = isSelfHostedUser(item);
        const recommendation = selfHosted
          ? { subscription: null, reason: "自研线路不使用订阅池。", details: null }
          : recommendSubscriptionForExpiry(expiresAt, { ignoredUserId: item.id, group: poolSelectionGroup(item) });
        if (payload.preview === true) {
          sendJson(res, 200, {
            expiresAt,
            subscription: recommendation.subscription ? publicItem(recommendation.subscription) : null,
            reason: recommendation.reason,
            recommendation: recommendation.details || null
          });
          return;
        }
        const toSubscription = selfHosted ? null : subscriptions.find(entry => entry.id === String(payload.subscriptionId || recommendation.subscription?.id || ""));
        if (!selfHosted && !toSubscription) throw new Error("请选择有效的订阅池。");
        if (!selfHosted && !subscriptionAllowsGroup(toSubscription, poolSelectionGroup(item))) throw new Error("该订阅池不允许当前用户套餐等级。");
        if (!selfHosted && ((toSubscription.enabled === false && payload.allowDisabled !== true) || !subscriptionCanBeManuallyAssigned(toSubscription))) throw new Error("请选择已启用且未过期的订阅池，或有效的手动 Base64 池。");
        const fromSubscription = subscriptions.find(entry => entry.id === item.subscriptionId) || null;
        if (!selfHosted && fromSubscription?.id !== toSubscription.id && subscriptionAtCapacity(toSubscription, item.id) && payload.allowFull !== true) throw new Error("该URL使用人数已满，请勾选使用满人池。");
        const beforeExpiresAt = item.expiresAt || null;
        item.planExpiresAt ||= beforeExpiresAt;
        item.giftedDays = (Number(item.giftedDays) || 0) + Number(payload.days);
        item.expiresAt = expiresAt;
        if (!selfHosted) item.subscriptionId = toSubscription.id;
        item.updatedAt = new Date().toISOString();
        if (selfHosted) await provisionXuiClient(item);
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
        Object.keys(item).forEach(key => delete item[key]);
        Object.assign(item, previousUserState);
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (action === "wallet-gift" && req.method === "POST") {
      try {
        const account = accounts.find(entry => entry.linkedUserId === item.id && entry.status === "active");
        if (!account) throw new Error("用户需要先认领账户才能赠送余额。");
        const payload = await readJson(req);
        const amountCents = moneyCents(payload.amount, "赠送金额");
        if (amountCents > 1000000) throw new Error("单次赠送不能超过 ¥10,000.00。");
        const note = String(payload.note || "").trim().slice(0, 100);
        const sourceId = crypto.randomUUID();
        const wallet = await dataStore.creditWalletGift({
          id: crypto.randomUUID(),
          accountId: account.id,
          sourceId,
          amountCents,
          description: note ? `后台赠送：${note}` : "后台赠送余额",
          idempotencyKey: `admin-gift:${sourceId}`,
          initialVipCents: initialWalletVipCents(account)
        });
        sendJson(res, 200, publicWallet(wallet));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (action === "account-status" && req.method === "POST") {
      try {
        const account = registeredAccount || accounts.find(entry => entry.linkedUserId === item.id);
        if (!account || !["active", "disabled"].includes(account.status)) throw new Error("该用户尚未认领账户。");
        const payload = await readJson(req);
        const disabling = payload.disabled === true;
        const previousStatus = account.status;
        account.status = disabling ? "disabled" : "active";
        try {
          if (disabling && item?.xuiClientEmail) {
            await disableXuiClient(item);
            await saveUsers();
          } else if (!disabling && item && isSelfHostedUser(item)) {
            await provisionXuiClient(item);
            await saveUsers();
          }
        } catch (error) {
          account.status = previousStatus;
          throw error;
        }
        account.updatedAt = new Date().toISOString();
        await saveAccounts();
        sendJson(res, 200, registeredAccount ? publicRegisteredAccount(account) : publicUser(item));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (action === "type" && req.method === "POST") {
      try {
        if (!item) throw new Error("未开通订阅的账户不能设置用户类型。");
        const payload = await readJson(req);
        const type = String(payload.type || "");
        if (!["regular", "family", "business", "super"].includes(type)) throw new Error("请选择有效的用户类型。");
        const before = userSnapshotForLog(item);
        item.isFamilyFriend = type === "family";
        item.isBusiness = type === "business";
        item.isSuperAccount = type === "super";
        item.updatedAt = new Date().toISOString();
        const changes = summarizeUserChanges(before, userSnapshotForLog(item));
        if (changes.length) appendUserLogToUser(item, createUserLog({ event: "user-action", status: "recorded", reason: "user-updated", req, message: userActionMessage("user-updated", { changes }), details: { changes } }));
        await saveUsers();
        sendJson(res, 200, publicUser(item));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (action === "xui" && req.method === "POST") {
      const previous = item ? structuredClone(item) : null;
      try {
        if (!item) throw new Error("未开通订阅的账户不能切换自研线路。");
        const payload = await readJson(req);
        const group = normalizeUserGroup(payload.activeGroup, "");
        if (!["basic", "pro", "ultra"].includes(group)) throw new Error("请选择有效的套餐分组。");
        const importedIpLimit = planDeviceLimit(item);
        const before = userSnapshotForLog(item);
        Object.assign(item, { group, activeGroup: group, updatedAt: new Date().toISOString() });
        await connectXuiClient(item, { mode: String(payload.mode || ""), email: payload.clientEmail, importedIpLimit });
        const changes = summarizeUserChanges(before, userSnapshotForLog(item));
        appendUserLogToUser(item, createUserLog({ event: "user-action", status: "recorded", reason: "user-updated", req, message: payload.mode === "link" ? "关联已有3x-ui Client并切换到自研线路" : "导入3x-ui并切换到自研线路", details: { changes, xuiManagementMode: item.xuiManagementMode, xuiClientEmail: item.xuiClientEmail } }));
        await saveUsers();
        sendJson(res, 200, publicUser(item));
      } catch (error) {
        if (item && previous) {
          Object.keys(item).forEach(key => delete item[key]);
          Object.assign(item, previous);
        }
        sendJson(res, error.statusCode || 400, { error: error.message });
      }
      return;
    }

    if (action === "xui-recover" && req.method === "POST") {
      const previous = item ? structuredClone(item) : null;
      try {
        if (!item || !isSelfHostedUser(item)) throw new Error("仅自研线路用户可以恢复3x-ui Client。");
        if (isUserExpired(item)) throw new Error("套餐已过期，不能恢复3x-ui Client。");
        if (isUserAccountDisabled(item)) throw new Error("账户已停用，不能恢复3x-ui Client。");
        if (!item.xuiClientEmail) throw new Error("用户尚未关联3x-ui Client。");
        const previousSubId = item.xuiSubId || "";
        const remote = await provisionXuiClient(item, { allowLegacyEmail: false });
        item.xuiClientPresent = true;
        item.xuiRecoveredAt = new Date().toISOString();
        item.xuiLastSyncedAt = item.xuiRecoveredAt;
        item.xuiLastError = "";
        delete item.xuiClientMissingAt;
        appendUserLogToUser(item, createUserLog({
          event: "user-action",
          status: "recorded",
          reason: "xui-client-recovered",
          req,
          stage: "xui-recovery",
          message: "已恢复被删除的3x-ui Client。",
          details: { email: item.xuiClientEmail, previousSubId, newSubId: item.xuiSubId || remote.subId || "", trafficLimitBytes: item.xuiTrafficLimitBytes, resetAnchorDay: item.xuiTrafficResetAnchorDay, nextResetAt: item.xuiNextTrafficResetAt, flow: XUI_VISION_FLOW, inboundIds: item.xuiInboundIds || [] }
        }));
        await saveUsers();
        sendJson(res, 200, publicUser(item));
      } catch (error) {
        if (item && previous) {
          Object.keys(item).forEach(key => delete item[key]);
          Object.assign(item, previous);
        }
        sendJson(res, error.statusCode || 400, { error: error.message });
      }
      return;
    }

    if (action === "line" && req.method === "POST") {
      const previous = item ? structuredClone(item) : null;
      try {
        if (!item) throw new Error("未开通订阅的账户不能迁移线路。");
        const payload = await readJson(req);
        const lineType = String(payload.lineType || "");
        if (lineType === "upstream") throw Object.assign(new Error("池 URL 分配入口已停用。"), { statusCode: 410 });
        const group = normalizeUserGroup(payload.activeGroup, "");
        if (!["upstream", "self_hosted"].includes(lineType) || !group) throw new Error("请选择有效的线路类型和套餐分组。");
        const before = userSnapshotForLog(item);
        if (lineType === "self_hosted") {
          Object.assign(item, { lineType, group, activeGroup: group, subscriptionId: "", updatedAt: new Date().toISOString() });
          await provisionXuiClient(item);
        } else {
          const subscription = subscriptions.find(entry => entry.id === String(payload.subscriptionId || ""));
          if (!subscription || !subscriptionAllowsGroup(subscription, group)) throw new Error("请选择允许该套餐使用的订阅池。");
          Object.assign(item, { lineType, group, activeGroup: group, subscriptionId: subscription.id, updatedAt: new Date().toISOString() });
          if (item.xuiClientEmail) await disableXuiClient(item);
        }
        const changes = summarizeUserChanges(before, userSnapshotForLog(item));
        if (changes.length) appendUserLogToUser(item, createUserLog({ event: "user-action", status: "recorded", reason: "user-updated", req, message: userActionMessage("user-updated", { changes }), details: { changes } }));
        await saveUsers();
        sendJson(res, 200, publicUser(item));
      } catch (error) {
        if (item && previous) {
          Object.keys(item).forEach(key => delete item[key]);
          Object.assign(item, previous);
        }
        sendJson(res, error.statusCode || 400, { error: error.message });
      }
      return;
    }

    if (action === "pool" && req.method === "POST") {
      sendJson(res, 410, { error: "池 URL 分配入口已停用。" });
      return;
    }

    if (action) {
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    if (req.method === "PUT") {
      const previousUserState = structuredClone(item);
      try {
        const payload = await readJson(req);
        if (userHasClaimedAccount(item.id)) throw new Error("已认领账户仅允许换池或赠送时长。");
        if (payload.lineType === "upstream" || (payload.subscriptionId !== undefined && String(payload.subscriptionId || "") !== String(item.subscriptionId || ""))) throw new Error("池 URL 分配入口已停用。");
        const linkedAccount = accounts.find(account => account.linkedUserId === item.id);
        const before = userSnapshotForLog(item);
        const fromSubscription = subscriptions.find(entry => entry.id === item.subscriptionId);
        const normalized = normalizeUser(payload, item);
        const productBinding = inferUserProductBinding(normalized);
        if (productBinding.error) throw new Error(productBinding.error);
        bindUserProduct(normalized, productBinding, { source: "admin_update", orderId: item.currentProductOrderId || "" });
        const toSubscription = subscriptions.find(entry => entry.id === normalized.subscriptionId);
        if (fromSubscription?.id !== toSubscription?.id && toSubscription && subscriptionAtCapacity(toSubscription, item.id) && payload.allowFull !== true) throw new Error("该URL使用人数已满，请勾选使用满人池。");
        Object.assign(item, normalized);
        if (isSelfHostedUser(item)) await provisionXuiClient(item);
        else if (item.xuiClientEmail) await disableXuiClient(item);
        if (payload.outputMode !== undefined) item.outputMode = userOutputMode(payload);
        if (isSelfHostedUser(item)) item.blockUserinfo = false;
        else if (payload.blockUserinfo !== undefined) item.blockUserinfo = payload.blockUserinfo !== false;
        const after = userSnapshotForLog(item);
        const changes = summarizeUserChanges(before, after);
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
        Object.keys(item).forEach(key => delete item[key]);
        Object.assign(item, previousUserState);
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === "DELETE") {
      if (userHasClaimedAccount(item.id)) {
        sendJson(res, 400, { error: "已认领账户不能删除。" });
        return;
      }
      if (isSelfHostedUser(item)) {
        try {
          await disableXuiClient(item);
        } catch (error) {
          sendJson(res, 502, { error: `3x-ui 用户停用失败，未删除本地用户：${error.message}` });
          return;
        }
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
    if (isManualSubscription(item)) {
      try {
        const body = normalizeManualContent(item);
        sendJson(res, 200, [{ client: subscriptionSourceType(item) === "yaml" ? "manual-yaml" : "manual-base64", status: 200, bodyLength: body.length }]);
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
    } else {
      sendJson(res, 200, await debugSubscription(item.url));
    }
    return;
  }

  if (pathname.endsWith("/cache") && req.method === "GET") {
    const url = new URL(`http://x${req.url}`);
    const force = url.searchParams.get("force") === "true";

    try {
      const wasFresh = !force && cacheIsFresh(item.cachedConfig);
      const cache = await refreshPoolConfigCache(item, { force });
      if (!wasFresh) await saveData();
      const body = extractClashConfigBody(await readPoolCachedBody(item));
      sendJson(res, 200, {
        status: cache.status || null,
        client: cache.client || "",
        score: cache.score || null,
        attempts: cache.attempts || [],
        storage: wasFresh ? "cached" : "live",
        bodyFile: "",
        fetchedAt: cache.fetchedAt || null,
        bodyFetchedAt: cache.bodyFetchedAt || cache.fetchedAt || null,
        contentType: cache.contentType || "",
        subscriptionUserinfo: cache.subscriptionUserinfo || "",
        error: cache.error || null,
        body,
        bodyLength: cache.bodyLength || body.length,
        truncated: false
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
      const previousSourceType = subscriptionSourceType(item);
      const previousUrl = item.url;
      const previousManualContent = item.manualContent || "";
      Object.assign(item, normalizeSubscription(payload, item));
      if (subscriptionSourceType(item) !== previousSourceType || item.url !== previousUrl || item.manualContent !== previousManualContent) {
        // 订阅链接已变更：旧 metrics/状态属于上一个链接，清空避免展示陈旧信息。
        // 实时重新拉取由前端保存后显式调用 /refresh 完成，避免保存请求长时间阻塞。
        clearSubscriptionSourceState(item);
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
  const isDocsRoute = requestedPath === "/docs" || requestedPath.startsWith("/docs/");
  const isAppRoute = !isDocsRoute && !path.extname(requestedPath);
  const isLoginRoute = /^\/(?:login|register|forgot-password|reset-password)\/?$/.test(requestedPath) || requestedPath === "/login.html";
  const isPublicAppRoute = /^\/delivery\/[^/]+\/?$/.test(requestedPath) || /^\/(?:pricing|buy)\/?$/.test(requestedPath) || isLoginRoute;
  const session = currentSession(req);
  const markdownImageMatch = requestedPath.match(/^\/uploads\/markdown\/([0-9a-f-]+\.(?:png|jpg|webp|gif))$/);
  if (requestedPath === "/docs") {
    res.writeHead(302, { "location": "/docs/", "cache-control": "no-cache" });
    res.end();
    return;
  }
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

  if (requestedPath.startsWith("/uploads/markdown/") && (!markdownImageMatch || !session)) {
    res.writeHead(session ? 404 : 403);
    res.end(session ? "Not found" : "Forbidden");
    return;
  }

  const staticPath = isAppRoute ? "/index.html" : isDocsRoute && !path.extname(requestedPath) ? `${requestedPath.replace(/\/$/, "")}/index.html` : requestedPath;
  const baseDir = markdownImageMatch ? MARKDOWN_UPLOAD_DIR : PUBLIC_DIR;
  const filePath = markdownImageMatch ? path.join(baseDir, markdownImageMatch[1]) : path.normalize(path.join(baseDir, staticPath));

  if (!filePath.startsWith(baseDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";
    const acceptEncoding = (req.headers["accept-encoding"] || "");
    const cacheControl = markdownImageMatch ? "private, max-age=31536000, immutable" : requestedPath.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
    const responseHeaders = { "content-type": contentType, "cache-control": cacheControl };

    // 对可压缩类型优先尝试预压缩文件（.br / .gz）
    if (COMPRESSIBLE_EXTS.has(ext)) {
      if (acceptEncoding.includes("br")) {
        try {
          const brContent = await fs.readFile(filePath + ".br");
          res.writeHead(200, { ...responseHeaders, "content-encoding": "br", "vary": "Accept-Encoding" });
          res.end(brContent);
          return;
        } catch {}
      }
      if (acceptEncoding.includes("gzip")) {
        try {
          const gzContent = await fs.readFile(filePath + ".gz");
          res.writeHead(200, { ...responseHeaders, "content-encoding": "gzip", "vary": "Accept-Encoding" });
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
            res.writeHead(200, { ...responseHeaders, "content-encoding": "br", "vary": "Accept-Encoding" });
            res.end(compressed);
            return;
          }
          res.writeHead(200, responseHeaders);
          res.end(content);
        });
        return;
      }
      if (acceptEncoding.includes("gzip")) {
        zlib.gzip(content, (err, compressed) => {
          if (!err) {
            res.writeHead(200, { ...responseHeaders, "content-encoding": "gzip", "vary": "Accept-Encoding" });
            res.end(compressed);
            return;
          }
          res.writeHead(200, responseHeaders);
          res.end(content);
        });
        return;
      }
    }

    res.writeHead(200, responseHeaders);
    res.end(content);
  } catch {
    if (!isDocsRoute && !path.extname(requestedPath)) {
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
  setInterval(() => {
    settleReferralRewards().catch(error => console.error("Referral settlement failed:", error));
  }, 60 * 1000);
  if (XUI_BASE_URL && XUI_API_TOKEN) {
    syncXuiWeightedTraffic().catch(error => console.error("3x-ui traffic billing sync failed:", error));
    setInterval(() => {
      syncXuiWeightedTraffic().catch(error => console.error("3x-ui traffic billing sync failed:", error));
    }, XUI_TRAFFIC_SYNC_INTERVAL_MS);
  }
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
  refreshSubscription,
  parseSubscriptionUserInfo,
  parseBodyHints,
  parseAccountUnavailable,
  calculateExpiry,
  calculateGiftExpiry,
  poolSelectionGroup,
  extractClashConfigBody,
  statusFor,
  toBytes,
  isBrowserNavigationRequest,
  copyUpstreamHeaders,
  normalizeSubconverterConfigParam,
  defaultSubconverterPreset,
  relaySubconverterConfig,
  userOutputMode,
  poolMetricUnavailableReason,
  evaluatePool,
  initialPoolFallbackReason,
  fallbackCandidateRank,
  injectPlaceholderNodes,
  liveConfigFromCachedPoolConfig,
  startOfUtcDate,
  remainingPlanCashValue,
  inferUserProductBinding,
  bindUserProduct,
  paymentQuote,
  planQuoteWithAddOns,
  vipLevelForSpend,
  vipDiscountPercent,
  paymentChannelCode,
  configuredPaymentChannel,
  paymentMethodForPlatform,
  publicPaymentPlatforms,
  paymentSignContent,
  paymentSign,
  verifyPaymentSign,
  paymentConfigReady,
  paymentStatusError,
  paymentAmountError,
  paymentOrderExpiresAt,
  isPaymentOrderExpired,
  normalizeSalesSettings,
  normalizePaymentSettings,
  publicInviterLabel,
  batchItems,
  customerIDFromUUID,
  publicRegisteredAccount,
  subscriptionSourceType,
  normalizeManualSubscriptionContent,
  normalizeSubscription,
  normalizeXuiClientResult,
  normalizeXuiConnectedIps,
  normalizeXuiMonitor,
  normalizeXuiInbounds,
  normalizeXuiInboundGroups,
  normalizeXuiInboundMetadata,
  normalizeXuiInboundEnable,
  xuiActiveInboundKeys,
  normalizeXuiPresence,
  xuiTrafficByUser,
  xuiDailyNodeTraffic,
  calculateXuiBillingLedger,
  createXuiBillingBaseline,
  xuiClientCycleKey,
  xuiMonthlyResetAt,
  legacyMigrationTrafficLimitBytes,
  withXuiUserMigrationLock,
  xuiNodeBaseUrl,
  sealXuiNodeToken,
  openXuiNodeToken,
  xuiClientWritePayload,
  xuiTrafficPayload,
  markMissingXuiClients,
  grantTrafficPack,
  expireUserTrafficPacks,
  clearSubscriptionSourceState,
  subscriptionCanBeManuallyAssigned,
  subscriptionHasUsableSource,
  classifyCurrentPoolFit,
  restoreUpstreamClashConfig,
  injectPlaceholderNodes,
  postSubconverter,
  disabledAccountPlaceholderSubscription
});
