"use strict";

// Flat additive risk scoring engine for suspected subscription sharing, plus per-user IP
// whitelist helpers (exact IP or IPv4 /24 CIDR) and China mainland province adjacency lookup.

const net = require("node:net");
const {
  countedPulls,
  subscriptionClientLabel,
  mainlandLocation,
  distinctCities,
  distinctProvinces,
  cityChanges
} = require("./subscription-access");
const { minutesBetween } = require("./concurrent-location");

const SHARE_SCORE_THRESHOLDS = Object.freeze({
  review: 40,
  alert: 70,
  critical: 90
});

const SHARE_ALERT_REPEAT_MS = 24 * 3600000;
const SHARE_ALERT_SCORE_BUMP = 15;
const REVIEW_TOUCH_MS = 3600000;
const PRESENCE_IP_RETENTION_DAYS = 30;
const SOLO_LOOKBACK_DAYS = 7;

// --- Whitelist IP / CIDR helpers ---

function cleanIp(value) {
  const ip = String(value || "").trim().replace(/^\[|\]$/g, "").replace(/^::ffff:/i, "");
  return net.isIP(ip) ? ip : "";
}

function normalizeWhitelistEntry(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("请输入 IP 地址或 /24 网段。");
  if (text.includes("/")) {
    const [addrPart, prefixPart, extra] = text.split("/");
    if (extra !== undefined || prefixPart !== "24") {
      throw new Error("网段仅支持 IPv4 /24 格式（例如 113.108.12.0/24）。");
    }
    const ipv4 = cleanIp(addrPart);
    if (!ipv4 || !net.isIPv4(ipv4)) {
      throw new Error("网段仅支持 IPv4 /24 格式（例如 113.108.12.0/24）。");
    }
    const octets = ipv4.split(".");
    return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
  }
  const ip = cleanIp(text);
  if (!ip) throw new Error("请输入有效的 IP 地址或 IPv4 /24 网段（例如 113.108.12.0/24）。");
  return ip;
}

function ipMatchesWhitelist(ip, entries = []) {
  const cleaned = cleanIp(ip);
  if (!cleaned || !Array.isArray(entries) || !entries.length) return false;
  const isV4 = net.isIPv4(cleaned);
  const v4Prefix = isV4 ? cleaned.split(".").slice(0, 3).join(".") : "";
  for (const item of entries) {
    const target = typeof item === "string" ? item : String(item?.ip || "");
    if (!target) continue;
    if (target.endsWith("/24")) {
      if (isV4 && target.slice(0, -3).split(".").slice(0, 3).join(".") === v4Prefix) return true;
    } else if (cleanIp(target) === cleaned) {
      return true;
    }
  }
  return false;
}

function addWhitelistEntry(existing = [], { ip, note = "", addedBy = "admin", now = Date.now() } = {}) {
  const normalized = normalizeWhitelistEntry(ip);
  const cleanNote = String(note || "").trim().slice(0, 200);
  const list = Array.isArray(existing) ? existing.map(item => ({ ...item })) : [];
  const index = list.findIndex(item => item.ip === normalized);
  const entry = {
    ip: normalized,
    note: cleanNote,
    addedBy: String(addedBy || "admin"),
    addedAt: new Date(now).toISOString()
  };
  if (index >= 0) list[index] = entry;
  else list.unshift(entry);
  return { items: list.slice(0, 100), entry };
}

function removeWhitelistEntry(existing = [], ip) {
  const normalized = normalizeWhitelistEntry(ip);
  const list = Array.isArray(existing) ? existing : [];
  const next = list.filter(item => item.ip !== normalized);
  return { items: next, removed: next.length !== list.length, ip: normalized };
}

// --- China 31 mainland provinces geographic adjacency ---

function normProvince(name) {
  return String(name || "")
    .trim()
    .replace(/(省|市|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区)$/g, "");
}

