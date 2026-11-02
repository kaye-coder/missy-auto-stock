import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2" };

export function staticHandler(directory) {
  const root = resolve(directory);
  const shell = ["index.html", "_shell.html", "_shell/index.html"].map((p) => resolve(root, p)).find(existsSync);
  if (!shell) throw new Error("Offline files are missing. Run npm run prepare:offline first.");
  return (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405); res.end(); return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
    catch { res.writeHead(400); res.end(); return; }
    let file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    if (!existsSync(file) || !statSync(file).isFile()) {
      if (extname(pathname)) { res.writeHead(404); res.end(); return; }
      file = shell;
    }
    const type = TYPES[extname(file)] ?? "application/octet-stream";
    const accepted = String(req.headers["accept-encoding"] ?? "");
    const tokens = accepted.split(",").map((part) => part.trim().split(";"));
    const supports = (name) => tokens.some(([encoding, ...params]) => encoding === name && !params.some((p) => /^\s*q=0(?:\.0*)?\s*$/.test(p)));
    const encoding = supports("br") && existsSync(file + ".br") ? "br" : supports("gzip") && existsSync(file + ".gz") ? "gzip" : null;
    const served = encoding ? file + (encoding === "br" ? ".br" : ".gz") : file;
    res.writeHead(200, {
      "content-type": type,
      "content-length": statSync(served).size,
      "cache-control": file === shell || extname(file) === ".html" ? "no-cache" : file.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
      vary: "Accept-Encoding",
      ...(encoding ? { "content-encoding": encoding } : {}),
    });
    if (req.method === "HEAD") { res.end(); return; }
    createReadStream(served).on("error", () => res.destroy()).pipe(res);
  };
}