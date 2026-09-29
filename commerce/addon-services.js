// Add-on services: one handler table decides how each kind of add-on is delivered and how long
// it lasts. Everything here is pure so checkout, delivery, expiry and the customer/admin views
// all derive the same answer from an order.
const DAY_MS = 24 * 60 * 60 * 1000;

const ADDON_HANDLERS = Object.freeze({
  // Adds traffic to the current cycle automatically; the extra traffic ends at the next monthly reset.
  traffic_credit: Object.freeze({ id: "traffic_credit", label: "流量包", mode: "automatic", requiresRecurringPlan: true, lifetime: "traffic_cycle", delivery: "automatic" }),
  // The admin binds custom inbounds on delivery; each unit lasts serviceDurationDays from delivery.
  custom_node: Object.freeze({ id: "custom_node", label: "节点定制", mode: "manual", requiresRecurringPlan: true, lifetime: "days", defaultDays: 30, delivery: "inbounds" }),
  // Card keys, accounts, top-ups: the admin sources the goods and delivers text content.
  manual: Object.freeze({ id: "manual", label: "人工交付", mode: "manual", requiresRecurringPlan: false, lifetime: "optional_days", delivery: "content" })
});

const BUYER_INPUT_MAX_LENGTH = 200;
const DELIVERY_NOTE_MAX_LENGTH = 2000;

function addonHandler(id) {
  return ADDON_HANDLERS[id] || ADDON_HANDLERS.manual;
}

// Older products stored only { mode: "automatic" } for traffic packs.
function addonHandlerIdFromInput(fulfillment = {}) {
  if (ADDON_HANDLERS[fulfillment.handler]) return fulfillment.handler;
  return fulfillment.mode === "automatic" ? "traffic_credit" : "manual";
}

function handlerOf(order, item = {}) {
  return addonHandler(item.fulfillmentHandler || order?.productSnapshot?.v2?.fulfillment?.handler || order?.fulfillment?.handler);
}

// Start and end of the paid service, fixed when it is delivered.
function serviceWindow(handlerId, { deliveredAt, durationDays, quantity = 1, trafficCycleEndsAt = "" }) {
  const handler = addonHandler(handlerId);
  if (handler.lifetime === "traffic_cycle") return { startedAt: deliveredAt, expiresAt: trafficCycleEndsAt || "" };
  const days = Number(durationDays) || (handler.lifetime === "days" ? handler.defaultDays : 0);
  if (!days) return { startedAt: deliveredAt, expiresAt: "" };
  return { startedAt: deliveredAt, expiresAt: new Date(new Date(deliveredAt).getTime() + days * Math.max(1, Number(quantity) || 1) * DAY_MS).toISOString() };
}

// V2 services start when they are delivered. Legacy (V1) add-on orders never stored a window;
// they ran durationDays from payment.
function orderServiceWindow(order, item = {}) {
  if (order.serviceStartedAt || order.serviceExpiresAt) return { startedAt: order.serviceStartedAt || order.fulfilledAt || order.paidAt || order.createdAt, expiresAt: order.serviceExpiresAt || "" };
  if (order.catalogVersion === 2) return { startedAt: order.fulfilledAt || "", expiresAt: "" };
  const startedAt = order.paidAt || order.createdAt;
  const days = Number(item.durationDays || 0);
  return { startedAt, expiresAt: days ? new Date(new Date(startedAt).getTime() + days * DAY_MS).toISOString() : "" };
}

function serviceStatus(order, expiresAt, handler, now = Date.now()) {
  if (order.reversedAt) return "reversed";
  if (order.fulfillmentStatus === "failed") return "failed";
  if (order.fulfillmentStatus === "manual_pending") return "pending";
  if (order.fulfillmentStatus !== "fulfilled") return "processing";
  if (expiresAt && new Date(expiresAt).getTime() <= now) return "expired";
  return expiresAt || handler.lifetime !== "optional_days" ? "active" : "delivered";
}

