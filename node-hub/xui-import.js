// Converts 3x-ui inbounds into node-hub node definitions for the cut-over (scripts/migrate-xui-to-node-hub.js).
// Ports, REALITY keys, SNI, short ids, flow and transport are kept, so VLESS/VMess clients keep
// working with the same uuid; Trojan and Shadowsocks clients get new credentials from the
// regenerated subscription (node-hub derives their password from the uuid).
function parseMaybeJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function inboundNodeGuid(inbound, localGuid) {
  const origin = String(inbound?.originNodeGuid || "");
  if (!origin || origin === "node:local" || origin === "local") return localGuid;
  return origin;
}

function transportSettings(stream) {
  const network = String(stream.network || "tcp");
  const out = { network: network === "raw" ? "tcp" : network };
  if (out.network === "ws") {
    const ws = stream.wsSettings || {};
    out.network_settings = { ...(ws.path ? { path: ws.path } : {}), ...(ws.headers?.Host || ws.host ? { headers: { Host: ws.headers?.Host || ws.host } } : {}) };
  } else if (out.network === "grpc") {
    const grpc = stream.grpcSettings || {};
    if (grpc.serviceName) out.network_settings = { serviceName: grpc.serviceName };
  } else if (out.network === "xhttp") {
    const xhttp = stream.xhttpSettings || {};
    out.network_settings = { ...(xhttp.path ? { path: xhttp.path } : {}), ...(xhttp.host ? { host: xhttp.host } : {}), ...(xhttp.mode ? { mode: xhttp.mode } : {}) };
  } else if (out.network === "httpupgrade") {
    const up = stream.httpupgradeSettings || {};
    out.network_settings = { ...(up.path ? { path: up.path } : {}), ...(up.host ? { host: up.host } : {}) };
  } else if (out.network !== "tcp") {
    return { error: `不支持的传输方式 ${network}` };
  }
  return out;
}

// One 3x-ui inbound -> { node, xuiKey, nodeGuid, clients: [{ email, uuid }], warnings } or { skip }.
function convertXuiInbound(inbound, { host, localGuid = "" } = {}) {
  const protocol = String(inbound?.protocol || "").toLowerCase();
  const settings = parseMaybeJson(inbound?.settings);
  const stream = parseMaybeJson(inbound?.streamSettings);
  const name = String(inbound?.remark || inbound?.tag || `Inbound ${inbound?.id}`);
  const warnings = [];
  if (!["vless", "vmess", "trojan", "shadowsocks"].includes(protocol)) return { skip: `${name}：协议 ${protocol || "未知"} 暂不支持迁移，请在 node-hub 手动创建。` };
  const transport = transportSettings(stream);
  if (transport.error) return { skip: `${name}：${transport.error}` };
  const nodeSettings = protocol === "shadowsocks" ? { kernel_type: "xray" } : { ...transport, kernel_type: "xray" };
  const security = String(stream.security || "none");
  if (protocol !== "shadowsocks") {
    if (security === "reality") {
      const reality = stream.realitySettings || {};
      const inner = reality.settings || {};
      const serverName = first(reality.serverNames) || inner.serverName || "";
      const dest = String(reality.target || reality.dest || "");
      nodeSettings.tls = 2;
      nodeSettings.reality_settings = {
        server_name: serverName,
        private_key: reality.privateKey,
        public_key: inner.publicKey || "",
        short_id: first(reality.shortIds) || "",
        ...(dest ? { dest } : {})
      };
      if (Array.isArray(reality.shortIds) && reality.shortIds.length > 1) warnings.push(`${name}：3x-ui 配置了 ${reality.shortIds.length} 个 shortId，node-hub 只保留第一个（${first(reality.shortIds) || "空"}），使用其他 shortId 的客户端需要更新订阅。`);
      if (Array.isArray(reality.serverNames) && reality.serverNames.length > 1) warnings.push(`${name}：只保留第一个 serverName ${serverName}。`);
      if (inner.fingerprint) nodeSettings.utls = { enabled: true, fingerprint: inner.fingerprint };
    } else if (security === "tls") {
      const tls = stream.tlsSettings || {};
      nodeSettings.tls = 1;
      nodeSettings.tls_settings = { ...(tls.serverName ? { server_name: tls.serverName } : {}) };
      warnings.push(`${name}：TLS 证书需要在 node-hub 节点上配置 cert_config（ACME 或证书文件），3x-ui 的证书不会自动迁移。`);
    } else {
      nodeSettings.tls = 0;
    }
  }
  const clients = (Array.isArray(settings.clients) ? settings.clients : [])
    .map(client => ({ email: String(client.email || "").trim().toLowerCase(), uuid: String(client.id || "").toLowerCase(), flow: String(client.flow || "") }))
    .filter(client => client.email);
  if (protocol === "vless") {
    const flows = new Set(clients.map(client => client.flow).filter(Boolean));
    nodeSettings.flow = flows.has("xtls-rprx-vision") ? "xtls-rprx-vision" : "";
    if (flows.size && clients.some(client => !client.flow)) warnings.push(`${name}：部分 Client 没有 flow，node-hub 节点统一使用 ${nodeSettings.flow}。`);
  }
  if (protocol === "trojan") warnings.push(`${name}：Trojan 密码会改为用户 uuid，用户需要更新订阅。`);
  if (protocol === "shadowsocks") {
    nodeSettings.cipher = String(settings.method || "2022-blake3-aes-128-gcm");
    warnings.push(`${name}：Shadowsocks 密钥会由 node-hub 重新生成，用户需要更新订阅。`);
  }
  const usable = clients.filter(client => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(client.uuid));
  return {
    node: {
      name,
      protocol,
      host,
      serverPort: Number(inbound.port),
      listenIp: inbound.listen ? String(inbound.listen) : "0.0.0.0",
      enabled: inbound.enable !== false,
      sortOrder: Math.max(1, Number(inbound.subSortIndex) || 1),
      settings: nodeSettings
    },
    xuiKey: `${inboundNodeGuid(inbound, localGuid)}:${inbound.id}`,
    nodeGuid: inboundNodeGuid(inbound, localGuid),
    clients: ["vless", "vmess"].includes(protocol) ? usable : [],
    warnings
  };
}

module.exports = { convertXuiInbound, parseMaybeJson, inboundNodeGuid };
