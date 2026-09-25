const COLLECTIONS = ["subscriptions", "users", "accounts", "bills", "vendors", "presets", "placeholderNodes", "embyUsers", "embyVendors", "pricing", "paymentOrders", "salesSettings", "paymentSettings", "referralRewards", "tickets"];
const PG_RETRY_ATTEMPTS = Number(process.env.DATABASE_RETRY_ATTEMPTS || 2);
const PG_RETRY_DELAY_MS = Number(process.env.DATABASE_RETRY_DELAY_MS || 500);
const { appendXuiAuditLog, initXuiAudit, listXuiAuditLogs } = require("./xui-audit");
const { directionalDelta, applyLocalNodeDelta } = require("./xui-traffic");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryablePgError(error) {
  const codes = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "EAI_AGAIN", "53300", "57P01", "57P02", "57P03"]);
  const isRetryableCode = code => codes.has(code) || String(code || "").startsWith("08");
  if (isRetryableCode(error?.code)) return true;
  if (Array.isArray(error?.errors) && error.errors.some(item => isRetryableCode(item?.code))) return true;
  return /timeout|terminating connection|connection.*closed/i.test(String(error?.message || ""));
}

async function withPgRetry(operation, label) {
  let lastError;
  for (let attempt = 0; attempt <= PG_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= PG_RETRY_ATTEMPTS || !isRetryablePgError(error)) throw error;
      const waitMs = PG_RETRY_DELAY_MS * (attempt + 1);
      console.warn(`[data] ${label} failed (${error.code || error.message}); retrying in ${waitMs}ms.`);
      await sleep(waitMs);
    }
  }
  throw lastError;
}

class PostgresDataStore {
  constructor({ connectionString, ssl }) {
    this.kind = "postgres";
    this.connectionString = normalizePostgresUrl(connectionString);
    this.ssl = ssl;
    this.pool = null;
    this.initPromise = null;
  }

  loadPg() {
    try {
      return require("pg");
    } catch {
      throw new Error("DATABASE_URL is configured, but pg is missing. Please run npm install pg.");
    }
  }

