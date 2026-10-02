const assert = require("assert");
const { createDataStore } = require("./database");
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

// deductRemotesFromLocalNode: local node holds the mirrored GLOBAL total → subtract remotes.
const { deductRemotesFromLocalNode } = require("./xui-traffic");
// user on TW(2309) only; local(LA) reports global 3022 = LA-real(713)+TW(2309) → LA becomes 713.
const d1 = deductRemotesFromLocalNode({ "u@x": { LA: { inBytes: 1000, outBytes: 2022 }, TW: { inBytes: 900, outBytes: 1409 } } }, "LA");
assert.deepStrictEqual(d1["u@x"].LA, { inBytes: 100, outBytes: 613 }, "LA = global - remote per direction");
assert.deepStrictEqual(d1["u@x"].TW, { inBytes: 900, outBytes: 1409 }, "remote untouched");
// global == remote (user only on one remote) → LA collapses to 0 (was pure double-count)
const d2 = deductRemotesFromLocalNode({ "u@x": { LA: { inBytes: 900, outBytes: 1409 }, TW: { inBytes: 900, outBytes: 1409 } } }, "LA");
assert.deepStrictEqual(d2["u@x"].LA, { inBytes: 0, outBytes: 0 }, "LA=global=remote → LA becomes 0");
// global < remotes (central lag) → clamp to 0, never negative
const d3 = deductRemotesFromLocalNode({ "u@x": { LA: { inBytes: 10, outBytes: 10 }, TW: { inBytes: 50, outBytes: 50 } } }, "LA");
assert.deepStrictEqual(d3["u@x"].LA, { inBytes: 0, outBytes: 0 }, "negative clamped to 0");
// no local node entry → untouched
const d4 = deductRemotesFromLocalNode({ "u@x": { TW: { inBytes: 5, outBytes: 5 } } }, "LA");
assert.deepStrictEqual(d4["u@x"], { TW: { inBytes: 5, outBytes: 5 } }, "no local → untouched");

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

// localNodeRound: the local node's usage = signed global growth − signed remote growth + carry.
const { localNodeRound } = require("./xui-traffic");
assert.deepStrictEqual(
  localNodeRound({ current: { up: 110, down: 220 }, cursor: { up: 100, down: 200 }, remoteChange: { up: 3, down: 5 } }),
  { delta: { up: 7, down: 15 }, carry: { up: 0, down: 0 }, cursor: { up: 110, down: 220 } },
  "local = global growth − remote growth"
);
assert.deepStrictEqual(
  localNodeRound({ current: { up: 100, down: 200 }, cursor: { up: 100, down: 200 }, remoteChange: { up: 5, down: 0 } }),
  { delta: { up: 0, down: 0 }, carry: { up: -5, down: 0 }, cursor: { up: 100, down: 200 } },
  "global lag becomes a carried deficit instead of being dropped"
);
assert.deepStrictEqual(
  localNodeRound({ current: { up: 108, down: 200 }, cursor: { up: 100, down: 200 }, carry: { up: -5, down: 0 } }).delta,
  { up: 3, down: 0 },
  "the carried deficit absorbs the late global growth"
);
assert.deepStrictEqual(
  localNodeRound({ current: { up: 10, down: 10 }, cursor: { up: 1000, down: 1000 }, remoteChange: { up: -990, down: -990 } }).delta,
  { up: 0, down: 0 },
  "a restarted remote and the matching global drop cancel"
);
assert.deepStrictEqual(
  localNodeRound({ current: { up: 500, down: 500 }, cursor: { up: 100, down: 100 }, remoteChange: { up: 50, down: 0 }, held: true }),
  { delta: { up: 0, down: 0 }, carry: { up: -50, down: 0 }, cursor: null },
  "held round: global cursor stays, readable remote growth is carried"
);
assert.deepStrictEqual(
  localNodeRound({ current: { up: 40, down: 60 } }),
  { delta: { up: 0, down: 0 }, carry: { up: 0, down: 0 }, cursor: { up: 40, down: 60 } },
  "first observation only seeds the cursor"
);

async function checkApplicationTrafficStore() {
  let dailyInsert;
  const client = {
    async query(sql, params) {
      if (String(sql).includes("SELECT email, node_guid, last_up, last_down")) return { rows: [{ email: "user@example.com", node_guid: "hk", last_up: "100", last_down: "200" }] };
      if (String(sql).includes("INSERT INTO xui_daily_traffic")) dailyInsert = { sql: String(sql), params };
      return { rows: [] };
    },
    release() {}
  };
  const store = createDataStore({ databaseUrl: "postgres://test:test@127.0.0.1/test" });
  store.pool = { connect: async () => client };
  const recorded = await store.recordXuiTrafficSamples("2026-09-15", [{ email: "user@example.com", nodeGuid: "hk", userId: "u1", userLabel: "U1", planId: "pro", nodeName: "Hong Kong", up: 130, down: 260 }], "hk");
  assert.deepStrictEqual(recorded, { applied: 1, seeded: 0 });
  assert.ok(dailyInsert.sql.includes("user_id, user_label, plan_id, node_name"));
  assert.deepStrictEqual(dailyInsert.params, ["2026-09-15", ["user@example.com"], ["hk"], ["u1"], ["U1"], ["pro"], ["Hong Kong"], [30], [60]]);

  store.pool = {
    async query(sql, params) {
      assert.ok(String(sql).includes("FROM xui_daily_traffic WHERE date BETWEEN $1 AND $2"));
      assert.deepStrictEqual(params, ["2026-09-01", "2026-09-15"]);
      return { rows: [{ date: "2026-09-15", email: "user@example.com", node_guid: "hk", user_id: "u1", user_label: "U1", plan_id: "pro", node_name: "Hong Kong", up_bytes: "30", down_bytes: "60" }] };
    }
  };
  assert.deepStrictEqual(await store.xuiTrafficRange("2026-09-01", "2026-09-15"), [{ date: "2026-09-15", email: "user@example.com", nodeGuid: "hk", userId: "u1", userLabel: "U1", planId: "pro", nodeName: "Hong Kong", inBytes: 30, outBytes: 60 }]);
}

