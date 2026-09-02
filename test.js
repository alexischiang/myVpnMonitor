const assert = require("assert");
const { salesAmount, salesDateKey, salesDateRange, salesMonthRange, unlinkedSalesBills } = require("./src/components/features/sales-analytics-logic.ts");
const net = require("net");
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
  inferUserProductBinding,
  recurringPlanOption,
  resolvePlanChangeOption,
  planTrafficBytes,
  planChangeState,
  restorePlanChangeState,
  bindUserProduct,
  grantTrafficPack,
  paymentQuote,
  planQuoteWithAddOns,
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
  publicInviterLabel,
  adminReferralDetails,
  sendJson,
  batchItems,
  classifyCurrentPoolFit,
  restoreUpstreamClashConfig,
  injectPlaceholderNodes,
  postSubconverter,
  normalizeSubscription,
  normalizeXuiClientResult,
  normalizeXuiConnectedIps,
  normalizeXuiMonitor,
  normalizeXuiInbounds,
  normalizeXuiInboundGroups,
  normalizeXuiInboundIdList,
  effectiveXuiInboundIds,
  normalizeXuiInboundMetadata,
  normalizeXuiInboundEnable,
  xuiActiveInboundKeys,
  probeTcpEndpoint,
  summarizeXuiInboundProbes,
  normalizeXuiPresence,
  xuiTrafficByUser,
  xuiDailyNodeTraffic,
  appendXuiDailyTrafficHistory,
  xuiUserDailyTraffic,
  calculateXuiBillingLedger,
  createXuiBillingBaseline,
  pendingXuiTrafficAlert,
  xuiClientCycleKey,
  xuiBillingPayload,
  xuiMonthlyResetAt,
  legacyMigrationTrafficLimitBytes,
  withXuiUserMigrationLock,
  xuiNodeBaseUrl,
  sealXuiNodeToken,
  openXuiNodeToken,
  xuiClientWritePayload,
  xuiTrafficPayload,
  markMissingXuiClients,
  disabledAccountPlaceholderSubscription,
  clearSubscriptionSourceState,
  ticketTelegramText
} = require("./server");