const ADJACENT_PROVINCE_PAIRS = [
  ["北京", "天津"], ["北京", "河北"],
  ["天津", "河北"],
  ["河北", "辽宁"], ["河北", "内蒙古"], ["河北", "山西"], ["河北", "河南"], ["河北", "山东"],
  ["山西", "内蒙古"], ["山西", "陕西"], ["山西", "河南"],
  ["内蒙古", "黑龙江"], ["内蒙古", "吉林"], ["内蒙古", "辽宁"], ["内蒙古", "陕西"], ["内蒙古", "宁夏"], ["内蒙古", "甘肃"],
  ["辽宁", "吉林"],
  ["吉林", "黑龙江"],
  ["上海", "江苏"], ["上海", "浙江"],
  ["江苏", "山东"], ["江苏", "安徽"], ["江苏", "浙江"],
  ["浙江", "安徽"], ["浙江", "江西"], ["浙江", "福建"],
  ["安徽", "山东"], ["安徽", "河南"], ["安徽", "湖北"], ["安徽", "江西"],
  ["福建", "江西"], ["福建", "广东"],
  ["江西", "湖北"], ["江西", "湖南"], ["江西", "广东"],
  ["山东", "河南"],
  ["河南", "陕西"], ["河南", "湖北"],
  ["湖北", "陕西"], ["湖北", "重庆"], ["湖北", "湖南"],
  ["湖南", "重庆"], ["湖南", "贵州"], ["湖南", "广西"], ["湖南", "广东"],
  ["广东", "广西"], ["广东", "海南"],
  ["广西", "贵州"], ["广西", "云南"],
  ["重庆", "陕西"], ["重庆", "四川"], ["重庆", "贵州"],
  ["四川", "甘肃"], ["四川", "青海"], ["四川", "西藏"], ["四川", "云南"], ["四川", "贵州"], ["四川", "陕西"],
  ["贵州", "云南"],
  ["云南", "西藏"],
  ["西藏", "青海"], ["西藏", "新疆"],
  ["陕西", "宁夏"], ["陕西", "甘肃"],
  ["甘肃", "宁夏"], ["甘肃", "青海"], ["甘肃", "新疆"],
  ["青海", "新疆"]
];

const PROVINCE_NEIGHBORS = new Map();
for (const [a, b] of ADJACENT_PROVINCE_PAIRS) {
  if (!PROVINCE_NEIGHBORS.has(a)) PROVINCE_NEIGHBORS.set(a, new Set());
  if (!PROVINCE_NEIGHBORS.has(b)) PROVINCE_NEIGHBORS.set(b, new Set());
  PROVINCE_NEIGHBORS.get(a).add(b);
  PROVINCE_NEIGHBORS.get(b).add(a);
}

function areAdjacentProvinces(p1, p2) {
  const a = normProvince(p1);
  const b = normProvince(p2);
  if (!a || !b || a === b) return false;
  return Boolean(PROVINCE_NEIGHBORS.get(a)?.has(b));
}

// --- Client device classification & mobile UA fingerprinting ---

const MOBILE_ONLY_CLIENTS = new Set([
  "Shadowrocket",
  "Quantumult X",
  "Loon",
  "Clash Meta for Android",
  "v2rayNG"
]);

const DESKTOP_ONLY_CLIENTS = new Set([
  "Clash Verge",
  "Clash for Windows",
  "ClashX",
  "Mihomo Party",
  "v2rayN",
  "NekoBox"
]);

// iPad is treated as tablet (personal secondary device), not a second phone.
function clientDeviceType(userAgent) {
  const ua = String(userAgent || "");
  if (/\bipad\b|iPad\d+,\d+/i.test(ua)) return "tablet";
  const client = subscriptionClientLabel(ua);
  if (MOBILE_ONLY_CLIENTS.has(client)) return "mobile";
  if (DESKTOP_ONLY_CLIENTS.has(client)) return "desktop";
  if (/\bSF[IA]\b/i.test(ua)) return "mobile";
  if (/\bSF[MT]\b/i.test(ua)) return "desktop";
  if (/iphone|ipod|android|mobile/i.test(ua)) return "mobile";
  if (/windows|win64|win32|macintosh|mac os x|linux x86_64|x86_64|amd64/i.test(ua)) return "desktop";
  return "unknown";
}

