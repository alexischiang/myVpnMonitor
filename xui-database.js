const { Pool } = require("pg");
const { appendXuiAuditLog, initXuiAudit, listXuiAuditLogs } = require("./xui-audit");

class XuiDataStore {
  constructor(connectionString, ssl = process.env.XUI_DATABASE_SSL === "true") {
    if (!connectionString) throw new Error("XUI_DATABASE_URL is required.");
    this.pool = new Pool({
      connectionString,
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.XUI_DATABASE_POOL_MAX || 5),
      idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000)
    });
    this.pool.on("error", error => console.error("[xui-data] Unexpected PostgreSQL error:", error));
  }

  async init() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('xui_schema_migrations'))");
      await client.query("CREATE TABLE IF NOT EXISTS xui_schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
      const applied = await client.query("SELECT 1 FROM xui_schema_migrations WHERE version = 1");
      if (!applied.rows[0]) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS xui_state (
            key TEXT PRIMARY KEY,
            data JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS xui_clients (
            user_id TEXT PRIMARY KEY,
            data JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await client.query("INSERT INTO xui_schema_migrations (version) VALUES (1)");
      }
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }
    await initXuiAudit(this.pool);
  }

  async ping() {
    await this.pool.query("SELECT 1");
  }

  async appendXuiAuditLog(entry) {
    await appendXuiAuditLog(this.pool, entry);
  }

  async listXuiAuditLogs(options) {
    return listXuiAuditLogs(this.pool, options);
  }

  async getState(key) {
    const result = await this.pool.query("SELECT data FROM xui_state WHERE key = $1", [key]);
    return result.rows[0]?.data || null;
  }

  async setState(key, data) {
    await this.pool.query(
      `INSERT INTO xui_state (key, data, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [key, JSON.stringify(data)]
    );
  }

  async getClient(userId) {
    const result = await this.pool.query("SELECT data FROM xui_clients WHERE user_id = $1", [userId]);
    return result.rows[0]?.data || null;
  }

  async setClient(userId, data) {
    await this.pool.query(
      `INSERT INTO xui_clients (user_id, data, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [userId, JSON.stringify(data)]
    );
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = { XuiDataStore };
