// Node protocol settings: validation, the config xboard-node pulls, and the client proxy entry
// for subscriptions. Settings follow Xboard's protocol_settings shape (snake_case keys), so the
// config built here is what xboard-node expects from an Xboard panel
// (see Xboard app/Services/ServerService.php buildNodeConfig and app/Protocols/ClashMeta.php).
const crypto = require("crypto");

const PROTOCOLS = ["vless", "vmess", "trojan", "shadowsocks", "hysteria", "tuic", "anytls"];
const NETWORKS = ["tcp", "ws", "grpc", "h2", "httpupgrade", "xhttp"];
const SS2022_KEY_SIZES = { "2022-blake3-aes-128-gcm": 16, "2022-blake3-aes-256-gcm": 32, "2022-blake3-chacha20-poly1305": 32 };
const SS_CIPHERS = ["aes-128-gcm", "aes-192-gcm", "aes-256-gcm", "chacha20-ietf-poly1305", "xchacha20-ietf-poly1305", ...Object.keys(SS2022_KEY_SIZES)];

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 255) {
  return String(value ?? "").trim().slice(0, max);
}

function port(value, label = "端口") {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 65535) throw badRequest(`${label}必须在 1-65535 之间。`);
  return number;
}

// Shadowsocks 2022 needs a server key shared by the node and every client. Xboard derives it from
// the node's creation time; a stable per-node secret derived the same way keeps one key per node.
function shadowsocksServerKey(node) {
  const size = SS2022_KEY_SIZES[node?.settings?.cipher];
  if (!size) return null;
  const seed = `${node.id}:${new Date(node.createdAt || 0).toISOString()}:${node.settings.server_key_seed || ""}`;
  return crypto.createHash("sha256").update(seed).digest().subarray(0, size).toString("base64");
}

// Per-user Shadowsocks password: 2022 ciphers need a key of the cipher's size. xboard-node uses
// the first `size` bytes of the uuid text, zero-padded, base64 encoded (Xboard's uuidToBase64);
// classic ciphers use the uuid as is.
function shadowsocksUserPassword(node, uuid) {
  const size = SS2022_KEY_SIZES[node?.settings?.cipher];
  if (!size) return uuid;
  const raw = Buffer.alloc(size);
  Buffer.from(String(uuid), "utf8").copy(raw, 0, 0, size);
  return raw.toString("base64");
}

// A REALITY key pair in the format xray/sing-box use (raw X25519 keys, base64url without padding).
function generateRealityKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("x25519");
  const rawPrivate = privateKey.export({ format: "jwk" }).d;
  const rawPublic = publicKey.export({ format: "jwk" }).x;
  return { privateKey: rawPrivate, publicKey: rawPublic, shortId: crypto.randomBytes(8).toString("hex") };
}

// PKCS#8 header for a raw 32-byte X25519 private key. Importing as a JWK without its public
// half ("x") is rejected by newer Node releases, so the key goes in as DER instead.
const X25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b656e04220420", "hex");

function realityPublicKey(privateKey) {
  try {
    const raw = Buffer.from(privateKey, "base64url");
    if (raw.length !== 32) return "";
    const key = crypto.createPrivateKey({ key: Buffer.concat([X25519_PKCS8_PREFIX, raw]), format: "der", type: "pkcs8" });
    return crypto.createPublicKey(key).export({ format: "jwk" }).x;
  } catch {
    return "";
  }
}

function normalizeTlsSettings(value = {}) {
  const tls = plainObject(value);
  const out = {};
  if (tls.server_name) out.server_name = text(tls.server_name);
  if (tls.allow_insecure !== undefined) out.allow_insecure = tls.allow_insecure === true;
  if (tls.ech && typeof tls.ech === "object") out.ech = tls.ech;
  return out;
}

