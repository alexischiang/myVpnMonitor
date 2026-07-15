const COLLECTIONS = ["subscriptions", "users", "accounts", "bills", "vendors", "presets", "placeholderNodes", "embyUsers", "embyVendors", "pricing", "paymentOrders", "salesSettings"];
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

class PostgresDataStore {
  constructor({ connectionString, ssl }) {
    this.kind = "postgres";
    this.connectionString = normalizePostgresUrl(connectionString);
    this.ssl = ssl;
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
      ssl: this.ssl ? { rejectUnauthorized: false } : undefined,
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

  async ping() {
    await this.pool.query("SELECT 1");
  }

  async getRecord(collection, id) {
    const result = await withPgRetry(
      () => this.pool.query("SELECT data FROM app_records WHERE collection = $1 AND id = $2", [collection, id]),
      `load ${collection}/${id}`
    );
    return result.rows[0]?.data || null;
  }

  async setRecord(collection, id, data) {
    await withPgRetry(
      () => this.pool.query(
        `INSERT INTO app_records (collection, id, position, data, updated_at)
         VALUES ($1, $2, 0, $3::jsonb, NOW())
         ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [collection, id, JSON.stringify(data)]
      ),
      `save ${collection}/${id}`
    );
  }

  async deleteRecord(collection, id) {
    await withPgRetry(
      () => this.pool.query("DELETE FROM app_records WHERE collection = $1 AND id = $2", [collection, id]),
      `delete ${collection}/${id}`
    );
  }

  async close() {
    await this.pool?.end();
    this.pool = null;
  }

  async loadAll() {
    const result = {};
    for (const collection of COLLECTIONS) {
      result[collection] = [];
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

function createDataStore({ databaseUrl, ssl = process.env.DATABASE_SSL === "true" }) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required; PostgreSQL is the only supported data store.");
  return new PostgresDataStore({ connectionString: databaseUrl, ssl });
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
