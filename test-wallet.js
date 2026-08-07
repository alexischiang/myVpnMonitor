const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createDataStore } = require("./database");

function testDatabaseUrl() {
  const env = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
  return process.env.TEST_DATABASE_URL || env.match(/^TEST_DATABASE_URL=(.+)$/m)?.[1]?.trim();
}

async function main() {
  const databaseUrl = testDatabaseUrl();
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for wallet tests");
  const store = createDataStore({ databaseUrl });
  const accountId = `wallet-test-${crypto.randomUUID()}`;
  await store.init();
  try {
    let wallet = await store.getWallet(accountId, 125);
    assert.strictEqual(wallet.vipSpendCents, 125);

    const recharge = { id: crypto.randomUUID(), accountId, orderId: "recharge-1", amountCents: 1000, description: "测试充值", initialVipCents: 125 };
    wallet = await store.creditWalletRecharge(recharge);
    await store.creditWalletRecharge({ ...recharge, id: crypto.randomUUID() });
    assert.deepStrictEqual([wallet.cashCents, wallet.vipSpendCents], [1000, 1125]);

    await store.creditWalletGift({ id: crypto.randomUUID(), accountId, sourceId: "invite-1", amountCents: 500, description: "邀请返利", idempotencyKey: "invite:1" });
    await store.creditReferralReward({ id: crypto.randomUUID(), accountId, sourceId: "referral-1", amountCents: 200, description: "referral", idempotencyKey: "referral:1" });
    const hold = await store.reserveWallet({ accountId, orderId: "purchase-1", amountCents: 1200, expiresAt: new Date(Date.now() + 60000), initialVipCents: 125 });
    assert.deepStrictEqual(hold, { cashCents: 500, giftCents: 500, referralCents: 200 });

    wallet = await store.settleWalletPurchase({ id: crypto.randomUUID(), accountId, orderId: "purchase-1", vipDeltaCents: 200, description: "混合支付", initialVipCents: 125 });
    assert.deepStrictEqual([wallet.cashCents, wallet.giftCents, wallet.referralCents, wallet.vipSpendCents], [500, 0, 0, 1325]);
    wallet = await store.settleWalletPurchase({ id: crypto.randomUUID(), accountId, orderId: "purchase-1", vipDeltaCents: 200, description: "重复回调", initialVipCents: 125 });
    assert.deepStrictEqual([wallet.cashCents, wallet.giftCents, wallet.referralCents, wallet.vipSpendCents], [500, 0, 0, 1325]);

    await store.reserveWallet({ accountId, orderId: "expired-1", amountCents: 300, expiresAt: new Date(Date.now() - 1000), initialVipCents: 125 });
    wallet = await store.getWallet(accountId, 125);
    assert.strictEqual(wallet.cashHeldCents, 0);
    console.log("Wallet checks passed: recharge VIP, gift-referral-cash holds, settlement, expiry release, and idempotency.");
  } finally {
    await store.pool.query("DELETE FROM wallet_entries WHERE account_id = $1", [accountId]);
    await store.pool.query("DELETE FROM wallet_holds WHERE account_id = $1", [accountId]);
    await store.pool.query("DELETE FROM wallet_accounts WHERE account_id = $1", [accountId]);
    await store.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
