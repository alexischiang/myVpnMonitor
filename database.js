const fs = require("fs/promises");
const path = require("path");

const COLLECTIONS = ["subscriptions", "users", "bills", "vendors"];

class JsonDataStore {
  constructor({ dataDir, files }) {
    this.kind = "json";
    this.dataDir = dataDir;
    this.files = files;
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
    if (process.env.VERCEL === "1") {
      throw new Error("Vercel 部署必须配置 DATABASE_URL，不能使用本地 JSON 文件存储。");
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
      throw new Error("检测到 DATABASE_URL，但缺少 pg 依赖。请先运行 npm install pg。");
    }
  }

  async init() {
    if (this.pool) return;
    const { Pool } = this.loadPg();
    this.pool = new Pool({
      connectionString: this.connectionString,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      max: 5
    });
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_records (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (collection, id)
      )
    `);
  }

  async loadCollection(collection) {
    const result = await this.pool.query(
      "SELECT data FROM app_records WHERE collection = $1 ORDER BY position ASC",
      [collection]
    );
    return { rows: result.rows.map(row => row.data), missing: false };
  }

  async loadAll() {
    const results = await Promise.all(COLLECTIONS.map(c => this.loadCollection(c)));
    const result = { missing: {} };
    for (const [i, collection] of COLLECTIONS.entries()) {
      result[collection] = results[i].rows;
      result.missing[collection] = results[i].missing;
    }
    return result;
  }

  async saveCollection(collection, rows) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM app_records WHERE collection = $1", [collection]);
      for (const [index, row] of rows.entries()) {
        await client.query(
          `INSERT INTO app_records (collection, id, position, data, updated_at)
           VALUES ($1, $2, $3, $4::jsonb, NOW())`,
          [collection, row.id || `${collection}-${index}`, index, JSON.stringify(row)]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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
