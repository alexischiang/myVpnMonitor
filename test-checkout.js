const assert = require("node:assert/strict");
const orders = require("./commerce/orders");
const { createSettlementService } = require("./commerce/settlement");
const { createCheckoutWorkflow } = require("./commerce/checkout-workflow");
const { createPaymentService } = require("./commerce/payments");

async function main() {
  const released = [];
  let persisted;
  let deliveryFails = true;
  let deliveries = 0;
  const settlement = createSettlementService({
    reserve: async () => ({ cashCents: 100, giftCents: 50, referralCents: 25 }),
    release: async id => released.push(id)
  });
  const dependencies = {
    orders, settlement, persist: async order => { persisted = order; },
    logSubmitted: async () => {}, save: async () => {},
    deliver: async order => {
      if (deliveryFails) throw new Error("delivery unavailable");
      if (!order.fulfilledAt) { deliveries++; order.fulfilledAt = new Date().toISOString(); }
    }
  };
  const workflow = createCheckoutWorkflow(dependencies);
  const terms = { id: "order-1", number: "number-1", accountId: "buyer", purpose: "plan",
    quote: { amount: 3, planId: "pro", selectedAddOnSnapshots: [{ name: "IP" }] },
    now: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() };
  const allocation = { totalCents: 300, planCents: 250, useBalance: true };
  const submitted = await workflow.submit(terms, allocation);
  assert.equal(persisted.status, "pending");
  assert.equal(deliveries, 0, "submission cannot grant a service");
  assert.deepEqual([submitted.amount, submitted.walletAmount], [1.25, 1.75]);
  terms.quote.selectedAddOnSnapshots[0].name = "changed";
  assert.equal(submitted.productSnapshot.addOns[0].name, "IP", "quote mutation cannot change accepted terms");
  await workflow.collect(submitted, { paidAt: terms.now });
  assert.equal(submitted.status, "paid", "delivery failure must not undo a receipt");
  assert.equal(submitted.fulfillmentStatus, "failed");
  deliveryFails = false;
  await workflow.fulfill(submitted);
  await workflow.fulfill(submitted);
  assert.equal(deliveries, 1);
  const failingStore = createCheckoutWorkflow({ ...dependencies, persist: async () => { throw new Error("storage unavailable"); } });
  await assert.rejects(failingStore.submit({ ...terms, id: "order-2" }, allocation), /storage unavailable/);
  assert.deepEqual(released, ["order-2"], "failed persistence must release the reservation");

  const attempts = new Map();
  const currentAttempts = new Map();
  const references = [];
  let unavailable = true;
  const payments = createPaymentService({
    get: async id => structuredClone(attempts.get(id)), put: async row => attempts.set(row.id, structuredClone(row)),
    getCurrent: async id => currentAttempts.get(id), setCurrent: async (id, attemptId) => currentAttempts.set(id, attemptId),
    configure: (_, id) => ({ id: id || "one", provider: "legacy", name: "Gateway", merchantId: "merchant" }),
    channel: (_, method) => method, statusOf: status => status === 1 ? "paid" : "pending",
    amountError: (expected, actual) => Number(actual) === expected ? "" : "amount mismatch",
    createGateway: async (_, params) => { references.push(params.merOrderTid); if (unavailable) throw new Error("timeout"); return { result: { payOrderStatus: 0, payUrl: "https://pay.example.test" } }; },
    queryGateway: async () => ({ payOrderStatus: 1, money: "1.25" })
  });
  const invoice = { id: "order-1", reference: "number-1", amount: 1.25, label: "PRO" };
  const urls = { notify: () => "https://app.example.test/callback", return: () => "https://app.example.test/return" };
  const first = await payments.start(invoice, { channelCode: "100" }, urls);
  assert.equal(first.status, "unknown");
  unavailable = false;
  const retry = await payments.start(invoice, { channelCode: "100" }, urls);
  assert.equal(first.id, retry.id, "restart without the order's attempt pointer still reuses the persisted merchant reference");
  assert.equal(new Set(references).size, 1);
  const switched = await payments.start({ ...invoice, attemptId: retry.id }, { paymentPlatformId: "two", channelCode: "200" }, urls);
  assert.notEqual(switched.id, first.id);
  assert.equal(attempts.size, 2, "switching channels preserves the earlier transaction for late callbacks");
  const recoveredSwitch = await payments.start(invoice, { paymentPlatformId: "two", channelCode: "200" }, urls);
  assert.equal(recoveredSwitch.id, switched.id, "restarting after a channel switch must recover the new charge even if the order projection is stale");
  assert.equal(attempts.size, 2);
  const confirmed = await payments.query(retry);
  assert.equal(confirmed.status, "paid");
  console.log("Checkout domain checks passed: independent submission, immutable terms, hold compensation, delivery recovery and durable payment retries.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
