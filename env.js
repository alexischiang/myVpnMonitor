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
    if (key && (override || process.env[key] === undefined)) process.env[key] = value;
  }
}

function xuiDatabaseUrl() {
  if (process.env.XUI_DATABASE_URL) return process.env.XUI_DATABASE_URL;
  return process.env.LOCAL_DATABASE_URL || "";
}

module.exports = { loadLocalEnv, xuiDatabaseUrl };
