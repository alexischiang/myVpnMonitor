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
  const xuiClients = new Map();
  const xui = http.createServer(async (request, response) => {
    let body = {};
    if (request.method !== "GET") {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      if (raw) body = JSON.parse(raw);
    }
    const clientMatch = request.url.match(/^\/panel\/api\/clients\/get\/(.+)$/);
    if (clientMatch) {
      const client = xuiClients.get(decodeURIComponent(clientMatch[1]));
      return sendJson(response, client ? 200 : 404, client ? { success: true, obj: client } : { success: false, msg: "not found" });
    }
    if (request.url === "/panel/api/clients/list") return sendJson(response, 200, { success: true, obj: [...xuiClients.values()] });
    if (request.url === "/panel/api/inbounds/list") return sendJson(response, 200, { success: true, obj: [
      { id: 1, remark: "套餐节点", protocol: "vless", enable: true },
      { id: 2, remark: "个人家宽", protocol: "vless", enable: true },
      { id: 3, remark: "停用家宽", protocol: "vless", enable: false }
    ] });
    if (request.url === "/panel/api/clients/add") {
      const client = { ...body.client, subId: body.client.subId || crypto.randomUUID(), inboundIds: body.inboundIds || [] };
      xuiClients.set(client.email, client);
      return sendJson(response, 200, { success: true, obj: client });
    }
    const updateMatch = request.url.match(/^\/panel\/api\/clients\/update\/(.+)$/);
    if (updateMatch) {
      const oldEmail = decodeURIComponent(updateMatch[1]);
      const client = { ...(xuiClients.get(oldEmail) || {}), ...body };
      xuiClients.delete(oldEmail);
      xuiClients.set(client.email, client);
      return sendJson(response, 200, { success: true, obj: client });
    }
    if (request.url === "/panel/api/clients/bulkAttach") {
      for (const email of body.emails || []) {
        const client = xuiClients.get(email);
        if (client) client.inboundIds = [...new Set([...(client.inboundIds || []), ...(body.inboundIds || [])])];
      }
      return sendJson(response, 200, { success: true, obj: {} });
    }
    if (request.url === "/panel/api/clients/bulkDetach") {
      for (const email of body.emails || []) {
        const client = xuiClients.get(email);
        if (client) client.inboundIds = (client.inboundIds || []).filter(id => !(body.inboundIds || []).includes(id));
      }
      return sendJson(response, 200, { success: true, obj: {} });
    }
    return sendJson(response, 200, { success: true, obj: {} });
  });

  let app;
  let handler;
  try {
    const gatewayPort = await listen(gateway);
    const xuiPort = await listen(xui);
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
    await database.query(
      "INSERT INTO app_records (collection, id, position, data) VALUES ('xuiInboundGroups', 'state', 0, $1::jsonb)",
      [JSON.stringify({ groups: { basic: [1], pro: [1], ultra: [1], self_hosted: [1] } })]
    );
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
      SESSION_SECRET: "payment-test-session-secret",
      XUI_BASE_URL: `http://127.0.0.1:${xuiPort}`,
      XUI_API_TOKEN: "xui-test-token",
      XUI_READ_ONLY: "false",
      XUI_SUBSCRIPTION_BASE_URL: "https://subscription.test"
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
    const registeredUsers = await request("/api/users", { cookie: adminCookie });
    const registeredOnly = registeredUsers.data.find(item => item.email === "buyer@example.test");
    assert.ok(registeredOnly?.id.startsWith("account:"));
    const disabledAccount = await request(`/api/users/${registeredOnly.id}/account-status`, { method: "POST", cookie: adminCookie, body: { disabled: true } });
    assert.strictEqual(disabledAccount.data.accountStatus, "disabled");
    const disabledUsers = await request("/api/users", { cookie: adminCookie });
    assert.strictEqual(disabledUsers.data.find(item => item.id === registeredOnly.id)?.accountStatus, "disabled");
    const disabledLogin = await request("/api/auth/login", { method: "POST", body: { account: "buyer@example.test", password: "payment-test-password" } });
    assert.strictEqual(disabledLogin.response.status, 403);
    assert.strictEqual(disabledLogin.data.error, "该账户已停用，请联系右下角客服。");
    const restoredAccount = await request(`/api/users/${registeredOnly.id}/account-status`, { method: "POST", cookie: adminCookie, body: { disabled: false } });
    assert.strictEqual(restoredAccount.data.accountStatus, "active");

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
    assert.deepStrictEqual(publicSettings.data, { registrationMode: "open", onboardingEnabled: true, faqs: [{ id: "payment-faq", question: "测试问题", answer: "测试回答" }], userAlerts: [] });
    const adminPricing = await request("/api/pricing", { cookie: adminCookie });
    const shopperPricing = await request("/api/public/pricing");
    assert.ok(adminPricing.data.some(item => item.group === "friends-lifetime-unlimited" && item.internal === true));
    assert.ok(!shopperPricing.data.some(item => item.internal === true));

    const quote = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "pro-test-001" } });
    assert.strictEqual(quote.response.status, 200);
    assert.strictEqual(quote.data.amount, 1.03);
    const discountedQuote = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "pro-test-001", couponCode: "save20" } });
    assert.strictEqual(discountedQuote.data.amount, 0.82);
    const expiredQuote = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "pro-test-001", couponCode: "expired" } });
    assert.strictEqual(expiredQuote.response.status, 400);

    for (const body of [
      { optionId: "missing", channelCode: "100" },
      { optionId: "pro-test-001", channelCode: "bad channel" },
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
          confirmReplacement: true,
          returnUrl: `${origin}/account/payment/result`,
          ...extra
        }
      });
    }

    const pendingCouponOrder = await createOrder({ couponCode: "SAVE20" });
    assert.strictEqual(pendingCouponOrder.response.status, 201);
    const usersWithPendingOrder = await request("/api/users", { cookie: adminCookie });
    const pendingOrderLog = usersWithPendingOrder.data.find(item => item.email === "buyer@example.test")?.userLogs
      .find(log => log.details?.paymentOrderId === pendingCouponOrder.data.id);
    assert.deepStrictEqual([pendingOrderLog?.reason, pendingOrderLog?.status], ["payment-order-pending", "pending"]);
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
    assert.strictEqual(xuiClients.size, 0, "pending orders must not touch 3x-ui");
    await Promise.all([
      callback(paidOrder.data, 1, "1.03", true),
      callback(paidOrder.data, 1, "1.03", true)
    ]);
    status = await request(`/api/payments/orders/${paidOrder.data.id}`, { cookie });
    assert.strictEqual(status.data.status, "paid");
    assert.strictEqual(status.data.fulfillmentStatus, "fulfilled");
    assert.strictEqual(status.data.purchaseCountBefore, 0);
    assert.strictEqual(status.data.vipSpendBefore, 0);
    assert.strictEqual(status.data.vipSpendAfter, status.data.vipSpendAmount);
    assert.ok(status.data.deliveryUrl);

    const userCount = await database.query("SELECT COUNT(*)::int AS count FROM app_records WHERE collection = 'users'");
    const billCount = await database.query("SELECT COUNT(*)::int AS count FROM app_records WHERE collection = 'bills'");
    assert.strictEqual(userCount.rows[0].count, 1, "duplicate callbacks must not create duplicate users");
    assert.strictEqual(billCount.rows[0].count, 1, "duplicate callbacks must not create duplicate bills");
    const adminRetry = await request(`/api/admin/orders/${paidOrder.data.id}`, { method: "POST", cookie: adminCookie });
    assert.strictEqual(adminRetry.response.status, 200);
    assert.strictEqual(adminRetry.data.fulfillmentStatus, "fulfilled");
    const createdUser = (await database.query("SELECT data FROM app_records WHERE collection = 'users' LIMIT 1")).rows[0].data;
    assert.strictEqual(createdUser.userId, "buyer@example.test");
    assert.strictEqual(createdUser.email, "buyer@example.test");
    assert.deepStrictEqual([createdUser.currentProductId, createdUser.currentOptionId, createdUser.currentProductOrderId], ["pro", "pro-test-001", paidOrder.data.id]);
    assert.deepStrictEqual([xuiClients.get("buyer@example.test").flow, xuiClients.get("buyer@example.test").totalGB], ["xtls-rprx-vision", 200 * 1024 ** 3]);
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
    assert.strictEqual(status.data.purchaseCountBefore, 1);
    const adminUsers = await request("/api/users", { cookie: adminCookie });
    const purchaseLogs = adminUsers.data[0].userLogs;
    const managedUser = adminUsers.data[0];
    assert.strictEqual(managedUser.lineType, "self_hosted", "new purchases must use self-hosted delivery");
    const customInboundOptions = await request(`/api/users/${managedUser.id}/custom-inbounds`, { cookie: adminCookie });
    assert.strictEqual(customInboundOptions.response.status, 200);
    assert.deepStrictEqual(customInboundOptions.data.inheritedInboundIds, [1]);
    const customInboundUpdate = await request(`/api/users/${managedUser.id}/custom-inbounds`, { method: "PUT", cookie: adminCookie, body: { inboundIds: [2] } });
    assert.strictEqual(customInboundUpdate.response.status, 200);
    assert.deepStrictEqual(customInboundUpdate.data.xuiExtraInboundIds, [2]);
    assert.deepStrictEqual(customInboundUpdate.data.xuiInboundIds, [1, 2]);
    const blockedDisabledInbound = await request(`/api/users/${managedUser.id}/custom-inbounds`, { method: "PUT", cookie: adminCookie, body: { inboundIds: [2, 3] } });
    assert.strictEqual(blockedDisabledInbound.response.status, 400);
    assert.match(blockedDisabledInbound.data.error, /已停用/);
    const protectedUpdate = await request(`/api/users/${managedUser.id}`, { method: "PUT", cookie: adminCookie, body: { actualPaid: 999, duration: "yearly", expiresAt: "2030-01-01" } });
    assert.strictEqual(protectedUpdate.response.status, 400);
    const blockedRenewal = await request(`/api/users/${managedUser.id}/renew`, { method: "POST", cookie: adminCookie, body: { actualPaid: 1, duration: "monthly" } });
    assert.strictEqual(blockedRenewal.response.status, 400);
    const manualPoolChange = await request(`/api/users/${managedUser.id}/pool`, { method: "POST", cookie: adminCookie, body: { subscriptionId: subscription.id } });
    assert.strictEqual(manualPoolChange.response.status, 410);
    const disabledPool = await request(`/api/subscriptions/${laterSubscription.id}`, { method: "PUT", cookie: adminCookie, body: { enabled: false } });
    assert.strictEqual(disabledPool.data.enabled, false);
    assert.strictEqual(disabledPool.data.status, "disabled");
    const recommendationWithoutDisabled = await request("/api/subscriptions/recommend", { method: "POST", cookie: adminCookie, body: { expiresAt: new Date(Date.now() + 95 * 86400000).toISOString() } });
    assert.notStrictEqual(recommendationWithoutDisabled.data.subscription?.id, laterSubscription.id);
    const blockedDisabledPool = await request(`/api/users/${managedUser.id}/pool`, { method: "POST", cookie: adminCookie, body: { subscriptionId: laterSubscription.id } });
    assert.strictEqual(blockedDisabledPool.response.status, 410);
    const allowedDisabledPool = await request(`/api/users/${managedUser.id}/pool`, { method: "POST", cookie: adminCookie, body: { subscriptionId: laterSubscription.id, allowDisabled: true } });
    assert.strictEqual(allowedDisabledPool.response.status, 410);
    const blockedExpiredPool = await request(`/api/users/${managedUser.id}/pool`, { method: "POST", cookie: adminCookie, body: { subscriptionId: expiredSubscription.id, allowDisabled: true } });
    assert.strictEqual(blockedExpiredPool.response.status, 410);

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
    assert.strictEqual(extensionQuote.data.purchaseAction, "replace");
    assert.strictEqual(extensionQuote.data.cashCredit, 0);
    const unconfirmedReplacement = await request("/api/payments/orders", { method: "POST", cookie, body: { optionId: "pro-90", channelCode: "100" } });
    assert.strictEqual(unconfirmedReplacement.response.status, 400);
    assert.match(unconfirmedReplacement.data.error, /确认新套餐/);

    const replacementQuote = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "basic-30" } });
    assert.strictEqual(replacementQuote.data.purchaseAction, "replace");
    assert.strictEqual(replacementQuote.data.cashCredit, 0);
    const replacementOrder = await createOrder({ optionId: "basic-30" });
    assert.strictEqual(replacementOrder.response.status, 201);
    assert.strictEqual(replacementOrder.data.purchaseCountBefore, 2);
    await callback(replacementOrder.data, 1, String(replacementOrder.data.amount), true);
    const replacedUser = (await database.query("SELECT data FROM app_records WHERE collection = 'users' LIMIT 1")).rows[0].data;
    assert.strictEqual(replacedUser.activeGroup, "basic");
    assert.deepStrictEqual(replacedUser.xuiExtraInboundIds, [2], "custom inbound grants must survive plan replacement");
    assert.deepStrictEqual(replacedUser.xuiInboundIds, [1, 2], "effective inbounds must merge plan and custom grants");
    assert.deepStrictEqual([replacedUser.currentProductId, replacedUser.currentOptionId, replacedUser.currentProductOrderId], ["basic", "basic-30", replacementOrder.data.id]);
    assert.strictEqual(replacedUser.unlimited, false);
    assert.strictEqual(replacedUser.cashValue, replacementOrder.data.amount, "replacement cash value must only include the new payment");
    assert.ok(new Date(replacedUser.expiresAt).getTime() < Date.now() + 31 * 86400000, "replacement must restart, not extend, the term");

    const sameTierQuote = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "basic-90" } });
    assert.strictEqual(sameTierQuote.data.purchaseAction, "replace");
    const unlimitedQuote = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "basic-unlimited-90" } });
    assert.strictEqual(unlimitedQuote.response.status, 400);
    assert.match(unlimitedQuote.data.error, /Unsupported pricing option/);

    const couponOrder = await createOrder({ couponCode: "SAVE20" });
    if (couponOrder.data.status === "pending") await callback(couponOrder.data, 1, String(couponOrder.data.amount), true);
    const couponSettings = await request("/api/sales-settings", { cookie: adminCookie });
    assert.strictEqual(couponSettings.data.coupons.find(item => item.code === "SAVE20").usedCount, 1);
    const exhaustedCoupon = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "pro-test-001", couponCode: "SAVE20" } });
    assert.strictEqual(exhaustedCoupon.response.status, 400);

    const manualRegistration = await request("/api/auth/register", {
      method: "POST",
      body: { email: "manual@example.test", password: "payment-test-password", confirmPassword: "payment-test-password" }
    });
    assert.strictEqual(manualRegistration.response.status, 201);
    const manualUsers = await request("/api/users", { cookie: adminCookie });
    const manualAccount = manualUsers.data.find(item => item.email === "manual@example.test");
    const manualQuote = await request("/api/admin/manual-payments/quote", { method: "POST", cookie: adminCookie, body: { accountId: manualAccount.accountId, optionId: "pro-test-001" } });
    assert.strictEqual(manualQuote.response.status, 200);
    const manualOrder = await request("/api/admin/manual-payments", { method: "POST", cookie: adminCookie, body: { accountId: manualAccount.accountId, optionId: "pro-test-001", amount: 2.34 } });
    assert.strictEqual(manualOrder.response.status, 201);
    assert.strictEqual(manualOrder.data.channelCode, "manual");
    assert.strictEqual(manualOrder.data.amount, 2.34);
    assert.strictEqual(manualOrder.data.realCashAmount, 2.34);
    assert.strictEqual(manualOrder.data.virtualCashAmount, 0);
    assert.strictEqual(manualOrder.data.taxAmount, 0);
    assert.strictEqual(manualOrder.data.fulfillmentStatus, "fulfilled");
    const manualPurchasedUsers = await request("/api/users", { cookie: adminCookie });
    const manualPurchasedUser = manualPurchasedUsers.data.find(item => item.email === "manual@example.test");
    assert.ok(!manualPurchasedUser.registeredOnly);
    assert.strictEqual(manualPurchasedUser.vipSpend, 2.34);
    const manualRenewal = await request("/api/admin/manual-payments", { method: "POST", cookie: adminCookie, body: { accountId: manualAccount.accountId, optionId: "pro-test-001", amount: 3.21 } });
    assert.strictEqual(manualRenewal.response.status, 201);
    assert.strictEqual(manualRenewal.data.purchaseAction, "replace");
    const manualRenewedUsers = await request("/api/users", { cookie: adminCookie });
    assert.strictEqual(manualRenewedUsers.data.find(item => item.email === "manual@example.test").vipSpend, 5.55);

    const inviterRegistration = await request("/api/auth/register", {
      method: "POST",
      body: { email: "inviter@example.test", password: "payment-test-password" }
    });
    const inviterCookie = inviterRegistration.response.headers.get("set-cookie").split(";", 1)[0];
    const inviterOverview = await request("/api/account/overview", { cookie: inviterCookie });
    const inviteeRegistration = await request("/api/auth/register", {
      method: "POST",
      body: { email: "invitee@example.test", password: "payment-test-password", referralCode: inviterOverview.data.referral.code }
    });
    const inviteeCookie = inviteeRegistration.response.headers.get("set-cookie").split(";", 1)[0];
    const inviteeOrder = await request("/api/payments/orders", {
      method: "POST",
      cookie: inviteeCookie,
      body: { optionId: "pro-test-001", channelCode: "100", confirmReplacement: true }
    });
    await callback(inviteeOrder.data, 1, String(inviteeOrder.data.amount), true);

    let referrals = await request("/api/account/referrals", { cookie: inviterCookie });
    assert.strictEqual(referrals.data.invitedCount, 1);
    assert.strictEqual(referrals.data.pendingAmount, 0.1);
    assert.strictEqual(referrals.data.referralBalance, 0);
    await database.query(
      "UPDATE app_records SET data = jsonb_set(data, '{availableAt}', to_jsonb($1::text)) WHERE collection = 'referralRewards' AND data->>'sourceOrderId' = $2",
      [new Date(0).toISOString(), inviteeOrder.data.id]
    );
    await request(`/api/admin/orders/${inviteeOrder.data.id}`, { method: "POST", cookie: adminCookie });
    referrals = await request("/api/account/referrals", { cookie: inviterCookie });
    assert.strictEqual(referrals.data.pendingAmount, 0);
    assert.strictEqual(referrals.data.earnedAmount, 0.1);
    assert.strictEqual(referrals.data.referralBalance, 0.1);

    const inviterOrder = await request("/api/payments/orders", {
      method: "POST",
      cookie: inviterCookie,
      body: { optionId: "pro-test-001", channelCode: "100" }
    });
    assert.strictEqual(inviterOrder.data.walletCashAmount, 0);
    assert.strictEqual(inviterOrder.data.walletReferralAmount, 0.1);
    assert.strictEqual(inviterOrder.data.amount, 0.93);
    await callback(inviterOrder.data, 1, "0.93", true);
    const inviterWallet = await request("/api/account/wallet", { cookie: inviterCookie });
    assert.strictEqual(inviterWallet.data.balance, 0);
    assert.strictEqual(inviterWallet.data.referralBalance, 0);
    assert.strictEqual(inviterWallet.data.vipSpend, 0.93);

    const chainUsers = await request("/api/users", { cookie: adminCookie });
    const inviteeUser = chainUsers.data.find(item => item.email === "invitee@example.test");
    const giftedWallet = await request(`/api/users/${inviteeUser.id}/wallet-gift`, {
      method: "POST",
      cookie: adminCookie,
      body: { amount: 0.4, note: "wallet chain test" }
    });
    assert.strictEqual(giftedWallet.data.giftBalance, 0.4);

    const rechargeOrder = await request("/api/wallet/recharge", {
      method: "POST",
      cookie: inviteeCookie,
      body: { amount: 2, channelCode: "100" }
    });
    await Promise.all([
      callback(rechargeOrder.data, 1, "2.00", true),
      callback(rechargeOrder.data, 1, "2.00", true)
    ]);
    let inviteeWallet = await request("/api/account/wallet", { cookie: inviteeCookie });
    assert.deepStrictEqual(
      [inviteeWallet.data.cashBalance, inviteeWallet.data.giftBalance, inviteeWallet.data.vipSpend],
      [2, 0.4, 3.03]
    );

    const walletOrder = await request("/api/payments/orders", {
      method: "POST",
      cookie: inviteeCookie,
      body: { optionId: "pro-test-001", channelCode: "100", confirmReplacement: true }
    });
    assert.strictEqual(walletOrder.data.status, "paid");
    assert.deepStrictEqual(
      [walletOrder.data.walletGiftAmount, walletOrder.data.walletReferralAmount, walletOrder.data.walletCashAmount, walletOrder.data.amount],
      [0.4, 0, 0.63, 0]
    );
    assert.strictEqual(walletOrder.data.realCashAmount, 0.63);
    assert.strictEqual(walletOrder.data.virtualCashAmount, 0.4);
    inviteeWallet = await request("/api/account/wallet", { cookie: inviteeCookie });
    assert.deepStrictEqual(
      [inviteeWallet.data.cashBalance, inviteeWallet.data.giftBalance, inviteeWallet.data.vipSpend],
      [1.37, 0, 3.03]
    );
    assert.deepStrictEqual(inviteeWallet.data.entries.slice(0, 3).map(entry => entry.type), ["purchase", "recharge", "reward"]);

    const invalidGift = await request(`/api/users/${inviteeUser.id}/wallet-gift`, { method: "POST", cookie: adminCookie, body: { amount: 0 } });
    const invalidRecharge = await request("/api/wallet/recharge", { method: "POST", cookie: inviteeCookie, body: { amount: -1, channelCode: "100" } });
    assert.strictEqual(invalidGift.response.status, 400);
    assert.strictEqual(invalidRecharge.response.status, 400);

    const inviteeEntries = await database.query(
      "SELECT type, cash_delta_cents, gift_delta_cents, referral_delta_cents, vip_delta_cents FROM wallet_entries WHERE account_id = $1 ORDER BY created_at",
      [inviteeUser.accountId]
    );
    assert.deepStrictEqual(inviteeEntries.rows.map(entry => entry.type), ["purchase", "reward", "recharge", "purchase"]);
    assert.deepStrictEqual(inviteeEntries.rows.map(entry => [Number(entry.cash_delta_cents), Number(entry.gift_delta_cents), Number(entry.vip_delta_cents)]), [
      [0, 0, 103],
      [0, 40, 0],
      [200, 0, 200],
      [-63, -40, 0]
    ]);
    const inviterAccount = (await database.query("SELECT data FROM app_records WHERE collection = 'accounts' AND data->>'email' = 'inviter@example.test'")).rows[0].data;
    const inviterEntries = await database.query(
      "SELECT type, cash_delta_cents, referral_delta_cents, vip_delta_cents FROM wallet_entries WHERE account_id = $1 ORDER BY created_at",
      [inviterAccount.id]
    );
    assert.deepStrictEqual(inviterEntries.rows.map(entry => entry.type), ["referral", "purchase"]);
    assert.deepStrictEqual(inviterEntries.rows.map(entry => [Number(entry.cash_delta_cents), Number(entry.referral_delta_cents), Number(entry.vip_delta_cents)]), [
      [0, 10, 0],
      [0, -10, 93]
    ]);

    const inviteeRewards = await database.query("SELECT data FROM app_records WHERE collection = 'referralRewards' AND data->>'inviteeAccountId' = $1", [inviteeUser.accountId]);
    assert.strictEqual(inviteeRewards.rowCount, 1, "non-recurring referrals must only reward the first paid plan order");

    const blockedRechargeReversal = await request(`/api/admin/orders/${rechargeOrder.data.id}/reverse`, { method: "POST", cookie: adminCookie });
    assert.strictEqual(blockedRechargeReversal.response.status, 400);
    assert.match(blockedRechargeReversal.data.error, /后续订单/);

    const reversedWalletOrder = await request(`/api/admin/orders/${walletOrder.data.id}/reverse`, { method: "POST", cookie: adminCookie });
    assert.strictEqual(reversedWalletOrder.response.status, 200);
    assert.strictEqual(reversedWalletOrder.data.fulfillmentStatus, "reversed");
    assert.ok(reversedWalletOrder.data.reversedAt);
    const repeatedReversal = await request(`/api/admin/orders/${walletOrder.data.id}/reverse`, { method: "POST", cookie: adminCookie });
    assert.strictEqual(repeatedReversal.response.status, 200);
    inviteeWallet = await request("/api/account/wallet", { cookie: inviteeCookie });
    assert.deepStrictEqual(
      [inviteeWallet.data.cashBalance, inviteeWallet.data.giftBalance, inviteeWallet.data.vipSpend],
      [2, 0.4, 3.03]
    );

    const reversedRecharge = await request(`/api/admin/orders/${rechargeOrder.data.id}/reverse`, { method: "POST", cookie: adminCookie });
    assert.strictEqual(reversedRecharge.response.status, 200);
    inviteeWallet = await request("/api/account/wallet", { cookie: inviteeCookie });
    assert.deepStrictEqual(
      [inviteeWallet.data.cashBalance, inviteeWallet.data.giftBalance, inviteeWallet.data.vipSpend],
      [0, 0.4, 1.03]
    );

    const reversedInviterOrder = await request(`/api/admin/orders/${inviterOrder.data.id}/reverse`, { method: "POST", cookie: adminCookie });
    assert.strictEqual(reversedInviterOrder.response.status, 200);
    let restoredInviterWallet = await request("/api/account/wallet", { cookie: inviterCookie });
    assert.deepStrictEqual([restoredInviterWallet.data.referralBalance, restoredInviterWallet.data.vipSpend], [0.1, 0]);

    const reversedInviteeOrder = await request(`/api/admin/orders/${inviteeOrder.data.id}/reverse`, { method: "POST", cookie: adminCookie });
    assert.strictEqual(reversedInviteeOrder.response.status, 200);
    referrals = await request("/api/account/referrals", { cookie: inviterCookie });
    assert.deepStrictEqual([referrals.data.pendingAmount, referrals.data.earnedAmount, referrals.data.referralBalance], [0, 0, 0]);
    restoredInviterWallet = await request("/api/account/wallet", { cookie: inviterCookie });
    assert.strictEqual(restoredInviterWallet.data.referralBalance, 0);
    const reversedUsers = await request("/api/users", { cookie: adminCookie });
    assert.strictEqual(reversedUsers.data.find(item => item.email === "invitee@example.test")?.registeredOnly, true);
    const reversedBills = await database.query("SELECT COUNT(*)::int AS count FROM app_records WHERE collection = 'bills' AND data->>'paymentOrderId' = ANY($1::text[]) AND data->>'reversedAt' <> ''", [[walletOrder.data.id, inviterOrder.data.id, inviteeOrder.data.id]]);
    assert.strictEqual(reversedBills.rows[0].count, 3);
    const reversalEntries = await database.query("SELECT COUNT(*)::int AS count FROM wallet_entries WHERE idempotency_key LIKE 'reversal:%' AND source_id = ANY($1::text[])", [[walletOrder.data.id, rechargeOrder.data.id, inviterOrder.data.id, inviteeOrder.data.id]]);
    assert.strictEqual(reversalEntries.rows[0].count, 5, "four orders plus the settled referral must each be reversed once");

    await request(`/api/subscriptions/${subscription.id}`, { method: "PUT", cookie: adminCookie, body: { enabled: false } });
    const noPoolOrder = await createOrder({ optionId: "basic-360" });
    assert.strictEqual(noPoolOrder.response.status, 201);
    await callback(noPoolOrder.data, 1, String(noPoolOrder.data.amount), true);
    status = await request(`/api/payments/orders/${noPoolOrder.data.id}`, { cookie });
    assert.strictEqual(status.data.fulfillmentStatus, "fulfilled");
    assert.strictEqual(status.data.fulfillmentError, "");

    const visiblePendingOrder = await createOrder({ optionId: "ultra-360", useBalance: false });
    assert.strictEqual(visiblePendingOrder.response.status, 201);
    assert.strictEqual(visiblePendingOrder.data.status, "pending");
    const adminOrders = await request("/api/admin/orders", { cookie: adminCookie });
    assert.strictEqual(adminOrders.response.status, 200);
    const adminOrderIds = new Set(adminOrders.data.map(item => item.id));
    for (const order of [visiblePendingOrder.data, cancelledOrder.data, failedOrder.data, paidOrder.data, noPoolOrder.data]) assert.ok(adminOrderIds.has(order.id));
    const noPoolAdminOrder = adminOrders.data.find(item => item.id === noPoolOrder.data.id);
    assert.strictEqual(noPoolAdminOrder.status, "paid");
    assert.strictEqual(noPoolAdminOrder.fulfillmentStatus, "fulfilled");
    assert.strictEqual(noPoolAdminOrder.internalFulfillmentError, "");
    const adminOrderDetail = await request(`/api/admin/orders/${noPoolOrder.data.id}`, { cookie: adminCookie });
    assert.strictEqual(adminOrderDetail.data.id, noPoolOrder.data.id);
    const reversedFailedFulfillment = await request(`/api/admin/orders/${noPoolOrder.data.id}/reverse`, { method: "POST", cookie: adminCookie });
    assert.strictEqual(reversedFailedFulfillment.response.status, 200);
    assert.strictEqual(reversedFailedFulfillment.data.fulfillmentStatus, "reversed");
    const buyerUsersAfterFailedReversal = await database.query("SELECT COUNT(*)::int AS count FROM app_records WHERE collection = 'users' AND data->>'email' = 'buyer@example.test'");
    assert.strictEqual(buyerUsersAfterFailedReversal.rows[0].count, 1, "reversing a failed renewal must not duplicate the existing user");
    const forbiddenManualConfirmation = await request(`/api/admin/orders/${visiblePendingOrder.data.id}/mark-paid`, { method: "POST", cookie });
    assert.strictEqual(forbiddenManualConfirmation.response.status, 403);
    const manuallyPaidOrder = await request(`/api/admin/orders/${visiblePendingOrder.data.id}/mark-paid`, { method: "POST", cookie: adminCookie });
    assert.strictEqual(manuallyPaidOrder.response.status, 200);
    assert.deepStrictEqual([manuallyPaidOrder.data.status, manuallyPaidOrder.data.channelCode, manuallyPaidOrder.data.paymentProvider, manuallyPaidOrder.data.fulfillmentStatus], ["paid", "manual", "manual", "fulfilled"]);
    await callback(manuallyPaidOrder.data, 2, String(manuallyPaidOrder.data.amount), true);
    const manuallyPaidOrderAfterLateCallback = await request(`/api/payments/orders/${manuallyPaidOrder.data.id}`, { cookie });
    assert.deepStrictEqual([manuallyPaidOrderAfterLateCallback.data.status, manuallyPaidOrderAfterLateCallback.data.channelCode], ["paid", "manual"]);
    const repeatedManualConfirmation = await request(`/api/admin/orders/${visiblePendingOrder.data.id}/mark-paid`, { method: "POST", cookie: adminCookie });
    assert.strictEqual(repeatedManualConfirmation.response.status, 400);

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

    console.log("Payment chain checks passed: payments, wallet priority, referral spending, idempotent reversals, snapshots, ledger entries, and validation.");
  } finally {
    if (app) await close(app);
    if (handler) await handler.closeDataStore();
    await close(gateway);
    await close(xui);
    await database.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
