// The app with node-hub, without binaries: a protocol-faithful node client stands in for
// xboard-node. Runs in a fresh process. Covers provisioning, inbound management and line groups,
// custom inbounds, entitlement sync, traffic billing, depletion, subscriptions, presence and the
// monitor, plus every user action that reaches the line: traffic gift and reset, plan purchase,
// traffic add-on and pack, gift days, plan change, product buyer sync, account disable/enable,
// expiry and deletion, admin-created users and customers moved off the upstream line.
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

async function child() {
  const databaseUrl = testDatabaseUrl();
  const { Pool } = require("pg");
  const database = new Pool({ connectionString: databaseUrl });
  await database.query("CREATE TABLE IF NOT EXISTS app_records (collection TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (collection, id))");
  await database.query("TRUNCATE app_records");
  await database.query("DROP TABLE IF EXISTS nh_presence, nh_machine_load, nh_report_ids, nh_users, nh_nodes, nh_machines, nh_schema_migrations CASCADE");
  await database.query("DROP TABLE IF EXISTS xui_daily_traffic, xui_hourly_traffic");
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
  // A machine priced 1.5x before multipliers moved to nodes: its node must inherit 1.5.
  const { normalizeNodeInput } = require("./node-hub/node-config");
  const legacyMachine = await hubStore.createMachine({ name: "Legacy VPS", host: "legacy-vps.example.com" });
  const legacyNode = await hubStore.createNode(legacyMachine.id, normalizeNodeInput({ name: "Legacy 01", protocol: "vless", host: "legacy-vps.example.com", serverPort: 9443, enabled: false, settings: { network: "tcp", tls: 0 } }));
  await database.query("INSERT INTO app_records (collection, id, position, data) VALUES ('xuiBilling', 'state', 0, $1::jsonb)", [JSON.stringify({ multipliers: { [`hub-m${legacyMachine.id}`]: 1.5 } })]);

  const now = Date.now();
  const user = {
    id: "hub-app-user", userId: "hub-app-user", email: "hubapp@example.test", customerID: "900300", lineType: "self_hosted", subscriptionId: "",
    subscriptionToken: crypto.randomBytes(16).toString("hex"),
    purchasedAt: new Date(now - 3600000).toISOString(), expiresAt: new Date(now + 30 * 86400000).toISOString(), duration: "monthly",
    v2ProductSnapshot: { productId: "hub-plan", productType: "recurring_plan", periodId: "30d", lineGroupId: "nh-app-test", name: "Hub", durationDays: 30, trafficBytes: 20 * MiB, deviceLimit: 2 }
  };
  await database.query("INSERT INTO app_records (collection, id, position, data) VALUES ('users', $1, 0, $2::jsonb)", [user.id, JSON.stringify(user)]);
  // A customer still on the upstream line (never moved to a self-hosted line): paying for a plan
  // must move them to node-hub.
  const upstreamUser = {
    id: "hub-upstream-user", userId: "hub-upstream-user", email: "upstream@example.test", customerID: "900302", lineType: "upstream", subscriptionId: "upstream-sub",
    subscriptionToken: crypto.randomBytes(16).toString("hex"), purchasedAt: new Date(now - 40 * 86400000).toISOString(), expiresAt: new Date(now - 86400000).toISOString(), duration: "monthly",
    v2ProductSnapshot: user.v2ProductSnapshot
  };
  {
    await database.query("INSERT INTO app_records (collection, id, position, data) VALUES ('users', $1, 2, $2::jsonb)", [upstreamUser.id, JSON.stringify(upstreamUser)]);
    // Invited to claim their account but not claimed yet: 人工收款 must still be possible.
    const upstreamAccount = { id: "hub-upstream-account", customerID: upstreamUser.customerID, email: upstreamUser.email, passwordHash: "", status: "invited", linkedUserId: upstreamUser.id, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
    await database.query("INSERT INTO app_records (collection, id, position, data) VALUES ('accounts', $1, 0, $2::jsonb)", [upstreamAccount.id, JSON.stringify(upstreamAccount)]);
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
    assert.ok(jobs.find(job => job.id === "node-hub-billing").configured, "hub billing runs");
    assert.ok(!jobs.some(job => job.id === "xui-panel-sync" || job.id === "xui-inbound-probe"), "no 3x-ui jobs are listed");

    // Machine and node through the app; node shows up as an inbound.
    // Machines have no multiplier: a stale form value never reaches the hub or billing state.
    const machine = await api("/api/node-hub/machines", { method: "POST", body: { name: "Hub VPS", host: "hub-vps.example.com", multiplier: 1.5 } });
    assert.equal(machine.multiplier, undefined, "machines carry no multiplier");
    // The first Node Hub request moved the legacy machine multiplier onto its node, once.
    assert.equal((await api(`/api/node-hub/nodes/${legacyNode.id}`)).multiplier, 1.5, "a node inherits its machine's old multiplier");
    // The node's traffic multiplier is the app's billing key hub-m<machine>-n<node>: set and read with the node.
    const node = await api("/api/node-hub/nodes", { method: "POST", body: { machineId: machine.id, name: "Hub 01", protocol: "vless", host: "hub-vps.example.com", serverPort: 443, multiplier: 1, settings: { network: "tcp", tls: 0 } } });
    assert.equal(node.multiplier, 1, "created with its multiplier");
    const customNode = await api("/api/node-hub/nodes", { method: "POST", body: { machineId: machine.id, name: "Hub 定制", protocol: "vless", host: "hub-vps.example.com", serverPort: 8443, inboundType: "custom", settings: { network: "tcp", tls: 0 } } });
    assert.equal(customNode.multiplier, 1, "a node without one is billed at 1");
    await assert.rejects(api(`/api/node-hub/nodes/${node.id}`, { method: "PUT", body: { multiplier: 101 } }), error => error.status === 400);
    await assert.rejects(api(`/api/node-hub/nodes/${node.id}`, { method: "PUT", body: { multiplier: "" } }), error => error.status === 400, "a node multiplier is required once sent");
    assert.deepEqual((await api("/api/node-hub/machines")).map(item => item.id).sort(), [legacyMachine.id, machine.id].sort());
    assert.equal((await api("/api/node-hub/nodes")).length, 3);
    const view = await api("/api/xui-inbounds");
    const hubRow = view.inbounds.find(row => row.hubNodeId === node.id);
    const customRow = view.inbounds.find(row => row.hubNodeId === customNode.id);
    assert.equal(hubRow.key, `hub-m${machine.id}:${node.id}`);
    assert.equal(customRow.inboundType, "custom");
    assert.ok(view.inbounds.every(row => row.hubNodeId), "only hub nodes are listed");
    await api(`/api/xui-inbounds/${encodeURIComponent(hubRow.key)}/settings`, { method: "PUT", body: { region: "美国", networkLevel: "premium", inboundType: "package" } });
    assert.equal((await hubStore.getNode(node.id)).region, "美国", "inbound settings edits reach the hub node");

    const lineKeys = [hubRow.key];
    await api("/api/catalog-v2/line-groups", { method: "POST", body: { id: "nh-app-test", name: "Hub 测试", isEnabled: true, sortOrder: 0, inboundKeys: lineKeys } });
    const group = (await api("/api/catalog-v2/line-groups")).find(item => item.id === "nh-app-test");
    assert.deepEqual(group.inboundKeys.sort(), lineKeys.sort());
    assert.deepEqual(group.coverage.regions, ["美国"], "line group coverage includes hub nodes");

    // Provisioning (the same admin action a purchase or plan change uses).
    await api(`/api/users/${user.id}/xui-sync`, { method: "POST" });
    let hubUser = await hubStore.getUser(user.id);
    assert.equal(hubUser.enabled, true);
    assert.deepEqual(hubUser.nodeIds, [node.id]);
    assert.equal(hubUser.deviceLimit, 2);
    // Custom hub inbound as a personal inbound.
    await api(`/api/users/${user.id}/custom-inbounds`, { method: "PUT", body: { inboundIds: [customRow.id] } });
    hubUser = await hubStore.getUser(user.id);
    assert.deepEqual(hubUser.nodeIds, [node.id, customNode.id].sort((a, b) => a - b), "a personal custom hub inbound is granted");
    const customView = await api(`/api/users/${user.id}/custom-inbounds`);
    assert.ok(customView.effectiveInboundIds.includes(customRow.id) && customView.effectiveInboundIds.includes(hubRow.id));

    // An all-nodes group follows the node list: every package node, a later one included, but no custom node by itself.
    const groupBody = { name: "Hub 测试", isEnabled: true, sortOrder: 0 };
    const allNodesGroup = await api("/api/catalog-v2/line-groups/nh-app-test", { method: "PUT", body: { ...groupBody, includeAllNodes: true, inboundKeys: lineKeys } });
    assert.equal(allNodesGroup.includeAllNodes, true);
    assert.deepEqual((await hubStore.getUser(user.id)).nodeIds, [legacyNode.id, node.id, customNode.id].sort((a, b) => a - b), "saving an all-nodes group grants every node right away");
    const lateNode = await api("/api/node-hub/nodes", { method: "POST", body: { machineId: machine.id, name: "Hub 新节点", protocol: "vless", host: "hub-vps.example.com", serverPort: 9443, settings: { network: "tcp", tls: 0 } } });
    const listedGroup = (await api("/api/catalog-v2/line-groups")).find(item => item.id === "nh-app-test");
    assert.ok(listedGroup.inboundKeys.includes(`hub-m${machine.id}:${lateNode.id}`), "a new package node is listed in the all-nodes group");
    assert.ok(!listedGroup.inboundKeys.includes(customRow.key), "a custom node stays out of the all-nodes group");
    await api(`/api/users/${user.id}/xui-sync`, { method: "POST" });
    assert.ok((await hubStore.getUser(user.id)).nodeIds.includes(lateNode.id), "a new package node reaches users of the all-nodes group");
    await api(`/api/node-hub/nodes/${lateNode.id}`, { method: "DELETE" });
    const manualGroup = await api("/api/catalog-v2/line-groups/nh-app-test", { method: "PUT", body: { ...groupBody, includeAllNodes: false, inboundKeys: lineKeys } });
    assert.deepEqual([manualGroup.includeAllNodes, manualGroup.inboundKeys], [false, lineKeys], "switching off goes back to the chosen list");
    // The save above can join the sync started by the node delete, which read the old group, so run a fresh one.
    await api("/api/node-hub/sync", { method: "POST" });
    assert.deepEqual((await hubStore.getUser(user.id)).nodeIds, [node.id, customNode.id].sort((a, b) => a - b), "switching off takes the other nodes away");
    // Group speed limit: saving it pushes it to every user of the group; the user's own limit still wins.
    await api("/api/catalog-v2/line-groups/nh-app-test", { method: "PUT", body: { ...group, speedLimitMbps: 40 } });
    assert.equal((await api("/api/catalog-v2/line-groups")).find(item => item.id === "nh-app-test").speedLimitMbps, 40);
    assert.equal((await hubStore.getUser(user.id)).speedLimit, 40, "a group speed limit reaches node-hub");
    const groupSpeed = await api(`/api/users/${user.id}/node-speed-limit`);
    assert.deepEqual([groupSpeed.override, groupSpeed.plan, groupSpeed.group, groupSpeed.effective, groupSpeed.groupName], [null, 0, 40, 40, "Hub 测试"]);
    await assert.rejects(api("/api/catalog-v2/line-groups/nh-app-test", { method: "PUT", body: { ...group, speedLimitMbps: -1 } }), error => error.status === 400);

    // Speed limit.
    const ownSpeed = await api(`/api/users/${user.id}/node-speed-limit`, { method: "PUT", body: { speedLimitMbps: 30 } });
    assert.deepEqual([ownSpeed.override, ownSpeed.group, ownSpeed.effective], [30, 40, 30], "the user's own limit wins over the group");
    const nodeClient = new XboardNodeClient(`http://127.0.0.1:${hubPort}`, { token: (await hubStore.getMachine(machine.id)).token, machineId: machine.id, nodeId: node.id });
    // These checks follow the main user. Like xboard-node, a 304 (null) means the node keeps the list it already has.
    let nodeUserList = [];
    const nodeUsers = async () => (nodeUserList = (await nodeClient.getUsers()) ?? nodeUserList);
    const mainNodeUsers = async () => (await nodeUsers()).filter(item => item.uuid !== buyerUuid);
    let buyerUuid = "";
    assert.deepEqual(await mainNodeUsers(), [{ id: hubUser.id, uuid: hubUser.uuid, speed_limit: 30, device_limit: 2 }]);

    // Subscription: the hub proxies the user is entitled to.
    const sub = await fetch(`${origin}/sub/${user.subscriptionToken}`, { headers: { "user-agent": "clash.meta" } });
    assert.equal(sub.status, 200, await sub.clone().text());
    const names = (require("js-yaml").load(subconverterInput).proxies || []).map(proxy => proxy.name);
    assert.ok(names.includes("Hub 01") && names.includes("Hub 定制"), names.join(","));
    // The per-user node source filter is gone: its route answers 404 and a stored value has no effect.
    await assert.rejects(api(`/api/users/${user.id}/node-source`, { method: "PUT", body: { nodeSource: "nodehub" } }), error => error.status === 404);

    // Traffic -> billing -> depletion -> removal from the node.
    await nodeClient.report({ traffic: { [hubUser.id]: [MiB, 9 * MiB] }, online: { [hubUser.id]: 1 }, alive: { [hubUser.id]: ["203.0.113.8"] } });
    await runJob("node-hub-billing");
    let billed = (await api("/api/users")).find(item => item.id === user.id);
    assert.equal(billed.xuiWeightedTraffic.usedBytes, 10 * MiB, "hub traffic is billed");
    assert.equal(billed.xuiWeightedTraffic.depleted, false);
    assert.equal(billed.xuiLastTraffic.connectedIpCount, 1, "hub IPs count as connected IPs");
    const hubIps = billed.xuiOnlineIps.nodes.filter(item => item.source === "hub");
    assert.deepEqual(hubIps.map(item => item.ips), [["203.0.113.8"]], `the user page lists online IPs per hub node: ${JSON.stringify(billed.xuiOnlineIps)}`);
    assert.ok(hubIps[0].name.includes("·"), `hub node rows are named machine · node: ${hubIps[0].name}`);
    assert.equal(billed.xuiOnlineIps.totalIps, 1);
    const presence = await api("/api/xui-presence");
    assert.ok(presence.onlineEmails.includes("hubapp@example.test"));
    assert.deepEqual(presence.onlineByGuid[`hub-m${machine.id}`], ["hubapp@example.test"]);
    assert.equal(presence.dailyTraffic.nodes[`hub-m${machine.id}`].usedBytes, 10 * MiB);
    const monitor = await api("/api/xui-monitor");
    const machineRow = monitor.nodes.find(item => item.guid === `hub-m${machine.id}`);
    assert.equal(machineRow.status, "online");
    assert.equal(machineRow.onlineCount, 1);

    // Hub traffic is billed per node under hub-m<machine>-n<node>, and still counts as the machine's
    // traffic for presence, the monitor and VPS cost. The machine row has no multiplier to edit.
    const nodeKey = `hub-m${machine.id}-n${node.id}`;
    assert.deepEqual(billed.xuiWeightedTraffic.nodes.map(item => [item.key, item.name, item.multiplier, item.rawBytes]), [[nodeKey, "Hub VPS · Hub 01", 1, 10 * MiB]]);
    assert.equal(machineRow.multiplier, null, "machine rows carry no multiplier");
    await assert.rejects(api(`/api/xui-monitor/nodes/${encodeURIComponent(`hub-m${machine.id}`)}/settings`, { method: "PUT", body: { multiplier: 2 } }), error => error.status === 404, "the 3x-ui node settings route is gone");
    // A multiplier change reprices the node's traffic in the current cycle.
    assert.equal((await api(`/api/node-hub/nodes/${node.id}`, { method: "PUT", body: { multiplier: 1.1 } })).multiplier, 1.1);
    assert.equal((await api("/api/node-hub/overview")).nodes.find(item => item.id === node.id).multiplier, 1.1);
    assert.equal((await api("/api/node-hub/nodes")).find(item => item.id === customNode.id).multiplier, 1, "other nodes keep theirs");
    await nodeClient.report({ traffic: { [hubUser.id]: [0, MiB] } });
    await runJob("node-hub-billing");
    billed = (await api("/api/users")).find(item => item.id === user.id);
    assert.equal(billed.xuiWeightedTraffic.rawUsedBytes, 11 * MiB);
    assert.equal(billed.xuiWeightedTraffic.usedBytes, Math.round(11 * MiB * 1.1), "the node's traffic is weighted with its multiplier");
    assert.equal((await api("/api/xui-presence")).dailyTraffic.nodes[`hub-m${machine.id}`].usedBytes, 11 * MiB, "today's machine total sums its node keys");
    assert.equal((await api(`/api/node-hub/nodes/${node.id}`, { method: "PUT", body: { multiplier: 1 } })).multiplier, 1);
    await runJob("node-hub-billing");
    assert.equal((await api("/api/users")).find(item => item.id === user.id).xuiWeightedTraffic.usedBytes, 11 * MiB);

    await nodeClient.report({ traffic: { [hubUser.id]: [0, 10 * MiB] } });
    await runJob("node-hub-billing");
    billed = (await api("/api/users")).find(item => item.id === user.id);
    assert.equal(billed.xuiWeightedTraffic.depleted, true);
    assert.deepEqual(await mainNodeUsers(), [], "a depleted user is removed from the node");

    // More traffic puts a depleted user back on the node at once, without waiting for a sync job.
    const billingJob = "node-hub-billing";
    const giftResult = await api(`/api/users/${user.id}/traffic-gift`, { method: "POST", body: { trafficGb: 1 } }).catch(error => error);
    assert.ok(!(giftResult instanceof Error), `admin traffic gift: ${giftResult.message}`);
    assert.equal((await mainNodeUsers()).length, 1, "a traffic gift re-enables the user on the node immediately");
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

    {
      // Admin-created users and customers still on the upstream line are provisioned on node-hub.
      // 新增用户 creates the account only; 人工收款 (here ¥0) assigns the plan and provisions it.
      const createdAccount = await api("/api/users", { method: "POST", body: { email: "hub-new@example.test", wechatName: "new" } }).catch(error => error);
      assert.ok(!(createdAccount instanceof Error), `admin user creation: ${createdAccount.message}`);
      assert.deepEqual([createdAccount.registeredOnly, createdAccount.accountStatus], [true, "invited"]);
      const createdOrder = await manualPayment({ accountId: createdAccount.accountId, optionId: "v2:nh-app-plan:30d", amount: 0 });
      assert.equal(createdOrder.fulfillmentStatus, "fulfilled", `plan assignment: ${createdOrder.message || JSON.stringify(createdOrder)}`);
      const created = (await api("/api/users")).find(item => item.id === createdOrder.userId);
      assert.equal(created.wechatName, "new", "the profile entered at creation reaches the user");
      const createdHub = await hubStore.getUser(created.id);
      assert.deepEqual([createdHub?.enabled, createdHub?.nodeIds], [true, [node.id]], "a new user is provisioned on node-hub");
      assert.ok(await onNode(createdHub.uuid), "and is on the hub node at once");

      const upstreamAccountId = (await api("/api/users")).find(item => item.id === upstreamUser.id)?.accountId;
      assert.equal(upstreamAccountId, "hub-upstream-account");
      const upstreamOrder = await manualPayment({ accountId: upstreamAccountId, optionId: "v2:nh-app-plan:30d" });
      assert.equal(upstreamOrder.fulfillmentStatus, "fulfilled", `manual payment for an un-migrated user: ${upstreamOrder.message || JSON.stringify(upstreamOrder)}`);
      const migrated = (await api("/api/users")).find(item => item.id === upstreamUser.id);
      assert.equal(migrated.lineType, "self_hosted");
      const migratedHub = await hubStore.getUser(upstreamUser.id);
      assert.deepEqual([migratedHub?.enabled, migratedHub?.nodeIds], [true, [node.id]], "the un-migrated user is moved to node-hub");
      assert.ok(await onNode(migratedHub.uuid));

      // Their subscription carries the hub nodes, and billing counts their hub traffic.
      const newSub = await fetch(`${origin}/sub/${created.subscriptionToken}`, { headers: { "user-agent": "clash.meta" } });
      assert.equal(newSub.status, 200, await newSub.clone().text());
      assert.ok((require("js-yaml").load(subconverterInput).proxies || []).some(proxy => proxy.name === "Hub 01"));
      await runJob(billingJob);
      await nodeClient.report({ traffic: { [createdHub.id]: [0, 2 * MiB] } });
      await runJob(billingJob);
      const createdBilled = (await api("/api/users")).find(item => item.id === created.id);
      assert.equal(createdBilled.xuiWeightedTraffic?.rawUsedBytes, 2 * MiB, "a new user's hub traffic is billed");
      await runJob("node-hub-sync");
      assert.ok(await onNode(createdHub.uuid), "the full entitlement sync keeps them");
    }

    // Disabling a hub inbound.
    await api(`/api/xui-inbounds/${hubRow.id}/set-enable`, { method: "POST", body: { enable: false } });
    assert.equal((await hubStore.getNode(node.id)).enabled, false);

    // Deleting an unclaimed self-hosted user disables them on the hub.
    await api(`/api/users/${user.id}`, { method: "DELETE" });
    assert.equal((await hubStore.getUser(user.id)).enabled, false, "a deleted user is disabled on the hub");
    console.log("node-hub app checks passed.");
  } finally {
    await database.end();
    await hubStore.close();
    await handler.closeDataStore?.();
  }
}

if (process.env.NODE_HUB_APP_CHILD) {
  child().then(() => process.exit(0)).catch(error => {
    console.error(error);
    process.exit(1);
  });
} else {
  if (!testDatabaseUrl()) throw new Error("TEST_DATABASE_URL is required for node-hub app tests");
  const result = spawnSync(process.execPath, [__filename], { env: { ...process.env, NODE_HUB_APP_CHILD: "1", LOG_LEVEL: "silent" }, encoding: "utf8" });
  const output = `${result.stdout}${result.stderr}`.split("\n").filter(line => !line.startsWith("{\"level\"") && !line.startsWith("[req]") && !line.startsWith("[migration")).join("\n").trim();
  if (result.status !== 0) {
    console.error(output);
    process.exit(1);
  }
  console.log(output.split("\n").filter(line => line.includes("checks passed")).join("\n"));
}
