// PostgreSQL storage for node-hub: machines (VPS running xboard-node), nodes (inbounds on a
// machine), relays (realm port forwarders in front of nodes), node users (entitlements pushed by
// the main app), presence and load history.
// Traffic goes straight into the main app's xui_daily_traffic table, so billing, the account
// chart and the profitability report read hub traffic exactly like 3x-ui traffic.
const crypto = require("crypto");

// First port handed out on a relay; each (node, relay) entry gets its own.
const RELAY_PORT_START = 61001;
const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;
const MAX_SAFE_BYTES = Number.MAX_SAFE_INTEGER;

// Applied in order, each once (nh_schema_migrations).
const MIGRATIONS = [
  { version: 1, sql: `
        CREATE TABLE IF NOT EXISTS nh_machines (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          notes TEXT NOT NULL DEFAULT '',
          host TEXT NOT NULL DEFAULT '',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          last_seen_at TIMESTAMPTZ,
          load_status JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS nh_nodes (
          id SERIAL PRIMARY KEY,
          machine_id INTEGER REFERENCES nh_machines(id) ON DELETE RESTRICT,
          name TEXT NOT NULL,
          protocol TEXT NOT NULL,
          host TEXT NOT NULL,
          server_port INTEGER NOT NULL,
          listen_ip TEXT NOT NULL DEFAULT '0.0.0.0',
          settings JSONB NOT NULL DEFAULT '{}'::jsonb,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          sort_order INTEGER NOT NULL DEFAULT 1,
          region TEXT NOT NULL DEFAULT '',
          network_level TEXT NOT NULL DEFAULT '',
          inbound_type TEXT NOT NULL DEFAULT 'package',
          last_check_at TIMESTAMPTZ,
          last_push_at TIMESTAMPTZ,
          metrics JSONB,
          load_status JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS nh_nodes_machine_idx ON nh_nodes (machine_id);
        CREATE UNIQUE INDEX IF NOT EXISTS nh_nodes_machine_port_idx ON nh_nodes (machine_id, server_port);
        CREATE TABLE IF NOT EXISTS nh_users (
          id SERIAL PRIMARY KEY,
          user_key TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL,
          uuid TEXT NOT NULL UNIQUE,
          user_label TEXT NOT NULL DEFAULT '',
          plan_id TEXT NOT NULL DEFAULT '',
          node_ids INTEGER[] NOT NULL DEFAULT '{}',
          speed_limit INTEGER NOT NULL DEFAULT 0,
          device_limit INTEGER NOT NULL DEFAULT 0,
          enabled BOOLEAN NOT NULL DEFAULT FALSE,
          last_online_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS nh_users_node_ids_idx ON nh_users USING GIN (node_ids);
        CREATE TABLE IF NOT EXISTS nh_presence (
          node_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          ips JSONB NOT NULL DEFAULT '[]'::jsonb,
          conn INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (node_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS nh_machine_load (
          machine_id INTEGER NOT NULL,
          recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          cpu REAL NOT NULL DEFAULT 0,
          mem_total BIGINT NOT NULL DEFAULT 0,
          mem_used BIGINT NOT NULL DEFAULT 0,
          disk_total BIGINT NOT NULL DEFAULT 0,
          disk_used BIGINT NOT NULL DEFAULT 0,
          net_in REAL,
          net_out REAL
        );
        CREATE INDEX IF NOT EXISTS nh_machine_load_idx ON nh_machine_load (machine_id, recorded_at);
        CREATE TABLE IF NOT EXISTS nh_report_ids (
          node_id INTEGER NOT NULL,
          report_id TEXT NOT NULL,
          received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (node_id, report_id)
        );
        CREATE TABLE IF NOT EXISTS xui_daily_traffic (
          date TEXT NOT NULL,
          email TEXT NOT NULL,
          node_guid TEXT NOT NULL,
          user_id TEXT NOT NULL DEFAULT '',
          user_label TEXT NOT NULL DEFAULT '',
          plan_id TEXT NOT NULL DEFAULT '',
          node_name TEXT NOT NULL DEFAULT '',
          up_bytes BIGINT NOT NULL DEFAULT 0,
          down_bytes BIGINT NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (date, email, node_guid)
        )
  ` },
  // Relay machines run realm and forward one port per (node, relay) to the node's landing machine.
  { version: 2, sql: `
        CREATE TABLE IF NOT EXISTS nh_relays (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          host TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          notes TEXT NOT NULL DEFAULT '',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          last_seen_at TIMESTAMPTZ,
          status JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS nh_node_relays (
          node_id INTEGER NOT NULL REFERENCES nh_nodes(id) ON DELETE CASCADE,
          relay_id INTEGER NOT NULL REFERENCES nh_relays(id) ON DELETE RESTRICT,
          listen_port INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (node_id, relay_id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS nh_node_relays_port_idx ON nh_node_relays (relay_id, listen_port)
  ` },
  // Hourly copy of the daily traffic rows (same table the main app creates), for time-of-day usage.
  { version: 3, sql: `
        CREATE TABLE IF NOT EXISTS xui_hourly_traffic (
          hour TIMESTAMPTZ NOT NULL,
          email TEXT NOT NULL,
          node_guid TEXT NOT NULL,
          up_bytes BIGINT NOT NULL DEFAULT 0,
          down_bytes BIGINT NOT NULL DEFAULT 0,
          PRIMARY KEY (hour, email, node_guid)
        );
        CREATE INDEX IF NOT EXISTS xui_hourly_traffic_email_hour_idx ON xui_hourly_traffic (email, hour)
  ` }
];

