const assert = require("assert");
const { backfillCustomerIDs, customerIDFromUUID, nextCustomerID } = require("./customer-id");

const records = Array.from({ length: 5000 }, (_, index) => ({ id: `user-${index}` }));
assert.strictEqual(backfillCustomerIDs(records), records.length);
assert.strictEqual(new Set(records.map(record => record.customerID)).size, records.length);
assert.ok(records.every(record => /^\d{6}$/.test(String(record.customerID))));
assert.strictEqual(backfillCustomerIDs(records), 0);
assert.strictEqual(nextCustomerID("new-user", records), nextCustomerID("new-user", records));
assert.strictEqual(customerIDFromUUID("89592b05-7858-4b9a-9e7d-e607375715dc"), customerIDFromUUID("89592b05-7858-4b9a-9e7d-e607375715dc"));

console.log("customerID checks passed.");
