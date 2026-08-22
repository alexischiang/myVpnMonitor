const { loadLocalEnv, xuiDatabaseUrl } = require("./env");

loadLocalEnv();

const http = require("http");
const { connectRedis } = require("./redis");
const { createXuiApp } = require("./xui-app");
const { XuiDataStore } = require("./xui-database");

async function main() {
  const port = Number(process.env.XUI_SERVICE_PORT || 3002);
  const host = process.env.XUI_SERVICE_HOST || "127.0.0.1";
  const redis = await connectRedis(process.env.REDIS_URL, "xui-service");
  const store = new XuiDataStore(xuiDatabaseUrl());
  await store.init();
  const app = createXuiApp({
    redis,
    store,
    token: process.env.XUI_SERVICE_TOKEN,
    baseUrl: process.env.XUI_BASE_URL,
    apiToken: process.env.XUI_API_TOKEN,
    timeoutMs: Math.max(1000, Number(process.env.XUI_TIMEOUT_MS || 15000))
  });
  const server = http.createServer(app);
  server.listen(port, host, () => console.log(`3x-ui service is running at http://${host}:${port}`));

  const shutdown = () => server.close(() => Promise.all([redis.quit(), store.close()]).finally(() => process.exit(0)));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) main().catch(error => {
  console.error(error);
  process.exit(1);
});

module.exports = { main };