function chinaDateKey(ms = Date.now()) {
  return new Date(ms + CHINA_TIME_OFFSET_MS).toISOString().slice(0, 10);
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : value ? new Date(value).toISOString() : "";
}

function bytes(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.floor(number), MAX_SAFE_BYTES) : 0;
}

// A node's machine key: one per VPS, like a 3x-ui node guid (VPS cost, presence, inbound keys).
function nodeGuid(node) {
  return node.machineId ? `hub-m${node.machineId}` : `hub-n${node.id}`;
}

// The key a node's traffic rows are recorded under: one per node, so each node has its own
// multiplier. The main app rolls hub-m<machine>-n<node> up to the machine for cost and totals.
function nodeBillingKey(node) {
  return node.machineId ? `hub-m${node.machineId}-n${node.id}` : `hub-n${node.id}`;
}

function machineFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    host: row.host,
    isActive: row.is_active,
    token: row.token,
    lastSeenAt: iso(row.last_seen_at),
    loadStatus: row.load_status || null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function nodeFromRow(row) {
  return {
    id: row.id,
    machineId: row.machine_id,
    name: row.name,
    protocol: row.protocol,
    host: row.host,
    serverPort: row.server_port,
    listenIp: row.listen_ip,
    settings: row.settings || {},
    enabled: row.enabled,
    sortOrder: row.sort_order,
    region: row.region,
    networkLevel: row.network_level,
    inboundType: row.inbound_type,
    lastCheckAt: iso(row.last_check_at),
    lastPushAt: iso(row.last_push_at),
    metrics: row.metrics || null,
    loadStatus: row.load_status || null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function relayFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    notes: row.notes,
    isActive: row.is_active,
    token: row.token,
    lastSeenAt: iso(row.last_seen_at),
    status: row.status || null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

// A relay's public address: an IPv4/IPv6 address or a hostname, written into subscriptions.
function relayHost(value) {
  const host = String(value || "").trim().replace(/^\[|\]$/g, "");
  if (!host || host.length > 255 || !/^[0-9A-Za-z.:-]+$/.test(host)) throw Object.assign(new Error("中转机地址必须是 IP 或域名。"), { statusCode: 400 });
  return host;
}

function userFromRow(row) {
  return {
    id: row.id,
    userKey: row.user_key,
    email: row.email,
    uuid: row.uuid,
    userLabel: row.user_label,
    planId: row.plan_id,
    nodeIds: (row.node_ids || []).map(Number),
    speedLimit: row.speed_limit,
    deviceLimit: row.device_limit,
    enabled: row.enabled,
    lastOnlineAt: iso(row.last_online_at),
    updatedAt: iso(row.updated_at)
  };
}

function normalizeUserInput(input = {}) {
  const userKey = String(input.userKey || "").trim();
  if (!userKey || userKey.length > 128) throw Object.assign(new Error("userKey 无效。"), { statusCode: 400 });
  const email = String(input.email || "").trim().toLowerCase();
  if (!email || email.length > 320) throw Object.assign(new Error(`用户 ${userKey} 缺少邮箱。`), { statusCode: 400 });
  const uuid = String(input.uuid || "").trim().toLowerCase();
  if (uuid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid)) throw Object.assign(new Error(`用户 ${userKey} 的 uuid 格式无效。`), { statusCode: 400 });
  const nodeIds = [...new Set((Array.isArray(input.nodeIds) ? input.nodeIds : []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b);
  return {
    userKey,
    email,
    uuid,
    userLabel: String(input.userLabel || "").slice(0, 200),
    planId: String(input.planId || "").slice(0, 128),
    nodeIds,
    speedLimit: Math.max(0, Math.floor(Number(input.speedLimit) || 0)),
    deviceLimit: Math.max(0, Math.floor(Number(input.deviceLimit) || 0)),
    enabled: input.enabled === true
  };
}

class NodeHubStore {
  constructor(pool, { now = () => Date.now() } = {}) {
    if (!pool) throw new Error("node-hub store requires a PostgreSQL pool.");
    this.pool = pool;
    this.now = now;
  }

  async transaction(operation) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  async init() {
    await this.transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('nh_schema_migrations'))");
      await client.query("CREATE TABLE IF NOT EXISTS nh_schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
      const applied = new Set((await client.query("SELECT version FROM nh_schema_migrations")).rows.map(row => row.version));
      for (const migration of MIGRATIONS) {
        if (applied.has(migration.version)) continue;
        await client.query(migration.sql);
        await client.query("INSERT INTO nh_schema_migrations (version) VALUES ($1)", [migration.version]);
      }
    });
  }

  async ping() {
    await this.pool.query("SELECT 1");
  }

  async close() {
    await this.pool.end();
  }

  // --- machines ----------------------------------------------------------

  async listMachines() {
    const result = await this.pool.query("SELECT * FROM nh_machines ORDER BY id");
    return result.rows.map(machineFromRow);
  }

  async getMachine(id) {
    const result = await this.pool.query("SELECT * FROM nh_machines WHERE id = $1", [Number(id)]);
    return result.rows[0] ? machineFromRow(result.rows[0]) : null;
  }

  async authenticateMachine(id, token) {
    const machineId = Number(id);
    if (!Number.isSafeInteger(machineId) || machineId <= 0 || !token) return null;
    const machine = await this.getMachine(machineId);
    if (!machine) return null;
    const a = Buffer.from(String(machine.token));
    const b = Buffer.from(String(token));
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? machine : null;
  }

  async createMachine({ name, notes = "", host = "" }) {
    const cleanName = String(name || "").trim().slice(0, 80);
    if (!cleanName) throw Object.assign(new Error("机器名称不能为空。"), { statusCode: 400 });
    const token = crypto.randomBytes(24).toString("hex");
    const result = await this.pool.query(
      "INSERT INTO nh_machines (name, token, notes, host) VALUES ($1, $2, $3, $4) RETURNING *",
      [cleanName, token, String(notes || "").slice(0, 500), String(host || "").trim().slice(0, 255)]
    );
    return machineFromRow(result.rows[0]);
  }

  async updateMachine(id, input = {}) {
    const existing = await this.getMachine(id);
    if (!existing) return null;
    const name = input.name === undefined ? existing.name : String(input.name || "").trim().slice(0, 80);
    if (!name) throw Object.assign(new Error("机器名称不能为空。"), { statusCode: 400 });
    const result = await this.pool.query(
      "UPDATE nh_machines SET name = $2, notes = $3, host = $4, is_active = $5, updated_at = NOW() WHERE id = $1 RETURNING *",
      [existing.id, name, input.notes === undefined ? existing.notes : String(input.notes || "").slice(0, 500), input.host === undefined ? existing.host : String(input.host || "").trim().slice(0, 255), input.isActive === undefined ? existing.isActive : input.isActive === true]
    );
    return machineFromRow(result.rows[0]);
  }

  async resetMachineToken(id) {
    const result = await this.pool.query("UPDATE nh_machines SET token = $2, updated_at = NOW() WHERE id = $1 RETURNING *", [Number(id), crypto.randomBytes(24).toString("hex")]);
    return result.rows[0] ? machineFromRow(result.rows[0]) : null;
  }

  async deleteMachine(id) {
    const nodes = await this.pool.query("SELECT 1 FROM nh_nodes WHERE machine_id = $1 LIMIT 1", [Number(id)]);
    if (nodes.rows.length) throw Object.assign(new Error("机器下仍有节点，请先删除节点。"), { statusCode: 409 });
    const result = await this.pool.query("DELETE FROM nh_machines WHERE id = $1", [Number(id)]);
    await this.pool.query("DELETE FROM nh_machine_load WHERE machine_id = $1", [Number(id)]);
    return result.rowCount > 0;
  }

  async touchMachine(id) {
    await this.pool.query("UPDATE nh_machines SET last_seen_at = NOW() WHERE id = $1", [Number(id)]);
  }

  async recordMachineStatus(id, status) {
    await this.transaction(async client => {
      await client.query("UPDATE nh_machines SET load_status = $2::jsonb, last_seen_at = NOW() WHERE id = $1", [Number(id), JSON.stringify(status)]);
      await client.query(
        "INSERT INTO nh_machine_load (machine_id, cpu, mem_total, mem_used, disk_total, disk_used, net_in, net_out) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [Number(id), status.cpu, status.mem.total, status.mem.used, status.disk.total, status.disk.used, status.net?.in_speed ?? null, status.net?.out_speed ?? null]
      );
      await client.query("DELETE FROM nh_machine_load WHERE machine_id = $1 AND recorded_at < NOW() - INTERVAL '24 hours'", [Number(id)]);
    });
  }

  async machineLoadHistory(id, hours = 24) {
    const result = await this.pool.query(
      "SELECT * FROM nh_machine_load WHERE machine_id = $1 AND recorded_at >= NOW() - ($2::int * INTERVAL '1 hour') ORDER BY recorded_at",
      [Number(id), Math.min(24, Math.max(1, Number(hours) || 24))]
    );
    return result.rows.map(row => ({ recordedAt: iso(row.recorded_at), cpu: row.cpu, memTotal: Number(row.mem_total), memUsed: Number(row.mem_used), diskTotal: Number(row.disk_total), diskUsed: Number(row.disk_used), netIn: row.net_in, netOut: row.net_out }));
  }

  // --- nodes -------------------------------------------------------------

  async listNodes({ machineId = null, enabledOnly = false } = {}) {
    const clauses = [];
    const values = [];
    if (machineId !== null) {
      values.push(Number(machineId));
      clauses.push(`machine_id = $${values.length}`);
    }
    if (enabledOnly) clauses.push("enabled = TRUE");
    const result = await this.pool.query(`SELECT * FROM nh_nodes ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY sort_order, id`, values);
    return result.rows.map(nodeFromRow);
  }

  async getNode(id) {
    const result = await this.pool.query("SELECT * FROM nh_nodes WHERE id = $1", [Number(id)]);
    return result.rows[0] ? nodeFromRow(result.rows[0]) : null;
  }

  async createNode(machineId, node) {
    if (machineId !== null && !(await this.getMachine(machineId))) throw Object.assign(new Error("机器不存在。"), { statusCode: 404 });
    try {
      const result = await this.pool.query(
        `INSERT INTO nh_nodes (machine_id, name, protocol, host, server_port, listen_ip, settings, enabled, sort_order, region, network_level, inbound_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12) RETURNING *`,
        [machineId, node.name, node.protocol, node.host, node.serverPort, node.listenIp, JSON.stringify(node.settings), node.enabled, node.sortOrder, node.region, node.networkLevel, node.inboundType]
      );
      return nodeFromRow(result.rows[0]);
    } catch (error) {
      if (error.code === "23505") throw Object.assign(new Error("该机器上已有节点使用这个端口。"), { statusCode: 409 });
      throw error;
    }
  }

  async updateNode(id, node) {
    try {
      const result = await this.pool.query(
        `UPDATE nh_nodes SET name = $2, protocol = $3, host = $4, server_port = $5, listen_ip = $6, settings = $7::jsonb, enabled = $8, sort_order = $9,
           region = $10, network_level = $11, inbound_type = $12, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [Number(id), node.name, node.protocol, node.host, node.serverPort, node.listenIp, JSON.stringify(node.settings), node.enabled, node.sortOrder, node.region, node.networkLevel, node.inboundType]
      );
      return result.rows[0] ? nodeFromRow(result.rows[0]) : null;
    } catch (error) {
      if (error.code === "23505") throw Object.assign(new Error("该机器上已有节点使用这个端口。"), { statusCode: 409 });
      throw error;
    }
  }

  async deleteNode(id) {
    const result = await this.pool.query("DELETE FROM nh_nodes WHERE id = $1", [Number(id)]);
    await this.pool.query("DELETE FROM nh_presence WHERE node_id = $1", [Number(id)]);
    return result.rowCount > 0;
  }

  async touchNode(id) {
    await this.pool.query("UPDATE nh_nodes SET last_check_at = NOW() WHERE id = $1", [Number(id)]);
  }

  // --- relays ------------------------------------------------------------

  async listRelays() {
    const result = await this.pool.query("SELECT * FROM nh_relays ORDER BY id");
    return result.rows.map(relayFromRow);
  }

  async getRelay(id) {
    const result = await this.pool.query("SELECT * FROM nh_relays WHERE id = $1", [Number(id)]);
    return result.rows[0] ? relayFromRow(result.rows[0]) : null;
  }

  async authenticateRelay(id, token) {
    const relayId = Number(id);
    if (!Number.isSafeInteger(relayId) || relayId <= 0 || !token) return null;
    const relay = await this.getRelay(relayId);
    if (!relay) return null;
    const a = Buffer.from(String(relay.token));
    const b = Buffer.from(String(token));
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? relay : null;
  }

  async createRelay({ name, host, notes = "" }) {
    const cleanName = String(name || "").trim().slice(0, 80);
    if (!cleanName) throw Object.assign(new Error("中转机名称不能为空。"), { statusCode: 400 });
    const result = await this.pool.query(
      "INSERT INTO nh_relays (name, host, token, notes) VALUES ($1, $2, $3, $4) RETURNING *",
      [cleanName, relayHost(host), crypto.randomBytes(24).toString("hex"), String(notes || "").slice(0, 500)]
    );
    return relayFromRow(result.rows[0]);
  }

  async updateRelay(id, input = {}) {
    const existing = await this.getRelay(id);
    if (!existing) return null;
    const name = input.name === undefined ? existing.name : String(input.name || "").trim().slice(0, 80);
    if (!name) throw Object.assign(new Error("中转机名称不能为空。"), { statusCode: 400 });
    const result = await this.pool.query(
      "UPDATE nh_relays SET name = $2, host = $3, notes = $4, is_active = $5, updated_at = NOW() WHERE id = $1 RETURNING *",
      [existing.id, name, input.host === undefined ? existing.host : relayHost(input.host), input.notes === undefined ? existing.notes : String(input.notes || "").slice(0, 500), input.isActive === undefined ? existing.isActive : input.isActive === true]
    );
    return relayFromRow(result.rows[0]);
  }

  async resetRelayToken(id) {
    const result = await this.pool.query("UPDATE nh_relays SET token = $2, updated_at = NOW() WHERE id = $1 RETURNING *", [Number(id), crypto.randomBytes(24).toString("hex")]);
    return result.rows[0] ? relayFromRow(result.rows[0]) : null;
  }

  async deleteRelay(id) {
    const used = await this.pool.query("SELECT 1 FROM nh_node_relays WHERE relay_id = $1 LIMIT 1", [Number(id)]);
    if (used.rows.length) throw Object.assign(new Error("还有节点经过这台中转机，请先在节点里取消它。"), { statusCode: 409 });
    const result = await this.pool.query("DELETE FROM nh_relays WHERE id = $1", [Number(id)]);
    return result.rowCount > 0;
  }

  /** The relay's own report on each config pull: realm state and the hash of the rules it applied. */
  async recordRelaySeen(id, status) {
    await this.pool.query("UPDATE nh_relays SET last_seen_at = NOW(), status = $2::jsonb WHERE id = $1", [Number(id), JSON.stringify(status)]);
  }

  /** Relay entries of every node (or one node), with the relay's name and address. */
  async listNodeRelays(nodeId = null) {
    const result = await this.pool.query(
      `SELECT nr.node_id, nr.relay_id, nr.listen_port, r.name, r.host, r.is_active
       FROM nh_node_relays nr JOIN nh_relays r ON r.id = nr.relay_id
       ${nodeId === null ? "" : "WHERE nr.node_id = $1"} ORDER BY nr.node_id, r.id`,
      nodeId === null ? [] : [Number(nodeId)]
    );
    return result.rows.map(row => ({ nodeId: row.node_id, relayId: row.relay_id, relayName: row.name, relayHost: row.host, relayActive: row.is_active, listenPort: row.listen_port }));
  }

  // Makes a node's relay entries exactly relayIds. Kept relays keep their port; a new entry takes
  // the lowest free port from RELAY_PORT_START on that relay. Relay rows are locked so two saves
  // cannot pick the same port.
  async setNodeRelays(nodeId, relayIds = []) {
    const wanted = [...new Set(relayIds.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
    return this.transaction(async client => {
      if (wanted.length) {
        const found = await client.query("SELECT id FROM nh_relays WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE", [wanted]);
        if (found.rows.length !== wanted.length) throw Object.assign(new Error("中转机不存在。"), { statusCode: 404 });
      }
      await client.query("DELETE FROM nh_node_relays WHERE node_id = $1 AND NOT (relay_id = ANY($2::int[]))", [Number(nodeId), wanted]);
      const kept = new Set((await client.query("SELECT relay_id FROM nh_node_relays WHERE node_id = $1", [Number(nodeId)])).rows.map(row => row.relay_id));
      for (const relayId of wanted.filter(id => !kept.has(id))) {
        const used = new Set((await client.query("SELECT listen_port FROM nh_node_relays WHERE relay_id = $1", [relayId])).rows.map(row => row.listen_port));
        let port = RELAY_PORT_START;
        while (used.has(port)) port++;
        if (port > 65535) throw Object.assign(new Error("这台中转机没有空闲端口了。"), { statusCode: 409 });
        await client.query("INSERT INTO nh_node_relays (node_id, relay_id, listen_port) VALUES ($1, $2, $3)", [Number(nodeId), relayId, port]);
      }
    }).then(() => this.listNodeRelays(nodeId));
  }

  /** What a relay forwards: enabled nodes on active machines, each to the machine address and node port. */
  async relayEndpoints(relayId) {
    const result = await this.pool.query(
      `SELECT nr.listen_port, n.id AS node_id, n.name AS node_name, n.server_port, m.host AS machine_host
       FROM nh_node_relays nr JOIN nh_nodes n ON n.id = nr.node_id JOIN nh_machines m ON m.id = n.machine_id
       WHERE nr.relay_id = $1 AND n.enabled = TRUE AND m.is_active = TRUE AND m.host <> ''
       ORDER BY nr.listen_port`,
      [Number(relayId)]
    );
    return result.rows.map(row => ({ listenPort: row.listen_port, nodeId: row.node_id, nodeName: row.node_name, remoteHost: row.machine_host, remotePort: row.server_port }));
  }

  // --- users -------------------------------------------------------------

  // Upserts entitlements. With replace, every stored user missing from the list is disabled (its
  // numeric id and uuid are kept so traffic reported later still maps to the right user).
  async syncUsers(inputs = [], { replace = false } = {}) {
    const users = inputs.map(normalizeUserInput);
    const seen = new Set();
    for (const user of users) {
      if (seen.has(user.userKey)) throw Object.assign(new Error(`重复的 userKey：${user.userKey}`), { statusCode: 400 });
      seen.add(user.userKey);
    }
    return this.transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('nh_users_sync'))");
      const existing = await client.query("SELECT user_key, uuid FROM nh_users");
      const uuidByKey = new Map(existing.rows.map(row => [row.user_key, row.uuid]));
      const rows = users.map(user => ({ ...user, uuid: user.uuid || uuidByKey.get(user.userKey) || crypto.randomUUID() }));
      let changed = 0;
      if (rows.length) {
        const result = await client.query(
          `INSERT INTO nh_users (user_key, email, uuid, user_label, plan_id, node_ids, speed_limit, device_limit, enabled, updated_at)
           SELECT r."userKey", r.email, r.uuid, r."userLabel", r."planId", ARRAY(SELECT jsonb_array_elements_text(r."nodeIds")::int), r."speedLimit", r."deviceLimit", r.enabled, NOW()
           FROM jsonb_to_recordset($1::jsonb) AS r("userKey" TEXT, email TEXT, uuid TEXT, "userLabel" TEXT, "planId" TEXT, "nodeIds" JSONB, "speedLimit" INTEGER, "deviceLimit" INTEGER, enabled BOOLEAN)
           ON CONFLICT (user_key) DO UPDATE SET email = EXCLUDED.email, uuid = EXCLUDED.uuid, user_label = EXCLUDED.user_label, plan_id = EXCLUDED.plan_id,
             node_ids = EXCLUDED.node_ids, speed_limit = EXCLUDED.speed_limit, device_limit = EXCLUDED.device_limit, enabled = EXCLUDED.enabled, updated_at = NOW()
           WHERE (nh_users.email, nh_users.uuid, nh_users.user_label, nh_users.plan_id, nh_users.node_ids, nh_users.speed_limit, nh_users.device_limit, nh_users.enabled)
             IS DISTINCT FROM (EXCLUDED.email, EXCLUDED.uuid, EXCLUDED.user_label, EXCLUDED.plan_id, EXCLUDED.node_ids, EXCLUDED.speed_limit, EXCLUDED.device_limit, EXCLUDED.enabled)`,
          [JSON.stringify(rows)]
        );
        changed += result.rowCount;
      }
      let disabled = 0;
      if (replace) {
        const result = await client.query("UPDATE nh_users SET enabled = FALSE, updated_at = NOW() WHERE enabled = TRUE AND NOT (user_key = ANY($1::text[]))", [rows.map(row => row.userKey)]);
        disabled = result.rowCount;
      }
      return { received: rows.length, changed, disabled, uuids: Object.fromEntries(rows.map(row => [row.userKey, row.uuid])) };
    }).catch(error => {
      if (error.code === "23505") throw Object.assign(new Error("uuid 已被其他用户使用。"), { statusCode: 409 });
      throw error;
    });
  }

  // Seeds a user's credential (migration from 3x-ui keeps the client uuid). An existing user only
  // gets the uuid; a new one is created disabled until the app's next entitlement sync.
  async setUserUuid(userKey, { email, uuid }) {
    const user = normalizeUserInput({ userKey, email, uuid, enabled: false });
    if (!user.uuid) throw Object.assign(new Error("uuid 不能为空。"), { statusCode: 400 });
    try {
      const result = await this.pool.query(
        `INSERT INTO nh_users (user_key, email, uuid, enabled) VALUES ($1, $2, $3, FALSE)
         ON CONFLICT (user_key) DO UPDATE SET uuid = EXCLUDED.uuid, updated_at = NOW() RETURNING *`,
        [user.userKey, user.email, user.uuid]
      );
      return userFromRow(result.rows[0]);
    } catch (error) {
      if (error.code === "23505") throw Object.assign(new Error("uuid 已被其他用户使用。"), { statusCode: 409 });
      throw error;
    }
  }

  async getUser(userKey) {
    const result = await this.pool.query("SELECT * FROM nh_users WHERE user_key = $1", [String(userKey)]);
    return result.rows[0] ? userFromRow(result.rows[0]) : null;
  }

  async listUsers() {
    const result = await this.pool.query("SELECT * FROM nh_users ORDER BY id");
    return result.rows.map(userFromRow);
  }

  // The users a node accepts: enabled and entitled to this node. Shape is Xboard's user list.
  async nodeUsers(nodeId) {
    const result = await this.pool.query(
      "SELECT id, uuid, speed_limit, device_limit FROM nh_users WHERE enabled = TRUE AND node_ids @> ARRAY[$1::int] ORDER BY id",
      [Number(nodeId)]
    );
    return result.rows.map(row => ({ id: row.id, uuid: row.uuid, speed_limit: row.speed_limit, device_limit: row.device_limit }));
  }

  // --- reports -----------------------------------------------------------

  // Applies one node report in a single transaction: per-user traffic into the daily table,
  // presence snapshot, last-online stamps and node metrics. A report_id seen before is skipped
  // whole, so a node that resends the same batch is not billed twice.
  async recordReport(node, { traffic = {}, alive = null, online = null, status = null, metrics = null, reportId = "" } = {}, { nodeName = "", statementTimeoutMs = 10000 } = {}) {
    const now = this.now();
    const date = chinaDateKey(now);
    const guid = nodeBillingKey(node);
    return this.transaction(async client => {
      await client.query(`SET LOCAL statement_timeout = ${Math.max(1000, Math.floor(statementTimeoutMs))}`);
      if (reportId) {
        const inserted = await client.query("INSERT INTO nh_report_ids (node_id, report_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1", [node.id, String(reportId).slice(0, 128)]);
        if (!inserted.rows.length) return { duplicate: true, trafficUsers: 0, unknownUsers: 0 };
        await client.query("DELETE FROM nh_report_ids WHERE node_id = $1 AND received_at < NOW() - INTERVAL '7 days'", [node.id]);
      }
      const entries = Object.entries(traffic || {})
        .map(([uid, pair]) => ({ uid: Number(uid), up: bytes(Array.isArray(pair) ? pair[0] : 0), down: bytes(Array.isArray(pair) ? pair[1] : 0) }))
        .filter(entry => Number.isSafeInteger(entry.uid) && entry.uid > 0 && (entry.up || entry.down));
      const onlineIds = Object.keys(online || {}).map(Number).filter(id => Number.isSafeInteger(id) && id > 0);
      const aliveIds = Object.keys(alive || {}).map(Number).filter(id => Number.isSafeInteger(id) && id > 0);
      const ids = [...new Set([...entries.map(entry => entry.uid), ...onlineIds, ...aliveIds])];
      const usersById = new Map();
      if (ids.length) {
        const result = await client.query("SELECT id, user_key, email, user_label, plan_id FROM nh_users WHERE id = ANY($1::int[])", [ids]);
        for (const row of result.rows) usersById.set(row.id, row);
      }
      const rows = [];
      let unknownUsers = 0;
      for (const entry of entries) {
        const user = usersById.get(entry.uid);
        if (!user) { unknownUsers++; continue; }
        rows.push({ date, email: user.email, nodeGuid: guid, userId: user.user_key, userLabel: user.user_label, planId: user.plan_id, nodeName, up: entry.up, down: entry.down });
      }
      if (rows.length) {
        await client.query(
          `INSERT INTO xui_daily_traffic (date, email, node_guid, user_id, user_label, plan_id, node_name, up_bytes, down_bytes, updated_at)
           SELECT r.date, r.email, r."nodeGuid", r."userId", r."userLabel", r."planId", r."nodeName", SUM(r.up), SUM(r.down), NOW()
           FROM jsonb_to_recordset($1::jsonb) AS r(date TEXT, email TEXT, "nodeGuid" TEXT, "userId" TEXT, "userLabel" TEXT, "planId" TEXT, "nodeName" TEXT, up BIGINT, down BIGINT)
           GROUP BY r.date, r.email, r."nodeGuid", r."userId", r."userLabel", r."planId", r."nodeName"
           ON CONFLICT (date, email, node_guid) DO UPDATE SET up_bytes = xui_daily_traffic.up_bytes + EXCLUDED.up_bytes,
             down_bytes = xui_daily_traffic.down_bytes + EXCLUDED.down_bytes,
             user_id = COALESCE(NULLIF(xui_daily_traffic.user_id, ''), EXCLUDED.user_id),
             user_label = CASE WHEN EXCLUDED.user_label <> '' THEN EXCLUDED.user_label ELSE xui_daily_traffic.user_label END,
             plan_id = CASE WHEN EXCLUDED.plan_id <> '' THEN EXCLUDED.plan_id ELSE xui_daily_traffic.plan_id END,
             node_name = CASE WHEN EXCLUDED.node_name <> '' THEN EXCLUDED.node_name ELSE xui_daily_traffic.node_name END,
             updated_at = NOW()`,
          [JSON.stringify(rows)]
        );
        // Same traffic into the current hour, for time-of-day usage (the main app prunes it).
        await client.query(
          `INSERT INTO xui_hourly_traffic (hour, email, node_guid, up_bytes, down_bytes)
           SELECT $1::timestamptz, r.email, r."nodeGuid", SUM(r.up), SUM(r.down)
           FROM jsonb_to_recordset($2::jsonb) AS r(email TEXT, "nodeGuid" TEXT, up BIGINT, down BIGINT)
           GROUP BY r.email, r."nodeGuid"
           ON CONFLICT (hour, email, node_guid) DO UPDATE SET up_bytes = xui_hourly_traffic.up_bytes + EXCLUDED.up_bytes,
             down_bytes = xui_hourly_traffic.down_bytes + EXCLUDED.down_bytes`,
          [new Date(Math.floor(now / 3600000) * 3600000).toISOString(), JSON.stringify(rows)]
        );
      }
      const activeIds = ids.filter(id => usersById.has(id));
      if (activeIds.length) await client.query("UPDATE nh_users SET last_online_at = NOW() WHERE id = ANY($1::int[])", [activeIds]);
      // Presence: `online` is sent on every report while anyone is connected (absent = nobody);
      // `alive` (the IP lists) only when it changed, so IPs are kept from the last snapshot.
      // online === null: this push says nothing about presence (legacy traffic/status pushes).
      if (online !== null) {
        const presence = onlineIds.filter(id => usersById.has(id)).map(id => ({
          userId: id,
          conn: Math.max(0, Math.floor(Number(online[id]) || 0)),
          ips: alive && Array.isArray(alive[id]) ? alive[id].map(ip => String(ip).slice(0, 64)).slice(0, 64) : null
        }));
        if (presence.length) {
          await client.query(
            `INSERT INTO nh_presence (node_id, user_id, ips, conn, updated_at)
             SELECT $1, r."userId", COALESCE(r.ips, '[]'::jsonb), r.conn, NOW() FROM jsonb_to_recordset($2::jsonb) AS r("userId" INTEGER, ips JSONB, conn INTEGER)
             ON CONFLICT (node_id, user_id) DO UPDATE SET conn = EXCLUDED.conn, ips = CASE WHEN $3::boolean THEN EXCLUDED.ips ELSE nh_presence.ips END, updated_at = NOW()`,
            [node.id, JSON.stringify(presence), alive !== null]
          );
        }
        await client.query("DELETE FROM nh_presence WHERE node_id = $1 AND NOT (user_id = ANY($2::int[]))", [node.id, presence.map(item => item.userId)]);
      }
      await client.query(
        "UPDATE nh_nodes SET last_push_at = NOW(), last_check_at = NOW(), metrics = COALESCE($2::jsonb, metrics), load_status = COALESCE($3::jsonb, load_status) WHERE id = $1",
        [node.id, metrics ? JSON.stringify(metrics) : null, status ? JSON.stringify(status) : null]
      );
      return { duplicate: false, trafficUsers: rows.length, unknownUsers };
    });
  }

  // Presence across all nodes, keyed by the main app's user key.
  async presence() {
    const result = await this.pool.query(
      `SELECT u.user_key, u.email, u.last_online_at, p.node_id, p.ips, p.conn, p.updated_at
       FROM nh_users u LEFT JOIN nh_presence p ON p.user_id = u.id
       WHERE p.node_id IS NOT NULL OR u.last_online_at IS NOT NULL`
    );
    const users = {};
    const nodes = {};
    for (const row of result.rows) {
      const entry = users[row.user_key] ||= { email: row.email, lastOnlineAt: iso(row.last_online_at), online: false, ips: [], nodeIds: [], ipsByNode: {} };
      if (row.node_id !== null && row.node_id !== undefined) {
        const nodeIps = Array.isArray(row.ips) ? row.ips : [];
        entry.online = true;
        entry.nodeIds.push(row.node_id);
        // Per node as well: the xray kernel enforces the device limit on each node separately.
        entry.ipsByNode[row.node_id] = nodeIps;
        entry.ips = [...new Set([...entry.ips, ...nodeIps])];
        (nodes[row.node_id] ||= []).push(row.user_key);
      }
    }
    return { users, nodes };
  }

  // Entitled and online user counts per node, for status views.
  async nodeCounts() {
    const [entitled, online] = await Promise.all([
      this.pool.query("SELECT n AS node_id, COUNT(*)::int AS count FROM nh_users, unnest(node_ids) AS n WHERE enabled = TRUE GROUP BY n"),
      this.pool.query("SELECT node_id, COUNT(*)::int AS count FROM nh_presence GROUP BY node_id")
    ]);
    const counts = {};
    for (const row of entitled.rows) (counts[row.node_id] ||= { users: 0, online: 0 }).users = row.count;
    for (const row of online.rows) (counts[row.node_id] ||= { users: 0, online: 0 }).online = row.count;
    return counts;
  }
}

module.exports = { NodeHubStore, chinaDateKey, nodeGuid, nodeBillingKey, normalizeUserInput, RELAY_PORT_START };
