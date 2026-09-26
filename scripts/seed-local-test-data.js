// Seeds fake V2 line groups (权限组), products and expired test accounts into the LOCAL database.
// Usage: node scripts/seed-local-test-data.js          (re-creates the test data)
//        node scripts/seed-local-test-data.js --reset  (removes it)
// Every record uses the "test-" id prefix or the xela.test email domain, so real data is never touched.
const crypto = require("crypto");
const { loadLocalEnv } = require("../env");
const { createDataStore } = require("../database");
const { nextCustomerID } = require("../customer-id");

loadLocalEnv();

const GB = 1024 ** 3;
const DAY = 86400000;
// Local-only test password for the seeded accounts below.
const TEST_PASSWORD = "XelaTest-2026!";
const SEED_TAG = "local-test-seed";

const LINE_GROUPS = [
  { id: "test-line-standard", name: "测试-标准权限组", isEnabled: true, sortOrder: 90, inboundNames: ["香港 A01", "新加坡 A01 | 三网优化", "日本 A01 | 三网优化"] },
  { id: "test-line-premium", name: "测试-高级权限组", isEnabled: true, sortOrder: 91, inboundNames: ["香港 A01", "新加坡 A01 | 三网优化", "日本 A01 | 三网优化", "美国 NTT S03", "英国伦敦 | 原生IP | 1.5倍流量"] },
  { id: "test-line-disabled", name: "测试-停用权限组", isEnabled: false, sortOrder: 92, inboundNames: ["台湾 A01 | 三网优化"] }
];

function product(id, type, fields) {
  return {
    id, type, isEnabled: true, isForSale: true, stock: null, sortOrder: 90, description: "本地测试商品", features: [], isRecommended: false,
    durationDays: null, trafficBytes: null, deviceLimit: null, priceCents: null,
    trafficCustomization: { enabled: false, stepBytes: null, stepPriceCents: null, maxSteps: 10 },
    purchaseRequirement: null, fulfillment: { mode: null, handler: null, config: {} },
    deliveryDescription: "", serviceDurationDays: null, allowQuantity: true, minQuantity: 1, maxQuantity: null, periods: [],
    ...fields
  };
}

const PRODUCTS = [
  product("test-standard", "recurring_plan", {
    name: "测试 STANDARD", sortOrder: 90, lineGroupId: "test-line-standard",
    trafficCustomization: { enabled: true, stepBytes: 50 * GB, stepPriceCents: 1000, maxSteps: 4 },
    periods: [
      { id: "30d", durationDays: 30, trafficBytes: 100 * GB, deviceLimit: 2, priceCents: 3000, isEnabled: true, sortOrder: 0 },
      { id: "90d", durationDays: 90, trafficBytes: 100 * GB, deviceLimit: 3, priceCents: 8000, isEnabled: true, sortOrder: 1 },
      { id: "360d", durationDays: 360, trafficBytes: 100 * GB, deviceLimit: 3, priceCents: 30000, isEnabled: true, sortOrder: 2 }
    ]
  }),
  product("test-premium", "recurring_plan", {
    name: "测试 PREMIUM", sortOrder: 91, lineGroupId: "test-line-premium", isRecommended: true,
    trafficCustomization: { enabled: true, stepBytes: 100 * GB, stepPriceCents: 2000, maxSteps: 3 },
    periods: [
      { id: "30d", durationDays: 30, trafficBytes: 300 * GB, deviceLimit: 5, priceCents: 6000, isEnabled: true, sortOrder: 0 },
      { id: "180d", durationDays: 180, trafficBytes: 300 * GB, deviceLimit: 5, priceCents: 32000, isEnabled: true, sortOrder: 1 }
    ]
  }),
  product("test-unlisted", "recurring_plan", {
    name: "测试 下架套餐", sortOrder: 92, lineGroupId: "test-line-standard", isForSale: false,
    periods: [{ id: "30d", durationDays: 30, trafficBytes: 50 * GB, deviceLimit: 1, priceCents: 2000, isEnabled: true, sortOrder: 0 }]
  }),
  product("test-lifetime", "lifetime_plan", {
    name: "测试 不限时 200G", sortOrder: 93, lineGroupId: "test-line-standard", trafficBytes: 200 * GB, deviceLimit: 2, priceCents: 9900
  })
];

// Each account gets an expired V2 plan. `expired-renew` can renew; `expired-unlisted` falls back to 购买服务.
const ACCOUNTS = [
  { email: "expired-renew@xela.test", productId: "test-standard", periodId: "90d", trafficSteps: 2, expiredDaysAgo: 5 },
  { email: "expired-unlisted@xela.test", productId: "test-unlisted", periodId: "30d", trafficSteps: 0, expiredDaysAgo: 20 }
];

