// Serialize transitions that share the legacy application snapshot. A database
// advisory lock also coordinates receipt callbacks across server processes.
// An operation that cannot start within waitMs is rejected with a 503 rather than
// queueing forever behind one that never finishes, and is skipped when its turn comes.
function createOperationLock({ connect, reload, enter, leave, waitMs = 0, warnMs = 0, log = console }) {
  let tail = Promise.resolve();
  let holder = null;
  return function run(operation, label = "operation") {
    let started = false;
    let timedOut = false;
    let rejectWait;
    const waited = new Promise((_, reject) => { rejectWait = reject; });
    const waitTimer = waitMs ? setTimeout(() => {
      if (started) return;
      timedOut = true;
      const held = holder ? `${holder.label} has held it for ${Math.round((Date.now() - holder.startedAt) / 1000)}s` : "no holder in this process";
      log.error(`[commerce] ${label} gave up waiting for the commerce lock after ${waitMs}ms (${held}).`);
      rejectWait(Object.assign(new Error("系统繁忙，请稍后重试。"), { statusCode: 503 }));
    }, waitMs) : null;
    const task = tail.catch(() => {}).then(async () => {
      if (timedOut) return;
      const client = await connect();
      let locked = false;
      let warnTimer = null;
      try {
        await client.query("SELECT pg_advisory_lock(72814, 1)");
        locked = true;
        if (timedOut) return;
        started = true;
        clearTimeout(waitTimer);
        holder = { label, startedAt: Date.now() };
        if (warnMs) warnTimer = setTimeout(() => log.warn(`[commerce] ${label} has held the commerce lock for over ${warnMs}ms.`), warnMs);
        await reload();
        enter();
        return await operation();
      } finally {
        clearTimeout(warnTimer);
        if (started) { holder = null; leave(); }
        try { if (locked) await client.query("SELECT pg_advisory_unlock(72814, 1)"); }
        finally { client.release(); }
      }
    });
    tail = task;
    return waitMs ? Promise.race([task, waited]) : task;
  };
}

module.exports = { createOperationLock };
