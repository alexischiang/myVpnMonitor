const assert = require("assert");
const {
  poolMetricUnavailableReason,
  initialPoolFallbackReason,
  fallbackCandidateRank,
  isBrowserNavigationRequest,
  copyUpstreamHeaders,
  normalizeSubconverterConfigParam,
  defaultSubconverterPreset,
  relaySubconverterConfig,
  userOutputMode,
  injectPlaceholderNodes,
  liveConfigFromCachedPoolConfig,
  publicRegisteredAccount,
  startOfUtcDate
} = require("./server");

assert.strictEqual(
  poolMetricUnavailableReason({ enabled: false, metrics: { expireAt: "2030-01-01T00:00:00.000Z", remainingBytes: 1000000 } }),
  "pool-disabled"
);
assert.strictEqual(initialPoolFallbackReason({ enabled: false }, false), "pool-disabled");
assert.strictEqual(initialPoolFallbackReason({ enabled: false, url: "" }, true), "pool-disabled");
assert.strictEqual(initialPoolFallbackReason({ url: "" }, false), "pool-missing");

// ─── poolMetricUnavailableReason ────────────────────────────────────────

// 池 URL 已到期
assert.strictEqual(
  poolMetricUnavailableReason({ metrics: { expireAt: "2020-01-01T00:00:00.000Z" } }),
  "pool-expired"
);

// 池 URL 流量耗尽
assert.strictEqual(
  poolMetricUnavailableReason({ metrics: { expireAt: "2030-01-01T00:00:00.000Z", remainingBytes: 0 } }),
  "pool-depleted"
);

// 池 URL 流量为负数（也算耗尽）
assert.strictEqual(
  poolMetricUnavailableReason({ metrics: { expireAt: "2030-01-01T00:00:00.000Z", remainingBytes: -100 } }),
  "pool-depleted"
);

// 正常池 URL：未过期且有剩余流量
assert.strictEqual(
  poolMetricUnavailableReason({ metrics: { expireAt: "2030-01-01T00:00:00.000Z", remainingBytes: 1000000 } }),
  ""
);

// 没有 metrics
assert.strictEqual(
  poolMetricUnavailableReason({}),
  ""
);
assert.strictEqual(
  poolMetricUnavailableReason(null),
  ""
);

// 有到期时间但恰好等于 now（边界：过期）
const nowIso = new Date().toISOString();
const resultNow = poolMetricUnavailableReason(
  { metrics: { expireAt: nowIso, remainingBytes: 5000 } },
  new Date(nowIso).getTime()
);
assert.strictEqual(resultNow, "pool-expired");

// 到期时间在 now 之后 1ms（未过期）
const future = new Date(Date.now() + 1).toISOString();
assert.strictEqual(
  poolMetricUnavailableReason({ metrics: { expireAt: future, remainingBytes: 5000 } }),
  ""
);

// ─── fallbackCandidateRank ──────────────────────────────────────────────

// 池到期在用户到期之后 5 天 → group 0, distance 5
const rank1 = fallbackCandidateRank(
  { metrics: { expireAt: "2026-07-10T00:00:00.000Z" } },
  { expiresAt: "2026-07-05T00:00:00.000Z" }
);
assert.strictEqual(rank1.group, 0);
assert.strictEqual(rank1.distance, 5);

// 池到期在用户到期之前 3 天 → group 1, distance 3
const rank2 = fallbackCandidateRank(
  { metrics: { expireAt: "2026-07-02T00:00:00.000Z" } },
  { expiresAt: "2026-07-05T00:00:00.000Z" }
);
assert.strictEqual(rank2.group, 1);
assert.strictEqual(rank2.distance, 3);

// 池到期和用户到期同一天 → group 0, distance 0
const rank3 = fallbackCandidateRank(
  { metrics: { expireAt: "2026-07-05T00:00:00.000Z" } },
  { expiresAt: "2026-07-05T00:00:00.000Z" }
);
assert.strictEqual(rank3.group, 0);
assert.strictEqual(rank3.distance, 0);

// 差距超过 10 天 → 不合格，返回 null
const rank4 = fallbackCandidateRank(
  { metrics: { expireAt: "2026-07-20T00:00:00.000Z" } },
  { expiresAt: "2026-07-05T00:00:00.000Z" }
);
assert.deepStrictEqual(rank4, { group: 2, distance: 15 });

const rank5 = fallbackCandidateRank(
  { metrics: { expireAt: "2026-06-20T00:00:00.000Z" } },
  { expiresAt: "2026-07-05T00:00:00.000Z" }
);
assert.deepStrictEqual(rank5, { group: 3, distance: 15 });

// Missing pool expiry is the lowest-priority fallback.
const rank6 = fallbackCandidateRank(
  { metrics: {} },
  { expiresAt: "2026-07-05T00:00:00.000Z" }
);
assert.strictEqual(rank6.group, 4);
assert.strictEqual(rank6.distance, Number.POSITIVE_INFINITY);

// Missing user expiry is the lowest-priority fallback.
const rank7 = fallbackCandidateRank(
  { metrics: { expireAt: "2026-07-10T00:00:00.000Z" } },
  {}
);
assert.strictEqual(rank7.group, 4);
assert.strictEqual(rank7.distance, Number.POSITIVE_INFINITY);

assert.strictEqual(
  fallbackCandidateRank(
    { enabled: false, metrics: { expireAt: "2026-07-05T00:00:00.000Z" } },
    { expiresAt: "2026-07-05T00:00:00.000Z" }
  ),
  null
);

assert.strictEqual(isBrowserNavigationRequest({
  headers: {
    accept: "text/html,application/xhtml+xml",
    "user-agent": "Mozilla/5.0 Chrome/126.0 Safari/537.36",
    "sec-fetch-dest": "document"
  }
}), true);

