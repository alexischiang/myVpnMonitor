// Pure, side-effect-free helpers for per-node traffic accounting.
//
// The `xui_daily_traffic` table (see database.js) is the single source of truth:
// one row per (date, user, node) holding that day's raw up/down bytes, written by
// node-hub. These functions are the composable building blocks around it —
// billing-cycle math, quota and weighting — with no I/O so they stay unit-testable
// and reusable. The billing round composes them by passing values in.

const RESET_INTERVAL_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// --- billing cycle --------------------------------------------------------

// Periodic (monthly/quarterly/half-yearly/yearly) plans reset traffic on a fixed
// cadence; lifetime and unlimited plans never reset.
function isPeriodicPlan(user = {}) {
  // Unlimited comes from the plan snapshot, the only source of a user's plan.
  return user.v2ProductSnapshot?.trafficBytes !== null && user.duration !== "lifetime";
}

// Traffic resets every `intervalDays` (30) from the purchase instant regardless of
// plan length — a 90-day plan resets 3 times, a 360-day plan 12 times. Returns the
// current cycle's start epoch-ms. Non-periodic plans return the purchase instant
// (usage accumulates over the whole subscription). Caller converts the ms to a
// China-day key for the SUM window.
function cycleStartMs(purchasedAtMs, nowMs, { intervalDays = RESET_INTERVAL_DAYS, periodic = true } = {}) {
  const start = Number(purchasedAtMs);
  if (!Number.isFinite(start)) return null;
  const now = Number(nowMs);
  if (!periodic || !Number.isFinite(now) || now <= start) return start;
  const steps = Math.floor((now - start) / (intervalDays * MS_PER_DAY));
  return start + steps * intervalDays * MS_PER_DAY;
}

// The cycle window sums whole China days from the cycle-start day, so on that day it
// also holds traffic from BEFORE the cycle began (the old plan's usage on the purchase
// day). A cycle baseline removes it: { fromDate, requestedAt, nodes } where `nodes` is the
// per-node { up, down } already in the window when the cycle began.
//
// A new baseline starts with `nodes: null` and is settled by the first sampling round whose
// counter reads started at or after `requestedAt`: everything that round sums is pre-cycle
// or so close to the start that it is given to the customer, so the cycle starts at exactly
// zero and never counts old traffic. Until settled the cycle reports no usage.
//
// `perNode` = { guid: { up, down } } window sums. Returns the usage to bill and the
// baseline to keep (null when it belongs to another cycle and should be dropped).
function applyCycleBaseline(perNode = {}, baseline = null, { fromDate = "", roundStartedAt = 0 } = {}) {
  if (!baseline || !fromDate || baseline.fromDate !== fromDate) return { usage: perNode, baseline: null };
  if (!baseline.nodes) {
    if (!(Number(roundStartedAt) >= Date.parse(baseline.requestedAt))) return { usage: {}, baseline };
    const nodes = Object.fromEntries(Object.entries(perNode).map(([guid, dir]) => [guid, { up: Number(dir?.up) || 0, down: Number(dir?.down) || 0 }]));
    return { usage: {}, baseline: { ...baseline, nodes } };
  }
  const usage = {};
  for (const [guid, dir] of Object.entries(perNode)) {
    const base = baseline.nodes[guid] || {};
    const up = Math.max(0, (Number(dir?.up) || 0) - (Number(base.up) || 0));
    const down = Math.max(0, (Number(dir?.down) || 0) - (Number(base.down) || 0));
    if (up || down) usage[guid] = { up, down };
  }
  return { usage, baseline };
}

// --- quota & weighting ----------------------------------------------------

