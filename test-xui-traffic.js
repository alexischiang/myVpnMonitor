const assert = require("assert");
const { createDataStore } = require("./database");
const {
  RESET_INTERVAL_DAYS,
  MS_PER_DAY,
  isPeriodicPlan,
  cycleStartMs,
  xuiMultiplier,
  sumRawBytes,
  weightedBytes,
  perNodeTotals,
  isTrafficPackActive,
  effectiveQuotaBytes
} = require("./xui-traffic");

// isPeriodicPlan
assert.strictEqual(isPeriodicPlan({ duration: "monthly" }), true);
assert.strictEqual(isPeriodicPlan({ duration: "yearly" }), true);
assert.strictEqual(isPeriodicPlan({ duration: "lifetime" }), false);
assert.strictEqual(isPeriodicPlan({ duration: "monthly", v2ProductSnapshot: { trafficBytes: null } }), false, "an unlimited snapshot never resets");
assert.strictEqual(isPeriodicPlan({ duration: "monthly", unlimited: true, v2ProductSnapshot: { trafficBytes: 100 } }), true, "a stray unlimited field is ignored");

// cycleStartMs: fixed 30-day steps from purchase, regardless of plan length
const purchase = Date.UTC(2026, 0, 1); // 2026-01-01
assert.strictEqual(RESET_INTERVAL_DAYS, 30);
assert.strictEqual(cycleStartMs(purchase, purchase + 5 * MS_PER_DAY, { periodic: true }), purchase, "within first 30 days → cycle start = purchase");
assert.strictEqual(cycleStartMs(purchase, purchase + 35 * MS_PER_DAY, { periodic: true }), purchase + 30 * MS_PER_DAY, "35 days → 1 step");
assert.strictEqual(cycleStartMs(purchase, purchase + 95 * MS_PER_DAY, { periodic: true }), purchase + 90 * MS_PER_DAY, "95 days (quarterly) → 3rd cycle at day 90");
assert.strictEqual(cycleStartMs(purchase, purchase + 95 * MS_PER_DAY, { periodic: false }), purchase, "non-periodic (lifetime) → always purchase");
assert.strictEqual(cycleStartMs(purchase, purchase - 10 * MS_PER_DAY, { periodic: true }), purchase, "now before purchase → purchase");
assert.strictEqual(cycleStartMs("nope", Date.now()), null, "invalid purchase → null");

// xuiMultiplier
assert.strictEqual(xuiMultiplier(1.3), 1.3);
assert.strictEqual(xuiMultiplier(undefined), 1, "missing multiplier defaults to 1");
assert.strictEqual(xuiMultiplier(-2), 1, "negative multiplier falls back to 1");

// sumRawBytes / weightedBytes / perNodeTotals
const perNode = { a: 100, b: 200, c: 50 };
assert.strictEqual(sumRawBytes(perNode), 350);
assert.strictEqual(weightedBytes(perNode, { a: 1, b: 2, c: 1.3 }), 100 * 1 + 200 * 2 + 50 * 1.3);
assert.strictEqual(weightedBytes(perNode, {}), 350, "no multipliers → raw");
assert.deepStrictEqual(perNodeTotals({ a: { up: 10, down: 20 }, b: { up: 5, down: 0 } }), { a: 30, b: 5 });
const { billedDirectionalBytes } = require("./xui-traffic");
assert.deepStrictEqual(billedDirectionalBytes(100, 250, 700), { upload: 200, download: 500 }, "billed total split by the raw up/down ratio");
assert.deepStrictEqual(billedDirectionalBytes(1, 2, 10), { upload: 3, download: 7 }, "rounded parts still add up to the billed total");
assert.deepStrictEqual(billedDirectionalBytes(0, 0, 0), { upload: 0, download: 0 });
assert.deepStrictEqual(billedDirectionalBytes(undefined, undefined, 50), { upload: 0, download: 50 }, "no raw split → all billed bytes count as download");

// traffic pack scoping and quota
assert.strictEqual(isTrafficPackActive("cycle-1", "cycle-1"), true);
assert.strictEqual(isTrafficPackActive("cycle-1", "cycle-2"), false, "pack from a previous cycle expired");
assert.strictEqual(isTrafficPackActive("", "cycle-1"), false, "no pack");
assert.strictEqual(effectiveQuotaBytes(100, 50, true), 150, "active pack adds to quota");
assert.strictEqual(effectiveQuotaBytes(100, 50, false), 100, "inactive pack ignored");
assert.strictEqual(effectiveQuotaBytes(0, 50, true), 0, "unlimited plan (0) stays unlimited");

