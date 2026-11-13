const assert = require("assert");
const {
  subscriptionClientIp,
  headersForAccessLog,
  subscriptionClientLabel,
  mainlandLocation,
  distinctCities,
  cityChanges,
  summarizeSubscriptionAccess,
  crossCityAlert,
  ipv4RedirectLocation,
  countedPulls,
  IPV4_REDIRECT_RESULT
} = require("./subscription-access");
const { parseRegion } = require("./ip-region");

// Client IP: Cloudflare's header wins; otherwise the last forwarded hop (earlier hops are client-supplied).
assert.deepStrictEqual(
  subscriptionClientIp({ headers: { "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1, 172.70.1.1" }, socket: { remoteAddress: "127.0.0.1" } }),
  { ip: "203.0.113.9", source: "cf-connecting-ip" }
);
assert.deepStrictEqual(
  subscriptionClientIp({ headers: { "x-forwarded-for": "6.6.6.6, 198.51.100.7" }, socket: { remoteAddress: "127.0.0.1" } }),
  { ip: "198.51.100.7", source: "x-forwarded-for" },
  "a forged first X-Forwarded-For hop is ignored"
);
assert.deepStrictEqual(subscriptionClientIp({ headers: { "cf-connecting-ip": "not-an-ip" }, socket: { remoteAddress: "::ffff:10.0.0.2" } }), { ip: "10.0.0.2", source: "socket" });

// IPv4 relay: X-Sub-Client-IP is taken only from a request that comes from the relay's own address.
const relayIps = ["191.223.40.89"];
assert.deepStrictEqual(
  subscriptionClientIp({ headers: { "cf-connecting-ip": "191.223.40.89", "x-sub-client-ip": "101.87.5.103" } }, { relayIps }),
  { ip: "101.87.5.103", source: "ipv4-relay" }
);
assert.deepStrictEqual(
  subscriptionClientIp({ headers: { "cf-connecting-ip": "203.0.113.9", "x-sub-client-ip": "101.87.5.103" } }, { relayIps }),
  { ip: "203.0.113.9", source: "cf-connecting-ip" },
  "anyone else setting X-Sub-Client-IP is ignored"
);
assert.deepStrictEqual(
  subscriptionClientIp({ headers: { "cf-connecting-ip": "191.223.40.89", "x-sub-client-ip": "bogus" } }, { relayIps }),
  { ip: "191.223.40.89", source: "cf-connecting-ip" }
);
assert.deepStrictEqual(
  subscriptionClientIp({ headers: { "cf-connecting-ip": "191.223.40.89", "x-sub-client-ip": "101.87.5.103" } }),
  { ip: "191.223.40.89", source: "cf-connecting-ip" },
  "no relay configured, no trust"
);

// IPv4 redirect: mainland IPv6 pulls go to the IPv4-only host on the same path and query.
const redirectBase = { baseUrl: "https://sub.webprovider.top/", path: "/sub/abc123?target=clash", ipSource: "cf-connecting-ip" };
const telecomBj = { country: "中国", province: "北京市", city: "北京市", isp: "电信" };
assert.strictEqual(ipv4RedirectLocation({ ...redirectBase, ip: "240e:b8f:3b5e:5801::1", region: telecomBj }), "https://sub.webprovider.top/sub/abc123?target=clash");
assert.strictEqual(ipv4RedirectLocation({ ...redirectBase, path: "/api/sub/abc123", ip: "2409:8963::1", region: { country: "中国", province: "广东省", city: "广州市" } }), "https://sub.webprovider.top/api/sub/abc123");
assert.strictEqual(ipv4RedirectLocation({ ...redirectBase, ip: "101.87.5.103", region: telecomBj }), "", "IPv4 is served here");
assert.strictEqual(ipv4RedirectLocation({ ...redirectBase, ip: "240e::1", ipSource: "ipv4-relay", region: telecomBj }), "", "never redirect a relayed pull");
assert.strictEqual(ipv4RedirectLocation({ ...redirectBase, ip: "2a02:6ea0::11", region: { country: "United States", province: "Florida", city: "Miami" } }), "", "abroad is served here");
assert.strictEqual(ipv4RedirectLocation({ ...redirectBase, ip: "2404:c800::1", region: { country: "中国", province: "香港特别行政区", city: "" } }), "", "Hong Kong is served here");
assert.strictEqual(ipv4RedirectLocation({ ...redirectBase, ip: "240e::1", region: null }), "", "unknown place is served here");
assert.strictEqual(ipv4RedirectLocation({ ...redirectBase, baseUrl: "", ip: "240e::1", region: telecomBj }), "", "off without a base URL");
assert.strictEqual(ipv4RedirectLocation({ ...redirectBase, path: "/account", ip: "240e::1", region: telecomBj }), "", "only subscription paths");