function normalizeRealitySettings(value = {}) {
  const reality = plainObject(value);
  const privateKey = text(reality.private_key, 128);
  if (!privateKey) throw badRequest("REALITY 需要 private_key。");
  const derived = realityPublicKey(privateKey);
  const publicKey = text(reality.public_key, 128) || derived;
  if (derived && publicKey !== derived) throw badRequest("REALITY public_key 与 private_key 不匹配。");
  if (!publicKey) throw badRequest("REALITY 需要 public_key。");
  const serverName = text(reality.server_name);
  if (!serverName) throw badRequest("REALITY 需要 server_name（伪装目标域名）。");
  const shortId = text(reality.short_id, 16);
  if (shortId && !/^[0-9a-f]{0,16}$/i.test(shortId)) throw badRequest("REALITY short_id 必须是不超过 16 位的十六进制。");
  const out = { server_name: serverName, private_key: privateKey, public_key: publicKey, short_id: shortId };
  out.server_port = reality.server_port ? port(reality.server_port, "REALITY 目标端口") : 443;
  out.dest = text(reality.dest) || `${serverName}:${out.server_port}`;
  if (reality.allow_insecure !== undefined) out.allow_insecure = reality.allow_insecure === true;
  return out;
}

// Validates and normalizes node settings for one protocol. Unknown keys are dropped so a stored
// node only carries what buildNodeConfig and the subscription builders read.
function normalizeNodeSettings(protocol, value = {}) {
  const input = plainObject(value);
  const settings = {};
  const network = text(input.network || "tcp", 32);
  if (["vless", "vmess", "trojan"].includes(protocol)) {
    if (!NETWORKS.includes(network)) throw badRequest(`不支持的传输方式：${network}`);
    settings.network = network;
    if (input.network_settings && typeof input.network_settings === "object") settings.network_settings = input.network_settings;
    if (input.multiplex && typeof input.multiplex === "object") settings.multiplex = input.multiplex;
    if (input.utls && typeof input.utls === "object") settings.utls = { enabled: input.utls.enabled !== false, fingerprint: text(input.utls.fingerprint || "chrome", 32) };
  }
  if (protocol === "vless" || protocol === "vmess" || protocol === "trojan") {
    const tls = Number(input.tls ?? (protocol === "trojan" ? 1 : 0));
    if (![0, 1, 2].includes(tls) || (protocol === "vmess" && tls === 2)) throw badRequest("tls 必须是 0（无）、1（TLS）或 2（REALITY，仅 VLESS/Trojan）。");
    if (protocol === "trojan" && tls === 0) throw badRequest("Trojan 必须启用 TLS 或 REALITY。");
    settings.tls = tls;
    if (tls === 1) settings.tls_settings = normalizeTlsSettings(input.tls_settings);
    if (tls === 2) settings.reality_settings = normalizeRealitySettings(input.reality_settings);
  }
  if (protocol === "vless") {
    const flow = text(input.flow, 64);
    if (flow && flow !== "xtls-rprx-vision") throw badRequest("VLESS flow 只支持 xtls-rprx-vision。");
    if (flow && (network !== "tcp" || settings.tls === 0)) throw badRequest("xtls-rprx-vision 需要 TCP 传输并启用 TLS 或 REALITY。");
    settings.flow = flow;
  }
  if (protocol === "shadowsocks") {
    const cipher = text(input.cipher || "2022-blake3-aes-128-gcm", 64);
    if (!SS_CIPHERS.includes(cipher)) throw badRequest(`不支持的 Shadowsocks 加密方式：${cipher}`);
    settings.cipher = cipher;
    settings.plugin = text(input.plugin, 64) || null;
    settings.plugin_opts = text(input.plugin_opts, 512) || null;
    settings.server_key_seed = text(input.server_key_seed, 64) || crypto.randomBytes(16).toString("hex");
  }
  if (protocol === "hysteria") {
    const version = Number(input.version ?? 2);
    if (version !== 2) throw badRequest("仅支持 Hysteria2。");
    const tls = plainObject(input.tls);
    if (!tls.server_name) throw badRequest("Hysteria2 需要 tls.server_name（证书域名）。");
    const bandwidth = plainObject(input.bandwidth);
    const obfs = plainObject(input.obfs);
    settings.version = 2;
    settings.tls = normalizeTlsSettings(tls);
    settings.bandwidth = { up: Math.max(0, Number(bandwidth.up) || 0), down: Math.max(0, Number(bandwidth.down) || 0) };
    settings.obfs = { open: obfs.open === true, type: text(obfs.type || "salamander", 32), password: text(obfs.password, 128) };
    if (settings.obfs.open && !settings.obfs.password) throw badRequest("Hysteria2 混淆需要 obfs.password。");
  }
  if (protocol === "tuic") {
    const tls = plainObject(input.tls);
    if (!tls.server_name) throw badRequest("TUIC 需要 tls.server_name。");
    settings.version = 5;
    settings.tls = normalizeTlsSettings(tls);
    settings.congestion_control = text(input.congestion_control || "bbr", 16);
    settings.alpn = Array.isArray(input.alpn) && input.alpn.length ? input.alpn.map(item => text(item, 16)) : ["h3"];
  }
  if (protocol === "anytls") {
    const tls = plainObject(input.tls);
    if (!tls.server_name) throw badRequest("AnyTLS 需要 tls.server_name。");
    settings.tls = normalizeTlsSettings(tls);
    settings.padding_scheme = Array.isArray(input.padding_scheme) ? input.padding_scheme.map(item => text(item, 64)) : [];
  }
  if (input.cert_config && typeof input.cert_config === "object") settings.cert_config = input.cert_config;
  if (Array.isArray(input.custom_outbounds)) settings.custom_outbounds = input.custom_outbounds;
  if (Array.isArray(input.custom_routes)) settings.custom_routes = input.custom_routes;
  if (Array.isArray(input.custom_route_rules)) settings.custom_route_rules = input.custom_route_rules;
  if (input.kernel_type === "xray" || input.kernel_type === "singbox") settings.kernel_type = input.kernel_type;
  return settings;
}

