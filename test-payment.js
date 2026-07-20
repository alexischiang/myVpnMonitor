const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs/promises");
const http = require("http");
const path = require("path");
const { Pool } = require("pg");

const secret = "payment-test-secret";
const gatewayRequests = [];
const queryResults = new Map();

function sign(params) {
  const pairs = Object.entries(params)
    .filter(([key, value]) => key !== "sign" && value !== undefined && value !== null && String(value) !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`);
  return crypto.createHash("md5").update(`${pairs.join("&")}&${secret}`).digest("hex").toUpperCase();
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

async function readForm(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return Object.fromEntries(new URLSearchParams(body));
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function main() {
  const env = await fs.readFile(path.join(__dirname, ".env"), "utf8");
  const testDatabaseUrl = process.env.TEST_DATABASE_URL || env.match(/^TEST_DATABASE_URL=(.+)$/m)?.[1]?.trim();
  if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required for payment tests");
  const database = new Pool({ connectionString: testDatabaseUrl });
  const gateway = http.createServer(async (request, response) => {
    const params = await readForm(request);
    gatewayRequests.push({ url: request.url, params });
    assert.strictEqual(params.sign, sign(params), "app must sign every gateway request");

    if (request.url.endsWith("/CreateOrderPay")) {
      if (params.clientUserName === "non-json") return response.end("not json");
      if (params.clientUserName === "http-error") return sendJson(response, 502, { errMsg: "gateway unavailable" });
      if (params.clientUserName === "reject") return sendJson(response, 200, { status: 1, errMsg: "order rejected" });
      return sendJson(response, 200, {
        status: 0,
        result: { tid: `tid-${params.merOrderTid}`, payUrl: `https://pay.test/${params.merOrderTid}`, payOrderStatus: 0 }
      });
    }

    const result = queryResults.get(params.merOrderTid) || { payOrderStatus: 0, money: "1.03" };
    return sendJson(response, 200, { status: 0, result });
  });

  let app;
  let handler;
  try {
    const gatewayPort = await listen(gateway);
    await database.query(`
      CREATE TABLE IF NOT EXISTS app_records (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (collection, id)
      )
    `);
    await database.query("TRUNCATE app_records");
    const subscription = {
      id: "payment-test-pool",
      name: "Payment test pool",
      url: "https://example.test/subscription",
      email: "pool@example.test",
      metrics: {
        expireAt: new Date(Date.now() + 31 * 86400000).toISOString(),
        remainingBytes: 100 * 1024 ** 3
      }
    };
    await database.query(
      "INSERT INTO app_records (collection, id, position, data) VALUES ('subscriptions', $1, 0, $2::jsonb)",
      [subscription.id, JSON.stringify(subscription)]
    );
    const laterSubscription = {
      ...subscription,
      id: "payment-test-pool-later",
      name: "Payment test pool later",
      email: "later-pool@example.test",
      metrics: { ...subscription.metrics, expireAt: new Date(Date.now() + 100 * 86400000).toISOString() }
    };
    await database.query(
      "INSERT INTO app_records (collection, id, position, data) VALUES ('subscriptions', $1, 1, $2::jsonb)",
      [laterSubscription.id, JSON.stringify(laterSubscription)]
    );
    const expiredSubscription = {
      ...subscription,
      id: "payment-test-pool-expired",
      name: "Payment test pool expired",
      email: "expired-pool@example.test",
      metrics: { ...subscription.metrics, expireAt: new Date(Date.now() - 86400000).toISOString() }
    };
    await database.query(
      "INSERT INTO app_records (collection, id, position, data) VALUES ('subscriptions', $1, 2, $2::jsonb)",
      [expiredSubscription.id, JSON.stringify(expiredSubscription)]
    );

    Object.assign(process.env, {
      NODE_ENV: "test",
      LOCAL_DATABASE_URL: testDatabaseUrl,
      PAYMENT_API_BASE_URL: `http://127.0.0.1:${gatewayPort}`,
      PAYMENT_MERCHANT_ID: "payment-test-merchant",
      PAYMENT_MERCHANT_SECRET: secret,
      PAYMENT_CHANNEL_CODE: "100",
      PAYMENT_NOTIFY_URL: "",
      PAYMENT_RETURN_URL: "",
      PUBLIC_BASE_URL: "",
      PAYMENT_COUPONS: "",
      ADMIN_USERNAME: "payment-admin",
      ADMIN_PASSWORD: "payment-admin-password",
      SESSION_SECRET: "payment-test-session-secret"
    });

    handler = require("./server");
    app = http.createServer(handler);
    const appPort = await listen(app);
    const origin = `http://127.0.0.1:${appPort}`;

    async function request(pathname, { method = "GET", body, cookie, headers = {}, redirect = "follow" } = {}) {
      const response = await fetch(`${origin}${pathname}`, {
        method,
        redirect,
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(cookie ? { cookie } : {}),
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined
      });
      const text = await response.text();
      let data = text;
      try { data = JSON.parse(text); } catch {}
      return { response, data, text };
    }

    const unauthenticated = await request("/api/payments/quote", { method: "POST", body: { optionId: "pro-test-001" } });
    assert.strictEqual(unauthenticated.response.status, 401);

    const registration = await request("/api/auth/register", {
      method: "POST",
      body: { email: "buyer@example.test", password: "payment-test-password" }
    });
    assert.strictEqual(registration.response.status, 201);
    const cookie = registration.response.headers.get("set-cookie").split(";", 1)[0];

    const login = await request("/api/auth/login", {
      method: "POST",
      body: { account: "buyer@example.test", password: "payment-test-password" }
    });
    assert.strictEqual(login.response.status, 200);

    const forbiddenSettings = await request("/api/sales-settings", { cookie });
    assert.strictEqual(forbiddenSettings.response.status, 403);
    const forbiddenAdminOrders = await request("/api/admin/orders", { cookie });
    assert.strictEqual(forbiddenAdminOrders.response.status, 403);
    const adminLogin = await request("/api/auth/login", {
      method: "POST",
      body: { account: "payment-admin", password: "payment-admin-password" }
    });
    const adminCookie = adminLogin.response.headers.get("set-cookie").split(";", 1)[0];
    const savedSettings = await request("/api/sales-settings", {
      method: "PUT",
      cookie: adminCookie,
      body: {
        coupons: [
          { id: "save20", code: "save20", percent: 20, totalLimit: 1, enabled: true },
          { id: "expired", code: "expired", percent: 50, enabled: true, validUntil: "2020-01-01T00:00:00.000Z" }
        ],
        faqs: [{ id: "payment-faq", question: "测试问题", answer: "测试回答", enabled: true }]
      }
    });
    assert.strictEqual(savedSettings.response.status, 200);
    assert.strictEqual(savedSettings.data.coupons[0].code, "SAVE20");
    const publicSettings = await request("/api/public/sales-settings");
    assert.deepStrictEqual(publicSettings.data, { registrationMode: "open", faqs: [{ id: "payment-faq", question: "测试问题", answer: "测试回答" }] });

    const quote = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "pro-test-001" } });
    assert.strictEqual(quote.response.status, 200);
    assert.strictEqual(quote.data.amount, 1.03);
    const discountedQuote = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "pro-test-001", couponCode: "save20" } });
    assert.strictEqual(discountedQuote.data.amount, 0.82);
    const expiredQuote = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "pro-test-001", couponCode: "expired" } });
    assert.strictEqual(expiredQuote.response.status, 400);

    for (const body of [
      { optionId: "missing", channelCode: "100" },
      { optionId: "pro-test-001", channelCode: "300" },
      { optionId: "pro-test-001", channelCode: "100", couponCode: "INVALID" }
    ]) {
      const invalid = await request("/api/payments/orders", { method: "POST", cookie, body });
      assert.strictEqual(invalid.response.status, 400);
    }

    async function createOrder(extra = {}) {
      return request("/api/payments/orders", {
        method: "POST",
        cookie,
        body: {
          optionId: "pro-test-001",
          channelCode: "100",
          returnUrl: `${origin}/account/payment/result`,
          ...extra
        }
      });
    }

    const pendingCouponOrder = await createOrder({ couponCode: "SAVE20" });
    assert.strictEqual(pendingCouponOrder.response.status, 201);
    const settingsWithPendingCoupon = await request("/api/sales-settings", { cookie: adminCookie });
    assert.strictEqual(settingsWithPendingCoupon.data.coupons.find(item => item.code === "SAVE20").usedCount, 0);
    const cancelledCouponOrder = await request(`/api/payments/orders/${pendingCouponOrder.data.id}`, { method: "DELETE", cookie });
    assert.strictEqual(cancelledCouponOrder.data.status, "closed");

    for (const clientUserName of ["non-json", "http-error", "reject"]) {
      const rejected = await createOrder({ clientUserName });
      assert.strictEqual(rejected.response.status, 400);
    }

    const failedOrder = await createOrder();
    assert.strictEqual(failedOrder.response.status, 201);
    const createParams = gatewayRequests.find(item => item.params.merOrderTid === failedOrder.data.merOrderTid).params;
    assert.strictEqual(createParams.money, "1.03");
    assert.strictEqual(createParams.notifyUrl, `${origin}/api/payments/callback`);
    assert.strictEqual(createParams.returnUrl, `${origin}/account/payment/result?paymentOrder=${failedOrder.data.id}`);

    const forgedPayload = {
      merOrderTid: failedOrder.data.merOrderTid,
      tid: "forged",
      status: 1,
      money: "1.03",
      sign: "INVALID"
    };
    const badCallback = await request("/api/payments/callback", {
      method: "POST",
      body: forgedPayload
    });
    assert.strictEqual(badCallback.response.status, 400);
    assert.strictEqual(badCallback.text, "invalid sign");
    let status = await request(`/api/payments/orders/${failedOrder.data.id}`, { cookie });
    assert.strictEqual(status.data.status, "pending");

    async function callback(order, status, money, asJson = false) {
      const payload = { merOrderTid: order.merOrderTid, tid: `callback-${order.merOrderTid}`, status, money };
      payload.sign = sign(payload);
      if (asJson) return request("/api/payments/callback", { method: "POST", body: payload });
      const response = await fetch(`${origin}/api/payments/callback`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(payload)
      });
      return { response, text: await response.text() };
    }

    const failedCallback = await callback(failedOrder.data, 2, "1.03");
    assert.strictEqual(failedCallback.response.status, 200);
    status = await request(`/api/payments/orders/${failedOrder.data.id}`, { cookie });
    assert.strictEqual(status.data.status, "failed");

    const pendingOrder = await createOrder();
    assert.strictEqual(pendingOrder.response.status, 201);
    const overLimitOrder = await createOrder();
    assert.strictEqual(overLimitOrder.response.status, 400);
    assert.match(overLimitOrder.data.error, /已有待支付订单/);
    const cancelledOrder = await request(`/api/payments/orders/${pendingOrder.data.id}`, { method: "DELETE", cookie });
    assert.strictEqual(cancelledOrder.data.status, "closed");
    const replacementPendingOrder = await createOrder();
    assert.strictEqual(replacementPendingOrder.response.status, 201);
    const cancelledReplacement = await request(`/api/payments/orders/${replacementPendingOrder.data.id}`, { method: "DELETE", cookie });
    assert.strictEqual(cancelledReplacement.data.status, "closed");
    await callback(cancelledOrder.data, 1, "1.03", true);
    status = await request(`/api/payments/orders/${cancelledOrder.data.id}`, { cookie });
    assert.strictEqual(status.data.status, "abnormal");
    assert.strictEqual(status.data.fulfillmentStatus, "failed");
    assert.match(status.data.paymentError, /联系客服退款/);

    const mismatchedOrder = await createOrder();
    await callback(mismatchedOrder.data, 1, "0.01", true);
    status = await request(`/api/payments/orders/${mismatchedOrder.data.id}`, { cookie });
    assert.strictEqual(status.data.status, "abnormal");
    assert.strictEqual(status.data.fulfillmentStatus, "failed");

    const paidOrder = await createOrder();
    await callback(paidOrder.data, 1, "1.03", true);
    await callback(paidOrder.data, 1, "1.03", true);
    status = await request(`/api/payments/orders/${paidOrder.data.id}`, { cookie });
    assert.strictEqual(status.data.status, "paid");
    assert.strictEqual(status.data.fulfillmentStatus, "fulfilled");
    assert.strictEqual(status.data.vipSpendBefore, 0);
    assert.strictEqual(status.data.vipSpendAfter, status.data.vipSpendAmount);
    assert.ok(status.data.deliveryUrl);

    const userCount = await database.query("SELECT COUNT(*)::int AS count FROM app_records WHERE collection = 'users'");
    const billCount = await database.query("SELECT COUNT(*)::int AS count FROM app_records WHERE collection = 'bills'");
    assert.strictEqual(userCount.rows[0].count, 1, "duplicate callbacks must not create duplicate users");
    assert.strictEqual(billCount.rows[0].count, 1, "duplicate callbacks must not create duplicate bills");
    const createdUser = (await database.query("SELECT data FROM app_records WHERE collection = 'users' LIMIT 1")).rows[0].data;
    assert.strictEqual(createdUser.userId, "buyer@example.test");
    assert.strictEqual(createdUser.email, "buyer@example.test");
    const adminBills = await request("/api/bills", { cookie: adminCookie });
    const billDetail = await request(`/api/bills/${adminBills.data[0].id}`, { cookie: adminCookie });
    assert.strictEqual(billDetail.data.payment.channelCode, "100");
    assert.strictEqual(billDetail.data.payment.purchaseAction, "initial");
    assert.strictEqual(billDetail.data.payment.originalAmount, 1);
    assert.strictEqual(billDetail.data.payment.amount, 1.03);

    const polledOrder = await createOrder();
    queryResults.set(polledOrder.data.merOrderTid, {
      tid: `query-${polledOrder.data.merOrderTid}`,
      payOrderStatus: 1,
      money: "1.03"
    });
    status = await request(`/api/payments/orders/${polledOrder.data.id}`, { cookie });
    assert.strictEqual(status.data.status, "paid");
    assert.strictEqual(status.data.fulfillmentStatus, "fulfilled");
    const adminUsers = await request("/api/users", { cookie: adminCookie });
    const purchaseLogs = adminUsers.data[0].userLogs;
    const createdLog = purchaseLogs.find(log => log.reason === "user-created");
    const switchedLog = purchaseLogs.find(log => log.reason === "purchase-pool-changed");
    assert.ok(createdLog?.toSubscriptionLabel, "new purchases must log the recommended pool");
    assert.ok(switchedLog?.fromSubscriptionLabel && switchedLog?.toSubscriptionLabel, "purchase-triggered pool changes must log both pools");
    const managedUser = adminUsers.data[0];
    const protectedUpdate = await request(`/api/users/${managedUser.id}`, { method: "PUT", cookie: adminCookie, body: { actualPaid: 999, duration: "yearly", expiresAt: "2030-01-01" } });
    assert.strictEqual(protectedUpdate.response.status, 400);
    const blockedRenewal = await request(`/api/users/${managedUser.id}/renew`, { method: "POST", cookie: adminCookie, body: { actualPaid: 1, duration: "monthly" } });
    assert.strictEqual(blockedRenewal.response.status, 400);
    const manualPoolChange = await request(`/api/users/${managedUser.id}/pool`, { method: "POST", cookie: adminCookie, body: { subscriptionId: subscription.id } });
    assert.strictEqual(manualPoolChange.data.subscriptionId, subscription.id);
    assert.strictEqual(manualPoolChange.data.userLogs[0].reason, "manual-pool-changed");
    const disabledPool = await request(`/api/subscriptions/${laterSubscription.id}`, { method: "PUT", cookie: adminCookie, body: { enabled: false } });
    assert.strictEqual(disabledPool.data.enabled, false);
    assert.strictEqual(disabledPool.data.status, "disabled");
    const recommendationWithoutDisabled = await request("/api/subscriptions/recommend", { method: "POST", cookie: adminCookie, body: { expiresAt: new Date(Date.now() + 95 * 86400000).toISOString() } });
    assert.notStrictEqual(recommendationWithoutDisabled.data.subscription?.id, laterSubscription.id);
    const blockedDisabledPool = await request(`/api/users/${managedUser.id}/pool`, { method: "POST", cookie: adminCookie, body: { subscriptionId: laterSubscription.id } });
    assert.strictEqual(blockedDisabledPool.response.status, 400);
    const allowedDisabledPool = await request(`/api/users/${managedUser.id}/pool`, { method: "POST", cookie: adminCookie, body: { subscriptionId: laterSubscription.id, allowDisabled: true } });
    assert.strictEqual(allowedDisabledPool.data.subscriptionId, laterSubscription.id);
    const blockedExpiredPool = await request(`/api/users/${managedUser.id}/pool`, { method: "POST", cookie: adminCookie, body: { subscriptionId: expiredSubscription.id, allowDisabled: true } });
    assert.strictEqual(blockedExpiredPool.response.status, 400);

    const crossAccount = await request("/api/auth/register", {
      method: "POST",
      body: { email: "other@example.test", password: "payment-test-password" }
    });
    const otherCookie = crossAccount.response.headers.get("set-cookie").split(";", 1)[0];
    const hiddenOrder = await request(`/api/payments/orders/${paidOrder.data.id}`, { cookie: otherCookie });
    assert.strictEqual(hiddenOrder.response.status, 404);
    const protectedPendingOrder = await createOrder();
    const hiddenCancellation = await request(`/api/payments/orders/${protectedPendingOrder.data.id}`, { method: "DELETE", cookie: otherCookie });
    assert.strictEqual(hiddenCancellation.response.status, 404);
    const ownerCancellation = await request(`/api/payments/orders/${protectedPendingOrder.data.id}`, { method: "DELETE", cookie });
    assert.strictEqual(ownerCancellation.data.status, "closed");

    const resultPage = await request(`/account/payment/result?paymentOrder=${paidOrder.data.id}`, { cookie, redirect: "manual" });
    assert.strictEqual(resultPage.response.status, 200);
    const protectedResultPage = await request(`/account/payment/result?paymentOrder=${paidOrder.data.id}`, { redirect: "manual" });
    assert.strictEqual(protectedResultPage.response.status, 302);
    assert.strictEqual(protectedResultPage.response.headers.get("location"), "/login");

    const unknown = { merOrderTid: "unknown-order", tid: "unknown", status: 1, money: "1.03" };
    unknown.sign = sign(unknown);
    const unknownCallback = await request("/api/payments/callback", { method: "POST", body: unknown });
    assert.strictEqual(unknownCallback.response.status, 200);
    assert.strictEqual(unknownCallback.text, "success");

    const extensionQuote = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "pro-90" } });
    assert.strictEqual(extensionQuote.data.purchaseAction, "extend");
    assert.strictEqual(extensionQuote.data.cashCredit, 0);

    const replacementQuote = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "basic-30" } });
    assert.strictEqual(replacementQuote.data.purchaseAction, "replace");
    assert.ok(replacementQuote.data.cashCredit > 2, "replacement must prorate the current plan's paid cash value");
    const replacementOrder = await createOrder({ optionId: "basic-30" });
    assert.strictEqual(replacementOrder.response.status, 201);
    await callback(replacementOrder.data, 1, String(replacementOrder.data.amount), true);
    const replacedUser = (await database.query("SELECT data FROM app_records WHERE collection = 'users' LIMIT 1")).rows[0].data;
    assert.strictEqual(replacedUser.activeGroup, "basic");
    assert.strictEqual(replacedUser.unlimited, false);
    assert.strictEqual(replacedUser.cashValue, replacementOrder.data.amount, "replacement cash value must only include the new payment");
    assert.ok(new Date(replacedUser.expiresAt).getTime() < Date.now() + 31 * 86400000, "replacement must restart, not extend, the term");

    const sameTierQuote = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "basic-90" } });
    assert.strictEqual(sameTierQuote.data.purchaseAction, "extend");
    const unlimitedQuote = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "basic-unlimited-90" } });
    assert.strictEqual(unlimitedQuote.data.purchaseAction, "replace");
    assert.ok(unlimitedQuote.data.cashCredit > 0);

    const zeroQuote = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "pro-test-001" } });
    assert.strictEqual(zeroQuote.data.amount, 0);
    assert.strictEqual(zeroQuote.data.cashCredit, zeroQuote.data.beforeCreditAmount);
    const zeroOrder = await createOrder();
    assert.strictEqual(zeroOrder.response.status, 201);
    assert.strictEqual(zeroOrder.data.status, "paid");
    assert.strictEqual(zeroOrder.data.fulfillmentStatus, "fulfilled");
    assert.strictEqual(zeroOrder.data.payUrl, "");

    const couponOrder = await createOrder({ couponCode: "SAVE20" });
    if (couponOrder.data.status === "pending") await callback(couponOrder.data, 1, String(couponOrder.data.amount), true);
    const couponSettings = await request("/api/sales-settings", { cookie: adminCookie });
    assert.strictEqual(couponSettings.data.coupons.find(item => item.code === "SAVE20").usedCount, 1);
    const exhaustedCoupon = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "pro-test-001", couponCode: "SAVE20" } });
    assert.strictEqual(exhaustedCoupon.response.status, 400);

    await request(`/api/subscriptions/${subscription.id}`, { method: "PUT", cookie: adminCookie, body: { enabled: false } });
    const noPoolOrder = await createOrder({ optionId: "basic-360" });
    assert.strictEqual(noPoolOrder.response.status, 201);
    await callback(noPoolOrder.data, 1, String(noPoolOrder.data.amount), true);
    status = await request(`/api/payments/orders/${noPoolOrder.data.id}`, { cookie });
    assert.strictEqual(status.data.fulfillmentError, "目前没有可用 BASIC 池发放。");

    const visiblePendingOrder = await createOrder({ optionId: "ultra-360", useBalance: false });
    assert.strictEqual(visiblePendingOrder.response.status, 201);
    assert.strictEqual(visiblePendingOrder.data.status, "pending");
    const adminOrders = await request("/api/admin/orders", { cookie: adminCookie });
    assert.strictEqual(adminOrders.response.status, 200);
    const adminOrderIds = new Set(adminOrders.data.map(item => item.id));
    for (const order of [visiblePendingOrder.data, cancelledOrder.data, failedOrder.data, paidOrder.data, noPoolOrder.data]) assert.ok(adminOrderIds.has(order.id));
    const noPoolAdminOrder = adminOrders.data.find(item => item.id === noPoolOrder.data.id);
    assert.strictEqual(noPoolAdminOrder.status, "paid");
    assert.strictEqual(noPoolAdminOrder.fulfillmentStatus, "failed");
    assert.strictEqual(noPoolAdminOrder.internalFulfillmentError, "没有可用的池 URL。");
    const adminOrderDetail = await request(`/api/admin/orders/${noPoolOrder.data.id}`, { cookie: adminCookie });
    assert.strictEqual(adminOrderDetail.data.id, noPoolOrder.data.id);

    const passwordChange = await request("/api/auth/password", {
      method: "PUT",
      cookie,
      body: { currentPassword: "payment-test-password", password: "payment-test-password-new" }
    });
    assert.strictEqual(passwordChange.response.status, 200);
    assert.match(passwordChange.response.headers.get("set-cookie") || "", /Max-Age=0/);
    const oldPasswordLogin = await request("/api/auth/login", { method: "POST", body: { account: "buyer@example.test", password: "payment-test-password" } });
    assert.strictEqual(oldPasswordLogin.response.status, 401);
    const newPasswordLogin = await request("/api/auth/login", { method: "POST", body: { account: "buyer@example.test", password: "payment-test-password-new" } });
    assert.strictEqual(newPasswordLogin.response.status, 200);

    console.log("Payment chain checks passed: auth, quote, create, gateway failures, signatures, callbacks, amount validation, fulfillment, idempotency, polling, access control, and return page.");
  } finally {
    if (app) await close(app);
    if (handler) await handler.closeDataStore();
    await close(gateway);
    await database.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