// The IPv6 half of a redirect doesn't count as a place.
const redirectRows = [
  { at: "2026-11-12T10:00:05.000Z", ip: "101.87.5.103", geoCountry: "中国", province: "上海市", city: "上海市", isp: "电信", result: "ok", userAgent: "clash-verge/v2" },
  { at: "2026-11-12T10:00:04.000Z", ip: "2409:8963::1", geoCountry: "中国", province: "广东省", city: "广州市", isp: "移动", result: IPV4_REDIRECT_RESULT, userAgent: "clash-verge/v2" }
];
assert.strictEqual(countedPulls(redirectRows).length, 1);
const redirectSummary = summarizeSubscriptionAccess(redirectRows, { now: Date.parse("2026-11-12T12:00:00Z") });
assert.deepStrictEqual(redirectSummary.windows.all.cities, ["上海市"]);
assert.strictEqual(redirectSummary.ipv4Redirects, 1);
assert.strictEqual(redirectSummary.ips.length, 2, "the redirected IPv6 is still listed");

// Headers: credentials redacted, long values capped, the rest kept as-is.
const logged = headersForAccessLog({ "user-agent": "clash-verge/v2.0", cookie: "session=abc", authorization: "Bearer x", "x-long": "a".repeat(600) });
assert.strictEqual(logged["user-agent"], "clash-verge/v2.0");
assert.strictEqual(logged.cookie, "[redacted]");
assert.strictEqual(logged.authorization, "[redacted]");
assert.strictEqual(logged["x-long"].length, 513);

// Client labels.
assert.strictEqual(subscriptionClientLabel("clash-verge/v2.2.3"), "Clash Verge");
assert.strictEqual(subscriptionClientLabel("ClashMetaForAndroid/2.11.2.Meta"), "Clash Meta for Android");
assert.strictEqual(subscriptionClientLabel("mihomo/1.18.10"), "Mihomo");
assert.strictEqual(subscriptionClientLabel("Shadowrocket/2070 CFNetwork/1498 Darwin/23.6.0"), "Shadowrocket");
assert.strictEqual(subscriptionClientLabel("SFA/1.10.1 (Android 14; sing-box 1.10.1)"), "sing-box");
assert.strictEqual(subscriptionClientLabel("Mozilla/5.0 (Windows NT 10.0) Chrome/130"), "浏览器");
assert.strictEqual(subscriptionClientLabel(""), "未知");
assert.strictEqual(subscriptionClientLabel("Transfer"), "Transfer", "unknown apps keep their product token");

// ip2region region strings, current and legacy layouts.
assert.deepStrictEqual(parseRegion("中国|广东省|深圳市|电信|CN"), { country: "中国", province: "广东省", city: "深圳市", isp: "电信", countryCode: "CN" });
assert.deepStrictEqual(parseRegion("中国|0|浙江省|杭州市|移动"), { country: "中国", province: "浙江省", city: "杭州市", isp: "移动", countryCode: "CN" });
assert.deepStrictEqual(parseRegion("中国|江苏省|南京市|0|CN"), { country: "中国", province: "江苏省", city: "南京市", isp: "", countryCode: "CN" });
assert.strictEqual(parseRegion(""), null);

// Mainland only: Hong Kong, Macau, Taiwan and abroad don't count.
assert.deepStrictEqual(mainlandLocation({ geoCountry: "中国", province: "广东省", city: "深圳市" }), { province: "广东省", city: "深圳市" });
assert.strictEqual(mainlandLocation({ geoCountry: "中国", province: "香港特别行政区", city: "" }), null);
assert.strictEqual(mainlandLocation({ geoCountry: "中国", province: "台湾省", city: "" }), null);
assert.strictEqual(mainlandLocation({ geoCountry: "United States", province: "California", city: "Los Angeles" }), null);

// Telecom / Unicom IPv6 located at Beijing is only the carrier's registration and doesn't count;
// the same in IPv4, or China Mobile IPv6, is a real place.
const bjV6 = { geoCountry: "中国", province: "北京市", city: "北京市" };
assert.strictEqual(mainlandLocation({ ...bjV6, ip: "240e:b8f:3b5e:5801::1", isp: "电信" }), null);
assert.strictEqual(mainlandLocation({ ...bjV6, ip: "2408:840d:8f50:86e3::1", isp: "联通" }), null);
assert.strictEqual(mainlandLocation({ ...bjV6, ip: "2408:840d:8f50:86e3::2", isp: "" }), null);
assert.deepStrictEqual(mainlandLocation({ ...bjV6, ip: "2409:8a00:3291:6cc0::1", isp: "移动" }), { province: "北京市", city: "北京市" });
assert.deepStrictEqual(mainlandLocation({ ...bjV6, ip: "114.246.238.59", isp: "联通" }), { province: "北京市", city: "北京市" });
assert.deepStrictEqual(mainlandLocation({ geoCountry: "中国", province: "山东省", city: "威海市", ip: "2408:8214:d1d:3de0::1", isp: "联通" }), { province: "山东省", city: "威海市" });
const dualStack = [
  { at: "2026-11-12T11:00:00.000Z", ip: "101.87.5.103", geoCountry: "中国", province: "上海市", city: "上海市", isp: "电信", userAgent: "clash-verge/v2" },
  { at: "2026-11-12T10:00:00.000Z", ip: "240e:b8f:3b5e:5801::1", ...bjV6, isp: "电信", userAgent: "clash-verge/v2" },
  { at: "2026-11-12T09:00:00.000Z", ip: "101.87.5.103", geoCountry: "中国", province: "上海市", city: "上海市", isp: "电信", userAgent: "clash-verge/v2" }
];
const dualSummary = summarizeSubscriptionAccess(dualStack, { now: Date.parse("2026-11-12T12:00:00Z") });
assert.strictEqual(dualSummary.suspicious, false, "a dual-stack Shanghai user is one city");
assert.deepStrictEqual(dualSummary.cityChanges, []);
assert.strictEqual(crossCityAlert(dualStack, null, Date.parse("2026-11-12T12:00:00Z")).send, false);