  async init() {
    if (this.initPromise) return this.initPromise;
    if (this.pool) return;

    this.initPromise = this.initializePool();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  async initializePool() {
    const { Pool } = this.loadPg();
    const pool = new Pool({
      connectionString: this.connectionString,
      ssl: this.ssl ? { rejectUnauthorized: false } : undefined,
      idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
      max: Number(process.env.DATABASE_POOL_MAX || 5)
    });
    pool.on("error", error => {
      console.error("[data] Unexpected idle PostgreSQL client error:", error);
    });
    this.pool = pool;
    try {
      await withPgRetry(() => pool.query(`
      CREATE TABLE IF NOT EXISTS app_records (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (collection, id)
      );
      CREATE TABLE IF NOT EXISTS xui_node_credentials (
        guid TEXT PRIMARY KEY,
        sealed_token TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `), "postgres init");
      await withPgRetry(() => initXuiAudit(pool), "xui audit init");
      await withPgRetry(() => pool.query(`
      CREATE TABLE IF NOT EXISTS wallet_accounts (
        account_id TEXT PRIMARY KEY,
        cash_cents BIGINT NOT NULL DEFAULT 0 CHECK (cash_cents >= 0),
        gift_cents BIGINT NOT NULL DEFAULT 0 CHECK (gift_cents >= 0),
        cash_held_cents BIGINT NOT NULL DEFAULT 0 CHECK (cash_held_cents >= 0),
        gift_held_cents BIGINT NOT NULL DEFAULT 0 CHECK (gift_held_cents >= 0),
        referral_cents BIGINT NOT NULL DEFAULT 0 CHECK (referral_cents >= 0),
        referral_held_cents BIGINT NOT NULL DEFAULT 0 CHECK (referral_held_cents >= 0),
        vip_spend_cents BIGINT NOT NULL DEFAULT 0 CHECK (vip_spend_cents >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS wallet_holds (
        order_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES wallet_accounts(account_id),
        cash_cents BIGINT NOT NULL DEFAULT 0,
        gift_cents BIGINT NOT NULL DEFAULT 0,
        referral_cents BIGINT NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS wallet_entries (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES wallet_accounts(account_id),
        type TEXT NOT NULL,
        cash_delta_cents BIGINT NOT NULL DEFAULT 0,
        gift_delta_cents BIGINT NOT NULL DEFAULT 0,
        referral_delta_cents BIGINT NOT NULL DEFAULT 0,
        vip_delta_cents BIGINT NOT NULL DEFAULT 0,
        cash_balance_cents BIGINT NOT NULL,
        gift_balance_cents BIGINT NOT NULL,
        referral_balance_cents BIGINT NOT NULL DEFAULT 0,
        vip_spend_cents BIGINT NOT NULL,
        source_id TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        idempotency_key TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS wallet_entries_account_created_idx ON wallet_entries (account_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS wallet_holds_account_status_idx ON wallet_holds (account_id, status, expires_at);
      ALTER TABLE wallet_accounts ADD COLUMN IF NOT EXISTS referral_cents BIGINT NOT NULL DEFAULT 0 CHECK (referral_cents >= 0);
      ALTER TABLE wallet_accounts ADD COLUMN IF NOT EXISTS referral_held_cents BIGINT NOT NULL DEFAULT 0 CHECK (referral_held_cents >= 0);
      ALTER TABLE wallet_holds ADD COLUMN IF NOT EXISTS referral_cents BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE wallet_entries ADD COLUMN IF NOT EXISTS referral_delta_cents BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE wallet_entries ADD COLUMN IF NOT EXISTS referral_balance_cents BIGINT NOT NULL DEFAULT 0;
      `), "wallet init");
      await withPgRetry(() => pool.query(`
      CREATE TABLE IF NOT EXISTS xui_daily_traffic (
        date TEXT NOT NULL,
        email TEXT NOT NULL,
        node_guid TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT '',
        user_label TEXT NOT NULL DEFAULT '',
        plan_id TEXT NOT NULL DEFAULT '',
        node_name TEXT NOT NULL DEFAULT '',
        up_bytes BIGINT NOT NULL DEFAULT 0,
        down_bytes BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (date, email, node_guid)
      );
      ALTER TABLE xui_daily_traffic ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE xui_daily_traffic ADD COLUMN IF NOT EXISTS user_label TEXT NOT NULL DEFAULT '';
      ALTER TABLE xui_daily_traffic ADD COLUMN IF NOT EXISTS plan_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE xui_daily_traffic ADD COLUMN IF NOT EXISTS node_name TEXT NOT NULL DEFAULT '';
      CREATE INDEX IF NOT EXISTS xui_daily_traffic_email_date_idx ON xui_daily_traffic (email, date);
      CREATE INDEX IF NOT EXISTS xui_daily_traffic_date_node_idx ON xui_daily_traffic (date, node_guid);
      CREATE TABLE IF NOT EXISTS xui_traffic_cursor (
        email TEXT NOT NULL,
        node_guid TEXT NOT NULL,
        last_up BIGINT NOT NULL DEFAULT 0,
        last_down BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (email, node_guid)
      )
      `), "xui daily traffic init");
      await withPgRetry(() => pool.query(`
      CREATE TABLE IF NOT EXISTS xui_inbounds (
        key TEXT PRIMARY KEY,
        inbound_id INTEGER NOT NULL,
        node_guid TEXT NOT NULL,
        node_name TEXT NOT NULL DEFAULT '',
        node_host TEXT NOT NULL DEFAULT '',
        port INTEGER,
        protocol TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '',
        tag TEXT NOT NULL DEFAULT '',
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        sub_sort_index INTEGER NOT NULL DEFAULT 1,
        client_count INTEGER NOT NULL DEFAULT 0,
        recently_active BOOLEAN,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        probe_status TEXT NOT NULL DEFAULT 'unknown',
        probe_latency_ms INTEGER,
        probe_checked_at TIMESTAMPTZ,
        probe_error TEXT NOT NULL DEFAULT ''
      )
      `), "xui inbounds init");
      await withPgRetry(() => pool.query(`
      CREATE TABLE IF NOT EXISTS sync_job_runs (
        id BIGSERIAL PRIMARY KEY,
        job_id TEXT NOT NULL,
        trigger TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        duration_ms INTEGER,
        summary JSONB NOT NULL DEFAULT '{}',
        error TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS sync_job_runs_job_started_idx ON sync_job_runs (job_id, started_at DESC)
      `), "sync job runs init");
      await withPgRetry(() => pool.query(`
      CREATE TABLE IF NOT EXISTS catalog_v2_line_groups (
        id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
        name TEXT NOT NULL,
        is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        inbound_keys JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(inbound_keys) = 'array'),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS catalog_v2_products (
        id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
        type TEXT NOT NULL CHECK (type IN ('recurring_plan', 'lifetime_plan', 'addon')),
        is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        is_for_sale BOOLEAN NOT NULL DEFAULT FALSE,
        stock INTEGER CHECK (stock IS NULL OR stock >= 0),
        sort_order INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        features JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(features) = 'array'),
        is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
        line_group_id TEXT REFERENCES catalog_v2_line_groups(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
        duration_days INTEGER CHECK (duration_days IS NULL OR duration_days > 0),
        traffic_bytes BIGINT CHECK (traffic_bytes IS NULL OR traffic_bytes >= 0),
        device_limit INTEGER CHECK (device_limit IS NULL OR device_limit >= 0),
        price_cents BIGINT CHECK (price_cents IS NULL OR price_cents >= 0),
        traffic_customization_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        traffic_step_bytes BIGINT CHECK (traffic_step_bytes IS NULL OR traffic_step_bytes > 0),
        traffic_step_price_cents BIGINT CHECK (traffic_step_price_cents IS NULL OR traffic_step_price_cents > 0),
        traffic_max_steps INTEGER NOT NULL DEFAULT 10 CHECK (traffic_max_steps > 0),
        purchase_requirement TEXT CHECK (purchase_requirement IS NULL OR purchase_requirement IN ('standalone', 'requires_recurring_plan')),
        fulfillment_mode TEXT CHECK (fulfillment_mode IS NULL OR fulfillment_mode IN ('automatic', 'manual')),
        fulfillment_handler TEXT CHECK (fulfillment_handler IS NULL OR fulfillment_handler IN ('traffic_credit', 'manual')),
        fulfillment_config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fulfillment_config) = 'object'),
        delivery_description TEXT NOT NULL DEFAULT '',
        service_duration_days INTEGER CHECK (service_duration_days IS NULL OR service_duration_days > 0),
        allow_quantity BOOLEAN NOT NULL DEFAULT TRUE,
        min_quantity INTEGER NOT NULL DEFAULT 1 CHECK (min_quantity > 0),
        max_quantity INTEGER CHECK (max_quantity IS NULL OR max_quantity >= min_quantity),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK ((type <> 'addon') OR is_recommended = FALSE)
      );
      CREATE TABLE IF NOT EXISTS catalog_v2_product_periods (
        product_id TEXT NOT NULL REFERENCES catalog_v2_products(id) ON UPDATE RESTRICT ON DELETE CASCADE,
        id TEXT NOT NULL CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
        duration_days INTEGER NOT NULL CHECK (duration_days > 0),
        traffic_bytes BIGINT CHECK (traffic_bytes IS NULL OR traffic_bytes >= 0),
        device_limit INTEGER NOT NULL CHECK (device_limit >= 0),
        price_cents BIGINT NOT NULL CHECK (price_cents >= 0),
        is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (product_id, id),
        UNIQUE (product_id, duration_days)
      );
      CREATE TABLE IF NOT EXISTS catalog_v2_inventory_reservations (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES catalog_v2_products(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
        order_id TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        status TEXT NOT NULL CHECK (status IN ('reserved', 'consumed', 'released')),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (product_id, order_id)
      );
      CREATE INDEX IF NOT EXISTS catalog_v2_products_sort_idx ON catalog_v2_products (sort_order, id);
      CREATE INDEX IF NOT EXISTS catalog_v2_line_groups_sort_idx ON catalog_v2_line_groups (sort_order, id);
      CREATE INDEX IF NOT EXISTS catalog_v2_inventory_active_idx ON catalog_v2_inventory_reservations (product_id, status, expires_at);
      `), "catalog v2 init");
    } catch (error) {
      if (this.pool === pool) this.pool = null;
      await pool.end().catch(() => undefined);
      throw error;
    }
  }

  walletRow(row = {}) {
    const cashCents = Number(row.cash_cents || 0);
    const giftCents = Number(row.gift_cents || 0);
    const cashHeldCents = Number(row.cash_held_cents || 0);
    const giftHeldCents = Number(row.gift_held_cents || 0);
    const referralCents = Number(row.referral_cents || 0);
    const referralHeldCents = Number(row.referral_held_cents || 0);
    return {
      accountId: row.account_id || "",
      cashCents,
      giftCents,
      cashHeldCents,
      giftHeldCents,
      referralCents,
      referralHeldCents,
      availableCashCents: Math.max(cashCents - cashHeldCents, 0),
      availableGiftCents: Math.max(giftCents - giftHeldCents, 0),
      availableReferralCents: Math.max(referralCents - referralHeldCents, 0),
      vipSpendCents: Number(row.vip_spend_cents || 0)
    };
  }

  async ensureWallet(client, accountId, initialVipCents = 0) {
    await client.query(
      `INSERT INTO wallet_accounts (account_id, vip_spend_cents) VALUES ($1, $2)
       ON CONFLICT (account_id) DO NOTHING`,
      [accountId, initialVipCents]
    );
  }

  async releaseExpiredWalletHolds(client, accountId) {
    const expired = await client.query(
      `SELECT cash_cents, gift_cents, referral_cents FROM wallet_holds
       WHERE account_id = $1 AND status = 'pending' AND expires_at <= NOW() FOR UPDATE`,
      [accountId]
    );
    const cashCents = expired.rows.reduce((sum, row) => sum + Number(row.cash_cents), 0);
    const giftCents = expired.rows.reduce((sum, row) => sum + Number(row.gift_cents), 0);
    const referralCents = expired.rows.reduce((sum, row) => sum + Number(row.referral_cents), 0);
    if (!cashCents && !giftCents && !referralCents) return;
    await client.query(
      `UPDATE wallet_accounts SET cash_held_cents = GREATEST(cash_held_cents - $2, 0), gift_held_cents = GREATEST(gift_held_cents - $3, 0), referral_held_cents = GREATEST(referral_held_cents - $4, 0), updated_at = NOW() WHERE account_id = $1`,
      [accountId, cashCents, giftCents, referralCents]
    );
    await client.query(
      `UPDATE wallet_holds SET status = 'released', updated_at = NOW() WHERE account_id = $1 AND status = 'pending' AND expires_at <= NOW()`,
      [accountId]
    );
  }

  async getWallet(accountId, initialVipCents = 0) {
    return withPgRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        await this.ensureWallet(client, accountId, initialVipCents);
        await client.query("SELECT account_id FROM wallet_accounts WHERE account_id = $1 FOR UPDATE", [accountId]);
        await this.releaseExpiredWalletHolds(client, accountId);
        const result = await client.query("SELECT * FROM wallet_accounts WHERE account_id = $1", [accountId]);
        await client.query("COMMIT");
        return this.walletRow(result.rows[0]);
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        client.release();
      }
    }, `load wallet ${accountId}`);
  }

  async listWalletEntries(accountId, limit = 100) {
    const result = await withPgRetry(
      () => this.pool.query(
         `SELECT id, type, cash_delta_cents, gift_delta_cents, referral_delta_cents, vip_delta_cents, cash_balance_cents, gift_balance_cents, referral_balance_cents, vip_spend_cents, source_id, description, created_at
         FROM wallet_entries WHERE account_id = $1 AND (cash_delta_cents <> 0 OR gift_delta_cents <> 0 OR referral_delta_cents <> 0) ORDER BY created_at DESC LIMIT $2`,
        [accountId, Math.min(Math.max(Number(limit) || 100, 1), 200)]
      ),
      `list wallet entries ${accountId}`
    );
    return result.rows.map(row => ({
      id: row.id,
      type: row.type,
      cashDeltaCents: Number(row.cash_delta_cents),
      giftDeltaCents: Number(row.gift_delta_cents),
      referralDeltaCents: Number(row.referral_delta_cents),
      vipDeltaCents: Number(row.vip_delta_cents),
      cashBalanceCents: Number(row.cash_balance_cents),
      giftBalanceCents: Number(row.gift_balance_cents),
      referralBalanceCents: Number(row.referral_balance_cents),
      vipSpendCents: Number(row.vip_spend_cents),
      sourceId: row.source_id,
      description: row.description,
      createdAt: row.created_at
    }));
  }

  async reserveWallet({ accountId, orderId, amountCents, expiresAt, initialVipCents = 0 }) {
    return withPgRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        await this.ensureWallet(client, accountId, initialVipCents);
        await client.query("SELECT account_id FROM wallet_accounts WHERE account_id = $1 FOR UPDATE", [accountId]);
        await this.releaseExpiredWalletHolds(client, accountId);
        const existing = await client.query("SELECT * FROM wallet_holds WHERE order_id = $1", [orderId]);
        if (existing.rows[0]) {
          await client.query("COMMIT");
          return { cashCents: Number(existing.rows[0].cash_cents), giftCents: Number(existing.rows[0].gift_cents), referralCents: Number(existing.rows[0].referral_cents) };
        }
        const walletResult = await client.query("SELECT * FROM wallet_accounts WHERE account_id = $1", [accountId]);
        const wallet = this.walletRow(walletResult.rows[0]);
        const giftCents = Math.min(amountCents, wallet.availableGiftCents);
        const referralCents = Math.min(amountCents - giftCents, wallet.availableReferralCents);
        const cashCents = Math.min(amountCents - giftCents - referralCents, wallet.availableCashCents);
        await client.query(
          "INSERT INTO wallet_holds (order_id, account_id, cash_cents, gift_cents, referral_cents, expires_at) VALUES ($1, $2, $3, $4, $5, $6)",
          [orderId, accountId, cashCents, giftCents, referralCents, expiresAt]
        );
        await client.query(
          "UPDATE wallet_accounts SET cash_held_cents = cash_held_cents + $2, gift_held_cents = gift_held_cents + $3, referral_held_cents = referral_held_cents + $4, updated_at = NOW() WHERE account_id = $1",
          [accountId, cashCents, giftCents, referralCents]
        );
        await client.query("COMMIT");
        return { cashCents, giftCents, referralCents };
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        client.release();
      }
    }, `reserve wallet ${accountId}`);
  }

  async releaseWalletHold(orderId) {
    return withPgRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query("SELECT * FROM wallet_holds WHERE order_id = $1 FOR UPDATE", [orderId]);
        const hold = result.rows[0];
        if (hold?.status === "pending") {
          await client.query(
            "UPDATE wallet_accounts SET cash_held_cents = GREATEST(cash_held_cents - $2, 0), gift_held_cents = GREATEST(gift_held_cents - $3, 0), referral_held_cents = GREATEST(referral_held_cents - $4, 0), updated_at = NOW() WHERE account_id = $1",
            [hold.account_id, hold.cash_cents, hold.gift_cents, hold.referral_cents]
          );
          await client.query("UPDATE wallet_holds SET status = 'released', updated_at = NOW() WHERE order_id = $1", [orderId]);
        }
        await client.query("COMMIT");
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        client.release();
      }
    }, `release wallet hold ${orderId}`);
  }

  async settleWalletPurchase({ id, accountId, orderId, vipDeltaCents, description, initialVipCents = 0 }) {
    return this.applyWalletEntry({ id, accountId, sourceId: orderId, idempotencyKey: `purchase:${orderId}`, type: "purchase", vipDeltaCents, description, initialVipCents, settleOrderId: orderId });
  }

  async creditWalletRecharge({ id, accountId, orderId, amountCents, description, initialVipCents = 0 }) {
    return this.applyWalletEntry({ id, accountId, sourceId: orderId, idempotencyKey: `recharge:${orderId}`, type: "recharge", cashDeltaCents: amountCents, vipDeltaCents: amountCents, description, initialVipCents });
  }

  async creditWalletGift({ id, accountId, sourceId, amountCents, description, idempotencyKey, initialVipCents = 0 }) {
    return this.applyWalletEntry({ id, accountId, sourceId, idempotencyKey, type: "reward", giftDeltaCents: amountCents, description, initialVipCents });
  }

  async creditReferralReward({ id, accountId, sourceId, amountCents, description, idempotencyKey, initialVipCents = 0 }) {
    return this.applyWalletEntry({ id, accountId, sourceId, idempotencyKey, type: "referral", referralDeltaCents: amountCents, description, initialVipCents });
  }

  async checkWalletEntryReversal(originalIdempotencyKey, reversalIdempotencyKey) {
    const result = await withPgRetry(
      () => this.pool.query(
        `SELECT original.*, reversal.id AS reversal_id,
                wallet.cash_cents, wallet.gift_cents, wallet.referral_cents, wallet.vip_spend_cents,
                wallet.cash_held_cents, wallet.gift_held_cents, wallet.referral_held_cents
         FROM wallet_entries original
         JOIN wallet_accounts wallet ON wallet.account_id = original.account_id
         LEFT JOIN wallet_entries reversal ON reversal.idempotency_key = $2
         WHERE original.idempotency_key = $1`,
        [originalIdempotencyKey, reversalIdempotencyKey]
      ),
      `check wallet reversal ${originalIdempotencyKey}`
    );
    const row = result.rows[0];
    if (!row) throw new Error("找不到需要撤销的钱包流水。");
    if (row.reversal_id) return;
    const balances = ["cash", "gift", "referral"].map(bucket => ({
      balance: Number(row[`${bucket}_cents`]) - Number(row[`${bucket}_delta_cents`]),
      held: Number(row[`${bucket}_held_cents`])
    }));
    if (balances.some(item => item.balance < item.held) || Number(row.vip_spend_cents) - Number(row.vip_delta_cents) < 0) {
      throw new Error("相关余额已被后续订单使用，请先撤销后续订单。");
    }
  }

  async reverseWalletEntry({ id, originalIdempotencyKey, idempotencyKey, sourceId, description }) {
    return withPgRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const originalResult = await client.query("SELECT * FROM wallet_entries WHERE idempotency_key = $1 FOR UPDATE", [originalIdempotencyKey]);
        const original = originalResult.rows[0];
        if (!original) throw new Error("找不到需要撤销的钱包流水。");
        await client.query("SELECT account_id FROM wallet_accounts WHERE account_id = $1 FOR UPDATE", [original.account_id]);
        const duplicate = await client.query("SELECT id FROM wallet_entries WHERE idempotency_key = $1", [idempotencyKey]);
        if (duplicate.rows[0]) {
          const wallet = await client.query("SELECT * FROM wallet_accounts WHERE account_id = $1", [original.account_id]);
          await client.query("COMMIT");
          return this.walletRow(wallet.rows[0]);
        }
        const walletResult = await client.query("SELECT * FROM wallet_accounts WHERE account_id = $1", [original.account_id]);
        const before = this.walletRow(walletResult.rows[0]);
        const cashDeltaCents = -Number(original.cash_delta_cents);
        const giftDeltaCents = -Number(original.gift_delta_cents);
        const referralDeltaCents = -Number(original.referral_delta_cents);
        const vipDeltaCents = -Number(original.vip_delta_cents);
        if (
          before.cashCents + cashDeltaCents < before.cashHeldCents ||
          before.giftCents + giftDeltaCents < before.giftHeldCents ||
          before.referralCents + referralDeltaCents < before.referralHeldCents ||
          before.vipSpendCents + vipDeltaCents < 0
        ) throw new Error("相关余额已被后续订单使用，请先撤销后续订单。");
        const updated = await client.query(
          `UPDATE wallet_accounts SET
             cash_cents = cash_cents + $2,
             gift_cents = gift_cents + $3,
             referral_cents = referral_cents + $4,
             vip_spend_cents = vip_spend_cents + $5,
             updated_at = NOW()
           WHERE account_id = $1 RETURNING *`,
          [original.account_id, cashDeltaCents, giftDeltaCents, referralDeltaCents, vipDeltaCents]
        );
        const wallet = this.walletRow(updated.rows[0]);
        await client.query(
          `INSERT INTO wallet_entries (id, account_id, type, cash_delta_cents, gift_delta_cents, referral_delta_cents, vip_delta_cents, cash_balance_cents, gift_balance_cents, referral_balance_cents, vip_spend_cents, source_id, description, idempotency_key)
           VALUES ($1, $2, 'reversal', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [id, original.account_id, cashDeltaCents, giftDeltaCents, referralDeltaCents, vipDeltaCents, wallet.cashCents, wallet.giftCents, wallet.referralCents, wallet.vipSpendCents, sourceId, description, idempotencyKey]
        );
        await client.query("UPDATE wallet_holds SET status = 'reversed', updated_at = NOW() WHERE order_id = $1 AND status = 'settled'", [original.source_id]);
        await client.query("COMMIT");
        return wallet;
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        client.release();
      }
    }, `reverse wallet entry ${originalIdempotencyKey}`);
  }

  async applyWalletEntry({ id, accountId, sourceId, idempotencyKey, type, cashDeltaCents = 0, giftDeltaCents = 0, referralDeltaCents = 0, vipDeltaCents = 0, description = "", initialVipCents = 0, settleOrderId = "" }) {
    return withPgRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        await this.ensureWallet(client, accountId, initialVipCents);
        await client.query("SELECT account_id FROM wallet_accounts WHERE account_id = $1 FOR UPDATE", [accountId]);
        const duplicate = await client.query("SELECT id FROM wallet_entries WHERE idempotency_key = $1", [idempotencyKey]);
        if (duplicate.rows[0]) {
          const wallet = await client.query("SELECT * FROM wallet_accounts WHERE account_id = $1", [accountId]);
          await client.query("COMMIT");
          return this.walletRow(wallet.rows[0]);
        }
        let heldCashCents = 0;
        let heldGiftCents = 0;
        let heldReferralCents = 0;
        if (settleOrderId) {
          const holdResult = await client.query("SELECT * FROM wallet_holds WHERE order_id = $1 FOR UPDATE", [settleOrderId]);
          const hold = holdResult.rows[0];
          if (hold?.status === "pending") {
            heldCashCents = Number(hold.cash_cents);
            heldGiftCents = Number(hold.gift_cents);
            heldReferralCents = Number(hold.referral_cents);
            await client.query("UPDATE wallet_holds SET status = 'settled', updated_at = NOW() WHERE order_id = $1", [settleOrderId]);
          } else if (hold?.status === "settled") {
            const wallet = await client.query("SELECT * FROM wallet_accounts WHERE account_id = $1", [accountId]);
            await client.query("COMMIT");
            return this.walletRow(wallet.rows[0]);
          }
        }
        const walletResult = await client.query(
          `UPDATE wallet_accounts SET
             cash_cents = cash_cents + $2 - $4,
             gift_cents = gift_cents + $3 - $5,
             referral_cents = referral_cents + $7 - $8,
             cash_held_cents = GREATEST(cash_held_cents - $4, 0),
             gift_held_cents = GREATEST(gift_held_cents - $5, 0),
             referral_held_cents = GREATEST(referral_held_cents - $8, 0),
             vip_spend_cents = GREATEST(vip_spend_cents + $6, 0),
             updated_at = NOW()
           WHERE account_id = $1 RETURNING *`,
           [accountId, cashDeltaCents, giftDeltaCents, heldCashCents, heldGiftCents, vipDeltaCents, referralDeltaCents, heldReferralCents]
        );
        const wallet = this.walletRow(walletResult.rows[0]);
        await client.query(
          `INSERT INTO wallet_entries (id, account_id, type, cash_delta_cents, gift_delta_cents, referral_delta_cents, vip_delta_cents, cash_balance_cents, gift_balance_cents, referral_balance_cents, vip_spend_cents, source_id, description, idempotency_key)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
           [id, accountId, type, cashDeltaCents - heldCashCents, giftDeltaCents - heldGiftCents, referralDeltaCents - heldReferralCents, vipDeltaCents, wallet.cashCents, wallet.giftCents, wallet.referralCents, wallet.vipSpendCents, sourceId, description, idempotencyKey]
        );
        await client.query("COMMIT");
        return wallet;
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        client.release();
      }
    }, `apply wallet entry ${idempotencyKey}`);
  }

  async ping() {
    await this.pool.query("SELECT 1");
  }

  async appendXuiAuditLog(entry) {
    await withPgRetry(() => appendXuiAuditLog(this.pool, entry), "append xui audit log");
  }

  async listXuiAuditLogs(options) {
    return withPgRetry(() => listXuiAuditLogs(this.pool, options), "list xui audit logs");
  }

  async getRecord(collection, id) {
    const result = await withPgRetry(
      () => this.pool.query("SELECT data FROM app_records WHERE collection = $1 AND id = $2", [collection, id]),
      `load ${collection}/${id}`
    );
    return result.rows[0]?.data || null;
  }

  async getXuiNodeCredentials() {
    const result = await withPgRetry(() => this.pool.query("SELECT guid, sealed_token FROM xui_node_credentials"), "load xui node credentials");
    return Object.fromEntries(result.rows.map(row => [row.guid, row.sealed_token]));
  }

  async setXuiNodeCredential(guid, sealedToken) {
    await withPgRetry(() => this.pool.query(
      `INSERT INTO xui_node_credentials (guid, sealed_token, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (guid) DO UPDATE SET sealed_token = EXCLUDED.sealed_token, updated_at = NOW()`,
      [guid, sealedToken]
    ), `save xui node credential ${guid}`);
  }

  async setRecord(collection, id, data) {
    await withPgRetry(
      () => this.pool.query(
        `INSERT INTO app_records (collection, id, position, data, updated_at)
         VALUES ($1, $2, 0, $3::jsonb, NOW())
         ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [collection, id, JSON.stringify(data)]
      ),
      `save ${collection}/${id}`
    );
  }

  async deleteRecord(collection, id) {
    await withPgRetry(
      () => this.pool.query("DELETE FROM app_records WHERE collection = $1 AND id = $2", [collection, id]),
      `delete ${collection}/${id}`
    );
  }

  async close() {
    if (this.initPromise) await this.initPromise.catch(() => undefined);
    await this.pool?.end();
    this.pool = null;
  }

  async loadAll() {
    return this.loadCollections(COLLECTIONS);
  }

  async loadCollections(collections) {
    const result = {};
    for (const collection of collections) {
      result[collection] = [];
    }
    const query = "SELECT collection, data FROM app_records WHERE collection = ANY($1::text[]) ORDER BY collection ASC, position ASC";
    const rows = await withPgRetry(() => this.pool.query(query, [collections]), "load collections");
    for (const row of rows.rows) {
      if (Array.isArray(result[row.collection])) result[row.collection].push(row.data);
    }
    return result;
  }

  async saveCollection(collection, rows) {
    return withPgRetry(async () => {
      const uniqueRows = [];
      const seenIds = new Set();
      rows.forEach((row, index) => {
        const id = row.id || `${collection}-${index}`;
        if (seenIds.has(id)) return;
        seenIds.add(id);
        uniqueRows.push({ id, row });
      });
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        // Full-collection rewrites must be serialized. Without this lock, two
        // concurrent writers can both DELETE the old snapshot and then race to
        // INSERT the same primary keys.
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`app_records:${collection}`]);
        await client.query("DELETE FROM app_records WHERE collection = $1", [collection]);
        if (uniqueRows.length) {
          const ids = [];
          const positions = [];
          const datas = [];
          uniqueRows.forEach(({ id, row }, index) => {
            ids.push(id);
            positions.push(index);
            datas.push(JSON.stringify(row));
          });
          await client.query(
            `INSERT INTO app_records (collection, id, position, data, updated_at)
             SELECT $1, u.id, u.position, u.data::jsonb, NOW()
             FROM UNNEST($2::text[], $3::int[], $4::text[]) AS u(id, position, data)`,
            [collection, ids, positions, datas]
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {}
        throw error;
      } finally {
        client.release();
      }
    }, `save ${collection}`);
  }

  // Apply one sampling round of per-(user,node) cumulative counters to the daily
  // table. `samples` = [{ email, nodeGuid, up, down }] with the CURRENT counter
  // values read from each node. Deltas are computed against xui_traffic_cursor and
  // added to today's row; the cursor advances to the current values. The whole
  // round runs under a transaction-scoped advisory lock so concurrent processes
  // serialize and can never double-count (the second writer sees the advanced
  // cursor and derives a zero/partial delta). First observation of a pair records
  // no delta — it only seeds the cursor.
  async recordXuiTrafficSamples(dateKey, samples, localGuid = "") {
    const clean = (Array.isArray(samples) ? samples : [])
      .filter(sample => sample && sample.email && sample.nodeGuid)
      .map(sample => ({
        email: String(sample.email),
        nodeGuid: String(sample.nodeGuid),
        userId: String(sample.userId || ""),
        userLabel: String(sample.userLabel || ""),
        planId: String(sample.planId || ""),
        nodeName: String(sample.nodeName || ""),
        up: Math.max(0, Number(sample.up) || 0),
        down: Math.max(0, Number(sample.down) || 0)
      }));
    if (!clean.length) return { applied: 0, seeded: 0 };
    return withPgRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["xui_traffic_sync"]);
        const emails = [...new Set(clean.map(sample => sample.email))];
        const cursorResult = await client.query(
          "SELECT email, node_guid, last_up, last_down FROM xui_traffic_cursor WHERE email = ANY($1::text[])",
          [emails]
        );
        const cursorByKey = new Map(
          cursorResult.rows.map(row => [`${row.email} ${row.node_guid}`, { up: Number(row.last_up), down: Number(row.last_down) }])
        );
        const delta = { emails: [], nodes: [], userIds: [], userLabels: [], planIds: [], nodeNames: [], ups: [], downs: [] };
        const cursor = { emails: [], nodes: [], ups: [], downs: [] };
        let seeded = 0;
        const deltaByEmail = new Map();
        const sampleByKey = new Map();
        for (const sample of clean) {
          const stored = cursorByKey.get(`${sample.email} ${sample.nodeGuid}`) || null;
          if (!stored) seeded += 1;
          const change = directionalDelta({ up: sample.up, down: sample.down }, stored);
          const perNode = deltaByEmail.get(sample.email) || {};
          perNode[sample.nodeGuid] = change;
          deltaByEmail.set(sample.email, perNode);
          sampleByKey.set(`${sample.email} ${sample.nodeGuid}`, sample);
          cursor.emails.push(sample.email);
          cursor.nodes.push(sample.nodeGuid);
          cursor.ups.push(sample.up);
          cursor.downs.push(sample.down);
        }
        for (const [email, perNode] of deltaByEmail) {
          applyLocalNodeDelta(perNode, localGuid);
          for (const [node, change] of Object.entries(perNode)) {
            if (change.up > 0 || change.down > 0) {
              const sample = sampleByKey.get(`${email} ${node}`) || {};
              delta.emails.push(email);
              delta.nodes.push(node);
              delta.userIds.push(sample.userId || "");
              delta.userLabels.push(sample.userLabel || "");
              delta.planIds.push(sample.planId || "");
              delta.nodeNames.push(sample.nodeName || "");
              delta.ups.push(change.up);
              delta.downs.push(change.down);
            }
          }
        }
        if (delta.emails.length) {
          await client.query(
            `INSERT INTO xui_daily_traffic (date, email, node_guid, user_id, user_label, plan_id, node_name, up_bytes, down_bytes, updated_at)
             SELECT $1, u.email, u.node, u.user_id, u.user_label, u.plan_id, u.node_name, u.up, u.down, NOW()
             FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::bigint[], $9::bigint[])
               AS u(email, node, user_id, user_label, plan_id, node_name, up, down)
             ON CONFLICT (date, email, node_guid)
             DO UPDATE SET up_bytes = xui_daily_traffic.up_bytes + EXCLUDED.up_bytes,
                           down_bytes = xui_daily_traffic.down_bytes + EXCLUDED.down_bytes,
                           user_id = COALESCE(NULLIF(xui_daily_traffic.user_id, ''), EXCLUDED.user_id),
                           user_label = CASE WHEN EXCLUDED.user_label <> '' THEN EXCLUDED.user_label ELSE xui_daily_traffic.user_label END,
                           plan_id = COALESCE(NULLIF(xui_daily_traffic.plan_id, ''), EXCLUDED.plan_id),
                           node_name = CASE WHEN EXCLUDED.node_name <> '' THEN EXCLUDED.node_name ELSE xui_daily_traffic.node_name END,
                           updated_at = NOW()`,
            [dateKey, delta.emails, delta.nodes, delta.userIds, delta.userLabels, delta.planIds, delta.nodeNames, delta.ups, delta.downs]
          );
        }
        await client.query(
          `INSERT INTO xui_traffic_cursor (email, node_guid, last_up, last_down, updated_at)
           SELECT u.email, u.node, u.up, u.down, NOW()
           FROM UNNEST($1::text[], $2::text[], $3::bigint[], $4::bigint[]) AS u(email, node, up, down)
           ON CONFLICT (email, node_guid)
           DO UPDATE SET last_up = EXCLUDED.last_up, last_down = EXCLUDED.last_down, updated_at = NOW()`,
          [cursor.emails, cursor.nodes, cursor.ups, cursor.downs]
        );
        await client.query("COMMIT");
        return { applied: delta.emails.length, seeded };
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        client.release();
      }
    }, "record xui traffic samples");
  }

  // Per-node totals for one user from `fromDateKey` (inclusive) to now — the
  // current billing cycle. Returns [{ nodeGuid, up, down }].
  async sumXuiUserCycle(email, fromDateKey) {
    const result = await withPgRetry(
      () => this.pool.query(
        `SELECT node_guid, SUM(up_bytes)::bigint AS up, SUM(down_bytes)::bigint AS down
         FROM xui_daily_traffic WHERE email = $1 AND date >= $2 GROUP BY node_guid`,
        [email, fromDateKey]
      ),
      `sum xui cycle ${email}`
    );
    return result.rows.map(row => ({ nodeGuid: row.node_guid, up: Number(row.up), down: Number(row.down) }));
  }

  // Batched per-node cycle sums for many users at once: `cutoffs` = [{ email, fromDate }].
  // Each user's window starts at its own cycle-start date. Returns [{ email, nodeGuid, up, down }].
  // One query for the whole refresh loop instead of one per user.
  async sumXuiCyclesByUser(cutoffs) {
    const list = (Array.isArray(cutoffs) ? cutoffs : []).filter(item => item && item.email && item.fromDate);
    if (!list.length) return [];
    const emails = list.map(item => String(item.email));
    const froms = list.map(item => String(item.fromDate));
    const result = await withPgRetry(
      () => this.pool.query(
        `SELECT d.email, d.node_guid, SUM(d.up_bytes)::bigint AS up, SUM(d.down_bytes)::bigint AS down
         FROM xui_daily_traffic d
         JOIN UNNEST($1::text[], $2::text[]) AS c(email, from_date)
           ON d.email = c.email AND d.date >= c.from_date
         GROUP BY d.email, d.node_guid`,
        [emails, froms]
      ),
      "sum xui cycles by user"
    );
    return result.rows.map(row => ({ email: row.email, nodeGuid: row.node_guid, up: Number(row.up), down: Number(row.down) }));
  }

  // Per-day up/down totals (summed over nodes) for one user in a date range.
  async xuiUserDailySeries(email, fromDateKey, toDateKey) {
    const result = await withPgRetry(
      () => this.pool.query(
        `SELECT date, SUM(up_bytes)::bigint AS up, SUM(down_bytes)::bigint AS down
         FROM xui_daily_traffic WHERE email = $1 AND date BETWEEN $2 AND $3 GROUP BY date ORDER BY date`,
        [email, fromDateKey, toDateKey]
      ),
      `xui daily series ${email}`
    );
    return result.rows.map(row => ({ date: row.date, up: Number(row.up), down: Number(row.down) }));
  }

  // Directional application traffic rows used by sales profitability reports.
  async xuiTrafficRange(fromDateKey, toDateKey) {
    const result = await withPgRetry(
      () => this.pool.query(
        `SELECT date, email, node_guid, user_id, user_label, plan_id, node_name, up_bytes, down_bytes
         FROM xui_daily_traffic WHERE date BETWEEN $1 AND $2 ORDER BY date, email, node_guid`,
        [fromDateKey, toDateKey]
      ),
      `load xui traffic range ${fromDateKey}..${toDateKey}`
    );
    return result.rows.map(row => ({
      date: row.date,
      email: row.email,
      nodeGuid: row.node_guid,
      userId: row.user_id,
      userLabel: row.user_label,
      planId: row.plan_id,
      nodeName: row.node_name,
      inBytes: Number(row.up_bytes),
      outBytes: Number(row.down_bytes)
    }));
  }

  async listCatalogV2LineGroups() {
    const result = await withPgRetry(() => this.pool.query(
      `SELECT g.*, COUNT(p.id)::int AS product_count
       FROM catalog_v2_line_groups g
       LEFT JOIN catalog_v2_products p ON p.line_group_id = g.id AND p.is_enabled = TRUE
       GROUP BY g.id ORDER BY g.sort_order, g.id`
    ), "list catalog v2 line groups");
    return result.rows.map(row => ({
      id: row.id, name: row.name, isEnabled: row.is_enabled, sortOrder: row.sort_order,
      inboundKeys: Array.isArray(row.inbound_keys) ? row.inbound_keys : [], productCount: Number(row.product_count || 0),
      createdAt: row.created_at, updatedAt: row.updated_at
    }));
  }

  async upsertCatalogV2LineGroup(group, { create = false } = {}) {
    const query = create
      ? `INSERT INTO catalog_v2_line_groups (id, name, is_enabled, sort_order, inbound_keys)
         VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *`
      : `UPDATE catalog_v2_line_groups SET name=$2, is_enabled=$3, sort_order=$4, inbound_keys=$5::jsonb, updated_at=NOW()
         WHERE id=$1 RETURNING *`;
    const result = await withPgRetry(() => this.pool.query(query, [group.id, group.name, group.isEnabled, group.sortOrder, JSON.stringify(group.inboundKeys)]), `save catalog v2 line group ${group.id}`);
    return result.rows[0] || null;
  }

  async deleteCatalogV2LineGroup(id) {
    return withPgRetry(() => this.pool.query("DELETE FROM catalog_v2_line_groups WHERE id=$1", [id]), `delete catalog v2 line group ${id}`);
  }

  async listCatalogV2Products() {
    const [products, periods] = await Promise.all([
      withPgRetry(() => this.pool.query("SELECT * FROM catalog_v2_products ORDER BY sort_order, id"), "list catalog v2 products"),
      withPgRetry(() => this.pool.query("SELECT * FROM catalog_v2_product_periods ORDER BY product_id, sort_order, duration_days"), "list catalog v2 periods")
    ]);
    const periodsByProduct = new Map();
    for (const row of periods.rows) {
      const list = periodsByProduct.get(row.product_id) || [];
      list.push({ id: row.id, durationDays: row.duration_days, trafficBytes: row.traffic_bytes === null ? null : Number(row.traffic_bytes), deviceLimit: row.device_limit, priceCents: Number(row.price_cents), isEnabled: row.is_enabled, sortOrder: row.sort_order });
      periodsByProduct.set(row.product_id, list);
    }
    return products.rows.map(row => this.catalogV2ProductRow(row, periodsByProduct.get(row.id) || []));
  }

  catalogV2ProductRow(row, periods = []) {
    return {
      id: row.id, type: row.type, isEnabled: row.is_enabled, isForSale: row.is_for_sale, stock: row.stock,
      sortOrder: row.sort_order, name: row.name, description: row.description, features: row.features || [],
      isRecommended: row.is_recommended, lineGroupId: row.line_group_id, durationDays: row.duration_days,
      trafficBytes: row.traffic_bytes === null ? null : Number(row.traffic_bytes), deviceLimit: row.device_limit,
      priceCents: row.price_cents === null ? null : Number(row.price_cents),
      trafficCustomization: { enabled: row.traffic_customization_enabled, stepBytes: row.traffic_step_bytes === null ? null : Number(row.traffic_step_bytes), stepPriceCents: row.traffic_step_price_cents === null ? null : Number(row.traffic_step_price_cents), maxSteps: row.traffic_max_steps },
      purchaseRequirement: row.purchase_requirement, fulfillment: { mode: row.fulfillment_mode, handler: row.fulfillment_handler, config: row.fulfillment_config || {} },
      deliveryDescription: row.delivery_description, serviceDurationDays: row.service_duration_days,
      allowQuantity: row.allow_quantity, minQuantity: row.min_quantity, maxQuantity: row.max_quantity,
      periods, createdAt: row.created_at, updatedAt: row.updated_at
    };
  }

  async saveCatalogV2Product(product, { create = false } = {}) {
    return withPgRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const values = [product.id, product.type, product.isEnabled, product.isForSale, product.stock, product.sortOrder, product.name, product.description, JSON.stringify(product.features), product.isRecommended, product.lineGroupId, product.durationDays, product.trafficBytes, product.deviceLimit, product.priceCents, product.trafficCustomization.enabled, product.trafficCustomization.stepBytes, product.trafficCustomization.stepPriceCents, product.trafficCustomization.maxSteps, product.purchaseRequirement, product.fulfillment.mode, product.fulfillment.handler, JSON.stringify(product.fulfillment.config), product.deliveryDescription, product.serviceDurationDays, product.allowQuantity, product.minQuantity, product.maxQuantity];
        const result = create
          ? await client.query(`INSERT INTO catalog_v2_products (id,type,is_enabled,is_for_sale,stock,sort_order,name,description,features,is_recommended,line_group_id,duration_days,traffic_bytes,device_limit,price_cents,traffic_customization_enabled,traffic_step_bytes,traffic_step_price_cents,traffic_max_steps,purchase_requirement,fulfillment_mode,fulfillment_handler,fulfillment_config,delivery_description,service_duration_days,allow_quantity,min_quantity,max_quantity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb,$24,$25,$26,$27,$28) RETURNING *`, values)
          : await client.query(`UPDATE catalog_v2_products SET type=$2,is_enabled=$3,is_for_sale=$4,stock=$5,sort_order=$6,name=$7,description=$8,features=$9::jsonb,is_recommended=$10,line_group_id=$11,duration_days=$12,traffic_bytes=$13,device_limit=$14,price_cents=$15,traffic_customization_enabled=$16,traffic_step_bytes=$17,traffic_step_price_cents=$18,traffic_max_steps=$19,purchase_requirement=$20,fulfillment_mode=$21,fulfillment_handler=$22,fulfillment_config=$23::jsonb,delivery_description=$24,service_duration_days=$25,allow_quantity=$26,min_quantity=$27,max_quantity=$28,updated_at=NOW() WHERE id=$1 RETURNING *`, values);
        if (!result.rows[0]) throw Object.assign(new Error("商品不存在。"), { statusCode: 404 });
        await client.query("DELETE FROM catalog_v2_product_periods WHERE product_id=$1", [product.id]);
        for (const period of product.periods) {
          await client.query(`INSERT INTO catalog_v2_product_periods (product_id,id,duration_days,traffic_bytes,device_limit,price_cents,is_enabled,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [product.id, period.id, period.durationDays, period.trafficBytes, period.deviceLimit, period.priceCents, period.isEnabled, period.sortOrder]);
        }
        await client.query("COMMIT");
        return this.catalogV2ProductRow(result.rows[0], product.periods);
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally { client.release(); }
    }, `save catalog v2 product ${product.id}`);
  }

  async deleteCatalogV2Product(id) {
    return withPgRetry(() => this.pool.query("DELETE FROM catalog_v2_products WHERE id=$1", [id]), `delete catalog v2 product ${id}`);
  }

  async reserveCatalogV2Inventory({ id, productId, orderId, quantity = 1, expiresAt, now = new Date().toISOString() }) {
    return withPgRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const productResult = await client.query("SELECT id, stock FROM catalog_v2_products WHERE id=$1 FOR UPDATE", [productId]);
        const product = productResult.rows[0];
        if (!product) throw new Error("V2 商品不存在。");
        await client.query("UPDATE catalog_v2_inventory_reservations SET status='released', updated_at=NOW() WHERE product_id=$1 AND status='reserved' AND expires_at <= $2", [productId, now]);
        const existingResult = await client.query("SELECT * FROM catalog_v2_inventory_reservations WHERE product_id=$1 AND order_id=$2 FOR UPDATE", [productId, orderId]);
        const existing = existingResult.rows[0];
        if (existing) {
          if (existing.status === "reserved" && Number(existing.quantity) === Number(quantity)) {
            await client.query("COMMIT");
            return { id: existing.id, productId, orderId, quantity: Number(existing.quantity), status: existing.status, expiresAt: existing.expires_at };
          }
          throw new Error("订单已有不同状态的库存记录。");
        }
        const reservedResult = await client.query("SELECT COALESCE(SUM(quantity), 0)::int AS quantity FROM catalog_v2_inventory_reservations WHERE product_id=$1 AND status='reserved' AND expires_at > $2", [productId, now]);
        const reserved = Number(reservedResult.rows[0].quantity || 0);
        if (product.stock !== null && Number(product.stock) - reserved < Number(quantity)) throw new Error("商品库存不足。");
        const result = await client.query("INSERT INTO catalog_v2_inventory_reservations (id, product_id, order_id, quantity, status, expires_at) VALUES ($1,$2,$3,$4,'reserved',$5) RETURNING *", [id, productId, orderId, quantity, expiresAt]);
        await client.query("COMMIT");
        const row = result.rows[0];
        return { id: row.id, productId: row.product_id, orderId: row.order_id, quantity: Number(row.quantity), status: row.status, expiresAt: row.expires_at };
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally { client.release(); }
    }, `reserve catalog v2 inventory ${productId}/${orderId}`);
  }

  async consumeCatalogV2Inventory(orderId, { now = new Date().toISOString() } = {}) {
    return withPgRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query("SELECT * FROM catalog_v2_inventory_reservations WHERE order_id=$1 FOR UPDATE", [orderId]);
        if (!result.rows.length) { await client.query("COMMIT"); return []; }
        const consumed = [];
        for (const row of result.rows) {
          if (row.status === "consumed") { consumed.push(row); continue; }
          if (row.status !== "reserved" || new Date(row.expires_at).getTime() <= new Date(now).getTime()) throw new Error("库存预占已失效，订单需要人工处理。");
          const productResult = await client.query("SELECT stock FROM catalog_v2_products WHERE id=$1 FOR UPDATE", [row.product_id]);
          const product = productResult.rows[0];
          if (!product) throw new Error("预占商品不存在。");
          if (product.stock !== null) {
            const update = await client.query("UPDATE catalog_v2_products SET stock=stock-$2, updated_at=NOW() WHERE id=$1 AND stock >= $2", [row.product_id, row.quantity]);
            if (!update.rowCount) throw new Error("商品库存不足，订单需要人工处理。");
          }
          await client.query("UPDATE catalog_v2_inventory_reservations SET status='consumed', updated_at=NOW() WHERE id=$1", [row.id]);
          consumed.push({ ...row, status: "consumed" });
        }
        await client.query("COMMIT");
        return consumed.map(row => ({ id: row.id, productId: row.product_id, orderId: row.order_id, quantity: Number(row.quantity), status: row.status, expiresAt: row.expires_at }));
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally { client.release(); }
    }, `consume catalog v2 inventory ${orderId}`);
  }

  async releaseCatalogV2Inventory(orderId) {
    const result = await withPgRetry(() => this.pool.query("UPDATE catalog_v2_inventory_reservations SET status='released', updated_at=NOW() WHERE order_id=$1 AND status='reserved' RETURNING *", [orderId]), `release catalog v2 inventory ${orderId}`);
    return result.rows.map(row => ({ id: row.id, productId: row.product_id, orderId: row.order_id, quantity: Number(row.quantity), status: row.status, expiresAt: row.expires_at }));
  }

  async listCatalogV2InventoryReservations(orderId = "") {
    const result = await withPgRetry(() => this.pool.query(`SELECT * FROM catalog_v2_inventory_reservations ${orderId ? "WHERE order_id=$1" : ""} ORDER BY created_at, id`, orderId ? [orderId] : []), "list catalog v2 inventory reservations");
    return result.rows.map(row => ({ id: row.id, productId: row.product_id, orderId: row.order_id, quantity: Number(row.quantity), status: row.status, expiresAt: row.expires_at }));
  }

  // Per-node up/down totals across all users for one day (admin overview).
  async xuiNodeDailyTotals(dateKey) {
    const result = await withPgRetry(
      () => this.pool.query(
        `SELECT node_guid, SUM(up_bytes)::bigint AS up, SUM(down_bytes)::bigint AS down
         FROM xui_daily_traffic WHERE date = $1 GROUP BY node_guid`,
        [dateKey]
      ),
      `xui node daily totals ${dateKey}`
    );
    return result.rows.map(row => ({ nodeGuid: row.node_guid, up: Number(row.up), down: Number(row.down) }));
  }

  // Per-user up/down totals across all nodes for one day (admin dashboard Top-N).
  async xuiUserDailyTotals(dateKey) {
    const result = await withPgRetry(
      () => this.pool.query(
        `SELECT email, SUM(up_bytes)::bigint AS up, SUM(down_bytes)::bigint AS down
         FROM xui_daily_traffic WHERE date = $1 GROUP BY email`,
        [dateKey]
      ),
      `xui user daily totals ${dateKey}`
    );
    return result.rows.map(row => ({ email: row.email, up: Number(row.up), down: Number(row.down) }));
  }

  // Retention cleanup: drop daily rows older than `cutoffDateKey` for the given
  // emails (periodic-plan users, 90-day retention). Lifetime/unlimited users are
  // simply never passed in, so their history is kept permanently.
  async pruneXuiDailyTraffic(cutoffDateKey, emails) {
    const list = Array.isArray(emails) ? emails.filter(Boolean).map(String) : [];
    if (!cutoffDateKey || !list.length) return { deleted: 0 };
    const result = await withPgRetry(
      () => this.pool.query(
        "DELETE FROM xui_daily_traffic WHERE date < $1 AND email = ANY($2::text[])",
        [cutoffDateKey, list]
      ),
      "prune xui daily traffic"
    );
    return { deleted: result.rowCount || 0 };
  }

  // Inbound catalog, replaced from each five-minute 3x-ui sync. Probe columns belong to the
  // TCP probe and survive catalog refreshes; inbounds no longer in 3x-ui are removed.
  async replaceXuiInbounds(rows) {
    const list = Array.isArray(rows) ? rows : [];
    return withPgRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM xui_inbounds WHERE NOT (key = ANY($1::text[]))", [list.map(row => row.key)]);
        if (list.length) {
          await client.query(
            `INSERT INTO xui_inbounds (key, inbound_id, node_guid, node_name, node_host, port, protocol, name, tag, enabled, sub_sort_index, client_count, recently_active, synced_at)
             SELECT r.key, r.id, r."nodeGuid", r."nodeName", r."nodeHost", r.port, r.protocol, r.name, r.tag, r.enabled, r."subSortIndex", r."clientCount", r."recentlyActive", NOW()
             FROM jsonb_to_recordset($1::jsonb) AS r(key TEXT, id INTEGER, "nodeGuid" TEXT, "nodeName" TEXT, "nodeHost" TEXT, port INTEGER, protocol TEXT, name TEXT, tag TEXT, enabled BOOLEAN, "subSortIndex" INTEGER, "clientCount" INTEGER, "recentlyActive" BOOLEAN)
             ON CONFLICT (key) DO UPDATE SET inbound_id = EXCLUDED.inbound_id, node_guid = EXCLUDED.node_guid, node_name = EXCLUDED.node_name, node_host = EXCLUDED.node_host,
               port = EXCLUDED.port, protocol = EXCLUDED.protocol, name = EXCLUDED.name, tag = EXCLUDED.tag, enabled = EXCLUDED.enabled, sub_sort_index = EXCLUDED.sub_sort_index,
               client_count = EXCLUDED.client_count, recently_active = EXCLUDED.recently_active, synced_at = EXCLUDED.synced_at`,
            [JSON.stringify(list)]
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {}
        throw error;
      } finally {
        client.release();
      }
    }, "replace xui inbounds");
  }

  async listXuiInbounds() {
    const result = await withPgRetry(() => this.pool.query("SELECT * FROM xui_inbounds ORDER BY node_guid, inbound_id"), "list xui inbounds");
    return result.rows.map(row => ({
      id: row.inbound_id, key: row.key, name: row.name, tag: row.tag, protocol: row.protocol, port: row.port,
      subSortIndex: row.sub_sort_index, enabled: row.enabled, recentlyActive: row.recently_active,
      nodeGuid: row.node_guid, nodeName: row.node_name, nodeHost: row.node_host, clientCount: row.client_count,
      syncedAt: row.synced_at ? row.synced_at.toISOString() : "",
      probeStatus: row.probe_status, probeLatencyMs: row.probe_latency_ms,
      probeCheckedAt: row.probe_checked_at ? row.probe_checked_at.toISOString() : "", probeError: row.probe_error
    }));
  }

  async recordXuiInboundProbes(results) {
    const list = Array.isArray(results) ? results : [];
    if (!list.length) return;
    await withPgRetry(() => this.pool.query(
      `UPDATE xui_inbounds AS i SET probe_status = r.status, probe_latency_ms = r."latencyMs", probe_checked_at = r."checkedAt", probe_error = r.error
       FROM jsonb_to_recordset($1::jsonb) AS r(key TEXT, status TEXT, "latencyMs" INTEGER, "checkedAt" TIMESTAMPTZ, error TEXT)
       WHERE i.key = r.key`,
      [JSON.stringify(list)]
    ), "record xui inbound probes");
  }

  async setXuiInboundEnabled(inboundId, enabled) {
    await withPgRetry(() => this.pool.query("UPDATE xui_inbounds SET enabled = $2 WHERE inbound_id = $1", [inboundId, enabled]), "set xui inbound enabled");
  }

  // Background job run history shown on the sync job monitor page.
  async startSyncJobRun(jobId, trigger) {
    const result = await withPgRetry(() => this.pool.query(
      "INSERT INTO sync_job_runs (job_id, trigger, status) VALUES ($1, $2, 'running') RETURNING id",
      [jobId, trigger]
    ), "start sync job run");
    return String(result.rows[0].id);
  }

  async finishSyncJobRun(id, { status, summary = {}, error = "" }) {
    await withPgRetry(() => this.pool.query(
      `UPDATE sync_job_runs SET status = $2, summary = $3::jsonb, error = $4, finished_at = NOW(),
         duration_ms = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000))::int
       WHERE id = $1`,
      [id, status, JSON.stringify(summary || {}), String(error || "")]
    ), "finish sync job run");
  }

  // Inserts an already finished run in one statement (runs whose start was not recorded).
  async recordSyncJobRun(jobId, trigger, { status, summary = {}, error = "", startedAt, durationMs }) {
    const result = await withPgRetry(() => this.pool.query(
      `INSERT INTO sync_job_runs (job_id, trigger, status, started_at, finished_at, duration_ms, summary, error)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6::jsonb, $7) RETURNING id`,
      [jobId, trigger, status, startedAt, durationMs, JSON.stringify(summary || {}), String(error || "")]
    ), "record sync job run");
    return String(result.rows[0].id);
  }

  async listSyncJobRuns(jobId, limit = 50) {
    const result = await withPgRetry(() => this.pool.query(
      "SELECT * FROM sync_job_runs WHERE job_id = $1 ORDER BY started_at DESC, id DESC LIMIT $2",
      [jobId, Math.min(200, Math.max(1, Number(limit) || 50))]
    ), "list sync job runs");
    return result.rows.map(syncJobRunFromRow);
  }

  async syncJobOverview(since) {
    const [latest, success, stats] = await withPgRetry(() => Promise.all([
      this.pool.query("SELECT DISTINCT ON (job_id) * FROM sync_job_runs ORDER BY job_id, started_at DESC, id DESC"),
      this.pool.query("SELECT job_id, MAX(finished_at) AS at FROM sync_job_runs WHERE status = 'success' GROUP BY job_id"),
      this.pool.query(
        "SELECT job_id, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status IN ('failed', 'partial', 'interrupted'))::int AS failed FROM sync_job_runs WHERE started_at >= $1 GROUP BY job_id",
        [since]
      )
    ]), "sync job overview");
    const overview = {};
    const entry = jobId => (overview[jobId] ||= { lastRun: null, lastSuccessAt: "", stats24h: { total: 0, failed: 0 } });
    for (const row of latest.rows) entry(row.job_id).lastRun = syncJobRunFromRow(row);
    for (const row of success.rows) entry(row.job_id).lastSuccessAt = row.at ? row.at.toISOString() : "";
    for (const row of stats.rows) entry(row.job_id).stats24h = { total: row.total, failed: row.failed };
    return overview;
  }

  async markInterruptedSyncJobRuns() {
    const result = await withPgRetry(() => this.pool.query(
      "UPDATE sync_job_runs SET status = 'interrupted', finished_at = NOW(), error = '进程重启，执行被中断' WHERE status = 'running'"
    ), "mark interrupted sync job runs");
    return result.rowCount || 0;
  }

  async pruneSyncJobRuns(cutoff) {
    const result = await withPgRetry(() => this.pool.query("DELETE FROM sync_job_runs WHERE started_at < $1", [cutoff]), "prune sync job runs");
    return result.rowCount || 0;
  }
}

function syncJobRunFromRow(row) {
  return {
    id: String(row.id),
    jobId: row.job_id,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.started_at ? row.started_at.toISOString() : "",
    finishedAt: row.finished_at ? row.finished_at.toISOString() : "",
    durationMs: row.duration_ms,
    summary: row.summary || {},
    error: row.error || ""
  };
}

function createDataStore({ databaseUrl, ssl = process.env.DATABASE_SSL === "true" }) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required; PostgreSQL is the only supported data store.");
  return new PostgresDataStore({ connectionString: databaseUrl, ssl });
}

function normalizePostgresUrl(value) {
  try {
    const url = new URL(value);
    url.searchParams.delete("channel_binding");
    return url.toString();
  } catch {
    return value;
  }
}

module.exports = {
  createDataStore
};
