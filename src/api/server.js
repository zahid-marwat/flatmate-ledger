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

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  return "application/octet-stream";
}

async function serveStatic(req, res) {
  const url = new URL(`http://${req.headers.host || "localhost"}${req.url}`);
  if (
    url.pathname.startsWith("/health") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname === "/me" ||
    url.pathname === "/houses" ||
    url.pathname.startsWith("/houses/") ||
    url.pathname.startsWith("/files/")
  ) {
    return false;
  }

  const targetPath =
    url.pathname === "/" ? path.join(frontendRoot, "index.html") : path.join(frontendRoot, url.pathname.replace(/^\/+/, ""));

  if (!targetPath.startsWith(frontendRoot)) {
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
  const chunks = [];

  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
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
});

server.listen(port, () => {
  console.log(`Flatmate Ledger API listening on http://localhost:${port}`);
});