const gib = 1024 ** 3;
assert.strictEqual(salesAmount({ realCashAmount: 40, totalAmount: 50, amount: 30 }), 40);
assert.notStrictEqual(salesDateKey(new Date(2025, 6, 1), true), salesDateKey(new Date(2026, 6, 1), true));
const ticketAlert = ticketTelegramText({ id: "T1", email: "user@example.com", subject: "连接问题", messages: [{ message: "首次描述" }, { message: "最新追问" }] }, "https://example.com/tickets/T1");
assert(ticketAlert.includes("正文：\n最新追问"));
assert(!ticketAlert.includes("首次描述"));
assert(Array.from(ticketTelegramText({ id: "T1", email: "user@example.com", subject: "连接问题", messages: [{ message: "😀".repeat(5000) }] }, "https://example.com/tickets/T1")).length <= 4096);
assert.deepStrictEqual(salesMonthRange(2, 2024), { from: new Date(2024, 1, 1), to: new Date(2024, 1, 29) });
assert.deepStrictEqual(unlinkedSalesBills(
  [{ userId: "paid", amount: 40, paidAt: "2026-08-01T00:00:00.000Z", status: "paid" }],
  [
    { id: "linked", paymentOrderId: "order", amount: 40, occurredAt: "2026-08-01T00:00:00.000Z" },
    { id: "legacy", userId: "paid", amount: 40, occurredAt: "2026-08-01T00:00:00.000Z" },
    { id: "manual", userId: "manual", amount: 50, occurredAt: "2026-08-02T00:00:00.000Z" },
  ]
), [{ id: "manual", userId: "manual", amount: 50, occurredAt: "2026-08-02T00:00:00.000Z" }]);
assert.deepStrictEqual(
  salesDateRange("custom", { from: new Date(2026, 6, 1), to: new Date(2026, 6, 3) }, new Date(2026, 6, 10, 12)),
  {
    start: new Date(2026, 6, 1),
    end: new Date(2026, 6, 3, 23, 59, 59, 999),
    previousStart: new Date(2026, 5, 28),
    monthly: false
  }
);
assert.deepStrictEqual(adminReferralDetails(
  { id: "inviter" },
  [{ id: "invitee", referredByAccountId: "inviter", email: "invitee@example.com", status: "active", createdAt: "2026-08-27T00:00:00.000Z" }],
  [{ id: "order", accountId: "invitee", merOrderTid: "ORDER-1", planName: "PRO", totalAmount: 50, status: "paid", paidAt: "2026-08-27T01:00:00.000Z" }],
  [{ id: "reward", sourceOrderId: "order", inviterAccountId: "inviter", inviteeAccountId: "invitee", baseCents: 5000, rate: 10, rewardCents: 500, status: "available", availableAt: "2026-08-29T01:00:00.000Z" }]
), {
  invitedUsers: [{ id: "invitee", email: "invitee@example.com", status: "active", createdAt: "2026-08-27T00:00:00.000Z", orderCount: 1, totalPaid: 50 }],
  orders: [{ id: "order", number: "ORDER-1", inviteeEmail: "invitee@example.com", planName: "PRO", amount: 50, status: "paid", createdAt: "2026-08-27T01:00:00.000Z" }],
  rewards: [{ id: "reward", sourceOrderId: "order", orderNumber: "ORDER-1", inviteeEmail: "invitee@example.com", baseAmount: 50, rate: 10, rewardAmount: 5, status: "available", availableAt: "2026-08-29T01:00:00.000Z" }]
});
assert.deepStrictEqual(summarizeXuiInboundProbes([{ status: "online" }, { status: "offline" }, { status: "disabled" }], "2026-08-26T00:00:00.000Z"), {
  configured: true,
  totalNodes: 3,
  onlineNodes: 1,
  offlineNodes: 2,
  checkedAt: "2026-08-26T00:00:00.000Z"
});
const missingXuiUser = { xuiClientPresent: true, xuiLastError: "" };
assert.deepStrictEqual(markMissingXuiClients(new Map([["missing@example.com", missingXuiUser]]), new Set(), "2026-08-22T00:00:00.000Z"), [missingXuiUser]);
assert.deepStrictEqual(missingXuiUser, { xuiClientPresent: false, xuiClientMissingAt: "2026-08-22T00:00:00.000Z", xuiLastError: "3x-ui Client 已被删除或不存在。" });
const trafficPackUser = {
  xuiTrafficCycleKey: "cycle-1",
  xuiLastTraffic: { usedBytes: 55 * gib, remainingBytes: 645 * gib, totalBytes: 700 * gib },
  xuiWeightedTraffic: { usedBytes: 55 * gib, remainingBytes: 645 * gib, totalBytes: 700 * gib, depleted: false }
};
assert.deepStrictEqual(grantTrafficPack(trafficPackUser, "order-1"), { replayed: false, remainingBytesBefore: 645 * gib, remainingBytesAfter: 745 * gib, totalBytes: 800 * gib });
assert.strictEqual(trafficPackUser.xuiTrafficLimitBytes, 800 * gib);
assert.strictEqual(trafficPackUser.xuiLastTraffic.remainingBytes, 745 * gib);
assert.deepStrictEqual(grantTrafficPack(trafficPackUser, "order-1"), { replayed: true });
assert.strictEqual(trafficPackUser.xuiTrafficLimitBytes, 800 * gib);

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
assert.strictEqual(publicInviterLabel({ customerID: 10001 }, { userId: "Alice" }), "Alice");
assert.strictEqual(publicInviterLabel({ customerID: 10001 }, { userId: "alice@example.com" }), "alice@example.com");

