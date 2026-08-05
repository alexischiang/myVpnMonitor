const assert = require("assert");
const { poolSelectionGroup } = require("./server");

assert.strictEqual(poolSelectionGroup({ activeGroup: "basic" }), "basic");
assert.strictEqual(poolSelectionGroup({ activeGroup: "basic", isSuperAccount: true }), "");
