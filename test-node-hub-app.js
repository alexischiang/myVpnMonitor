// The app with node-hub, without binaries: a protocol-faithful node client stands in for
// xboard-node. Runs twice in fresh processes: node-hub only, and node-hub next to 3x-ui (mock
// panel). Covers provisioning, inbound management and line groups, custom inbounds, entitlement
// sync, traffic billing, depletion, subscriptions, presence and the monitor, plus every user action
// that used to talk to 3x-ui only: traffic gift and reset, plan purchase, traffic add-on and pack,
// gift days, plan change, product buyer sync, account disable/enable, expiry and deletion.
// Needs TEST_DATABASE_URL (disposable: app_records and nh_* tables are wiped).
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const MiB = 1024 * 1024;

function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const envPath = path.join(__dirname, ".env");
  return fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8").match(/^TEST_DATABASE_URL=(.+)$/m)?.[1]?.trim() || "" : "";
}

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server.address().port));
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

// Minimal 3x-ui panel: one local inbound, clients keyed by email.
function mockXui() {
  const clients = new Map();
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const body = req.method === "GET" ? {} : await readBody(req);
    requests.push({ url: req.url, body });
    if (req.url.startsWith("/clash/")) {
      res.writeHead(200, { "content-type": "text/yaml" });
      return res.end("proxies:\n  - { name: 3x-ui 节点, type: vless, server: panel.example.com, port: 443, uuid: 00000000-0000-4000-8000-000000000000 }\n");
    }
    const get = req.url.match(/^\/panel\/api\/clients\/get\/(.+)$/);
    if (get) {
      const client = clients.get(decodeURIComponent(get[1]));
      return sendJson(res, client ? 200 : 404, client ? { success: true, obj: client } : { success: false, msg: "not found" });
    }
    if (req.url === "/panel/api/server/status") return sendJson(res, 200, { success: true, obj: { panelGuid: "panel" } });
    if (req.url === "/panel/api/nodes/list") return sendJson(res, 200, { success: true, obj: [] });
    if (req.url === "/panel/api/inbounds/list") return sendJson(res, 200, { success: true, obj: [{ id: 1, remark: "3x-ui 节点", protocol: "vless", port: 443, enable: true, originNodeGuid: "panel", clientStats: [...clients.values()].map(client => ({ email: client.email, up: 0, down: 0 })) }] });
    if (req.url === "/panel/api/clients/list") return sendJson(res, 200, { success: true, obj: [...clients.values()].map(client => ({ traffic: { up: 0, down: 0, enable: true }, ...client })) });
    if (req.url === "/panel/api/clients/add") {
      // Like the real panel: id is the numeric row id, the credential is uuid.
      const uuid = body.client.uuid || (/^\d+$/.test(String(body.client.id ?? "")) ? "" : body.client.id) || crypto.randomUUID();
      const client = { ...body.client, id: clients.size + 1, uuid, subId: body.client.subId || crypto.randomUUID().slice(0, 16), inboundIds: body.inboundIds || [] };
      clients.set(client.email, client);
      return sendJson(res, 200, { success: true, obj: client });
    }
    const update = req.url.match(/^\/panel\/api\/clients\/update\/(.+)$/);
    if (update) {
      const client = { ...(clients.get(decodeURIComponent(update[1])) || {}), ...body };
      clients.set(client.email, client);
      return sendJson(res, 200, { success: true, obj: client });
    }
    if (req.url === "/panel/api/clients/bulkEnable" || req.url === "/panel/api/clients/bulkDisable") {
      for (const email of body.emails || []) if (clients.has(email)) clients.get(email).enable = req.url.endsWith("bulkEnable");
      return sendJson(res, 200, { success: true, obj: {} });
    }
    if (req.url === "/panel/api/clients/bulkAttach" || req.url === "/panel/api/clients/bulkDetach") {
      for (const email of body.emails || []) {
        const client = clients.get(email);
        if (!client) continue;
        client.inboundIds = req.url.endsWith("bulkAttach") ? [...new Set([...(client.inboundIds || []), ...body.inboundIds])] : (client.inboundIds || []).filter(id => !body.inboundIds.includes(id));
      }
      return sendJson(res, 200, { success: true, obj: {} });
    }
    return sendJson(res, 200, { success: true, obj: {} });
  });
  return { server, clients, requests };
}