// In-memory stand-in for the sampler's three queries, so several sampling rounds can run
// back to back through the real recordXuiTrafficSamples.
function memoryTrafficStore() {
  const cursors = new Map();
  const daily = new Map();
  const client = {
    async query(sql, params) {
      const text = String(sql);
      if (text.includes("FROM xui_traffic_cursor")) {
        return { rows: [...cursors.values()].filter(row => params[0].includes(row.email)) };
      }
      if (text.includes("INSERT INTO xui_daily_traffic")) {
        const [date, emails, nodes] = params;
        const ups = params[params.length - 2];
        const downs = params[params.length - 1];
        emails.forEach((email, index) => {
          const key = `${date} ${email} ${nodes[index]}`;
          const row = daily.get(key) || { up: 0, down: 0 };
          daily.set(key, { up: row.up + Number(ups[index]), down: row.down + Number(downs[index]) });
        });
      }
      if (text.includes("INSERT INTO xui_traffic_cursor")) {
        const [emails, nodes, ups, downs, carryUps, carryDowns] = params;
        emails.forEach((email, index) => {
          cursors.set(`${email} ${nodes[index]}`, {
            email,
            node_guid: nodes[index],
            last_up: String(ups[index]),
            last_down: String(downs[index]),
            carry_up: String(carryUps ? carryUps[index] : 0),
            carry_down: String(carryDowns ? carryDowns[index] : 0)
          });
        });
      }
      return { rows: [] };
    },
    release() {}
  };
  const store = createDataStore({ databaseUrl: "postgres://test:test@127.0.0.1/test" });
  store.pool = { connect: async () => client };
  const total = node => [...daily].filter(([key]) => key.endsWith(` ${node}`)).reduce((sum, [, row]) => sum + row.up + row.down, 0);
  const round = (counters, options) => store.recordXuiTrafficSamples("2026-10-02", Object.entries(counters).map(([nodeGuid, bytes]) => ({ email: "u@x", nodeGuid, up: bytes, down: 0 })), "LA", options);
  return { round, total };
}

// The local node (LA) carries the client's GLOBAL counter = LA-own + Σremotes. In every
// scenario below the client never touches LA, so LA must stay at 0 and each remote must
// record exactly its own growth.
async function checkLocalNodeDerivation() {
  {
    // A remote node read fails for a round while the panel keeps counting its traffic.
    const sim = memoryTrafficStore();
    await sim.round({ LA: 1000, HK: 1000 });
    await sim.round({ LA: 6000 }, { localHeld: true });
    await sim.round({ LA: 6000, HK: 6000 });
    assert.strictEqual(sim.total("HK"), 5000, "remote records its own growth once it is readable again");
    assert.strictEqual(sim.total("LA"), 0, "a failed remote read must not move its traffic onto LA");
  }
  {
    // The panel's global counter briefly drops a remote's share (node unreachable from the
    // panel or the client record briefly missing), then regains it. Production signature:
    // LA accrued ≈ the remote's cumulative counter in one day.
    const sim = memoryTrafficStore();
    await sim.round({ LA: 9500, HK: 9000, US: 500 });
    await sim.round({ LA: 500, HK: 9000, US: 500 });
    await sim.round({ LA: 9500, HK: 9000, US: 500 });
    assert.strictEqual(sim.total("LA"), 0, "a transient dip in the global counter must not be re-counted on LA");
  }
  {
    // The global read lags the per-node reads by a round.
    const sim = memoryTrafficStore();
    await sim.round({ LA: 100, HK: 100 });
    await sim.round({ LA: 120, HK: 150 });
    await sim.round({ LA: 150, HK: 150 });
    assert.strictEqual(sim.total("HK"), 50);
    assert.strictEqual(sim.total("LA"), 0, "global read lag nets out across rounds");
  }
  {
    // A remote client is re-created (its counter restarts) and the global drops with it.
    const sim = memoryTrafficStore();
    await sim.round({ LA: 1000, HK: 1000 });
    await sim.round({ LA: 10, HK: 10 });
    assert.strictEqual(sim.total("HK"), 10, "a remote counter reset counts the post-reset usage");
    assert.strictEqual(sim.total("LA"), 0);
  }
  {
    // Real LA usage is still counted, including after a held round.
    const sim = memoryTrafficStore();
    await sim.round({ LA: 1000, HK: 1000 });
    await sim.round({ LA: 1300, HK: 1200 });
    await sim.round({ LA: 1500 }, { localHeld: true });
    await sim.round({ LA: 1700, HK: 1400 });
    assert.strictEqual(sim.total("HK"), 400);
    assert.strictEqual(sim.total("LA"), 300, "LA-own growth = global growth minus remote growth");
  }
}

checkApplicationTrafficStore()
  .then(checkLocalNodeDerivation)
  .then(() => console.log("xui-traffic pure-function and application-store checks passed."))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
