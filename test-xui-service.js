const assert = require("assert");
const http = require("http");
const { createXuiApp, validateRequest, validateTrafficReset } = require("./xui-app");
const { requestXui } = require("./xui-client");
const { createMainApp } = require("./main-app");

class FakeRedis {
  constructor() { this.values = new Map(); }
  async ping() { return "PONG"; }
  async set(key, value, options) {
    if (options?.NX && this.values.has(key)) return null;
    this.values.set(key, value);
    return "OK";
  }
  async eval(_script, { keys, arguments: values }) {
    if (this.values.get(keys[0]) !== values[0]) return 0;
    this.values.delete(keys[0]);
    return 1;
  }
}

class FakeStore {
  constructor() { this.state = new Map(); this.clients = new Map(); }
  async ping() {}
  async getState(key) { return this.state.get(key) || null; }
  async setState(key, data) { this.state.set(key, data); }
  async getClient(userId) { return this.clients.get(userId) || null; }
  async setClient(userId, data) { this.clients.set(userId, data); }
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function main() {
  assert.throws(() => validateRequest({ baseUrl: "file:///tmp", apiToken: "x", apiPath: "/status" }, {}), /HTTP/);
  assert.throws(() => validateRequest({ baseUrl: "https://panel.test", apiToken: "x", apiPath: "https://evil.test" }, {}), /路径/);
  assert.deepStrictEqual(validateTrafficReset({ reason: "calendar_month", month: "2026-08" }), { reason: "calendar_month", reference: "2026-08" });
  assert.throws(() => validateTrafficReset({ reason: "paid" }), /支付订单号/);

  const calls = [];
  const store = new FakeStore();
  const app = createXuiApp({
    redis: new FakeRedis(),
    store,
    token: "internal-test-token",
    baseUrl: "https://panel.test",
    apiToken: "panel-token",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ success: true, obj: { status: "ok" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const data = await requestXui({
      serviceUrl: `http://127.0.0.1:${port}`,
      serviceToken: "internal-test-token",
      baseUrl: "https://panel.test/base",
      apiToken: "panel-token",
      apiPath: "/panel/api/server/status",
      timeoutMs: 1000
    });
    assert.deepStrictEqual(data, { status: "ok" });
    assert.strictEqual(calls[0].url, "https://panel.test/base/panel/api/server/status");
    assert.strictEqual(calls[0].options.headers.authorization, "Bearer panel-token");

    await store.setClient("user-1", { email: "buyer@example.test" });
    await store.setState("billing", { users: { "buyer@example.test": { nodes: { hk: { rawBytes: 12, weightedBytes: 24 } }, rawBytes: 12, weightedBytes: 24, disabled: true } } });
    const reset = async body => {
      const response = await fetch(`http://127.0.0.1:${port}/internal/clients/user-1/traffic-reset`, {
        method: "POST",
        headers: { authorization: "Bearer internal-test-token", "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      return { response, data: await response.json() };
    };
    const firstReset = await reset({ reason: "calendar_month", month: "2026-08" });
    const repeatedReset = await reset({ reason: "calendar_month", month: "2026-08" });
    assert.strictEqual(firstReset.response.status, 200);
    assert.strictEqual(firstReset.data.data.replayed, false);
    assert.strictEqual(repeatedReset.data.data.replayed, true);
    assert.strictEqual(calls.filter(call => call.url.includes("/resetTraffic/")).length, 1);
    assert.deepStrictEqual((await store.getState("billing")).users["buyer@example.test"].nodes, {});
    assert.deepStrictEqual(validateTrafficReset({ reason: "paid", paymentOrderId: "order-1" }), { reason: "paid", reference: "order-1" });
    assert.strictEqual((await reset({ reason: "paid", paymentOrderId: "order-1" })).response.status, 200);
    await store.setClient("user-2", { email: "other@example.test" });
    const reusedOrder = await fetch(`http://127.0.0.1:${port}/internal/clients/user-2/traffic-reset`, {
      method: "POST",
      headers: { authorization: "Bearer internal-test-token", "content-type": "application/json" },
      body: JSON.stringify({ reason: "paid", paymentOrderId: "order-1" })
    });
    assert.strictEqual(reusedOrder.status, 409);

    const stateResponse = await fetch(`http://127.0.0.1:${port}/internal/state/billing`, {
      method: "PUT",
      headers: { authorization: "Bearer internal-test-token", "content-type": "application/json" },
      body: JSON.stringify({ users: {} })
    });
    assert.strictEqual(stateResponse.status, 200);
    assert.deepStrictEqual(await store.getState("billing"), { users: {} });

    await assert.rejects(
      requestXui({
        serviceUrl: `http://127.0.0.1:${port}`,
        serviceToken: "wrong-token",
        baseUrl: "https://panel.test",
        apiToken: "panel-token",
        apiPath: "/status",
        timeoutMs: 1000
      }),
      /Unauthorized/
    );
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  const mainServer = http.createServer(createMainApp((req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(req.url);
  }));
  const mainPort = await listen(mainServer);
  try {
    const response = await fetch(`http://127.0.0.1:${mainPort}/api/health`);
    assert.strictEqual(await response.text(), "/api/health");
  } finally {
    await new Promise(resolve => mainServer.close(resolve));
  }
  console.log("3x-ui service tests passed");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