function xuiMultiplier(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

// node-hub traffic is billed per node under hub-m<machine>-n<node>; for everything else (VPS cost,
// monitor totals, names) it belongs to the machine's key hub-m<machine>.
function billingMachineGuid(guid) {
  const match = /^(hub-m\d+)-n\d+$/.exec(String(guid || ""));
  return match ? match[1] : String(guid || "");
}

// Raw (unweighted) total across a per-node { guid: bytes } map.
function sumRawBytes(perNodeBytes = {}) {
  return Object.values(perNodeBytes).reduce((sum, v) => sum + Math.max(0, Number(v) || 0), 0);
}

// Weighted total: each node's bytes times its multiplier. Multipliers are applied
// at read time from the current table, so a multiplier change reprices history
// (retroactive, per product decision).
function weightedBytes(perNodeBytes = {}, multipliers = {}) {
  return Object.entries(perNodeBytes).reduce(
    (sum, [guid, v]) => sum + Math.max(0, Number(v) || 0) * xuiMultiplier(multipliers[guid]),
    0
  );
}

// Collapse a per-node { guid: { up, down } } map into a per-node { guid: totalBytes } map.
function perNodeTotals(perNodeDirectional = {}) {
  return Object.fromEntries(
    Object.entries(perNodeDirectional).map(([guid, d]) => [
      guid,
      Math.max(0, Number(d?.up) || 0) + Math.max(0, Number(d?.down) || 0)
    ])
  );
}

// A traffic pack only counts in the cycle it was purchased in.
function isTrafficPackActive(packCycleKey, currentCycleKey) {
  return Boolean(packCycleKey) && String(packCycleKey) === String(currentCycleKey);
}

// Effective quota = plan quota (+ active pack). 0 means unlimited → no enforcement.
function effectiveQuotaBytes(planBytes, packBytes = 0, packActive = false) {
  const plan = Math.max(0, Number(planBytes) || 0);
  if (plan === 0) return 0;
  return plan + (packActive ? Math.max(0, Number(packBytes) || 0) : 0);
}

// Build a billing-ledger-shaped object from the current cycle's per-node totals
// (from the daily table), so existing consumers (alerts, xuiWeightedTraffic,
// persisted state) keep their shape. Per-cycle state — the alert-dedupe map and
// the disabled flag — is carried from `previous` while the cycle key is unchanged
// and reset when a new cycle begins. `perNodeBytes` = { guid: totalBytes }.
function xuiLedgerFromCycle(perNodeBytes = {}, multipliers = {}, options = {}) {
  const { cycleKey = "", nodeNames = {}, updatedAt = "", previous = null } = options;
  const sameCycle = Boolean(previous) && previous.cycleKey === cycleKey;
  const nodes = {};
  let rawBytes = 0;
  let weighted = 0;
  for (const [guid, bytes] of Object.entries(perNodeBytes)) {
    const raw = Math.max(0, Number(bytes) || 0);
    const w = Math.round(raw * xuiMultiplier(multipliers[guid]));
    nodes[guid] = { baselineBytes: raw, rawBytes: raw, weightedBytes: w, ...(nodeNames[guid] ? { name: String(nodeNames[guid]) } : {}) };
    rawBytes += raw;
    weighted += w;
  }
  return {
    cycleKey,
    cycleReset: !sameCycle,
    disabled: sameCycle ? previous.disabled === true : false,
    trafficAlerts: sameCycle ? previous.trafficAlerts || {} : {},
    carriedRawBytes: 0,
    carriedWeightedBytes: 0,
    nodes,
    rawBytes,
    weightedBytes: weighted,
    updatedAt
  };
}

// --- account overview -----------------------------------------------------

// Shapes one user's per-node daily rows ({ date, nodeGuid, bytes }) for the overview chart.
// Nodes are named through `labelByGuid` (public inbound names, never internal node remarks) and
// nodes sharing a name merge. The top `maxSeries` names by total keep their own series
// (node1, node2, ...); unnamed nodes and the rest fold into one "other" series. Days run from
// the first date in `dates` with usage through the last date, zero-filled in between (no usage at
// all gives no days). Returns { days: [{ date, usedBytes, nodes: { key: bytes } }],
// nodes: [{ key, name, usedBytes }] } with nodes ordered by usage and "other" last.
function accountNodeUsage(rows = [], labelByGuid = new Map(), dates = [], maxSeries = 5) {
  const inRange = new Set(dates);
  const usable = rows
    .map(row => ({ date: row.date, label: labelByGuid.get(row.nodeGuid) || "", bytes: Math.max(0, Number(row.bytes) || 0) }))
    .filter(row => inRange.has(row.date) && row.bytes > 0);
  const totals = new Map();
  for (const row of usable) if (row.label) totals.set(row.label, (totals.get(row.label) || 0) + row.bytes);
  const named = [...totals.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, maxSeries);
  const keyByLabel = new Map(named.map(([label], index) => [label, `node${index + 1}`]));
  const nodes = named.map(([name, usedBytes], index) => ({ key: `node${index + 1}`, name, usedBytes }));
  const byDate = new Map(dates.map(date => [date, {}]));
  let otherBytes = 0;
  for (const row of usable) {
    const key = keyByLabel.get(row.label) || "other";
    if (key === "other") otherBytes += row.bytes;
    const day = byDate.get(row.date);
    day[key] = (day[key] || 0) + row.bytes;
  }
  if (otherBytes) nodes.push({ key: "other", name: "其他节点", usedBytes: otherBytes });
  const firstUsed = dates.findIndex(date => Object.keys(byDate.get(date)).length);
  return {
    days: (firstUsed < 0 ? [] : dates.slice(firstUsed)).map(date => {
      const dayNodes = byDate.get(date);
      return { date, usedBytes: Object.values(dayNodes).reduce((sum, bytes) => sum + bytes, 0), nodes: dayNodes };
    }),
    nodes
  };
}

// Shapes one user's hourly rows ({ date, hour, nodeName, up, down }) for the admin time-of-day
// charts: one cell per (date, hour) with traffic, carrying its busiest node's name, plus the
// 24-hour profile summed over the range. `dates` (oldest first) bounds the range; rows outside
// it are ignored. Raw bytes, no multipliers.
function hourlyUsage(rows = [], dates = []) {
  const inRange = new Set(dates);
  const cells = new Map();
  const profile = Array.from({ length: 24 }, (_, hour) => ({ hour, up: 0, down: 0 }));
  for (const row of rows) {
    const hour = Number(row.hour);
    if (!inRange.has(row.date) || !Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    const up = Math.max(0, Number(row.up) || 0);
    const down = Math.max(0, Number(row.down) || 0);
    if (!up && !down) continue;
    const key = `${row.date} ${hour}`;
    const cell = cells.get(key) || { date: row.date, hour, up: 0, down: 0, nodes: new Map() };
    cell.up += up;
    cell.down += down;
    const name = String(row.nodeName || row.nodeGuid || "");
    cell.nodes.set(name, (cell.nodes.get(name) || 0) + up + down);
    cells.set(key, cell);
    profile[hour].up += up;
    profile[hour].down += down;
  }
  return {
    dates,
    cells: [...cells.values()].map(({ nodes, ...cell }) => ({
      ...cell,
      topNode: [...nodes.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || ""
    })),
    profile
  };
}

module.exports = {
  accountNodeUsage,
  hourlyUsage,
  RESET_INTERVAL_DAYS,
  MS_PER_DAY,
  isPeriodicPlan,
  cycleStartMs,
  applyCycleBaseline,
  xuiMultiplier,
  billingMachineGuid,
  sumRawBytes,
  weightedBytes,
  perNodeTotals,
  isTrafficPackActive,
  effectiveQuotaBytes,
  xuiLedgerFromCycle
};
