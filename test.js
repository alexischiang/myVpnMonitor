const assert = require("assert");
const zlib = require("zlib");
const {
  parseSubscriptionUserInfo,
  parseBodyHints,
  parseAccountUnavailable,
  calculateExpiry,
  calculateGiftExpiry,
  extractClashConfigBody,
  statusFor,
  toBytes,
  remainingPlanCashValue,
  paymentQuote,
  paymentChannelCode,
  configuredPaymentChannel,
  paymentMethodForPlatform,
  paymentSignContent,
  paymentSign,
  verifyPaymentSign,
  paymentConfigReady,
  paymentStatusError,
  paymentAmountError,
  paymentOrderExpiresAt,
  isPaymentOrderExpired,
  normalizeSalesSettings,
  normalizePaymentSettings,
  sendJson,
  batchItems,
  classifyCurrentPoolFit,
  restoreUpstreamClashConfig,
  injectPlaceholderNodes,
  postSubconverter,
  normalizeSubscription,
  clearSubscriptionSourceState
} = require("./server");

assert.strictEqual(classifyCurrentPoolFit({ expiryDiffDays: 20 }).status, "high");
assert.strictEqual(classifyCurrentPoolFit({ expiryDiffDays: 21 }).status, "adjust");
assert.strictEqual(classifyCurrentPoolFit({ expiryDiffDays: -21 }).status, "incompatible");
assert.match(classifyCurrentPoolFit({ expiryDiffDays: -21 }).reasons[0], /21 天/);

