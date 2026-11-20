const crypto = require("crypto");
const { promisify } = require("util");

const scryptAsync = promisify(crypto.scrypt);

const SECURITY_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()"
});

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "")
    .split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const index = part.indexOf("=");
      if (index === -1) return [part, ""];
      try {
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      } catch {
        return [part.slice(0, index), part.slice(index + 1)];
      }
    }));
}

function isSecureRequest(req) {
  return req.headers["x-forwarded-proto"] === "https" || Boolean(req.socket?.encrypted);
}

function signSession(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function makeSessionToken(session, maxAgeSeconds, secret) {
  const payload = Buffer.from(JSON.stringify({
    ...session,
    exp: Date.now() + maxAgeSeconds * 1000
  })).toString("base64url");
  return `${payload}.${signSession(payload, secret)}`;
}

function buildAuthCookie(req, cookieName, token, maxAgeSeconds = null) {
  const parts = [
    `${cookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (isSecureRequest(req)) parts.push("Secure");
  if (maxAgeSeconds !== null) parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join("; ");
}

async function hashAccountPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

async function verifyAccountPassword(password, stored) {
  const [method, salt, expected] = String(stored || "").split("$");
  if (method !== "scrypt" || !salt || !expected) return false;
  const actual = (await scryptAsync(String(password || ""), salt, 64)).toString("hex");
  return safeEqual(actual, expected);
}

function createAuthRateLimiter({ maxBuckets = 10_000 } = {}) {
  const buckets = new Map();
  function prune(now) {
    if (buckets.size <= maxBuckets) return;
    for (const [key, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(key);
    }
    while (buckets.size > maxBuckets) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey === undefined) break;
      buckets.delete(oldestKey);
    }
  }
  return {
    consume(key, { limit, windowMs, now = Date.now() }) {
      prune(now);
      const current = buckets.get(key);
      if (!current || current.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0 };
      }
      if (current.count >= limit) {
        return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
      }
      current.count += 1;
      return { allowed: true, remaining: Math.max(0, limit - current.count), retryAfterSeconds: 0 };
    },
    reset(key) {
      buckets.delete(key);
    },
    clear() {
      buckets.clear();
    }
  };
}

function checkSecretStrength(env = process.env) {
  const warnings = [];
  const adminPass = env.ADMIN_PASSWORD || "admin";
  const sessionSecret = String(env.SESSION_SECRET || "").trim();
  if (adminPass === "admin" || adminPass.length < 8) {
    warnings.push("ADMIN_PASSWORD is using the default or a weak value (< 8 chars).");
  }
  if (!sessionSecret || sessionSecret.length < 16) {
    warnings.push("SESSION_SECRET is not explicitly configured with at least 16 characters; falling back to a derived secret.");
  }
  return warnings;
}

module.exports = {
  SECURITY_HEADERS,
  safeEqual,
  parseCookies,
  isSecureRequest,
  signSession,
  makeSessionToken,
  buildAuthCookie,
  hashAccountPassword,
  verifyAccountPassword,
  createAuthRateLimiter,
  checkSecretStrength
};
