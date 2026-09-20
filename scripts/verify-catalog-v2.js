const { spawnSync } = require("node:child_process");
const { Client } = require("pg");
const { loadLocalEnv } = require("../env");

async function main() {
  loadLocalEnv();
  const source = process.env.LOCAL_DATABASE_URL;
  if (!source) throw new Error("LOCAL_DATABASE_URL is required to create the isolated verification schema.");
  const schemaName = `codex_catalog_v2_test_${Date.now()}`;
  if (!/^codex_catalog_v2_test_\d+$/.test(schemaName)) throw new Error("Unsafe temporary schema name.");
  const testUrl = new URL(source);
  testUrl.searchParams.set("options", `-c search_path=${schemaName}`);
  const client = new Client({ connectionString: source });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schemaName}`);
    const isolatedEnv = {
      ...process.env,
      TEST_DATABASE_URL: testUrl.toString(),
      LOCAL_DATABASE_URL: "",
      DATABASE_SSL: "false",
    };
    const result = spawnSync("npm", ["run", "test:payment"], { cwd: process.cwd(), env: isolatedEnv, encoding: "utf8", stdio: "inherit" });
    if (result.status !== 0) throw new Error(`Payment tests failed with exit code ${result.status}.`);
    const wallet = spawnSync("npm", ["run", "test:wallet"], { cwd: process.cwd(), env: isolatedEnv, encoding: "utf8", stdio: "inherit" });
    if (wallet.status !== 0) throw new Error(`Wallet tests failed with exit code ${wallet.status}.`);
    const catalog = spawnSync("npm", ["run", "test:catalog-v2"], { cwd: process.cwd(), env: isolatedEnv, encoding: "utf8", stdio: "inherit" });
    if (catalog.status !== 0) throw new Error(`Catalog V2 tests failed with exit code ${catalog.status}.`);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    await client.end();
  }
  console.log("Isolated Catalog V2 verification passed and the temporary schema was removed.");
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