// xuiLedgerFromCycle: shape, weighting, cycle carry-over
// hourlyUsage: one cell per (date, hour) with its busiest node, plus the 24-hour profile.
{
  const { hourlyUsage } = require("./xui-traffic");
  const usage = hourlyUsage([
    { date: "2026-11-02", hour: 14, nodeName: "HK", up: 10, down: 90 },
    { date: "2026-11-02", hour: 14, nodeName: "US", up: 200, down: 0 },
    { date: "2026-11-03", hour: 14, nodeName: "HK", up: 0, down: 50 },
    { date: "2026-11-03", hour: 2, nodeName: "HK", up: 0, down: 0 },
    { date: "2026-10-01", hour: 1, nodeName: "HK", up: 5, down: 5 },
    { date: "2026-11-03", hour: 24, nodeName: "HK", up: 5, down: 5 }
  ], ["2026-11-02", "2026-11-03"]);
  assert.deepStrictEqual(usage.cells, [
    { date: "2026-11-02", hour: 14, up: 210, down: 90, topNode: "US" },
    { date: "2026-11-03", hour: 14, up: 0, down: 50, topNode: "HK" }
  ], "nodes merge into one cell; empty, out-of-range and invalid-hour rows are dropped");
  assert.strictEqual(usage.profile.length, 24);
  assert.deepStrictEqual(usage.profile[14], { hour: 14, up: 210, down: 140 });
  assert.deepStrictEqual(usage.dates, ["2026-11-02", "2026-11-03"]);
}

// A hub node's billing key rolls up to its machine; each node key has its own multiplier.
{
  const { billingMachineGuid } = require("./xui-traffic");
  assert.strictEqual(billingMachineGuid("hub-m3-n12"), "hub-m3");
  assert.strictEqual(billingMachineGuid("hub-m3"), "hub-m3");
  assert.strictEqual(billingMachineGuid("node-hk"), "node-hk");
  assert.strictEqual(weightedBytes({ "hub-m3-n12": 100, "hub-m3-n13": 100 }, { "hub-m3": 5, "hub-m3-n12": 2 }), 300, "node keys never take the machine key's multiplier");
}

const { xuiLedgerFromCycle } = require("./xui-traffic");
const led = xuiLedgerFromCycle({ a: 100, b: 200 }, { a: 1, b: 2 }, { cycleKey: "2026-01-01", nodeNames: { a: "LA" }, updatedAt: "t" });
assert.strictEqual(led.rawBytes, 300);
assert.strictEqual(led.weightedBytes, 100 + 400);
assert.strictEqual(led.nodes.a.name, "LA");
assert.deepStrictEqual(led.trafficAlerts, {}, "fresh ledger has empty alerts");
assert.strictEqual(led.disabled, false);
// same cycle → carry alerts + disabled
const carried = xuiLedgerFromCycle({ a: 100 }, {}, { cycleKey: "2026-01-01", previous: { cycleKey: "2026-01-01", disabled: true, trafficAlerts: { "80": ["adminMail"] } } });
assert.strictEqual(carried.disabled, true, "same cycle carries disabled");
assert.deepStrictEqual(carried.trafficAlerts, { "80": ["adminMail"] }, "same cycle carries alerts");
assert.strictEqual(carried.cycleReset, false);
// new cycle → reset alerts + disabled
const rolled = xuiLedgerFromCycle({ a: 100 }, {}, { cycleKey: "2026-02-01", previous: { cycleKey: "2026-01-01", disabled: true, trafficAlerts: { "80": ["adminMail"] } } });
assert.strictEqual(rolled.disabled, false, "new cycle clears disabled");
assert.deepStrictEqual(rolled.trafficAlerts, {}, "new cycle clears alerts");
assert.strictEqual(rolled.cycleReset, true);