function parseMobileFingerprint(userAgent) {
  const ua = String(userAgent || "").trim();
  const client = subscriptionClientLabel(ua);
  const darwin = ua.match(/Darwin\/(\d+\.\d+)/i)?.[1] || "";
  const android = ua.match(/Android[\s/](\d+(?:\.\d+)?)/i)?.[1] || "";
  const ios = ua.match(/(?:iPhone OS|CPU OS|iOS)[\s/](\d+[._]\d+)/i)?.[1] || "";
  const model = ua.match(/\b(iPhone\d+,\d+|iPod\d+,\d+)\b/i)?.[1] || "";
  const escaped = client.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const appVer = ua.match(new RegExp(`${escaped}[/\\s](\\d+(?:\\.\\d+)*)`, "i"))?.[1]
    || ua.split(/\s+/)[0] || "";
  const osPart = ios ? `iOS:${ios}` : darwin ? `Darwin:${darwin}` : android ? `Android:${android}` : "";
  const baseKey = [client, appVer, osPart].filter(Boolean).join("|");
  const key = [client, appVer, osPart, model].filter(Boolean).join("|");
  return { key, baseKey, client, appVer, darwin, android, ios, model };
}

// Folds rows that omit the hardware model suffix when client+appVer+osPart match one known model.
function distinctMobileFingerprints(rows) {
  const parsed = rows.map(row => parseMobileFingerprint(row.userAgent));
  const modelsByBase = new Map();
  for (const p of parsed) {
    if (!modelsByBase.has(p.baseKey)) modelsByBase.set(p.baseKey, new Set());
    if (p.model) modelsByBase.get(p.baseKey).add(p.model);
  }
  const canonical = new Set();
  for (const p of parsed) {
    const knownModels = modelsByBase.get(p.baseKey);
    if (!p.model && knownModels && knownModels.size === 1) {
      canonical.add(`${p.baseKey}|${[...knownModels][0]}`);
    } else {
      canonical.add(p.key);
    }
  }
  return [...canonical];
}

// Same phone upgrading iOS minor version once (e.g. Darwin 25.5 -> 25.6 without reverting).
function isMonotonicMinorUpgradeOnly(rows) {
  const ordered = [...rows].sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  const parsed = ordered.map(row => parseMobileFingerprint(row.userAgent));
  const baseKeys = new Set(parsed.map(p => `${p.client}|${p.appVer}|${p.model}`));
  if (baseKeys.size !== 1) return false;
  const darwins = parsed.map(p => p.darwin).filter(Boolean);
  if (darwins.length !== parsed.length) return false;
  const sequence = [];
  for (const d of darwins) {
    if (!sequence.length || sequence[sequence.length - 1] !== d) sequence.push(d);
  }
  const seen = new Set();
  let prevMajor = null;
  let prevMinor = null;
  for (const d of sequence) {
    if (seen.has(d)) return false;
    seen.add(d);
    const [maj, min] = d.split(".").map(Number);
    if (prevMajor !== null && (maj !== prevMajor || min <= prevMinor)) return false;
    prevMajor = maj;
    prevMinor = min;
  }
  return sequence.length === 2;
}

function twoDayProvinceRoundTrip(rows48h) {
  const seq = [];
  for (const row of [...rows48h].sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")))) {
    const loc = mainlandLocation(row);
    if (!loc) continue;
    if (!seq.length || seq[seq.length - 1].province !== loc.province) {
      seq.push({ province: loc.province, at: row.at, ip: row.ip });
    }
  }
  for (let i = 0; i + 2 < seq.length; i++) {
    if (seq[i].province === seq[i + 2].province && seq[i].province !== seq[i + 1].province) {
      return { hit: true, pattern: `${seq[i].province} → ${seq[i + 1].province} → ${seq[i + 2].province}` };
    }
  }
  return { hit: false, pattern: "" };
}

function checkSoloOnline(locs, soloIps, soloProvinces) {
  const uniqueIps = [...new Set(locs.map(loc => loc.ip).filter(Boolean))];
  const matchedIps = uniqueIps.filter(ip => soloIps.has(ip));
  if (matchedIps.length >= 2) {
    return { hit: true, detail: `精确 IP 命中（${matchedIps.length}/${uniqueIps.length} 个 IP 曾单独在线）` };
  }
  const provs = distinctProvinces(locs);
  if (provs.length >= 2) {
    const matchedProvs = provs.filter(province => soloProvinces.has(normProvince(province)));
    if (matchedProvs.length >= 2) {
      return { hit: true, detail: `跨省兜底命中（${matchedProvs.join("、")} 均曾单独在线）` };
    }
  }
  return { hit: false, detail: "" };
}

