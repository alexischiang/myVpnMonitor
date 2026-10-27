// node-hub checks: node protocol settings, the Xboard-compatible node API as xboard-node calls it,
// traffic accounting into xui_daily_traffic, presence, entitlements and the internal API.
// Needs TEST_DATABASE_URL (a disposable database; nh_* tables are recreated).
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { Pool } = require("pg");
const { NodeHubStore, chinaDateKey } = require("./node-hub/store");
const { createNodeHubHandler } = require("./node-hub/app");
const nodeConfig = require("./node-hub/node-config");
const { convertXuiInbound } = require("./node-hub/xui-import");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const execFileAsync = promisify(execFile);
const os = require("node:os");

function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return "";
  return fs.readFileSync(envPath, "utf8").match(/^TEST_DATABASE_URL=(.+)$/m)?.[1]?.trim() || "";
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

const { XboardNodeClient } = require("./node-hub/xboard-node-client");
const { WebSocket } = require("ws");

// A WebSocket client that records every message, as xboard-node's panel.WSClient sees them.
function openNodeSocket(base, query) {
  const socket = new WebSocket(`${base.replace(/^http/, "ws")}/api/v2/server/ws?${new URLSearchParams(query)}`);
  const messages = [];
  const waiters = [];
  socket.on("message", raw => {
    const message = JSON.parse(String(raw));
    messages.push(message);
    for (const waiter of [...waiters]) if (waiter.match(message)) {
      waiters.splice(waiters.indexOf(waiter), 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  const closed = new Promise(resolve => socket.on("close", code => resolve(code)));
  return {
    socket,
    messages,
    closed,
    send: (event, data) => socket.send(JSON.stringify({ event, data })),
    // Resolves with the first message (already received or arriving) that matches.
    next(match, label, timeoutMs = 3000) {
      const seen = messages.find(match);
      if (seen) {
        messages.splice(messages.indexOf(seen), 1);
        return Promise.resolve(seen);
      }
      return new Promise((resolve, reject) => {
        const waiter = { match, resolve, timer: setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), timeoutMs) };
        waiters.push({ ...waiter, resolve: message => { messages.splice(messages.indexOf(message), 1); resolve(message); } });
      });
    },
    close: () => socket.close()
  };
}

// WebSocket push: what a connected xboard-node receives after each kind of management change.
async function wsChecks({ base, internal, machine, otherMachine, vlessNodeId, hyNodeId, hkNodeId, storedA, storedB, userA, userB }) {
  const event = (name, nodeId) => message => message.event === name && (nodeId === undefined || message.data?.node_id === nodeId);

  const rejected = openNodeSocket(base, { token: "bad", machine_id: machine.id });
  const error = await rejected.next(event("error"), "auth error");
  assert.equal(error.data.message, "Machine not found or invalid token");
  assert.equal(await rejected.closed, 4001);

  const ws = openNodeSocket(base, { token: machine.token, machine_id: machine.id });
  assert.equal((await ws.next(() => true, "first message")).event, "auth.success", "the first message is auth.success");
  const nodes = await ws.next(event("sync.nodes"), "sync.nodes");
  assert.deepEqual(nodes.data.nodes.map(item => [item.id, item.type]), [[vlessNodeId, "vless"], [hyNodeId, "hysteria"]], "on connect the machine gets its node list");
  const config = await ws.next(event("sync.config", vlessNodeId), "vless config");
  assert.equal(config.data.config.server_port, 8444);
  assert.deepEqual(config.data.config.base_config, { push_interval: 60, pull_interval: 60 });
  assert.deepEqual((await ws.next(event("sync.users", vlessNodeId), "vless users")).data.users, [{ id: storedA.id, uuid: userA.uuid, speed_limit: 50, device_limit: 3 }]);
  assert.deepEqual((await ws.next(event("sync.users", hyNodeId), "hy users")).data.users.map(user => user.id), [storedA.id, storedB.id]);
  await ws.next(event("sync.config", hyNodeId), "hy config");

  // Entitlement change: xboard-node ignores an empty sync.users, so a machine whose node lost its last
  // user is told to reconcile over REST (an unknown delta action; its mailbox drops an emptied list).
  await internal("PUT", "/internal/users", { users: [{ ...userB, uuid: storedB.uuid }], replace: true });
  const removed = await ws.next(event("sync.user.delta", vlessNodeId), "vless removal");
  assert.equal(removed.data.action, "resync");
  assert.deepEqual(removed.data.users.map(user => user.id), [storedA.id]);
  assert.deepEqual((await ws.next(event("sync.users", hyNodeId), "hy users after sync")).data.users.map(user => user.id), [storedB.id]);
  await internal("PUT", "/internal/users/user-a", userA);
  assert.deepEqual((await ws.next(event("sync.users", vlessNodeId), "vless users back")).data.users.map(user => user.id), [storedA.id]);
  assert.deepEqual((await ws.next(event("sync.users", hyNodeId), "hy users back")).data.users.map(user => user.id), [storedA.id, storedB.id]);

  // Node edits: config changes go out as sync.config, list changes as sync.nodes; nothing unchanged is resent.
  await internal("PUT", `/internal/nodes/${vlessNodeId}`, { serverPort: 8445 });
  assert.equal((await ws.next(event("sync.config", vlessNodeId), "edited config")).data.config.server_port, 8445);
  await internal("PUT", `/internal/nodes/${vlessNodeId}`, { serverPort: 8444 });
  await ws.next(event("sync.config", vlessNodeId), "restored config");
  const extra = (await internal("POST", "/internal/nodes", { machineId: machine.id, name: "WS 测试", protocol: "shadowsocks", host: "la.example.com", serverPort: 9443, settings: { cipher: "aes-128-gcm" } })).body;
  assert.deepEqual((await ws.next(event("sync.nodes"), "node added")).data.nodes.map(item => item.id), [vlessNodeId, hyNodeId, extra.id]);
  await internal("DELETE", `/internal/nodes/${extra.id}`);
  assert.deepEqual((await ws.next(event("sync.nodes"), "node removed")).data.nodes.map(item => item.id), [vlessNodeId, hyNodeId]);
  assert.equal(ws.messages.filter(message => message.event === "sync.users").length, 0, "user lists that did not change are not resent");
  assert.equal(ws.messages.some(message => message.event === "sync.user.delta"), false, "a node created after connecting gets no removal delta");

  // Device reports from every node become one global view pushed to each node.
  ws.send("report.devices", { node_id: hyNodeId, devices: { [storedB.id]: ["192.0.2.10", "192.0.2.11"] } });
  const devices = await ws.next(message => message.event === "sync.devices" && message.data?.users?.[storedB.id], "global devices");
  assert.deepEqual(devices.data.users[storedB.id], ["192.0.2.10", "192.0.2.11"]);

  // The overview shows which machines hold a live push channel.
  assert.equal((await internal("GET", "/internal/overview")).body.machines.find(item => item.id === machine.id).pushConnected, true);

  // Node mode (NODE_HUB_SERVER_TOKEN + node_id): one node per connection, no node list.
  const single = openNodeSocket(base, { token: "global-node-token", node_id: hkNodeId });
  await single.next(event("auth.success"), "node-mode auth");
  assert.equal((await single.next(event("sync.config", hkNodeId), "node-mode config")).data.config.protocol, "vless");
  assert.equal(single.messages.some(message => message.event === "sync.nodes"), false);
  single.close();

  // Revoked credentials end the connection: a token reset on another machine closes its socket.
  const other = openNodeSocket(base, { token: otherMachine.token, machine_id: otherMachine.id });
  await other.next(event("auth.success"), "other machine auth");
  await internal("POST", `/internal/machines/${otherMachine.id}/reset-token`);
  assert.equal((await other.next(event("error"), "revoked")).data.message, "credentials revoked");
  assert.equal(await other.closed, 4001);
  ws.close();
  await ws.closed;
}

function unitChecks() {
  const keys = nodeConfig.generateRealityKeyPair();
  assert.match(keys.privateKey, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(nodeConfig.realityPublicKey(keys.privateKey), keys.publicKey);
  assert.match(keys.shortId, /^[0-9a-f]{16}$/);

  const vless = nodeConfig.normalizeNodeInput({ name: "HK 01", protocol: "vless", host: "hk.example.com", serverPort: 443, settings: { network: "tcp", tls: 2, flow: "xtls-rprx-vision", reality_settings: { server_name: "www.apple.com", private_key: keys.privateKey, short_id: keys.shortId } } });
  assert.equal(vless.settings.reality_settings.public_key, keys.publicKey, "public key is derived from the private key");
  assert.equal(vless.settings.reality_settings.dest, "www.apple.com:443");
  assert.throws(() => nodeConfig.normalizeNodeInput({ ...vless, settings: { ...vless.settings, reality_settings: { ...vless.settings.reality_settings, public_key: nodeConfig.generateRealityKeyPair().publicKey } } }), /不匹配/);
  assert.throws(() => nodeConfig.normalizeNodeInput({ ...vless, settings: { network: "ws", tls: 2, flow: "xtls-rprx-vision", reality_settings: vless.settings.reality_settings } }), /xtls-rprx-vision/);
  assert.throws(() => nodeConfig.normalizeNodeInput({ ...vless, serverPort: 70000 }), /端口/);
  assert.throws(() => nodeConfig.normalizeNodeInput({ ...vless, protocol: "wireguard" }), /不支持的协议/);
  assert.throws(() => nodeConfig.normalizeNodeInput({ name: "T", protocol: "trojan", host: "a.b", serverPort: 1, settings: { tls: 0 } }), /Trojan/);

  const built = nodeConfig.buildNodeConfig({ ...vless, id: 1 });
  assert.deepEqual(
    { protocol: built.protocol, port: built.server_port, tls: built.tls, flow: built.flow, sni: built.tls_settings.server_name, pk: built.tls_settings.private_key, sid: built.tls_settings.short_id, dest: built.tls_settings.dest },
    { protocol: "vless", port: 443, tls: 2, flow: "xtls-rprx-vision", sni: "www.apple.com", pk: keys.privateKey, sid: keys.shortId, dest: "www.apple.com:443" }
  );
  const uuid = "6f2c1f3e-8a7b-4c2d-9e1f-0a1b2c3d4e5f";
  const proxy = nodeConfig.clashProxy({ ...vless, id: 1 }, uuid);
  assert.deepEqual(proxy, { name: "HK 01", type: "vless", server: "hk.example.com", port: 443, uuid, udp: true, tls: true, encryption: "none", flow: "xtls-rprx-vision", "skip-cert-verify": false, servername: "www.apple.com", "reality-opts": { "public-key": keys.publicKey, "short-id": keys.shortId }, "client-fingerprint": "chrome", network: "tcp" });

  // Shadowsocks 2022: xboard-node keys each user with the first 16 bytes of the uuid text
  // (zero padded) and the node with the server key; clients use "server:user".
  const ss = { ...nodeConfig.normalizeNodeInput({ name: "SS", protocol: "shadowsocks", host: "ss.example.com", serverPort: 8388, settings: { cipher: "2022-blake3-aes-128-gcm" } }), id: 7, createdAt: "2026-01-01T00:00:00.000Z" };
  const serverKey = nodeConfig.buildNodeConfig(ss).server_key;
  assert.equal(Buffer.from(serverKey, "base64").length, 16);
  assert.equal(nodeConfig.shadowsocksUserPassword(ss, uuid), Buffer.from(uuid.slice(0, 16)).toString("base64"));
  assert.equal(nodeConfig.clashProxy(ss, uuid).password, `${serverKey}:${Buffer.from(uuid.slice(0, 16)).toString("base64")}`);
  assert.equal(nodeConfig.buildNodeConfig(ss).server_key, serverKey, "server key is stable for a node");

  const hy2 = nodeConfig.normalizeNodeInput({ name: "HY2", protocol: "hysteria", host: "hy.example.com", serverPort: 8443, settings: { tls: { server_name: "hy.example.com" }, bandwidth: { up: 100, down: 500 }, obfs: { open: true, password: "x" } } });
  const hyConfig = nodeConfig.buildNodeConfig({ ...hy2, id: 3 });
  assert.equal(hyConfig.version, 2);
  assert.equal(hyConfig.obfs, "salamander");
  assert.equal(hyConfig["obfs-password"], "x");
  assert.equal(nodeConfig.clashProxy({ ...hy2, id: 3 }, uuid).type, "hysteria2");
  assert.equal(chinaDateKey(Date.parse("2026-10-25T16:30:00.000Z")), "2026-10-26", "traffic dates use China days like the 3x-ui sampler");

  // 3x-ui inbound -> node-hub node: port, REALITY keys, SNI, short id, flow and uuids are kept.
  const fixture = xuiFixture(keys);
  const converted = convertXuiInbound(fixture.inbounds[0], { host: "la.example.com", localGuid: "panel-guid" });
  assert.equal(converted.xuiKey, "panel-guid:1");
  assert.deepEqual({ protocol: converted.node.protocol, port: converted.node.serverPort, tls: converted.node.settings.tls, flow: converted.node.settings.flow, sni: converted.node.settings.reality_settings.server_name, sid: converted.node.settings.reality_settings.short_id, pk: converted.node.settings.reality_settings.private_key, pub: converted.node.settings.reality_settings.public_key, dest: converted.node.settings.reality_settings.dest },
    { protocol: "vless", port: 443, tls: 2, flow: "xtls-rprx-vision", sni: "www.apple.com", sid: "6ba85179e30d4fc2", pk: keys.privateKey, pub: keys.publicKey, dest: "www.apple.com:443" });
  assert.deepEqual(converted.clients.map(client => client.email), ["migrated@example.test", "nouuid@example.test"].slice(0, 1), "clients without a uuid-shaped id are not carried over");
  assert.ok(converted.warnings.some(warning => warning.includes("shortId")));
  nodeConfig.normalizeNodeInput(converted.node);
  const ws = convertXuiInbound(fixture.inbounds[1], { host: "hk.example.com", localGuid: "panel-guid" });
  assert.deepEqual([ws.nodeGuid, ws.node.settings.network, ws.node.settings.network_settings.path, ws.node.settings.tls], ["node-hk", "ws", "/ray", 0]);
  assert.match(convertXuiInbound({ id: 9, protocol: "wireguard", remark: "wg" }).skip, /暂不支持/);
}

function xuiFixture(keys) {
  return {
    status: { panelGuid: "panel-guid" },
    nodes: [{ id: 2, guid: "node-hk", remark: "HK-VPS", address: "hk.example.com" }],
    inbounds: [
      { id: 1, remark: "美国 REALITY", protocol: "vless", port: 443, enable: true, originNodeGuid: "node:local",
        settings: JSON.stringify({ clients: [{ id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", email: "Migrated@Example.test", flow: "xtls-rprx-vision" }, { id: "12", email: "nouuid@example.test", flow: "xtls-rprx-vision" }], decryption: "none" }),
        streamSettings: JSON.stringify({ network: "tcp", security: "reality", realitySettings: { show: false, target: "www.apple.com:443", serverNames: ["www.apple.com"], privateKey: keys.privateKey, shortIds: ["6ba85179e30d4fc2", "1a"], settings: { publicKey: keys.publicKey, fingerprint: "chrome" } } }) },
      { id: 5, remark: "香港 WS", protocol: "vless", port: 8080, enable: true, originNodeGuid: "node-hk",
        settings: { clients: [{ id: "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee", email: "hk@example.test" }] },
        streamSettings: { network: "ws", security: "none", wsSettings: { path: "/ray", headers: { Host: "hk.example.com" } } } }
    ]
  };
}

async function main() {
  unitChecks();
  const databaseUrl = testDatabaseUrl();
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for node-hub tests");
  const pool = new Pool({ connectionString: databaseUrl });
  await pool.query("DROP TABLE IF EXISTS nh_presence, nh_machine_load, nh_report_ids, nh_users, nh_nodes, nh_machines, nh_schema_migrations CASCADE");
  await pool.query("DELETE FROM xui_daily_traffic WHERE node_guid LIKE 'hub-%'").catch(() => {});
  const store = new NodeHubStore(pool);
  await store.init();
  await store.init();
  const internalToken = crypto.randomBytes(16).toString("hex");
  const handler = createNodeHubHandler({ store, internalToken, serverToken: "global-node-token", publicUrl: "https://hub.example.com", pushInterval: 60, pullInterval: 60, logger: { warn() {}, error() {} } });
  const server = http.createServer(handler);
  server.on("upgrade", handler.handleUpgrade);
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;
  const internal = async (method, pathname, body) => {
    const response = await fetch(base + pathname, { method, headers: { authorization: `Bearer ${internalToken}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  try {
    // Internal API: auth, machines, nodes.
    assert.equal((await fetch(`${base}/internal/overview`)).status, 401);
    assert.equal((await fetch(`${base}/internal/overview`, { headers: { authorization: "Bearer wrong-token-wrong-token" } })).status, 401);
    const created = await internal("POST", "/internal/machines", { name: "LA-BWH", host: "la.example.com" });
    assert.equal(created.status, 201);
    const machine = created.body;
    assert.match(machine.token, /^[0-9a-f]{48}$/);
    assert.equal(machine.installCommand, `curl -fsSL https://raw.githubusercontent.com/cedar2025/xboard-node/dev/install.sh | sudo bash -s -- --mode machine --panel https://hub.example.com --token ${machine.token} --machine-id ${machine.id}`);
    const otherMachine = (await internal("POST", "/internal/machines", { name: "HK" })).body;
    const keys = (await internal("POST", "/internal/reality-keypair")).body;
    const vlessNode = await internal("POST", "/internal/nodes", { machineId: machine.id, name: "美国 01", protocol: "vless", host: "la.example.com", serverPort: 443, region: "美国", networkLevel: "premium", settings: { network: "tcp", tls: 2, flow: "xtls-rprx-vision", reality_settings: { server_name: "www.apple.com", private_key: keys.privateKey, short_id: keys.shortId } } });
    assert.equal(vlessNode.status, 201, JSON.stringify(vlessNode.body));
    const hyNode = (await internal("POST", "/internal/nodes", { machineId: machine.id, name: "美国 HY2", protocol: "hysteria", host: "la.example.com", serverPort: 8443, settings: { tls: { server_name: "la.example.com" }, bandwidth: { up: 100, down: 100 } } })).body;
    assert.equal((await internal("POST", "/internal/nodes", { machineId: machine.id, name: "dup", protocol: "hysteria", host: "la.example.com", serverPort: 8443, settings: { tls: { server_name: "x" } } })).status, 409, "two nodes on one machine cannot share a port");
    const hkNode = (await internal("POST", "/internal/nodes", { machineId: otherMachine.id, name: "香港 01", protocol: "vless", host: "hk.example.com", serverPort: 443, settings: { network: "tcp", tls: 2, flow: "xtls-rprx-vision", reality_settings: { server_name: "www.microsoft.com", private_key: keys.privateKey, short_id: "" } } })).body;
    const disabledNode = (await internal("POST", "/internal/nodes", { machineId: machine.id, name: "停用", protocol: "vless", host: "la.example.com", serverPort: 444, enabled: false, settings: { network: "ws", tls: 0 } })).body;
    assert.equal((await internal("POST", "/internal/nodes", { machineId: 999999, name: "x", protocol: "vless", host: "a.b", serverPort: 1, settings: {} })).status, 404);
    assert.equal((await internal("DELETE", `/internal/machines/${machine.id}`)).status, 409, "a machine with nodes cannot be deleted");

    // Node API authentication (machine mode and node mode).
    const node = new XboardNodeClient(base, { token: machine.token, machineId: machine.id });
    const hs = await node.handshake();
    assert.deepEqual(hs, { websocket: { enabled: true, ws_url: "wss://hub.example.com/api/v2/server/ws" }, settings: { push_interval: 60, pull_interval: 60 } }, "the handshake points nodes at the push channel");
    const listed = await node.machineNodes();
    assert.deepEqual(listed.nodes.map(item => [item.id, item.type]), [[vlessNode.body.id, "vless"], [hyNode.id, "hysteria"]], "machine/nodes lists only this machine's enabled nodes");
    assert.deepEqual(listed.base_config, { push_interval: 60, pull_interval: 60 });
    await assert.rejects(() => new XboardNodeClient(base, { token: "bad", machineId: machine.id }).machineNodes(), error => error.status === 401);
    await assert.rejects(() => node.forNode(hkNode.id).getConfig(), error => error.status === 404, "a machine cannot read another machine's node");
    await assert.rejects(() => node.forNode(disabledNode.id).getConfig(), error => error.status === 404, "disabled nodes are not served");
    assert.deepEqual(await node.forNode(disabledNode.id).getUsers(), [], "a disabled node still running gets no users");
    assert.equal((await node.forNode(disabledNode.id).report({})).data, true, "a disabled node's last reports are still accepted");
    const nodeMode = new XboardNodeClient(base, { token: "global-node-token", nodeId: hkNode.id });
    assert.equal((await nodeMode.getConfig()).protocol, "vless", "node mode with NODE_HUB_SERVER_TOKEN uses the v1 UniProxy paths");
    await assert.rejects(() => new XboardNodeClient(base, { token: "nope", nodeId: hkNode.id }).getConfig(), error => error.status === 401);

    // Config with ETag.
    const vless = node.forNode(vlessNode.body.id);
    const config = await vless.getConfig();
    assert.equal(config.protocol, "vless");
    assert.equal(config.server_port, 443);
    assert.equal(config.tls, 2);
    assert.equal(config.flow, "xtls-rprx-vision");
    assert.equal(config.tls_settings.private_key, keys.privateKey);
    assert.equal(config.tls_settings.server_name, "www.apple.com");
    assert.deepEqual(config.base_config, { push_interval: 60, pull_interval: 60 });
    assert.equal(await vless.getConfig(), null, "unchanged config answers 304");
    await internal("PUT", `/internal/nodes/${vlessNode.body.id}`, { serverPort: 8444 });
    assert.equal((await vless.getConfig()).server_port, 8444, "a changed node is served again");

    // Users: entitlements from the main app.
    assert.deepEqual(await vless.getUsers(), []);
    const userA = { userKey: "user-a", email: "a@example.test", uuid: "11111111-2222-4333-8444-555555555555", userLabel: "A#000001", planId: "pro", nodeIds: [vlessNode.body.id, hyNode.id], speedLimit: 50, deviceLimit: 3, enabled: true };
    const userB = { userKey: "user-b", email: "b@example.test", userLabel: "B#000002", planId: "basic", nodeIds: [hyNode.id], deviceLimit: 1, enabled: true };
    const synced = await internal("PUT", "/internal/users", { users: [userA, userB], replace: true });
    assert.deepEqual({ ...synced.body, uuids: undefined }, { received: 2, changed: 2, disabled: 0, uuids: undefined });
    assert.equal(synced.body.uuids["user-a"], userA.uuid);
    assert.match(synced.body.uuids["user-b"], /^[0-9a-f-]{36}$/, "the sync returns uuids so the app can keep them");
    assert.equal((await internal("PUT", "/internal/users", { users: [userA, userB], replace: true })).body.changed, 0, "an unchanged full sync writes nothing");
    const storedB = (await internal("GET", "/internal/users/user-b")).body;
    assert.match(storedB.uuid, /^[0-9a-f-]{36}$/, "a user without a uuid gets one");
    const storedA = (await internal("GET", "/internal/users/user-a")).body;
    const vlessUsers = await vless.getUsers();
    assert.deepEqual(vlessUsers, [{ id: storedA.id, uuid: userA.uuid, speed_limit: 50, device_limit: 3 }]);
    const hy = node.forNode(hyNode.id);
    assert.deepEqual((await hy.getUsers()).map(user => user.id), [storedA.id, storedB.id]);
    assert.equal(await vless.getUsers(), null, "unchanged user list answers 304");
    await internal("PUT", "/internal/users", { users: [{ ...userB, uuid: storedB.uuid }], replace: true });
    assert.deepEqual(await vless.getUsers(), [], "a user left out of a full sync is removed from nodes");
    assert.equal((await internal("GET", "/internal/users/user-a")).body.uuid, userA.uuid, "a disabled user keeps its uuid and id");
    await internal("PUT", "/internal/users/user-a", userA);
    assert.equal((await vless.getUsers()).length, 1, "single-user upsert re-enables");
    assert.equal((await internal("PUT", "/internal/users/user-c", { ...userA, userKey: "user-c", email: "c@example.test" })).status, 409, "a uuid cannot belong to two users");

    // Traffic reports.
    await vless.report({ traffic: { [storedA.id]: [1000, 5000], 999999: [1, 1] }, alive: { [storedA.id]: ["203.0.113.5", "198.51.100.7"] }, online: { [storedA.id]: 2 }, metrics: { uptime: 30, kernel_status: true } });
    await vless.report({ traffic: { [storedA.id]: [24, 1000] }, online: { [storedA.id]: 2 }, reportId: "batch-1" });
    const dup = await vless.report({ traffic: { [storedA.id]: [24, 1000] }, online: { [storedA.id]: 2 }, reportId: "batch-1" });
    assert.equal(dup.duplicate, true, "a resent report_id is acknowledged without counting again");
    await hy.report({ traffic: { [storedA.id]: [100, 200], [storedB.id]: [7, 8] }, online: { [storedB.id]: 1 }, alive: { [storedB.id]: ["192.0.2.1"] } });
    const today = chinaDateKey();
    const rows = (await pool.query("SELECT date, email, node_guid, user_id, user_label, plan_id, node_name, up_bytes, down_bytes FROM xui_daily_traffic WHERE node_guid LIKE 'hub-%' ORDER BY email")).rows;
    assert.deepEqual(rows.map(row => ({ ...row, up_bytes: Number(row.up_bytes), down_bytes: Number(row.down_bytes) })), [
      { date: today, email: "a@example.test", node_guid: `hub-m${machine.id}`, user_id: "user-a", user_label: "A#000001", plan_id: "pro", node_name: "LA-BWH", up_bytes: 1124, down_bytes: 6200 },
      { date: today, email: "b@example.test", node_guid: `hub-m${machine.id}`, user_id: "user-b", user_label: "B#000002", plan_id: "basic", node_name: "LA-BWH", up_bytes: 7, down_bytes: 8 }
    ], "traffic is summed per China day, user and machine; unknown ids and duplicate batches are dropped");

    // Presence: online every report, alive only on change, absence of online means nobody.
    let presence = (await internal("GET", "/internal/presence")).body;
    assert.deepEqual(presence.users["user-a"].ips.sort(), ["198.51.100.7", "203.0.113.5"], "alive IPs are kept while online is reported without alive");
    assert.equal(presence.users["user-a"].online, true);
    assert.deepEqual(presence.users["user-b"].nodeIds, [hyNode.id]);
    assert.ok(presence.users["user-a"].lastOnlineAt);
    await vless.report({});
    presence = (await internal("GET", "/internal/presence")).body;
    assert.equal(presence.users["user-a"].online, false, "a report without online clears the node's presence");
    assert.ok(presence.users["user-a"].lastOnlineAt, "last online survives going offline");

    // Status, metrics, overview and subscription.
    await node.machineStatus();
    const overview = (await internal("GET", "/internal/overview")).body;
    const la = overview.machines.find(item => item.id === machine.id);
    assert.equal(la.online, true);
    assert.equal(la.loadStatus.cpu, 20);
    assert.equal(la.loadStatus.net.out_speed, 20.25);
    assert.equal(la.token, undefined, "machine tokens are never listed");
    const laNode = overview.nodes.find(item => item.id === vlessNode.body.id);
    assert.equal(laNode.online, true);
    assert.equal(laNode.guid, `hub-m${machine.id}`);
    assert.equal(laNode.userCount, 1);
    assert.equal(laNode.metrics.uptime, 30);
    assert.equal(overview.nodes.find(item => item.id === hkNode.id).online, true, "node-mode pulls count as heartbeats");
    assert.equal(overview.nodes.find(item => item.id === disabledNode.id).online, false);
    const machineDetail = (await internal("GET", `/internal/machines/${machine.id}`)).body;
    assert.equal(machineDetail.loadHistory.length, 1);
    const subscription = (await internal("GET", "/internal/subscription/user-a")).body;
    assert.deepEqual(subscription.proxies.map(item => [item.nodeId, item.proxy.type, item.proxy.port, item.proxy.uuid || item.proxy.password]), [[vlessNode.body.id, "vless", 8444, userA.uuid], [hyNode.id, "hysteria2", 8443, userA.uuid]]);
    assert.deepEqual((await internal("GET", "/internal/subscription/nobody")).body, { proxies: [] });

    await wsChecks({ base, internal, machine, otherMachine, vlessNodeId: vlessNode.body.id, hyNodeId: hyNode.id, hkNodeId: hkNode.id, storedA, storedB, userA, userB });

    // Disabling a machine or a node cuts it off.
    await internal("PUT", `/internal/nodes/${hyNode.id}`, { enabled: false });
    assert.deepEqual((await node.machineNodes()).nodes.map(item => item.id), [vlessNode.body.id]);
    await internal("PUT", `/internal/machines/${machine.id}`, { isActive: false });
    await assert.rejects(() => vless.getUsers(), error => error.status === 403);
    const reset = (await internal("POST", `/internal/machines/${machine.id}/reset-token`)).body;
    assert.notEqual(reset.token, machine.token);
    await internal("PUT", `/internal/machines/${machine.id}`, { isActive: true });
    await assert.rejects(() => vless.getUsers(), error => error.status === 401, "the old token stops working after a reset");
    assert.equal((await new XboardNodeClient(base, { token: reset.token, machineId: machine.id, nodeId: vlessNode.body.id }).getUsers()).length, 1);

    // Remote callers cannot use the internal API even with the token.
    const remoteHandler = createNodeHubHandler({ store, internalToken, logger: { warn() {}, error() {} } });
    const fakeRes = { headersSent: false, writeHead(code) { this.code = code; }, end() {} };
    await remoteHandler({ url: "/internal/overview", method: "GET", headers: { authorization: `Bearer ${internalToken}` }, socket: { remoteAddress: "203.0.113.9" } }, fakeRes);
    assert.equal(fakeRes.code, 403);

    // Migration script: dry run, --apply, --switch-line-groups against this hub and database.
    const { createDataStore } = require("./database");
    const appStore = createDataStore({ databaseUrl, ssl: false });
    await appStore.init();
    await appStore.pool.query("DELETE FROM app_records WHERE collection = 'users' AND id = 'migrated-user'");
    await appStore.pool.query("INSERT INTO app_records (collection, id, position, data) VALUES ('users', 'migrated-user', 0, $1::jsonb)", [JSON.stringify({ id: "migrated-user", email: "migrated@example.test", xuiClientEmail: "migrated@example.test", lineType: "self_hosted" })]);
    await appStore.pool.query("DELETE FROM catalog_v2_line_groups WHERE id = 'nh-migrate-test'");
    await appStore.pool.query("INSERT INTO catalog_v2_line_groups (id, name, inbound_keys) VALUES ('nh-migrate-test', 'migrate', $1::jsonb)", [JSON.stringify(["panel-guid:1", "node-hk:5", "other:9"])]);
    const fixturePath = path.join(os.tmpdir(), `nh-xui-fixture-${process.pid}.json`);
    fs.writeFileSync(fixturePath, JSON.stringify(xuiFixture(keys)));
    // Async: the hub under test runs in this process.
    const migrate = async (...args) => (await execFileAsync(process.execPath, [path.join(__dirname, "scripts/migrate-xui-to-node-hub.js"), "--from-file", fixturePath, ...args], { env: { ...process.env, NODE_HUB_URL: base, NODE_HUB_INTERNAL_TOKEN: internalToken, LOCAL_DATABASE_URL: databaseUrl, DATABASE_SSL: "false" }, encoding: "utf8" })).stdout;
    const dry = await migrate("--node-guid", "local", "--host", "la2.example.com", "--name", "LA-MIGRATED");
    assert.match(dry, /Dry run/);
    assert.match(dry, /users whose 3x-ui uuid is carried over: 1/);
    assert.equal((await store.listMachines()).some(item => item.name === "LA-MIGRATED"), false, "a dry run changes nothing");
    const applied = await migrate("--node-guid", "local", "--host", "la2.example.com", "--name", "LA-MIGRATED", "--apply");
    assert.match(applied, /--mode machine --panel https:\/\/hub\.example\.com/);
    const migratedMachine = (await store.listMachines()).find(item => item.name === "LA-MIGRATED");
    const migratedNodes = await store.listNodes({ machineId: migratedMachine.id });
    assert.deepEqual(migratedNodes.map(item => [item.protocol, item.serverPort, item.host, item.settings.reality_settings?.private_key]), [["vless", 443, "la2.example.com", keys.privateKey]]);
    assert.equal((await store.getUser("migrated-user")).uuid, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "the 3x-ui uuid is seeded");
    assert.equal((await store.getUser("migrated-user")).enabled, false, "seeding does not enable the user before the app syncs");
    assert.match(await migrate("--node-guid", "local", "--host", "la2.example.com", "--name", "LA-MIGRATED", "--apply"), /already exists/, "re-running --apply is safe");
    const setHubUuid = hubUuid => appStore.pool.query("UPDATE app_records SET data = data || $1::jsonb WHERE collection = 'users' AND id = 'migrated-user'", [JSON.stringify({ hubUuid })]);
    await setHubUuid("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    const matchingPlan = await migrate("--node-guid", "local", "--host", "la2.example.com", "--name", "LA-MIGRATED");
    assert.match(matchingPlan, /users already on the hub with their 3x-ui uuid: 1/, "a user the app already synced with the panel uuid is counted as matching");
    assert.doesNotMatch(matchingPlan, /must update their subscription/);
    await setHubUuid("11111111-2222-4333-8444-555555555555");
    assert.match(await migrate("--node-guid", "local", "--host", "la2.example.com", "--name", "LA-MIGRATED"), /hub uuid differs from 3x-ui \(they must update their subscription\): migrated@example\.test/, "a differing hub uuid is reported");
    await migrate("--node-guid", "local", "--name", "LA-MIGRATED", "--host", "la2.example.com", "--switch-line-groups");
    const switched = (await appStore.pool.query("SELECT inbound_keys FROM catalog_v2_line_groups WHERE id = 'nh-migrate-test'")).rows[0].inbound_keys;
    assert.deepEqual(switched, [`hub-m${migratedMachine.id}:${migratedNodes[0].id}`, "node-hk:5", "other:9"], "only the migrated VPS's keys are switched");
    await appStore.pool.query("DELETE FROM catalog_v2_line_groups WHERE id = 'nh-migrate-test'");
    await appStore.pool.query("DELETE FROM app_records WHERE collection = 'users' AND id = 'migrated-user'");
    await appStore.close?.();
    fs.unlinkSync(fixturePath);

    if (process.env.NODE_HUB_CONTRACT_OUT) fs.writeFileSync(process.env.NODE_HUB_CONTRACT_OUT, JSON.stringify({ config, configHy: await new XboardNodeClient(base, { token: "global-node-token", nodeId: hkNode.id }).getConfig(), users: { users: vlessUsers }, machineNodes: listed, handshake: hs }));
    console.log("node-hub checks passed: node API (machine and node mode, ETag), WebSocket push (auth, node list, config, users and removal deltas, global devices, revocation), traffic accounting, duplicate reports, presence, status, subscriptions, internal API guards and the 3x-ui migration script.");
  } finally {
    handler.close();
    server.close();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
