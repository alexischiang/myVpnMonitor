const fsSync = require("fs");
const fs = require("fs/promises");
const path = require("path");
const { createDataStore } = require("../database");

function loadLocalEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fsSync.existsSync(envPath)) return;
  const content = fsSync.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function durationDays(duration) {
  const values = {
    monthly: 30,
    quarterly: 90,
    half_yearly: 180,
    yearly: 360
  };
  return values[duration] || null;
}

function calculateExpiry(startAt, duration) {
  const days = durationDays(duration);
  const start = new Date(startAt);
  if (!days || Number.isNaN(start.getTime())) return null;
  const expiresAt = new Date(start.getTime());
  expiresAt.setUTCDate(expiresAt.getUTCDate() + days);
  return expiresAt.toISOString();
}

function billTime(bill) {
  return new Date(bill.occurredAt || bill.createdAt || 0).getTime();
}

function billTypeOrder(bill) {
  const order = {
    initial: 0,
    renewal: 1,
    adjustment: 2
  };
  return order[bill.type] ?? 3;
}

function sameInstant(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function recalculateUser(user, userBills) {
  const sortedBills = [...userBills].sort((a, b) => {
    const timeDiff = billTime(a) - billTime(b);
    if (timeDiff !== 0) return timeDiff;
    const typeDiff = billTypeOrder(a) - billTypeOrder(b);
    if (typeDiff !== 0) return typeDiff;
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });
  let activeExpiry = null;
  const billUpdates = [];

  for (const bill of sortedBills) {
    const nextBill = { ...bill };
    const startAt = bill.occurredAt || user.purchasedAt || user.createdAt || new Date().toISOString();
    const duration = bill.duration || user.duration;

    if (bill.type === "initial") {
      nextBill.beforeExpiresAt = null;
      nextBill.afterExpiresAt = calculateExpiry(startAt, duration);
      if (!bill.reversedAt) activeExpiry = nextBill.afterExpiresAt;
    } else if (bill.type === "renewal") {
      const occurredAt = new Date(startAt);
      const currentExpiry = activeExpiry ? new Date(activeExpiry) : null;
      const baseAt = currentExpiry && currentExpiry.getTime() > occurredAt.getTime()
        ? activeExpiry
        : startAt;
      nextBill.beforeExpiresAt = activeExpiry;
      nextBill.afterExpiresAt = calculateExpiry(baseAt, duration);
      if (!bill.reversedAt) activeExpiry = nextBill.afterExpiresAt;
    } else if (bill.type === "adjustment" && activeExpiry) {
      nextBill.afterExpiresAt = activeExpiry;
    }

    billUpdates.push(nextBill);
  }

  if (!activeExpiry) {
    activeExpiry = calculateExpiry(user.purchasedAt || user.createdAt || new Date().toISOString(), user.duration);
  }

  return {
    user: activeExpiry ? { ...user, expiresAt: activeExpiry, updatedAt: new Date().toISOString() } : user,
    bills: billUpdates
  };
}

async function backupJsonFile(filePath) {
  if (!fsSync.existsSync(filePath)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.copyFile(filePath, `${filePath}.${stamp}.bak`);
}

async function main() {
  loadLocalEnv();
  const root = path.join(__dirname, "..");
  const dataDir = path.join(root, "data");
  const files = {
    subscriptions: process.env.DATA_FILE || path.join(dataDir, "subscriptions.json"),
    users: process.env.USERS_FILE || path.join(dataDir, "users.json"),
    bills: process.env.BILLS_FILE || path.join(dataDir, "bills.json")
  };
  const store = createDataStore({
    dataDir,
    databaseUrl: process.env.DATABASE_URL || "",
    files
  });
  await store.init();

  const state = await store.loadAll();
  const users = state.users || [];
  const bills = state.bills || [];
  const billsByUser = new Map();
  for (const bill of bills) {
    if (!bill.userId) continue;
    billsByUser.set(bill.userId, [...(billsByUser.get(bill.userId) || []), bill]);
  }

  const updatedUsers = [];
  const updatedBillsById = new Map();
  const changes = [];

  for (const user of users) {
    const result = recalculateUser(user, billsByUser.get(user.id) || []);
    updatedUsers.push(result.user);
    if (!sameInstant(user.expiresAt, result.user.expiresAt)) {
      changes.push({
        userId: user.userId || user.id,
        before: user.expiresAt,
        after: result.user.expiresAt
      });
    }

    for (const bill of result.bills) updatedBillsById.set(bill.id, bill);
  }

  const updatedBills = bills.map(bill => updatedBillsById.get(bill.id) || bill);
  const apply = process.argv.includes("--apply");

  console.log(`Data store: ${store.kind}`);
  console.log(`Users checked: ${users.length}`);
  console.log(`Users needing expiry update: ${changes.length}`);
  for (const change of changes) {
    console.log(`${change.userId}: ${change.before || "null"} -> ${change.after || "null"}`);
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to save changes.");
    return;
  }

  if (store.kind === "json") {
    await backupJsonFile(files.users);
    await backupJsonFile(files.bills);
  }
  await store.saveCollection("users", updatedUsers);
  await store.saveCollection("bills", updatedBills);
  console.log("Duration-day migration applied.");
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
