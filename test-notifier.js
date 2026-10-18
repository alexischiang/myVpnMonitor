const assert = require("assert");
const notifier = require("./notifier");

const emailHtml = notifier.renderEmailHtml({ subject: "账户 <通知>", text: "第一行\n第二行" });
assert.match(emailHtml, /<title>账户 &lt;通知&gt;<\/title>/);
assert.match(emailHtml, /第一行<br>第二行/);
assert.match(emailHtml, /NEXORA/);

assert.strictEqual(
  notifier.buildPaymentAlert({ purpose: "plan", purchaseCountBefore: 0, email: "user@example.com", planName: "Pro", optionLabel: "一年", totalAmount: 99, channelCode: "100", paymentPlatformName: "新辉支付", merOrderTid: "ORDER-1", paidAt: "2026-07-17T10:00:00.000Z" }),
  "🔔 用户消费提醒\n📧 用户邮箱：user@example.com\n🛒 消费类型：套餐购买\n👤 客户类型：新客购买\n📦 消费详情：Pro / 一年\n🧮 总金额：¥99.00\n💰 实付金额：¥99.00\n💳 付款渠道：支付宝\n🏦 支付平台：新辉支付\n🧾 订单编号：ORDER-1\n🕒 消费时间：2026/7/17 18:00:00"
);

assert.match(notifier.buildPaymentAlert({ purpose: "plan", purchaseCountBefore: 1 }), /👤 客户类型：老客复购/);

// A ¥100 plan with a 10% coupon, a 5% VIP discount and ¥20 of balance: the deductions and the paid amount add up to the total.
assert.match(
  notifier.buildPaymentAlert({ purpose: "plan", originalAmount: 100, discountAmount: 10, couponCode: "SAVE10", vipDiscountPercent: 5, vipDiscountAmount: 4.5, totalAmount: 85.5, walletAmount: 20, amount: 65.5 }),
  /🧮 总金额：¥100\.00\n🎟️ 优惠码抵扣（SAVE10）：-¥10\.00\n🎟️ VIP 折扣（5%）：-¥4\.50\n🎟️ 余额抵扣：-¥20\.00\n💰 实付金额：¥65\.50\n/
);
// Paid fully from balance.
assert.match(notifier.buildPaymentAlert({ purpose: "traffic_pack", totalAmount: 15, walletAmount: 15, amount: 0 }), /🧮 总金额：¥15\.00\n🎟️ 余额抵扣：-¥15\.00\n💰 实付金额：¥0\.00\n/);

assert.match(
  notifier.buildPaymentAlert({ purpose: "recharge", email: "user@example.com", amount: 50, merOrderTid: "ORDER-2", paidAt: "2026-07-17T10:00:00.000Z" }),
  /🛒 消费类型：余额充值\n📦 消费详情：充值 ¥50\.00/
);

assert.strictEqual(
  notifier.buildPendingDeliveryAlert({ email: "user@example.com", planName: "美区账号", addOnSnapshots: [{ name: "节点定制", regionName: "日本", quantity: 2 }, { name: "美区账号" }], merOrderTid: "ORDER-3", paidAt: "2026-07-17T10:00:00.000Z" }, "https://example.com/deliveries"),
  "📦 待交付提醒\n📧 用户邮箱：user@example.com\n🛍️ 待交付服务：节点定制（日本） ×2、美区账号\n🧾 订单编号：ORDER-3\n🕒 付款时间：2026/7/17 18:00:00\n\n前往交付：https://example.com/deliveries"
);
assert.match(notifier.buildPendingDeliveryAlert({ planName: "美区账号", id: "order-id" }, "/deliveries"), /🛍️ 待交付服务：美区账号\n🧾 订单编号：order-id/);

console.log("All notifier tests passed.");
