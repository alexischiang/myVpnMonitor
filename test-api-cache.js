const assert = require("node:assert/strict")

global.window = { location: { pathname: "/account" } }
let requests = 0
global.fetch = async () => ({ status: 200, ok: true, json: async () => ({ requests: ++requests }) })

import("./src/api.ts").then(async ({ clearJsonCache, fetchCachedJson }) => {
  const [first, second] = await Promise.all([fetchCachedJson("/api/test"), fetchCachedJson("/api/test")])
  assert.equal(first.requests, 1)
  assert.equal(second.requests, 1)
  assert.equal((await fetchCachedJson("/api/test")).requests, 1)
  clearJsonCache()
  assert.equal((await fetchCachedJson("/api/test")).requests, 2)
})
