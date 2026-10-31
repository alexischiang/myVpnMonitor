// Reference client for the node API, written from xboard-node internal/panel/client.go: GET
// requests carry auth in the query string, POST requests in the JSON body (injectAuth),
// config/user use If-None-Match and treat 304 as "unchanged", and machine mode sends
// machine_id + node_id. Used by the tests to drive node-hub exactly like a real node.
const assert = require("node:assert/strict");

class XboardNodeClient {
  constructor(baseUrl, { token, machineId = 0, nodeId = 0 }) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.machineId = machineId;
    this.nodeId = nodeId;
    this.configETag = "";
    this.userETag = "";
  }

  forNode(nodeId) {
    return new XboardNodeClient(this.baseUrl, { token: this.token, machineId: this.machineId, nodeId });
  }

  auth() {
    const out = { token: this.token };
    if (this.machineId > 0) {
      out.machine_id = this.machineId;
      if (this.nodeId > 0) out.node_id = this.nodeId;
    } else out.node_id = this.nodeId;
    return out;
  }

  async request(method, pathname, body = null, ifNoneMatch = "") {
    let url = this.baseUrl + pathname;
    const headers = { "content-type": "application/json", accept: "application/json" };
    if (ifNoneMatch) headers["if-none-match"] = ifNoneMatch;
    let payload;
    if (method === "GET") url += `?${new URLSearchParams(Object.entries(this.auth()).map(([k, v]) => [k, String(v)]))}`;
    else payload = JSON.stringify({ ...(body || {}), ...this.auth() });
    return fetch(url, { method, headers, body: payload });
  }

  get configPath() { return this.machineId > 0 ? "/api/v2/server/config" : "/api/v1/server/UniProxy/config"; }
  get userPath() { return this.machineId > 0 ? "/api/v2/server/user" : "/api/v1/server/UniProxy/user"; }

  async handshake() {
    const response = await this.request("POST", "/api/v2/server/handshake");
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }

  async machineNodes() {
    const response = await this.request("POST", "/api/v2/server/machine/nodes");
    if (response.status !== 200) throw Object.assign(new Error(await response.text()), { status: response.status });
    return response.json();
  }

  async getConfig() {
    const response = await this.request("GET", this.configPath, null, this.configETag);
    if (response.status === 304) return null;
    if (response.status !== 200) throw Object.assign(new Error(await response.text()), { status: response.status });
    const config = await response.json();
    if (!config.protocol) throw new Error("invalid config: missing protocol");
    this.configETag = response.headers.get("etag") || "";
    return config;
  }

  async getUsers() {
    const response = await this.request("GET", this.userPath, null, this.userETag);
    if (response.status === 304) return null;
    if (response.status !== 200) throw Object.assign(new Error(await response.text()), { status: response.status });
    this.userETag = response.headers.get("etag") || "";
    return (await response.json()).users;
  }

  // Report(traffic, alive, online, cpu, mem, swap, disk, metrics): maps are keyed by user id strings
  // and only included when non-empty.
  async report({ traffic = {}, alive = {}, online = {}, cpu = 12.5, metrics = {}, reportId } = {}) {
    const payload = {};
    if (Object.keys(traffic).length) payload.traffic = traffic;
    if (Object.keys(alive).length) payload.alive = alive;
    if (Object.keys(online).length) payload.online = online;
    payload.status = { cpu, mem: { total: 2048, used: 1024 }, swap: { total: 0, used: 0 }, disk: { total: 40960, used: 1000 } };
    if (Object.keys(metrics).length) payload.metrics = metrics;
    if (reportId) payload.report_id = reportId;
    const response = await this.request("POST", "/api/v2/server/report", payload);
    if (response.status !== 200) throw Object.assign(new Error(await response.text()), { status: response.status });
    return response.json();
  }

  async machineStatus() {
    const response = await this.request("POST", "/api/v2/server/machine/status", { cpu: 20, mem: { total: 4096, used: 2048 }, swap: { total: 0, used: 0 }, disk: { total: 100, used: 10 }, net: { in_speed: 10.5, out_speed: 20.25 } });
    assert.equal(response.status, 200, await response.clone().text());
  }
}

module.exports = { XboardNodeClient };
