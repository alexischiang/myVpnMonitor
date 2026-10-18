const fs = require("fs");
const path = require("path");

function loadLocalEnv({ override = false } = {}) {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    // An empty value counts as unset: pm2 can resurrect a process with a key saved as "", which would otherwise hide .env.
    // Tests blank keys on purpose (live mail credentials, public URLs), so under NODE_ENV=test an empty value stays empty.
    const unset = process.env[key] === undefined || (process.env[key] === "" && process.env.NODE_ENV !== "test");
    if (key && (override || unset)) process.env[key] = value;
  }
}

function xuiDatabaseUrl() {
  if (process.env.XUI_DATABASE_URL) return process.env.XUI_DATABASE_URL;
  // Same fallback order as the deploy workflow, so the service still starts when only DATABASE_URL is set.
  return process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL || "";
}

module.exports = { loadLocalEnv, xuiDatabaseUrl };
