import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { backupDirectory } from "./local-config.mjs";
import { staticHandler } from "./static.mjs";

test("first-launch backup path leaves the existing client database untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "missy-config-"));
  try {
    const live = join(dir, "missy.db");
    writeFileSync(live, "existing-client-records");
    const selected = join(dir, "chosen backups");
    writeFileSync(join(dir, "launcher.json"), JSON.stringify({ backupDirectory: selected }));
    assert.equal(backupDirectory(dir), selected);
    assert.equal(readFileSync(live, "utf8"), "existing-client-records");
    assert.equal(backupDirectory(dir, join(dir, "override")), join(dir, "override"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("existing installations retain their backup location until setup", () => {
  const dir = mkdtempSync(join(tmpdir(), "missy-default-"));
  try { assert.equal(backupDirectory(dir), join(dir, "backups")); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("prebuilt app serves routes, compressed assets, and never substitutes missing scripts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "missy-static-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<html>Missy offline shell</html>");
  const js = "console.log('offline');";
  writeFileSync(join(dir, "assets", "app-123.js"), js);
  writeFileSync(join(dir, "assets", "app-123.js.gz"), gzipSync(js));
  const server = createServer(staticHandler(dir));
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const route = await fetch(base + "/pos");
    assert.equal(await route.text(), "<html>Missy offline shell</html>");
    assert.equal(route.headers.get("cache-control"), "no-cache");
    const asset = await fetch(base + "/assets/app-123.js", { headers: { "accept-encoding": "gzip" } });
    assert.equal(asset.headers.get("content-encoding"), "gzip");
    assert.equal(await asset.text(), js);
    const plain = await fetch(base + "/assets/app-123.js", { headers: { "accept-encoding": "gzip;q=0" } });
    assert.equal(plain.headers.get("content-encoding"), null);
    assert.equal((await fetch(base + "/assets/missing.js")).status, 404);
    assert.equal((await fetch(base + "/%2e%2e%2fprivate.db")).status, 403);
  } finally {
    await new Promise((done) => server.close(done));
    rmSync(dir, { recursive: true, force: true });
  }
});