const fs = require("fs");
const path = require("path");
const { loadLocalEnv } = require("../env");
const { createDataStore } = require("../database");
const { migrateUsers } = require("../commerce/catalog-v2-migration");

function argument(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

async function main() {
  loadLocalEnv();
  const mappingPath = argument("mapping");
  if (!mappingPath) throw new Error("必须通过 --mapping 指定迁移映射 JSON 文件。");
  const absoluteMappingPath = path.resolve(process.cwd(), mappingPath);
  const manifest = JSON.parse(fs.readFileSync(absoluteMappingPath, "utf8"));
  if (!Array.isArray(manifest.mappings)) throw new Error("迁移映射文件必须包含 mappings 数组。");

  const localUrl = process.env.LOCAL_DATABASE_URL || "";
  const databaseUrl = localUrl || process.env.DATABASE_URL || "";
  if (!databaseUrl) throw new Error("DATABASE_URL 或 LOCAL_DATABASE_URL 未配置。");
  const databaseHost = new URL(databaseUrl).host;
  const apply = process.argv.includes("--apply");
  if (apply && argument("confirm-host") !== databaseHost) throw new Error(`应用迁移前必须传入 --confirm-host=${databaseHost}`);

  const store = createDataStore({ databaseUrl, ssl: !localUrl && process.env.DATABASE_SSL === "true" });
  await store.init();
  try {
    const state = await store.loadAll();
    const products = await store.listCatalogV2Products();
    const migrationId = String(manifest.migrationId || "catalog-v2-user-binding-v1");
    const result = migrateUsers({ users: state.users || [], products, mappings: manifest.mappings, migrationId });
    console.log(JSON.stringify({ databaseHost, mappingFile: absoluteMappingPath, apply, ...result.report }, null, 2));
    if (result.report.failed.length) {
      for (const failure of result.report.failed) console.error(`BLOCKED ${failure.userId || "mapping"}: ${failure.reason}`);
      throw new Error("迁移预检未通过；未写入任何用户数据。");
    }
    if (!apply) {
      console.log(`Dry run only. Re-run with --apply --confirm-host=${databaseHost} to save changes.`);
      return;
    }
    await store.saveCollection("users", result.users);
    await store.setRecord("migrationState", migrationId, { ...result.report, status: "completed", mappingFile: path.basename(absoluteMappingPath), completedAt: new Date().toISOString() });
    console.log("V2 user binding migration applied.");
  } finally {
    await store.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
