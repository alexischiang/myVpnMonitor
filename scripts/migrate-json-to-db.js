const fsSync = require("fs");
const fs = require("fs/promises");
const path = require("path");
const { createDataStore } = require("../database");

function loadLocalEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fsSync.existsSync(envPath)) return;
  const content = fsSync.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function main() {
  loadLocalEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error("请先在 .env 里配置 DATABASE_URL。");
  }

  const root = path.join(__dirname, "..");
  const rowsByCollection = {
    subscriptions: await readJson(path.join(root, "data", "subscriptions.json")),
    users: await readJson(path.join(root, "data", "users.json")),
    bills: await readJson(path.join(root, "data", "bills.json"))
  };

  const store = createDataStore({
    dataDir: path.join(root, "data"),
    databaseUrl: process.env.DATABASE_URL,
    files: {}
  });
  await store.init();

  for (const [collection, rows] of Object.entries(rowsByCollection)) {
    await store.saveCollection(collection, rows);
    console.log(`${collection}: imported ${rows.length} records`);
  }

  console.log("JSON data has been imported to the configured database.");
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