assert.strictEqual(isBrowserNavigationRequest({
  headers: {
    accept: "*/*",
    "user-agent": "Mozilla/5.0 Chrome/126.0 Safari/537.36"
  }
}), true);

assert.strictEqual(isBrowserNavigationRequest({
  headers: {
    accept: "text/plain, application/yaml, */*",
    "user-agent": "ClashforWindows/0.20.39"
  }
}), false);

const browserHeaders = copyUpstreamHeaders(new Response("proxies: []", {
  headers: { "content-type": "application/octet-stream" }
}), { headers: { "user-agent": "Mozilla/5.0 Chrome/126.0 Safari/537.36" } });
assert.strictEqual(browserHeaders["content-type"], "text/plain; charset=utf-8");
assert.match(browserHeaders["content-disposition"], /^inline;/);

assert.strictEqual(normalizeSubconverterConfigParam("/config/ACL4SSR_Mini_AI_Local.ini"), "config/ACL4SSR_Mini_AI_Local.ini");
assert.strictEqual(normalizeSubconverterConfigParam("https://example.com/config.ini"), "https://example.com/config.ini");
assert.deepStrictEqual(
  Object.fromEntries(["tfo", "list", "classic", "new_name", "append_type", "strict", "fdn", "insert", "expand", "append_info"].map(key => [key, defaultSubconverterPreset()[key]])),
  { tfo: false, list: false, classic: false, new_name: false, append_type: false, strict: false, fdn: true, insert: true, expand: true, append_info: true }
);
assert.deepStrictEqual(
  Object.fromEntries(Object.entries(relaySubconverterConfig(
    { serviceProvider: "new-vendor" },
    [{ name: "new-vendor", overrideInclude: "new-only", overrideExclude: "old", overrideRename: "rename" }]
  )).filter(([key]) => ["target", "include", "exclude", "rename"].includes(key))),
  { target: "clash", include: "new-only", exclude: "old", rename: "rename" }
);
assert.strictEqual(userOutputMode({ outputMode: "direct" }), "direct");
assert.strictEqual(userOutputMode({ outputMode: " direct " }), "direct");
assert.strictEqual(userOutputMode({ outputMode: "DIRECT" }), "direct");
assert.strictEqual(userOutputMode({ outputMode: "" }), "subconverter");
assert.strictEqual(userOutputMode({}), "subconverter");

assert.deepStrictEqual(
  publicRegisteredAccount({ id: "account-1", email: "new@example.com", status: "active", createdAt: "2026-07-19T00:00:00.000Z" }),
  {
    id: "account:account-1", accountId: "account-1", registeredOnly: true, accountStatus: "active",
    email: "new@example.com", userId: "new@example.com", createdAt: "2026-07-19T00:00:00.000Z",
    actualPaid: 0, vipSpend: 0, vipLevel: "vip1", subscriptionId: "", subscription: null,
    activeGroup: "", expiresAt: null, userLogs: []
  }
);

// ─── startOfUtcDate ─────────────────────────────────────────────────────

// 同一天不同时间应归为同一个 UTC 日起点
const day1 = startOfUtcDate("2026-07-05T13:45:30.000Z");
const day2 = startOfUtcDate("2026-07-05T00:00:00.000Z");
assert.strictEqual(day1, day2);

// 不同天应不同
const day3 = startOfUtcDate("2026-07-06T00:00:00.000Z");
assert.notStrictEqual(day1, day3);
assert.strictEqual(day3 - day1, 86400000);

// 无效日期返回 null
assert.strictEqual(startOfUtcDate("invalid"), null);
// null 被 Date 解析为 epoch (1970-01-01)，startOfUtcDate 返回 0 而非 null
assert.strictEqual(startOfUtcDate(null), 0);

const injectedLegacyConfig = require("js-yaml").load(injectPlaceholderNodes(Buffer.from([
  "Proxy:",
  "  - name: upstream",
  "    type: ss",
  "    server: example.com",
  "    port: 443",
  "    cipher: aes-128-gcm",
  "    password: secret",
  "Proxy Group:",
  "  - name: Auto",
  "    type: select",
  "    proxies: [upstream]",
  "Rule:",
  "  - MATCH,Auto"
].join("\n")), { showUserInfo: false }, [{ tag: "default", nodes: ["notice"] }]).toString("utf8"));
assert.strictEqual(injectedLegacyConfig.proxies[0].name, "notice");
assert.strictEqual(injectedLegacyConfig["proxy-groups"][0].proxies[0], "notice");
assert.deepStrictEqual(injectedLegacyConfig.rules, ["MATCH,Auto"]);
assert.strictEqual(injectedLegacyConfig.Proxy, undefined);
assert.strictEqual(injectedLegacyConfig["Proxy Group"], undefined);
assert.strictEqual(injectedLegacyConfig.Rule, undefined);

Promise.all([
  liveConfigFromCachedPoolConfig({ cachedConfig: { body: "proxies:\n  - name: cached\n", fetchedAt: "2020-01-01T00:00:00.000Z" } }),
  liveConfigFromCachedPoolConfig({ cachedConfig: { body: "proxies:\n  - name: cached\n", fetchedAt: "2020-01-01T00:00:00.000Z" } }, { allowStale: true }),
  liveConfigFromCachedPoolConfig({ cachedConfig: { body: "proxies:\n  - name: cached\n", fetchedAt: new Date().toISOString(), bodyFetchedAt: "2020-01-01T00:00:00.000Z" } })
]).then(([stale, allowed, failedRefresh]) => {
  assert.strictEqual(stale, null);
  assert.strictEqual(failedRefresh, null);
  assert.strictEqual(allowed.cached, true);
  assert.match(allowed.body, /name: cached/);
  console.log("All fallback logic tests passed.");
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
