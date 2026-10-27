// Main-app side of node-hub: the internal API client and the pure helpers that map hub nodes
// into the app's existing inbound, presence, monitor and subscription shapes, so the inbound
// management page, line groups, custom inbounds, account node status and billing treat hub
// nodes like 3x-ui inbounds.

// Hub nodes appear in the app's inbound lists under ids far above any 3x-ui inbound id. Those
// ids are never valid 3x-ui ids, so every 3x-ui write (which filters by the panel's own id list)
// skips them.
const HUB_INBOUND_ID_OFFSET = 1_000_000_000;
const HUB_KEY_PATTERN = /^hub-[mn]\d+:(\d+)$/;

function isHubInboundId(id) {
  return Number.isSafeInteger(Number(id)) && Number(id) > HUB_INBOUND_ID_OFFSET;
}

function hubInboundId(nodeId) {
  return HUB_INBOUND_ID_OFFSET + Number(nodeId);
}

function hubNodeIdFromInboundId(id) {
  return isHubInboundId(id) ? Number(id) - HUB_INBOUND_ID_OFFSET : null;
}

function isHubInboundKey(key) {
  return HUB_KEY_PATTERN.test(String(key || ""));
}

function hubNodeIdFromKey(key) {
  const match = String(key || "").match(HUB_KEY_PATTERN);
  return match ? Number(match[1]) : null;
}

function hubInboundKey(node) {
  return `${node.guid}:${node.id}`;
}

// Rows in the shape of xuiInboundManagementView().inbounds. Probe status comes from the node's
// own heartbeat (config/user pulls and reports) instead of a TCP probe.
function hubManagementRows(overview) {
  return (overview?.nodes || []).map(node => ({
    id: hubInboundId(node.id),
    key: hubInboundKey(node),
    name: node.name,
    tag: `hub-${node.id}`,
    protocol: node.protocol,
    port: node.serverPort,
    subSortIndex: Math.max(1, Number(node.sortOrder) || 1),
    enabled: node.enabled !== false,
    recentlyActive: node.onlineCount > 0,
    nodeGuid: node.guid,
    nodeName: node.machineName || node.name,
    clientCount: Number(node.userCount) || 0,
    networkLevel: ["premium", "optimized", "standard"].includes(node.networkLevel) ? node.networkLevel : "",
    region: String(node.region || ""),
    inboundType: node.inboundType === "custom" ? "custom" : "package",
    probeStatus: node.enabled === false ? "disabled" : node.online ? "online" : "offline",
    probeLatencyMs: node.online ? 0 : null,
    probeCheckedAt: node.lastPushAt || node.lastCheckAt || "",
    probeError: node.enabled === false || node.online ? "" : node.lastCheckAt ? "节点超过 3 个上报周期未连接 node-hub。" : "节点尚未连接 node-hub。",
    backend: "node-hub",
    hubNodeId: node.id
  }));
}

// Hub node ids a user may use: hub inbounds in the user's line group plus personal custom hub
// inbounds. Disabled nodes are kept (the hub stops serving them itself).
function hubNodeIdsForUser({ groupInboundKeys = [], extraInboundIds = [], rows = [] } = {}) {
  const known = new Map(rows.map(row => [row.key, row.hubNodeId]));
  const knownIds = new Set(rows.map(row => row.hubNodeId));
  const ids = new Set();
  for (const key of groupInboundKeys) {
    const row = rows.find(item => item.key === key);
    if (row && row.inboundType !== "custom") ids.add(known.get(key));
  }
  for (const id of Array.isArray(extraInboundIds) ? extraInboundIds : []) {
    const nodeId = hubNodeIdFromInboundId(id);
    if (nodeId && knownIds.has(nodeId)) ids.add(nodeId);
  }
  return [...ids].filter(Boolean).sort((a, b) => a - b);
}

// Appends hub proxies to a Clash config body (the 3x-ui Clash config, or an empty one for users
// on hub nodes only). Names are made unique so subconverter does not drop a node.
function mergeClashProxies(yaml, baseBody, proxies = []) {
  let config = {};
  if (baseBody && String(baseBody).trim()) {
    const parsed = yaml.load(String(baseBody));
    config = parsed && typeof parsed === "object" ? parsed : {};
  }
  const existing = Array.isArray(config.proxies) ? config.proxies : [];
  const names = new Set(existing.map(proxy => String(proxy?.name || "")));
  const added = [];
  for (const proxy of proxies) {
    if (!proxy || typeof proxy !== "object") continue;
    let name = String(proxy.name || "node");
    for (let n = 2; names.has(name); n++) name = `${proxy.name} ${n}`;
    names.add(name);
    added.push({ ...proxy, name });
  }
  config.proxies = [...existing, ...added];
  return yaml.dump(config, { lineWidth: -1, noRefs: true });
}

