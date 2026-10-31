// Moves one 3x-ui VPS (a 3x-ui node, or the panel's own server) to node-hub.
//
//   node scripts/migrate-xui-to-node-hub.js --node-guid <guid|local> [--host <address>] [--name <machine name>]
//     [--port-offset <n>] [--apply] [--switch-line-groups | --add-to-line-groups]
//
// Without --apply it only prints the plan. With --apply it creates the node-hub machine and one
// node per 3x-ui inbound (same port, protocol, REALITY keys, SNI, short id, flow, transport) and
// seeds every matched user's 3x-ui uuid into node-hub, so VLESS/VMess clients keep working without
// re-importing. It prints the xboard-node install command for the VPS.
// --switch-line-groups replaces the migrated 3x-ui inbound keys in every line group with the new
// node-hub keys. Run it right after xboard-node is running on the VPS (and 3x-ui's xray there is
// stopped), then run the node-hub sync job so users get the new nodes in their subscription.
// To run node-hub next to 3x-ui on the same VPS, pass --port-offset <n>: every node-hub node listens
// on the 3x-ui port + n, so 3x-ui's xray keeps running. --add-to-line-groups then adds the node-hub
// keys next to the 3x-ui keys instead of replacing them, so mix users get both architectures' nodes.
// Pass the same --port-offset to every run for one VPS.
//
// Reads XUI_BASE_URL / XUI_API_TOKEN (or --from-file <inbounds.json> with { status, nodes, inbounds }),
// NODE_HUB_URL / NODE_HUB_INTERNAL_TOKEN and the app database (LOCAL_DATABASE_URL or DATABASE_URL).
const fs = require("fs");
const { loadLocalEnv } = require("../env");
const { convertXuiInbound } = require("../node-hub/xui-import");
const { createNodeHubClient, hubInboundId } = require("../node-hub/bridge");

loadLocalEnv();

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
}

async function xuiRead(apiPath, method = "GET") {
  const base = String(process.env.XUI_BASE_URL || "").replace(/\/+$/, "");
  const token = String(process.env.XUI_API_TOKEN || "").trim();
  if (!base || !token) throw new Error("XUI_BASE_URL and XUI_API_TOKEN are required (or pass --from-file).");
  const response = await fetch(`${base}${apiPath}`, { method, headers: { authorization: `Bearer ${token}` } });
  const payload = await response.json();
  if (!response.ok || payload.success !== true) throw new Error(`3x-ui ${apiPath}: ${payload.msg || response.status}`);
  return payload.obj;
}

