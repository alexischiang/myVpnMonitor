const assert = require("assert");
const notifier = require("./notifier");

const emailHtml = notifier.renderEmailHtml({ subject: "账户 <通知>", text: "第一行\n第二行" });
assert.match(emailHtml, /<title>账户 &lt;通知&gt;<\/title>/);
assert.match(emailHtml, /第一行<br>第二行/);
assert.match(emailHtml, /NEXORA/);

assert.strictEqual(
  notifier.isExpiredItem({ metrics: { expireAt: "2026-06-30T00:00:00.000Z" } }, new Date("2026-07-03T00:00:00.000Z").getTime()),
  true
);

assert.strictEqual(
  notifier.isExpiredItem({ metrics: { expireAt: "2026-07-04T00:00:00.000Z" } }, new Date("2026-07-03T00:00:00.000Z").getTime()),
  false
);

assert.strictEqual(
  notifier.buildPaymentAlert({ purpose: "plan", email: "user@example.com", planName: "Pro", optionLabel: "一年", totalAmount: 99, channelCode: "100", paymentPlatformName: "新辉支付", merOrderTid: "ORDER-1", paidAt: "2026-07-17T10:00:00.000Z" }),
  "🔔 用户消费提醒\n📧 用户邮箱：user@example.com\n🛒 消费类型：套餐购买\n📦 消费详情：Pro / 一年\n💰 消费金额：¥99.00\n💳 付款渠道：支付宝\n🏦 支付平台：新辉支付\n🧾 订单编号：ORDER-1\n🕒 消费时间：2026/7/17 18:00:00"
);

assert.match(
  notifier.buildPaymentAlert({ purpose: "recharge", email: "user@example.com", amount: 50, merOrderTid: "ORDER-2", paidAt: "2026-07-17T10:00:00.000Z" }),
  /🛒 消费类型：余额充值\n📦 消费详情：充值 ¥50\.00/
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

  const repeated = await notifier.checkAndNotifyLowTraffic([{
    id: "already-alerted",
    metrics: { expireAt: "2099-01-01T00:00:00.000Z", remainingBytes: 1 }
  }], {
    async get() { return { sentAt: "2020-01-01T00:00:00.000Z" }; },
    async set() { throw new Error("an existing low-traffic alert must not be sent again"); },
    async clear() { throw new Error("an active low-traffic alert must not be cleared"); }
  }, { logger: { log() {}, error() {} } });

  assert.strictEqual(repeated.sent, 0);

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