function normalizeNodeInput(input = {}, existing = null) {
  const protocol = text(input.protocol ?? existing?.protocol, 32).toLowerCase();
  if (!PROTOCOLS.includes(protocol)) throw badRequest(`不支持的协议：${protocol || "空"}`);
  const name = text(input.name ?? existing?.name, 80);
  if (!name) throw badRequest("节点名称不能为空。");
  const host = text(input.host ?? existing?.host);
  if (!host || /[\s/]/.test(host)) throw badRequest("请填写用户连接用的节点地址（域名或 IP）。");
  return {
    name,
    protocol,
    host,
    serverPort: port(input.serverPort ?? existing?.serverPort),
    listenIp: text(input.listenIp ?? existing?.listenIp ?? "0.0.0.0", 64) || "0.0.0.0",
    settings: normalizeNodeSettings(protocol, input.settings ?? existing?.settings),
    enabled: input.enabled === undefined ? existing?.enabled !== false : input.enabled === true,
    sortOrder: Number.isSafeInteger(Number(input.sortOrder)) ? Number(input.sortOrder) : Number(existing?.sortOrder) || 1,
    region: text(input.region ?? existing?.region, 64),
    networkLevel: ["premium", "optimized", "standard"].includes(input.networkLevel ?? existing?.networkLevel) ? (input.networkLevel ?? existing?.networkLevel) : "",
    inboundType: (input.inboundType ?? existing?.inboundType) === "custom" ? "custom" : "package"
  };
}