// Merges hub presence into the 3x-ui presence shape kept in billing state:
// { onlineEmails, onlineByGuid: { guid: [email] }, lastOnline: { email: unixSeconds }, nodeNames }.
function mergeHubPresence(presence = {}, hubPresence = null, overview = null) {
  const result = {
    onlineEmails: [...(presence.onlineEmails || [])],
    onlineByGuid: { ...(presence.onlineByGuid || {}) },
    lastOnline: { ...(presence.lastOnline || {}) },
    nodeNames: { ...(presence.nodeNames || {}) }
  };
  if (!hubPresence) return result;
  const guidByNode = new Map((overview?.nodes || []).map(node => [Number(node.id), node.guid]));
  for (const machine of overview?.machines || []) result.nodeNames[machine.guid] = machine.name;
  for (const node of overview?.nodes || []) if (!node.machineId) result.nodeNames[node.guid] = node.name;
  const online = new Set(result.onlineEmails);
  for (const entry of Object.values(hubPresence.users || {})) {
    const email = String(entry.email || "").trim().toLowerCase();
    if (!email) continue;
    if (entry.online) online.add(email);
    for (const nodeId of entry.nodeIds || []) {
      const guid = guidByNode.get(Number(nodeId));
      if (!guid) continue;
      result.onlineByGuid[guid] = [...new Set([...(result.onlineByGuid[guid] || []), email])];
    }
    const seconds = Math.floor((Date.parse(entry.lastOnlineAt || "") || 0) / 1000);
    if (seconds > (Number(result.lastOnline[email]) || 0)) result.lastOnline[email] = seconds;
  }
  result.onlineEmails = [...online];
  return result;
}

function hubPresenceForEmail(hubPresence, email) {
  const target = String(email || "").trim().toLowerCase();
  return Object.values(hubPresence?.users || {}).find(entry => String(entry.email || "").toLowerCase() === target) || null;
}

// Machines in the shape of the 3x-ui monitor node list (one row per VPS, keyed by billing guid).
function hubMonitorNodes(overview) {
  const nodesByMachine = new Map();
  for (const node of overview?.nodes || []) {
    if (!node.machineId) continue;
    const list = nodesByMachine.get(node.machineId) || [];
    list.push(node);
    nodesByMachine.set(node.machineId, list);
  }
  return (overview?.machines || []).map(machine => {
    const nodes = nodesByMachine.get(machine.id) || [];
    const load = machine.loadStatus || {};
    const memory = load.mem?.total ? load.mem.used / load.mem.total * 100 : 0;
    const uptime = Math.max(0, ...nodes.map(node => Number(node.metrics?.uptime) || 0));
    const kernelUp = nodes.some(node => node.metrics?.kernel_status === true);
    return {
      id: `hub-m${machine.id}`,
      guid: machine.guid,
      name: machine.name,
      address: machine.host || nodes[0]?.host || "",
      port: null,
      enabled: machine.isActive !== false,
      status: machine.isActive === false ? "disabled" : machine.online ? "online" : "offline",
      lastHeartbeat: machine.lastSeenAt || "",
      latencyMs: 0,
      cpu: Math.max(0, Number(load.cpu) || 0),
      memory,
      uptime,
      uploadBytes: 0,
      downloadBytes: 0,
      xrayState: !nodes.length ? "unknown" : kernelUp ? "running" : "stop",
      xrayVersion: "",
      panelVersion: "xboard-node",
      inboundCount: nodes.length,
      clientCount: nodes.reduce((sum, node) => sum + (Number(node.userCount) || 0), 0),
      onlineCount: nodes.reduce((sum, node) => sum + (Number(node.onlineCount) || 0), 0),
      lastError: machine.online || machine.isActive === false ? "" : machine.lastSeenAt ? "机器超过 3 个上报周期未连接 node-hub。" : "机器尚未连接 node-hub，请在 VPS 上执行安装命令。",
      backend: "node-hub",
      netInSpeed: Number(load.net?.in_speed) || 0,
      netOutSpeed: Number(load.net?.out_speed) || 0
    };
  });
}

function createNodeHubClient({ url, token, timeoutMs = 10000, fetchImpl = (...args) => fetch(...args) }) {
  const base = String(url || "").replace(/\/+$/, "");
  return async function requestNodeHub(pathname, { method = "GET", body } = {}) {
    if (!base || !token) throw Object.assign(new Error("node-hub 尚未配置，请设置 NODE_HUB_URL 和 NODE_HUB_INTERNAL_TOKEN。"), { statusCode: 503 });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${base}${pathname}`, {
        method,
        signal: controller.signal,
        headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const text = await response.text();
      let payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch { throw Object.assign(new Error(`node-hub 返回了无效响应（HTTP ${response.status}）。`), { statusCode: 502 }); }
      if (!response.ok) throw Object.assign(new Error(payload?.message || payload?.error || `node-hub 请求失败（HTTP ${response.status}）。`), { statusCode: response.status });
      return payload;
    } catch (error) {
      if (error.name === "AbortError") throw Object.assign(new Error("node-hub 请求超时。"), { statusCode: 504 });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = {
  HUB_INBOUND_ID_OFFSET,
  isHubInboundId,
  hubInboundId,
  hubNodeIdFromInboundId,
  isHubInboundKey,
  hubNodeIdFromKey,
  hubManagementRows,
  hubNodeIdsForUser,
  mergeClashProxies,
  mergeHubPresence,
  hubPresenceForEmail,
  hubMonitorNodes,
  createNodeHubClient
};
