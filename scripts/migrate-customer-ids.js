const fs = require("fs");
const path = require("path");
const { createDataStore } = require("../database");
const { backfillCustomerIDs } = require("../customer-id");

const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const localUrl = process.env.LOCAL_DATABASE_URL || "";
  const store = createDataStore({
    databaseUrl: localUrl || process.env.DATABASE_URL || "",
    ssl: !localUrl && process.env.DATABASE_SSL === "true"
  });
  await store.init();
  try {
    const state = await store.loadAll();
    const users = state.users || [];
    const accounts = state.accounts || [];
    let changed = backfillCustomerIDs([...users, ...accounts.filter(account => !account.linkedUserId)]);
    const usersById = new Map(users.map(user => [user.id, user]));
    for (const account of accounts) {
      const linkedUser = usersById.get(account.linkedUserId);
      if (linkedUser && account.customerID !== linkedUser.customerID) {
        account.customerID = linkedUser.customerID;
        changed += 1;
      }
    }
    console.log(`Users checked: ${users.length}`);
    console.log(`Accounts checked: ${accounts.length}`);
    console.log(`Records needing customerID: ${changed}`);
    if (!process.argv.includes("--apply")) {
      console.log("Dry run only. Re-run with --apply to save changes.");
      return;
    }
    if (changed) {
      await store.saveCollection("users", users);
      await store.saveCollection("accounts", accounts);
    }
    console.log("Customer IDs applied.");
  } finally {
    await store.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
