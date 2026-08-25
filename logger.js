const pino = require("pino");

module.exports = pino({
  level: process.env.LOG_LEVEL || "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: process.env.LOG_PRETTY === "true" ? {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname", singleLine: true }
  } : undefined,
  redact: {
    paths: ["apiToken", "serviceToken", "authorization", "headers.authorization", "req.headers.authorization"],
    censor: "[REDACTED]"
  }
});
