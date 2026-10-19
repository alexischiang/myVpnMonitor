const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createDataStore } = require("./database");
const { loadLocalEnv } = require("./env");
const orders = require("./commerce/orders");
const { createCheckoutWorkflow } = require("./commerce/checkout-workflow");
const { GB, resolvePurchase, planEntitlement, planEntitlementChanges } = require("./commerce/catalog-v2");

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
    manual: `test-manual-${suffix}`,
    category: `test-category-${suffix}`,
    customNode: `test-custom-node-${suffix}`,
    compare: `test-compare-${suffix}`
  };
  const createdProducts = [];
  const originalUsers = (await store.loadAll()).users || [];

  try {
    await store.upsertCatalogV2LineGroup({ id: ids.group, name: "Test group", isEnabled: true, sortOrder: 0, inboundKeys: ["test-node:1"] }, { create: true });
    await store.upsertCatalogV2AddonCategory({ id: ids.category, name: "Test category", sortOrder: 0 }, { create: true });
    const recurring = product(ids.recurring, "recurring_plan", {
      lineGroupId: ids.group,
      trafficCustomization: { enabled: true, stepBytes: 10 * GB, stepPriceCents: 200, maxSteps: 3 },
      periods: [{ id: "30d", durationDays: 30, trafficBytes: 100 * GB, deviceLimit: 2, priceCents: 1000, isEnabled: true, sortOrder: 0 }]
    });
    const lifetime = product(ids.lifetime, "lifetime_plan", { lineGroupId: ids.group, trafficBytes: 200 * GB, deviceLimit: 3, priceCents: 5000 });
    const traffic = product(ids.traffic, "addon", { stock: 2, priceCents: 300, purchaseRequirement: "requires_recurring_plan", fulfillment: { mode: "automatic", handler: "traffic_credit", config: { trafficBytes: 50 * GB } }, allowQuantity: true, minQuantity: 1, maxQuantity: 2 });
    const manual = product(ids.manual, "addon", { stock: 2, priceCents: 800, purchaseRequirement: "standalone", fulfillment: { mode: "manual", handler: "manual", config: {} }, deliveryDescription: "manual delivery", serviceDurationDays: 30, allowQuantity: false, addonCategoryId: ids.category });
    const customNode = product(ids.customNode, "addon", { stock: null, priceCents: 3000, purchaseRequirement: "requires_recurring_plan", fulfillment: { mode: "manual", handler: "custom_node", config: {} }, serviceDurationDays: 30, buyerInputLabel: "期望地区" });
    for (const item of [recurring, lifetime, traffic, manual, customNode]) {
      await store.saveCatalogV2Product(item, { create: true });
      createdProducts.push(item.id);
    }

    let products = await store.listCatalogV2Products();
    const savedCustomNode = products.find(item => item.id === ids.customNode);
    assert.deepEqual([savedCustomNode.fulfillment.handler, savedCustomNode.buyerInputLabel, savedCustomNode.serviceDurationDays], ["custom_node", "期望地区", 30]);
    assert.equal(products.find(item => item.id === ids.manual).buyerInputLabel, "");
    assert.deepEqual([products.find(item => item.id === ids.recurring).tagline, products.find(item => item.id === ids.recurring).compareValues], ["", {}], "tagline and comparison values default to empty");
    const compare = await store.upsertCatalogV2CompareAttribute({ id: ids.compare, label: "Test row", kind: "choice", options: ["A", "B"], sortOrder: 99 }, { create: true });
    assert.deepEqual([compare.kind, compare.options], ["choice", ["A", "B"]]);
    assert.equal((await store.upsertCatalogV2CompareAttribute({ ...compare, label: "Renamed row", options: ["A", "B", "C"] })).options.length, 3);
    await store.saveCatalogV2Product({ ...recurring, tagline: "Short line", compareValues: { [ids.compare]: "C" } });
    const savedRecurring = (await store.listCatalogV2Products()).find(item => item.id === ids.recurring);
    assert.deepEqual([savedRecurring.tagline, savedRecurring.compareValues], ["Short line", { [ids.compare]: "C" }]);
    await store.saveCatalogV2Product(recurring);
    await store.deleteCatalogV2CompareAttribute(ids.compare);
    assert.equal((await store.listCatalogV2CompareAttributes()).some(item => item.id === ids.compare), false);
    assert.equal(products.find(item => item.id === ids.manual).chargeTax, true, "charge_tax defaults to true");
    await store.saveCatalogV2Product({ ...manual, chargeTax: false });
    assert.equal((await store.listCatalogV2Products()).find(item => item.id === ids.manual).chargeTax, false);
    await store.saveCatalogV2Product(manual);
    assert.deepEqual([products.find(item => item.id === ids.manual).addonCategoryId, products.find(item => item.id === ids.traffic).addonCategoryId], [ids.category, null]);
    assert.equal((await store.listCatalogV2AddonCategories()).find(item => item.id === ids.category).productCount, 1);
    assert.equal((await store.upsertCatalogV2AddonCategory({ id: ids.category, name: "Renamed", sortOrder: 3 })).name, "Renamed");
    await store.saveCatalogV2Product({ ...manual, addonCategoryId: null });
    assert.equal((await store.listCatalogV2Products()).find(item => item.id === ids.manual).addonCategoryId, null);
    await store.saveCatalogV2Product(manual);
    await store.deleteCatalogV2AddonCategory(ids.category);
    products = await store.listCatalogV2Products();
    assert.equal(products.find(item => item.id === ids.manual).addonCategoryId, null, "deleting a category leaves its products uncategorised");
    const recurringQuote = resolvePurchase(products, { productId: ids.recurring, periodId: "30d", trafficSteps: 2 }, { taxRate: 3 });
    assert.deepEqual([recurringQuote.baseAmount, recurringQuote.trafficCustomizationAmount, recurringQuote.originalAmount, recurringQuote.amount, recurringQuote.trafficGb, recurringQuote.duration, recurringQuote.devices], [10, 4, 14, 14.42, 120, "monthly", 2]);
    const lifetimeQuote = resolvePurchase(products, { productId: ids.lifetime }, { taxRate: 3 });
    assert.deepEqual([lifetimeQuote.amount, lifetimeQuote.lifetime, lifetimeQuote.trafficGb], [51.5, true, 200]);
    assert.throws(() => resolvePurchase(products, { productId: ids.traffic }, { taxRate: 3 }), /周期性套餐/);
    const trafficQuote = resolvePurchase(products, { productId: ids.traffic, quantity: 2 }, { taxRate: 3, hasRecurringPlan: true });
    assert.deepEqual([trafficQuote.amount, trafficQuote.fulfillment.mode, trafficQuote.fulfillment.handler], [6.18, "automatic", "traffic_credit"]);
    const manualQuote = resolvePurchase(products, { productId: ids.manual }, { taxRate: 3 });
    assert.deepEqual([manualQuote.amount, manualQuote.fulfillment.mode, manualQuote.selectedAddOnSnapshots[0].durationDays], [8.24, "manual", 30]);
    assert.throws(() => resolvePurchase(products, { productId: ids.manual, quantity: 2 }), /不允许修改/);
    // Buyer sync keeps the bought period and traffic steps and reads the rest from the current product.
    const savedRecurringPlan = products.find(item => item.id === ids.recurring);
    const steppedEntitlement = planEntitlement(savedRecurringPlan, { periodId: "30d", trafficSteps: 2 });
    assert.deepEqual(steppedEntitlement, { name: savedRecurringPlan.name, deviceLimit: 2, trafficBytes: 120 * GB, lineGroupId: ids.group });
    assert.deepEqual(planEntitlement({ ...savedRecurringPlan, periods: savedRecurringPlan.periods.map(period => ({ ...period, isEnabled: false })) }, { periodId: "30d" }).trafficBytes, 100 * GB, "a period no longer for sale still applies to its buyers");
    assert.match(planEntitlement(savedRecurringPlan, { periodId: "90d" }).skip, /90d 已删除/);
    assert.match(planEntitlement({ ...savedRecurringPlan, trafficCustomization: { ...savedRecurringPlan.trafficCustomization, stepBytes: null } }, { periodId: "30d", trafficSteps: 1 }).skip, /每档流量已删除/);
    assert.deepEqual(planEntitlement(products.find(item => item.id === ids.lifetime), {}), { name: products.find(item => item.id === ids.lifetime).name, deviceLimit: 3, trafficBytes: 200 * GB, lineGroupId: ids.group });
    assert.deepEqual(planEntitlementChanges({ ...steppedEntitlement, durationDays: 30 }, steppedEntitlement), []);
    assert.deepEqual(planEntitlementChanges({ ...steppedEntitlement, deviceLimit: 1, trafficBytes: null }, steppedEntitlement), [{ field: "deviceLimit", before: 1, after: 2 }, { field: "trafficBytes", before: null, after: 120 * GB }]);

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
    assert.deepEqual(products.filter(item => createdProducts.includes(item.id)).map(item => [item.id, item.stock]), [[ids.customNode, null], [ids.lifetime, 3], [ids.manual, 1], [ids.recurring, 3], [ids.traffic, 0]].sort((a, b) => a[0].localeCompare(b[0])));

    await assert.rejects(store.reserveCatalogV2Inventory({ id: crypto.randomUUID(), productId: ids.traffic, orderId: `sold-out-${suffix}`, quantity: 1, expiresAt: new Date(Date.now() + 60000).toISOString() }), /库存不足/);
    const cancellable = await workflow.submit({ id: `cancel-${suffix}`, number: "cancel", accountId: "catalog-test", email: "catalog@example.test", purpose: "plan", quote: recurringQuote, purchaseCount: 0, now: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() }, { totalCents: 1442, planCents: 1442, useBalance: false });
    await workflow.cancel(cancellable, new Date().toISOString());
    assert.equal((await store.listCatalogV2InventoryReservations(cancellable.id))[0].status, "released");

    await store.reserveCatalogV2Inventory({ id: crypto.randomUUID(), productId: ids.recurring, orderId: `expired-${suffix}`, quantity: 1, expiresAt: new Date(Date.now() - 1000).toISOString(), now: new Date(Date.now() - 2000).toISOString() });
    const beforeLate = (await store.listCatalogV2Products()).find(item => item.id === ids.recurring).stock;
    await assert.rejects(store.consumeCatalogV2Inventory(`expired-${suffix}`), /人工处理/);
    const afterLate = (await store.listCatalogV2Products()).find(item => item.id === ids.recurring).stock;
    assert.equal(afterLate, beforeLate, "late payment must not decrement stock");

    console.log("Catalog V2 checks passed: all product types, quotes, inventory reservations, payment collection, late-payment safety, add-on categories, custom-node handler and buyer input, plan tagline and comparison rows.");
  } finally {
    await store.saveCollection("users", originalUsers);
    await store.pool.query("DELETE FROM catalog_v2_inventory_reservations WHERE product_id = ANY($1::text[])", [createdProducts]);
    for (const id of createdProducts.reverse()) await store.deleteCatalogV2Product(id);
    await store.deleteCatalogV2LineGroup(ids.group);
    await store.deleteCatalogV2AddonCategory(ids.category);
    await store.deleteCatalogV2CompareAttribute(ids.compare);
    await store.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