async function child(mode) {
  const databaseUrl = testDatabaseUrl();
  const { Pool } = require("pg");
  const database = new Pool({ connectionString: databaseUrl });
  await database.query("CREATE TABLE IF NOT EXISTS app_records (collection TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (collection, id))");
  await database.query("TRUNCATE app_records");
  await database.query("DROP TABLE IF EXISTS nh_presence, nh_machine_load, nh_report_ids, nh_users, nh_nodes, nh_machines, nh_schema_migrations CASCADE");
  await database.query("DROP TABLE IF EXISTS xui_daily_traffic, xui_traffic_cursor, xui_inbounds");
  await database.query("DELETE FROM catalog_v2_inventory_reservations WHERE product_id IN ('nh-app-plan', 'nh-app-plan-b', 'nh-app-credit')").catch(() => {});
  await database.query("DELETE FROM catalog_v2_products WHERE id IN ('nh-app-plan', 'nh-app-plan-b', 'nh-app-credit')").catch(() => {});
  await database.query("DELETE FROM catalog_v2_line_groups WHERE id = 'nh-app-test'").catch(() => {});

  let subconverterInput = "";
  const subconverter = http.createServer(async (req, res) => {
    subconverterInput = await (await fetch(new URL(req.url, "http://x").searchParams.get("url"))).text();
    res.writeHead(200, { "content-type": "text/yaml" });
    res.end(subconverterInput);
  });
  const subconverterPort = await listen(subconverter);
  const xui = mode === "mixed" ? mockXui() : null;
  const xuiPort = xui ? await listen(xui.server) : 0;

  const probe = http.createServer();
  const hubPort = await listen(probe);
  await new Promise(resolve => probe.close(resolve));
  const appProbe = http.createServer();
  const appPort = await listen(appProbe);
  await new Promise(resolve => appProbe.close(resolve));
  const internalToken = crypto.randomBytes(24).toString("hex");
  Object.assign(process.env, {
    NODE_ENV: "test",
    LOCAL_DATABASE_URL: databaseUrl,
    PORT: String(appPort),
    NODE_HUB_URL: `http://127.0.0.1:${hubPort}`,
    NODE_HUB_INTERNAL_TOKEN: internalToken,
    SUB_CONVERTER_URL: `http://127.0.0.1:${subconverterPort}`,
    XUI_BASE_URL: xui ? `http://127.0.0.1:${xuiPort}` : "",
    XUI_API_TOKEN: xui ? "xui-token" : "",
    XUI_SUBSCRIPTION_BASE_URL: xui ? `http://127.0.0.1:${xuiPort}` : "",
    XUI_READ_ONLY: "false",
    ADMIN_USERNAME: "hub-admin",
    ADMIN_PASSWORD: "hub-admin-password",
    SESSION_SECRET: "hub-session-secret",
    RESEND_API_KEY: "",
    ALERT_EMAIL_FROM: "",
    ALERT_EMAIL_PASS: ""
  });
  const { NodeHubStore } = require("./node-hub/store");
  const { createNodeHubHandler } = require("./node-hub/app");
  const { XboardNodeClient } = require("./node-hub/xboard-node-client");
  const hubStore = new NodeHubStore(new Pool({ connectionString: databaseUrl }));
  await hubStore.init();
  const hub = http.createServer(createNodeHubHandler({ store: hubStore, internalToken, publicUrl: "https://hub.example.com", logger: { warn() {}, error() {} } }));
  await listen(hub, hubPort);

  const now = Date.now();
  const user = {
    id: "hub-app-user", userId: "hub-app-user", email: "hubapp@example.test", customerID: "900300", lineType: "self_hosted", subscriptionId: "",
    subscriptionToken: crypto.randomBytes(16).toString("hex"),
    purchasedAt: new Date(now - 3600000).toISOString(), expiresAt: new Date(now + 30 * 86400000).toISOString(), duration: "monthly",
    v2ProductSnapshot: { productId: "hub-plan", productType: "recurring_plan", periodId: "30d", lineGroupId: "nh-app-test", name: "Hub", durationDays: 30, trafficBytes: 20 * MiB, deviceLimit: 2 }
  };
  await database.query("INSERT INTO app_records (collection, id, position, data) VALUES ('users', $1, 0, $2::jsonb)", [user.id, JSON.stringify(user)]);
  // A customer provisioned on 3x-ui before node-hub was configured: the full entitlement sync
  // must carry their panel uuid over instead of letting the hub generate one.
  const legacyUuid = "5f1d7c2a-3b4e-4c6d-8e9f-0a1b2c3d4e5f";
  const legacyUser = xui ? {
    ...user, id: "hub-legacy-user", userId: "hub-legacy-user", email: "legacy@example.test", customerID: "900301",
    subscriptionToken: crypto.randomBytes(16).toString("hex"), xuiClientEmail: "legacy@example.test", xuiSubId: "legacysub"
  } : null;
  if (legacyUser) {
    xui.clients.set(legacyUser.xuiClientEmail, { email: legacyUser.xuiClientEmail, id: 7, uuid: legacyUuid, subId: "legacysub", enable: true, inboundIds: [1] });
    await database.query("INSERT INTO app_records (collection, id, position, data) VALUES ('users', $1, 1, $2::jsonb)", [legacyUser.id, JSON.stringify(legacyUser)]);
  }

  const handler = require("./server");
  const app = http.createServer(handler);
  const origin = `http://127.0.0.1:${await listen(app, appPort)}`;
  let cookie = "";
  const api = async (pathname, { method = "GET", body } = {}) => {
    const response = await fetch(origin + pathname, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await response.text();
    let data = text;
    try { data = JSON.parse(text); } catch {}
    if (!response.ok) throw Object.assign(new Error(`${method} ${pathname} -> ${response.status}: ${text.slice(0, 300)}`), { status: response.status });
    return data;
  };
  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: "hub-admin", password: "hub-admin-password" }) });
  cookie = login.headers.get("set-cookie").split(";", 1)[0];
  const runJob = async id => {
    await api(`/api/sync-jobs/${id}/run`, { method: "POST" });
    for (let i = 0; i < 100; i++) {
      const job = (await api("/api/sync-jobs")).modules.flatMap(module => module.jobs).find(item => item.id === id);
      if (job && !job.running) return job;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`job ${id} did not finish`);
  };
  try {
    const jobs = (await api("/api/sync-jobs")).modules.flatMap(module => module.jobs);
    assert.ok(jobs.some(job => job.id === "node-hub-sync" && job.configured));
    assert.equal(jobs.find(job => job.id === "node-hub-billing").configured, mode === "hub", "hub billing runs only without 3x-ui");

    // Machine and node through the app; node shows up as an inbound.
    const machine = await api("/api/node-hub/machines", { method: "POST", body: { name: "Hub VPS", host: "hub-vps.example.com" } });
    const node = await api("/api/node-hub/nodes", { method: "POST", body: { machineId: machine.id, name: "Hub 01", protocol: "vless", host: "hub-vps.example.com", serverPort: 443, settings: { network: "tcp", tls: 0 } } });
    const customNode = await api("/api/node-hub/nodes", { method: "POST", body: { machineId: machine.id, name: "Hub 定制", protocol: "vless", host: "hub-vps.example.com", serverPort: 8443, inboundType: "custom", settings: { network: "tcp", tls: 0 } } });
    assert.deepEqual((await api("/api/node-hub/machines")).map(item => item.id), [machine.id]);
    assert.equal((await api("/api/node-hub/nodes")).length, 2);
    if (xui) await runJob("xui-panel-sync");
    const view = await api("/api/xui-inbounds");
    const hubRow = view.inbounds.find(row => row.hubNodeId === node.id);
    const customRow = view.inbounds.find(row => row.hubNodeId === customNode.id);
    assert.equal(hubRow.key, `hub-m${machine.id}:${node.id}`);
    assert.equal(customRow.inboundType, "custom");
    assert.equal(view.inbounds.some(row => row.key === "panel:1"), Boolean(xui), "3x-ui inbounds stay listed next to hub nodes");
    await api(`/api/xui-inbounds/${encodeURIComponent(hubRow.key)}/settings`, { method: "PUT", body: { region: "美国", networkLevel: "premium", inboundType: "package" } });
    assert.equal((await hubStore.getNode(node.id)).region, "美国", "inbound settings edits reach the hub node");

    const lineKeys = [hubRow.key, ...(xui ? ["panel:1"] : [])];
    await api("/api/catalog-v2/line-groups", { method: "POST", body: { id: "nh-app-test", name: "Hub 测试", isEnabled: true, sortOrder: 0, inboundKeys: lineKeys } });
    const group = (await api("/api/catalog-v2/line-groups")).find(item => item.id === "nh-app-test");
    assert.deepEqual(group.inboundKeys.sort(), lineKeys.sort());
    assert.deepEqual(group.coverage.regions, ["美国"], "line group coverage includes hub nodes");

    if (legacyUser) {
      await runJob("node-hub-sync");
      const legacyHubUser = await hubStore.getUser(legacyUser.id);
      assert.equal(legacyHubUser?.uuid, legacyUuid, "an existing 3x-ui customer keeps their panel uuid on the hub");
      assert.equal((await api("/api/users")).find(item => item.id === legacyUser.id).hubUuid, legacyUuid);
    }

    // Provisioning (the same admin action a purchase or plan change uses).
    await api(`/api/users/${user.id}/xui-sync`, { method: "POST" });
    let hubUser = await hubStore.getUser(user.id);
    assert.equal(hubUser.enabled, true);
    assert.deepEqual(hubUser.nodeIds, [node.id]);
    assert.equal(hubUser.deviceLimit, 2);
    if (xui) {
      const panelClient = xui.clients.get("hubapp@example.test");
      assert.equal(hubUser.uuid, panelClient.uuid, "the hub uses the 3x-ui client's uuid");
      assert.deepEqual(panelClient.inboundIds, [1], "only 3x-ui inbounds are attached on the panel");
      assert.ok(!xui.requests.some(request => JSON.stringify(request.body).includes(String(hubRow.id))), "no hub inbound id is ever sent to 3x-ui");
    }

    // Custom hub inbound as a personal inbound.
    await api(`/api/users/${user.id}/custom-inbounds`, { method: "PUT", body: { inboundIds: [customRow.id] } });
    hubUser = await hubStore.getUser(user.id);
    assert.deepEqual(hubUser.nodeIds, [node.id, customNode.id].sort((a, b) => a - b), "a personal custom hub inbound is granted");
    const customView = await api(`/api/users/${user.id}/custom-inbounds`);
    assert.ok(customView.effectiveInboundIds.includes(customRow.id) && customView.effectiveInboundIds.includes(hubRow.id));
    if (xui) assert.ok(!xui.requests.some(request => JSON.stringify(request.body).includes(String(customRow.id))));

    // Speed limit.
    await api(`/api/users/${user.id}/node-speed-limit`, { method: "PUT", body: { speedLimitMbps: 30 } });
    const nodeClient = new XboardNodeClient(`http://127.0.0.1:${hubPort}`, { token: (await hubStore.getMachine(machine.id)).token, machineId: machine.id, nodeId: node.id });
    // The legacy customer (mixed mode) is on the same node; these checks follow the main user.
    // Like xboard-node, a 304 (null) means the node keeps the list it already has.
    let nodeUserList = [];
    const nodeUsers = async () => (nodeUserList = (await nodeClient.getUsers()) ?? nodeUserList);
    const mainNodeUsers = async () => (await nodeUsers()).filter(item => item.uuid !== legacyUuid && item.uuid !== buyerUuid);
    let buyerUuid = "";
    assert.deepEqual(await mainNodeUsers(), [{ id: hubUser.id, uuid: hubUser.uuid, speed_limit: 30, device_limit: 2 }]);

    // Subscription: hub proxies (plus 3x-ui's own Clash config next to 3x-ui).
    const sub = await fetch(`${origin}/sub/${user.subscriptionToken}`, { headers: { "user-agent": "clash.meta" } });
    assert.equal(sub.status, 200, await sub.clone().text());
    const names = (require("js-yaml").load(subconverterInput).proxies || []).map(proxy => proxy.name);
    assert.ok(names.includes("Hub 01") && names.includes("Hub 定制"), names.join(","));
    assert.equal(names.includes("3x-ui 节点"), Boolean(xui));

    // Node source: the per-user filter on which architecture's nodes the subscription carries.
    const subNames = async () => {
      const response = await fetch(`${origin}/sub/${user.subscriptionToken}`, { headers: { "user-agent": "clash.meta" } });
      assert.equal(response.status, 200, await response.clone().text());
      return (require("js-yaml").load(subconverterInput).proxies || []).map(proxy => proxy.name);
    };
    const setNodeSource = nodeSource => api(`/api/users/${user.id}/node-source`, { method: "PUT", body: { nodeSource } });
    assert.equal((await setNodeSource("bogus").catch(error => error)) instanceof Error, true, "an unknown node source is rejected");
    assert.equal((await api("/api/users")).find(item => item.id === user.id).nodeSource, undefined, "mix is the default and is not stored");
    assert.deepEqual(await setNodeSource("nodehub"), { userId: user.id, nodeSource: "nodehub" });
    const hubOnlyNames = await subNames();
    assert.ok(hubOnlyNames.includes("Hub 01") && !hubOnlyNames.includes("3x-ui 节点"), `nodehub: ${hubOnlyNames.join(",")}`);
    if (xui) {
      await setNodeSource("3xui");
      const panelOnlyNames = await subNames();
      assert.ok(panelOnlyNames.includes("3x-ui 节点") && !panelOnlyNames.some(name => name.startsWith("Hub")), `3xui: ${panelOnlyNames.join(",")}`);
    }
    assert.deepEqual(await setNodeSource("mix"), { userId: user.id, nodeSource: "mix" });
    assert.equal((await api("/api/users")).find(item => item.id === user.id).nodeSource, undefined);
    const mixNames = await subNames();
    assert.ok(mixNames.includes("Hub 01") && mixNames.includes("3x-ui 节点") === Boolean(xui), `mix: ${mixNames.join(",")}`);
    assert.ok((await api("/api/users")).find(item => item.id === user.id).userLogs.some(log => log.reason === "node-source-changed"), "node source changes are logged");

    // Traffic -> billing -> depletion -> removal from the node.
    await nodeClient.report({ traffic: { [hubUser.id]: [MiB, 9 * MiB] }, online: { [hubUser.id]: 1 }, alive: { [hubUser.id]: ["203.0.113.8"] } });
    await runJob(xui ? "xui-panel-sync" : "node-hub-billing");
    let billed = (await api("/api/users")).find(item => item.id === user.id);
    assert.equal(billed.xuiWeightedTraffic.usedBytes, 10 * MiB, "hub traffic is billed");
    assert.equal(billed.xuiWeightedTraffic.depleted, false);
    assert.equal(billed.xuiLastTraffic.connectedIpCount, 1, "hub IPs count as connected IPs");
    const presence = await api("/api/xui-presence");
    assert.ok(presence.onlineEmails.includes("hubapp@example.test"));
    assert.deepEqual(presence.onlineByGuid[`hub-m${machine.id}`], ["hubapp@example.test"]);
    assert.equal(presence.dailyTraffic.nodes[`hub-m${machine.id}`].usedBytes, 10 * MiB);
    const monitor = await api("/api/xui-monitor");
    const machineRow = monitor.nodes.find(item => item.guid === `hub-m${machine.id}`);
    assert.equal(machineRow.status, "online");
    assert.equal(machineRow.onlineCount, 1);
    await nodeClient.report({ traffic: { [hubUser.id]: [0, 11 * MiB] } });
    await runJob(xui ? "xui-panel-sync" : "node-hub-billing");
    billed = (await api("/api/users")).find(item => item.id === user.id);
    assert.equal(billed.xuiWeightedTraffic.depleted, true);
    assert.deepEqual(await mainNodeUsers(), [], "a depleted user is removed from the node");
    if (xui) assert.equal(xui.clients.get("hubapp@example.test").enable, false, "and disabled on 3x-ui");

    // More traffic puts a depleted user back on the node at once, without waiting for a sync job.
    const billingJob = xui ? "xui-panel-sync" : "node-hub-billing";
    const giftResult = await api(`/api/users/${user.id}/traffic-gift`, { method: "POST", body: { trafficGb: 1 } }).catch(error => error);
    assert.ok(!(giftResult instanceof Error), `admin traffic gift: ${giftResult.message}`);
    assert.equal((await mainNodeUsers()).length, 1, "a traffic gift re-enables the user on the node immediately");
    if (xui) assert.equal(xui.clients.get("hubapp@example.test").enable, true, "and on 3x-ui");
    await nodeClient.report({ traffic: { [hubUser.id]: [0, 1100 * MiB] } });
    await runJob(billingJob);
    assert.deepEqual(await mainNodeUsers(), [], "the gifted traffic runs out");
    const resetResult = await api(`/api/users/${user.id}/traffic-reset`, { method: "POST" }).catch(error => error);
    assert.ok(!(resetResult instanceof Error), `admin traffic reset: ${resetResult.message}`);
    assert.equal((await mainNodeUsers()).length, 1, "a traffic reset re-enables the user on the node immediately");
    await runJob(billingJob);
    assert.equal((await mainNodeUsers()).length, 1, "the next billing run keeps the reset");

    // A customer through orders: plan purchase, traffic add-on and pack, gift days, plan change,
    // account disable/enable and expiry, all reaching the hub node.
    const onNode = async uuid => (await nodeUsers()).some(item => item.uuid === uuid);
    const registration = await fetch(`${origin}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "hub-buyer@example.test", password: "hub-buyer-password" }) });
    assert.equal(registration.status, 201, await registration.text());
    const buyerAccountId = (await api("/api/users")).find(item => item.email === "hub-buyer@example.test").accountId;
    const compareValues = Object.fromEntries((await api("/api/catalog-v2/compare-attributes")).map(attribute => [attribute.id, attribute.kind === "boolean" ? "yes" : attribute.options[0]]));
    await api("/api/catalog-v2/products", { method: "POST", body: {
      id: "nh-app-plan", type: "recurring_plan", isEnabled: true, isForSale: true, stock: null, sortOrder: 0, compareValues,
      name: "Hub plan", description: "", features: [], isRecommended: false, lineGroupId: "nh-app-test",
      trafficCustomization: { enabled: false, stepBytes: null, stepPriceCents: null, maxSteps: 10 },
      periods: [{ id: "30d", durationDays: 30, trafficBytes: 20 * MiB, deviceLimit: 2, priceCents: 100, isEnabled: true, sortOrder: 0 }]
    } });
    await api("/api/catalog-v2/products", { method: "POST", body: {
      id: "nh-app-plan-b", type: "recurring_plan", isEnabled: true, isForSale: true, stock: null, sortOrder: 1, compareValues,
      name: "Hub plan B", description: "", features: [], isRecommended: false, lineGroupId: "nh-app-test",
      trafficCustomization: { enabled: false, stepBytes: null, stepPriceCents: null, maxSteps: 10 },
      periods: [{ id: "30d", durationDays: 30, trafficBytes: 20 * MiB, deviceLimit: 3, priceCents: 100, isEnabled: true, sortOrder: 0 }]
    } });
    await api("/api/catalog-v2/products", { method: "POST", body: {
      id: "nh-app-credit", type: "addon", isEnabled: true, isForSale: true, stock: null, sortOrder: 0, name: "Hub 流量", description: "", features: [], priceCents: 100,
      purchaseRequirement: "requires_recurring_plan", fulfillment: { mode: "automatic", handler: "traffic_credit", config: { trafficBytes: 1024 ** 3 } }, allowQuantity: false, minQuantity: 1, maxQuantity: null, periods: []
    } });
    const manualPayment = body => api("/api/admin/manual-payments", { method: "POST", body: { accountId: buyerAccountId, amount: 1, ...body } }).catch(error => error);
    const planOrder = await manualPayment({ optionId: "v2:nh-app-plan:30d" });
    assert.equal(planOrder.fulfillmentStatus, "fulfilled", `plan purchase: ${planOrder.message || JSON.stringify(planOrder)}`);
    const buyer = (await api("/api/users")).find(item => item.email === "hub-buyer@example.test");
    const buyerHub = await hubStore.getUser(buyer.id);
    buyerUuid = buyerHub.uuid;
    assert.deepEqual([buyerHub.enabled, buyerHub.nodeIds], [true, [node.id]], "a purchased plan grants the line group's hub node");
    if (xui) assert.equal(buyerHub.uuid, xui.clients.get("hub-buyer@example.test").uuid, "with the 3x-ui client's uuid");
    assert.ok(await onNode(buyerHub.uuid));
    // The first billing run after a purchase settles the new cycle's baseline; usage counts after it.
    await runJob(billingJob);
    const depleteBuyer = async bytes => {
      await nodeClient.report({ traffic: { [buyerHub.id]: [0, bytes] } });
      await runJob(billingJob);
      assert.equal(await onNode(buyerHub.uuid), false, "the buyer's traffic runs out");
    };
    await depleteBuyer(21 * MiB);
    const creditOrder = await manualPayment({ optionId: "v2:nh-app-credit" });
    assert.equal(creditOrder.fulfillmentStatus, "fulfilled", `traffic add-on: ${creditOrder.message || JSON.stringify(creditOrder)}`);
    assert.ok(await onNode(buyerHub.uuid), "a traffic add-on re-enables the buyer on the node immediately");
    await depleteBuyer(1100 * MiB);
    const packOrder = await manualPayment({ product: "traffic_pack" });
    assert.equal(packOrder.fulfillmentStatus, "fulfilled", `traffic pack: ${packOrder.message || JSON.stringify(packOrder)}`);
    assert.ok(await onNode(buyerHub.uuid), "a traffic pack re-enables the buyer on the node immediately");
    const expiresBefore = (await api("/api/users")).find(item => item.id === buyer.id).expiresAt;
    await api(`/api/users/${buyer.id}/gift`, { method: "POST", body: { days: 3 } });
    assert.ok(new Date((await api("/api/users")).find(item => item.id === buyer.id).expiresAt) > new Date(expiresBefore));
    assert.ok(await onNode(buyerHub.uuid), "gifted days keep the buyer on the node");
    // A plan change drops the packs; reset usage first so the new 20 MiB plan is not used up.
    await api(`/api/users/${buyer.id}/traffic-reset`, { method: "POST" });
    await api(`/api/users/${buyer.id}/plan`, { method: "POST", body: { optionId: "v2:nh-app-plan-b:30d", note: "hub test" } });
    assert.equal((await hubStore.getUser(buyer.id)).deviceLimit, 3, "a plan change reaches the hub entitlement");
    assert.ok(await onNode(buyerHub.uuid), "and keeps the buyer on the node");
    await api(`/api/users/${buyer.id}/account-status`, { method: "POST", body: { disabled: true } });
    assert.equal(await onNode(buyerHub.uuid), false, "a disabled account is removed from the node immediately");
    await api(`/api/users/${buyer.id}/account-status`, { method: "POST", body: { disabled: false } });
    assert.ok(await onNode(buyerHub.uuid), "re-enabling the account puts the buyer back");
    const planB = (await api("/api/catalog-v2/products")).find(item => item.id === "nh-app-plan-b");
    await api("/api/catalog-v2/products/nh-app-plan-b", { method: "PUT", body: { ...planB, periods: planB.periods.map(period => ({ ...period, deviceLimit: 4 })) } });
    const buyerSyncPreview = await api("/api/catalog-v2/products/nh-app-plan-b/buyer-sync/preview", { method: "POST", body: {} });
    assert.ok(buyerSyncPreview.changes.some(change => change.userId === buyer.id));
    await api("/api/catalog-v2/products/nh-app-plan-b/buyer-sync", { method: "POST", body: { fingerprint: buyerSyncPreview.fingerprint } });
    assert.equal((await hubStore.getUser(buyer.id)).deviceLimit, 4, "a product change synced to buyers reaches the hub entitlement");
    assert.ok(await onNode(buyerHub.uuid));
    await database.query("UPDATE app_records SET data = data || $2::jsonb WHERE collection = 'users' AND id = $1", [buyer.id, JSON.stringify({ expiresAt: new Date(Date.now() - 60000).toISOString() })]);
    // The app caches records for minutes; a manual payment request reloads them before validating
    // (this one is refused for the unknown account, so nothing else changes).
    assert.match((await manualPayment({ accountId: "no-such-account", product: "traffic_pack" })).message, /400/);
    await runJob("node-hub-sync");
    assert.equal(await onNode(buyerHub.uuid), false, "an expired plan is removed from the node by the entitlement sync");

    // Disabling a hub inbound.
    await api(`/api/xui-inbounds/${hubRow.id}/set-enable`, { method: "POST", body: { enable: false } });
    assert.equal((await hubStore.getNode(node.id)).enabled, false);

    // Deleting an unclaimed self-hosted user disables them on the hub.
    await api(`/api/users/${user.id}`, { method: "DELETE" });
    assert.equal((await hubStore.getUser(user.id)).enabled, false, "a deleted user is disabled on the hub");
    console.log(`node-hub app checks passed (${mode === "hub" ? "node-hub only" : "node-hub with 3x-ui"}).`);
  } finally {
    await database.end();
    await hubStore.close();
    await handler.closeDataStore?.();
  }
}

if (process.env.NODE_HUB_APP_MODE) {
  child(process.env.NODE_HUB_APP_MODE).then(() => process.exit(0)).catch(error => {
    console.error(error);
    process.exit(1);
  });
} else {
  if (!testDatabaseUrl()) throw new Error("TEST_DATABASE_URL is required for node-hub app tests");
  for (const mode of ["hub", "mixed"]) {
    const result = spawnSync(process.execPath, [__filename], { env: { ...process.env, NODE_HUB_APP_MODE: mode, LOG_LEVEL: "silent" }, encoding: "utf8" });
    const output = `${result.stdout}${result.stderr}`.split("\n").filter(line => !line.startsWith("{\"level\"") && !line.startsWith("[req]") && !line.startsWith("[migration")).join("\n").trim();
    if (result.status !== 0) {
      console.error(output);
      process.exit(1);
    }
    console.log(output.split("\n").filter(line => line.includes("checks passed")).join("\n"));
  }
}
