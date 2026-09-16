const crypto = require("node:crypto");

function validateMethod(value) {
  const method = String(value || "100");
  if (!["100", "200"].includes(method)) throw new Error("不支持的支付方式。");
  return method;
}

function transactionError(status) {
  return ["failed", "closed", "abnormal"].includes(status)
    ? "本次付款未完成，订单已保留。可以重新付款或联系客服。" : "";
}

function manualReceipt({ amount, actor, note, now }) {
  return {
    amount, channelCode: "manual", paymentProvider: "manual", paymentPlatformName: "客服人工收款",
    payUrl: "", paidAt: now, manualPaidAt: now, manualPaidBy: actor,
    manualPaymentNote: String(note || "").trim().slice(0, 500)
  };
}

function createPaymentService({ get, put, getCurrent, setCurrent, configure, channel, createGateway, queryGateway, statusOf, amountError }) {
  async function start(invoice, selection, urls) {
    const method = validateMethod(selection.channelCode);
    const config = configure(method, String(selection.paymentPlatformId || ""));
    const currentId = await getCurrent(invoice.id);
    let attempt = await get(currentId || invoice.attemptId || invoice.reference);
    // A timed-out request may already have created a charge. Reuse its merchant
    // reference on retry; never silently create another charge for that retry.
    if (!attempt || attempt.platformId !== config.id || attempt.method !== method || ["failed", "closed"].includes(attempt.status)) {
      attempt = { id: crypto.randomUUID(), orderId: invoice.id, merOrderTid: attempt ? `P${crypto.randomUUID().replaceAll("-", "")}` : invoice.reference,
        platformId: config.id, platformName: config.name, provider: config.provider, method,
        channelCode: channel(config, method), amount: invoice.amount, status: "creating", createdAt: new Date().toISOString() };
      // The merchant reference is the lookup key for callbacks, including old attempts.
      attempt.id = attempt.merOrderTid;
      await put(attempt);
    }
    // Persist the active attempt before contacting the provider, including when
    // switching channels. A crash cannot make the next request lose its charge.
    await setCurrent(invoice.id, attempt.id);
    if (attempt.payUrl || attempt.status === "paid" || (attempt.provider === "test" && attempt.status === "pending")) return attempt;
    const params = {
      mid: config.merchantId, merOrderTid: attempt.merOrderTid, money: invoice.amount.toFixed(2),
      channelCode: attempt.channelCode, notifyUrl: urls.notify(config), returnUrl: urls.return(config),
      clientUserPayRemark: invoice.label, clientUserId: String(selection.clientUserId || ""),
      clientUserName: String(selection.clientUserName || ""), ...(config.provider === "xinhui" ? { clientip: urls.ip } : {})
    };
    try {
      const { result } = await createGateway(config, params);
      Object.assign(attempt, { tid: result.tid || "", payUrl: result.payUrl || "", status: statusOf(result.payOrderStatus), error: "" });
      attempt.error = transactionError(attempt.status);
      if (attempt.status === "paid") {
        const error = amountError(attempt.amount, result.money);
        if (error) Object.assign(attempt, { status: "abnormal", error });
      }
    } catch {
      Object.assign(attempt, { status: "unknown", error: "支付渠道暂时不可用，订单已保留。请重试或联系客服。" });
    }
    attempt.updatedAt = new Date().toISOString();
    await put(attempt);
    return attempt;
  }

  async function query(attempt) {
    if (attempt.provider === "test") return attempt;
    const config = configure("", attempt.platformId);
    const result = await queryGateway(config, attempt);
    const status = statusOf(result.payOrderStatus);
    const error = status === "paid" ? amountError(attempt.amount, result.money) : transactionError(status);
    // A delayed pending response must never overwrite a confirmed receipt.
    if (attempt.status !== "paid" && (status === "paid" || !["failed", "closed", "abnormal"].includes(attempt.status))) Object.assign(attempt, { status: status === "paid" && error ? "abnormal" : status, error, tid: result.tid || attempt.tid, payUrl: result.payUrl || attempt.payUrl });
    attempt.updatedAt = new Date().toISOString();
    await put(attempt);
    return attempt;
  }
  return { start, query, get, put };
}

module.exports = { validateMethod, transactionError, manualReceipt, createPaymentService };
