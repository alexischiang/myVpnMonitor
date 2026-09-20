function mappingKey(productId, optionId) {
  return `${String(productId || "")}\u0000${String(optionId || "")}`;
}

function migrateUsers({ users = [], products = [], mappings = [], migrationId = "catalog-v2-user-binding-v1", now = new Date().toISOString() }) {
  const productsById = new Map(products.map(product => [product.id, product]));
  const mappingsByLegacy = new Map();
  const mappingErrors = [];

  for (const item of mappings) {
    const legacyProductId = String(item.legacyProductId || "").trim();
    const legacyOptionId = String(item.legacyOptionId || "").trim();
    const targetProductId = String(item.targetProductId || "").trim();
    const targetPeriodId = item.targetPeriodId === null || item.targetPeriodId === undefined ? null : String(item.targetPeriodId).trim();
    const key = mappingKey(legacyProductId, legacyOptionId);
    if (!legacyProductId || !legacyOptionId || !targetProductId) {
      mappingErrors.push({ mapping: item, reason: "映射必须包含 legacyProductId、legacyOptionId 和 targetProductId" });
      continue;
    }
    if (mappingsByLegacy.has(key)) {
      mappingErrors.push({ mapping: item, reason: "旧商品映射重复" });
      continue;
    }
    const product = productsById.get(targetProductId);
    if (!product) {
      mappingErrors.push({ mapping: item, reason: `V2 商品不存在：${targetProductId}` });
      continue;
    }
    if (!product.isEnabled) {
      mappingErrors.push({ mapping: item, reason: `V2 商品未启用：${targetProductId}` });
      continue;
    }
    if (product.type === "addon") {
      mappingErrors.push({ mapping: item, reason: `附加服务不能作为用户当前套餐：${targetProductId}` });
      continue;
    }
    const period = product.type === "recurring_plan" ? product.periods.find(candidate => candidate.id === targetPeriodId) : null;
    if (product.type === "recurring_plan" && (!period || !period.isEnabled)) {
      mappingErrors.push({ mapping: item, reason: `周期规格不存在或未启用：${targetProductId}/${targetPeriodId || "空"}` });
      continue;
    }
    if (product.type === "lifetime_plan" && targetPeriodId) {
      mappingErrors.push({ mapping: item, reason: `不限时套餐不能指定周期：${targetProductId}` });
      continue;
    }
    mappingsByLegacy.set(key, { legacyProductId, legacyOptionId, targetProductId, targetPeriodId, product, period });
  }

  const report = { migrationId, total: users.length, eligible: 0, migrated: 0, alreadyMigrated: 0, skipped: 0, failed: [...mappingErrors] };
  const updatedUsers = users.map(source => {
    const user = structuredClone(source);
    if (!user.currentProductId || !user.currentOptionId) {
      report.skipped++;
      return user;
    }
    report.eligible++;
    const mapping = mappingsByLegacy.get(mappingKey(user.currentProductId, user.currentOptionId));
    if (!mapping) {
      report.failed.push({ userId: user.id || user.userId || user.email, reason: `未配置映射：${user.currentProductId}/${user.currentOptionId}` });
      return user;
    }
    if (user.productCatalogVersion === 2) {
      if (user.v2ProductId === mapping.targetProductId && (user.v2PeriodId || null) === mapping.targetPeriodId) report.alreadyMigrated++;
      else report.failed.push({ userId: user.id || user.userId || user.email, reason: `已有不同的 V2 绑定：${user.v2ProductId}/${user.v2PeriodId || ""}` });
      return user;
    }
    const { product, period } = mapping;
    user.legacyProductBinding ||= {
      productId: user.currentProductId,
      optionId: user.currentOptionId,
      snapshot: structuredClone(user.currentProductSnapshot || null)
    };
    user.productCatalogVersion = 2;
    user.v2ProductId = product.id;
    user.v2PeriodId = period?.id || null;
    user.v2LineGroupId = product.lineGroupId;
    user.v2ProductSnapshot = {
      version: 2,
      productId: product.id,
      productType: product.type,
      periodId: period?.id || null,
      lineGroupId: product.lineGroupId,
      name: product.name,
      durationDays: period?.durationDays || null,
      trafficBytes: period ? period.trafficBytes : product.trafficBytes,
      deviceLimit: period ? period.deviceLimit : product.deviceLimit
    };
    user.v2MigrationId = migrationId;
    user.v2MigratedAt = now;
    user.updatedAt = now;
    user.userLogs = Array.isArray(user.userLogs) ? user.userLogs : [];
    user.userLogs.unshift({
      id: `catalog-v2-migration:${migrationId}:${user.id || user.userId || user.email}`,
      event: "system",
      status: "recorded",
      reason: "catalog-v2-binding-migrated",
      message: `已建立 V2 商品绑定：${product.name}${period ? ` / ${period.durationDays} 天` : " / 不限时"}`,
      details: { migrationId, legacyProductId: mapping.legacyProductId, legacyOptionId: mapping.legacyOptionId, v2ProductId: product.id, v2PeriodId: period?.id || null },
      createdAt: now
    });
    report.migrated++;
    return user;
  });

  report.status = report.failed.length ? "blocked" : "ready";
  return { users: updatedUsers, report };
}

module.exports = { migrateUsers };