function assertLocalDatabase(url) {
  let host = "";
  try { host = new URL(url).hostname; } catch {}
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error(`Refusing to seed a non-local database (${host || "no LOCAL_DATABASE_URL"}).`);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

function snapshotFor(productRow, periodId, trafficSteps) {
  const period = productRow.periods.find(item => item.id === periodId);
  const trafficBytes = period.trafficBytes + trafficSteps * (productRow.trafficCustomization.stepBytes || 0);
  return {
    version: 2, productId: productRow.id, productType: productRow.type, periodId, lineGroupId: productRow.lineGroupId, name: productRow.name,
    durationDays: period.durationDays, trafficBytes, deviceLimit: period.deviceLimit,
    unitPriceCents: period.priceCents + trafficSteps * (productRow.trafficCustomization.stepPriceCents || 0), quantity: 1, trafficSteps,
    purchaseRequirement: null, fulfillment: { mode: null, handler: null, config: {} }
  };
}

function testUser(account, spec, productRow) {
  const snapshot = snapshotFor(productRow, spec.periodId, spec.trafficSteps);
  const expiresAt = new Date(Date.now() - spec.expiredDaysAgo * DAY);
  const purchasedAt = new Date(expiresAt.getTime() - snapshot.durationDays * DAY).toISOString();
  const paid = snapshot.unitPriceCents / 100;
  const usedBytes = Math.round(snapshot.trafficBytes * 0.35);
  return {
    id: crypto.randomUUID(), seedTag: SEED_TAG, userId: account.email, email: account.email, wechatName: "", customerID: account.customerID,
    createdAt: purchasedAt, updatedAt: new Date().toISOString(), purchasedAt, expiresAt: expiresAt.toISOString(),
    duration: { 30: "monthly", 90: "quarterly", 180: "half_yearly", 360: "yearly" }[snapshot.durationDays] || "custom",
    actualPaid: paid, cashValue: paid, cashValueAt: purchasedAt, vipSpend: 0, level: "vip1",
    group: productRow.lineGroupId, activeGroup: productRow.lineGroupId, lineType: "self_hosted", unlimited: false,
    trafficTier: spec.trafficSteps + 1, xuiTrafficLimitBytes: snapshot.trafficBytes, subscriptionId: "",
    subscriptionToken: crypto.randomBytes(16).toString("hex"), outputMode: "subconverter", blockUserinfo: false, userLogs: [],
    productCatalogVersion: 2, v2ProductId: productRow.id, v2PeriodId: spec.periodId, v2LineGroupId: productRow.lineGroupId, v2ProductSnapshot: snapshot,
    currentProductId: productRow.id, currentOptionId: `v2:${productRow.id}:${spec.periodId}`, currentProductSource: "manual_order",
    currentProductBoundAt: purchasedAt, currentProductSnapshot: { ...snapshot, v2: snapshot, version: 2 },
    xuiLastTraffic: {
      available: true, status: "expired", uploadBytes: Math.round(usedBytes * 0.1), downloadBytes: Math.round(usedBytes * 0.9), rawUsedBytes: usedBytes,
      usedBytes, totalBytes: snapshot.trafficBytes, remainingBytes: snapshot.trafficBytes - usedBytes, usagePercent: 35,
      connectedIpCount: 0, ipLimit: snapshot.deviceLimit, nextResetAt: "", expiresAt: expiresAt.toISOString(), nodes: [], lastSyncedAt: expiresAt.toISOString()
    }
  };
}

async function reset(store) {
  const { users, accounts } = await store.loadCollections(["users", "accounts"]);
  for (const user of users.filter(item => item.seedTag === SEED_TAG)) await store.deleteRecord("users", user.id);
  for (const account of accounts.filter(item => item.email.endsWith("@xela.test"))) await store.deleteRecord("accounts", account.id);
  const productIds = new Set((await store.listCatalogV2Products()).map(item => item.id));
  for (const item of PRODUCTS) if (productIds.has(item.id)) await store.deleteCatalogV2Product(item.id);
  const groupIds = new Set((await store.listCatalogV2LineGroups()).map(item => item.id));
  for (const group of LINE_GROUPS) if (groupIds.has(group.id)) await store.deleteCatalogV2LineGroup(group.id);
}

async function seed(store) {
  const inbounds = await store.listXuiInbounds();
  for (const group of LINE_GROUPS) {
    const inboundKeys = group.inboundNames.map(name => inbounds.find(inbound => inbound.name === name)?.key).filter(Boolean);
    const { inboundNames, ...row } = group;
    await store.upsertCatalogV2LineGroup({ ...row, inboundKeys }, { create: true });
  }
  for (const item of PRODUCTS) await store.saveCatalogV2Product(item, { create: true });

  const { users, accounts } = await store.loadCollections(["users", "accounts"]);
  const existing = [...users, ...accounts];
  for (const spec of ACCOUNTS) {
    const now = new Date().toISOString();
    const account = { id: crypto.randomUUID(), email: spec.email, passwordHash: hashPassword(TEST_PASSWORD), status: "active", linkedUserId: "", referralCode: String(900000 + Math.floor(Math.random() * 99999)), referredByAccountId: "", referralRate: 10, recurringReferral: false, referralBoundAt: "", createdAt: now, updatedAt: now };
    account.customerID = nextCustomerID(account.id, existing);
    existing.push(account);
    const user = testUser(account, spec, PRODUCTS.find(item => item.id === spec.productId));
    account.linkedUserId = user.id;
    await store.setRecord("users", user.id, user);
    await store.setRecord("accounts", account.id, account);
  }
}

(async () => {
  const databaseUrl = process.env.LOCAL_DATABASE_URL || "";
  assertLocalDatabase(databaseUrl);
  const store = createDataStore({ databaseUrl, ssl: false });
  await store.init();
  try {
    await reset(store);
    if (process.argv.includes("--reset")) {
      console.log("Local test data removed.");
    } else {
      await seed(store);
      console.log(`Seeded ${LINE_GROUPS.length} line groups, ${PRODUCTS.length} products and ${ACCOUNTS.length} expired accounts: ${ACCOUNTS.map(item => item.email).join(", ")}.`);
      console.log("Password: see TEST_PASSWORD in scripts/seed-local-test-data.js. Restart the backend (or wait for the data cache) to see the data.");
    }
  } finally {
    await store.close?.();
  }
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
