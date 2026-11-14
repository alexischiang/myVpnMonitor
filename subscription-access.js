"use strict";

// Subscription access log: one row per pull of a user's /sub/<token> link, kept to spot
// links shared with other people (pulls from more than one mainland city).

const net = require("node:net");

const SUBSCRIPTION_ACCESS_RETENTION_DAYS = 90;
const MAX_HEADER_VALUE_LENGTH = 512;

function cleanIp(value) {
  const ip = String(value || "").trim().replace(/^\[|\]$/g, "").replace(/^::ffff:/i, "");
  return net.isIP(ip) ? ip : "";
}

// The site sits behind Cloudflare, then nginx, then this app on loopback. Cloudflare's
// CF-Connecting-IP is the visitor; without it, the last X-Forwarded-For hop is the address the
// nearest proxy saw (earlier hops come from the client and can be forged).
// relayIps: our IPv4-only subscription relay (sub.webprovider.top on hncloud). It reaches us through
// Cloudflare like any visitor and passes the client it saw in X-Sub-Client-IP; only a request that
// really comes from the relay's address may set it.
function subscriptionClientIp(req, { relayIps = [] } = {}) {
  const direct = directClientIp(req);
  if (direct.ip && relayIps.includes(direct.ip)) {
    const relayed = cleanIp(req?.headers?.["x-sub-client-ip"]);
    if (relayed) return { ip: relayed, source: "ipv4-relay" };
  }
  return direct;
}

function directClientIp(req) {
  const headers = req?.headers || {};
  const cf = cleanIp(headers["cf-connecting-ip"]);
  if (cf) return { ip: cf, source: "cf-connecting-ip" };
  const realIp = cleanIp(headers["x-real-ip"]);
  if (realIp) return { ip: realIp, source: "x-real-ip" };
  const forwarded = String(headers["x-forwarded-for"] || "").split(",").map(cleanIp).filter(Boolean);
  if (forwarded.length) return { ip: forwarded[forwarded.length - 1], source: "x-forwarded-for" };
  return { ip: cleanIp(req?.socket?.remoteAddress), source: "socket" };
}

// Every request header except credentials, each value capped so one odd client can't bloat a row.
function headersForAccessLog(headers = {}) {
  const output = {};
  for (const [name, value] of Object.entries(headers || {})) {
    if (/^(authorization|proxy-authorization|cookie)$/i.test(name)) {
      output[name] = "[redacted]";
      continue;
    }
    const text = Array.isArray(value) ? value.join(", ") : String(value ?? "");
    output[name] = text.length > MAX_HEADER_VALUE_LENGTH ? `${text.slice(0, MAX_HEADER_VALUE_LENGTH)}…` : text;
  }
  return output;
}