const recurringBinding = inferUserProductBinding({ activeGroup: "basic", duration: "quarterly", unlimited: false, expiresAt: "2026-12-01T00:00:00.000Z" });
assert.deepStrictEqual([recurringBinding.productId, recurringBinding.optionId], ["basic", "basic-90"]);
assert.deepStrictEqual(recurringPlanOption({ group: "legacy-unlimited", name: "老无限套餐", unlimited: true, permissionGroup: "basic", monthly: 0 }, { label: "月付 30天", priceKey: "monthly", duration: "monthly" }), { planId: "legacy-unlimited", planName: "老无限套餐", optionLabel: "月付 30天 · 无限流量", priceKey: "monthly", duration: "monthly", group: "basic", lineType: "self_hosted", unlimited: true, fallbackPrice: 0 });
assert.strictEqual(inferUserProductBinding({ activeGroup: "basic", duration: "quarterly", unlimited: true }).optionId, "basic-unlimited-90");
assert.throws(() => paymentQuote("basic-unlimited-90"), /Unsupported pricing option/);
assert.strictEqual(resolvePlanChangeOption({ duration: "quarterly" }, "basic-90").group, "basic");
assert.strictEqual(resolvePlanChangeOption({ duration: "quarterly" }, "basic-lifetime").duration, "lifetime");
assert.strictEqual(resolvePlanChangeOption({ duration: "lifetime" }, "friends-lifetime-unlimited-lifetime").unlimited, true);
assert.throws(() => resolvePlanChangeOption({ duration: "quarterly" }, "basic-unlimited-90"), /Unsupported pricing option/);
assert.throws(() => resolvePlanChangeOption({ duration: "lifetime" }, "traffic_pack-lifetime"), /Unsupported pricing option/);
assert.throws(() => resolvePlanChangeOption({ duration: "monthly" }, "basic-90"), /当前周期一致/);
assert.throws(() => resolvePlanChangeOption({ duration: "lifetime" }, "basic-30"), /当前周期一致/);
const rollbackUser = { group: "basic", activeGroup: "basic", duration: "quarterly", expiresAt: "2026-12-01T00:00:00.000Z", currentOptionId: "basic-90", xuiTrafficPackBytes: gib, xuiTrafficPackOrderIds: ["pack-1"] };
const rollbackState = planChangeState(rollbackUser);
Object.assign(rollbackUser, { group: "pro", activeGroup: "pro", duration: "lifetime", expiresAt: "9999-12-31T00:00:00.000Z", currentOptionId: "pro-lifetime", xuiTrafficPackBytes: 0, xuiTrafficPackOrderIds: [] });
restorePlanChangeState(rollbackUser, rollbackState);
assert.deepStrictEqual([rollbackUser.activeGroup, rollbackUser.duration, rollbackUser.expiresAt, rollbackUser.currentOptionId, rollbackUser.xuiTrafficPackBytes, rollbackUser.xuiTrafficPackOrderIds], ["basic", "quarterly", "2026-12-01T00:00:00.000Z", "basic-90", gib, ["pack-1"]]);
const familyUser = { activeGroup: "pro", duration: "lifetime", isFamilyFriend: true, unlimited: false, expiresAt: "9999-12-31T00:00:00.000Z" };
const familyBinding = inferUserProductBinding(familyUser);
assert.deepStrictEqual([familyBinding.productId, familyBinding.optionId, familyBinding.snapshot.unlimited], ["friends-lifetime-unlimited", "friends-lifetime-unlimited-lifetime", true]);
assert.strictEqual(bindUserProduct(familyUser, familyBinding, { source: "test" }), true);
assert.deepStrictEqual([familyUser.currentProductId, familyUser.unlimited, familyUser.duration], ["friends-lifetime-unlimited", true, "lifetime"]);
const regularLifetimeBinding = inferUserProductBinding({ activeGroup: "ultra", duration: "lifetime", isFamilyFriend: false, unlimited: false });
assert.deepStrictEqual([regularLifetimeBinding.productId, regularLifetimeBinding.optionId, regularLifetimeBinding.snapshot.unlimited], ["friends-lifetime-unlimited", "friends-lifetime-unlimited-lifetime", true]);
const regularLifetimeUser = { activeGroup: "ultra", duration: "lifetime", lineType: "self_hosted", xuiTrafficLimitBytes: 100 * gib, xuiWeightedTraffic: { totalBytes: 100 * gib, remainingBytes: 0, usagePercent: 100, depleted: true } };
bindUserProduct(regularLifetimeUser, regularLifetimeBinding, { source: "test" });
assert.deepStrictEqual([regularLifetimeUser.currentProductId, regularLifetimeUser.unlimited, regularLifetimeUser.xuiTrafficLimitBytes, regularLifetimeUser.xuiWeightedTraffic.depleted], ["friends-lifetime-unlimited", true, 0, false]);
assert.throws(() => paymentQuote("friends-lifetime-unlimited-lifetime"), /Unsupported pricing option/);
const customBinding = inferUserProductBinding({ activeGroup: "pro", duration: "custom", purchasedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-03-02T00:00:00.000Z", actualPaid: 98, userLogs: [{ details: { duration: "custom", amount: 98 } }] });
assert.deepStrictEqual([customBinding.productId, customBinding.optionId, customBinding.normalizedDuration], ["pro", "pro-30", "monthly"]);
const customUser = { activeGroup: "pro", duration: "custom", expiresAt: "2026-03-02T00:00:00.000Z" };
assert.strictEqual(bindUserProduct(customUser, customBinding, { source: "test" }), true);
assert.deepStrictEqual([customUser.currentProductId, customUser.currentOptionId, customUser.duration], ["pro", "pro-30", "monthly"]);
assert.match(inferUserProductBinding({ duration: "invalid" }).error, /无法识别套餐周期/);

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
const lifetimeQuote = paymentQuote("basic-lifetime");
assert.strictEqual(lifetimeQuote.duration, "lifetime");
assert.strictEqual(lifetimeQuote.unlimited, undefined);
assert.strictEqual(lifetimeQuote.traffic, "100G 固定流量");
assert.strictEqual(paymentQuote("pro-lifetime").trafficGb, 200);
assert.deepStrictEqual(lifetimeQuote.cycles.map(cycle => cycle.optionId), ["basic-lifetime"]);
const customTrafficQuote = paymentQuote("basic-30", "", undefined, "vip1", "", 3);
assert.deepStrictEqual([customTrafficQuote.baseAmount, customTrafficQuote.originalAmount, customTrafficQuote.trafficTier, customTrafficQuote.trafficGb], [39, 78, 3, 150]);
assert.throws(() => paymentQuote("basic-30", "", undefined, "vip1", "", 11), /1-10/);
assert.strictEqual(planTrafficBytes({ activeGroup: "basic", duration: "monthly", purchasedTrafficGb: 150 }), 150 * gib);
assert.strictEqual(planTrafficBytes({ activeGroup: "basic", duration: "lifetime", purchasedTrafficGb: 300 }), 100 * gib);
const quoteWithHomeIp = planQuoteWithAddOns(discountedQuote, ["home_ip:us"]);
assert.strictEqual(quoteWithHomeIp.planAmount, discountedQuote.amount);
assert.strictEqual(quoteWithHomeIp.addOnAmount, 40);
assert.strictEqual(quoteWithHomeIp.amount, Number((discountedQuote.amount + 40).toFixed(2)));
assert.deepStrictEqual(quoteWithHomeIp.selectedAddOnSnapshots.map(item => [item.name, item.regionName, item.durationDays]), [["家宽 IP 定制", "美国", 30]]);
assert.strictEqual(quoteWithHomeIp.availableAddOns.some(item => item.id === "traffic_pack"), false);
assert.throws(() => planQuoteWithAddOns(discountedQuote, ["traffic_pack"]), /家宽 IP 地区无效/);
assert.throws(() => planQuoteWithAddOns(lifetimeQuote, ["home_ip:us"]), /不限时套餐不能购买附加服务/);
const xuiClient = normalizeXuiClientResult({ client: { email: "self@test", totalGB: 1000 }, inboundIds: [3], traffic: { up: 100, down: 250 } });
assert.deepStrictEqual(normalizeXuiClientResult({ client: { email: "nested@test", inboundIds: [4, 5] } }).inboundIds, [4, 5]);
assert.deepStrictEqual(normalizeXuiConnectedIps({ hk: { "SELF@test": [{ ip: "1.2.3.4" }, { ip: "1.2.3.4" }] }, jp: { "self@test": [{ ip: "5.6.7.8" }] } }, "self@test"), ["1.2.3.4", "5.6.7.8"]);
assert.match(disabledAccountPlaceholderSubscription({}).body, /该账户已停用，请联系官网客服。/);
assert.deepStrictEqual(xuiClient.inboundIds, [3]);
assert.deepStrictEqual(normalizeXuiInboundIdList([3, "2", 3, 0, "bad"]), [3, 2]);
assert.deepStrictEqual(effectiveXuiInboundIds([1, 2], [2, 3, 9], [1, 2, 3]), [1, 2, 3]);
assert.deepStrictEqual(normalizeXuiInboundMetadata({ "node:1": { inboundType: "custom" } }), { "node:1": { networkLevel: "", region: "", inboundType: "custom" } });
assert.deepStrictEqual(normalizeXuiInboundMetadata({ "node:1": { inboundType: "invalid" } }), {});
assert.deepStrictEqual(xuiClientWritePayload({ uuid: "keep", createdAt: "readonly" }, { email: "self@test", totalGB: 1000 }), { email: "self@test", totalGB: 1000, uuid: "keep" });
assert.strictEqual(xuiClientWritePayload({}, { flow: "xtls-rprx-vision" }).flow, "xtls-rprx-vision");
assert.strictEqual(xuiClientWritePayload({ id: 123 }, {}).id, undefined);
assert.deepStrictEqual(xuiClientWritePayload({ id: 123, uuid: "456" }, { email: "numeric@test" }), { email: "numeric@test" });
assert.deepStrictEqual(["basic", "pro", "ultra"].map(activeGroup => legacyMigrationTrafficLimitBytes({ activeGroup, duration: "monthly" }) / gib), [50, 100, 100]);
const selfHostedTraffic = xuiTrafficPayload({ expiresAt: "2099-01-01T00:00:00.000Z", xuiWeightedTraffic: { rawUsedBytes: 350, usedBytes: 350, totalBytes: 1000, depleted: false } }, xuiClient);
assert.deepStrictEqual(
  [selfHostedTraffic.status, selfHostedTraffic.uploadBytes, selfHostedTraffic.downloadBytes, selfHostedTraffic.usedBytes, selfHostedTraffic.totalBytes, selfHostedTraffic.remainingBytes, selfHostedTraffic.usagePercent],
  ["active", 100, 250, 350, 1000, 650, 35]
);
const xuiUsedTraffic = normalizeXuiClientResult({ client: { email: "self@test", totalGB: 1000 }, usedTraffic: 400 });
assert.strictEqual(xuiTrafficPayload({ expiresAt: "2099-01-01T00:00:00.000Z" }, xuiUsedTraffic).usedBytes, 0);
const trafficByUser = xuiTrafficByUser([
  { id: 1, originNodeGuid: "hk", clientStats: [{ email: "USER@test.com", up: 100, down: 50 }] },
  { id: 2, originNodeGuid: "hk", clientStats: [{ email: "user@test.com", up: 100, down: 50 }] },
  { id: 3, originNodeGuid: "jp", clientStats: [{ email: "user@test.com", up: 20, down: 30 }] }
]);
assert.deepStrictEqual(trafficByUser, { "user@test.com": { hk: 150, jp: 50 } });
const dailyTraffic = xuiDailyNodeTraffic({ user: { hk: 150 } }, xuiDailyNodeTraffic({ user: { hk: 100 } }));
const resetDailyTraffic = xuiDailyNodeTraffic({ user: { hk: 20 } }, dailyTraffic);
assert.deepStrictEqual([resetDailyTraffic.nodes.hk.usedBytes, resetDailyTraffic.users.user.usedBytes], [70, 70]);
const partialDailyTraffic = xuiDailyNodeTraffic({ user: { hk: 110 } }, xuiDailyNodeTraffic({ user: { hk: 100, jp: 100 } }));
const restoredDailyTraffic = xuiDailyNodeTraffic({ user: { hk: 120, jp: 120 } }, partialDailyTraffic);
assert.strictEqual(restoredDailyTraffic.users.user.usedBytes, 40);
  const retainedNodeTraffic = xuiDailyNodeTraffic({ user: { hk: 120 } }, partialDailyTraffic);
  assert.strictEqual(retainedNodeTraffic.nodes.jp.usedBytes, 0);
  const sharedNodeTraffic = xuiDailyNodeTraffic({ first: { hk: 110 }, second: { hk: 110 } }, xuiDailyNodeTraffic({ first: { hk: 100 }, second: { hk: 100 } }));
  assert.strictEqual(xuiDailyNodeTraffic({ first: { hk: 120 } }, sharedNodeTraffic).nodes.hk.usedBytes, 30);
assert.deepStrictEqual(xuiBillingPayload({ users: { user: {} }, nodeTokens: { hk: "secret" } }), { users: { user: {} } });
assert.strictEqual(xuiDailyNodeTraffic({ user: { hk: 120 } }, { date: dailyTraffic.date, users: { user: { baselineBytes: 100, usedBytes: 100 } } }).users.user.usedBytes, 0);
let trafficHistory = {};
for (let day = 18; day <= 25; day += 1) trafficHistory = appendXuiDailyTrafficHistory(trafficHistory, { date: `2026-08-${day}`, users: { user: { usedBytes: day } } });
assert.deepStrictEqual(trafficHistory.days.map(item => item.date), ["2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25"]);
const sevenDayTraffic = xuiUserDailyTraffic(trafficHistory, { date: "2026-08-26", users: { user: { usedBytes: 26 } } }, "USER", Date.UTC(2026, 7, 26, 4));
assert.deepStrictEqual(sevenDayTraffic.map(item => [item.date, item.usedBytes]), [["2026-08-20", 20], ["2026-08-21", 21], ["2026-08-22", 22], ["2026-08-23", 23], ["2026-08-24", 24], ["2026-08-25", 25], ["2026-08-26", 26]]);
assert.deepStrictEqual(xuiUserDailyTraffic(null, null, "user", Date.UTC(2026, 7, 26, 4)).map(item => item.usedBytes), [0, 0, 0, 0, 0, 0, 0]);
const firstLedger = calculateXuiBillingLedger(null, trafficByUser["user@test.com"], { hk: 2, jp: 0.5 }, "cycle-1");
assert.deepStrictEqual([firstLedger.rawBytes, firstLedger.weightedBytes], [200, 325]);
const linkedBaseline = createXuiBillingBaseline(trafficByUser["user@test.com"], "linked-cycle", { hk: 2, jp: 0.5 });
assert.deepStrictEqual([linkedBaseline.rawBytes, linkedBaseline.weightedBytes, linkedBaseline.nodes.hk.baselineBytes], [200, 325, 150]);
const linkedUsage = calculateXuiBillingLedger(linkedBaseline, { hk: 180, jp: 70 }, { hk: 2, jp: 0.5 }, "linked-cycle");
assert.deepStrictEqual([linkedUsage.rawBytes, linkedUsage.weightedBytes], [250, 395]);
const nextLedger = calculateXuiBillingLedger(firstLedger, { hk: 180, jp: 70 }, { hk: 2, jp: 0.5 }, "cycle-1");
assert.deepStrictEqual([nextLedger.rawBytes, nextLedger.weightedBytes], [250, 395]);
const resetLedger = calculateXuiBillingLedger(nextLedger, { hk: 180, jp: 70 }, { hk: 2, jp: 0.5 }, "cycle-2");
assert.deepStrictEqual([resetLedger.rawBytes, resetLedger.weightedBytes], [0, 0]);
assert.deepStrictEqual(pendingXuiTrafficAlert({ cycleKey: "cycle-1", weightedBytes: 80, trafficAlerts: {} }, 100, 80, { telegram: true, mail: true, userMail: true }), { key: "cycle-1:80", channels: ["telegram", "mail", "userMail"] });
assert.deepStrictEqual(pendingXuiTrafficAlert({ cycleKey: "cycle-1", weightedBytes: 90, trafficAlerts: { "cycle-1:80": ["telegram"] } }, 100, 80, { telegram: true, mail: true }), { key: "cycle-1:80", channels: ["mail"] });
assert.strictEqual(pendingXuiTrafficAlert({ cycleKey: "cycle-1", weightedBytes: 79 }, 100, 80, { telegram: true }), null);
const migratedLedger = calculateXuiBillingLedger({ cycleKey: "plan|direct-inbounds-v1", inbounds: { "hk:1": { baselineBytes: 180, rawBytes: 20, weightedBytes: 20 }, "hk:2": { baselineBytes: 180, rawBytes: 20, weightedBytes: 40 } } }, { hk: 200 }, { hk: 2 }, "plan|direct-nodes-v2");
assert.deepStrictEqual([migratedLedger.rawBytes, migratedLedger.weightedBytes, migratedLedger.nodes.hk.baselineBytes], [40, 80, 200]);
const clientCreatedAt = Date.UTC(2026, 0, 1);
assert.notStrictEqual(xuiClientCycleKey({ createdAt: clientCreatedAt, reset: 30 }, clientCreatedAt + 29 * 864e5), xuiClientCycleKey({ createdAt: clientCreatedAt, reset: 30 }, clientCreatedAt + 31 * 864e5));
assert.strictEqual(xuiMonthlyResetAt(31, Date.parse("2026-01-01T00:00:00.000Z")), "2026-01-30T16:00:00.000Z");
assert.strictEqual(xuiMonthlyResetAt(31, Date.parse("2026-02-28T00:00:00.000Z")), "2026-03-30T16:00:00.000Z");
assert.strictEqual(xuiNodeBaseUrl({ scheme: "https", address: "node.example.com", port: 8443, basePath: "/secret/" }), "https://node.example.com:8443/secret");
const sealedNodeToken = sealXuiNodeToken("node-secret");
assert.notStrictEqual(sealedNodeToken.includes("node-secret"), true);
assert.strictEqual(openXuiNodeToken(sealedNodeToken), "node-secret");
assert.deepStrictEqual([...xuiActiveInboundKeys({ "node-a": ["in-443-tcp", "in-8443-tcp"] })], ["node-a:in-443-tcp", "node-a:in-8443-tcp"]);
const xuiPresence = normalizeXuiPresence({ "node-a": ["USER@test.com", "user@test.com"] }, { "USER@test.com": 1700000000 }, [{ guid: "node-a", remark: "Hong Kong" }], { panelGuid: "local" });
assert.deepStrictEqual([xuiPresence.onlineEmails, xuiPresence.onlineByGuid["node-a"], xuiPresence.lastOnline["user@test.com"], xuiPresence.nodeNames["node-a"]], [["user@test.com"], ["user@test.com"], 1700000000, "Hong Kong"]);
const xuiMonitor = normalizeXuiMonitor(
  { cpu: 12.5, mem: { current: 40, total: 100 }, disk: { current: 20, total: 200 }, xray: { state: "running", version: "1.0" } },
  [{ id: 1, remark: "Tokyo", address: "node.example.com", port: 443, status: "online", cpuPct: 10, memPct: 20, netUp: 10, netDown: 20, clientCount: 2, onlineCount: 1 }]
);
assert.deepStrictEqual([xuiMonitor.system.cpu, xuiMonitor.system.memoryUsed, xuiMonitor.nodes[0].clientCount, xuiMonitor.nodes[0].downloadBytes], [12.5, 40, 2, 20]);
  const xuiInbounds = normalizeXuiInbounds([{ id: 2, remark: "VLESS", protocol: "vless", port: 443, up: 10, down: 20, total: 100, clientStats: [{}, {}] }]);
  assert.deepStrictEqual([xuiInbounds[0].clients, xuiInbounds[0].uploadBytes, xuiInbounds[0].downloadBytes], [2, 10, 20]);
assert.deepStrictEqual(normalizeXuiInboundGroups({ groups: { basic: [2, "3", 2, -1], pro: [7] } }), { basic: [2, 3], pro: [7], ultra: [] });
assert.deepStrictEqual(normalizeXuiInboundMetadata({ metadata: { "node-a:2": { networkLevel: "premium", region: " 香港 ", multiplier: 2 }, bad: { networkLevel: "vip" } } }), { "node-a:2": { networkLevel: "premium", region: "香港", inboundType: "package" } });
assert.deepStrictEqual(normalizeXuiInboundEnable("7", true), { id: 7, enable: true });
assert.throws(() => normalizeXuiInboundEnable("0", true), /ID 无效/);
assert.throws(() => normalizeXuiInboundEnable("7", "true"), /布尔值/);
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
assert.strictEqual(normalizeSalesSettings({ onboardingEnabled: false }).onboardingEnabled, false);
const alertSettings = normalizeSalesSettings({ alertSettings: { payment: { telegram: false, mail: true }, traffic: { telegram: true, mail: true, userMail: true }, trafficThresholdPercent: 85 } }).alertSettings;
assert.deepStrictEqual(alertSettings, { payment: { telegram: false, mail: true }, ticket: { telegram: true, mail: false }, traffic: { telegram: true, mail: true, userMail: true }, trafficThresholdPercent: 85 });
assert.throws(() => normalizeSalesSettings({ alertSettings: { trafficThresholdPercent: 0 } }), /1-100/);
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
const testPaymentSettings = normalizePaymentSettings({ name: "测试支付", provider: "test" });
assert.strictEqual(testPaymentSettings.apiBaseUrl, "");
assert.strictEqual(testPaymentSettings.merchantId, "");
assert.strictEqual(testPaymentSettings.alipayChannelCode, "100");
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
assert.deepStrictEqual(pinnedGroups["proxy-groups"][2].proxies, ["node", "*notice"]);
const excludedPlaceholderGroups = require("js-yaml").load(injectPlaceholderNodes(Buffer.from(`proxies:
  - { name: node, type: ss, server: example.com, port: 443, cipher: aes-128-gcm, password: secret }
proxy-groups:
  - { name: 🐟 漏网之鱼, type: select, proxies: [🚀 节点选择] }
  - { name: 🤖 AI服务, type: select, proxies: [♻️ 自动选择] }
  - { name: ♻️ 自动选择, type: url-test, proxies: [node] }
`), { showUserInfo: false }, [{ tag: "default", nodes: ["notice"] }]).toString("utf8"));
assert.deepStrictEqual(excludedPlaceholderGroups["proxy-groups"].map(group => group.proxies), [["🚀 节点选择"], ["♻️ 自动选择"], ["node"]]);
const userInfoConfig = require("js-yaml").load(injectPlaceholderNodes(Buffer.from("proxies: []\n"), { lineType: "self_hosted", activeGroup: "pro", vipSpend: 400, xuiLastTraffic: { remainingBytes: 25.5 * gib } }, []).toString("utf8"));
assert.strictEqual(userInfoConfig.proxies[0].name, "*VIP 2 | PRO | 剩余流量25.5G");

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

let migrationRuns = 0;
Promise.all([
  (async () => {
    const results = await Promise.all([
      withXuiUserMigrationLock("user-1", async () => { migrationRuns += 1; await new Promise(resolve => setImmediate(resolve)); return "done"; }),
      withXuiUserMigrationLock("user-1", async () => { migrationRuns += 1; return "duplicate"; })
    ]);
    assert.deepStrictEqual(results, ["done", "done"]);
    assert.strictEqual(migrationRuns, 1);
  })(),
  (async () => {
    const server = net.createServer(socket => socket.end());
    await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
    try {
      const result = await probeTcpEndpoint("127.0.0.1", server.address().port, 500);
      assert.strictEqual(result.status, "online");
      assert.ok(result.latencyMs >= 0);
      assert.strictEqual((await probeTcpEndpoint("", 443, 500)).status, "unknown");
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  })()
]).then(() => {
  console.log("All checks passed.");
}).catch(error => { console.error(error); process.exitCode = 1; });
