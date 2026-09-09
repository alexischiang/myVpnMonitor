const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

function loadLocalEnv() {
  const content = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match && process.env[match[1].trim()] === undefined) {
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

async function main() {
  loadLocalEnv();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL (Neon) is missing from .env");
  if (!process.env.LOCAL_DATABASE_URL) throw new Error("LOCAL_DATABASE_URL is missing from .env");

  const source = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    max: 1
  });
  const target = new Pool({ connectionString: process.env.LOCAL_DATABASE_URL, max: 1 });

  try {
    const { rows } = await source.query(
      "SELECT collection, id, position, data, updated_at FROM app_records ORDER BY collection, position"
    );
    const { rows: credentialTable } = await source.query("SELECT to_regclass('public.xui_node_credentials') AS table_name");
    const { rows: credentialRows } = credentialTable[0]?.table_name
      ? await source.query("SELECT guid, sealed_token, updated_at FROM xui_node_credentials ORDER BY guid")
      : { rows: [] };
    const client = await target.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TABLE IF NOT EXISTS app_records (
          collection TEXT NOT NULL,
          id TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (collection, id)
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS xui_node_credentials (
          guid TEXT PRIMARY KEY,
          sealed_token TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query("TRUNCATE app_records");
      if (rows.length) {
        await client.query(
          `INSERT INTO app_records (collection, id, position, data, updated_at)
           SELECT u.collection, u.id, u.position, u.data::jsonb, u.updated_at::timestamptz
           FROM UNNEST($1::text[], $2::text[], $3::int[], $4::text[], $5::text[])
             AS u(collection, id, position, data, updated_at)`,
          [
            rows.map(row => row.collection),
            rows.map(row => row.id),
            rows.map(row => row.position),
            rows.map(row => JSON.stringify(row.data)),
            rows.map(row => row.updated_at.toISOString())
          ]
        );
      }
      await client.query("TRUNCATE xui_node_credentials");
      if (credentialRows.length) {
        await client.query(
          `INSERT INTO xui_node_credentials (guid, sealed_token, updated_at)
           SELECT u.guid, u.sealed_token, u.updated_at::timestamptz
           FROM UNNEST($1::text[], $2::text[], $3::text[])
             AS u(guid, sealed_token, updated_at)`,
          [
            credentialRows.map(row => row.guid),
            credentialRows.map(row => row.sealed_token),
            credentialRows.map(row => row.updated_at.toISOString())
          ]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const counts = await target.query(
      "SELECT collection, COUNT(*)::int AS count FROM app_records GROUP BY collection ORDER BY collection"
    );
    for (const row of counts.rows) console.log(`${row.collection}: ${row.count}`);
    console.log(`xui_node_credentials: ${credentialRows.length}`);
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
