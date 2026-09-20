// Application orchestration is the only layer that composes order, collection
// and delivery operations. Domain services do not call each other.
function createCheckoutWorkflow({ orders, settlement, inventory, persist, logSubmitted, deliver, save }) {
  async function submit(terms, allocation) {
    const order = orders.createOrder(terms);
    let inventoryReserved = false;
    let fundingPrepared = false;
    try {
      if (inventory?.reserve) {
        await inventory.reserve(order);
        inventoryReserved = true;
      }
      const funding = await settlement.prepare({ ...allocation, id: order.id, accountId: order.accountId, expiresAt: order.expiresAt });
      fundingPrepared = true;
      // Compatibility projection for existing bills/fulfillment; commercial
      // terms remain immutable and channel attempts are persisted separately.
      Object.assign(order, funding, { checkoutVersion: 2, paymentProvider: "", paidAt: "" });
      await persist(order);
    } catch (error) {
      if (fundingPrepared) await settlement.release(order.id);
      if (inventoryReserved) await inventory.release(order.id);
      throw error;
    }
    await logSubmitted(order);
    return order;
  }

  async function fulfill(order, context) {
    if (order.status !== "paid" || order.reversedAt) return order;
    try {
      if (inventory?.consume) await inventory.consume(order.id, { now: order.paidAt || order.updatedAt });
      await deliver(order, context);
    }
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
    if (inventory?.release) await inventory.release(order.id);
    return order;
  }
  return { submit, collect, fulfill, cancel };
}

module.exports = { createCheckoutWorkflow };