// The config xboard-node pulls from GET /api/v2/server/config (Xboard's buildNodeConfig).
function buildNodeConfig(node) {
  const s = node.settings || {};
  const base = {
    protocol: node.protocol,
    listen_ip: node.listenIp || "0.0.0.0",
    server_port: Number(node.serverPort),
    network: s.network || null,
    networkSettings: s.network_settings || null
  };
  let config;
  switch (node.protocol) {
    case "shadowsocks":
      config = { ...base, cipher: s.cipher, plugin: s.plugin || null, plugin_opts: s.plugin_opts || null, server_key: shadowsocksServerKey(node) };
      break;
    case "vmess":
      config = { ...base, tls: Number(s.tls) || 0, tls_settings: s.tls_settings || null, multiplex: s.multiplex || null };
      break;
    case "trojan":
      config = { ...base, host: node.host, server_name: s.tls === 2 ? s.reality_settings?.server_name : s.tls_settings?.server_name, multiplex: s.multiplex || null, tls: Number(s.tls) || 1, tls_settings: s.tls === 2 ? s.reality_settings : s.tls_settings || null };
      break;
    case "vless":
      config = { ...base, tls: Number(s.tls) || 0, flow: s.flow || "", decryption: null, tls_settings: s.tls === 2 ? s.reality_settings : s.tls_settings || null, multiplex: s.multiplex || null };
      break;
    case "hysteria":
      config = { ...base, version: 2, host: node.host, server_name: s.tls?.server_name, tls_settings: s.tls, up_mbps: Number(s.bandwidth?.up) || 0, down_mbps: Number(s.bandwidth?.down) || 0, obfs: s.obfs?.open ? s.obfs.type : null, "obfs-password": s.obfs?.open ? s.obfs.password : null };
      break;
    case "tuic":
      config = { ...base, version: 5, server_name: s.tls?.server_name, congestion_control: s.congestion_control, tls_settings: s.tls, auth_timeout: "3s", zero_rtt_handshake: false, heartbeat: "3s" };
      break;
    case "anytls":
      config = { ...base, server_name: s.tls?.server_name, tls_settings: s.tls, padding_scheme: s.padding_scheme || [] };
      break;
    default:
      throw badRequest(`不支持的协议：${node.protocol}`);
  }
  if (s.kernel_type) config.kernel_type = s.kernel_type;
  if (s.cert_config && s.cert_config.cert_mode !== "none") config.cert_config = s.cert_config;
  if (s.custom_outbounds) config.custom_outbounds = s.custom_outbounds;
  if (s.custom_routes) config.custom_routes = s.custom_routes;
  if (s.custom_route_rules) config.custom_route_rules = s.custom_route_rules;
  return config;
}

function appendTransport(proxy, s) {
  switch (s.network) {
    case "ws":
      proxy.network = "ws";
      if (s.network_settings?.path || s.network_settings?.headers?.Host) {
        proxy["ws-opts"] = {};
        if (s.network_settings.path) proxy["ws-opts"].path = s.network_settings.path;
        if (s.network_settings.headers?.Host) proxy["ws-opts"].headers = { Host: s.network_settings.headers.Host };
      }
      break;
    case "grpc":
      proxy.network = "grpc";
      if (s.network_settings?.serviceName) proxy["grpc-opts"] = { "grpc-service-name": s.network_settings.serviceName };
      break;
    case "h2":
      proxy.network = "h2";
      proxy["h2-opts"] = {};
      if (s.network_settings?.path) proxy["h2-opts"].path = s.network_settings.path;
      if (s.network_settings?.host) proxy["h2-opts"].host = [].concat(s.network_settings.host);
      break;
    case "httpupgrade":
      proxy.network = "ws";
      proxy["ws-opts"] = { "v2ray-http-upgrade": true };
      if (s.network_settings?.path) proxy["ws-opts"].path = s.network_settings.path;
      if (s.network_settings?.host) proxy["ws-opts"].headers = { Host: s.network_settings.host };
      break;
    case "xhttp":
      proxy.network = "xhttp";
      if (s.network_settings && (s.network_settings.path || s.network_settings.host || s.network_settings.mode)) {
        proxy["xhttp-opts"] = {};
        for (const key of ["path", "host", "mode"]) if (s.network_settings[key]) proxy["xhttp-opts"][key] = s.network_settings[key];
      }
      break;
    default:
      proxy.network = "tcp";
  }
}

