const GB = 1024 ** 3;

const DURATION_BY_DAYS = Object.freeze({
  30: "monthly",
  90: "quarterly",
  180: "half_yearly",
  360: "yearly"
});

function integer(value, { min = 0, label = "数值" } = {}) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min) throw new Error(`${label}无效。`);
  return number;
}

function money(cents) {
  return Math.round(Number(cents || 0)) / 100;
}

function optionId(productId, periodId = "") {
  return periodId ? `v2:${productId}:${periodId}` : `v2:${productId}`;
}

function visibleProducts(products = []) {
  return products.filter(product => product.isEnabled && product.isForSale);
}

function resolvePurchase(products, input = {}, context = {}) {
  const productId = String(input.productId || "").trim();
  const product = products.find(item => item.id === productId);
  if (!product) throw new Error("V2 商品不存在。");
  if (!product.isEnabled) throw new Error("商品未启用。");
  if (!context.allowUnlisted && !product.isForSale) throw new Error("商品未公开销售。");
  if (product.stock === 0) throw new Error("商品已售罄。");

  const quantity = product.type === "addon" ? integer(input.quantity ?? 1, { min: 1, label: "购买数量" }) : 1;
  if (product.type === "addon") {
    if (!product.allowQuantity && quantity !== 1) throw new Error("该附加服务不允许修改购买数量。");
    if (quantity < Number(product.minQuantity || 1) || product.maxQuantity !== null && quantity > Number(product.maxQuantity)) throw new Error("购买数量超出商品限制。");
    if (product.purchaseRequirement === "requires_recurring_plan" && !context.hasRecurringPlan) throw new Error("该附加服务仅限周期性套餐用户购买。");
  }

  let period = null;
  let priceCents = product.priceCents;
  let trafficBytes = product.trafficBytes;
  let deviceLimit = product.deviceLimit;
  let durationDays = null;
  let duration = product.type === "lifetime_plan" ? "lifetime" : "";
  let periodId = "";
  let trafficSteps = 0;

  if (product.type === "recurring_plan") {
    periodId = String(input.periodId || "").trim();
    period = product.periods.find(item => item.id === periodId);
    if (!period || !period.isEnabled) throw new Error("周期规格不存在或未启用。");
    priceCents = period.priceCents;
    trafficBytes = period.trafficBytes;
    deviceLimit = period.deviceLimit;
    durationDays = period.durationDays;
    duration = DURATION_BY_DAYS[durationDays] || "custom";
    trafficSteps = integer(input.trafficSteps ?? 0, { label: "流量档数" });
    if (trafficSteps > 0) {
      if (!product.trafficCustomization.enabled) throw new Error("该商品未启用流量定制。");
      if (trafficBytes === null) throw new Error("无限流量规格不能增加流量档位。");
      if (trafficSteps > product.trafficCustomization.maxSteps) throw new Error("流量档数超过商品上限。");
      priceCents += trafficSteps * product.trafficCustomization.stepPriceCents;
      trafficBytes += trafficSteps * product.trafficCustomization.stepBytes;
    }
  }

  const unitPriceCents = integer(priceCents, { label: "商品价格" });
  const subtotalCents = unitPriceCents * quantity;
  const taxRate = Number(context.taxRate || 0);
  const taxCents = Math.round(subtotalCents * taxRate / 100);
  const totalCents = subtotalCents + taxCents;
  const isAddon = product.type === "addon";
  const addOnSnapshot = isAddon ? {
    id: product.id,
    optionId: optionId(product.id),
    name: product.name,
    amount: money(unitPriceCents),
    quantity,
    durationDays: product.serviceDurationDays,
    deliveryMode: product.fulfillment.mode,
    fulfillmentHandler: product.fulfillment.handler,
    fulfillmentConfig: structuredClone(product.fulfillment.config || {}),
    deliveryDescription: product.deliveryDescription
  } : null;

  return {
    catalogVersion: 2,
    catalogProductType: product.type,
    productId: product.id,
    periodId: period?.id || null,
    planId: product.id,
    planName: product.name,
    optionId: optionId(product.id, period?.id),
    optionLabel: period ? `${period.durationDays} 天` : product.type === "lifetime_plan" ? "不限时" : product.name,
    purpose: isAddon ? "addon" : "plan",
    duration,
    durationDays,
    group: product.lineGroupId || "",
    lineGroupId: product.lineGroupId || null,
    unlimited: trafficBytes === null,
    lifetime: product.type === "lifetime_plan",
    trafficTier: 1,
    trafficSteps,
    trafficBytes,
    trafficGb: trafficBytes === null ? null : trafficBytes / GB,
    devices: deviceLimit,
    quantity,
    inventoryQuantity: quantity,
    baseAmount: money(unitPriceCents),
    originalAmount: money(subtotalCents),
    subtotal: money(subtotalCents),
    taxRate,
    taxAmount: money(taxCents),
    beforeCreditAmount: money(totalCents),
    cashCredit: 0,
    discountAmount: 0,
    vipDiscountPercent: 0,
    vipDiscountAmount: 0,
    amount: money(totalCents),
    selectedAddOns: addOnSnapshot ? [addOnSnapshot.optionId] : [],
    selectedAddOnSnapshots: addOnSnapshot ? [addOnSnapshot] : [],
    addOnAmount: addOnSnapshot ? money(subtotalCents) : 0,
    fulfillment: structuredClone(product.fulfillment || { mode: null, handler: null, config: {} }),
    productSnapshotV2: {
      version: 2,
      productId: product.id,
      productType: product.type,
      periodId: period?.id || null,
      lineGroupId: product.lineGroupId || null,
      name: product.name,
      durationDays,
      trafficBytes,
      deviceLimit,
      unitPriceCents,
      quantity,
      trafficSteps,
      purchaseRequirement: product.purchaseRequirement,
      fulfillment: structuredClone(product.fulfillment || { mode: null, handler: null, config: {} })
    }
  };
}

module.exports = { GB, DURATION_BY_DAYS, optionId, visibleProducts, resolvePurchase };
