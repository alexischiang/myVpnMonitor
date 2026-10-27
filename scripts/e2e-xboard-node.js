// End-to-end check of the whole chain with real binaries:
//   main app (node-hub mode) -> node-hub -> xboard-node (xray kernel) <- xray client -> local file server
// It provisions a user through the app, starts xboard-node in machine mode against node-hub,
// downloads through VLESS, VLESS+REALITY+Vision and Shadowsocks-2022 nodes taken from the user's
// subscription, and checks traffic accounting, billing, speed limit, depletion, presence, the
// monitor and inbound management.
//
// Usage (disposable database only; it is wiped):
//   TEST_DATABASE_URL=postgres://... XBOARD_NODE_BIN=/path/xboard-node XRAY_BIN=/path/xray node scripts/e2e-xboard-node.js
// Linux only (xboard-node and xray binaries). Needs openssl on PATH for the REALITY target cert.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const { Pool } = require("pg");
const yaml = require("js-yaml");

const MiB = 1024 * 1024;
const work = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-xboard-node-"));
const children = [];
const log = (...args) => console.log(`[e2e ${new Date().toISOString().slice(11, 19)}]`, ...args);

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function listen(server, port = 0, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server.address().port));
  });
}

async function waitFor(label, check, { timeoutMs = 60000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(`timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}

function run(name, command, args, options = {}) {
  const out = fs.openSync(path.join(work, `${name}.log`), "a");
  const child = spawn(command, args, { stdio: ["ignore", out, out], ...options });
  children.push(child);
  child.on("exit", code => { if (code && !child.killedByTest) log(`${name} exited with ${code}; see ${path.join(work, `${name}.log`)}`); });
  return child;
}

// Downloads `bytes` from the file server through a SOCKS5 port (plain HTTP over the tunnel).
function downloadThroughSocks(socksPort, fileUrl, { timeoutMs = 60000 } = {}) {
  const url = new URL(fileUrl);
  return new Promise((resolve, reject) => {
    const socket = net.connect(socksPort, "127.0.0.1");
    const started = Date.now();
    let stage = 0;
    let buffer = Buffer.alloc(0);
    let received = 0;
    let headerDone = false;
    let expected = -1;
    const finish = () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ bytes: received, ms: Date.now() - started });
    };
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("download timed out")); }, timeoutMs);
    socket.on("error", error => { clearTimeout(timer); reject(error); });
    socket.on("connect", () => socket.write(Buffer.from([5, 1, 0])));
    socket.on("data", chunk => {
      if (stage === 0) {
        if (chunk[1] !== 0) return reject(new Error("socks auth rejected"));
        stage = 1;
        const host = Buffer.from(url.hostname);
        const port = Buffer.alloc(2);
        port.writeUInt16BE(Number(url.port));
        socket.write(Buffer.concat([Buffer.from([5, 1, 0, 3, host.length]), host, port]));
        return;
      }
      if (stage === 1) {
        if (chunk[1] !== 0) { clearTimeout(timer); socket.destroy(); return reject(new Error(`socks connect failed (${chunk[1]})`)); }
        stage = 2;
        socket.write(`GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\nConnection: close\r\n\r\n`);
        return;
      }
      if (!headerDone) {
        buffer = Buffer.concat([buffer, chunk]);
        const end = buffer.indexOf("\r\n\r\n");
        if (end < 0) return;
        headerDone = true;
        expected = Number(buffer.subarray(0, end).toString().match(/content-length:\s*(\d+)/i)?.[1] ?? -1);
        received += buffer.length - end - 4;
      } else received += chunk.length;
      // Done at Content-Length: some tunnels forward the server's close late.
      if (expected >= 0 && received >= expected) finish();
    });
    socket.on("close", () => {
      clearTimeout(timer);
      if (stage < 2 || !headerDone) return reject(new Error("connection closed before the response"));
      resolve({ bytes: received, ms: Date.now() - started });
    });
  });
}

async function main() {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  const nodeBin = process.env.XBOARD_NODE_BIN;
  const xrayBin = process.env.XRAY_BIN;
  if (!databaseUrl || !nodeBin || !xrayBin) throw new Error("TEST_DATABASE_URL, XBOARD_NODE_BIN and XRAY_BIN are required.");
  const database = new Pool({ connectionString: databaseUrl });

  // --- clean database --------------------------------------------------
  await database.query("CREATE TABLE IF NOT EXISTS app_records (collection TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (collection, id))");
  await database.query("TRUNCATE app_records");
  await database.query("DROP TABLE IF EXISTS nh_presence, nh_machine_load, nh_report_ids, nh_users, nh_nodes, nh_machines, nh_schema_migrations CASCADE");
  await database.query("DROP TABLE IF EXISTS xui_daily_traffic");
  await database.query("DELETE FROM catalog_v2_line_groups WHERE id = 'e2e-hub'").catch(() => {});

  // --- local servers: file server, REALITY target, fake subconverter -----
  const payload = crypto.randomBytes(8 * MiB);
  const files = http.createServer((req, res) => {
    const size = Math.min(64 * MiB, Number(new URL(req.url, "http://x").searchParams.get("bytes")) || MiB);
    res.writeHead(200, { "content-type": "application/octet-stream", "content-length": size });
    let sent = 0;
    const write = () => {
      while (sent < size) {
        const chunk = payload.subarray(0, Math.min(payload.length, size - sent));
        sent += chunk.length;
        if (!res.write(chunk)) return res.once("drain", write);
      }
      res.end();
    };
    write();
  });
  const filePort = await listen(files);
  const fileUrl = bytes => `http://127.0.0.1:${filePort}/file?bytes=${bytes}`;

  execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "2", "-subj", "/CN=reality.test", "-addext", "subjectAltName=DNS:reality.test", "-keyout", path.join(work, "dest.key"), "-out", path.join(work, "dest.crt")], { stdio: "ignore" });
  const dest = https.createServer({ key: fs.readFileSync(path.join(work, "dest.key")), cert: fs.readFileSync(path.join(work, "dest.crt")), minVersion: "TLSv1.3" }, (req, res) => res.end("ok"));
  const destPort = await listen(dest);

  let lastSubconverterInput = "";
  const subconverter = http.createServer(async (req, res) => {
    const source = new URL(req.url, "http://x").searchParams.get("url");
    lastSubconverterInput = await (await fetch(source)).text();
    res.writeHead(200, { "content-type": "text/yaml; charset=utf-8" });
    res.end(lastSubconverterInput);
  });
  const subconverterPort = await listen(subconverter);

  // --- node-hub ----------------------------------------------------------
  const hubPort = await freePort();
  const appPort = await freePort();
  const internalToken = crypto.randomBytes(24).toString("hex");
  Object.assign(process.env, {
    NODE_ENV: "test",
    LOCAL_DATABASE_URL: databaseUrl,
    NODE_HUB_DATABASE_URL: databaseUrl,
    NODE_HUB_INTERNAL_TOKEN: internalToken,
    NODE_HUB_URL: `http://127.0.0.1:${hubPort}`,
    NODE_HUB_PUBLIC_URL: `http://127.0.0.1:${hubPort}`,
    NODE_HUB_PUSH_INTERVAL: "10",
    NODE_HUB_PULL_INTERVAL: "10",
    NODE_HUB_SYNC_INTERVAL_MS: "3600000",
    SUB_CONVERTER_URL: `http://127.0.0.1:${subconverterPort}`,
    XUI_BASE_URL: "",
    XUI_API_TOKEN: "",
    ADMIN_USERNAME: "e2e-admin",
    ADMIN_PASSWORD: "e2e-admin-password",
    SESSION_SECRET: "e2e-session-secret",
    PORT: String(appPort),
    RESEND_API_KEY: "",
    ALERT_EMAIL_FROM: "",
    ALERT_EMAIL_PASS: "",
    TELEGRAM_BOT_TOKEN: ""
  });
  const { NodeHubStore } = require("../node-hub/store");
  const { createNodeHubHandler } = require("../node-hub/app");
  const hubStore = new NodeHubStore(new Pool({ connectionString: databaseUrl }));
  await hubStore.init();
  // WebSocket push by default: REST polling is stretched to 5 minutes, so every change below that
  // reaches the node within its 30s wait arrived over the push channel. E2E_REST_ONLY=1 checks the
  // polling path instead.
  const restOnly = process.env.E2E_REST_ONLY === "1";
  const pullSeconds = restOnly ? 10 : 300;
  const hubHandler = createNodeHubHandler({ store: hubStore, internalToken, publicUrl: process.env.NODE_HUB_PUBLIC_URL, pushInterval: 10, pullInterval: pullSeconds, websocket: !restOnly, logger: { warn() {}, error: (...args) => log("hub error", ...args) } });
  const hub = http.createServer(hubHandler);
  hub.on("upgrade", hubHandler.handleUpgrade);
  await listen(hub, hubPort);

  // --- seed one self-hosted user (the shape a V2 plan purchase leaves) ----
  const userId = "e2e-user";
  const email = "e2e@example.test";
  const now = Date.now();
  const user = {
    id: userId, userId: "e2e-user", email, customerID: "900200", lineType: "self_hosted", subscriptionId: "",
    subscriptionToken: crypto.randomBytes(16).toString("hex"),
    purchasedAt: new Date(now - 3600000).toISOString(), expiresAt: new Date(now + 30 * 86400000).toISOString(), duration: "monthly",
    v2ProductSnapshot: { productId: "e2e-plan", productType: "recurring_plan", periodId: "30d", lineGroupId: "e2e-hub", name: "E2E", durationDays: 30, trafficBytes: 40 * MiB, deviceLimit: 3 },
    xuiClientEmail: email
  };
  await database.query("INSERT INTO app_records (collection, id, position, data) VALUES ('users', $1, 0, $2::jsonb)", [userId, JSON.stringify(user)]);

  // --- main app ----------------------------------------------------------
  const handler = require("../server");
  const app = http.createServer(handler);
  await listen(app, appPort);
  const origin = `http://127.0.0.1:${appPort}`;
  let cookie = "";
  async function api(pathname, { method = "GET", body } = {}) {
    const response = await fetch(origin + pathname, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await response.text();
    let data = text;
    try { data = JSON.parse(text); } catch {}
    if (!response.ok) throw Object.assign(new Error(`${method} ${pathname} -> ${response.status}: ${text.slice(0, 300)}`), { status: response.status, data });
    return data;
  }
  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: "e2e-admin", password: "e2e-admin-password" }) });
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie").split(";", 1)[0];
  const runJob = async id => {
    await api(`/api/sync-jobs/${id}/run`, { method: "POST" });
    await waitFor(`job ${id}`, async () => {
      const jobs = await api("/api/sync-jobs");
      const job = jobs.modules.flatMap(module => module.jobs).find(item => item.id === id);
      if (job?.lastRun?.status === "failed" && Date.parse(job.lastRun.startedAt) > Date.now() - 60000) throw Object.assign(new Error(`job ${id} failed: ${job.lastRun.error}`), { fatal: true });
      return job && !job.running ? job : null;
    }, { timeoutMs: 30000 });
  };

  // --- admin creates machine and nodes through the app -------------------
  const machine = await api("/api/node-hub/machines", { method: "POST", body: { name: "E2E-VPS", host: "127.0.0.1" } });
  assert.ok(machine.installCommand.includes(`--machine-id ${machine.id}`));
  const keys = await api("/api/node-hub/reality-keypair", { method: "POST" });
  const [plainPort, realityPort, ssPort] = [await freePort(), await freePort(), await freePort()];
  const localDirect = [{ name: "e2e-local", match: { ip_cidrs: ["127.0.0.0/8"] }, action: { type: "direct" } }];
  const plain = await api("/api/node-hub/nodes", { method: "POST", body: { machineId: machine.id, name: "E2E VLESS", protocol: "vless", host: "127.0.0.1", serverPort: plainPort, region: "测试", networkLevel: "standard", settings: { network: "tcp", tls: 0, kernel_type: "xray", custom_route_rules: localDirect } } });
  const reality = await api("/api/node-hub/nodes", { method: "POST", body: { machineId: machine.id, name: "E2E REALITY", protocol: "vless", host: "127.0.0.1", serverPort: realityPort, region: "测试", networkLevel: "premium", settings: { network: "tcp", tls: 2, flow: "xtls-rprx-vision", kernel_type: "xray", reality_settings: { server_name: "reality.test", dest: `127.0.0.1:${destPort}`, private_key: keys.privateKey, short_id: keys.shortId }, custom_route_rules: localDirect } } });
  const ss = await api("/api/node-hub/nodes", { method: "POST", body: { machineId: machine.id, name: "E2E SS2022", protocol: "shadowsocks", host: "127.0.0.1", serverPort: ssPort, settings: { cipher: "2022-blake3-aes-128-gcm", kernel_type: "xray", custom_route_rules: localDirect } } });

  // Hub nodes show up as inbounds; a line group grants them like 3x-ui inbounds.
  const inbounds = await api("/api/xui-inbounds");
  const hubInbounds = inbounds.inbounds.filter(item => item.backend === "node-hub");
  assert.deepEqual(hubInbounds.map(item => item.name).sort(), ["E2E REALITY", "E2E SS2022", "E2E VLESS"]);
  await api("/api/catalog-v2/line-groups", { method: "POST", body: { id: "e2e-hub", name: "E2E 线路", isEnabled: true, sortOrder: 0, inboundKeys: hubInbounds.map(item => item.key) } }).catch(async error => {
    // The step-progress endpoint streams; a non-JSON 201 still means created.
    if (error.status !== 201) throw error;
  });
  const groups = await api("/api/catalog-v2/line-groups");
  assert.deepEqual(groups.find(group => group.id === "e2e-hub").inboundKeys.sort(), hubInbounds.map(item => item.key).sort());

  await runJob("node-hub-sync");
  const hubUser = await hubStore.getUser(userId);
  assert.ok(hubUser?.enabled, "the user is enabled on node-hub");
  assert.deepEqual(hubUser.nodeIds, [plain.id, reality.id, ss.id].sort((a, b) => a - b));
  assert.equal(hubUser.deviceLimit, 3);
  log("user entitled on hub", { hubUserId: hubUser.id, uuid: hubUser.uuid });

  // --- start the real xboard-node in machine mode ------------------------
  const nodeDir = path.join(work, "node");
  fs.mkdirSync(nodeDir);
  fs.writeFileSync(path.join(nodeDir, "config.yml"), yaml.dump({
    panel: { url: process.env.NODE_HUB_PUBLIC_URL },
    machine: { machine_id: machine.id, token: machine.token },
    kernel: { type: "xray", config_dir: nodeDir, log_level: process.env.E2E_DEBUG ? "debug" : "warning" },
    log: { level: process.env.E2E_DEBUG ? "debug" : "info" },
    node: { push_interval: 3, pull_interval: restOnly ? 3 : pullSeconds, track_interval: 1 }
  }));
  const nodeProcess = run("xboard-node", nodeBin, ["-c", path.join(nodeDir, "config.yml")], { cwd: nodeDir });
  await waitFor("xboard-node to pull configs", async () => {
    const overview = await api("/api/node-hub/overview");
    return overview.nodes.filter(node => [plain.id, reality.id, ss.id].includes(node.id)).every(node => node.online);
  }, { timeoutMs: 90000 });
  for (const port of [plainPort, realityPort, ssPort]) await waitFor(`node listening on ${port}`, () => new Promise(resolve => { const socket = net.connect(port, "127.0.0.1", () => { socket.destroy(); resolve(true); }); socket.on("error", () => resolve(false)); }), { timeoutMs: 60000 });
  log("xboard-node is serving all three nodes");
  if (!restOnly) {
    await waitFor("machine push channel", async () => (await api("/api/node-hub/overview")).machines.find(item => item.id === machine.id)?.pushConnected, { timeoutMs: 30000 });
    log("machine holds a WebSocket push channel; REST polling every", pullSeconds, "s");
  }

  // --- subscription from the app -----------------------------------------
  const subscription = await fetch(`${origin}/sub/${user.subscriptionToken}`, { headers: { "user-agent": "clash.meta" } });
  assert.equal(subscription.status, 200, await subscription.clone().text());
  const userinfo = subscription.headers.get("subscription-userinfo");
  assert.ok(userinfo.includes(`total=${40 * MiB}`), userinfo);
  const proxies = (yaml.load(lastSubconverterInput).proxies || []);
  const byName = Object.fromEntries(proxies.map(proxy => [proxy.name, proxy]));
  assert.ok(byName["E2E VLESS"] && byName["E2E REALITY"] && byName["E2E SS2022"], `subscription proxies: ${proxies.map(proxy => proxy.name).join(", ")}`);
  assert.equal(byName["E2E REALITY"]["reality-opts"]["public-key"], keys.publicKey);

  // --- xray client built from the subscription entries -------------------
  const socks = { plain: await freePort(), reality: await freePort(), ss: await freePort(), plain2: await freePort() };
  const toOutbound = (proxy, tag, sendThrough) => {
    const base = { tag, ...(sendThrough ? { sendThrough } : {}) };
    if (proxy.type === "vless") return { ...base, protocol: "vless", settings: { vnext: [{ address: proxy.server, port: proxy.port, users: [{ id: proxy.uuid, encryption: "none", ...(proxy.flow ? { flow: proxy.flow } : {}) }] }] }, streamSettings: proxy["reality-opts"] ? { network: "tcp", security: "reality", realitySettings: { serverName: proxy.servername, publicKey: proxy["reality-opts"]["public-key"], shortId: proxy["reality-opts"]["short-id"], fingerprint: proxy["client-fingerprint"] || "chrome" } } : { network: "tcp" } };
    if (proxy.type === "ss") return { ...base, protocol: "shadowsocks", settings: { servers: [{ address: proxy.server, port: proxy.port, method: proxy.cipher, password: proxy.password }] } };
    throw new Error(`unsupported proxy type ${proxy.type}`);
  };
  fs.writeFileSync(path.join(work, "client.json"), JSON.stringify({
    log: { loglevel: process.env.E2E_DEBUG ? "debug" : "warning" },
    inbounds: Object.entries(socks).map(([tag, port]) => ({ tag: `in-${tag}`, listen: "127.0.0.1", port, protocol: "socks", settings: { udp: false } })),
    outbounds: [toOutbound(byName["E2E VLESS"], "out-plain"), toOutbound(byName["E2E REALITY"], "out-reality"), toOutbound(byName["E2E SS2022"], "out-ss"), toOutbound(byName["E2E VLESS"], "out-plain2", "127.0.0.2")],
    routing: { rules: Object.keys(socks).map(tag => ({ type: "field", inboundTag: [`in-${tag}`], outboundTag: `out-${tag}` })) }
  }));
  run("xray-client", xrayBin, ["run", "-c", path.join(work, "client.json")]);
  fs.writeFileSync(path.join(work, "ports.json"), JSON.stringify({ socks, filePort }));
  for (const port of Object.values(socks)) await waitFor(`client socks ${port}`, () => new Promise(resolve => { const socket = net.connect(port, "127.0.0.1", () => { socket.destroy(); resolve(true); }); socket.on("error", () => resolve(false)); }), { timeoutMs: 20000 });

  // --- traffic through every protocol ------------------------------------
  const results = {};
  for (const [name, port, bytes] of [["vless", socks.plain, 4 * MiB], ["reality", socks.reality, 4 * MiB], ["ss2022", socks.ss, 4 * MiB]]) {
    results[name] = await downloadThroughSocks(port, fileUrl(bytes));
    assert.equal(results[name].bytes, bytes, `${name} delivered the whole file`);
  }
  log("downloads", results);
  const downloaded = 12 * MiB;
  const guid = `hub-m${machine.id}`;
  const trafficRow = await waitFor("traffic in xui_daily_traffic", async () => {
    const row = (await database.query("SELECT SUM(up_bytes)::bigint AS up, SUM(down_bytes)::bigint AS down FROM xui_daily_traffic WHERE email = $1 AND node_guid = $2", [email, guid])).rows[0];
    return Number(row?.down) >= downloaded ? row : null;
  }, { timeoutMs: 30000 });
  const down = Number(trafficRow.down);
  const up = Number(trafficRow.up);
  log("accounted", { down, up, downloaded, overheadPercent: Math.round((down / downloaded - 1) * 10000) / 100 });
  assert.ok(down >= downloaded && down <= downloaded * 1.05, `download accounted within 5% of the payload (${down} vs ${downloaded})`);
  assert.ok(up > 0 && up < MiB, "request bytes are accounted as upload");

  // Presence while a connection is open.
  await downloadThroughSocks(socks.plain, fileUrl(6 * MiB));
  const presence = await waitFor("presence", async () => {
    await api("/api/xui-presence/refresh", { method: "POST" });
    const value = await api("/api/xui-presence");
    return value.lastOnline?.[email] ? value : null;
  }, { timeoutMs: 30000 });
  log("presence", { lastOnline: presence.lastOnline[email], dailyUsed: presence.dailyTraffic?.users?.[email]?.usedBytes });

  // --- speed limit: 8 Mbps reaches the node on its next user pull ---------
  await api(`/api/users/${userId}/node-speed-limit`, { method: "PUT", body: { speedLimitMbps: 8 } });
  assert.equal((await hubStore.getUser(userId)).speedLimit, 8);
  await new Promise(resolve => setTimeout(resolve, 5000));
  const limited = await downloadThroughSocks(socks.plain, fileUrl(4 * MiB), { timeoutMs: 120000 });
  const mbps = limited.bytes * 8 / (limited.ms / 1000) / 1e6;
  log("speed-limited download", { ms: limited.ms, mbps: Math.round(mbps * 10) / 10 });
  assert.ok(mbps < 12, `8 Mbps limit is enforced (measured ${mbps.toFixed(1)} Mbps)`);
  await api(`/api/users/${userId}/node-speed-limit`, { method: "PUT", body: { speedLimitMbps: 0 } });

  // --- billing: the app ledger sees the hub traffic ----------------------
  await waitFor("all downloads reported", async () => Number((await database.query("SELECT SUM(down_bytes)::bigint AS down FROM xui_daily_traffic WHERE email = $1", [email])).rows[0].down) >= 22 * MiB, { timeoutMs: 30000 });
  await runJob("node-hub-billing");
  let users = await api("/api/users");
  let billed = users.find(item => item.id === userId);
  log("ledger", { usedBytes: billed.xuiWeightedTraffic?.usedBytes, totalBytes: billed.xuiWeightedTraffic?.totalBytes, nodes: billed.xuiWeightedTraffic?.nodes?.map(node => [node.key, node.rawBytes]) });
  assert.ok(billed.xuiWeightedTraffic.usedBytes >= 22 * MiB, "ledger counts the hub traffic");
  assert.equal(billed.xuiWeightedTraffic.nodes[0].key, guid);
  assert.equal(billed.xuiWeightedTraffic.depleted, false);

  // Machine multiplier 2x applies to hub traffic like a 3x-ui node multiplier.
  await api(`/api/xui-monitor/nodes/${encodeURIComponent(guid)}/settings`, { method: "PUT", body: { multiplier: 2 } });
  const monitor = await api("/api/xui-monitor");
  const machineRow = monitor.nodes.find(node => node.guid === guid);
  assert.equal(machineRow.status, "online");
  assert.equal(machineRow.multiplier, 2);
  assert.equal(machineRow.inboundCount, 3);

  // --- depletion: 2x weighted usage (44 MiB) exceeds the 40 MiB quota ------
  await runJob("node-hub-billing");
  users = await api("/api/users");
  billed = users.find(item => item.id === userId);
  log("ledger after multiplier", { usedBytes: billed.xuiWeightedTraffic.usedBytes, depleted: billed.xuiWeightedTraffic.depleted });
  assert.equal(billed.xuiWeightedTraffic.depleted, true, "weighted usage over quota marks the user depleted");
  assert.equal((await hubStore.getUser(userId)).enabled, false, "depletion disables the user on node-hub");
  let since = Date.now();
  await waitFor("node to drop the depleted user", async () => {
    try {
      await downloadThroughSocks(socks.reality, fileUrl(64 * 1024), { timeoutMs: 5000 });
      return false;
    } catch {
      return true;
    }
  }, { timeoutMs: 30000, intervalMs: 1000 });
  log("depleted user is refused by the node", { afterMs: Date.now() - since });

  // Restore: multiplier back to 1 -> under quota -> re-enabled on the next rounds.
  await api(`/api/xui-monitor/nodes/${encodeURIComponent(guid)}/settings`, { method: "PUT", body: { multiplier: 1 } });
  await runJob("node-hub-billing");
  assert.equal((await hubStore.getUser(userId)).enabled, true, "the user is re-enabled once under quota");
  since = Date.now();
  await waitFor("node to accept the user again", async () => (await downloadThroughSocks(socks.reality, fileUrl(64 * 1024), { timeoutMs: 5000 }).catch(() => null))?.bytes === 64 * 1024, { timeoutMs: 30000, intervalMs: 1000 });
  log("re-enabled user connects again", { afterMs: Date.now() - since });

  // --- disabling a node in inbound management stops it on the VPS ---------
  await api(`/api/xui-inbounds/${hubInbounds.find(item => item.name === "E2E SS2022").id}/set-enable`, { method: "POST", body: { enable: false } });
  since = Date.now();
  // Users are cut within one user pull; the port closes at the machine's next node-list refresh
  // (xboard-node refreshes at most once a minute).
  await waitFor("disabled node to refuse the user", async () => !(await downloadThroughSocks(socks.ss, fileUrl(64 * 1024), { timeoutMs: 5000 }).catch(() => null)), { timeoutMs: 30000, intervalMs: 1000 });
  log("disabled node refuses users", { afterMs: Date.now() - since });
  // xboard-node stops the node service at its next node-list refresh. Its xray instance keeps
  // the port until active connections drain (up to 5 minutes) before closing the listener.
  await waitFor("machine to stop the disabled node", () => fs.readFileSync(path.join(work, "xboard-node.log"), "utf8").includes(`machine: stopping node ${ss.id}`), { timeoutMs: 100000, intervalMs: 1000 });
  log("machine stopped the disabled node", { afterMs: Date.now() - since });

  for (const child of children) { child.killedByTest = true; child.kill("SIGTERM"); }
  await new Promise(resolve => nodeProcess.exitCode !== null ? resolve() : nodeProcess.once("exit", resolve));
  console.log(`E2E passed (${restOnly ? "REST polling" : "WebSocket push"}): real xboard-node ${execFileSync(nodeBin, ["-v"]).toString().trim()} served VLESS, VLESS+REALITY+Vision and Shadowsocks-2022 from node-hub; traffic accounted within 5% of the payload; billing, multiplier, depletion, re-enable, speed limit and node disable all reached the node.`);
  hubHandler.close();
  await database.end();
  await hubStore.close();
}

main().then(() => {
  for (const child of children) { child.killedByTest = true; child.kill("SIGTERM"); }
  setTimeout(() => process.exit(0), 500);
}).catch(async error => {
  console.error(error);
  console.error(`logs: ${work}`);
  if (process.env.E2E_HOLD) await new Promise(resolve => setTimeout(resolve, Number(process.env.E2E_HOLD) * 1000));
  for (const child of children) { child.killedByTest = true; child.kill("SIGTERM"); }
  setTimeout(() => process.exit(1), 500);
});