// One Clash/Mihomo proxy entry for a user on a node (Xboard ClashMeta builders). The subscription
// relay hands these to subconverter, which renders every client format from them.
function clashProxy(node, uuid, name = node.name) {
  const s = node.settings || {};
  const server = node.host;
  const portNumber = Number(node.serverPort);
  const fingerprint = s.utls?.enabled !== false ? s.utls?.fingerprint || "chrome" : "";
  switch (node.protocol) {
    case "vless": {
      const proxy = { name, type: "vless", server, port: portNumber, uuid, udp: true, tls: false, encryption: "none" };
      if (s.flow) proxy.flow = s.flow;
      if (s.tls === 1) {
        proxy.tls = true;
        proxy["skip-cert-verify"] = s.tls_settings?.allow_insecure === true;
        if (s.tls_settings?.server_name) proxy.servername = s.tls_settings.server_name;
      } else if (s.tls === 2) {
        proxy.tls = true;
        proxy["skip-cert-verify"] = false;
        proxy.servername = s.reality_settings.server_name;
        proxy["reality-opts"] = { "public-key": s.reality_settings.public_key, "short-id": s.reality_settings.short_id || "" };
      }
      if (proxy.tls && fingerprint) proxy["client-fingerprint"] = fingerprint;
      appendTransport(proxy, s);
      return proxy;
    }
    case "vmess": {
      const proxy = { name, type: "vmess", server, port: portNumber, uuid, alterId: 0, cipher: "auto", udp: true };
      if (s.tls === 1) {
        proxy.tls = true;
        proxy["skip-cert-verify"] = s.tls_settings?.allow_insecure === true;
        if (s.tls_settings?.server_name) proxy.servername = s.tls_settings.server_name;
        if (fingerprint) proxy["client-fingerprint"] = fingerprint;
      }
      appendTransport(proxy, s);
      return proxy;
    }
    case "trojan": {
      const proxy = { name, type: "trojan", server, port: portNumber, password: uuid, udp: true };
      if (s.tls === 2) {
        proxy["skip-cert-verify"] = false;
        proxy.sni = s.reality_settings.server_name;
        proxy["reality-opts"] = { "public-key": s.reality_settings.public_key, "short-id": s.reality_settings.short_id || "" };
      } else {
        proxy["skip-cert-verify"] = s.tls_settings?.allow_insecure === true;
        if (s.tls_settings?.server_name) proxy.sni = s.tls_settings.server_name;
      }
      if (fingerprint) proxy["client-fingerprint"] = fingerprint;
      appendTransport(proxy, s);
      return proxy;
    }
    case "shadowsocks": {
      const serverKey = shadowsocksServerKey(node);
      const userKey = shadowsocksUserPassword(node, uuid);
      return { name, type: "ss", server, port: portNumber, cipher: s.cipher, password: serverKey ? `${serverKey}:${userKey}` : userKey, udp: true };
    }
    case "hysteria": {
      const proxy = { name, type: "hysteria2", server, port: portNumber, password: uuid, sni: s.tls?.server_name, "skip-cert-verify": s.tls?.allow_insecure === true };
      if (s.bandwidth?.up) proxy.up = s.bandwidth.up;
      if (s.bandwidth?.down) proxy.down = s.bandwidth.down;
      if (s.obfs?.open) {
        proxy.obfs = s.obfs.type;
        proxy["obfs-password"] = s.obfs.password;
      }
      return proxy;
    }
    case "tuic":
      return { name, type: "tuic", server, port: portNumber, uuid, password: uuid, sni: s.tls?.server_name, alpn: s.alpn || ["h3"], "congestion-controller": s.congestion_control || "bbr", "skip-cert-verify": s.tls?.allow_insecure === true, udp: true };
    case "anytls":
      return { name, type: "anytls", server, port: portNumber, password: uuid, sni: s.tls?.server_name, "skip-cert-verify": s.tls?.allow_insecure === true, udp: true };
    default:
      return null;
  }
}

module.exports = { PROTOCOLS, normalizeNodeInput, normalizeNodeSettings, buildNodeConfig, clashProxy, generateRealityKeyPair, realityPublicKey, shadowsocksServerKey, shadowsocksUserPassword };
