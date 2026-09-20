const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createDataStore } = require("./database");
const { loadLocalEnv } = require("./env");
const orders = require("./commerce/orders");
const { createCheckoutWorkflow } = require("./commerce/checkout-workflow");
const { GB, resolvePurchase } = require("./commerce/catalog-v2");
const { migrateUsers } = require("./commerce/catalog-v2-migration");

function testDatabaseUrl() {
  loadLocalEnv();
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (process.env.LOCAL_DATABASE_URL) return process.env.LOCAL_DATABASE_URL;
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return "";
  return fs.readFileSync(envPath, "utf8").match(/^TEST_DATABASE_URL=(.+)$/m)?.[1]?.trim() || "";
}

function product(id, type, overrides = {}) {
  return {
    id, type, isEnabled: true, isForSale: true, stock: 4, sortOrder: 0,
    name: id, description: "test", features: [], isRecommended: false,
    lineGroupId: type === "addon" ? null : overrides.lineGroupId,
    durationDays: null, trafficBytes: null, deviceLimit: null, priceCents: null,
    trafficCustomization: { enabled: false, stepBytes: null, stepPriceCents: null, maxSteps: 10 },
    purchaseRequirement: null, fulfillment: { mode: null, handler: null, config: {} },
    deliveryDescription: "", serviceDurationDays: null, allowQuantity: true,
    minQuantity: 1, maxQuantity: null, periods: [], ...overrides
  };
}