const CLIENT_PATTERNS = [
  [/clash[ ._-]?verge/i, "Clash Verge"],
  [/flclash/i, "FlClash"],
  [/clash[ ._-]?meta[ ._-]?for[ ._-]?android|clashmetaforandroid|\bcmfa\b/i, "Clash Meta for Android"],
  [/clash[ ._-]?for[ ._-]?windows|\bcfw\b/i, "Clash for Windows"],
  [/clashx/i, "ClashX"],
  [/mihomo[ ._-]?party/i, "Mihomo Party"],
  [/mihomo|clash\.meta|clash-meta/i, "Mihomo"],
  [/stash/i, "Stash"],
  [/shadowrocket/i, "Shadowrocket"],
  [/quantumult/i, "Quantumult X"],
  [/surge/i, "Surge"],
  [/loon/i, "Loon"],
  [/sing-?box|\bSF[AIMT]\b/i, "sing-box"],
  [/hiddify/i, "Hiddify"],
  [/v2rayng/i, "v2rayNG"],
  [/v2rayn/i, "v2rayN"],
  [/nekobox|nekoray/i, "NekoBox"],
  [/karing/i, "Karing"],
  [/clash/i, "Clash"],
  [/curl|wget|python|go-http-client|okhttp|axios|node-fetch/i, "脚本/工具"],
  [/mozilla|chrome|safari|firefox|edg\//i, "浏览器"]
];

function subscriptionClientLabel(userAgent) {
  const ua = String(userAgent || "");
  if (!ua) return "未知";
  for (const [pattern, label] of CLIENT_PATTERNS) if (pattern.test(ua)) return label;
  return ua.split(/[\s/;(]/)[0].slice(0, 40) || "未知";
}

// Hong Kong, Macau and Taiwan are reported with country 中国 by ip2region but are not mainland cities.
const NON_MAINLAND_PROVINCES = new Set(["香港特别行政区", "澳门特别行政区", "台湾省", "香港", "澳门", "台湾"]);
const ALERT_REPEAT_MS = 24 * 3600000;

// ip2region places China Telecom IPv6 and China Unicom mobile IPv6 (and some with no ISP) at the
// carriers' registration in Beijing, wherever the user is: in production every Telecom IPv6 pull read
// 北京市, so a dual-stack phone in Chengdu looked like Chengdu + Beijing. China Mobile IPv6 resolves
// to real cities and is kept.
const CARRIER_REGISTERED_IPV6_ISPS = new Set(["电信", "联通", ""]);
function carrierRegisteredIpv6(row) {
  return net.isIPv6(String(row?.ip || "")) && row.province === "北京市" && CARRIER_REGISTERED_IPV6_ISPS.has(String(row.isp || ""));
}

// A mainland pull's place: { province, city }; null outside mainland China, when the IP is unknown,
// or when the place is only the carrier's IPv6 registration (see above).
function mainlandLocation(row) {
  if (row?.geoCountry !== "中国") return null;
  const province = String(row.province || "");
  if (!province || NON_MAINLAND_PROVINCES.has(province)) return null;
  if (carrierRegisteredIpv6(row)) return null;
  return { province, city: String(row.city || "") };
}

// IPv6 places mainland users poorly, so a mainland IPv6 pull is sent to the same path on the
// IPv4-only relay host (no AAAA record): the client follows the 302 and arrives over IPv4, which
// ip2region places by city. Returns the Location, or "" to serve the pull here. Pulls already relayed,
// abroad, Hong Kong/Macau/Taiwan and IPv4 are served as before.
const IPV4_REDIRECT_RESULT = "ipv4-redirect";
function ipv4RedirectLocation({ baseUrl, path, ip, ipSource, region }) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (!base || ipSource === "ipv4-relay" || !net.isIPv6(String(ip || ""))) return "";
  if (region?.country !== "中国" || !region.province || NON_MAINLAND_PROVINCES.has(region.province)) return "";
  const target = String(path || "");
  if (!/^\/(api\/)?sub\//.test(target)) return "";
  return `${base}${target}`;
}

// Pulls that say where a client is: not through our own nodes, and not the IPv6 half of a redirect
// (the client's IPv4 pull right after it is the one that counts).
function countedPulls(rows, nodeIps = new Set()) {
  return rows.filter(row => !nodeIps.has(row.ip) && row.result !== IPV4_REDIRECT_RESULT);
}

function locationLabel(location) {
  return location.city || `${location.province}（城市未知）`;
}

// Distinct mainland places, at prefecture-city level. A pull known only to province level adds a place
// only when no pull with a known city lies in that province (otherwise it may well be that city).
function distinctCities(rows) {
  const cities = new Map();
  const provinceOnly = new Set();
  for (const row of rows) {
    const location = mainlandLocation(row);
    if (!location) continue;
    if (location.city) cities.set(location.city, location.province);
    else provinceOnly.add(location.province);
  }
  const coveredProvinces = new Set(cities.values());
  return [
    ...[...cities.keys()].sort((a, b) => a.localeCompare(b, "zh-Hans-CN")),
    ...[...provinceOnly].filter(province => !coveredProvinces.has(province)).sort((a, b) => a.localeCompare(b, "zh-Hans-CN")).map(province => locationLabel({ province, city: "" }))
  ];
}

function summarizeWindow(rows) {
  return {
    requests: rows.length,
    ips: new Set(rows.map(row => row.ip).filter(Boolean)).size,
    cities: distinctCities(rows),
    clients: [...new Set(rows.map(row => subscriptionClientLabel(row.userAgent)))].sort()
  };
}

// Consecutive mainland pulls (oldest first) whose city differs from the previous one; the gap between
// them shows how plausible one person travelling is (Shenzhen then Beijing ten minutes later is not).
function cityChanges(rows) {
  const changes = [];
  let previous = null;
  for (const row of [...rows].sort((a, b) => a.at.localeCompare(b.at))) {
    const location = mainlandLocation(row);
    if (!location) continue;
    const label = locationLabel(location);
    if (previous && previous.label !== label && !(previous.location.province === location.province && (!previous.location.city || !location.city))) {
      changes.push({ at: row.at, from: previous.label, to: label, fromIp: previous.ip, ip: row.ip, minutes: Math.round((new Date(row.at) - new Date(previous.at)) / 60000) });
    }
    previous = { label, location, at: row.at, ip: row.ip };
  }
  return changes.reverse();
}

// rows: newest first, each { at, ip, geoCountry, province, city, isp, userAgent }. nodeIps: our own
// machines' addresses; clients that refresh the subscription through the proxy arrive from those, so
// they are listed but left out of the counts. Suspicious: mainland pulls from two or more cities.
function summarizeSubscriptionAccess(rows = [], { now = Date.now(), nodeIps = new Set() } = {}) {
  const nodes = nodeIps instanceof Set ? nodeIps : new Set(nodeIps || []);
  const byIp = new Map();
  for (const row of rows) {
    const key = row.ip || "-";
    const entry = byIp.get(key) || { ip: row.ip || "", geoCountry: row.geoCountry || "", province: row.province || "", city: row.city || "", isp: row.isp || "", count: 0, firstAt: row.at, lastAt: row.at, clients: new Set(), viaNode: nodes.has(row.ip) };
    entry.count += 1;
    if (row.at < entry.firstAt) entry.firstAt = row.at;
    if (row.at > entry.lastAt) entry.lastAt = row.at;
    entry.clients.add(subscriptionClientLabel(row.userAgent));
    byIp.set(key, entry);
  }
  const counted = countedPulls(rows, nodes);
  const since = hours => counted.filter(row => now - new Date(row.at).getTime() <= hours * 3600000);
  const windows = { "24h": summarizeWindow(since(24)), all: summarizeWindow(counted) };
  const hints = [];
  if (windows["24h"].cities.length >= 2) hints.push(`24 小时内从 ${windows["24h"].cities.length} 个城市拉取：${windows["24h"].cities.join("、")}`);
  if (windows.all.cities.length >= 2 && windows.all.cities.length !== windows["24h"].cities.length) hints.push(`所选范围内从 ${windows.all.cities.length} 个城市拉取：${windows.all.cities.join("、")}`);
  return {
    suspicious: windows.all.cities.length >= 2,
    windows,
    hints,
    cityChanges: cityChanges(counted).slice(0, 50),
    viaNodeRequests: rows.filter(row => nodes.has(row.ip)).length,
    ipv4Redirects: rows.filter(row => row.result === IPV4_REDIRECT_RESULT).length,
    ips: [...byIp.values()]
      .map(entry => ({ ...entry, clients: [...entry.clients].sort() }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
  };
}

// Where a user usually pulls from: the place (country, province, city) of the most counted pulls and,
// within it, the carrier seen most. Pulls with no known place and carrier-registered IPv6 (placed at
// Beijing whatever the real city) are left out. Ties go to the place pulled most recently (rows are
// newest first). Returns { geoCountry, province, city, isp, count, total } or null.
function commonPlace(rows = [], nodeIps = new Set()) {
  const nodes = nodeIps instanceof Set ? nodeIps : new Set(nodeIps || []);
  const places = new Map();
  let total = 0;
  for (const row of countedPulls(rows, nodes)) {
    const geoCountry = String(row.geoCountry || "");
    if (!geoCountry || geoCountry === "0" || carrierRegisteredIpv6(row)) continue;
    total += 1;
    const province = String(row.province || "");
    const city = String(row.city || "");
    const key = `${geoCountry}|${province}|${city}`;
    const entry = places.get(key) || { geoCountry, province, city, count: 0, isps: new Map() };
    entry.count += 1;
    const isp = String(row.isp || "");
    if (isp) entry.isps.set(isp, (entry.isps.get(isp) || 0) + 1);
    places.set(key, entry);
  }
  let best = null;
  for (const entry of places.values()) if (!best || entry.count > best.count) best = entry;
  if (!best) return null;
  let isp = "";
  let ispCount = 0;
  for (const [name, count] of best.isps) if (count > ispCount) { isp = name; ispCount = count; }
  return { geoCountry: best.geoCountry, province: best.province, city: best.city, isp, count: best.count, total };
}

// Whether the last 24 hours of pulls (node IPs already removed) warrant a Telegram alert: two or more
// mainland cities, and either no alert in the last 24 hours or a city the last alert did not name.
function crossCityAlert(rows, lastAlert, now = Date.now()) {
  const cities = distinctCities(rows);
  if (cities.length < 2) return { send: false, cities };
  const lastAt = lastAlert?.at ? new Date(lastAlert.at).getTime() : NaN;
  const known = new Set(lastAlert?.cities || []);
  const send = !Number.isFinite(lastAt) || now - lastAt >= ALERT_REPEAT_MS || cities.some(city => !known.has(city));
  return { send, cities };
}

module.exports = {
  SUBSCRIPTION_ACCESS_RETENTION_DAYS,
  IPV4_REDIRECT_RESULT,
  subscriptionClientIp,
  ipv4RedirectLocation,
  countedPulls,
  headersForAccessLog,
  subscriptionClientLabel,
  mainlandLocation,
  distinctCities,
  cityChanges,
  summarizeSubscriptionAccess,
  commonPlace,
  crossCityAlert
};
