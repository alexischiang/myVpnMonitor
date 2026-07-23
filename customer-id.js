const crypto = require("crypto");

const MIN_CUSTOMER_ID = 100000;
const CUSTOMER_ID_COUNT = 900000;

function isCustomerID(value) {
  return Number.isInteger(value) && value >= MIN_CUSTOMER_ID && value < MIN_CUSTOMER_ID + CUSTOMER_ID_COUNT;
}

function customerIDFromUUID(id, attempt = 0) {
  const hash = crypto.createHash("sha256").update(`${id}:${attempt}`).digest().readUInt32BE(0);
  return MIN_CUSTOMER_ID + (hash % CUSTOMER_ID_COUNT);
}

function availableCustomerID(id, used) {
  for (let attempt = 0; attempt < CUSTOMER_ID_COUNT; attempt += 1) {
    const candidate = customerIDFromUUID(id, attempt);
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("No customer IDs available.");
}

function nextCustomerID(id, records = []) {
  return availableCustomerID(id, new Set(records.map(record => record.customerID).filter(isCustomerID)));
}

function backfillCustomerIDs(records) {
  const sorted = [...records].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const used = new Set();
  let changed = 0;
  for (const record of sorted) {
    if (isCustomerID(record.customerID) && !used.has(record.customerID)) {
      used.add(record.customerID);
      continue;
    }
    record.customerID = availableCustomerID(record.id, used);
    used.add(record.customerID);
    changed += 1;
  }
  return changed;
}

module.exports = { backfillCustomerIDs, customerIDFromUUID, isCustomerID, nextCustomerID };
