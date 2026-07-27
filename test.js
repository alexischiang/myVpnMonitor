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
  paymentQuote,
  paymentChannelCode,
  configuredPaymentChannel,
  paymentStatusError,
  paymentAmountError,
  paymentOrderExpiresAt,
  isPaymentOrderExpired,
  normalizeSalesSettings,
  normalizePaymentSettings,
  sendJson,
  batchItems
} = require("./server");

const compressedResponse = {
  req: { headers: { "accept-encoding": "gzip, deflate" } },
  writeHead(status, headers) { this.status = status; this.headers = headers; },
  end(body) { this.body = body; }
};
sendJson(compressedResponse, 200, { data: "x".repeat(2000) });
assert.strictEqual(compressedResponse.headers["content-encoding"], "gzip");
assert.strictEqual(JSON.parse(zlib.gunzipSync(compressedResponse.body)).data.length, 2000);
assert.deepStrictEqual(batchItems([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);

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
assert.strictEqual(statusFor({ metrics: unavailableMetrics, lastError: null }), "invalid");
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
assert.strictEqual(normalizedPaymentSettings.merchantSecret, "existing-secret");
assert.strictEqual(normalizedPaymentSettings.wechatChannelCode, "custom-wechat");
assert.strictEqual(normalizedPaymentSettings.alipayEnabled, false);
assert.throws(() => normalizePaymentSettings({ merchantId: "merchant-1", alipayChannelCode: "100", wechatChannelCode: "200", apiBaseUrl: "not-a-url" }), /HTTP 或 HTTPS/);

const extracted = extractClashConfigBody("prefix\nmixed-port: 7890\nproxies:\n  - name: node\nrules:\n  - MATCH,PROXY\nextra:\n  value: ignored\n");
assert.ok(extracted.startsWith("mixed-port: 7890"));
assert.ok(extracted.includes("proxies:\n  - name: node"));
assert.ok(extracted.includes("rules:\n  - MATCH,PROXY"));
assert.ok(!extracted.includes("extra:"));
assert.strictEqual(extractClashConfigBody("<!doctype html><html><title>403</title></html>"), "");

console.log("All checks passed.");