function scoreLevel(score) {
  if (score >= SHARE_SCORE_THRESHOLDS.critical) return "critical";
  if (score >= SHARE_SCORE_THRESHOLDS.alert) return "alert";
  if (score >= SHARE_SCORE_THRESHOLDS.review) return "review";
  return "normal";
}

// Flat additive scoring across concurrent presence and subscription pulls.
// Whitelisted IPs and own node IPs are excluded before any signal is evaluated.
function scoreSubscriptionShare({
  rows7d = [],
  concurrent24h = [],
  presenceActivity = [],
  nodeIps = new Set(),
  whitelist = [],
  now = Date.now()
} = {}) {
  const nodes = nodeIps instanceof Set ? nodeIps : new Set(nodeIps || []);
  const isExcludedIp = ip => !ip || nodes.has(ip) || ipMatchesWhitelist(ip, whitelist);

  const counted7d = countedPulls(rows7d, nodes).filter(row => !ipMatchesWhitelist(row.ip, whitelist));
  const counted72h = counted7d.filter(row => now - new Date(row.at).getTime() <= 72 * 3600000);
  const counted48h = counted7d.filter(row => now - new Date(row.at).getTime() <= 48 * 3600000);
  const counted24h = counted7d.filter(row => now - new Date(row.at).getTime() <= 24 * 3600000);

  // Recent solo-online sets (last 7 days)
  const soloCutoff = now - SOLO_LOOKBACK_DAYS * 86400000;
  const soloIps = new Set();
  const soloProvinces = new Set();
  for (const item of presenceActivity || []) {
    if (isExcludedIp(item?.ip)) continue;
    const soloAt = item?.soloLastAt ? new Date(item.soloLastAt).getTime() : NaN;
    if (Number.isFinite(soloAt) && soloAt >= soloCutoff && (Number(item.soloSamples) || 0) >= 1) {
      soloIps.add(item.ip);
      const prov = normProvince(item.province);
      if (prov) soloProvinces.add(prov);
    }
  }

  // IP -> latest known client & mobile fingerprint from last 72h pulls
  const ipClientMap = new Map();
  for (const row of counted72h) {
    if (!row.ip || ipClientMap.has(row.ip)) continue;
    ipClientMap.set(row.ip, {
      deviceType: clientDeviceType(row.userAgent),
      client: subscriptionClientLabel(row.userAgent),
      fp: parseMobileFingerprint(row.userAgent).key
    });
  }

  const factors = [];
  const allProvinces = new Set(distinctProvinces(counted24h));
  const allCities = new Set(distinctCities(counted24h));
  const sources = new Set();

  // --- Concurrent online rules ---
  let bestProvPoints = 0;
  let bestProvLabel = "";
  let bestProvDetail = "";
  let hasCrossCityOnline = false;
  const crossCitiesOnline = new Set();
  let dualMobileHit = "";
  let soloOnlineHit = "";
  let hasMultiIpConcurrent = false;
  let maxMultiIpCount = 0;

  for (const ep of concurrent24h || []) {
    const durationMin = minutesBetween(ep.startedAt, ep.lastSeenAt);
    const locs = (Array.isArray(ep.locations) ? ep.locations : []).filter(loc => !isExcludedIp(loc.ip));
    const uniqueIps = [...new Set(locs.map(loc => loc.ip))];
    if (uniqueIps.length < 2) continue;

    for (const p of distinctProvinces(locs)) allProvinces.add(p);
    for (const c of distinctCities(locs)) allCities.add(c);

    if (!soloOnlineHit) {
      const solo = checkSoloOnline(locs, soloIps, soloProvinces);
      if (solo.hit) soloOnlineHit = solo.detail;
    }

    const mobileLocs = [];
    const fixedIps = [];
    for (const loc of locs) {
      const info = ipClientMap.get(loc.ip);
      if (info?.deviceType === "mobile") mobileLocs.push({ ip: loc.ip, client: info.client, fp: info.fp, nodes: loc.nodes || [] });
      else if (info?.deviceType === "desktop" || info?.deviceType === "tablet") fixedIps.push(loc.ip);
    }
    if (mobileLocs.length >= 2 && !dualMobileHit) {
      const distinctFps = new Set(mobileLocs.map(m => m.fp));
      const allNodes = new Set(mobileLocs.flatMap(m => m.nodes));
      const differentNodes = allNodes.size >= 2;
      if (distinctFps.size >= 2 || durationMin >= 10 || (differentNodes && durationMin >= 6)) {
        const reason = distinctFps.size >= 2 ? "不同手机指纹" : durationMin >= 10 ? `持续 ${durationMin} 分钟` : `跨节点持续 ${durationMin} 分钟`;
        dualMobileHit = `${mobileLocs.map(m => `${m.ip}(${m.client})`).join(" + ")}（${reason}）`;
      }
    }

    const provs = distinctProvinces(locs);
    const cits = distinctCities(locs);
    if (provs.length >= 3) {
      const pts = 80 + (provs.length - 3) * 20;
      if (pts > bestProvPoints) {
        bestProvPoints = pts;
        bestProvLabel = `同时跨 ${provs.length} 省在线`;
        bestProvDetail = provs.join("、");
      }
    } else if (provs.length === 2) {
      const adj = areAdjacentProvinces(provs[0], provs[1]);
      const pts = adj ? 40 : 50;
      if (pts > bestProvPoints) {
        bestProvPoints = pts;
        bestProvLabel = adj ? "同时跨省在线（隔壁省）" : "同时跨省在线（非隔壁省）";
        bestProvDetail = provs.join("、");
      }
    } else if (cits.length >= 2 && durationMin >= 6) {
      hasCrossCityOnline = true;
      for (const c of cits) crossCitiesOnline.add(c);
    }

    const isOneMobilePlusFixed = mobileLocs.length === 1 && fixedIps.length >= 1 && (mobileLocs.length + fixedIps.length === uniqueIps.length);
    if (!isOneMobilePlusFixed && uniqueIps.length >= 3) {
      hasMultiIpConcurrent = true;
      if (uniqueIps.length > maxMultiIpCount) maxMultiIpCount = uniqueIps.length;
    }
  }

  if (bestProvPoints > 0) {
    sources.add("presence");
    factors.push({ key: "concurrent_province", label: bestProvLabel, points: bestProvPoints, detail: bestProvDetail });
  } else if (hasCrossCityOnline) {
    sources.add("presence");
    factors.push({ key: "concurrent_city", label: "同时同省跨市在线（≥ 6 分钟）", points: 10, detail: [...crossCitiesOnline].join("、") });
  }
  if (soloOnlineHit) {
    sources.add("presence");
    factors.push({ key: "solo_online", label: "多端均曾独立在线", points: 10, detail: soloOnlineHit });
  }
  if (dualMobileHit) {
    sources.add("presence");
    factors.push({ key: "dual_mobile_online", label: "非同 IP 双手机同时在线", points: 10, detail: dualMobileHit });
  }
  if (hasMultiIpConcurrent) {
    sources.add("presence");
    factors.push({ key: "concurrent_multi_ip", label: "多公网 IP 并发", points: 10, detail: `${maxMultiIpCount} 个 IP` });
  }

  // --- Subscription pull rules ---
  const mobileRows24h = counted24h.filter(row => clientDeviceType(row.userAgent) === "mobile");
  const byMobileClient = new Map();
  for (const row of mobileRows24h) {
    const client = subscriptionClientLabel(row.userAgent);
    const list = byMobileClient.get(client) || [];
    list.push(row);
    byMobileClient.set(client, list);
  }
  let mobileFpHit = "";
  for (const [client, list] of byMobileClient) {
    const fps = distinctMobileFingerprints(list);
    if (fps.length >= 2) {
      const ips = new Set(list.map(row => row.ip).filter(Boolean));
      if (ips.size >= 2 && !isMonotonicMinorUpgradeOnly(list)) {
        mobileFpHit = `${client}：${fps.slice(0, 3).join(" / ")}`;
        break;
      }
    }
  }
  if (mobileFpHit) {
    sources.add("pull");
    factors.push({ key: "mobile_multi_fp", label: "移动端多版本/OS/机型指纹", points: 20, detail: mobileFpHit });
  }

  const provinces24h = distinctProvinces(counted24h);
  const cities24h = distinctCities(counted24h);
  if (provinces24h.length >= 2) {
    const ordered24h = [...counted24h].sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
    let minGap = Infinity;
    let minGapDesc = "";
    let prev = null;
    for (const row of ordered24h) {
      const loc = mainlandLocation(row);
      if (!loc) continue;
      if (prev && prev.province !== loc.province) {
        const mins = Math.max(0, Math.round((new Date(row.at) - new Date(prev.at)) / 60000));
        if (mins < minGap) {
          minGap = mins;
          minGapDesc = `${prev.province} → ${loc.province}（${mins} 分钟）`;
        }
      }
      prev = { province: loc.province, at: row.at };
    }
    sources.add("pull");
    if (minGap <= 30) {
      factors.push({ key: "impossible_travel_30m", label: "跨省不可能移动（≤ 30 分钟）", points: 10, detail: minGapDesc });
    } else if (minGap <= 120) {
      factors.push({ key: "impossible_travel_2h", label: "跨省不可能移动（≤ 2 小时）", points: 10, detail: minGapDesc });
    } else {
      factors.push({ key: "cross_province_pull", label: "24 小时跨省拉取", points: 10, detail: provinces24h.join("、") });
    }
  } else if (cities24h.length >= 2) {
    sources.add("pull");
    factors.push({ key: "cross_city_pull", label: "24 小时同省跨市拉取", points: 10, detail: cities24h.join("、") });
  }

  const rt = twoDayProvinceRoundTrip(counted48h);
  if (rt.hit) {
    sources.add("pull");
    factors.push({ key: "roundtrip_48h", label: "2 天内两省往返交替", points: 10, detail: rt.pattern });
  }

  const mobileCityChanges = cityChanges(mobileRows24h);
  if (mobileCityChanges.length >= 2) {
    const mobCities = distinctCities(mobileRows24h);
    const mobIps = new Set(mobileRows24h.map(row => row.ip).filter(Boolean));
    if (mobCities.length >= 2 && mobIps.size >= 2) {
      sources.add("pull");
      factors.push({ key: "mobile_alt_city", label: "移动端异地交替拉取", points: 10, detail: `${mobCities.join("、")}（${mobileCityChanges.length} 次切换）` });
    }
  }

  const score = factors.reduce((sum, item) => sum + item.points, 0);
  const level = scoreLevel(score);
  return {
    score,
    level,
    thresholds: SHARE_SCORE_THRESHOLDS,
    factors,
    provinces: [...allProvinces].sort((a, b) => a.localeCompare(b, "zh-Hans-CN")),
    cities: [...allCities].sort((a, b) => a.localeCompare(b, "zh-Hans-CN")),
    sources: ["pull", "presence"].filter(item => sources.has(item))
  };
}