// Cities: a province-only pull counts only when no known city lies in that province.
const sz = { geoCountry: "中国", province: "广东省", city: "深圳市" };
const gd = { geoCountry: "中国", province: "广东省", city: "" };
const hz = { geoCountry: "中国", province: "浙江省", city: "杭州市" };
const sc = { geoCountry: "中国", province: "四川省", city: "" };
assert.deepStrictEqual(distinctCities([sz, gd]), ["深圳市"]);
assert.deepStrictEqual(distinctCities([sz, hz, gd, sc]), ["杭州市", "深圳市", "四川省（城市未知）"]);
assert.deepStrictEqual(distinctCities([sz, { geoCountry: "中国", province: "香港特别行政区", city: "" }]), ["深圳市"]);

// Summary: node IPs listed but not counted; two mainland cities are suspicious.
const now = Date.parse("2026-11-12T12:00:00Z");
const at = hoursAgo => new Date(now - hoursAgo * 3600000).toISOString();
const rows = [
  { at: at(1), ip: "113.108.0.1", ...sz, isp: "电信", userAgent: "clash-verge/v2" },
  { at: at(1.2), ip: "117.136.0.1", geoCountry: "中国", province: "北京市", city: "北京市", isp: "移动", userAgent: "Shadowrocket/2070" },
  { at: at(3), ip: "113.108.0.2", ...sz, isp: "电信", userAgent: "clash-verge/v2" },
  { at: at(5), ip: "141.11.77.154", geoCountry: "Bulgaria", province: "Sofia-Capital", city: "", userAgent: "clash-verge/v2" },
  { at: at(6), ip: "202.181.0.1", geoCountry: "中国", province: "香港特别行政区", city: "", userAgent: "mihomo/1.18" },
  { at: at(100), ip: "112.10.45.3", ...hz, isp: "移动", userAgent: "v2rayN/6.0" }
];
const summary = summarizeSubscriptionAccess(rows, { now, nodeIps: new Set(["141.11.77.154"]) });
assert.strictEqual(summary.suspicious, true);
assert.strictEqual(summary.viaNodeRequests, 1);
assert.deepStrictEqual(summary.windows["24h"].cities, ["北京市", "深圳市"]);
assert.deepStrictEqual(summary.windows.all.cities, ["北京市", "杭州市", "深圳市"]);
assert.deepStrictEqual(summary.hints, ["24 小时内从 2 个城市拉取：北京市、深圳市", "所选范围内从 3 个城市拉取：北京市、杭州市、深圳市"]);
assert.strictEqual(summary.ips.length, 6);
assert.strictEqual(summary.ips.find(entry => entry.ip === "141.11.77.154").viaNode, true);

// City changes, newest first, with the gap in minutes.
assert.deepStrictEqual(summary.cityChanges.map(change => [change.from, change.to, change.minutes]), [
  ["北京市", "深圳市", 12],
  ["深圳市", "北京市", 108],
  ["杭州市", "深圳市", 5820]
]);
assert.deepStrictEqual(cityChanges([sz, gd, sz].map((row, index) => ({ ...row, at: at(3 - index), ip: "x" }))), [], "province-only pulls inside the same province are not a change");

const oneCity = summarizeSubscriptionAccess(rows.filter(row => row.city === "深圳市"), { now });
assert.strictEqual(oneCity.suspicious, false);
assert.deepStrictEqual(oneCity.hints, []);
assert.strictEqual(summarizeSubscriptionAccess([], { now }).windows.all.requests, 0);

// Alerts: two cities alert; repeated only after 24 hours or when a new city appears.
assert.deepStrictEqual(crossCityAlert([sz, sz], null, now), { send: false, cities: ["深圳市"] });
assert.deepStrictEqual(crossCityAlert([sz, hz], null, now), { send: true, cities: ["杭州市", "深圳市"] });
assert.strictEqual(crossCityAlert([sz, hz], { at: at(2), cities: ["杭州市", "深圳市"] }, now).send, false, "same cities within 24 hours stay quiet");
assert.strictEqual(crossCityAlert([sz, hz], { at: at(25), cities: ["杭州市", "深圳市"] }, now).send, true, "the same cities alert again after 24 hours");
assert.strictEqual(crossCityAlert([sz, hz, sc], { at: at(2), cities: ["杭州市", "深圳市"] }, now).send, true, "a new city alerts at once");

console.log("subscription access tests passed");
