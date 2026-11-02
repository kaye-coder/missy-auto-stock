import { readdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";

function compress(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = resolve(dir, entry.name);
    if (entry.isDirectory()) compress(file);
    else if ([".js", ".css", ".html", ".svg", ".json"].includes(extname(file))) {
      const raw = readFileSync(file);
      if (raw.length < 1024) continue;
      writeFileSync(file + ".br", brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }));
      writeFileSync(file + ".gz", gzipSync(raw, { level: 9 }));
    }
  }
}
const client = resolve("dist-offline/client");
const shell = ["_shell.html", "_shell/index.html", "index.html"].map((p) => resolve(client, p)).find(existsSync);
if (!shell) throw new Error("The offline build did not produce an app shell.");
if (shell !== resolve(client, "index.html")) copyFileSync(shell, resolve(client, "index.html"));
compress(client);
console.log("Offline text assets compressed; photos and business data left untouched.");