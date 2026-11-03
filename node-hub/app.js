// node-hub HTTP handler.
//
// Two surfaces on one port:
// - /api/v1/server/*, /api/v2/server/*: the Xboard panel API that xboard-node speaks, so stock
//   xboard-node binaries connect to this hub instead of an Xboard panel (machine mode:
//   machine_id + per-machine token; node mode: NODE_HUB_SERVER_TOKEN + node_id).
// - /internal/*: management API for the main app, Bearer token, loopback callers only unless
//   allowRemoteInternal is set. Only /api/ should be exposed through the public reverse proxy.
// - /api/v2/server/ws: WebSocket push to xboard-node (node-hub/push.js); attach handler.handleUpgrade
//   to the server's "upgrade" event. The handshake advertises it when publicUrl is set.
// - /api/v1/server/relay/*: relay machines (node-hub/relay.js) fetch their install script and pull
//   their realm rules here (relay_id + per-relay token).
const crypto = require("crypto");
const { URL } = require("url");
const { buildNodeConfig, clashProxy, normalizeNodeInput, nodeRuntimeChanged, generateRealityKeyPair } = require("./node-config");
const { nodeGuid, nodeBillingKey } = require("./store");
const { createNodeHubPush, wsUrlFor } = require("./push");
const { realmConfig, realmRulesChanged, configHash, relayInstallCommand, INSTALL_SCRIPT, CONFIG_PATH: RELAY_CONFIG_PATH, INSTALL_PATH: RELAY_INSTALL_PATH } = require("./relay");

const MAX_BODY_BYTES = 16 * 1024 * 1024;

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function isLoopback(address = "") {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1" || address.startsWith("127.");
}

function send(res, statusCode, body, headers = {}) {
  const payload = body === null ? "" : JSON.stringify(body);
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw httpError(413, "request body too large");
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw httpError(400, "invalid JSON body");
  }
}

function etagFor(body) {
  return crypto.createHash("sha1").update(JSON.stringify(body)).digest("hex");
}

function sendCached(req, res, body) {
  const tag = etagFor(body);
  if (String(req.headers["if-none-match"] || "").includes(tag)) {
    res.writeHead(304, { etag: `"${tag}"` });
    res.end();
    return;
  }
  send(res, 200, body, { etag: `"${tag}"` });
}

function numberMap(value, mapValue) {
  const out = {};
  for (const [key, item] of Object.entries(value && typeof value === "object" ? value : {})) {
    if (!/^\d+$/.test(key)) continue;
    const mapped = mapValue(item);
    if (mapped !== undefined) out[key] = mapped;
  }
  return out;
}

function normalizeStatus(value) {
  if (!value || typeof value !== "object") return null;
  const pair = item => ({ total: Math.max(0, Math.floor(Number(item?.total) || 0)), used: Math.max(0, Math.floor(Number(item?.used) || 0)) });
  const cpu = Number(value.cpu);
  return {
    cpu: Number.isFinite(cpu) ? Math.min(100, Math.max(0, cpu)) : 0,
    mem: pair(value.mem),
    swap: pair(value.swap),
    disk: pair(value.disk),
    ...(value.net && typeof value.net === "object" ? { net: { in_speed: Math.max(0, Number(value.net.in_speed) || 0), out_speed: Math.max(0, Number(value.net.out_speed) || 0) } } : {}),
    updatedAt: new Date().toISOString()
  };
}

// Machines always run the xray kernel: in machine mode xboard-node takes the kernel from its own
// config.yml and ignores a node's kernel_type, and the installer defaults to sing-box, which drops
// PROXY protocol and breaks nodes behind a relay. The release is pinned: v1.13.2 is the first fork
// build whose xray kernel closes the open connections of a user removed for depletion or expiry.
const XBOARD_NODE_VERSION = "v1.13.2";

function installCommand({ installerUrl, publicUrl, machine }) {
  if (!publicUrl) return "";
  return `curl -fsSL ${installerUrl} | sudo bash -s -- --mode machine --kernel xray --version ${XBOARD_NODE_VERSION} --panel ${publicUrl} --token ${machine.token} --machine-id ${machine.id}`;
}