const compressedResponse = {
  req: { headers: { "accept-encoding": "gzip, deflate" } },
  writeHead(status, headers) { this.status = status; this.headers = headers; },
  end(body) { this.body = body; }
};
sendJson(compressedResponse, 200, { data: "x".repeat(2000) });
assert.strictEqual(compressedResponse.headers["content-encoding"], "gzip");
assert.strictEqual(JSON.parse(zlib.gunzipSync(compressedResponse.body)).data.length, 2000);
assert.deepStrictEqual(batchItems([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);

const legacyCashValueUser = {
  id: "legacy-user",
  purchasedAt: "2026-06-29T00:00:00.000Z",
  expiresAt: "2027-06-24T00:00:00.000Z",
  actualPaid: 1198
};
const legacyCashValueBills = [
  { userId: "legacy-user", type: "initial", amount: 599, occurredAt: "2025-06-01T00:00:00.000Z", afterExpiresAt: "2026-05-26T16:00:00.000Z" },
  { userId: "legacy-user", type: "renewal", amount: 599, occurredAt: "2026-06-29T00:00:00.000Z", afterExpiresAt: "2027-06-24T00:00:00.000Z" }
];
assert.strictEqual(remainingPlanCashValue(legacyCashValueUser, new Date("2026-07-29T00:00:00.000Z"), legacyCashValueBills), 549.08);
const outOfOrderBills = [
  { userId: "legacy-user", type: "renewal", amount: 40.17, occurredAt: "2026-07-20T09:21:15.184Z", createdAt: "2026-07-20T09:43:11.162Z", afterExpiresAt: "2026-09-18T09:25:23.894Z" },
  { userId: "legacy-user", type: "renewal", amount: 40.17, occurredAt: "2026-07-20T09:25:23.894Z", createdAt: "2026-07-20T09:42:46.861Z", afterExpiresAt: "2026-08-19T09:25:23.894Z" }
];
assert.strictEqual(remainingPlanCashValue({ ...legacyCashValueUser, expiresAt: "2026-09-18T09:25:23.894Z" }, new Date("2026-07-20T09:25:23.894Z"), outOfOrderBills), 80.34);
assert.strictEqual(remainingPlanCashValue({ ...legacyCashValueUser, expiresAt: "2026-08-19T09:25:23.894Z" }, new Date("2026-07-20T09:25:23.894Z"), [{ ...outOfOrderBills[0], reversedAt: "2026-07-21T00:00:00.000Z" }, outOfOrderBills[1]]), 40.17);

const manualYamlSubscription = normalizeSubscription({
  sourceType: "yaml",
  manualContent: "mixed-port: 7890\nproxies:\n  - { name: node, type: ss, server: example.com, port: 443, cipher: aes-128-gcm, password: secret }\n",
  expiresAt: "2027-12-31",
  email: "yaml@example.com",
  maxUsers: 15
});
assert.strictEqual(manualYamlSubscription.sourceType, "yaml");
assert.match(manualYamlSubscription.manualContent, /^mixed-port: 7890/);
assert.strictEqual(manualYamlSubscription.metrics.expireAt, "2027-12-31T23:59:59.999Z");
const changedManualSubscription = { ...manualYamlSubscription, metrics: { ...manualYamlSubscription.metrics, remainingBytes: 100 }, cachedConfig: {}, lastError: "old" };
clearSubscriptionSourceState(changedManualSubscription);
assert.deepStrictEqual(changedManualSubscription.metrics, { expireAt: "2027-12-31T23:59:59.999Z" });
assert.strictEqual(changedManualSubscription.cachedConfig, null);
assert.strictEqual(changedManualSubscription.lastError, null);
assert.throws(() => normalizeSubscription({
  sourceType: "yaml",
  manualContent: manualYamlSubscription.manualContent,
  email: "yaml@example.com",
  maxUsers: 15
}), /到期日/);
assert.throws(() => normalizeSubscription({
  sourceType: "yaml",
  manualContent: "rules:\n  - MATCH,DIRECT\n",
  expiresAt: "2027-12-31",
  email: "yaml@example.com",
  maxUsers: 15
}), /proxies/);

function near(actual, expected, tolerance = 2) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} bytes of ${expected}`
  );
}

const headerMetrics = parseSubscriptionUserInfo(
  "upload=1073741824; download=2147483648; total=10737418240; expire=1893456000"
);
assert.strictEqual(headerMetrics.uploadBytes, toBytes(1, "gb"));
assert.strictEqual(headerMetrics.downloadBytes, toBytes(2, "gb"));
assert.strictEqual(headerMetrics.usedBytes, toBytes(3, "gb"));
assert.strictEqual(headerMetrics.totalBytes, toBytes(10, "gb"));
assert.strictEqual(headerMetrics.expireAt, "2030-01-01T00:00:00.000Z");

const statusMetrics = parseBodyHints(
  "STATUS=🚀↑:0.03GB,↓:0.69GB,TOT:500GB💡Expires:2026-11-20"
);
assert.strictEqual(statusMetrics.source, "status-field");
assert.strictEqual(statusMetrics.uploadBytes, toBytes(0.03, "gb"));
assert.strictEqual(statusMetrics.downloadBytes, toBytes(0.69, "gb"));
near(statusMetrics.usedBytes, toBytes(0.72, "gb"));
assert.strictEqual(statusMetrics.totalBytes, toBytes(500, "gb"));
near(statusMetrics.remainingBytes, toBytes(499.28, "gb"));
assert.strictEqual(statusMetrics.expireAt, "2026-11-20T00:00:00.000Z");

assert.strictEqual(parseBodyHints("剩余流量 100GB 到期 2030-01-01"), null);
const unavailableMetrics = parseAccountUnavailable('{"message":"Account unavailable"}');
assert.strictEqual(unavailableMetrics.unavailable, true);
assert.strictEqual(unavailableMetrics.source, "account-unavailable");
assert.strictEqual(statusFor({ metrics: statusMetrics, lastError: null }), "ok");
assert.strictEqual(statusFor({ metrics: null, lastError: "请求失败" }), "invalid");
assert.strictEqual(statusFor({ metrics: null, lastError: null }), "unknown");
assert.strictEqual(statusFor({ metrics: unavailableMetrics, lastError: null }), "invalid");
assert.strictEqual(statusFor({ metrics: { remainingBytes: 100, expireAt: "2020-01-01T00:00:00.000Z" }, lastError: null }), "expired");
assert.strictEqual(statusFor({ sourceType: "yaml", manualContent: "proxies: []", manualTrafficDepleted: true, metrics: { expireAt: "2099-01-01T00:00:00.000Z" } }), "depleted");
assert.strictEqual(statusFor({ metrics: { remainingBytes: toBytes(49, "gb"), expireAt: "2030-01-01T00:00:00.000Z" }, lastError: null }), "ok");
assert.strictEqual(statusFor({ metrics: { remainingBytes: toBytes(50, "gb"), expireAt: "2030-01-01T00:00:00.000Z" }, lastError: null }), "ok");
assert.strictEqual(statusFor({ metrics: { remainingBytes: toBytes(100, "gb"), expireAt: new Date(Date.now() + 2 * 86400000).toISOString() }, lastError: null }), "expiring");
assert.strictEqual(statusFor({ metrics: { remainingBytes: toBytes(100, "gb"), expireAt: "2030-01-01T00:00:00.000Z" }, lastError: null }, 8), "ok");
assert.strictEqual(calculateExpiry("2026-06-02T00:00:00.000Z", "monthly").slice(0, 10), "2026-07-02");
assert.strictEqual(calculateExpiry("2026-07-02T00:00:00.000Z", "monthly").slice(0, 10), "2026-08-01");
assert.strictEqual(calculateExpiry("2026-05-28T12:00:00.000Z", "quarterly").slice(0, 10), "2026-08-26");
assert.strictEqual(calculateExpiry("2026-05-28T12:00:00.000Z", "half_yearly").slice(0, 10), "2026-11-24");
assert.strictEqual(calculateGiftExpiry({ expiresAt: "2026-07-20T00:00:00.000Z" }, 10, new Date("2026-07-15T00:00:00.000Z")).slice(0, 10), "2026-07-30");
assert.strictEqual(calculateGiftExpiry({ expiresAt: "2026-07-10T00:00:00.000Z" }, 10, new Date("2026-07-15T00:00:00.000Z")).slice(0, 10), "2026-07-25");
assert.strictEqual(calculateGiftExpiry({}, 0, new Date("2026-07-15T00:00:00.000Z")), null);
assert.strictEqual(calculateExpiry("2026-05-28T12:00:00.000Z", "yearly").slice(0, 10), "2027-05-23");
const discountedQuote = paymentQuote("basic-30", "save10", "SAVE10:10");
assert.strictEqual(discountedQuote.originalAmount, 39);
assert.strictEqual(discountedQuote.discountAmount, 3.9);
assert.strictEqual(discountedQuote.subtotal, 35.1);
assert.strictEqual(discountedQuote.taxAmount, 1.05);
assert.strictEqual(discountedQuote.amount, 36.15);
assert.deepStrictEqual(discountedQuote.cycles.map(cycle => cycle.devices), [1, 2, 3, 3]);
assert.throws(() => paymentQuote("basic-30", "invalid", "SAVE10:10"), /优惠码无效/);
assert.strictEqual(paymentChannelCode("100"), "100");
assert.strictEqual(paymentChannelCode("200"), "200");
assert.strictEqual(paymentChannelCode("custom-channel"), "custom-channel");
assert.throws(() => paymentChannelCode("bad channel"), /不能包含空格/);
assert.strictEqual(configuredPaymentChannel({ alipayChannelCode: "ali-code", wechatChannelCode: "wx-code" }, "100"), "ali-code");
assert.strictEqual(configuredPaymentChannel({ alipayChannelCode: "ali-code", wechatChannelCode: "wx-code" }, "200"), "wx-code");
assert.strictEqual(paymentMethodForPlatform({ enabled: true, merchantId: "merchant", merchantSecret: "secret", alipayChannelCode: "ali-code", wechatChannelCode: "wx-code", alipayEnabled: false, wechatEnabled: true }), "200");
assert.throws(() => configuredPaymentChannel({ alipayChannelCode: "ali-code", wechatChannelCode: "wx-code", alipayEnabled: false }, "100"), /支付宝支付维护中/);
assert.throws(() => configuredPaymentChannel({ alipayChannelCode: "ali-code", wechatChannelCode: "wx-code", wechatEnabled: false }, "200"), /微信支付维护中/);
assert.strictEqual(paymentStatusError("failed"), "支付平台返回支付失败。");
assert.strictEqual(paymentStatusError("paid"), "");
assert.strictEqual(paymentAmountError(10, "10.00"), "");
assert.match(paymentAmountError(10, "9.99"), /应付 ¥10.00.*¥9.99/);
assert.match(paymentAmountError(10, undefined), /无效金额/);
const expiringOrder = { createdAt: "2026-07-12T00:00:00.000Z" };
assert.strictEqual(paymentOrderExpiresAt(expiringOrder), "2026-07-12T00:15:00.000Z");
assert.strictEqual(isPaymentOrderExpired(expiringOrder, Date.parse("2026-07-12T00:14:59.999Z")), false);
assert.strictEqual(isPaymentOrderExpired(expiringOrder, Date.parse("2026-07-12T00:15:00.000Z")), true);
const announcementSettings = normalizeSalesSettings({ announcements: [{ title: "维护通知", content: "今晚升级", publishedAt: "2026-07-14T12:00:00.000Z", enabled: true }] });
assert.deepStrictEqual(announcementSettings.announcements[0], { id: announcementSettings.announcements[0].id, title: "维护通知", content: "今晚升级", publishedAt: "2026-07-14T12:00:00.000Z", enabled: true });
assert.throws(() => normalizeSalesSettings({ announcements: [{ title: "", content: "内容" }] }), /不能为空/);
const normalizedPaymentSettings = normalizePaymentSettings({
  name: "旧支付平台",
  provider: "legacy",
  apiBaseUrl: "https://pay.example.com/",
  merchantId: "merchant-1",
  merchantSecret: "",
  alipayChannelCode: "custom-alipay",
  wechatChannelCode: "custom-wechat",
  alipayEnabled: false,
  wechatEnabled: true,
  notifyUrl: "https://example.com/api/payments/callback",
  returnUrl: "https://example.com/account/payment/result"
}, { merchantSecret: "existing-secret" });
assert.strictEqual(normalizedPaymentSettings.apiBaseUrl, "https://pay.example.com");
assert.strictEqual(normalizedPaymentSettings.displayName, normalizedPaymentSettings.name);
assert.strictEqual(normalizedPaymentSettings.merchantSecret, "existing-secret");
assert.strictEqual(normalizedPaymentSettings.wechatChannelCode, "custom-wechat");
assert.strictEqual(normalizedPaymentSettings.alipayEnabled, false);
assert.throws(() => normalizePaymentSettings({ name: "测试", merchantId: "merchant-1", merchantSecret: "secret", alipayChannelCode: "100", wechatChannelCode: "200", apiBaseUrl: "not-a-url" }), /HTTP 或 HTTPS/);
const xinhui = normalizePaymentSettings({
  name: "新汇",
  provider: "xinhui",
  apiBaseUrl: "https://api.shrtxs.cn/",
  merchantId: "1001",
  merchantSecret: "secret",
  alipayChannelCode: "alipay",
  wechatChannelCode: "wxpay",
  alipayEnabled: true,
  wechatEnabled: true
});
const signedPayload = { pid: "1001", money: "1.00", sign_type: "MD5" };
signedPayload.sign = paymentSign(signedPayload, xinhui);
assert.strictEqual(paymentSignContent(signedPayload), "money=1.00&pid=1001");
assert.strictEqual(signedPayload.sign, "db2367d18af244cca18fd9ca6ad7b6e1");
assert.strictEqual(verifyPaymentSign(signedPayload, xinhui), true);
assert.strictEqual(verifyPaymentSign({ ...signedPayload, money: "2.00" }, xinhui), false);
assert.strictEqual(paymentConfigReady(xinhui, "100"), true);
assert.strictEqual(configuredPaymentChannel({ ...xinhui, alipayChannelCode: "custom-alipay" }, "100"), "custom-alipay");
assert.throws(() => normalizePaymentSettings({ ...xinhui, wechatChannelCode: "" }), /通道码/);

const extracted = extractClashConfigBody("prefix\nmixed-port: 7890\nproxies:\n  - name: node\nrules:\n  - MATCH,PROXY\nextra:\n  value: ignored\n");
assert.ok(extracted.startsWith("mixed-port: 7890"));
assert.ok(extracted.includes("proxies:\n  - name: node"));
assert.ok(extracted.includes("rules:\n  - MATCH,PROXY"));
assert.ok(!extracted.includes("extra:"));
assert.strictEqual(extractClashConfigBody("<!doctype html><html><title>403</title></html>"), "");

const restoredConfig = require("js-yaml").load(restoreUpstreamClashConfig(
  Buffer.from(`port: 7890
proxies:
  - { name: shared, type: trojan, skip-cert-verify: false, tfo: false }
  - { name: notice, type: ss }
proxy-groups:
  - { name: Converted, type: select, proxies: [shared] }
rules: ["MATCH,Converted"]
`),
  Buffer.from(`mixed-port: 7890
sniffer: { enable: true }
dns: { enable: true }
proxies:
  - { name: shared, type: trojan, skip-cert-verify: true, client-fingerprint: chrome }
  - { name: missing, type: anytls, min-idle-session: 0 }
proxy-groups:
  - { name: Upstream, type: select, proxies: [shared, missing] }
rules: ["MATCH,Upstream"]
`)
).toString("utf8"));
assert.strictEqual(restoredConfig.proxies.find(item => item.name === "shared")["skip-cert-verify"], true);
assert.strictEqual(restoredConfig.proxies.find(item => item.name === "shared")["client-fingerprint"], "chrome");
assert.ok(restoredConfig.proxies.some(item => item.name === "missing"));
assert.ok(!restoredConfig.proxies.some(item => item.name === "notice"));
assert.deepStrictEqual(restoredConfig.rules, ["MATCH,Converted"]);
assert.strictEqual(restoredConfig["proxy-groups"][0].name, "Converted");
assert.strictEqual(restoredConfig.dns.enable, true);
assert.strictEqual(restoredConfig.sniffer.enable, true);
assert.ok(!("port" in restoredConfig));

const filteredConfig = require("js-yaml").load(restoreUpstreamClashConfig(
  Buffer.from(`port: 7890
external-controller: 127.0.0.1:9090
Proxy:
  - { name: renamed, type: trojan, server: example.com, port: 443, password: secret, skip-cert-verify: false }
Proxy Group:
  - { name: Filtered, type: select, proxies: [renamed] }
Rule: ["MATCH,Filtered"]
`),
  Buffer.from(`dns: { enable: true }
proxies:
  - { name: shared, type: trojan, server: example.com, port: 443, password: secret, skip-cert-verify: true }
  - { name: excluded, type: anytls }
proxy-groups:
  - { name: Upstream, type: select, proxies: [shared, excluded] }
rules: ["MATCH,Upstream"]
`),
  { exclude: "excluded" }
).toString("utf8"));
assert.deepStrictEqual(filteredConfig.proxies.map(item => item.name), ["shared"]);
assert.strictEqual(filteredConfig.proxies[0]["skip-cert-verify"], true);
assert.strictEqual(filteredConfig["proxy-groups"][0].name, "Filtered");
assert.deepStrictEqual(filteredConfig["proxy-groups"][0].proxies, ["shared"]);
assert.deepStrictEqual(filteredConfig.rules, ["MATCH,Filtered"]);
assert.strictEqual(filteredConfig.dns.enable, true);
assert.ok(!("port" in filteredConfig));
assert.ok(!("external-controller" in filteredConfig));

const pinnedGroups = require("js-yaml").load(injectPlaceholderNodes(Buffer.from(`proxies:
  - { name: node, type: ss, server: example.com, port: 443, cipher: aes-128-gcm, password: secret }
proxy-groups:
  - { name: 🎯 全球直连, type: select, proxies: [node, DIRECT] }
  - { name: 🛑 全球拦截, type: select, proxies: [node, REJECT] }
  - { name: 🚀 节点选择, type: select, proxies: [node] }
rules: ["MATCH,🚀 节点选择"]
`), { showUserInfo: false }, [{ tag: "default", nodes: ["notice"] }]).toString("utf8"));
assert.deepStrictEqual(pinnedGroups["proxy-groups"][0].proxies, ["DIRECT"]);
assert.deepStrictEqual(pinnedGroups["proxy-groups"][1].proxies, ["REJECT"]);
assert.deepStrictEqual(pinnedGroups["proxy-groups"][2].proxies, ["notice", "node"]);

const pinnedWithoutPlaceholders = require("js-yaml").load(injectPlaceholderNodes(Buffer.from(`proxies:
  - { name: node, type: ss, server: example.com, port: 443, cipher: aes-128-gcm, password: secret }
proxy-groups:
  - { name: 全球直连, type: select, proxies: [node, DIRECT] }
  - { name: 全球拦截, type: select, proxies: [node, REJECT] }
`), { useDefaultPlaceholder: false, showUserInfo: false }, []).toString("utf8"));
assert.deepStrictEqual(pinnedWithoutPlaceholders["proxy-groups"][0].proxies, ["DIRECT"]);
assert.deepStrictEqual(pinnedWithoutPlaceholders["proxy-groups"][1].proxies, ["REJECT"]);
assert.throws(() => postSubconverter(
  Buffer.from("proxies: []\n"),
  Buffer.from("proxies:\n  - { name: node, type: ss }\n"),
  { useDefaultPlaceholder: false, showUserInfo: false },
  { exclude: ".*" }
), /removed every upstream node/);
const nativeSubconverterOutput = Buffer.from("proxies: []\n");
assert.strictEqual(postSubconverter(
  nativeSubconverterOutput,
  Buffer.from("not valid yaml: ["),
  {},
  { postSubconverter: false }
), nativeSubconverterOutput);

const nextinCompatibleConfig = require("js-yaml").load(postSubconverter(
  Buffer.from(`global-client-fingerprint: chrome
proxies:
  - { name: node, type: vless, server: example.com, port: 443, client-fingerprint: chrome }
proxy-groups:
  - { name: PROXY, type: select, proxies: [node] }
rules: ["MATCH,PROXY"]
`),
  Buffer.from(`global-client-fingerprint: chrome
proxies:
  - { name: node, type: vless, server: example.com, port: 443, client-fingerprint: chrome }
proxy-groups:
  - { name: PROXY, type: select, proxies: [node] }
rules: ["MATCH,PROXY"]
`),
  { useDefaultPlaceholder: false, showUserInfo: false },
  { nextinCompatible: true }
).toString("utf8"));
assert.ok(!("global-client-fingerprint" in nextinCompatibleConfig));
assert.strictEqual(nextinCompatibleConfig.proxies[0]["client-fingerprint"], "chrome");

console.log("All checks passed.");
