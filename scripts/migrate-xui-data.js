const { Pool } = require("pg");
const { loadLocalEnv, xuiDatabaseUrl } = require("../env");
const { XuiDataStore } = require("../xui-database");

loadLocalEnv();

async function initializeBillingState(target, legacyBilling) {
  if (!legacyBilling || await target.getState("billing")) return false;
  await target.setState("billing", legacyBilling);
  return true;
}

async function main() {
  const sourceUrl = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
  const targetUrl = xuiDatabaseUrl();
  if (!sourceUrl) throw new Error("LOCAL_DATABASE_URL or DATABASE_URL is required.");
  if (!targetUrl) throw new Error("XUI_DATABASE_URL is required.");

  const source = new Pool({
    connectionString: sourceUrl,
    ssl: !process.env.LOCAL_DATABASE_URL && process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
  });
  const target = new XuiDataStore(targetUrl);
  try {
    await target.init();
    const [billing, users] = await Promise.all([
      source.query("SELECT data FROM app_records WHERE collection = 'xuiBilling' AND id = 'state'"),
      source.query("SELECT data FROM app_records WHERE collection = 'users' ORDER BY position")
    ]);
    const migratedBilling = await initializeBillingState(target, billing.rows[0]?.data);

    const xuiUsers = users.rows.map(row => row.data).filter(user => user?.xuiClientEmail);
    for (const user of xuiUsers) {
      await target.setClient(user.id, {
        userId: user.id,
        email: user.xuiClientEmail,
        subId: user.xuiSubId || "",
        inboundIds: user.xuiInboundIds || [],
        enabled: user.xuiLastTraffic?.status !== "disabled",
        lastSyncedAt: user.xuiLastSyncedAt || "",
        lastError: user.xuiLastError || ""
      });
    }
    console.log(`Migrated ${xuiUsers.length} 3x-ui client mappings and ${migratedBilling ? 1 : 0} billing state.`);
  } finally {
    await Promise.all([source.end(), target.close()]);
  }
}

if (require.main === module) main().catch(error => {
  console.error(error.message);
  process.exit(1);
});

module.exports = { initializeBillingState };