// One record per purchased add-on line, shared by the customer order page and the admin queue.
function serviceRecords(order, now = Date.now()) {
  if (!order || order.status !== "paid") return [];
  return (order.addOnSnapshots || []).map((item, index) => {
    const handler = handlerOf(order, item);
    const window = orderServiceWindow(order, item);
    return {
      id: `${order.id}:${index}`,
      orderId: order.id,
      name: item.name,
      regionName: item.regionName || "",
      handler: handler.id,
      handlerLabel: handler.label,
      delivery: handler.delivery,
      quantity: Math.max(1, Number(item.quantity) || 1),
      amount: item.amount,
      durationDays: Number(item.durationDays || 0),
      status: serviceStatus(order, window.expiresAt, handler, now),
      startedAt: window.startedAt,
      expiresAt: window.expiresAt,
      deliveredAt: order.fulfilledAt || "",
      deliveryNote: order.deliveryNote || "",
      buyerInputLabel: item.buyerInputLabel || "",
      buyerInput: item.buyerInput || "",
      inboundIds: [...(order.customInboundIds || [])]
    };
  });
}

function isPendingDelivery(order) {
  return order?.status === "paid" && !order.reversedAt && order.fulfillmentStatus === "manual_pending";
}

function normalizeBuyerInput(value) {
  return String(value ?? "").trim().slice(0, BUYER_INPUT_MAX_LENGTH);
}

// Checked when the order is submitted; quotes are shown before the customer has typed anything.
function assertBuyerInputs(addOnSnapshots = []) {
  const missing = addOnSnapshots.find(item => item.buyerInputLabel && !item.buyerInput);
  if (missing) throw new Error(`请填写${missing.buyerInputLabel}。`);
}

function normalizeDelivery(handlerId, payload = {}) {
  const handler = addonHandler(handlerId);
  const deliveryNote = String(payload.deliveryNote || "").trim().slice(0, DELIVERY_NOTE_MAX_LENGTH);
  const inboundIds = [...new Set((Array.isArray(payload.inboundIds) ? payload.inboundIds : []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
  if (handler.delivery === "inbounds" && !inboundIds.length) throw new Error("请选择要授权给用户的定制入站。");
  if (handler.delivery === "content" && !deliveryNote) throw new Error("请填写交付内容。");
  return { deliveryNote, inboundIds: handler.delivery === "inbounds" ? inboundIds : [] };
}

function isCustomNodeGrant(order) {
  return order?.status === "paid" && !order.reversedAt && order.fulfillmentStatus === "fulfilled" &&
    handlerOf(order, order.addOnSnapshots?.[0]).id === "custom_node" && (order.customInboundIds || []).length > 0;
}

// Expired custom-node orders of one user and the inbounds they can release. An inbound still
// covered by another active custom-node order of the same user stays bound.
function expiredCustomNodeGrants(orders, userId, now = Date.now()) {
  const grants = orders.filter(order => order.userId === userId && isCustomNodeGrant(order) && !order.serviceEndedAt);
  const isExpired = order => order.serviceExpiresAt && new Date(order.serviceExpiresAt).getTime() <= now;
  const expired = grants.filter(isExpired);
  const stillActive = new Set(grants.filter(order => !isExpired(order)).flatMap(order => order.customInboundIds));
  const releaseInboundIds = [...new Set(expired.flatMap(order => order.customInboundIds))].filter(id => !stillActive.has(id));
  return { orders: expired, releaseInboundIds };
}

// The mail only points to the order; delivered secrets are shown after signing in.
function deliveryNotificationMail({ order, serviceNames, url }) {
  const names = serviceNames || order.planName;
  const text = `你购买的服务「${names}」已完成交付。\n\n订单号：${order.merOrderTid}\n请登录后在订单详情中查看交付内容：${url}\n\n为保护你的账户安全，交付内容不会通过邮件发送。`;
  const html = `<p>你购买的服务「${escapeHtml(names)}」已完成交付。</p><p>订单号：${escapeHtml(order.merOrderTid)}</p><p>请登录后在订单详情中查看交付内容：<br><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p><p style="color:#6b7280;">为保护你的账户安全，交付内容不会通过邮件发送。</p>`;
  return { subject: `服务已交付：${names}`, text, html };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

module.exports = {
  ADDON_HANDLERS, BUYER_INPUT_MAX_LENGTH, addonHandler, addonHandlerIdFromInput, handlerOf, serviceWindow, serviceRecords,
  isPendingDelivery, normalizeBuyerInput, assertBuyerInputs, normalizeDelivery, expiredCustomNodeGrants, deliveryNotificationMail
};
