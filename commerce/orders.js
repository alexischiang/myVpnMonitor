// Order domain: immutable commercial terms and lifecycle only. No collection,
// wallet, gateway, receipt or delivery dependencies belong in this module.
function productSnapshot(quote) {
  return {
    planId: quote.planId, planName: quote.planName, optionId: quote.optionId,
    optionLabel: quote.optionLabel, duration: quote.duration, group: quote.group,
    unlimited: Boolean(quote.unlimited), lifetime: Boolean(quote.lifetime),
    lineType: "self_hosted", trafficTier: quote.trafficTier || 1,
    trafficGb: quote.trafficGb ?? null, baseAmount: quote.baseAmount ?? quote.originalAmount,
    originalAmount: quote.originalAmount, addOns: structuredClone(quote.selectedAddOnSnapshots || [])
  };
}

function createOrder({ id, number, accountId, email, purpose, quote, purchaseCount, now, expiresAt }) {
  const snapshot = productSnapshot(quote);
  return {
    id, merOrderTid: number, accountId, email, purpose,
    ...snapshot, productSnapshot: snapshot,
    trafficBaseGb: quote.trafficBaseGb || 0, trafficMaxTier: quote.trafficMaxTier || 1,
    trafficTierMarkupPercent: quote.trafficTierMarkupPercent || 0,
    discountAmount: quote.discountAmount || 0, vipLevel: quote.vipLevel,
    vipDiscountPercent: quote.vipDiscountPercent || 0, vipDiscountAmount: quote.vipDiscountAmount || 0,
    subtotal: quote.subtotal, taxAmount: quote.taxAmount || 0,
    beforeCreditAmount: quote.beforeCreditAmount, cashCredit: quote.cashCredit || 0,
    purchaseAction: quote.purchaseAction, purchaseCountBefore: purpose === "plan" ? purchaseCount : undefined,
    couponCode: quote.couponCode || "", totalAmount: quote.amount,
    addOns: [...(quote.selectedAddOns || [])], addOnSnapshots: snapshot.addOns,
    addOnAmount: quote.addOnAmount || 0,
    status: "pending", createdAt: now, updatedAt: now, expiresAt
  };
}

function assertOpen(order, now = Date.now()) {
  if (!order || order.status !== "pending" || new Date(order.expiresAt).getTime() <= now) {
    throw new Error("只有有效的待付款订单可以继续操作。");
  }
}

function closeOrder(order, now) {
  assertOpen(order, new Date(now).getTime());
  return { ...order, status: "closed", cancelledAt: now, updatedAt: now };
}

module.exports = { productSnapshot, createOrder, assertOpen, closeOrder };
