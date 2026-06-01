const fs = require("fs");
const path = require("path");

const outputPath = process.env.BUILD_META_FILE || path.join(__dirname, "..", "build-meta.json");
const updatedAt = process.env.APP_UPDATED_AT || new Date().toISOString();

fs.writeFileSync(
  outputPath,
  `${JSON.stringify({ APP_UPDATED_AT: updatedAt }, null, 2)}\n`,
  "utf8"
);

console.log(`Wrote build metadata to ${outputPath}`);
