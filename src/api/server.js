import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

const port = Number(process.env.PORT || 3001);
const app = await createApp();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const frontendRoot = path.join(projectRoot, "frontend");
const avatarsRoot = path.join(projectRoot, "src", "avatars");
const iconsRoot = path.join(projectRoot, "src", "icons");
const maxRequestBodyBytes = readPositiveIntegerEnv("MAX_REQUEST_BODY_BYTES", 1_000_000);
const generalRateLimitWindowMs = readPositiveIntegerEnv("RATE_LIMIT_WINDOW_MS", 60_000);
const generalRateLimitMax = readPositiveIntegerEnv("RATE_LIMIT_MAX_REQUESTS", 300);
const authRateLimitWindowMs = readPositiveIntegerEnv("AUTH_RATE_LIMIT_WINDOW_MS", 15 * 60_000);
const authRateLimitMax = readPositiveIntegerEnv("AUTH_RATE_LIMIT_MAX_REQUESTS", 30);
const rateBuckets = new Map();

function readPositiveIntegerEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function isApiPath(pathname) {
  return (
    pathname.startsWith("/health") ||
    pathname.startsWith("/auth/") ||
    pathname === "/me" ||
    pathname.startsWith("/me/") ||
    pathname === "/houses" ||
    pathname.startsWith("/houses/") ||
    pathname.startsWith("/files/") ||
    pathname.startsWith("/admin/")
  );
}

function clientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = req.headers["x-real-ip"] || req.headers["cf-connecting-ip"];
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();
  return req.socket.remoteAddress || "unknown";
}

function rateLimitFor(pathname) {
  const isSensitive =
    pathname === "/auth/login" ||
    pathname === "/auth/request-otp" ||
    pathname === "/auth/verify-otp" ||
    pathname === "/admin/users";
  return isSensitive
    ? { scope: "auth", windowMs: authRateLimitWindowMs, max: authRateLimitMax }
    : { scope: "api", windowMs: generalRateLimitWindowMs, max: generalRateLimitMax };
}

function pruneRateBuckets(now = Date.now()) {
  if (rateBuckets.size < 10_000) return;
  for (const [key, bucket] of rateBuckets.entries()) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}

function checkRateLimit(req, pathname) {
  const now = Date.now();
  pruneRateBuckets(now);
  const limit = rateLimitFor(pathname);
  const key = `${limit.scope}:${clientIp(req)}`;
  const current = rateBuckets.get(key);
  const bucket = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + limit.windowMs };
  bucket.count += 1;
  rateBuckets.set(key, bucket);

  if (bucket.count <= limit.max) {
    return { allowed: true };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    limit: limit.max,
  };
}

function writeJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

async function serveStatic(req, res) {
  const url = new URL(`http://${req.headers.host || "localhost"}${req.url}`);
  if (isApiPath(url.pathname)) {
    return false;
  }

  const isAvatarRequest = url.pathname.startsWith("/avatars/");
  const isIconRequest = url.pathname.startsWith("/icons/");
  const staticRoot = isAvatarRequest ? avatarsRoot : isIconRequest ? iconsRoot : frontendRoot;
  const rawRelativePath = isAvatarRequest
    ? url.pathname.replace(/^\/avatars\/+/, "")
    : isIconRequest
      ? url.pathname.replace(/^\/icons\/+/, "")
      : url.pathname.replace(/^\/+/, "");
  const relativePath = decodeURIComponent(rawRelativePath);
  const targetPath =
    url.pathname === "/" ? path.join(frontendRoot, "index.html") : path.join(staticRoot, relativePath);

  if (!targetPath.startsWith(staticRoot)) {
    res.writeHead(403);
    res.end("Forbidden");
    return true;
  }

  try {
    const content = await readFile(targetPath);
    res.writeHead(200, { "content-type": guessContentType(targetPath) });
    res.end(content);
    return true;
  } catch {
    if (isAvatarRequest || isIconRequest) {
      res.writeHead(404);
      res.end(isAvatarRequest ? "Avatar not found" : "Icon not found");
      return true;
    }
    const fallback = path.join(frontendRoot, "index.html");
    try {
      const content = await readFile(fallback);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(content);
      return true;
    } catch {
      return false;
    }
  }
}

const server = http.createServer(async (req, res) => {
  if (await serveStatic(req, res)) {
    return;
  }

  const requestUrl = `http://${req.headers.host || "localhost"}${req.url}`;
  const url = new URL(requestUrl);
  const rateLimit = checkRateLimit(req, url.pathname);
  if (!rateLimit.allowed) {
    writeJson(
      res,
      429,
      { error: "Too many requests. Please try again later." },
      { "retry-after": String(rateLimit.retryAfterSeconds) },
    );
    return;
  }

  const contentLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > maxRequestBodyBytes) {
    writeJson(res, 413, { error: "Request body too large" });
    return;
  }

  const chunks = [];
  let receivedBytes = 0;
  let requestTooLarge = false;

  req.on("data", (chunk) => {
    receivedBytes += chunk.length;
    if (receivedBytes > maxRequestBodyBytes) {
      requestTooLarge = true;
      writeJson(res, 413, { error: "Request body too large" });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", async () => {
    if (requestTooLarge) return;
    const body = Buffer.concat(chunks);
    const method = req.method || "GET";
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        headers.set(key, value.join(", "));
      }
    }

    const request = new Request(requestUrl, {
      method,
      headers,
      body: body.length > 0 ? body : undefined,
    });

    const response = await app.handleRequest(request);

    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    const arrayBuffer = await response.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  });

  req.on("error", () => {
    if (!requestTooLarge && !res.writableEnded) {
      writeJson(res, 400, { error: "Invalid request" });
    }
  });
});

server.listen(port, () => {
  console.log(`Flatmate Ledger API listening on http://localhost:${port}`);
});
