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
  let failProvision = false;
  const xuiClients = new Map();
  const xuiRequests = [];
  const xui = http.createServer(async (request, response) => {
    let body = {};
    if (request.method !== "GET") {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      if (raw) body = JSON.parse(raw);
    }
    xuiRequests.push({ url: request.url, body });
    if (failProvision && request.method === "POST") return sendJson(response, 503, { success: false, msg: "simulated delivery outage" });
    const clientMatch = request.url.match(/^\/panel\/api\/clients\/get\/(.+)$/);
    if (clientMatch) {
      const client = xuiClients.get(decodeURIComponent(clientMatch[1]));
      return sendJson(response, client ? 200 : 404, client ? { success: true, obj: client } : { success: false, msg: "not found" });
    }
    if (request.url === "/panel/api/server/status") return sendJson(response, 200, { success: true, obj: { panelGuid: "local" } });
    if (request.url === "/panel/api/clients/list") {
      // Like 3x-ui: a finite totalGB reached by the never-reset panel counter disables the client.
      for (const client of xuiClients.values()) {
        const panelUsed = Number(client.traffic?.up || 0) + Number(client.traffic?.down || 0);
        if (Number(client.totalGB) > 0 && panelUsed >= Number(client.totalGB)) client.enable = false;
      }
      return sendJson(response, 200, { success: true, obj: [...xuiClients.values()].map(client => ({ traffic: { up: 0, down: 0, enable: true }, ...client })) });
    }
    if (request.url === "/panel/api/inbounds/list") return sendJson(response, 200, { success: true, obj: [
      { id: 1, remark: "套餐节点", protocol: "vless", enable: true, originNodeGuid: "local" },
      { id: 2, remark: "个人家宽", protocol: "vless", enable: true, originNodeGuid: "local" },
      { id: 3, remark: "停用家宽", protocol: "vless", enable: false, originNodeGuid: "local" }
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
      if ((body.inboundIds || []).includes(999)) return sendJson(response, 500, { success: false, msg: "simulated attach failure" });
      for (const email of body.emails || []) {
        const client = xuiClients.get(email);
        if (client) client.inboundIds = [...new Set([...(client.inboundIds || []), ...(body.inboundIds || [])])];
      }
      return sendJson(response, 200, { success: true, obj: {} });
    }
    if (request.url === "/panel/api/clients/bulkEnable" || request.url === "/panel/api/clients/bulkDisable") {
      for (const email of body.emails || []) {
        const client = xuiClients.get(email);
        if (client) client.enable = request.url.endsWith("bulkEnable");
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
  const catalogV2Ids = { group: `payment-v2-group-${Date.now()}`, product: `payment-v2-plan-${Date.now()}`, lifetime: `payment-v2-lifetime-${Date.now()}` };
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

    async function purchase(options) {
      const submitted = await request("/api/orders", options);
      if (submitted.response.status !== 201) return submitted;
      assert.strictEqual(submitted.data.status, "pending", "submission must never collect or fulfill");
      const started = await request(`/api/payments/orders/${submitted.data.id}/start`, { ...options, body: options.body || {} });
      return { ...started, response: started.response.ok ? submitted.response : started.response };
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

    const v2Group = await request("/api/catalog-v2/line-groups", { method: "POST", cookie: adminCookie, body: { id: catalogV2Ids.group, name: "Payment V2", isEnabled: true, sortOrder: 0, inboundKeys: ["local:1"] } });
    assert.strictEqual(v2Group.response.status, 201, v2Group.text);
    const v2Product = await request("/api/catalog-v2/products", { method: "POST", cookie: adminCookie, body: {
      id: catalogV2Ids.product, type: "recurring_plan", isEnabled: true, isForSale: true, stock: 2, sortOrder: 0,
      name: "Payment V2 plan", description: "V2 checkout", features: [], isRecommended: false, lineGroupId: catalogV2Ids.group,
      trafficCustomization: { enabled: false, stepBytes: null, stepPriceCents: null, maxSteps: 10 },
      periods: [{ id: "30d", durationDays: 30, trafficBytes: 50 * 1024 ** 3, deviceLimit: 2, priceCents: 100, isEnabled: true, sortOrder: 0 }]
    } });
    assert.strictEqual(v2Product.response.status, 201, v2Product.text);
    const lifetimeProduct = await request("/api/catalog-v2/products", { method: "POST", cookie: adminCookie, body: {
      id: catalogV2Ids.lifetime, type: "lifetime_plan", isEnabled: true, isForSale: false, stock: 1, sortOrder: 0,
      name: "Payment V2 lifetime", description: "Expired renewal", features: [], isRecommended: false, lineGroupId: catalogV2Ids.group,
      trafficBytes: 0, deviceLimit: 3, priceCents: 100
    } });
    assert.strictEqual(lifetimeProduct.response.status, 201, lifetimeProduct.text);
    const publicV2 = await request("/api/public/catalog-v2");
    assert.ok(publicV2.data.some(item => item.id === catalogV2Ids.product));
    const v2Quote = await request("/api/orders/quote", { method: "POST", cookie, body: { optionId: `v2:${catalogV2Ids.product}:30d`, useBalance: false } });
    assert.deepStrictEqual([v2Quote.response.status, v2Quote.data.catalogVersion, v2Quote.data.amount], [200, 2, 1.03]);
    const v2Order = await request("/api/orders", { method: "POST", cookie, body: { optionId: `v2:${catalogV2Ids.product}:30d`, useBalance: false } });
    assert.strictEqual(v2Order.response.status, 201, v2Order.text);
    assert.strictEqual(v2Order.data.productSnapshot.catalogVersion, 2);
    assert.strictEqual((await database.query("SELECT status FROM catalog_v2_inventory_reservations WHERE order_id=$1", [v2Order.data.id])).rows[0].status, "reserved");
    await request(`/api/orders/${v2Order.data.id}`, { method: "DELETE", cookie });
    assert.strictEqual((await database.query("SELECT status FROM catalog_v2_inventory_reservations WHERE order_id=$1", [v2Order.data.id])).rows[0].status, "released");
    xuiRequests.length = 0;

    const quote = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "pro-test-001" } });
    assert.strictEqual(quote.response.status, 200);
    assert.strictEqual(quote.data.amount, 1.03);
    const discountedQuote = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "pro-test-001", couponCode: "save20" } });
    assert.strictEqual(discountedQuote.data.amount, 0.82);
    const expiredQuote = await request("/api/payments/quote", { method: "POST", cookie, body: { optionId: "pro-test-001", couponCode: "expired" } });
    assert.strictEqual(expiredQuote.response.status, 400);

    for (const body of [
      { optionId: "missing", channelCode: "100" },
      { optionId: "pro-test-001", channelCode: "100", couponCode: "INVALID" }
    ]) {
      const invalid = await purchase({ method: "POST", cookie, body });
      assert.strictEqual(invalid.response.status, 400);
    }

    async function createOrder(extra = {}) {
      return purchase({
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

    const callsBeforeSubmission = gatewayRequests.length;
    const submittedOnly = await request("/api/orders", { method: "POST", cookie, body: { optionId: "pro-test-001", useBalance: false } });
    assert.strictEqual(submittedOnly.response.status, 201);
    assert.strictEqual(submittedOnly.data.status, "pending");
    assert.strictEqual(gatewayRequests.length, callsBeforeSubmission);
    assert.strictEqual(xuiRequests.length, 0);
    const concurrentSubmissions = await Promise.all([createOrder(), createOrder()]);
    assert.ok(concurrentSubmissions.every(item => item.response.status === 400));
    const badMethod = await request(`/api/payments/orders/${submittedOnly.data.id}/start`, { method: "POST", cookie, body: { channelCode: "bad" } });
    assert.strictEqual(badMethod.response.status, 400);
    assert.strictEqual((await request(`/api/orders/${submittedOnly.data.id}`, { cookie })).data.status, "pending");
    await request(`/api/orders/${submittedOnly.data.id}`, { method: "DELETE", cookie });
    assert.strictEqual(gatewayRequests.length, callsBeforeSubmission, "local cancellation must not depend on a payment provider");

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
      assert.strictEqual(rejected.response.status, 201);
      assert.strictEqual(rejected.data.status, "pending");
      assert.match(rejected.data.paymentError, /渠道暂时不可用/);
      const retry = await request(`/api/payments/orders/${rejected.data.id}/start`, { method: "POST", cookie, body: { channelCode: "100", clientUserName } });
      assert.strictEqual(retry.data.id, rejected.data.id);
      assert.strictEqual(retry.data.paymentAttemptId, rejected.data.paymentAttemptId);
      assert.strictEqual(retry.data.status, "pending");
      const retained = await request("/api/account/orders", { cookie });
      assert.ok(retained.data.some(order => order.status === "pending"), "gateway failure must retain a pending business order");
      await request(`/api/orders/${rejected.data.id}`, { method: "DELETE", cookie });
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
    assert.strictEqual(status.data.status, "pending", "failed payment attempt does not close the business order");
    await request(`/api/orders/${failedOrder.data.id}`, { method: "DELETE", cookie });

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
    assert.match(status.data.paymentError, /联系客服处理/);

    const mismatchedOrder = await createOrder();
    await callback(mismatchedOrder.data, 1, "0.01", true);
    status = await request(`/api/payments/orders/${mismatchedOrder.data.id}`, { cookie });
    assert.strictEqual(status.data.status, "pending");
    assert.match(status.data.paymentError, /金额/);
    await request(`/api/orders/${mismatchedOrder.data.id}`, { method: "DELETE", cookie });

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
    assert.deepStrictEqual([xuiClients.get("buyer@example.test").flow, xuiClients.get("buyer@example.test").totalGB], ["xtls-rprx-vision", 0], "the panel quota stays unlimited; the app enforces the plan quota");
    const adminBills = await request("/api/bills", { cookie: adminCookie });
    const initialBill = adminBills.data.find(item => item.paymentOrderId === paidOrder.data.id);
    assert.deepStrictEqual([initialBill.type, initialBill.merOrderTid, initialBill.productSnapshot?.planName], ["initial", paidOrder.data.merOrderTid, paidOrder.data.planName]);
    const billDetail = await request(`/api/bills/${adminBills.data[0].id}`, { cookie: adminCookie });
    assert.strictEqual(billDetail.data.payment.channelCode, "100");
    assert.strictEqual(billDetail.data.payment.purchaseAction, "initial");
    assert.strictEqual(billDetail.data.payment.originalAmount, 1);
    assert.strictEqual(billDetail.data.payment.amount, 1.03);

    await database.query(`UPDATE app_records
      SET data = (data || $2::jsonb) - 'xuiClientEmail' - 'xuiSubId' - 'xuiInboundIds'
      WHERE collection = 'users' AND id = $1`, [createdUser.id, JSON.stringify({ email: "legacy-address@example.test", lineType: "upstream", subscriptionId: subscription.id })]);
    xuiClients.delete("buyer@example.test");
    const polledOrder = await createOrder();
    queryResults.set(polledOrder.data.merOrderTid, {
      tid: `query-${polledOrder.data.merOrderTid}`,
      payOrderStatus: 1,
      money: "1.03"
    });
    status = await request(`/api/payments/orders/${polledOrder.data.id}/refresh`, { method: "POST", cookie });
    assert.strictEqual(status.data.status, "paid");
    assert.strictEqual(status.data.fulfillmentStatus, "fulfilled");
    assert.strictEqual(status.data.purchaseCountBefore, 1);
    const migratedPoolUser = (await database.query("SELECT data FROM app_records WHERE collection = 'users' AND id = $1", [createdUser.id])).rows[0].data;
    assert.deepStrictEqual([migratedPoolUser.email, migratedPoolUser.lineType, migratedPoolUser.subscriptionId], ["buyer@example.test", "self_hosted", ""]);
    assert.ok(xuiClients.has("buyer@example.test"), "legacy pool users must be provisioned with the authenticated account email");
    assert.ok(!xuiClients.has("legacy-address@example.test"), "legacy user email must not receive the purchased plan");
    const billsAfterReplacement = await request("/api/bills", { cookie: adminCookie });
    assert.strictEqual(billsAfterReplacement.data.find(item => item.paymentOrderId === polledOrder.data.id).type, "replacement");
    const adminUsers = await request("/api/users", { cookie: adminCookie });
    const purchaseLogs = adminUsers.data[0].userLogs;
    const managedUser = adminUsers.data[0];
    assert.strictEqual(managedUser.lineType, "self_hosted", "new purchases must use self-hosted delivery");
    const saveInboundGroups = async groups => {
      xuiRequests.length = 0;
      const result = await request("/api/xui-inbound-groups", { method: "PUT", cookie: adminCookie, body: { groups, syncGroups: true } });
      assert.strictEqual(result.response.status, 200);
      return xuiRequests.filter(entry => entry.url.startsWith("/panel/api/clients/bulk"));
    };
    assert.deepStrictEqual(await saveInboundGroups({ basic: [1], pro: [1, 2], ultra: [1] }), [
      { url: "/panel/api/clients/bulkAttach", body: { emails: ["buyer@example.test"], inboundIds: [2] } }
    ]);
    assert.deepStrictEqual(await saveInboundGroups({ basic: [1], pro: [1], ultra: [1] }), [
      { url: "/panel/api/clients/bulkDetach", body: { emails: ["buyer@example.test"], inboundIds: [2] } }
    ]);
    assert.deepStrictEqual(await saveInboundGroups({ basic: [1], pro: [2], ultra: [1] }), [
      { url: "/panel/api/clients/bulkAttach", body: { emails: ["buyer@example.test"], inboundIds: [2] } },
      { url: "/panel/api/clients/bulkDetach", body: { emails: ["buyer@example.test"], inboundIds: [1] } }
    ]);
    const staleInboundGroups = await request("/api/xui-inbound-groups", { method: "PUT", cookie: adminCookie, body: { groups: { basic: [1, 999], pro: [1], ultra: [1] }, syncGroups: false } });
    assert.strictEqual(staleInboundGroups.response.status, 200);
    assert.deepStrictEqual(staleInboundGroups.data.groups, { basic: [1], pro: [1], ultra: [1] });
    xuiRequests.length = 0;
    const metadataOnlyInboundSave = await request("/api/xui-inbound-groups", { method: "PUT", cookie: adminCookie, body: { groups: { basic: [999], pro: [999], ultra: [999] }, metadata: { "node:local:1": { region: "香港", inboundType: "package" } }, syncGroups: false } });
    assert.strictEqual(metadataOnlyInboundSave.response.status, 200);
    assert.deepStrictEqual(metadataOnlyInboundSave.data.groups, { basic: [1], pro: [1], ultra: [1] });
    assert.deepStrictEqual(metadataOnlyInboundSave.data.metadata["node:local:1"].region, "香港");
    assert.ok(!xuiRequests.some(entry => entry.url.startsWith("/panel/api/")), "metadata-only inbound saves must not request 3x-ui");
    xuiRequests.length = 0;
    const appOnlyGroupChange = await request("/api/xui-inbound-groups", { method: "PUT", cookie: adminCookie, body: { groups: { basic: [], pro: [1], ultra: [1] }, metadata: { "node:local:1": { region: "上海", inboundType: "package" } }, syncGroups: false, groupsChanged: true } });
    assert.strictEqual(appOnlyGroupChange.response.status, 200);
    assert.deepStrictEqual(appOnlyGroupChange.data.groups, { basic: [], pro: [1], ultra: [1] });
    assert.ok(!xuiRequests.some(entry => entry.url.startsWith("/panel/api/")), "editor group changes must not request 3x-ui");
    assert.ok(!xuiRequests.some(entry => entry.url === "/panel/api/clients/groups/bulkAdd"));
    await request("/api/xui-inbound-groups", { method: "PUT", cookie: adminCookie, body: { groups: { basic: [1], pro: [1], ultra: [1] }, syncGroups: false } });
    xuiClients.get("buyer@example.test").inboundIds = [2];
    xuiRequests.length = 0;
    const resync = await request("/api/xui-inbound-groups/resync", { method: "POST", cookie: adminCookie, body: {} });
    assert.strictEqual(resync.response.status, 200);
    assert.strictEqual(resync.data.checked, 1);
    assert.strictEqual(resync.data.repaired, 1);
    assert.deepStrictEqual(xuiClients.get("buyer@example.test").inboundIds, [1]);
    assert.ok(!xuiRequests.some(entry => entry.url === "/panel/api/server/status"), "resync should reuse the cached inbound snapshot");
    await request(`/api/users/${managedUser.id}/account-status`, { method: "POST", cookie: adminCookie, body: { disabled: true } });
    xuiClients.get("buyer@example.test").group = "basic";
    xuiRequests.length = 0;
    const reenabledUser = await request(`/api/users/${managedUser.id}/account-status`, { method: "POST", cookie: adminCookie, body: { disabled: false } });
    assert.strictEqual(reenabledUser.response.status, 200);
    assert.strictEqual(xuiRequests.find(entry => entry.url === "/panel/api/clients/update/buyer%40example.test")?.body.group, "pro");
    assert.ok(!xuiRequests.some(entry => entry.url === "/panel/api/clients/groups/bulkAdd"));
    const customInboundOptions = await request(`/api/users/${managedUser.id}/custom-inbounds`, { cookie: adminCookie });
    assert.strictEqual(customInboundOptions.response.status, 200);
    assert.deepStrictEqual(customInboundOptions.data.inheritedInboundIds, [1]);
    const customInboundUpdate = await request(`/api/users/${managedUser.id}/custom-inbounds`, { method: "PUT", cookie: adminCookie, body: { inboundIds: [2] } });
    assert.strictEqual(customInboundUpdate.response.status, 200);
    assert.deepStrictEqual(customInboundUpdate.data.xuiExtraInboundIds, [2]);
    assert.deepStrictEqual(customInboundUpdate.data.xuiInboundIds, [1, 2]);
    xuiRequests.length = 0;
    const unchangedCustomInboundUpdate = await request(`/api/users/${managedUser.id}/custom-inbounds`, { method: "PUT", cookie: adminCookie, body: { inboundIds: [2] } });
    assert.strictEqual(unchangedCustomInboundUpdate.response.status, 200);
    assert.ok(!xuiRequests.some(entry => entry.url.startsWith("/panel/api/")), "unchanged custom inbound assignments must not request 3x-ui");
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
    const unconfirmedReplacement = await purchase({ method: "POST", cookie, body: { optionId: "pro-90", channelCode: "100" } });
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
    const inviteeOrder = await purchase({
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

    const inviterOrder = await purchase({
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

    const gatewayCallsBeforeRecharge = gatewayRequests.length;
    const rechargeOrder = await request("/api/wallet/recharge", {
      method: "POST",
      cookie: inviteeCookie,
      body: { amount: 2 }
    });
    assert.strictEqual(rechargeOrder.response.status, 201);
    assert.deepStrictEqual([rechargeOrder.data.status, rechargeOrder.data.purpose, rechargeOrder.data.amount, rechargeOrder.data.walletAmount, rechargeOrder.data.payUrl], ["pending", "recharge", 2, 0, ""]);
    assert.strictEqual(gatewayRequests.length, gatewayCallsBeforeRecharge, "submitting a recharge must not contact the gateway");
    assert.strictEqual((await request("/api/account/wallet", { cookie: inviteeCookie })).data.heldBalance, 0, "a recharge never reserves existing balance");
    const startedRecharge = await request(`/api/payments/orders/${rechargeOrder.data.id}/start`, { method: "POST", cookie: inviteeCookie, body: { channelCode: "100" } });
    assert.deepStrictEqual([startedRecharge.response.status, startedRecharge.data.status, Boolean(startedRecharge.data.payUrl)], [200, "pending", true]);
    await Promise.all([
      callback(rechargeOrder.data, 1, "2.00", true),
      callback(rechargeOrder.data, 1, "2.00", true)
    ]);
    let inviteeWallet = await request("/api/account/wallet", { cookie: inviteeCookie });
    assert.deepStrictEqual(
      [inviteeWallet.data.cashBalance, inviteeWallet.data.giftBalance, inviteeWallet.data.vipSpend],
      [2, 0.4, 3.03]
    );

    assert.strictEqual((await request(`/api/payments/orders/${rechargeOrder.data.id}`, { cookie: inviteeCookie })).data.fulfillmentStatus, "fulfilled");

    // Legacy (pre checkout v2) pending orders are closed on startup and can never collect.
    const legacyOrder = await request("/api/orders", { method: "POST", cookie: inviteeCookie, body: { optionId: "pro-test-001", confirmReplacement: true } });
    assert.strictEqual(legacyOrder.response.status, 201);
    assert.ok((await request("/api/account/wallet", { cookie: inviteeCookie })).data.heldBalance > 0);
    await database.query("UPDATE app_records SET data = data - 'checkoutVersion' WHERE collection = 'paymentOrders' AND id = $1", [legacyOrder.data.id]);
    assert.deepStrictEqual([await handler.closeLegacyPendingPaymentOrders(), await handler.closeLegacyPendingPaymentOrders()], [1, 0]);
    let legacyState = await request(`/api/payments/orders/${legacyOrder.data.id}`, { cookie: inviteeCookie });
    assert.strictEqual(legacyState.data.status, "closed");
    assert.strictEqual((await request("/api/account/wallet", { cookie: inviteeCookie })).data.heldBalance, 0, "closing a legacy order releases its wallet hold");
    const walletBeforeLegacyCallback = (await request("/api/account/wallet", { cookie: inviteeCookie })).data;
    const legacyCallback = await callback(legacyOrder.data, 1, String(legacyOrder.data.amount), true);
    assert.deepStrictEqual([legacyCallback.response.status, legacyCallback.text], [200, "success"]);
    legacyState = await request(`/api/payments/orders/${legacyOrder.data.id}`, { cookie: inviteeCookie });
    assert.deepStrictEqual([legacyState.data.status, legacyState.data.fulfilledAt], ["abnormal", ""], "a receipt without a payment attempt is left for manual handling");
    assert.match(legacyState.data.paymentError, /联系客服/);
    const walletAfterLegacyCallback = (await request("/api/account/wallet", { cookie: inviteeCookie })).data;
    assert.deepStrictEqual([walletAfterLegacyCallback.cashBalance, walletAfterLegacyCallback.vipSpend], [walletBeforeLegacyCallback.cashBalance, walletBeforeLegacyCallback.vipSpend]);
    const forgedLegacy = { merOrderTid: legacyOrder.data.merOrderTid, tid: "forged", status: 1, money: "1.00", sign: "bad" };
    assert.strictEqual((await request("/api/payments/callback", { method: "POST", body: forgedLegacy })).response.status, 400);

    const walletOrder = await purchase({
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

    // A late success after manual collection is auditable and cannot deliver twice.
    await callback(manuallyPaidOrder.data, 1, String(manuallyPaidOrder.data.amount), true);
    const duplicateReceipt = await request(`/api/admin/orders/${manuallyPaidOrder.data.id}`, { cookie: adminCookie });
    assert.deepStrictEqual(duplicateReceipt.data.duplicatePaymentReferences, [manuallyPaidOrder.data.paymentAttemptId]);
    const manualBillCount = await database.query("SELECT COUNT(*)::int AS n FROM app_records WHERE collection='bills' AND data->>'paymentOrderId'=$1", [manuallyPaidOrder.data.id]);
    assert.strictEqual(manualBillCount.rows[0].n, 1);

    const isolatedUser = await request("/api/auth/register", { method: "POST", body: { email: "cashier@example.test", password: "cashier-test-password" } });
    const isolatedCookie = isolatedUser.response.headers.get("set-cookie").split(";", 1)[0];
    const priorCalls = gatewayRequests.length;
    await database.query("INSERT INTO app_records(collection,id,data) VALUES('paymentSettings','disabled',$1::jsonb)", [JSON.stringify({ id: "disabled", enabled: false, name: "Disabled gateway", provider: "legacy" })]);
    const offlineOrder = await request("/api/orders", { method: "POST", cookie: isolatedCookie, body: { optionId: "pro-test-001", useBalance: false } });
    assert.strictEqual(offlineOrder.response.status, 201);
    assert.strictEqual(offlineOrder.data.status, "pending");
    const platforms = await request("/api/payments/platforms", { cookie: isolatedCookie });
    assert.ok(platforms.data.every(item => !item.ready));
    assert.strictEqual(gatewayRequests.length, priorCalls);
    const offlineAdmin = await request("/api/admin/orders", { cookie: adminCookie });
    assert.ok(offlineAdmin.data.some(item => item.id === offlineOrder.data.id && item.status === "pending"));
    const forbiddenStart = await request(`/api/payments/orders/${offlineOrder.data.id}/start`, { method: "POST", cookie, body: {} });
    assert.strictEqual(forbiddenStart.response.status, 404);
    failProvision = true;
    const manualAttempts = await Promise.all([1, 2].map(() => request(`/api/admin/orders/${offlineOrder.data.id}/mark-paid`, { method: "POST", cookie: adminCookie, body: { note: "银行转账已核实" } })));
    assert.deepStrictEqual(manualAttempts.map(item => item.response.status).sort(), [200, 400]);
    const collectedOffline = manualAttempts.find(item => item.response.status === 200);
    assert.strictEqual(collectedOffline.data.status, "paid");
    assert.strictEqual(collectedOffline.data.fulfillmentStatus, "failed");
    assert.strictEqual(collectedOffline.data.manualPaidBy, "payment-admin");
    assert.strictEqual(collectedOffline.data.manualPaymentNote, "银行转账已核实");
    failProvision = false;
    const retriedOffline = await request(`/api/admin/orders/${offlineOrder.data.id}`, { method: "POST", cookie: adminCookie });
    assert.strictEqual(retriedOffline.data.fulfillmentStatus, "fulfilled");
    const offlineBills = await database.query("SELECT COUNT(*)::int AS n FROM app_records WHERE collection='bills' AND data->>'paymentOrderId'=$1", [offlineOrder.data.id]);
    assert.strictEqual(offlineBills.rows[0].n, 1);
    assert.strictEqual(gatewayRequests.length, priorCalls, "manual settlement never needs a provider");

    const expireOrder = await request("/api/orders", { method: "POST", cookie: isolatedCookie, body: { optionId: "pro-test-001", useBalance: false, confirmReplacement: true } });
    await database.query("UPDATE app_records SET data=jsonb_set(data,'{createdAt}',to_jsonb($2::text)) WHERE collection='paymentOrders' AND id=$1", [expireOrder.data.id, new Date(Date.now() - 86400000).toISOString()]);
    const expiredManual = await request(`/api/admin/orders/${expireOrder.data.id}/mark-paid`, { method: "POST", cookie: adminCookie });
    assert.strictEqual(expiredManual.response.status, 400);
    assert.strictEqual((await request(`/api/orders/${expireOrder.data.id}`, { cookie: isolatedCookie })).data.status, "closed");
    await database.query("DELETE FROM app_records WHERE collection='paymentSettings'");

    const racingOrder = await purchase({ method: "POST", cookie: isolatedCookie, body: { optionId: "pro-test-001", useBalance: false, confirmReplacement: true } });
    assert.strictEqual(racingOrder.response.status, 201);
    const race = await Promise.all([
      callback(racingOrder.data, 1, String(racingOrder.data.amount), true),
      request(`/api/admin/orders/${racingOrder.data.id}/mark-paid`, { method: "POST", cookie: adminCookie, body: { note: "concurrent collection" } })
    ]);
    assert.strictEqual(race[0].response.status, 200);
    assert.ok([200, 400].includes(race[1].response.status));
    const raceResult = await request(`/api/orders/${racingOrder.data.id}`, { cookie: isolatedCookie });
    assert.strictEqual(raceResult.data.status, "paid");
    assert.strictEqual(raceResult.data.fulfillmentStatus, "fulfilled");
    const raceBills = await database.query("SELECT COUNT(*)::int AS n FROM app_records WHERE collection='bills' AND data->>'paymentOrderId'=$1", [racingOrder.data.id]);
    assert.strictEqual(raceBills.rows[0].n, 1, "concurrent callback and manual collection must only deliver and bill once");

    const v2Registration = await request("/api/auth/register", { method: "POST", body: { email: "v2-sync@example.test", password: "payment-test-password" } });
    assert.strictEqual(v2Registration.response.status, 201);
    const v2Account = (await request("/api/users", { cookie: adminCookie })).data.find(item => item.email === "v2-sync@example.test");
    await database.query("UPDATE catalog_v2_products SET is_for_sale=FALSE WHERE id=$1", [catalogV2Ids.product]);
    const hiddenOptionId = `v2:${catalogV2Ids.product}:30d`;
    const publicHiddenQuote = await request("/api/orders/quote", { method: "POST", cookie: v2Registration.response.headers.get("set-cookie").split(";", 1)[0], body: { optionId: hiddenOptionId } });
    assert.strictEqual(publicHiddenQuote.response.status, 400);
    const adminHiddenQuote = await request("/api/admin/manual-payments/quote", { method: "POST", cookie: adminCookie, body: { accountId: v2Account.accountId, optionId: hiddenOptionId } });
    assert.strictEqual(adminHiddenQuote.response.status, 200);
    const v2ManualOrder = await request("/api/admin/manual-payments", { method: "POST", cookie: adminCookie, body: { accountId: v2Account.accountId, optionId: `v2:${catalogV2Ids.product}:30d`, amount: 1 } });
    assert.deepStrictEqual([v2ManualOrder.response.status, v2ManualOrder.data.productSnapshot.catalogVersion, v2ManualOrder.data.fulfillmentStatus], [201, 2, "fulfilled"]);
    const v2User = (await request("/api/users", { cookie: adminCookie })).data.find(item => item.email === "v2-sync@example.test");
    assert.deepStrictEqual([v2User.productCatalogVersion, v2User.v2ProductId, v2User.v2LineGroupId], [2, catalogV2Ids.product, catalogV2Ids.group]);
    assert.deepStrictEqual(xuiClients.get("v2-sync@example.test").inboundIds, [1]);
    assert.strictEqual((await database.query("SELECT stock FROM catalog_v2_products WHERE id=$1", [catalogV2Ids.product])).rows[0].stock, 1);
    const catalogBeforeSync = (await database.query("SELECT row_to_json(p) AS value FROM catalog_v2_products p WHERE id=$1", [catalogV2Ids.product])).rows[0].value;
    xuiClients.get("v2-sync@example.test").inboundIds = [2];
    xuiClients.get("v2-sync@example.test").group = "panel-change-must-not-write-back";
    await database.query("UPDATE app_records SET data=data || $2::jsonb WHERE collection='users' AND id=$1", [v2User.id, JSON.stringify({ xuiClientPresent: false, xuiClientMissingAt: "2026-01-01T00:00:00.000Z" })]);
    const syncReport = await handler.syncCatalogV2ToXui({ forceReload: true });
    assert.deepStrictEqual([syncReport.checked >= 1, syncReport.updated >= 1, syncReport.failed.length], [true, true, 0]);
    assert.deepStrictEqual(xuiClients.get("v2-sync@example.test").inboundIds, [1]);
    assert.strictEqual(xuiClients.get("v2-sync@example.test").group, catalogV2Ids.group);
    assert.strictEqual((await request(`/api/users/${v2User.id}`, { cookie: adminCookie })).data.xuiClientPresent, true);
    assert.deepStrictEqual((await database.query("SELECT row_to_json(p) AS value FROM catalog_v2_products p WHERE id=$1", [catalogV2Ids.product])).rows[0].value, catalogBeforeSync, "3x-ui sync must not write panel state back to V2 catalog data");

    await database.query("UPDATE app_records SET data=data || $2::jsonb WHERE collection='users' AND id=$1", [v2User.id, JSON.stringify({ xuiWeightedTraffic: { usedBytes: 60 * 1024 ** 3 } })]);
    xuiClients.get("v2-sync@example.test").enable = false;
    await handler.syncCatalogV2ToXui({ forceReload: true });
    assert.strictEqual(xuiClients.get("v2-sync@example.test").enable, false, "five-minute V2 sync must not re-enable a client whose traffic is depleted");
    await database.query("UPDATE app_records SET data=data || $2::jsonb WHERE collection='users' AND id=$1", [v2User.id, JSON.stringify({ xuiWeightedTraffic: { usedBytes: 0 } })]);
    await handler.syncCatalogV2ToXui({ forceReload: true });
    assert.strictEqual(xuiClients.get("v2-sync@example.test").enable, true, "five-minute V2 sync must re-enable a client once traffic is available again");
    await database.query("UPDATE app_records SET data=data || $2::jsonb WHERE collection='users' AND id=$1", [v2User.id, JSON.stringify({ xuiWeightedTraffic: { usedBytes: 60 * 1024 ** 3 } })]);
    await handler.syncCatalogV2ToXui();
    assert.strictEqual(xuiClients.get("v2-sync@example.test").enable, true, "the timer path must use the fresh in-memory cache instead of re-reading the database");
    await handler.syncCatalogV2ToXui({ forceReload: true });
    assert.strictEqual(xuiClients.get("v2-sync@example.test").enable, false, "forceReload must pick up database changes made outside the process");
    await database.query("UPDATE app_records SET data=data || $2::jsonb WHERE collection='users' AND id=$1", [v2User.id, JSON.stringify({ xuiWeightedTraffic: { usedBytes: 0 } })]);
    await handler.syncCatalogV2ToXui({ forceReload: true });

    xuiClients.get("v2-sync@example.test").inboundIds = [2];
    xuiRequests.length = 0;
    const panelSync = await handler.syncXuiPanel();
    assert.deepStrictEqual([panelSync.inboundCatalogError?.message, panelSync.trafficError?.message, panelSync.catalogV2Error?.message, panelSync.catalogV2.failed.length], [undefined, undefined, undefined, 0]);
    const panelReads = ["/panel/api/server/status", "/panel/api/nodes/list", "/panel/api/inbounds/list", "/panel/api/clients/list", "/panel/api/clients/activeInbounds"]
      .map(url => xuiRequests.filter(entry => entry.url === url).length);
    assert.deepStrictEqual(panelReads, [1, 1, 1, 1, 1], "the merged five-minute job must read each shared panel endpoint once");
    assert.deepStrictEqual(xuiClients.get("v2-sync@example.test").inboundIds, [1], "the merged job must still repair V2 inbound drift");
    const inboundTable = (await database.query("SELECT key, inbound_id, enabled FROM xui_inbounds ORDER BY inbound_id")).rows;
    assert.deepStrictEqual(inboundTable.map(row => [row.key, row.inbound_id, row.enabled]), [["local:1", 1, true], ["local:2", 2, true], ["local:3", 3, false]], "the panel sync must replace the inbound table");

    xuiRequests.length = 0;
    await handler.probeXuiInbounds();
    assert.strictEqual(xuiRequests.length, 0, "the TCP probe must read targets from the inbound table only");
    const probedRows = (await database.query("SELECT inbound_id, probe_status, probe_checked_at FROM xui_inbounds ORDER BY inbound_id")).rows;
    assert.deepStrictEqual(probedRows.map(row => [row.inbound_id, row.probe_status, Boolean(row.probe_checked_at)]), [[1, "unknown", true], [2, "unknown", true], [3, "disabled", true]], "probe results must be written back (the mock inbounds have no port)");
    const inboundView = await request("/api/xui-inbounds", { cookie: adminCookie });
    assert.strictEqual(inboundView.response.status, 200);
    assert.strictEqual(xuiRequests.length, 0, "the inbound management page must not call 3x-ui or probe");
    assert.deepStrictEqual(inboundView.data.inbounds.map(inbound => [inbound.key, inbound.probeStatus, inbound.name]), [["local:1", "unknown", "套餐节点"], ["local:2", "unknown", "个人家宽"], ["local:3", "disabled", "停用家宽"]]);

    // Sync job monitor: run history, manual runs and status rules.
    await database.query("DELETE FROM sync_job_runs");
    assert.strictEqual((await request("/api/sync-jobs")).response.status, 403, "the sync job monitor must be admin-only");
    const waitForSyncJob = async jobId => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const payload = await request("/api/sync-jobs", { cookie: adminCookie });
        if (!payload.data.modules.flatMap(module => module.jobs).find(job => job.id === jobId).running) return payload;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(`${jobId} did not finish`);
    };
    // Holding the shared lock keeps a manual panel sync running so the duplicate request is deterministic.
    let releaseSyncLock;
    const heldSyncLock = handler.withXuiSyncLock(() => new Promise(resolve => { releaseSyncLock = resolve; }));
    const manualPanel = await request("/api/sync-jobs/xui-panel-sync/run", { method: "POST", cookie: adminCookie, body: {} });
    assert.deepStrictEqual([manualPanel.response.status, Boolean(manualPanel.data.runId)], [202, true]);
    const duplicatePanel = await request("/api/sync-jobs/xui-panel-sync/run", { method: "POST", cookie: adminCookie, body: {} });
    assert.deepStrictEqual([duplicatePanel.response.status, duplicatePanel.data.code], [409, "SYNC_JOB_RUNNING"]);
    const runningPanel = await request("/api/sync-jobs", { cookie: adminCookie });
    assert.deepStrictEqual([runningPanel.data.modules[0].jobs[0].id, runningPanel.data.modules[0].jobs[0].running, runningPanel.data.modules[0].jobs[0].lastRun.status], ["xui-panel-sync", true, "running"]);
    releaseSyncLock();
    await heldSyncLock;
    await waitForSyncJob("xui-panel-sync");
    assert.strictEqual((await request("/api/sync-jobs/unknown-job/run", { method: "POST", cookie: adminCookie, body: {} })).response.status, 404);
    const manualProbe = await request("/api/sync-jobs/xui-inbound-probe/run", { method: "POST", cookie: adminCookie, body: {} });
    assert.strictEqual(manualProbe.response.status, 202);
    const syncJobs = await waitForSyncJob("xui-inbound-probe");
    assert.deepStrictEqual(syncJobs.data.modules.map(module => module.id), ["xui", "traffic", "subscriptions", "referrals"]);
    const probeJob = syncJobs.data.modules[0].jobs.find(job => job.id === "xui-inbound-probe");
    assert.deepStrictEqual([probeJob.configured, probeJob.running, probeJob.lastRun.status, probeJob.lastRun.trigger, probeJob.stats24h.total], [true, false, "success", "manual", 1]);
    const probeRuns = await request("/api/sync-jobs/xui-inbound-probe/runs?limit=10", { cookie: adminCookie });
    assert.deepStrictEqual(probeRuns.data.runs.map(run => [run.id, run.status, run.summary.total, run.summary.byStatus.disabled]), [[manualProbe.data.runId, "success", 3, 1]]);
    const panelRuns = await handler.listSyncJobRuns("xui-panel-sync");
    assert.deepStrictEqual([panelRuns.length, panelRuns[0].id, panelRuns[0].status, panelRuns[0].summary.steps.map(step => step.status), panelRuns[0].summary.catalogV2.failed], [1, manualPanel.data.runId, "success", ["success", "success", "success"], 0]);
    const stepError = new Error("boom");
    assert.strictEqual(handler.xuiPanelSyncJobResult({ inboundCatalogError: null, trafficError: stepError, catalogV2: { checked: 1, updated: 0, missing: 0, skipped: 0, failed: [] }, catalogV2Error: null }).status, "partial");
    assert.strictEqual(handler.xuiPanelSyncJobResult({ inboundCatalogError: null, trafficError: null, catalogV2: { checked: 2, updated: 0, missing: 0, skipped: 0, failed: [{ userId: "u", error: "x" }] }, catalogV2Error: null }).status, "partial");
    const allFailed = handler.xuiPanelSyncJobResult({ inboundCatalogError: stepError, trafficError: stepError, catalogV2: null, catalogV2Error: stepError });
    assert.deepStrictEqual([allFailed.status, allFailed.error.includes("流量计费：boom")], ["failed", true]);
    await handler.trackSyncJobRun({ id: "test-failing-job", run: async () => { throw new Error("prune failed"); } }, "schedule");
    assert.deepStrictEqual((await handler.listSyncJobRuns("test-failing-job")).map(run => [run.status, run.error]), [["failed", "prune failed"]]);
    await handler.runTrackedSyncJob("referral-settlement", "schedule");
    assert.deepStrictEqual(await handler.listSyncJobRuns("referral-settlement"), [], "referral settlement rounds that settle nothing must not be stored");
    await database.query("INSERT INTO sync_job_runs (job_id, trigger, status) VALUES ('test-interrupted-job', 'schedule', 'running')");
    await handler.recoverInterruptedSyncJobRuns();
    assert.strictEqual((await handler.listSyncJobRuns("test-interrupted-job"))[0].status, "interrupted");
    await handler.runTrackedSyncJob("xui-traffic-prune", "startup");
    const pruneRun = (await handler.listSyncJobRuns("xui-traffic-prune"))[0];
    assert.deepStrictEqual([pruneRun.trigger, pruneRun.status, Number.isInteger(pruneRun.summary.deleted)], ["startup", "success", true], "the startup daily traffic prune must be recorded");
    await database.query(`INSERT INTO sync_job_runs (job_id, trigger, status, started_at) VALUES
      ('test-prune-old', 'schedule', 'success', NOW() - INTERVAL '15 days'),
      ('test-prune-kept', 'schedule', 'success', NOW() - INTERVAL '13 days')`);
    assert.ok(await handler.pruneSyncJobHistory() >= 1);
    assert.deepStrictEqual([(await handler.listSyncJobRuns("test-prune-old")).length, (await handler.listSyncJobRuns("test-prune-kept")).length], [0, 1], "runs older than 14 days are pruned and newer ones kept");
    await database.query("DELETE FROM sync_job_runs WHERE job_id LIKE 'test-%'");

    xuiClients.get("v2-sync@example.test").enable = false;
    xuiRequests.length = 0;
    await handler.syncXuiPanel();
    assert.ok(xuiRequests.some(entry => entry.url === "/panel/api/clients/bulkEnable" && entry.body.emails.includes("v2-sync@example.test")));
    assert.ok(!xuiRequests.some(entry => entry.url === "/panel/api/clients/update/v2-sync%40example.test"), "the V2 step must see the traffic step's re-enable in the shared snapshot and not resend it");
    assert.strictEqual(xuiClients.get("v2-sync@example.test").enable, true);

    Object.assign(xuiClients.get("v2-sync@example.test"), { totalGB: 50 * 1024 ** 3, traffic: { up: 60 * 1024 ** 3, down: 0, enable: true } });
    await handler.syncXuiPanel();
    xuiRequests.length = 0;
    await handler.syncXuiPanel();
    assert.strictEqual(xuiClients.get("v2-sync@example.test").totalGB, 0, "the panel quota must stay unlimited; the app enforces quota");
    assert.strictEqual(xuiClients.get("v2-sync@example.test").enable, true, "a client within its app quota must stay enabled even when the panel counter exceeds the old panel quota");
    assert.ok(!xuiRequests.some(entry => entry.url === "/panel/api/clients/bulkEnable" && entry.body.emails.includes("v2-sync@example.test")), "no panel-disable/app-enable loop across rounds");
    delete xuiClients.get("v2-sync@example.test").traffic;

    xuiClients.get("v2-sync@example.test").inboundIds = [2];
    xuiClients.get("v2-sync@example.test").enable = false;
    xuiRequests.length = 0;
    const readOnlyReport = await handler.syncCatalogV2ToXui({ forceReload: true, readOnly: true });
    const writeUrls = /\/panel\/api\/clients\/(update\/|add$|bulkAttach$|bulkDetach$|bulkEnable$|bulkDisable$)/;
    assert.deepStrictEqual(xuiRequests.filter(entry => writeUrls.test(entry.url)).map(entry => entry.url), [], "read-only V2 sync must not write to 3x-ui");
    assert.deepStrictEqual([readOnlyReport.updated, readOnlyReport.skipped, readOnlyReport.failed.length], [0, 1, 0]);
    assert.deepStrictEqual([xuiClients.get("v2-sync@example.test").inboundIds, xuiClients.get("v2-sync@example.test").enable], [[2], false]);
    const repairedReport = await handler.syncCatalogV2ToXui({ forceReload: true });
    assert.deepStrictEqual([repairedReport.updated, repairedReport.skipped], [1, 0]);
    assert.deepStrictEqual([xuiClients.get("v2-sync@example.test").inboundIds, xuiClients.get("v2-sync@example.test").enable], [[1], true]);

    xuiRequests.length = 0;
    const batchFailures = await handler.applyXuiInboundChanges([
      { email: "batch-a@example.test", attach: [2, 1], detach: [3] },
      { email: "batch-b@example.test", attach: [1, 2] },
      { email: "batch-c@example.test", attach: [999], detach: [3] }
    ]);
    assert.deepStrictEqual(xuiRequests.map(entry => entry.url === "/panel/api/clients/bulkAttach" || entry.url === "/panel/api/clients/bulkDetach" ? entry : null).filter(Boolean), [
      { url: "/panel/api/clients/bulkAttach", body: { emails: ["batch-a@example.test", "batch-b@example.test"], inboundIds: [1, 2] } },
      { url: "/panel/api/clients/bulkAttach", body: { emails: ["batch-c@example.test"], inboundIds: [999] } },
      { url: "/panel/api/clients/bulkDetach", body: { emails: ["batch-a@example.test"], inboundIds: [3] } }
    ], "clients with the same sorted inbound set share one request, and a failed attach skips that client's detach");
    assert.deepStrictEqual([...batchFailures.keys()], ["batch-c@example.test"]);

    await database.query("UPDATE app_records SET data=data || $2::jsonb WHERE collection='users' AND id=$1", [v2User.id, JSON.stringify({ expiresAt: "2020-01-01T00:00:00.000Z", xuiIpLimit: 1 })]);
    const lifetimeOrder = await request("/api/admin/manual-payments", { method: "POST", cookie: adminCookie, body: { accountId: v2Account.accountId, optionId: `v2:${catalogV2Ids.lifetime}`, amount: 1 } });
    assert.deepStrictEqual([lifetimeOrder.response.status, lifetimeOrder.data.fulfillmentStatus], [201, "fulfilled"], lifetimeOrder.text);
    const lifetimeUser = (await request(`/api/users/${v2User.id}`, { cookie: adminCookie })).data;
    assert.deepStrictEqual([lifetimeUser.duration, lifetimeUser.productCatalogVersion, lifetimeUser.v2ProductId], ["lifetime", 2, catalogV2Ids.lifetime]);
    assert.strictEqual(xuiClients.get("v2-sync@example.test").expiryTime, new Date(lifetimeUser.expiresAt).getTime());
    assert.strictEqual(xuiClients.get("v2-sync@example.test").enable, true);
    assert.strictEqual(xuiClients.get("v2-sync@example.test").limitIp, 3, "a new V2 plan must replace the previous device limit");

    xuiClients.delete("v2-sync@example.test");
    xuiRequests.length = 0;
    const readOnlyMissing = await handler.syncCatalogV2ToXui({ forceReload: true, readOnly: true });
    assert.deepStrictEqual([readOnlyMissing.missing, readOnlyMissing.skipped, xuiClients.has("v2-sync@example.test")], [1, 1, false]);
    assert.ok(!xuiRequests.some(entry => entry.url === "/panel/api/clients/add"), "read-only V2 sync must not recreate a missing client");
    const missingReport = await handler.syncCatalogV2ToXui({ forceReload: true });
    assert.strictEqual(missingReport.failed.length, 0);
    assert.ok(xuiClients.has("v2-sync@example.test"), "five-minute V2 sync must restore a missing client");
    assert.strictEqual(xuiClients.get("v2-sync@example.test").expiryTime, new Date(lifetimeUser.expiresAt).getTime());
    await database.query("UPDATE app_records SET data=data-'xuiClientEmail' WHERE collection='users' AND id=$1", [v2User.id]);
    const unlinkedPanelClient = structuredClone(xuiClients.get("v2-sync@example.test"));
    xuiRequests.length = 0;
    const unlinkedReport = await handler.syncCatalogV2ToXui({ forceReload: true });
    assert.deepStrictEqual([unlinkedReport.failed.length, unlinkedReport.updated, unlinkedReport.conflicts], [0, 0, [{ userId: v2User.id, email: "v2-sync@example.test" }]]);
    assert.deepStrictEqual(xuiRequests.filter(entry => writeUrls.test(entry.url)).map(entry => entry.url), [], "an unlinked user must not take over a same-email panel client");
    assert.deepStrictEqual(xuiClients.get("v2-sync@example.test"), unlinkedPanelClient);
    assert.strictEqual((await request(`/api/users/${v2User.id}`, { cookie: adminCookie })).data.xuiClientEmail, undefined, "panel data must not flow back into the app user");
    const conflictRun = handler.xuiPanelSyncJobResult({ inboundCatalogError: null, trafficError: null, catalogV2: unlinkedReport, catalogV2Error: null });
    assert.deepStrictEqual([conflictRun.status, conflictRun.summary.catalogV2.conflicts, conflictRun.summary.catalogV2.conflictEmails], ["partial", 1, ["v2-sync@example.test"]]);
    assert.match(conflictRun.error, /请在面板删除.*v2-sync@example\.test/);
    xuiRequests.length = 0;
    const unlinkedManualSync = await request(`/api/users/${v2User.id}/xui-sync`, { method: "POST", cookie: adminCookie, body: {} });
    assert.deepStrictEqual([unlinkedManualSync.response.status, /未与该用户关联/.test(unlinkedManualSync.data.error)], [409, true], unlinkedManualSync.text);
    assert.deepStrictEqual(xuiRequests.filter(entry => writeUrls.test(entry.url)).map(entry => entry.url), [], "provisionXuiClient entry points must not take over an unlinked panel client either");
    assert.deepStrictEqual(xuiClients.get("v2-sync@example.test"), unlinkedPanelClient);
    assert.strictEqual((await request(`/api/users/${v2User.id}`, { cookie: adminCookie })).data.xuiClientEmail, undefined);
    const legacyUser = { id: "legacy-conflict", customerID: "900001", email: "legacy-owner@example.test", lineType: "self_hosted", group: "pro", activeGroup: "pro", expiresAt: "2099-01-01T00:00:00.000Z", xuiTrafficLimitBytes: 1024 ** 3 };
    const legacyClients = new Map([["nexora_900001@internal", { email: "nexora_900001@internal", inboundIds: [1] }]]);
    const legacyFind = async email => legacyClients.get(email) || null;
    await assert.rejects(handler.writeXuiClient(structuredClone(legacyUser), { findClient: legacyFind, allInboundIds: [1, 2], groupInboundIds: [1], dryRun: true }), error => error.code === "XUI_CLIENT_CONFLICT" && error.email === "nexora_900001@internal", "a legacy-email panel client must be reported, not adopted");
    const legacyIgnored = await handler.writeXuiClient(structuredClone(legacyUser), { findClient: legacyFind, allInboundIds: [1, 2], groupInboundIds: [1], checkLegacyEmail: false, dryRun: true });
    assert.deepStrictEqual([legacyIgnored.created, legacyIgnored.email, legacyIgnored.inboundChange], [true, "legacy-owner@example.test", { email: "legacy-owner@example.test", attach: [1], detach: [2] }]);
    // The helpers writeXuiClient is built from.
    assert.deepStrictEqual(handler.xuiInboundChange("a@example.test", [1, 2], [1, 2, 3], [2, 3]), { email: "a@example.test", attach: [1], detach: [3] }, "known inbounds send only differences");
    assert.deepStrictEqual(handler.xuiInboundChange("a@example.test", [1], [1, 2, 3]), { email: "a@example.test", attach: [1], detach: [2, 3] }, "unknown inbounds attach the full set and detach the rest");
    assert.strictEqual(handler.xuiInboundChange("a@example.test", [1], [1, 2], [1, 99]), null, "inbounds outside allInboundIds are never detached");
    const depletedUser = { ...legacyUser, xuiClientEmail: "legacy-owner@example.test", xuiWeightedTraffic: { depleted: true } };
    const desiredClient = handler.desiredXuiClient(depletedUser, { email: "legacy-owner@example.test", group: "pro", existing: { subId: "keep-sub", uuid: "keep-uuid", traffic: { up: 1 }, inboundIds: [1], totalGB: 50 } });
    assert.deepStrictEqual([desiredClient.subId, desiredClient.uuid, desiredClient.totalGB, desiredClient.enable, "traffic" in desiredClient, "inboundIds" in desiredClient], ["keep-sub", "keep-uuid", 0, true, false, false], "the desired client keeps panel-owned identity and drops read-only fields");
    assert.strictEqual(handler.desiredXuiClient(depletedUser, { email: "legacy-owner@example.test", group: "pro", depletionDisables: true }).enable, false);
    await handler.assertNoUnlinkedXuiClient(depletedUser, { email: "legacy-owner@example.test", existing: { email: "legacy-owner@example.test" }, findClient: legacyFind });
    await assert.rejects(handler.assertNoUnlinkedXuiClient(legacyUser, { email: "legacy-owner@example.test", existing: { email: "legacy-owner@example.test" }, findClient: legacyFind }), error => error.code === "XUI_CLIENT_CONFLICT" && error.statusCode === 409);
    xuiClients.delete("v2-sync@example.test");
    const rebuiltReport = await handler.syncCatalogV2ToXui({ forceReload: true });
    assert.deepStrictEqual([rebuiltReport.failed.length, rebuiltReport.conflicts.length, rebuiltReport.missing], [0, 0, 1]);
    assert.strictEqual(xuiClients.get("v2-sync@example.test").expiryTime, new Date(lifetimeUser.expiresAt).getTime(), "the next sync must recreate the deleted client from app data");
    assert.strictEqual((await request(`/api/users/${v2User.id}`, { cookie: adminCookie })).data.xuiClientEmail, "v2-sync@example.test");

    // Legacy pool migration on subscription refresh follows the same rule: a same-email panel
    // client is reported, not adopted, and the next refresh after deleting it creates one.
    const legacyPool = { id: "legacy-pool-user", userId: "legacy-pool@example.test", email: "legacy-pool@example.test", wechatName: "legacy", customerID: "900002", lineType: "upstream", subscriptionId: subscription.id, subscriptionToken: "legacy-pool-token", group: "pro", activeGroup: "pro", duration: "monthly", purchasedAt: new Date().toISOString(), expiresAt: "2099-01-01T00:00:00.000Z", createdAt: new Date().toISOString() };
    await database.query("INSERT INTO app_records (collection, id, data) VALUES ('users', $1, $2::jsonb)", [legacyPool.id, JSON.stringify(legacyPool)]);
    xuiClients.set("legacy-pool@example.test", { email: "legacy-pool@example.test", subId: "panel-only-sub", limitIp: 9, inboundIds: [2], enable: true });
    const panelOnlyClient = structuredClone(xuiClients.get("legacy-pool@example.test"));
    await handler.syncCatalogV2ToXui({ forceReload: true });
    const legacyPoolState = async () => (await database.query("SELECT data FROM app_records WHERE collection = 'users' AND id = $1", [legacyPool.id])).rows[0].data;
    xuiRequests.length = 0;
    await request("/sub/legacy-pool-token");
    const blockedMigration = await legacyPoolState();
    assert.deepStrictEqual([blockedMigration.lineType, blockedMigration.xuiMigrationStatus, blockedMigration.xuiClientEmail, blockedMigration.xuiIpLimit], ["upstream", "failed", undefined, undefined]);
    assert.match(blockedMigration.xuiMigrationError, /未与该用户关联/);
    assert.deepStrictEqual(xuiRequests.filter(entry => writeUrls.test(entry.url)).map(entry => entry.url), [], "legacy migration must not take over a same-email panel client");
    assert.deepStrictEqual(xuiClients.get("legacy-pool@example.test"), panelOnlyClient);
    xuiClients.delete("legacy-pool@example.test");
    await request("/sub/legacy-pool-token");
    const migratedPool = await legacyPoolState();
    assert.deepStrictEqual([migratedPool.lineType, migratedPool.xuiMigrationStatus, migratedPool.xuiMigrationSource, migratedPool.xuiClientEmail], ["self_hosted", "completed", "created", "legacy-pool@example.test"], migratedPool.xuiMigrationError);
    assert.notStrictEqual(xuiClients.get("legacy-pool@example.test").subId, "panel-only-sub", "the recreated client comes from app data, not the deleted panel client");
    await database.query("UPDATE app_records SET data=data || $2::jsonb WHERE collection='users' AND id=$1", [v2User.id, JSON.stringify({ xuiTrafficLimitBytes: 900 * 1024 ** 3, xuiWeightedTraffic: { totalBytes: 900 * 1024 ** 3, usedBytes: 0 }, xuiLastTraffic: { totalBytes: 900 * 1024 ** 3, usedBytes: 0 } })]);
    xuiClients.get("v2-sync@example.test").expiryTime = 0;
    const manualSync = await request(`/api/users/${v2User.id}/xui-sync`, { method: "POST", cookie: adminCookie, body: {} });
    assert.strictEqual(manualSync.response.status, 200, manualSync.text);
    assert.strictEqual(manualSync.data.xuiTrafficLimitBytes, lifetimeUser.xuiTrafficLimitBytes, "manual V2 sync must replace a polluted local quota cache from the product entitlement");
    assert.strictEqual(manualSync.data.xuiWeightedTraffic.totalBytes, lifetimeUser.xuiTrafficLimitBytes);
    assert.strictEqual(manualSync.data.xuiLastTraffic.totalBytes, lifetimeUser.xuiTrafficLimitBytes);
    assert.strictEqual(xuiClients.get("v2-sync@example.test").expiryTime, new Date(lifetimeUser.expiresAt).getTime());
    assert.strictEqual(xuiClients.get("v2-sync@example.test").limitIp, 3, "manual sync must use V2 device limits");
    xuiClients.delete("v2-sync@example.test");
    const manualRestore = await request(`/api/users/${v2User.id}/xui-sync`, { method: "POST", cookie: adminCookie, body: {} });
    assert.strictEqual(manualRestore.response.status, 200, manualRestore.text);
    assert.strictEqual(xuiClients.get("v2-sync@example.test").expiryTime, new Date(lifetimeUser.expiresAt).getTime(), "manual V2 sync must recreate a missing client");
    assert.strictEqual((await request(`/api/users/${v2User.id}/xui-sync`, { method: "POST", cookie: v2Registration.response.headers.get("set-cookie").split(";", 1)[0], body: {} })).response.status, 403);

    const lifetimeBillCount = (await database.query("SELECT COUNT(*)::int AS n FROM app_records WHERE collection='bills' AND data->>'paymentOrderId'=$1", [lifetimeOrder.data.id])).rows[0].n;
    const lifetimeSpend = lifetimeUser.actualPaid;
    await database.query("UPDATE app_records SET data=data || $2::jsonb WHERE collection='users' AND id=$1", [v2User.id, JSON.stringify({
      currentProductId: v2User.currentProductId, currentOptionId: v2User.currentOptionId,
      currentProductOrderId: v2User.currentProductOrderId, currentProductBoundAt: v2User.currentProductBoundAt,
      currentProductSnapshot: v2User.currentProductSnapshot, v2ProductId: v2User.v2ProductId,
      v2PeriodId: v2User.v2PeriodId, v2LineGroupId: v2User.v2LineGroupId, v2ProductSnapshot: v2User.v2ProductSnapshot,
      duration: v2User.duration, expiresAt: "2020-01-01T00:00:00.000Z", purchasedAt: v2User.purchasedAt,
      unlimited: v2User.unlimited, trafficTier: v2User.trafficTier, xuiTrafficLimitBytes: v2User.xuiTrafficLimitBytes
    })]);
    const repairPath = `/api/admin/orders/${lifetimeOrder.data.id}/repair-binding`;
    const staleDetail = await request(`/api/admin/orders/${lifetimeOrder.data.id}`, { cookie: adminCookie });
    assert.strictEqual(staleDetail.data.bindingNeedsRepair, true);
    await database.query("UPDATE app_records SET data=jsonb_set(data, '{xuiTrafficLimitBytes}', to_jsonb($2::bigint)) WHERE collection='users' AND id=$1", [v2User.id, 40 * 1024 ** 3]);
    assert.strictEqual((await request(repairPath, { method: "POST", cookie: adminCookie, body: {} })).response.status, 400, "later entitlement changes must not be overwritten");
    await database.query("UPDATE app_records SET data=jsonb_set(data, '{xuiTrafficLimitBytes}', to_jsonb($2::bigint)) WHERE collection='users' AND id=$1", [v2User.id, v2User.xuiTrafficLimitBytes]);
    const blockedCustomerRepair = await request(repairPath, { method: "POST", cookie: v2Registration.response.headers.get("set-cookie").split(";", 1)[0], body: {} });
    assert.strictEqual(blockedCustomerRepair.response.status, 403);
    const repairedBinding = await request(repairPath, { method: "POST", cookie: adminCookie, body: {} });
    assert.strictEqual(repairedBinding.response.status, 200, repairedBinding.text);
    const repairedUser = (await request(`/api/users/${v2User.id}`, { cookie: adminCookie })).data;
    assert.deepStrictEqual([repairedUser.currentProductOrderId, repairedUser.v2ProductId, repairedUser.duration, repairedUser.expiresAt, repairedUser.actualPaid], [lifetimeOrder.data.id, catalogV2Ids.lifetime, "lifetime", lifetimeUser.expiresAt, lifetimeSpend]);
    assert.deepStrictEqual([xuiClients.get("v2-sync@example.test").expiryTime, xuiClients.get("v2-sync@example.test").limitIp], [new Date(lifetimeUser.expiresAt).getTime(), 3]);
    assert.strictEqual((await request(repairPath, { method: "POST", cookie: adminCookie, body: {} })).response.status, 200, "repair must be idempotent");
    assert.strictEqual((await database.query("SELECT COUNT(*)::int AS n FROM app_records WHERE collection='bills' AND data->>'paymentOrderId'=$1", [lifetimeOrder.data.id])).rows[0].n, lifetimeBillCount, "repair must not duplicate the bill");
    assert.strictEqual((await database.query("SELECT COUNT(*)::int AS n FROM wallet_entries WHERE idempotency_key=$1", [`purchase:${lifetimeOrder.data.id}`])).rows[0].n, 1, "repair must not settle the wallet twice");
    assert.strictEqual((await request(`/api/admin/orders/${lifetimeOrder.data.id}`, { cookie: adminCookie })).data.bindingNeedsRepair, false);

    const newerPlan = await request("/api/admin/manual-payments", { method: "POST", cookie: adminCookie, body: { accountId: v2Account.accountId, optionId: hiddenOptionId, amount: 1 } });
    assert.strictEqual(newerPlan.data.fulfillmentStatus, "fulfilled", newerPlan.text);
    assert.strictEqual((await request(repairPath, { method: "POST", cookie: adminCookie, body: {} })).response.status, 400, "an older order must not override a later paid plan");
    assert.strictEqual((await request(`/api/admin/orders/${lifetimeOrder.data.id}`, { cookie: adminCookie })).data.bindingNeedsRepair, false, "older completed orders must not offer repair");

    const currentV2User = (await request(`/api/users/${v2User.id}`, { cookie: adminCookie })).data;
    const v2QuotaBeforeGift = currentV2User.xuiTrafficLimitBytes;
    xuiClients.get("v2-sync@example.test").totalGB = 900 * 1024 ** 3;
    const trafficGift = await request(`/api/users/${v2User.id}/traffic-gift`, { method: "POST", cookie: adminCookie, body: { trafficGb: 5, note: "integration gift" } });
    assert.strictEqual(trafficGift.response.status, 200, trafficGift.text);
    assert.strictEqual(trafficGift.data.xuiTrafficLimitBytes, v2QuotaBeforeGift + 5 * 1024 ** 3, "admin gifts must add to the local product quota, not the remote panel quota");
    assert.deepStrictEqual(trafficGift.data.xuiAdminTrafficGifts.map(item => [item.bytes, item.note]), [[5 * 1024 ** 3, "integration gift"]]);
    assert.strictEqual(xuiClients.get("v2-sync@example.test").totalGB, 0, "gifts raise only the app quota; the panel quota stays unlimited");
    assert.strictEqual((await request(`/api/users/${v2User.id}/traffic-gift`, { method: "POST", cookie: v2Registration.response.headers.get("set-cookie").split(";", 1)[0], body: { trafficGb: 5 } })).response.status, 403);

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

    // Runs last: the cron subscription refresh fetches the test pools' upstream URLs, which
    // fail and mark the pools with lastError.
    delete process.env.CRON_SECRET;
    assert.strictEqual((await request("/api/cron/refresh")).response.status, 503, "the cron refresh is disabled without CRON_SECRET");
    process.env.CRON_SECRET = "cron-test-secret";
    assert.strictEqual((await request("/api/cron/refresh", { headers: { authorization: "Bearer wrong" } })).response.status, 401);
    const cronRefresh = await request("/api/cron/refresh", { headers: { authorization: "Bearer cron-test-secret" } });
    assert.strictEqual(cronRefresh.response.status, 200, cronRefresh.text);
    const cronRun = (await handler.listSyncJobRuns("subscription-refresh"))[0];
    assert.deepStrictEqual([cronRun.trigger, ["success", "partial"].includes(cronRun.status), cronRun.summary.total], ["cron", true, cronRefresh.data.refreshed], "the cron subscription refresh must be recorded");
    delete process.env.CRON_SECRET;

    console.log("Payment chain checks passed: payments, wallet priority, referral spending, idempotent reversals, snapshots, ledger entries, and validation.");
  } finally {
    await database.query("DELETE FROM catalog_v2_inventory_reservations WHERE product_id=$1", [catalogV2Ids.product]).catch(() => {});
    await database.query("DELETE FROM catalog_v2_inventory_reservations WHERE product_id=$1", [catalogV2Ids.lifetime]).catch(() => {});
    await database.query("DELETE FROM catalog_v2_products WHERE id=$1", [catalogV2Ids.product]).catch(() => {});
    await database.query("DELETE FROM catalog_v2_products WHERE id=$1", [catalogV2Ids.lifetime]).catch(() => {});
    await database.query("DELETE FROM catalog_v2_line_groups WHERE id=$1", [catalogV2Ids.group]).catch(() => {});
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
