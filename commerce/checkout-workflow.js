// Application orchestration is the only layer that composes order, collection
// and delivery operations. Domain services do not call each other.
function createCheckoutWorkflow({ orders, settlement, persist, logSubmitted, deliver, save }) {
  async function submit(terms, allocation) {
    const order = orders.createOrder(terms);
    const funding = await settlement.prepare({ ...allocation, id: order.id, accountId: order.accountId, expiresAt: order.expiresAt });
    // Compatibility projection for existing bills/fulfillment; commercial
    // terms remain immutable and channel attempts are persisted separately.
    Object.assign(order, funding, { checkoutVersion: 2, paymentProvider: "", paidAt: "" });
    try { await persist(order); }
    catch (error) { await settlement.release(order.id); throw error; }
    await logSubmitted(order);
    return order;
  }

  async function fulfill(order, context) {
    if (order.status !== "paid" || order.reversedAt) return order;
    try { await deliver(order, context); }
    catch (error) {
      order.fulfillmentStatus = "failed";
      order.fulfillmentError = error.message;
      order.updatedAt = new Date().toISOString();
      await save();
    }
    return order;
  }

  async function collect(order, receipt, context) {
    if (order.status === "paid" || order.reversedAt) return fulfill(order, context);
    Object.assign(order, receipt, { status: "paid", paidAt: receipt.paidAt, updatedAt: receipt.paidAt, paymentError: "" });
    await save();
    return fulfill(order, context);
  }

  async function cancel(order, now) {
    Object.assign(order, orders.closeOrder(order, now));
    order.paymentError = "";
    await save();
    await settlement.release(order.id);
    return order;
  }
  return { submit, collect, fulfill, cancel };
}

module.exports = { createCheckoutWorkflow };
