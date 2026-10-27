// node-hub entry point: `npm run start:hub`.
// Uses the main app's PostgreSQL database (it writes traffic into xui_daily_traffic), so point
// NODE_HUB_DATABASE_URL (or LOCAL_DATABASE_URL / DATABASE_URL) at the same database.
const { loadLocalEnv } = require("../env");

loadLocalEnv();

const http = require("http");
const logger = require("../logger");
const { NodeHubStore } = require("./store");
const { createNodeHubHandler } = require("./app");

function hubDatabaseUrl() {
  return process.env.NODE_HUB_DATABASE_URL || process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL || "";
}

async function main() {
  const databaseUrl = hubDatabaseUrl();
  if (!databaseUrl) throw new Error("NODE_HUB_DATABASE_URL (or LOCAL_DATABASE_URL / DATABASE_URL) is required.");
  const { Pool } = require("pg");
  const ssl = (process.env.NODE_HUB_DATABASE_SSL ?? process.env.DATABASE_SSL) === "true" && !process.env.LOCAL_DATABASE_URL ? { rejectUnauthorized: false } : undefined;
  const pool = new Pool({ connectionString: databaseUrl, ssl, max: Number(process.env.NODE_HUB_DATABASE_POOL_MAX || 10) });
  pool.on("error", error => logger.error({ component: "node-hub", error: error.message }, "node-hub PostgreSQL error"));
  const store = new NodeHubStore(pool);
  await store.init();
  const handler = createNodeHubHandler({
    store,
    internalToken: String(process.env.NODE_HUB_INTERNAL_TOKEN || "").trim(),
    serverToken: String(process.env.NODE_HUB_SERVER_TOKEN || "").trim(),
    publicUrl: String(process.env.NODE_HUB_PUBLIC_URL || "").replace(/\/+$/, ""),
    installerUrl: process.env.NODE_HUB_INSTALLER_URL || undefined,
    pushInterval: Number(process.env.NODE_HUB_PUSH_INTERVAL || 60),
    pullInterval: Number(process.env.NODE_HUB_PULL_INTERVAL || 60),
    allowRemoteInternal: process.env.NODE_HUB_ALLOW_REMOTE_INTERNAL === "true",
    websocket: process.env.NODE_HUB_WEBSOCKET !== "false",
    logger: logger.child({ component: "node-hub" })
  });
  const host = process.env.NODE_HUB_HOST || "127.0.0.1";
  const port = Number(process.env.NODE_HUB_PORT || 3003);
  const server = http.createServer(handler);
  server.keepAliveTimeout = 65000;
  server.on("upgrade", handler.handleUpgrade);
  server.listen(port, host, () => logger.info({ component: "node-hub", host, port }, "node-hub started"));
  const shutdown = () => {
    handler.close();
    server.close(() => store.close().finally(() => process.exit(0)));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) main().catch(error => {
  logger.fatal({ component: "node-hub", error: error.message }, "node-hub failed to start");
  console.error(error);
  process.exit(1);
});

module.exports = { main, hubDatabaseUrl };
