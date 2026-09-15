// Serialize transitions that share the legacy application snapshot. A database
// advisory lock also coordinates receipt callbacks across server processes.
function createOperationLock({ connect, reload, enter, leave }) {
  let tail = Promise.resolve();
  return function run(operation) {
    const task = tail.catch(() => {}).then(async () => {
      const client = await connect();
      let locked = false;
      try {
        await client.query("SELECT pg_advisory_lock(72814, 1)");
        locked = true;
        await reload();
        enter();
        return await operation();
      } finally {
        leave();
        try { if (locked) await client.query("SELECT pg_advisory_unlock(72814, 1)"); }
        finally { client.release(); }
      }
    });
    tail = task;
    return task;
  };
}

module.exports = { createOperationLock };
