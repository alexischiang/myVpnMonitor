const fs = require("fs/promises");
const path = require("path");

const COLLECTIONS = ["subscriptions", "users", "bills", "vendors", "presets", "placeholderNodes", "embyUsers", "embyVendors", "pricing"];
const PG_RETRY_ATTEMPTS = Number(process.env.DATABASE_RETRY_ATTEMPTS || 2);
const PG_RETRY_DELAY_MS = Number(process.env.DATABASE_RETRY_DELAY_MS || 500);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryablePgError(error) {
  const codes = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "EAI_AGAIN"]);
  if (codes.has(error?.code)) return true;
  if (Array.isArray(error?.errors) && error.errors.some(item => codes.has(item?.code))) return true;
  return /timeout|terminating connection|connection.*closed/i.test(String(error?.message || ""));
}

async function withPgRetry(operation, label) {
  let lastError;
  for (let attempt = 0; attempt <= PG_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= PG_RETRY_ATTEMPTS || !isRetryablePgError(error)) throw error;
      const waitMs = PG_RETRY_DELAY_MS * (attempt + 1);
      console.warn(`[data] ${label} failed (${error.code || error.message}); retrying in ${waitMs}ms.`);
      await sleep(waitMs);
    }
  }
  throw lastError;
}

class JsonDataStore {
  constructor({ dataDir, files }) {
    this.kind = "json";
    this.dataDir = dataDir;
    this.files = files;
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
    if (process.env.VERCEL === "1") {
      throw new Error("Vercel deployment requires DATABASE_URL; local JSON storage is not supported.");
    }
  }

  async loadCollection(collection) {
    try {
      const raw = await fs.readFile(this.files[collection], "utf8");
      return { rows: JSON.parse(raw), missing: false };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return { rows: [], missing: true };
    }
  }

  async loadAll() {
    const result = { missing: {} };
    for (const collection of COLLECTIONS) {
      const { rows, missing } = await this.loadCollection(collection);
      result[collection] = rows;
      result.missing[collection] = missing;
    }
    return result;
  }

  async saveCollection(collection, rows) {
    await fs.writeFile(this.files[collection], JSON.stringify(rows, null, 2));
  }
}

class PostgresDataStore {
  constructor({ connectionString }) {
    this.kind = "postgres";
    this.connectionString = normalizePostgresUrl(connectionString);
    this.pool = null;
  }

  loadPg() {
    try {
      return require("pg");
    } catch {
      throw new Error("DATABASE_URL is configured, but pg is missing. Please run npm install pg.");
    }
  }

  async init() {
    if (this.pool) return;
    const { Pool } = this.loadPg();
    this.pool = new Pool({
      connectionString: this.connectionString,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
      max: Number(process.env.DATABASE_POOL_MAX || 5)
    });
    await withPgRetry(() => this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_records (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (collection, id)
      )
    `), "postgres init");
  }

  async loadCollection(collection) {
    const result = await withPgRetry(() => this.pool.query(
      "SELECT data FROM app_records WHERE collection = $1 ORDER BY position ASC",
      [collection]
    ), `load ${collection}`);
    return { rows: result.rows.map(row => row.data), missing: false };
  }

  async loadAll() {
    const result = { missing: {} };
    for (const collection of COLLECTIONS) {
      result[collection] = [];
      result.missing[collection] = false;
    }
    const query = "SELECT collection, data FROM app_records WHERE collection = ANY($1::text[]) ORDER BY collection ASC, position ASC";
    const rows = await withPgRetry(() => this.pool.query(query, [COLLECTIONS]), "load all collections");
    for (const row of rows.rows) {
      if (Array.isArray(result[row.collection])) result[row.collection].push(row.data);
    }
    return result;
  }

  async saveCollection(collection, rows) {
    return withPgRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM app_records WHERE collection = $1", [collection]);
        if (rows.length) {
          const ids = [];
          const positions = [];
          const datas = [];
          rows.forEach((row, index) => {
            ids.push(row.id || `${collection}-${index}`);
            positions.push(index);
            datas.push(JSON.stringify(row));
          });
          await client.query(
            `INSERT INTO app_records (collection, id, position, data, updated_at)
             SELECT $1, u.id, u.position, u.data::jsonb, NOW()
             FROM UNNEST($2::text[], $3::int[], $4::text[]) AS u(id, position, data)`,
            [collection, ids, positions, datas]
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {}
        throw error;
      } finally {
        client.release();
      }
    }, `save ${collection}`);
  }

}
class ResilientDataStore {
  constructor({ dataDir, files, databaseUrl }) {
    this.kind = databaseUrl ? "postgres" : "json";
    this.primary = databaseUrl ? new PostgresDataStore({ connectionString: databaseUrl }) : null;
    this.fallback = new JsonDataStore({ dataDir, files });
    this.activeStore = this.primary || this.fallback;
  }

  async init() {
    if (!this.primary) {
      await this.fallback.init();
      this.activeStore = this.fallback;
      this.kind = this.activeStore.kind;
      return;
    }

    try {
      await this.primary.init();
      this.activeStore = this.primary;
      this.kind = this.activeStore.kind;
    } catch (error) {
      if (process.env.VERCEL === "1") throw error;
      console.warn("[data] Postgres unavailable in local development, falling back to JSON storage.");
      console.warn(`[data] ${error.message}`);
      await this.fallback.init();
      this.activeStore = this.fallback;
      this.kind = this.activeStore.kind;
    }
  }

  async loadAll() {
    return this.activeStore.loadAll();
  }

  async saveCollection(collection, rows) {
    return this.activeStore.saveCollection(collection, rows);
  }
}

function createDataStore({ dataDir, files, databaseUrl }) {
  return new ResilientDataStore({ dataDir, files, databaseUrl });
}

function normalizePostgresUrl(value) {
  try {
    const url = new URL(value);
    url.searchParams.delete("channel_binding");
    return url.toString();
  } catch {
    return value;
  }
}

module.exports = {
  createDataStore
};
