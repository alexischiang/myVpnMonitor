const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const distIndex = path.join(rootDir, "dist", "index.html");
const sourcePaths = [
  path.join(rootDir, "index.html"),
  path.join(rootDir, "vite.config.js"),
  path.join(rootDir, "package-lock.json"),
  path.join(rootDir, "src"),
  path.join(rootDir, "docs-site")
];

function latestMtimeMs(target) {
  if (!fs.existsSync(target)) return 0;
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return stat.mtimeMs;

  let latest = stat.mtimeMs;
  for (const entry of fs.readdirSync(target)) {
    latest = Math.max(latest, latestMtimeMs(path.join(target, entry)));
  }
  return latest;
}

const distMtime = latestMtimeMs(distIndex);
const sourceMtime = Math.max(...sourcePaths.map(latestMtimeMs));

if (distMtime >= sourceMtime) {
  process.exit(0);
}

console.log("Frontend build is missing or outdated. Building before start...");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["run", "build"], {
  cwd: rootDir,
  stdio: "inherit"
});

process.exit(result.status || 0);
