#!/usr/bin/env node
// Downloads the ip2region IPv4/IPv6 databases (github.com/lionsoul2014/ip2region) into data/ip2region/,
// used to place subscription pulls in a prefecture-level city (ip-region.js). data/ is gitignored.
//
//   node scripts/fetch-ip2region.js                 download both files
//   node scripts/fetch-ip2region.js --max-age-days 30  only when missing or older than 30 days (deploy uses this)
//
// Each file is written to a temp path, checked with the binding's verifyFromFile, then renamed in place,
// so a failed or partial download never replaces a working database.

const fs = require("node:fs");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");

const DATA_DIR = path.join(__dirname, "..", "data", "ip2region");
const BASE_URL = process.env.IP2REGION_BASE_URL || "https://raw.githubusercontent.com/lionsoul2014/ip2region/master/data";
const FILES = ["ip2region_v4.xdb", "ip2region_v6.xdb"];

function maxAgeDays() {
  const index = process.argv.indexOf("--max-age-days");
  return index >= 0 ? Number(process.argv[index + 1]) : 0;
}

function isFresh(file, days) {
  if (!days) return false;
  try {
    return Date.now() - fs.statSync(file).mtimeMs < days * 86400000;
  } catch {
    return false;
  }
}

async function download(name) {
  const target = path.join(DATA_DIR, name);
  const temp = `${target}.download`;
  const response = await fetch(`${BASE_URL}/${name}`, { signal: AbortSignal.timeout(300000) });
  if (!response.ok || !response.body) throw new Error(`${name}: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temp));
  const { verifyFromFile } = await import("ip2region.js");
  try {
    verifyFromFile(temp);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw new Error(`${name}: downloaded file failed verification (${error.message})`);
  }
  fs.renameSync(temp, target);
  return fs.statSync(target).size;
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const days = maxAgeDays();
  for (const name of FILES) {
    const target = path.join(DATA_DIR, name);
    if (isFresh(target, days)) {
      console.log(`[ip2region] ${name} is newer than ${days} days, kept.`);
      continue;
    }
    const size = await download(name);
    console.log(`[ip2region] ${name} updated (${(size / 1048576).toFixed(1)} MB).`);
  }
}

main().catch(error => {
  console.error(`[ip2region] ${error.message}`);
  process.exit(1);
});