// Alert when score reaches alert threshold (>= 70); repeat within 24h only when score jumps >= 15,
// level escalates (alert -> critical), or a new province appears.
function shouldSendShareAlert(scored, lastAlert, now = Date.now()) {
  if (!scored || scored.score < SHARE_SCORE_THRESHOLDS.alert) {
    return { send: false, score: scored?.score || 0, level: scored?.level || "normal", provinces: scored?.provinces || [], cities: scored?.cities || [] };
  }
  const lastAt = lastAlert?.at ? new Date(lastAlert.at).getTime() : NaN;
  const knownProvinces = new Set(lastAlert?.provinces || []);
  const prevScore = Number(lastAlert?.score) || 0;
  const escalated = scored.level === "critical" && lastAlert?.level !== "critical";
  const jumped = scored.score - prevScore >= SHARE_ALERT_SCORE_BUMP;
  const newProvince = (scored.provinces || []).some(province => !knownProvinces.has(province));
  const send = !Number.isFinite(lastAt) || now - lastAt >= SHARE_ALERT_REPEAT_MS || escalated || jumped || newProvince;
  return { send, score: scored.score, level: scored.level, provinces: scored.provinces || [], cities: scored.cities || [] };
}

// Review queue entry whenever score >= review threshold (40).
// Re-opens a reviewed user when a new province/city appears, score jumps >= 15, or level escalates.
const LEVEL_RANK = { normal: 0, review: 1, alert: 2, critical: 3 };
function shareReviewRecord(scored, previous, now = Date.now()) {
  if (!scored || scored.score < SHARE_SCORE_THRESHOLDS.review) return null;
  const at = new Date(now).toISOString();
  const provinces = scored.provinces || [];
  const cities = scored.cities || [];
  const provinceLabel = provinces.join("、") || previous?.province || "";
  const sources = scored.sources?.length ? scored.sources : ["pull"];

  if (!previous) {
    return {
      status: "pending",
      score: scored.score,
      level: scored.level,
      factors: scored.factors,
      province: provinceLabel,
      provinces,
      cities,
      sources,
      firstAt: at,
      lastAt: at
    };
  }

  const knownProvinces = new Set(previous.provinces?.length ? previous.provinces : (previous.province ? previous.province.split("、").filter(Boolean) : []));
  const addedProvinces = provinces.filter(p => !knownProvinces.has(p));
  const mergedProvinces = [...knownProvinces, ...addedProvinces].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));

  const knownCities = new Set(previous.cities || []);
  const addedCities = cities.filter(c => !knownCities.has(c));
  const mergedCities = [...knownCities, ...addedCities].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));

  const knownSources = previous.sources || ["pull"];
  const mergedSources = ["pull", "presence"].filter(item => knownSources.includes(item) || sources.includes(item));

  if (previous.status === "pending") {
    const scoreChanged = scored.score !== (Number(previous.score) || 0);
    const factorsChanged = JSON.stringify(scored.factors || []) !== JSON.stringify(previous.factors || []);
    if (
      !addedProvinces.length
      && !addedCities.length
      && mergedSources.length === knownSources.length
      && !scoreChanged
      && !factorsChanged
      && now - new Date(previous.lastAt || 0).getTime() < REVIEW_TOUCH_MS
    ) {
      return null;
    }
    return {
      ...previous,
      score: scored.score,
      level: scored.level,
      factors: scored.factors,
      province: mergedProvinces.join("、") || provinceLabel,
      provinces: mergedProvinces,
      cities: mergedCities,
      sources: mergedSources,
      lastAt: at
    };
  }

  const prevScore = Number(previous.score) || 0;
  const prevRank = LEVEL_RANK[previous.level] || 0;
  const escalated = (LEVEL_RANK[scored.level] || 0) > prevRank;
  const jumped = scored.score - prevScore >= SHARE_ALERT_SCORE_BUMP;
  if (!addedProvinces.length && !addedCities.length && !escalated && !jumped) return null;

  return {
    status: "pending",
    score: scored.score,
    level: scored.level,
    factors: scored.factors,
    province: mergedProvinces.join("、") || provinceLabel,
    provinces: mergedProvinces,
    cities: mergedCities,
    sources,
    firstAt: at,
    lastAt: at,
    previousReview: {
      status: previous.status,
      reviewedAt: previous.reviewedAt || "",
      reviewedBy: previous.reviewedBy || "",
      note: previous.note || "",
      cities: previous.cities || [],
      provinces: [...knownProvinces],
      score: prevScore
    }
  };
}

module.exports = {
  SHARE_SCORE_THRESHOLDS,
  SHARE_ALERT_REPEAT_MS,
  SHARE_ALERT_SCORE_BUMP,
  PRESENCE_IP_RETENTION_DAYS,
  SOLO_LOOKBACK_DAYS,
  normalizeWhitelistEntry,
  ipMatchesWhitelist,
  addWhitelistEntry,
  removeWhitelistEntry,
  normProvince,
  areAdjacentProvinces,
  clientDeviceType,
  parseMobileFingerprint,
  distinctMobileFingerprints,
  isMonotonicMinorUpgradeOnly,
  twoDayProvinceRoundTrip,
  scoreLevel,
  scoreSubscriptionShare,
  shouldSendShareAlert,
  shareReviewRecord
};
