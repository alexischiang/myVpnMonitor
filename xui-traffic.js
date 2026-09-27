// Pure, side-effect-free helpers for 3x-ui per-node traffic accounting.
//
// The `xui_daily_traffic` table (see database.js) is the single source of truth:
// one row per (date, user, node) holding that day's raw up/down bytes. These
// functions are the composable building blocks around it — counter→delta,
// billing-cycle math, quota and weighting — with no I/O so they stay unit-testable
// and reusable. The DB layer imports the delta helper; the refresh loop composes
// the rest by passing values in.

const RESET_INTERVAL_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// --- counter deltas -------------------------------------------------------

// A 3x-ui client counter is cumulative and only grows until the panel resets it
// (manual reset, scheduled inbound reset, client re-create, node rebuild). We do
// NOT reset it ourselves, but those external resets still happen, so a value that
// dropped below the last reading means a reset occurred and the current value is
// itself the post-reset usage. `last == null` is the first observation of a
// (user,node): we seed the cursor but record no delta (fresh start).
function counterDelta(current, last) {
  const cur = Math.max(0, Number(current) || 0);
  if (last == null) return 0;
  const prev = Math.max(0, Number(last) || 0);
  return cur >= prev ? cur - prev : cur;
}

// Directional delta for one (user,node) sample against its stored cursor.
// `cursor` is { up, down } or null/undefined on first observation.
function directionalDelta(current = {}, cursor = null) {
  const prevUp = cursor ? cursor.up : null;
  const prevDown = cursor ? cursor.down : null;
  return {
    up: counterDelta(current.up, prevUp),
    down: counterDelta(current.down, prevDown)
  };
}

// --- billing cycle --------------------------------------------------------

// Periodic (monthly/quarterly/half-yearly/yearly) plans reset traffic on a fixed
// cadence; lifetime and unlimited plans never reset.
function isPeriodicPlan(user = {}) {
  return !user.unlimited && user.duration !== "lifetime";
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

// --- quota & weighting ----------------------------------------------------

function xuiMultiplier(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 1;
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

// The central panel reports each client's GLOBAL total on the local node's inbounds (mirrored on
// every inbound), NOT the local node's own usage. Remote nodes are read from their own APIs and
// give real per-node usage. So the collected local-node figure = LA-real + Σremotes; subtract the
// remotes (per direction) to recover the local node's own usage, otherwise remote traffic is
// counted twice. Mutates and returns the { email: { guid: { inBytes, outBytes } } } map.
function deductRemotesFromLocalNode(directionalByUser = {}, localGuid) {
  for (const byNode of Object.values(directionalByUser)) {
    const local = byNode?.[localGuid];
    if (!local) continue;
    let remoteIn = 0;
    let remoteOut = 0;
    for (const [guid, dir] of Object.entries(byNode)) {
      if (guid === localGuid) continue;
      remoteIn += Math.max(0, Number(dir?.inBytes) || 0);
      remoteOut += Math.max(0, Number(dir?.outBytes) || 0);
    }
    byNode[localGuid] = {
      inBytes: Math.max(0, (Number(local.inBytes) || 0) - remoteIn),
      outBytes: Math.max(0, (Number(local.outBytes) || 0) - remoteOut)
    };
  }
  return directionalByUser;
}

// Plan B — derive the local (panel) node's per-round usage in DELTA space.
//
// The panel has no independent per-user counter for its own node: it reports each
// client's GLOBAL total (LA-own + Σremotes) under the local guid, mirrored on every
// inbound. Subtracting remotes in ABSOLUTE space (deductRemotesFromLocalNode) yields a
// residual that legitimately falls whenever the central-global read lags the live
// per-remote reads — and feeding that bouncy residual to counterDelta makes every dip
// look like a counter reset, re-counting the full value and ballooning the local node
// (observed in prod: LA-BWH daily accrued ~20x its real usage).
//
// Instead, given ONE sampling round's monotonic per-node delta map for ONE user
// (local guid = Δglobal, each remote = its own Δ), set the local node's delta to
// max(0, Δglobal − ΣΔremote). Both operands are monotonic counters, so their per-round
// deltas are always well-defined; the read-lag now nets out across rounds instead of
// exploding. Remotes pass through unchanged. Mutates and returns the { guid: { up, down } } map.
function applyLocalNodeDelta(perNodeDelta = {}, localGuid) {
  if (!localGuid || !perNodeDelta[localGuid]) return perNodeDelta;
  let remoteUp = 0;
  let remoteDown = 0;
  for (const [guid, d] of Object.entries(perNodeDelta)) {
    if (guid === localGuid) continue;
    remoteUp += Math.max(0, Number(d?.up) || 0);
    remoteDown += Math.max(0, Number(d?.down) || 0);
  }
  const global = perNodeDelta[localGuid];
  perNodeDelta[localGuid] = {
    up: Math.max(0, (Number(global.up) || 0) - remoteUp),
    down: Math.max(0, (Number(global.down) || 0) - remoteDown)
  };
  return perNodeDelta;
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

module.exports = {
  accountNodeUsage,
  RESET_INTERVAL_DAYS,
  MS_PER_DAY,
  deductRemotesFromLocalNode,
  applyLocalNodeDelta,
  counterDelta,
  directionalDelta,
  isPeriodicPlan,
  cycleStartMs,
  xuiMultiplier,
  sumRawBytes,
  weightedBytes,
  perNodeTotals,
  isTrafficPackActive,
  effectiveQuotaBytes,
  xuiLedgerFromCycle
};
