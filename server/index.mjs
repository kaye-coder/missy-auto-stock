import { createReadStream, existsSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import * as auth from "./auth.mjs";
import { createBackup, listBackups, restoreBackup, startBackupSchedule } from "./backup.mjs";
import { DB_PATH, ROOT, UPLOAD_DIR, newId, openDb } from "./db.mjs";
import { runDelete, runInsert, runRpc, runSelect, runUpdate } from "./rest.mjs";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const DIST = join(ROOT, "dist", "client");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const db = openDb();
startBackupSchedule();

/* ---------- realtime: server-sent events ---------- */
const listeners = new Set();

export function broadcast(payload) {
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of listeners) res.write(frame);
}

/* ---------- helpers ---------- */
function send(res, status, body, headers = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

const DATA_OPS = {
  select: runSelect,
  insert: runInsert,
  update: runUpdate,
  delete: runDelete,
};

const AUTH_OPS = {
  login: (body) => auth.login(db, body),
  session: (body) => auth.sessionFromToken(db, body.token),
  clone: (body) => auth.cloneSession(db, body.token),
  logout: (body) => auth.logout(db, body.token),
  "users.list": (body) => auth.listUsers(db, body.token),
  "users.create": (body) => auth.createUser(db, body.token, body.user),
  "users.update": (body) => auth.updateUser(db, body.token, body.id, body.user),
  "users.delete": (body) => auth.deleteUser(db, body.token, body.id),
  "users.migrate": (body) => auth.migrateLegacyUsers(db, body.token, body.users),
};

async function handleApi(req, res, url) {
  const path = url.pathname;

  if (path === "/api/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    res.write(": connected\n\n");
    listeners.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    req.on("close", () => {
      clearInterval(ping);
      listeners.delete(res);
    });
    return true;
  }

  if (path === "/api/health") {
    send(res, 200, { ok: true, database: DB_PATH });
    return true;
  }

  if (path === "/api/data" && req.method === "POST") {
    const body = await readBody(req);
    const op = DATA_OPS[body.op];
    if (!op) throw new Error(`Unsupported operation: ${body.op}`);
    const data = op(db, body);
    if (body.op !== "select") broadcast({ table: body.table, op: body.op });
    send(res, 200, { data });
    return true;
  }

  if (path === "/api/rpc" && req.method === "POST") {
    const body = await readBody(req);
    const data = runRpc(db, body.fn, body.args);
    broadcast({ table: "rpc", op: body.fn });
    send(res, 200, { data });
    return true;
  }

  if (path === "/api/auth" && req.method === "POST") {
    const body = await readBody(req);
    const op = AUTH_OPS[body.op];
    if (!op) throw new Error(`Unsupported auth operation: ${body.op}`);
    send(res, 200, { data: op(body) });
    return true;
  }

  if (path === "/api/storage/upload" && req.method === "POST") {
    const body = await readBody(req);
    const safeName = `${newId()}-${String(body.name ?? "image").replace(/[^a-z0-9._-]/gi, "_")}`;
    writeFileSync(join(UPLOAD_DIR, safeName), Buffer.from(String(body.data ?? ""), "base64"));
    send(res, 200, { data: { path: safeName, url: `/uploads/product-images/${safeName}` } });
    return true;
  }

  if (path === "/api/backups") {
    if (req.method === "GET") {
      send(res, 200, { data: listBackups() });
      return true;
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      if (!auth.sessionFromToken(db, body.token)) throw new Error("Not signed in");
      send(res, 200, { data: await createBackup() });
      return true;
    }
  }

  if (path === "/api/backups/restore" && req.method === "POST") {
    const body = await readBody(req);
    const session = auth.sessionFromToken(db, body.token);
    if (!session || session.role !== "admin") throw new Error("Admin access required");
    const result = await restoreBackup(body.name);
    broadcast({ table: "*", op: "restore" });
    send(res, 200, { data: result });
    return true;
  }

  return false;
}

function serveFile(res, filePath) {
  res.writeHead(200, {
    "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
    "cache-control": filePath.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
  });
  createReadStream(filePath).pipe(res);
}

function serveStatic(res, url) {
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith("/uploads/product-images/")) {
    const file = join(UPLOAD_DIR, normalize(pathname.replace("/uploads/product-images/", "")));
    if (file.startsWith(UPLOAD_DIR) && existsSync(file)) return serveFile(res, file);
    return send(res, 404, { error: "Not found" });
  }

  const candidate = join(DIST, normalize(pathname));
  if (candidate.startsWith(DIST) && pathname !== "/" && existsSync(candidate)) {
    return serveFile(res, candidate);
  }
  const index = join(DIST, "index.html");
  if (existsSync(index)) return serveFile(res, index);
  send(res, 503, { error: "The app has not been built yet. Run: npm run build" });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, url);
      if (!handled) send(res, 404, { error: "Not found" });
      return;
    }
    serveStatic(res, url);
  } catch (error) {
    console.error("[api]", error);
    if (!res.headersSent) send(res, 400, { error: error.message ?? "Request failed" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Missy is running`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://<this-computer-ip>:${PORT}`);
  console.log(`  Database: ${DB_PATH}\n`);
});

export default server;
