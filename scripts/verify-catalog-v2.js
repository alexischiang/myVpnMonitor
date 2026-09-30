const { spawnSync } = require("node:child_process");
const { Client } = require("pg");
const { loadLocalEnv } = require("../env");

// npm is npm.cmd on Windows, which spawnSync cannot start without a shell, so run npm's own CLI
// (npm_execpath, set by `npm run`) through the current node binary on every platform.
function runNpmScript(script, env) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("Run this through `npm run verify:catalog-v2` so the npm CLI path is known.");
  return spawnSync(process.execPath, [npmCli, "run", script], { cwd: process.cwd(), env, stdio: "inherit" });
}

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
    for (const [script, label] of [["test:payment", "Payment"], ["test:wallet", "Wallet"], ["test:catalog-v2", "Catalog V2"]]) {
      const result = runNpmScript(script, isolatedEnv);
      if (result.status !== 0) throw new Error(`${label} tests failed with exit code ${result.status}${result.error ? ` (${result.error.message})` : ""}.`);
    }
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
