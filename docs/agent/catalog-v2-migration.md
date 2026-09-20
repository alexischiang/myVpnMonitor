# 商品目录 V2 用户迁移

这次迁移只为已有用户建立 V2 商品绑定，不会自动创建 V2 商品、修改旧商品定义、迁移历史订单或扣减库存。旧的 `currentProductId`、`currentOptionId` 和快照会保留，作为并行运行与回退依据。

## 上线前准备

1. 先部署包含 V2 表结构、管理页面和迁移脚本的代码，不要立即执行用户迁移。
2. 在管理端先创建权限组，再创建并启用对应的周期性套餐和不限时套餐。
3. 复制 `scripts/catalog-v2-mapping.example.json`，为线上每一种仍被用户使用的旧 `legacyProductId + legacyOptionId` 填写唯一映射。
4. 周期性套餐必须填写目标 `targetPeriodId`；不限时套餐必须填写 `null`；附加服务不能作为用户当前套餐的迁移目标。

## 预检

迁移命令默认只做 dry-run，不写数据库：

```bash
npm run migrate:catalog-v2-users -- --mapping /absolute/path/catalog-v2-mapping.json
```

检查输出中的数据库主机、映射文件和统计结果。只有 `failed` 为空时才允许正式写入。以下情况都会阻止整批写入：

- 线上仍有用户使用的旧商品/规格没有映射；
- 映射重复；
- 目标 V2 商品不存在或未启用；
- 周期规格不存在或未启用；
- 目标是附加服务；
- 用户已经绑定到另一套 V2 商品。

## 正式执行

使用 dry-run 输出的 `databaseHost` 原样作为二次确认：

```bash
npm run migrate:catalog-v2-users -- \
  --mapping /absolute/path/catalog-v2-mapping.json \
  --apply \
  --confirm-host=线上数据库主机:端口
```

脚本优先使用 `LOCAL_DATABASE_URL`，仅在它为空时使用 `DATABASE_URL`。在生产执行前必须确认进程环境中没有意外的 `LOCAL_DATABASE_URL`；以 dry-run 输出的 `databaseHost` 为最终判断依据。

正式执行后再运行一次 dry-run。已迁移用户应计入 `alreadyMigrated`，不应重复写入或重复添加日志。迁移成功记录保存在 `app_records` 的 `migrationState` 集合中，用户上保存：

- `productCatalogVersion: 2`
- `v2ProductId`、`v2PeriodId`、`v2LineGroupId`
- `v2ProductSnapshot`
- `v2MigrationId`、`v2MigratedAt`
- `legacyProductBinding`（原商品绑定与快照）

## 本地隔离验证

```bash
npm run verify:catalog-v2
```

该命令在本机 PostgreSQL 中创建一个随机 schema，验证现有支付与钱包回归、三类 V2 商品创建和购买、库存预占/释放/扣减、超时支付转人工以及 dry-run/正式迁移/重复执行，最后删除整个随机 schema。

注意：当前公共商品页和正式 API 仍使用旧目录；完成线上 V2 商品录入和用户绑定迁移，不等于已经切换公共销售入口。销售入口切换应作为后续独立步骤执行和验证。
