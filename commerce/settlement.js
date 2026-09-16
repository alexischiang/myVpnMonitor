// Collection amounts are computed in cents; the order domain never sees holds.
function allocateAmounts(totalCents, planCents, hold) {
  const walletCents = hold.cashCents + hold.giftCents + hold.referralCents;
  const planAfterGift = Math.max(planCents - hold.giftCents, 0);
  const planAfterReferral = Math.max(planAfterGift - hold.referralCents, 0);
  const planCash = Math.min(planAfterReferral, hold.cashCents);
  const planExternal = planAfterReferral - planCash;
  return {
    amount: (totalCents - walletCents) / 100,
    walletAmount: walletCents / 100, walletCashAmount: hold.cashCents / 100,
    walletGiftAmount: hold.giftCents / 100, walletReferralAmount: hold.referralCents / 100,
    planPayableAmount: planCents / 100, planGatewayAmount: planExternal / 100,
    planCashValueAmount: (planExternal + planCash) / 100, vipSpendAmount: planExternal / 100
  };
}

function createSettlementService({ reserve, release }) {
  async function prepare({ id, accountId, totalCents, planCents, useBalance, expiresAt, initialVipCents }) {
    const hold = useBalance && totalCents > 0
      ? await reserve({ accountId, orderId: id, amountCents: totalCents, expiresAt, initialVipCents })
      : { cashCents: 0, giftCents: 0, referralCents: 0 };
    return allocateAmounts(totalCents, planCents, hold);
  }
  return { prepare, release };
}

module.exports = { allocateAmounts, createSettlementService };
