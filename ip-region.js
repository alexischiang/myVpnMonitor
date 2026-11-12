"use strict";

// Offline IP → region lookup on the ip2region databases (scripts/fetch-ip2region.js puts them in
// data/ip2region/). Used to place subscription pulls in a prefecture-level city inside China.
// Missing files or a broken binding turn the lookup off (every IP returns null) instead of failing.

const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const DATA_DIR = process.env.IP2REGION_DIR || path.join(__dirname, "data", "ip2region");

let state = null;

async function load() {
  const searchers = { v4: null, v6: null };
  try {
    const binding = await import("ip2region.js");
    for (const [key, file, version] of [["v4", "ip2region_v4.xdb", binding.IPv4], ["v6", "ip2region_v6.xdb", binding.IPv6]]) {
      const dbPath = path.join(DATA_DIR, file);
      if (!fs.existsSync(dbPath)) continue;
      try {
        binding.verifyFromFile(dbPath);
        // Vector index in memory (512 KB), records read from the file: a few file reads per lookup.
        searchers[key] = binding.newWithVectorIndex(version, dbPath, binding.loadVectorIndexFromFile(dbPath));
      } catch (error) {
        console.error(`[ip-region] ${file} unusable: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`[ip-region] ip2region.js failed to load: ${error.message}`);
  }
  if (!searchers.v4 && !searchers.v6) console.warn(`[ip-region] no ip2region database in ${DATA_DIR}; city lookup is off (run npm run ip2region:update).`);
  return searchers;
}

function ready() {
  state ||= load();
  return state;
}

// ip2region writes "0" for an unknown field.
function field(value) {
  const text = String(value || "").trim();
  return text && text !== "0" ? text : "";
}

// Region strings are "国家|省份|城市|ISP|ISO" (2025+ data); older data had "国家|区域|省份|城市|ISP".
function parseRegion(region) {
  const parts = String(region || "").split("|");
  if (parts.length < 4) return null;
  const [country, a, b, c, d] = parts.map(field);
  const legacy = parts.length === 5 && !/^[A-Z]{2}$/.test(field(parts[4]));
  const result = legacy
    ? { country, province: b, city: c, isp: d, countryCode: "" }
    : { country, province: a, city: b, isp: c, countryCode: d };
  if (!result.countryCode && result.country === "中国") result.countryCode = "CN";
  return result.country || result.province || result.city ? result : null;
}

async function lookupIpRegion(ip) {
  const address = String(ip || "").trim();
  if (!net.isIP(address)) return null;
  const searchers = await ready();
  const searcher = net.isIPv4(address) ? searchers.v4 : searchers.v6;
  if (!searcher) return null;
  try {
    // search() returns a Promise despite its typings.
    return parseRegion(await searcher.search(address));
  } catch {
    return null;
  }
}

module.exports = { lookupIpRegion, parseRegion, ipRegionReady: ready };
