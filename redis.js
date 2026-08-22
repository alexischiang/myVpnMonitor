const crypto = require("crypto");
const { createClient } = require("redis");

async function connectRedis(url, name) {
  if (!url) throw new Error("REDIS_URL is required.");
  const client = createClient({ url });
  client.on("error", error => console.error(`[${name}] Redis error:`, error.message));
  await client.connect();
  return client;
}

async function withRedisLock(client, key, operation, { ttlMs = 30000, waitMs = 15000 } = {}) {
  const token = crypto.randomUUID();
  const deadline = Date.now() + waitMs;
  while (await client.set(key, token, { NX: true, PX: ttlMs }) !== "OK") {
    if (Date.now() >= deadline) throw new Error("3x-ui 正在处理其他写入，请稍后重试。");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  try {
    return await operation();
  } finally {
    await client.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      { keys: [key], arguments: [token] }
    ).catch(error => console.error(`[xui-service] Failed to release Redis lock ${key}:`, error.message));
  }
}

module.exports = { connectRedis, withRedisLock };
