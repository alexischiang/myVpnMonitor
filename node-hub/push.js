// WebSocket push to xboard-node, in the protocol of Xboard's Workerman server
// (xboard-node internal/panel/ws.go). The handshake hands nodes `ws_url`; a node connects with
// ?token=&machine_id= (machine mode, one connection per VPS) or ?token=&node_id= (node mode).
//
// Server -> node: auth.success | error, ping, sync.nodes (machine's node list changed),
// sync.config, sync.users / sync.user.delta, sync.devices (global device state).
// Node -> server: pong, node.status, report.devices.
//
// While a node's WebSocket is up it stops polling config and users over REST, so the hub is the
// only source of those updates: every connection keeps a hash of what it last received per node
// and a reconcile pushes whatever differs. Reconciles run after every management write (debounced)
// and every `reconcileIntervalMs` as a safety net. Traffic, presence and machine status still
// arrive over REST, so billing does not depend on this channel.
const crypto = require("crypto");
const { URL } = require("url");
const { WebSocketServer } = require("ws");
const { buildNodeConfig } = require("./node-config");

const WS_PATH = "/api/v2/server/ws";

function hash(value) {
  return crypto.createHash("sha1").update(JSON.stringify(value)).digest("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

// The public ws:// or wss:// address nodes connect to, next to the REST API behind the same proxy.
function wsUrlFor(publicUrl) {
  if (!publicUrl) return "";
  const url = new URL(publicUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}${WS_PATH}`;
  return url.toString();
}

function createNodeHubPush({ store, serverToken = "", baseConfig, logger = console, pingIntervalMs = 30000, idleTimeoutMs = 90000, reconcileIntervalMs = 30000, debounceMs = 200, deviceTtlMs = 180000 }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 10 * 1024 * 1024 });
  const connections = new Set();
  // node id -> { at, devices: { userId: [ips] } } from report.devices, for the global device view.
  const deviceReports = new Map();
  let reconcileTimer = null;
  let reconcileRun = null;
  let reconcileAgain = false;

  function sendEvent(conn, event, data) {
    if (conn.ws.readyState !== conn.ws.OPEN) return;
    conn.ws.send(JSON.stringify({ event, ...(data === undefined ? {} : { data }), timestamp: Math.floor(Date.now() / 1000) }));
  }

  function closeWithError(ws, message) {
    try {
      ws.send(JSON.stringify({ event: "error", data: { message } }));
    } finally {
      ws.close(4001, message.slice(0, 120));
    }
  }

  // Who the connection belongs to, or null when the credentials no longer hold
  // (machine deleted, disabled, token reset; node deleted or disabled in node mode).
  async function authenticate(params) {
    const token = String(params.get("token") || "");
    const machineId = Number(params.get("machine_id") || 0);
    if (machineId) {
      const machine = await store.authenticateMachine(machineId, token);
      if (!machine) return { error: "Machine not found or invalid token" };
      if (!machine.isActive) return { error: "Machine is disabled" };
      return { machineId: machine.id, nodeId: 0, token };
    }
    const nodeId = Number(params.get("node_id") || 0);
    if (!serverToken || !safeEqual(token, serverToken)) return { error: "Invalid token" };
    const node = nodeId ? await store.getNode(nodeId) : null;
    if (!node || !node.enabled) return { error: "Server does not exist" };
    return { machineId: 0, nodeId: node.id, token };
  }

  async function stillAuthorized(conn) {
    if (conn.machineId) {
      const machine = await store.authenticateMachine(conn.machineId, conn.token);
      return Boolean(machine?.isActive);
    }
    const node = await store.getNode(conn.nodeId);
    return Boolean(node?.enabled) && safeEqual(conn.token, serverToken);
  }

  // Global device state: every user's IPs across all nodes that reported recently.
  function globalDevices() {
    const now = Date.now();
    const users = {};
    for (const [nodeId, report] of deviceReports) {
      if (now - report.at > deviceTtlMs) {
        deviceReports.delete(nodeId);
        continue;
      }
      for (const [userId, ips] of Object.entries(report.devices)) users[userId] = [...new Set([...(users[userId] || []), ...ips])].sort();
    }
    return users;
  }

  // Pushes whatever differs from what the connection last received.
  async function reconcileConnection(conn, devices, allUsers) {
    if (!(await stillAuthorized(conn))) {
      closeWithError(conn.ws, "credentials revoked");
      return;
    }
    const nodes = conn.machineId ? await store.listNodes({ machineId: conn.machineId, enabledOnly: true }) : [await store.getNode(conn.nodeId)].filter(Boolean);
    if (conn.machineId) {
      const list = nodes.map(node => ({ id: node.id, type: node.protocol, name: node.name }));
      const listHash = hash(list);
      if (conn.sent.nodes !== listHash) {
        // A node that appears in a later list was created after the machine connected and holds no users yet.
        if (conn.sent.nodes) for (const item of list) if (!conn.sent.perNode.has(item.id)) conn.sent.perNode.set(item.id, { config: "", users: "", userIds: new Set(), devices: "" });
        sendEvent(conn, "sync.nodes", { nodes: list });
        conn.sent.nodes = listHash;
      }
    }
    const nodeIds = new Set(nodes.map(node => node.id));
    for (const nodeId of conn.sent.perNode.keys()) if (!nodeIds.has(nodeId)) conn.sent.perNode.delete(nodeId);
    const devicesHash = hash(devices);
    for (const node of nodes) {
      const sent = conn.sent.perNode.get(node.id) || { config: "", users: "", userIds: null, devices: "" };
      const config = { ...buildNodeConfig(node), base_config: baseConfig };
      const configHash = hash(config);
      if (sent.config !== configHash) {
        sendEvent(conn, "sync.config", { config, node_id: node.id, timestamp: Math.floor(Date.now() / 1000) });
        sent.config = configHash;
      }
      const users = await store.nodeUsers(node.id);
      const usersHash = hash(users);
      if (sent.users !== usersHash) {
        if (users.length) {
          sendEvent(conn, "sync.users", { users, node_id: node.id, timestamp: Math.floor(Date.now() / 1000) });
        } else {
          // xboard-node ignores an empty sync.users, so the last users leave another way. Before
          // this connection has sent a list it does not know what the node holds: everyone may go.
          const removed = sent.userIds ? allUsers.filter(user => sent.userIds.has(user.id)) : allUsers;
          // Node mode applies a "remove" delta directly. Machine mode coalesces events in a per-node
          // mailbox that turns a list emptied by "remove" into nil and drops it; an action it does
          // not know makes the node reconcile over REST instead, which does apply an empty list.
          if (removed.length) sendEvent(conn, "sync.user.delta", { action: conn.machineId ? "resync" : "remove", users: removed, node_id: node.id, timestamp: Math.floor(Date.now() / 1000) });
        }
        sent.users = usersHash;
        sent.userIds = new Set(users.map(user => user.id));
      }
      if (sent.devices !== devicesHash) {
        sendEvent(conn, "sync.devices", { users: devices, node_id: node.id, timestamp: Math.floor(Date.now() / 1000) });
        sent.devices = devicesHash;
      }
      conn.sent.perNode.set(node.id, sent);
    }
  }

  async function reconcileAll() {
    if (reconcileRun) {
      reconcileAgain = true;
      return reconcileRun;
    }
    reconcileRun = (async () => {
      do {
        reconcileAgain = false;
        if (!connections.size) break;
        const devices = globalDevices();
        // Removal deltas need each user's id; the uuid lets xboard-node match the entry.
        const allUsers = (await store.listUsers()).map(user => ({ id: user.id, uuid: user.uuid }));
        for (const conn of [...connections]) {
          try {
            await reconcileConnection(conn, devices, allUsers);
          } catch (error) {
            logger.warn?.({ machineId: conn.machineId, nodeId: conn.nodeId, error: error.message }, "node-hub push reconcile failed");
          }
        }
      } while (reconcileAgain);
    })().finally(() => { reconcileRun = null; });
    return reconcileRun;
  }

  /** Coalesces bursts of writes (a full user sync, several node edits) into one reconcile. */
  function schedule() {
    if (!connections.size || reconcileTimer) return;
    reconcileTimer = setTimeout(() => {
      reconcileTimer = null;
      reconcileAll().catch(error => logger.warn?.({ error: error.message }, "node-hub push failed"));
    }, debounceMs);
  }

  function onMessage(conn, raw) {
    conn.lastSeen = Date.now();
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (message?.event === "report.devices") {
      const data = message.data && typeof message.data === "object" ? message.data : {};
      const nodeId = Number(data.node_id || conn.nodeId || 0);
      if (!nodeId || (conn.machineId && !conn.sent.perNode.has(nodeId))) return;
      const source = data.node_id ? data.devices : data;
      const devices = {};
      for (const [userId, ips] of Object.entries(source && typeof source === "object" ? source : {})) {
        if (/^\d+$/.test(userId) && Array.isArray(ips)) devices[userId] = ips.map(String).slice(0, 64);
      }
      deviceReports.set(nodeId, { at: Date.now(), devices });
      schedule();
    }
  }

  async function handleUpgrade(req, socket, head) {
    const url = new URL(req.url, "http://node-hub.local");
    if (url.pathname.replace(/\/+$/, "") !== WS_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, async ws => {
      ws.on("error", () => {});
      let identity;
      try {
        identity = await authenticate(url.searchParams);
      } catch (error) {
        identity = { error: "authentication failed" };
        logger.warn?.({ error: error.message }, "node-hub ws authentication failed");
      }
      if (identity.error) {
        closeWithError(ws, identity.error);
        return;
      }
      const conn = { ws, machineId: identity.machineId, nodeId: identity.nodeId, token: identity.token, lastSeen: Date.now(), sent: { nodes: "", perNode: new Map() } };
      connections.add(conn);
      ws.on("message", raw => onMessage(conn, raw));
      ws.on("pong", () => { conn.lastSeen = Date.now(); });
      ws.on("close", () => connections.delete(conn));
      sendEvent(conn, "auth.success");
      logger.info?.({ machineId: conn.machineId || undefined, nodeId: conn.nodeId || undefined }, "node-hub ws connected");
      // Everything the node should hold, right away: it may have missed changes while offline.
      reconcileAll().catch(error => logger.warn?.({ error: error.message }, "node-hub push failed"));
    });
  }

  // Application-level ping (answered with pong) plus a WebSocket ping frame: keeps idle proxies
  // from dropping the connection and lets the hub notice dead peers.
  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const conn of connections) {
      if (now - conn.lastSeen > idleTimeoutMs) {
        conn.ws.terminate();
        connections.delete(conn);
        continue;
      }
      sendEvent(conn, "ping");
      try { conn.ws.ping(); } catch {}
    }
  }, pingIntervalMs);
  heartbeat.unref?.();
  const safetyNet = setInterval(() => { if (connections.size) reconcileAll().catch(() => {}); }, reconcileIntervalMs);
  safetyNet.unref?.();

  return {
    handleUpgrade,
    schedule,
    reconcileAll,
    /** Connected machines and nodes, for the overview. */
    status() {
      return { machineIds: [...new Set([...connections].map(conn => conn.machineId).filter(Boolean))], nodeIds: [...new Set([...connections].map(conn => conn.nodeId).filter(Boolean))] };
    },
    close() {
      clearInterval(heartbeat);
      clearInterval(safetyNet);
      if (reconcileTimer) clearTimeout(reconcileTimer);
      for (const conn of connections) conn.ws.terminate();
      connections.clear();
      wss.close();
    }
  };
}

module.exports = { createNodeHubPush, wsUrlFor, WS_PATH };
