const { spawn, execFileSync } = require("child_process");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm" : "npm";
const children = [];

if (process.platform !== "win32") {
  try {
    execFileSync("bash", [path.join(__dirname, "setup-subconverter.sh")], { stdio: "inherit" });
  } catch {
    console.warn("setup-subconverter.sh failed, continuing anyway");
  }
}

function run(name, args) {
  const child = spawn(npmCommand, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: true
  });

  children.push(child);
  child.on("exit", code => {
    if (code && !shuttingDown) {
      console.error(`${name} exited with code ${code}`);
      shutdown(code);
    }
  });
}

let shuttingDown = false;
function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("backend", ["run", "dev:server"]);
run("frontend", ["run", "dev"]);