async function main() {
  const databaseUrl = testDatabaseUrl();
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL or LOCAL_DATABASE_URL is required for catalog V2 tests");
  const store = createDataStore({ databaseUrl, ssl: false });
  await store.init();
  const suffix = crypto.randomBytes(4).toString("hex");
  const ids = {
    group: `test-group-${suffix}`,
    recurring: `test-recurring-${suffix}`,
    lifetime: `test-lifetime-${suffix}`,
    traffic: `test-traffic-${suffix}`,
    manual: `test-manual-${suffix}`
  };
  const createdProducts = [];
  const originalUsers = (await store.loadAll()).users || [];

  try {
    await store.upsertCatalogV2LineGroup({ id: ids.group, name: "Test group", isEnabled: true, sortOrder: 0, inboundKeys: ["test-node:1"] }, { create: true });
    const recurring = product(ids.recurring, "recurring_plan", {
      lineGroupId: ids.group,
      trafficCustomization: { enabled: true, stepBytes: 10 * GB, stepPriceCents: 200, maxSteps: 3 },
      periods: [{ id: "30d", durationDays: 30, trafficBytes: 100 * GB, deviceLimit: 2, priceCents: 1000, isEnabled: true, sortOrder: 0 }]
    });
    const lifetime = product(ids.lifetime, "lifetime_plan", { lineGroupId: ids.group, trafficBytes: 200 * GB, deviceLimit: 3, priceCents: 5000 });
    const traffic = product(ids.traffic, "addon", { stock: 2, priceCents: 300, purchaseRequirement: "requires_recurring_plan", fulfillment: { mode: "automatic", handler: "traffic_credit", config: { trafficBytes: 50 * GB } }, allowQuantity: true, minQuantity: 1, maxQuantity: 2 });
    const manual = product(ids.manual, "addon", { stock: 2, priceCents: 800, purchaseRequirement: "standalone", fulfillment: { mode: "manual", handler: "manual", config: {} }, deliveryDescription: "manual delivery", serviceDurationDays: 30, allowQuantity: false });
    for (const item of [recurring, lifetime, traffic, manual]) {
      await store.saveCatalogV2Product(item, { create: true });
      createdProducts.push(item.id);
    }

    let products = await store.listCatalogV2Products();
    const recurringQuote = resolvePurchase(products, { productId: ids.recurring, periodId: "30d", trafficSteps: 2 }, { taxRate: 3 });
    assert.deepEqual([recurringQuote.amount, recurringQuote.trafficGb, recurringQuote.duration, recurringQuote.devices], [14.42, 120, "monthly", 2]);
    const lifetimeQuote = resolvePurchase(products, { productId: ids.lifetime }, { taxRate: 3 });
    assert.deepEqual([lifetimeQuote.amount, lifetimeQuote.lifetime, lifetimeQuote.trafficGb], [51.5, true, 200]);
    assert.throws(() => resolvePurchase(products, { productId: ids.traffic }, { taxRate: 3 }), /周期性套餐/);
    const trafficQuote = resolvePurchase(products, { productId: ids.traffic, quantity: 2 }, { taxRate: 3, hasRecurringPlan: true });
    assert.deepEqual([trafficQuote.amount, trafficQuote.fulfillment.mode, trafficQuote.fulfillment.handler], [6.18, "automatic", "traffic_credit"]);
    const manualQuote = resolvePurchase(products, { productId: ids.manual }, { taxRate: 3 });
    assert.deepEqual([manualQuote.amount, manualQuote.fulfillment.mode, manualQuote.selectedAddOnSnapshots[0].durationDays], [8.24, "manual", 30]);
    assert.throws(() => resolvePurchase(products, { productId: ids.manual, quantity: 2 }), /不允许修改/);

    const delivered = [];
    let persisted = [];
    const inventory = {
      reserve: order => store.reserveCatalogV2Inventory({ id: crypto.randomUUID(), productId: order.planId, orderId: order.id, quantity: order.inventoryQuantity || 1, expiresAt: order.expiresAt }),
      consume: (orderId, options) => store.consumeCatalogV2Inventory(orderId, options),
      release: orderId => store.releaseCatalogV2Inventory(orderId)
    };
    const workflow = createCheckoutWorkflow({
      orders,
      settlement: { prepare: async () => ({ amount: 0, walletAmount: 0 }), release: async () => {} },
      inventory,
      persist: async order => { persisted.push(structuredClone(order)); },
      logSubmitted: async () => {},
      deliver: async order => { delivered.push(order.id); order.fulfilledAt = order.paidAt; order.fulfillmentStatus = order.fulfillment?.mode === "manual" ? "manual_pending" : "fulfilled"; },
      save: async () => {}
    });
    async function buy(quote, label) {
      const now = new Date();
      const order = await workflow.submit({ id: `${label}-${suffix}`, number: `${label}-number`, accountId: "catalog-test", email: "catalog@example.test", purpose: quote.purpose, quote, purchaseCount: 0, now: now.toISOString(), expiresAt: new Date(now.getTime() + 60000).toISOString() }, { totalCents: Math.round(quote.amount * 100), planCents: quote.purpose === "plan" ? Math.round(quote.amount * 100) : 0, useBalance: false });
      assert.equal(order.status, "pending");
      assert.equal(order.productSnapshot.catalogVersion, 2);
      await workflow.collect(order, { paidAt: new Date().toISOString() });
      return order;
    }
    const recurringOrder = await buy(recurringQuote, "recurring");
    const lifetimeOrder = await buy(lifetimeQuote, "lifetime");
    const trafficOrder = await buy(trafficQuote, "traffic");
    const manualOrder = await buy(manualQuote, "manual");
    assert.equal(manualOrder.fulfillmentStatus, "manual_pending");
    assert.deepEqual(new Set(delivered), new Set([recurringOrder.id, lifetimeOrder.id, trafficOrder.id, manualOrder.id]));
    assert.equal(persisted.length, 4);
    products = await store.listCatalogV2Products();
    assert.deepEqual(products.filter(item => createdProducts.includes(item.id)).map(item => [item.id, item.stock]), [[ids.lifetime, 3], [ids.manual, 1], [ids.recurring, 3], [ids.traffic, 0]].sort((a, b) => a[0].localeCompare(b[0])));

    await assert.rejects(store.reserveCatalogV2Inventory({ id: crypto.randomUUID(), productId: ids.traffic, orderId: `sold-out-${suffix}`, quantity: 1, expiresAt: new Date(Date.now() + 60000).toISOString() }), /库存不足/);
    const cancellable = await workflow.submit({ id: `cancel-${suffix}`, number: "cancel", accountId: "catalog-test", email: "catalog@example.test", purpose: "plan", quote: recurringQuote, purchaseCount: 0, now: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() }, { totalCents: 1442, planCents: 1442, useBalance: false });
    await workflow.cancel(cancellable, new Date().toISOString());
    assert.equal((await store.listCatalogV2InventoryReservations(cancellable.id))[0].status, "released");

    await store.reserveCatalogV2Inventory({ id: crypto.randomUUID(), productId: ids.recurring, orderId: `expired-${suffix}`, quantity: 1, expiresAt: new Date(Date.now() - 1000).toISOString(), now: new Date(Date.now() - 2000).toISOString() });
    const beforeLate = (await store.listCatalogV2Products()).find(item => item.id === ids.recurring).stock;
    await assert.rejects(store.consumeCatalogV2Inventory(`expired-${suffix}`), /人工处理/);
    const afterLate = (await store.listCatalogV2Products()).find(item => item.id === ids.recurring).stock;
    assert.equal(afterLate, beforeLate, "late payment must not decrement stock");

    const legacyUsers = [
      { id: `user-recurring-${suffix}`, currentProductId: "basic", currentOptionId: "basic-30", currentProductSnapshot: { version: 1 }, userLogs: [] },
      { id: `user-lifetime-${suffix}`, currentProductId: "pro", currentOptionId: "pro-lifetime", userLogs: [] },
      { id: `user-empty-${suffix}`, userLogs: [] }
    ];
    const mappings = [
      { legacyProductId: "basic", legacyOptionId: "basic-30", targetProductId: ids.recurring, targetPeriodId: "30d" },
      { legacyProductId: "pro", legacyOptionId: "pro-lifetime", targetProductId: ids.lifetime, targetPeriodId: null }
    ];
    const migration = migrateUsers({ users: legacyUsers, products: await store.listCatalogV2Products(), mappings, migrationId: `test-${suffix}`, now: "2026-09-19T00:00:00.000Z" });
    assert.deepEqual([migration.report.migrated, migration.report.skipped, migration.report.failed.length], [2, 1, 0]);
    assert.deepEqual([migration.users[0].currentProductId, migration.users[0].v2ProductId, migration.users[0].v2PeriodId, migration.users[0].legacyProductBinding.optionId], ["basic", ids.recurring, "30d", "basic-30"]);
    assert.deepEqual([migration.users[1].v2ProductId, migration.users[1].v2PeriodId], [ids.lifetime, null]);
    const replay = migrateUsers({ users: migration.users, products: await store.listCatalogV2Products(), mappings, migrationId: `test-${suffix}` });
    assert.deepEqual([replay.report.migrated, replay.report.alreadyMigrated, replay.report.failed.length], [0, 2, 0]);
    const blocked = migrateUsers({ users: [...legacyUsers, { id: "unmapped", currentProductId: "ultra", currentOptionId: "ultra-90" }], products: await store.listCatalogV2Products(), mappings });
    assert.equal(blocked.report.status, "blocked");
    assert.match(blocked.report.failed.at(-1).reason, /未配置映射/);

    const cliMigrationId = `cli-${suffix}`;
    const cliDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-v2-migration-"));
    const cliMappingPath = path.join(cliDirectory, "mapping.json");
    fs.writeFileSync(cliMappingPath, JSON.stringify({ migrationId: cliMigrationId, mappings }));
    await store.saveCollection("users", legacyUsers);
    const cliEnvironment = { ...process.env, LOCAL_DATABASE_URL: databaseUrl, DATABASE_URL: "" };
    const migrationScript = path.join(__dirname, "scripts", "migrate-catalog-v2-users.js");
    const dryRun = spawnSync(process.execPath, [migrationScript, "--mapping", cliMappingPath], { cwd: __dirname, env: cliEnvironment, encoding: "utf8" });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /Dry run only/);
    assert.equal((await store.loadAll()).users.find(user => user.id === legacyUsers[0].id).v2ProductId, undefined);
    const databaseHost = new URL(databaseUrl).host;
    const applied = spawnSync(process.execPath, [migrationScript, "--mapping", cliMappingPath, "--apply", `--confirm-host=${databaseHost}`], { cwd: __dirname, env: cliEnvironment, encoding: "utf8" });
    assert.equal(applied.status, 0, applied.stderr);
    assert.match(applied.stdout, /migration applied/);
    const savedUsers = (await store.loadAll()).users;
    assert.equal(savedUsers.find(user => user.id === legacyUsers[0].id).v2ProductId, ids.recurring);
    const replayedCli = spawnSync(process.execPath, [migrationScript, "--mapping", cliMappingPath, "--apply", `--confirm-host=${databaseHost}`], { cwd: __dirname, env: cliEnvironment, encoding: "utf8" });
    assert.equal(replayedCli.status, 0, replayedCli.stderr);
    assert.match(replayedCli.stdout, /"alreadyMigrated": 2/);
    fs.rmSync(cliDirectory, { recursive: true, force: true });
    console.log("Catalog V2 checks passed: all product types, quotes, inventory reservations, payment collection, late-payment safety, and idempotent user migration.");
  } finally {
    await store.saveCollection("users", originalUsers);
    await store.pool.query("DELETE FROM app_records WHERE collection='migrationState' AND id=$1", [`cli-${suffix}`]);
    await store.pool.query("DELETE FROM catalog_v2_inventory_reservations WHERE product_id = ANY($1::text[])", [createdProducts]);
    for (const id of createdProducts.reverse()) await store.deleteCatalogV2Product(id);
    await store.deleteCatalogV2LineGroup(ids.group);
    await store.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
