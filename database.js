const COLLECTIONS = ["subscriptions", "users", "accounts", "bills", "vendors", "presets", "placeholderNodes", "embyUsers", "embyVendors", "pricing", "paymentOrders", "salesSettings", "paymentSettings", "referralRewards"];
const PG_RETRY_ATTEMPTS = Number(process.env.DATABASE_RETRY_ATTEMPTS || 2);
const PG_RETRY_DELAY_MS = Number(process.env.DATABASE_RETRY_DELAY_MS || 500);

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
      )
      `), "postgres init");
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

  async getRecord(collection, id) {
    const result = await withPgRetry(
      () => this.pool.query("SELECT data FROM app_records WHERE collection = $1 AND id = $2", [collection, id]),
      `load ${collection}/${id}`
    );
    return result.rows[0]?.data || null;
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
    const result = {};
    for (const collection of COLLECTIONS) {
      result[collection] = [];
    }
    const query = "SELECT collection, data FROM app_records WHERE collection = ANY($1::text[]) ORDER BY collection ASC, position ASC";
    const rows = await withPgRetry(() => this.pool.query(query, [COLLECTIONS]), "load all collections");
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
