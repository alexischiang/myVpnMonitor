const assert = require("assert");
const {
  RESET_INTERVAL_DAYS,
  MS_PER_DAY,
  counterDelta,
  directionalDelta,
  isPeriodicPlan,
  cycleStartMs,
  xuiMultiplier,
  sumRawBytes,
  weightedBytes,
  perNodeTotals,
  isTrafficPackActive,
  effectiveQuotaBytes
} = require("./xui-traffic");

// counterDelta: growth, reset detection, first observation
assert.strictEqual(counterDelta(150, 100), 50, "normal growth = difference");
assert.strictEqual(counterDelta(100, 100), 0, "no change = 0");
assert.strictEqual(counterDelta(30, 500), 30, "counter dropped (reset) → current value is the new usage");
assert.strictEqual(counterDelta(0, 500), 0, "reset to 0 → 0");
assert.strictEqual(counterDelta(50, null), 0, "first observation → seed only, no delta");
assert.strictEqual(counterDelta(-5, 100), 0, "negative current clamped to 0");

// directionalDelta: per-direction, first observation, mixed reset
assert.deepStrictEqual(directionalDelta({ up: 120, down: 240 }, { up: 100, down: 200 }), { up: 20, down: 40 });
assert.deepStrictEqual(directionalDelta({ up: 5, down: 240 }, { up: 100, down: 200 }), { up: 5, down: 40 }, "up reset, down grew");
assert.deepStrictEqual(directionalDelta({ up: 10, down: 20 }, null), { up: 0, down: 0 }, "first observation records nothing");

// isPeriodicPlan
assert.strictEqual(isPeriodicPlan({ duration: "monthly" }), true);
assert.strictEqual(isPeriodicPlan({ duration: "yearly" }), true);
assert.strictEqual(isPeriodicPlan({ duration: "lifetime" }), false);
assert.strictEqual(isPeriodicPlan({ duration: "monthly", unlimited: true }), false);

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

// traffic pack scoping and quota
assert.strictEqual(isTrafficPackActive("cycle-1", "cycle-1"), true);
assert.strictEqual(isTrafficPackActive("cycle-1", "cycle-2"), false, "pack from a previous cycle expired");
assert.strictEqual(isTrafficPackActive("", "cycle-1"), false, "no pack");
assert.strictEqual(effectiveQuotaBytes(100, 50, true), 150, "active pack adds to quota");
assert.strictEqual(effectiveQuotaBytes(100, 50, false), 100, "inactive pack ignored");
assert.strictEqual(effectiveQuotaBytes(0, 50, true), 0, "unlimited plan (0) stays unlimited");

// xuiLedgerFromCycle: shape, weighting, cycle carry-over
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

console.log("xui-traffic pure-function checks passed.");
