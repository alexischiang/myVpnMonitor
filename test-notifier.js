const assert = require("assert");
const notifier = require("./notifier");

assert.strictEqual(
  notifier.isExpiredItem({ metrics: { expireAt: "2026-06-30T00:00:00.000Z" } }, new Date("2026-07-03T00:00:00.000Z").getTime()),
  true
);

assert.strictEqual(
  notifier.isExpiredItem({ metrics: { expireAt: "2026-07-04T00:00:00.000Z" } }, new Date("2026-07-03T00:00:00.000Z").getTime()),
  false
);

async function run() {
  const oldToken = process.env.TELEGRAM_BOT_TOKEN;
  const oldChat = process.env.TELEGRAM_CHAT_ID;
  const oldMail = process.env.ALERT_EMAIL_FROM;
  const oldPass = process.env.ALERT_EMAIL_PASS;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_CHAT_ID = "123";
  delete process.env.ALERT_EMAIL_FROM;
  delete process.env.ALERT_EMAIL_PASS;

  const cleared = [];
  const result = await notifier.checkAndNotifyLowTraffic([
    {
      id: "expired-low",
      email: "expired@example.com",
      url: "https://example.com/sub",
      metrics: {
        expireAt: "2026-06-30T00:00:00.000Z",
        remainingBytes: 1,
        totalBytes: 100
      }
    }
  ], {
    async get() { return null; },
    async set() { throw new Error("expired item should not send alert"); },
    async clear(key) { cleared.push(key); }
  }, { logger: { log() {}, error() {} } });

  assert.deepStrictEqual(cleared, ["low:expired-low"]);
  assert.strictEqual(result.sent, 0);

  if (oldToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = oldToken;
  if (oldChat === undefined) delete process.env.TELEGRAM_CHAT_ID; else process.env.TELEGRAM_CHAT_ID = oldChat;
  if (oldMail === undefined) delete process.env.ALERT_EMAIL_FROM; else process.env.ALERT_EMAIL_FROM = oldMail;
  if (oldPass === undefined) delete process.env.ALERT_EMAIL_PASS; else process.env.ALERT_EMAIL_PASS = oldPass;
}

run().then(() => {
  console.log("All notifier tests passed.");
}).catch(error => {
  console.error(error);
  process.exit(1);
});
