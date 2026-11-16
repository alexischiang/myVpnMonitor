"use strict";

// Concurrent multi-location presence: a user whose live connections (node-hub presence, the source
// IPs xboard-node reports per node about every minute) sit in two or more mainland places at the same
// time. Stronger evidence of a shared account than subscription pulls: two devices online at once.
// Sampled every CONCURRENT_SAMPLE_INTERVAL_MS; an episode counts once it is seen in
// CONCURRENT_MIN_SAMPLES consecutive samples, so a Wi-Fi to 4G switch (old and new IP briefly both
// alive) does not.

const { distinctCities, distinctProvinces } = require("./subscription-access");

const CONCURRENT_SAMPLE_INTERVAL_MS = 2 * 60 * 1000;
const CONCURRENT_MIN_SAMPLES = 2;
const CONCURRENT_RETENTION_DAYS = 90;

// One presence entry ({ ipsByNode: { nodeId: [ip] } }) as places: one row per distinct IP with the
// nodes it is connected to. regions: Map ip -> ip2region result; ownIps: our machines and relays
// (a relay without PROXY protocol shows its own address); nodeNames: { nodeId: name }.
function presenceLocations(entry, { regions = new Map(), ownIps = new Set(), nodeNames = {} } = {}) {
  const byIp = new Map();
  for (const [nodeId, ips] of Object.entries(entry?.ipsByNode || {})) {
    for (const raw of Array.isArray(ips) ? ips : []) {
      const ip = String(raw || "").trim();
      if (!ip || ownIps.has(ip)) continue;
      const row = byIp.get(ip) || { ip, ...placeOf(regions.get(ip)), nodes: [] };
      const name = nodeNames[nodeId] || `节点 #${nodeId}`;
      if (!row.nodes.includes(name)) row.nodes.push(name);
      byIp.set(ip, row);
    }
  }
  return [...byIp.values()];
}

function placeOf(region) {
  return { geoCountry: region?.country || "", province: region?.province || "", city: region?.city || "", isp: region?.isp || "" };
}

// What one sample says: "province" (two or more mainland provinces), "city" (two or more cities inside
// one province) or null, with the places. Same mainland rules as subscription pulls: HK/Macau/Taiwan,
// abroad, unknown and carrier-registered IPv6 Beijing do not count.
function observeConcurrent(locations = []) {
  const provinces = distinctProvinces(locations);
  const cities = distinctCities(locations);
  const kind = provinces.length >= 2 ? "province" : cities.length >= 2 ? "city" : null;
  return kind ? { kind, provinces, cities, locations } : null;
}

// One user's running episode across samples. prev: the state from the last sample or null;
// observation: observeConcurrent() of this sample. Returns { state, action }:
//   state null           -> no episode (ended or never started); the caller drops it
//   action "start"       -> the episode just reached CONCURRENT_MIN_SAMPLES: record it, alert/queue it
//   action "upgrade"     -> a recorded city episode now spans provinces: alert it
//   action "update"      -> a recorded episode goes on: refresh its row
//   action null          -> nothing to write yet (still below the sample threshold)
// Places seen during the episode accumulate (an IP keeps its first place and gains nodes).
function advanceConcurrent(prev, observation, now = Date.now()) {
  if (!observation) return { state: null, action: null };
  const at = new Date(now).toISOString();
  const locations = new Map((prev?.locations || []).map(row => [row.ip, { ...row, nodes: [...row.nodes] }]));
  for (const row of observation.locations) {
    const known = locations.get(row.ip);
    if (!known) locations.set(row.ip, { ...row, nodes: [...row.nodes] });
    else for (const node of row.nodes) if (!known.nodes.includes(node)) known.nodes.push(node);
  }
  const merged = [...locations.values()];
  const wasProvince = prev?.kind === "province";
  const kind = wasProvince || observation.kind === "province" ? "province" : "city";
  const state = {
    kind,
    firstAt: prev?.firstAt || at,
    lastAt: at,
    samples: (prev?.samples || 0) + 1,
    provinces: distinctProvinces(merged),
    cities: distinctCities(merged),
    locations: merged,
    eventId: prev?.eventId ?? null
  };
  let action = null;
  if (state.eventId === null) action = state.samples >= CONCURRENT_MIN_SAMPLES ? "start" : null;
  else action = kind === "province" && prev.kind !== "province" ? "upgrade" : "update";
  return { state, action };
}

function minutesBetween(from, to) {
  return Math.max(0, Math.round((new Date(to) - new Date(from)) / 60000));
}

module.exports = {
  CONCURRENT_SAMPLE_INTERVAL_MS,
  CONCURRENT_MIN_SAMPLES,
  CONCURRENT_RETENTION_DAYS,
  presenceLocations,
  observeConcurrent,
  advanceConcurrent,
  minutesBetween
};