// accountNodeUsage: public names, merged duplicates, top-N series, "other" fold, zero-filled days.
const { accountNodeUsage } = require("./xui-traffic");
{
  const labels = new Map([["g1", "香港 01"], ["g2", "日本 01"], ["g3", "香港 01"], ["g4", "美国 01"]]);
  const usage = accountNodeUsage([
    { date: "2026-09-01", nodeGuid: "g1", bytes: 100 },
    { date: "2026-09-01", nodeGuid: "g3", bytes: 50 },
    { date: "2026-09-02", nodeGuid: "g2", bytes: 120 },
    { date: "2026-09-02", nodeGuid: "g4", bytes: 10 },
    { date: "2026-09-02", nodeGuid: "internal", bytes: 7 },
    { date: "2026-08-31", nodeGuid: "g1", bytes: 999 }
  ], labels, ["2026-09-01", "2026-09-02", "2026-09-03"], 2);
  assert.deepStrictEqual(usage.nodes, [
    { key: "node1", name: "香港 01", usedBytes: 150 },
    { key: "node2", name: "日本 01", usedBytes: 120 },
    { key: "other", name: "其他节点", usedBytes: 17 }
  ], "same-name nodes merge, past maxSeries and unnamed nodes fold into other, out-of-range dates ignored");
  assert.deepStrictEqual(usage.days, [
    { date: "2026-09-01", usedBytes: 150, nodes: { node1: 150 } },
    { date: "2026-09-02", usedBytes: 137, nodes: { node2: 120, other: 17 } },
    { date: "2026-09-03", usedBytes: 0, nodes: {} }
  ]);
  assert.deepStrictEqual(accountNodeUsage([], labels, ["2026-09-01"]), { days: [], nodes: [] }, "no usage gives no days");
  const trimmed = accountNodeUsage([{ date: "2026-09-02", nodeGuid: "g1", bytes: 5 }], labels, ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03"]);
  assert.deepStrictEqual(trimmed.days.map(day => day.date), ["2026-09-02", "2026-09-03"], "days start at the first date with usage and run to the last date");
}

// applyCycleBaseline: a plan bought mid-day counts from exactly zero. Production case: paid at
// 20:51 China time on 2026-10-02; the window from "2026-10-02" already held 18.5 GB of that
// day's earlier traffic and the new plan showed it as used.
{
  const { applyCycleBaseline } = require("./xui-traffic");
  const paidAt = Date.parse("2026-10-02T12:51:32Z");
  const purchaseDay = { LA: { up: 9228293383, down: 5982208890 }, HKZ: { up: 1927373937, down: 1358491029 } };
  const pending = { fromDate: "2026-10-02", requestedAt: new Date(paidAt).toISOString(), nodes: null };
  assert.deepStrictEqual(
    applyCycleBaseline(purchaseDay, null, { fromDate: "2026-10-02", roundStartedAt: paidAt + 60000 }).usage,
    purchaseDay,
    "without a baseline the whole purchase day counts (the reported bug)"
  );
  const early = applyCycleBaseline(purchaseDay, pending, { fromDate: "2026-10-02", roundStartedAt: paidAt - 1000 });
  assert.deepStrictEqual(early, { usage: {}, baseline: pending }, "a round that read counters before the purchase cannot settle it; nothing is billed yet");
  const settled = applyCycleBaseline(purchaseDay, pending, { fromDate: "2026-10-02", roundStartedAt: paidAt + 1000 });
  assert.deepStrictEqual(settled.usage, {}, "the first round after the purchase starts the plan at zero");
  assert.deepStrictEqual(settled.baseline.nodes, purchaseDay);
  const later = applyCycleBaseline(
    { LA: { up: 9228293383, down: 5982208890 + 500 }, HKZ: { up: 1927373937 + 300, down: 1358491029 }, JP: { up: 7, down: 0 } },
    settled.baseline,
    { fromDate: "2026-10-02", roundStartedAt: paidAt + 600000 }
  );
  assert.deepStrictEqual(later.usage, { LA: { up: 0, down: 500 }, HKZ: { up: 300, down: 0 }, JP: { up: 7, down: 0 } }, "only post-purchase growth is billed, including new nodes and later days");
  assert.deepStrictEqual(
    applyCycleBaseline(purchaseDay, settled.baseline, { fromDate: "2026-11-01", roundStartedAt: paidAt }),
    { usage: purchaseDay, baseline: null },
    "a baseline from another cycle is dropped"
  );
}

async function checkApplicationTrafficStore() {
  const store = createDataStore({ databaseUrl: "postgres://test:test@127.0.0.1/test" });
  let pruned;
  store.pool = { async query(sql, params) { pruned = { sql: String(sql), params }; return { rowCount: 4 }; } };
  assert.deepStrictEqual(await store.pruneXuiHourlyTraffic(Date.parse("2026-08-05T00:00:00Z")), { deleted: 4 });
  assert.ok(pruned.sql.includes("DELETE FROM xui_hourly_traffic WHERE hour < $1"));
  assert.deepStrictEqual(pruned.params, ["2026-08-05T00:00:00.000Z"]);

  store.pool = {
    async query(sql, params) {
      assert.ok(String(sql).includes("FROM xui_daily_traffic WHERE date BETWEEN $1 AND $2"));
      assert.deepStrictEqual(params, ["2026-09-01", "2026-09-15"]);
      return { rows: [{ date: "2026-09-15", email: "user@example.com", node_guid: "hk", user_id: "u1", user_label: "U1", plan_id: "pro", node_name: "Hong Kong", up_bytes: "30", down_bytes: "60" }] };
    }
  };
  assert.deepStrictEqual(await store.xuiTrafficRange("2026-09-01", "2026-09-15"), [{ date: "2026-09-15", email: "user@example.com", nodeGuid: "hk", userId: "u1", userLabel: "U1", planId: "pro", nodeName: "Hong Kong", inBytes: 30, outBytes: 60 }]);
}

checkApplicationTrafficStore()
  .then(() => console.log("xui-traffic pure-function and application-store checks passed."))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
