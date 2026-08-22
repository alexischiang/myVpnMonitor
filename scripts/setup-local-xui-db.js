const { Pool } = require("pg");
const { loadLocalEnv, xuiDatabaseUrl } = require("../env");
const { XuiDataStore } = require("../xui-database");

loadLocalEnv();

async function main() {
  if (!process.env.LOCAL_DATABASE_URL) throw new Error("LOCAL_DATABASE_URL is required.");
  const sourceUrl = new URL(process.env.LOCAL_DATABASE_URL);
  const targetUrl = new URL(xuiDatabaseUrl());
  const databaseName = targetUrl.pathname.slice(1);
  if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) throw new Error("Derived 3x-ui database name is invalid.");

  const admin = new Pool({ connectionString: sourceUrl.toString() });
  try {
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
    if (!existing.rows[0]) await admin.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end();
  }

  const store = new XuiDataStore(targetUrl.toString(), false);
  try {
    await store.init();
  } finally {
    await store.close();
  }
  console.log(`Local 3x-ui database is ready: ${databaseName}`);
}

if (require.main === module) main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
