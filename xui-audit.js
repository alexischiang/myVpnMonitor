const RETENTION_DAYS = 7;
const lastCleanupAt = new WeakMap();

async function initXuiAudit(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xui_audit_logs (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      request_id TEXT NOT NULL,
      level TEXT NOT NULL,
      transport TEXT NOT NULL,
      method TEXT NOT NULL,
      api_path TEXT NOT NULL,
      panel_host TEXT NOT NULL DEFAULT '',
      user_id TEXT NOT NULL DEFAULT '',
      read_only BOOLEAN NOT NULL DEFAULT FALSE,
      allowed BOOLEAN NOT NULL DEFAULT TRUE,
      status_code INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS xui_audit_logs_created_at_idx ON xui_audit_logs (created_at DESC)
  `);
  await cleanupXuiAudit(pool, true);
}

async function cleanupXuiAudit(pool, force = false) {
  const now = Date.now();
  if (!force && now - (lastCleanupAt.get(pool) || 0) < 60 * 60 * 1000) return;
  await pool.query(`DELETE FROM xui_audit_logs WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`);
  lastCleanupAt.set(pool, now);
}

async function appendXuiAuditLog(pool, entry) {
  await cleanupXuiAudit(pool);
  await pool.query(
    `INSERT INTO xui_audit_logs
      (request_id, level, transport, method, api_path, panel_host, user_id, read_only, allowed, status_code, duration_ms, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [entry.requestId, entry.level, entry.transport, entry.method, entry.apiPath, entry.panelHost || "", entry.userId || "", entry.readOnly === true, entry.allowed !== false, Number(entry.statusCode) || 0, Math.max(0, Number(entry.durationMs) || 0), entry.error || ""]
  );
}

async function listXuiAuditLogs(pool, options = {}) {
  await cleanupXuiAudit(pool);
  const pageSize = Math.min(100, Math.max(10, Number(options.pageSize) || 30));
  const page = Math.max(1, Number(options.page) || 1);
  const values = [];
  const filters = [`created_at >= NOW() - INTERVAL '${RETENTION_DAYS} days'`];
  const addFilter = (sql, value) => { values.push(value); filters.push(sql.replace("?", `$${values.length}`)); };
  if (["info", "warn", "error", "fatal"].includes(options.level)) addFilter("level = ?", options.level);
  if (options.result === "success") filters.push("status_code < 400");
  if (options.result === "blocked") filters.push("allowed = FALSE");
  if (options.result === "failed") filters.push("allowed = TRUE AND status_code >= 400");
  if (String(options.query || "").trim()) addFilter("CONCAT_WS(' ', request_id, method, api_path, panel_host, user_id, error) ILIKE ?", `%${String(options.query).trim()}%`);
  const where = `WHERE ${filters.join(" AND ")}`;
  const countValues = [...values];
  values.push(pageSize, (page - 1) * pageSize);
  const [count, rows] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM xui_audit_logs ${where}`, countValues),
    pool.query(`SELECT * FROM xui_audit_logs ${where} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values)
  ]);
  return {
    items: rows.rows.map(row => ({
      id: String(row.id), createdAt: row.created_at, requestId: row.request_id, level: row.level,
      transport: row.transport, method: row.method, apiPath: row.api_path, panelHost: row.panel_host,
      userId: row.user_id, readOnly: row.read_only, allowed: row.allowed, statusCode: row.status_code,
      durationMs: row.duration_ms, error: row.error
    })),
    total: count.rows[0]?.total || 0,
    page,
    pageSize,
    retentionDays: RETENTION_DAYS
  };
}

module.exports = { appendXuiAuditLog, initXuiAudit, listXuiAuditLogs };
