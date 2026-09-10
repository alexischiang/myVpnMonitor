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

module.exports = {
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
  effectiveQuotaBytes,
  xuiLedgerFromCycle
};