async function main() {
  const targetGuid = argValue("--node-guid");
  if (!targetGuid) throw new Error("--node-guid is required (a 3x-ui node guid, or 'local' for the panel's own server).");
  const apply = process.argv.includes("--apply");
  const switchGroups = process.argv.includes("--switch-line-groups");
  const addGroups = process.argv.includes("--add-to-line-groups");
  if (switchGroups && addGroups) throw new Error("Pass either --switch-line-groups or --add-to-line-groups, not both.");
  const portOffset = Number(argValue("--port-offset") || 0);
  if (!Number.isSafeInteger(portOffset) || portOffset < 0 || portOffset > 65534) throw new Error("--port-offset must be an integer between 0 and 65534.");
  const fromFile = argValue("--from-file");
  const source = fromFile
    ? JSON.parse(fs.readFileSync(fromFile, "utf8"))
    : { status: await xuiRead("/panel/api/server/status"), nodes: await xuiRead("/panel/api/nodes/list"), inbounds: await xuiRead("/panel/api/inbounds/list") };
  const localGuid = String(source.status?.panelGuid || "node:local");
  const guid = targetGuid === "local" ? localGuid : targetGuid;
  const xuiNode = (source.nodes || []).find(node => String(node.guid || `node:${node.id}`) === guid);
  const host = argValue("--host") || xuiNode?.address || (guid === localGuid && process.env.XUI_BASE_URL ? new URL(process.env.XUI_BASE_URL).hostname : "");
  if (!host) throw new Error("Cannot tell the VPS address; pass --host.");
  const machineName = argValue("--name") || xuiNode?.remark || xuiNode?.name || (guid === localGuid ? process.env.XUI_PANEL_NAME || "主面板" : guid);

  const converted = (source.inbounds || []).map(inbound => ({ inbound, ...convertXuiInbound(inbound, { host, localGuid }) })).filter(item => item.skip || item.nodeGuid === guid);
  const migratable = converted.filter(item => !item.skip).map(item => ({ ...item, node: { ...item.node, serverPort: item.node.serverPort + portOffset } }));
  const tooHigh = migratable.find(item => item.node.serverPort > 65535);
  if (tooHigh) throw new Error(`inbound #${tooHigh.inbound.id} would listen on :${tooHigh.node.serverPort}; use a smaller --port-offset.`);
  const skipped = converted.filter(item => item.skip);
  if (!migratable.length) throw new Error(`No 3x-ui inbounds found on ${guid}.`);

  const databaseUrl = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("LOCAL_DATABASE_URL or DATABASE_URL is required.");
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: databaseUrl, ssl: !process.env.LOCAL_DATABASE_URL && process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
  try {
    const users = (await pool.query("SELECT data FROM app_records WHERE collection = 'users'")).rows.map(row => row.data);
    const usersByEmail = new Map(users.filter(user => user.xuiClientEmail).map(user => [String(user.xuiClientEmail).toLowerCase(), user]));
    const uuidByUser = new Map();
    const matchingUsers = new Set();
    // A hub uuid that differs from the 3x-ui one predates the app's uuid carry-over; those users
    // need a new subscription, the script does not overwrite a credential the hub already serves.
    const mismatched = new Map();
    for (const item of migratable) for (const client of item.clients) {
      const user = usersByEmail.get(client.email);
      if (!user) continue;
      if (!user.hubUuid) { if (!uuidByUser.has(user.id)) uuidByUser.set(user.id, { email: client.email, uuid: client.uuid }); }
      else if (String(user.hubUuid).toLowerCase() === String(client.uuid).toLowerCase()) matchingUsers.add(user.id);
      else mismatched.set(user.id, user.userId || user.email || user.id);
    }
    const customUsers = users.filter(user => (user.xuiExtraInboundIds || []).some(id => migratable.some(item => Number(item.inbound.id) === Number(id))));

    console.log(`\n3x-ui ${guid} -> node-hub machine "${machineName}" (${host})${portOffset ? `, node-hub ports = 3x-ui ports + ${portOffset} (3x-ui keeps running)` : ""}`);
    for (const item of migratable) console.log(`  inbound #${item.inbound.id} ${item.node.name}: ${item.node.protocol} :${item.node.serverPort} tls=${item.node.settings.tls ?? "-"} ${item.node.settings.flow || ""}`);
    for (const item of skipped) console.log(`  skipped: ${item.skip}`);
    for (const warning of migratable.flatMap(item => item.warnings)) console.log(`  note: ${warning}`);
    console.log(`  users whose 3x-ui uuid is carried over: ${uuidByUser.size}`);
    console.log(`  users already on the hub with their 3x-ui uuid: ${matchingUsers.size}`);
    if (mismatched.size) console.log(`  users whose hub uuid differs from 3x-ui (they must update their subscription): ${[...mismatched.values()].join(", ")}`);
    if (customUsers.length) console.log(`  users with a migrated inbound as personal custom inbound (re-assign in the user page after the switch): ${customUsers.map(user => user.userId || user.email || user.id).join(", ")}`);

    if (!apply && !switchGroups && !addGroups) {
      console.log("\nDry run. Re-run with --apply to create the machine and nodes.");
      return;
    }
    const hub = createNodeHubClient({ url: process.env.NODE_HUB_URL, token: String(process.env.NODE_HUB_INTERNAL_TOKEN || "").trim() });
    const overview = await hub("/internal/overview");
    let machine = overview.machines.find(item => item.name === machineName);
    if (apply) {
      if (!machine) machine = await hub("/internal/machines", { method: "POST", body: { name: machineName, host } });
      const existingPorts = new Map(overview.nodes.filter(node => node.machineId === machine.id).map(node => [node.serverPort, node]));
      for (const item of migratable) {
        if (existingPorts.has(item.node.serverPort)) {
          console.log(`  node on :${item.node.serverPort} already exists (#${existingPorts.get(item.node.serverPort).id}), left as is`);
          continue;
        }
        const created = await hub("/internal/nodes", { method: "POST", body: { ...item.node, machineId: machine.id } });
        existingPorts.set(created.serverPort, created);
        console.log(`  created node #${created.id} ${created.name}`);
      }
      for (const [userId, entry] of uuidByUser) await hub(`/internal/users/${encodeURIComponent(userId)}/uuid`, { method: "PUT", body: entry });
      const detail = await hub(`/internal/machines/${machine.id}`);
      const installNote = portOffset ? `3x-ui keeps running; open the new ports ${migratable.map(item => item.node.serverPort).join(", ")} in the VPS firewall` : "stop 3x-ui's xray there first if it uses the same ports";
      console.log(`\nInstall on the VPS (${installNote}):\n  ${detail.installCommand || `(set NODE_HUB_PUBLIC_URL to print the install command; machine id ${machine.id}, token ${detail.token})`}`);
    }
    if (switchGroups || addGroups) {
      if (!machine) throw new Error(`node-hub machine "${machineName}" does not exist yet; run with --apply first.`);
      const nodes = (await hub("/internal/overview")).nodes.filter(node => node.machineId === machine.id);
      const keyMap = new Map(migratable.map(item => {
        const node = nodes.find(entry => entry.serverPort === item.node.serverPort);
        return node ? [item.xuiKey, `${node.guid}:${node.id}`] : null;
      }).filter(Boolean));
      const groups = (await pool.query("SELECT id, inbound_keys FROM catalog_v2_line_groups")).rows;
      for (const group of groups) {
        const keys = Array.isArray(group.inbound_keys) ? group.inbound_keys : [];
        const next = [...new Set(keys.flatMap(key => !keyMap.has(key) ? [key] : addGroups ? [key, keyMap.get(key)] : [keyMap.get(key)]))];
        if (JSON.stringify(next) === JSON.stringify(keys)) continue;
        await pool.query("UPDATE catalog_v2_line_groups SET inbound_keys = $2::jsonb, updated_at = NOW() WHERE id = $1", [group.id, JSON.stringify(next)]);
        console.log(`  line group ${group.id}: ${keys.filter(key => keyMap.has(key)).length} inbound(s) ${addGroups ? "now also served by node-hub" : "switched to node-hub"}`);
      }
      const idMap = migratable.map(item => [Number(item.inbound.id), nodes.find(entry => entry.serverPort === item.node.serverPort)]).filter(([, node]) => node);
      if (customUsers.length && switchGroups) console.log(`  personal custom inbounds to re-assign (old 3x-ui inbound -> new node-hub inbound id): ${idMap.map(([id, node]) => `#${id} -> #${hubInboundId(node.id)}`).join(", ")}`);
      console.log("\nNow run the node-hub sync job (同步任务 → node-hub 授权同步) so users get the node-hub nodes.");
    }
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