function createNodeHubHandler({
  store,
  internalToken,
  serverToken = "",
  publicUrl = "",
  installerUrl = "https://raw.githubusercontent.com/alexischiang/nexora-node/dev/install.sh",
  pushInterval = 60,
  pullInterval = 60,
  onlineGraceSeconds = 0,
  allowRemoteInternal = false,
  websocket = true,
  logger = console
}) {
  if (!store) throw new Error("node-hub requires a store.");
  if (!internalToken || internalToken.length < 16) throw new Error("NODE_HUB_INTERNAL_TOKEN must be at least 16 characters.");
  const baseConfig = { push_interval: Math.max(10, Number(pushInterval) || 60), pull_interval: Math.max(10, Number(pullInterval) || 60) };
  const graceMs = Math.max(Number(onlineGraceSeconds) || 0, baseConfig.push_interval * 3, 180) * 1000;
  const wsUrl = websocket ? wsUrlFor(publicUrl) : "";
  const push = wsUrl ? createNodeHubPush({ store, serverToken, baseConfig, logger }) : null;

  function nodeOnline(node, now = Date.now()) {
    const last = Math.max(Date.parse(node.lastPushAt || "") || 0, Date.parse(node.lastCheckAt || "") || 0);
    return last > 0 && now - last <= graceMs;
  }

  // Resolves the caller of the node API: { machine, node } (node null on handshake/machine routes).
  // allowDisabled: a node that was disabled keeps running until the machine's next node-list
  // refresh (up to a minute); its reports are still accepted so no traffic is lost, and its
  // user list is empty so nobody can connect to it in the meantime.
  async function authenticateNode(params, { requireNode = true, allowDisabled = false } = {}) {
    const token = String(params.token || "");
    if (params.machine_id !== undefined && params.machine_id !== "" && params.machine_id !== null) {
      const machine = await store.authenticateMachine(params.machine_id, token);
      if (!machine) throw httpError(401, "Machine not found or invalid token");
      if (!machine.isActive) throw httpError(403, "Machine is disabled");
      await store.touchMachine(machine.id);
      const nodeId = Number(params.node_id || 0);
      if (!nodeId) {
        if (requireNode) throw httpError(422, "node_id is required");
        return { machine, node: null };
      }
      const node = await store.getNode(nodeId);
      if (!node || node.machineId !== machine.id || (!node.enabled && !allowDisabled)) throw httpError(404, "Node not found on this machine");
      return { machine, node };
    }
    if (!serverToken || !safeEqual(token, serverToken)) throw httpError(401, "Invalid token");
    const nodeId = Number(params.node_id || 0);
    if (!nodeId) {
      if (requireNode) throw httpError(422, "node_id is required");
      return { machine: null, node: null };
    }
    const node = await store.getNode(nodeId);
    if (!node || (!node.enabled && !allowDisabled)) throw httpError(404, "Server does not exist");
    const machine = node.machineId ? await store.getMachine(node.machineId) : null;
    if (machine && !machine.isActive) throw httpError(403, "Machine is disabled");
    return { machine, node };
  }

  async function nodeNameFor(node, machine) {
    if (machine) return machine.name;
    return node.name;
  }

  // presenceMode "snapshot": the v2 report, where a missing `online` means nobody is connected;
  // "keep": legacy single-purpose pushes that say nothing about presence.
  async function applyReport(caller, payload, { presenceMode = "snapshot" } = {}) {
    const { node, machine } = caller;
    const traffic = numberMap(payload.traffic, item => Array.isArray(item) && item.length === 2 ? [Number(item[0]) || 0, Number(item[1]) || 0] : undefined);
    const alive = payload.alive && typeof payload.alive === "object" ? numberMap(payload.alive, item => Array.isArray(item) ? item.map(String) : undefined) : null;
    const online = payload.online && typeof payload.online === "object" ? numberMap(payload.online, item => Math.max(0, Number(item) || 0)) : null;
    const result = await store.recordReport(node, {
      traffic,
      // `alive` missing means "unchanged since the last report"; `online` missing means nobody.
      alive: alive && Object.keys(alive).length ? alive : null,
      online: presenceMode === "keep" ? null : online || {},
      status: normalizeStatus(payload.status),
      metrics: payload.metrics && typeof payload.metrics === "object" ? { ...payload.metrics, updatedAt: new Date().toISOString() } : null,
      reportId: String(payload.report_id || payload.reportId || "")
    }, { nodeName: await nodeNameFor(node, machine) });
    if (result.unknownUsers) logger.warn?.({ nodeId: node.id, unknownUsers: result.unknownUsers }, "node-hub report contained unknown user ids");
    return result;
  }

  async function handleNodeApi(req, res, url) {
    const path = url.pathname.replace(/\/+$/, "");
    const query = Object.fromEntries(url.searchParams);
    const body = req.method === "GET" ? {} : await readBody(req);
    const params = { ...query, ...body };
    const v1 = path.startsWith("/api/v1/server/UniProxy/");
    const v2 = path.startsWith("/api/v2/server/");
    const action = v1 ? path.slice("/api/v1/server/UniProxy/".length) : v2 ? path.slice("/api/v2/server/".length) : "";

    if (action === "machine/nodes" && req.method === "POST") {
      const { machine } = await authenticateNode(params, { requireNode: false });
      if (!machine) throw httpError(401, "machine_id is required");
      const nodes = await store.listNodes({ machineId: machine.id, enabledOnly: true });
      return send(res, 200, { nodes: nodes.map(node => ({ id: node.id, type: node.protocol, name: node.name })), base_config: baseConfig });
    }
    if (action === "machine/status" && req.method === "POST") {
      const { machine } = await authenticateNode(params, { requireNode: false });
      if (!machine) throw httpError(401, "machine_id is required");
      const status = normalizeStatus(params);
      if (!status) throw httpError(422, "invalid status");
      await store.recordMachineStatus(machine.id, status);
      return send(res, 200, { data: true });
    }
    if (v2 && action === "handshake" && (req.method === "GET" || req.method === "POST")) {
      await authenticateNode(params, { requireNode: false });
      return send(res, 200, { websocket: push ? { enabled: true, ws_url: wsUrl } : { enabled: false }, settings: baseConfig });
    }
    if (action === "config" && req.method === "GET") {
      const caller = await authenticateNode(params);
      await store.touchNode(caller.node.id);
      return sendCached(req, res, { ...buildNodeConfig(caller.node), base_config: baseConfig });
    }
    if (action === "user" && req.method === "GET") {
      const caller = await authenticateNode(params, { allowDisabled: true });
      await store.touchNode(caller.node.id);
      return sendCached(req, res, { users: caller.node.enabled ? await store.nodeUsers(caller.node.id) : [] });
    }
    if (action === "alivelist" && req.method === "GET") {
      const caller = await authenticateNode(params);
      const users = await store.nodeUsers(caller.node.id);
      const limited = new Map(users.filter(user => user.device_limit > 0).map(user => [user.id, user]));
      const presence = await store.presence();
      const byKey = new Map((await store.listUsers()).map(user => [user.userKey, user.id]));
      const alive = {};
      for (const [userKey, entry] of Object.entries(presence.users)) {
        const id = byKey.get(userKey);
        if (limited.has(id) && entry.ips.length) alive[id] = entry.ips.length;
      }
      return send(res, 200, { alive });
    }
    if (v2 && action === "report" && req.method === "POST") {
      const caller = await authenticateNode(params, { allowDisabled: true });
      const result = await applyReport(caller, params);
      return send(res, 200, { data: true, duplicate: result.duplicate || undefined });
    }
    if (action === "push" && req.method === "POST") {
      const caller = await authenticateNode(params, { allowDisabled: true });
      await applyReport(caller, { traffic: params }, { presenceMode: "keep" });
      return send(res, 200, { data: true });
    }
    if (action === "alive" && req.method === "POST") {
      const caller = await authenticateNode(params, { allowDisabled: true });
      const alive = numberMap(params, item => Array.isArray(item) ? item.map(String) : undefined);
      await applyReport(caller, { alive, online: Object.fromEntries(Object.entries(alive).map(([id, ips]) => [id, ips.length])) });
      return send(res, 200, { data: true });
    }
    if (action === "status" && req.method === "POST") {
      const caller = await authenticateNode(params, { allowDisabled: true });
      await applyReport(caller, { status: params }, { presenceMode: "keep" });
      return send(res, 200, { data: true, code: 0, message: "success" });
    }
    throw httpError(404, "Not found");
  }

  // A relay pulls every 30 seconds; three missed pulls is offline.
  const RELAY_GRACE_MS = 90 * 1000;

  async function relayView(relay, now = Date.now()) {
    const { token, ...rest } = relay;
    const endpoints = await store.relayEndpoints(relay.id);
    const expected = configHash(realmConfig(relay, relay.isActive ? endpoints : []));
    return {
      ...rest,
      online: relay.isActive && Boolean(relay.lastSeenAt) && now - Date.parse(relay.lastSeenAt) <= RELAY_GRACE_MS,
      realmActive: relay.status?.realm === "active",
      synced: relay.status?.applied === expected,
      endpointCount: endpoints.length,
      endpoints
    };
  }

  // A node with relay entries is served only through them, so it must accept the relays' PROXY
  // protocol header (xray kernel) and its machine needs an address for the relays to forward to.
  async function relayModeInput(input, relayIds) {
    if (!relayIds.length) return input;
    for (const relayId of relayIds) if (!(await store.getRelay(relayId))) throw httpError(404, "中转机不存在。");
    const machine = input.machineId ? await store.getMachine(input.machineId) : null;
    if (!machine?.host) throw httpError(400, "经中转的节点需要所属机器填写地址，中转机会转发到这个地址。");
    return { ...input, settings: { ...(input.settings || {}), kernel_type: "xray", accept_proxy_protocol: true } };
  }

  function relayIdsFrom(value) {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) throw httpError(400, "relayIds 必须是数组。");
    return [...new Set(value.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
  }

  async function overview() {
    const [machines, nodes, counts, relays, entries] = await Promise.all([store.listMachines(), store.listNodes(), store.nodeCounts(), store.listRelays(), store.listNodeRelays()]);
    const now = Date.now();
    const machinesById = new Map(machines.map(machine => [machine.id, machine]));
    const pushed = push ? push.status() : { machineIds: [], nodeIds: [] };
    return {
      settings: { publicUrl, pushInterval: baseConfig.push_interval, pullInterval: baseConfig.pull_interval, onlineGraceSeconds: graceMs / 1000, websocket: Boolean(push) },
      machines: machines.map(({ token, ...machine }) => ({
        ...machine,
        pushConnected: pushed.machineIds.includes(machine.id),
        online: Boolean(machine.lastSeenAt) && now - Date.parse(machine.lastSeenAt) <= graceMs,
        guid: `hub-m${machine.id}`,
        nodeIds: nodes.filter(node => node.machineId === machine.id).map(node => node.id)
      })),
      nodes: nodes.map(node => ({
        ...node,
        guid: nodeGuid(node),
        billingKey: nodeBillingKey(node),
        machineName: machinesById.get(node.machineId)?.name || "",
        online: node.enabled && nodeOnline(node, now),
        userCount: counts[node.id]?.users || 0,
        onlineCount: counts[node.id]?.online || 0,
        relays: entries.filter(entry => entry.nodeId === node.id)
      })),
      relays: await Promise.all(relays.map(relay => relayView(relay, now)))
    };
  }

  async function handleInternal(req, res, url) {
    if (!allowRemoteInternal && !isLoopback(req.socket.remoteAddress)) throw httpError(403, "internal API is loopback only");
    if (!safeEqual(req.headers.authorization, `Bearer ${internalToken}`)) throw httpError(401, "Unauthorized");
    const path = url.pathname.replace(/\/+$/, "");
    const method = req.method;
    const body = method === "GET" || method === "DELETE" ? {} : await readBody(req);
    let match;

    if (path === "/internal/health" && method === "GET") {
      await store.ping();
      return send(res, 200, { ok: true });
    }
    if (path === "/internal/overview" && method === "GET") return send(res, 200, await overview());
    if (path === "/internal/reality-keypair" && method === "POST") return send(res, 200, generateRealityKeyPair());

    if (path === "/internal/machines" && method === "GET") return send(res, 200, (await store.listMachines()).map(({ token, ...machine }) => machine));
    if (path === "/internal/machines" && method === "POST") {
      const machine = await store.createMachine(body);
      return send(res, 201, { ...machine, installCommand: installCommand({ installerUrl, publicUrl, machine }) });
    }
    if ((match = path.match(/^\/internal\/machines\/(\d+)$/))) {
      if (method === "GET") {
        const machine = await store.getMachine(match[1]);
        if (!machine) throw httpError(404, "机器不存在。");
        return send(res, 200, { ...machine, installCommand: installCommand({ installerUrl, publicUrl, machine }), loadHistory: await store.machineLoadHistory(machine.id) });
      }
      if (method === "PUT") {
        const machine = await store.updateMachine(match[1], body);
        if (!machine) throw httpError(404, "机器不存在。");
        const { token, ...rest } = machine;
        return send(res, 200, rest);
      }
      if (method === "DELETE") {
        if (!(await store.deleteMachine(match[1]))) throw httpError(404, "机器不存在。");
        return send(res, 200, { ok: true });
      }
    }
    if ((match = path.match(/^\/internal\/machines\/(\d+)\/reset-token$/)) && method === "POST") {
      const machine = await store.resetMachineToken(match[1]);
      if (!machine) throw httpError(404, "机器不存在。");
      return send(res, 200, { ...machine, installCommand: installCommand({ installerUrl, publicUrl, machine }) });
    }

    if (path === "/internal/relays" && method === "GET") return send(res, 200, (await overview()).relays);
    if (path === "/internal/relays" && method === "POST") {
      const relay = await store.createRelay(body);
      return send(res, 201, { ...(await relayView(relay)), token: relay.token, installCommand: relayInstallCommand({ publicUrl, relay }) });
    }
    if ((match = path.match(/^\/internal\/relays\/(\d+)$/))) {
      if (method === "GET") {
        const relay = await store.getRelay(match[1]);
        if (!relay) throw httpError(404, "中转机不存在。");
        return send(res, 200, { ...(await relayView(relay)), installCommand: relayInstallCommand({ publicUrl, relay }) });
      }
      if (method === "PUT") {
        const existing = await store.getRelay(match[1]);
        if (!existing) throw httpError(404, "中转机不存在。");
        const endpoints = await store.relayEndpoints(existing.id);
        const relay = await store.updateRelay(existing.id, body);
        send(res, 200, { ...(await relayView(relay)), rulesChanged: realmRulesChanged(existing, relay, endpoints) });
        // Relays pull their rules and machines never see relays, so a relay edit has nothing to push:
        // a rename, notes or a new public address leave realm's file byte for byte as it was.
        return { push: false };
      }
      if (method === "DELETE") {
        if (!(await store.deleteRelay(match[1]))) throw httpError(404, "中转机不存在。");
        return send(res, 200, { ok: true });
      }
    }
    if ((match = path.match(/^\/internal\/relays\/(\d+)\/reset-token$/)) && method === "POST") {
      const relay = await store.resetRelayToken(match[1]);
      if (!relay) throw httpError(404, "中转机不存在。");
      return send(res, 200, { ...(await relayView(relay)), token: relay.token, installCommand: relayInstallCommand({ publicUrl, relay }) });
    }

    if (path === "/internal/nodes" && method === "GET") return send(res, 200, (await overview()).nodes);
    if (path === "/internal/nodes" && method === "POST") {
      const machineId = body.machineId === null || body.machineId === undefined || body.machineId === "" ? null : Number(body.machineId);
      if (machineId === null && !serverToken) throw httpError(400, "请选择节点所属的机器（未配置 NODE_HUB_SERVER_TOKEN 时只支持机器模式）。");
      const relayIds = relayIdsFrom(body.relayIds) || [];
      const node = await store.createNode(machineId, normalizeNodeInput(await relayModeInput({ ...body, machineId }, relayIds)));
      return send(res, 201, { ...node, relays: await store.setNodeRelays(node.id, relayIds) });
    }
    if ((match = path.match(/^\/internal\/nodes\/(\d+)$/))) {
      const existing = await store.getNode(match[1]);
      if (!existing) throw httpError(404, "节点不存在。");
      if (method === "GET") return send(res, 200, { ...existing, relays: await store.listNodeRelays(existing.id) });
      if (method === "PUT") {
        // relayIds absent (e.g. the enable/disable toggle) keeps the node's current entries.
        const previousRelayIds = (await store.listNodeRelays(existing.id)).map(entry => entry.relayId);
        const relayIds = relayIdsFrom(body.relayIds) ?? previousRelayIds;
        const merged = await relayModeInput({ ...existing, ...body, machineId: existing.machineId, settings: body.settings ?? existing.settings }, relayIds);
        const node = await store.updateNode(existing.id, normalizeNodeInput(merged, existing));
        send(res, 200, { ...node, relays: await store.setNodeRelays(existing.id, relayIds) });
        // Renaming or re-sorting a node must not restart xray on its machine or realm on its relays.
        return { push: nodeRuntimeChanged(existing, node, previousRelayIds, relayIds) };
      }
      if (method === "DELETE") {
        await store.deleteNode(existing.id);
        return send(res, 200, { ok: true });
      }
    }

    if (path === "/internal/users" && method === "PUT") {
      if (!Array.isArray(body.users)) throw httpError(400, "users 必须是数组。");
      return send(res, 200, await store.syncUsers(body.users, { replace: body.replace === true }));
    }
    if ((match = path.match(/^\/internal\/users\/([^/]+)\/uuid$/)) && method === "PUT") {
      return send(res, 200, await store.setUserUuid(decodeURIComponent(match[1]), body));
    }
    if ((match = path.match(/^\/internal\/users\/([^/]+)$/))) {
      const userKey = decodeURIComponent(match[1]);
      if (method === "GET") {
        const user = await store.getUser(userKey);
        if (!user) throw httpError(404, "用户不存在。");
        return send(res, 200, user);
      }
      if (method === "PUT") {
        await store.syncUsers([{ ...body, userKey }]);
        return send(res, 200, await store.getUser(userKey));
      }
    }
    if (path === "/internal/presence" && method === "GET") return send(res, 200, { checkedAt: new Date().toISOString(), ...(await store.presence()) });

    if ((match = path.match(/^\/internal\/subscription\/([^/]+)$/)) && method === "GET") {
      const user = await store.getUser(decodeURIComponent(match[1]));
      if (!user) return send(res, 200, { proxies: [] });
      const wanted = new Set(user.nodeIds);
      const nodes = (await store.listNodes({ enabledOnly: true })).filter(node => wanted.has(node.id));
      const entries = await store.listNodeRelays();
      // A relay-mode node is listed once per active relay (address and port of the relay) and never
      // directly: it only accepts connections that carry the relay's PROXY protocol header. It keeps
      // its own name; only a node behind several relays adds the relay's name, since Clash needs
      // proxy names to be unique.
      const proxies = nodes.flatMap(node => {
        const relays = entries.filter(entry => entry.nodeId === node.id);
        if (!relays.length) return [{ nodeId: node.id, guid: nodeGuid(node), proxy: clashProxy(node, user.uuid) }];
        const active = relays.filter(entry => entry.relayActive);
        return active.map(entry => ({ nodeId: node.id, relayId: entry.relayId, guid: nodeGuid(node), proxy: clashProxy({ ...node, host: entry.relayHost, serverPort: entry.listenPort }, user.uuid, active.length > 1 ? `${node.name} · ${entry.relayName}` : node.name) }));
      });
      return send(res, 200, { uuid: user.uuid, proxies: proxies.filter(item => item.proxy) });
    }

    throw httpError(404, "Not found");
  }

  // The relay's sync pulls its realm rules here and reports realm's state and the rules it applied.
  async function handleRelayConfig(res, url) {
    const relay = await store.authenticateRelay(url.searchParams.get("relay_id"), url.searchParams.get("token"));
    if (!relay) throw httpError(401, "Relay not found or invalid token");
    await store.recordRelaySeen(relay.id, {
      realm: String(url.searchParams.get("realm") || "unknown").slice(0, 32),
      applied: String(url.searchParams.get("applied") || "").slice(0, 64),
      reportedAt: new Date().toISOString()
    });
    // A disabled relay gets no rules, so its sync stops realm instead of forwarding stale ones.
    const text = realmConfig(relay, relay.isActive ? await store.relayEndpoints(relay.id) : []);
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-config-hash": configHash(text) });
    res.end(text);
  }

  async function nodeHubHandler(req, res) {
    const url = new URL(req.url, "http://node-hub.local");
    try {
      if (url.pathname.startsWith("/internal/")) {
        const outcome = await handleInternal(req, res, url);
        // Any management write may change what a connected node should hold, unless the handler
        // knows it did not (a node edit that only touched names, regions or ordering).
        if (req.method !== "GET" && outcome?.push !== false) push?.schedule();
        return;
      }
      if (url.pathname === RELAY_INSTALL_PATH && req.method === "GET") {
        res.writeHead(200, { "content-type": "text/x-shellscript; charset=utf-8", "cache-control": "no-store" });
        return res.end(INSTALL_SCRIPT);
      }
      if (url.pathname === RELAY_CONFIG_PATH && req.method === "GET") return await handleRelayConfig(res, url);
      if (url.pathname.startsWith("/api/v1/server/") || url.pathname.startsWith("/api/v2/server/")) return await handleNodeApi(req, res, url);
      if (url.pathname === "/health") return send(res, 200, { ok: true });
      throw httpError(404, "Not found");
    } catch (error) {
      const statusCode = error.statusCode || (error.code === "57014" ? 503 : 500);
      if (statusCode >= 500) logger.error?.({ path: url.pathname, error: error.message }, "node-hub request failed");
      if (!res.headersSent) send(res, statusCode, { message: error.message, error: error.message });
      else res.end();
    }
  }
  nodeHubHandler.handleUpgrade = (req, socket, head) => push ? push.handleUpgrade(req, socket, head) : socket.destroy();
  nodeHubHandler.push = push;
  nodeHubHandler.close = () => push?.close();
  return nodeHubHandler;
}

module.exports = { createNodeHubHandler, installCommand };
