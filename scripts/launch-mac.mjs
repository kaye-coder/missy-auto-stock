import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, symlinkSync, lstatSync, realpathSync, openSync, closeSync } from "node:fs";
import { dirname, resolve, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.MISSY_DATA_DIR ? resolve(process.env.MISSY_DATA_DIR) : join(root, "data");
const configFile = join(dataDir, "launcher.json");
const port = Number(process.env.PORT ?? 8080);
const url = `http://localhost:${port}`;

function apple(script, args = []) {
  const result = spawnSync("osascript", ["-e", script, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error("Setup cancelled or macOS could not open the folder dialog.");
  return result.stdout.trim();
}

function setup() {
  mkdirSync(dataDir, { recursive: true });
  if (existsSync(configFile)) return;
  const directory = apple(`
    set answer to button returned of (display dialog "Where should Missy save database backups? Existing shop data will stay in its current folder." buttons {"Cancel", "Type path", "Choose folder"} default button "Choose folder" cancel button "Cancel")
    if answer is "Choose folder" then
      return POSIX path of (choose folder with prompt "Choose the Missy backup folder")
    else
      return text returned of (display dialog "Enter a full backup folder path:" default answer (POSIX path of (path to documents folder) & "Missy Backups") buttons {"Cancel", "Save"} default button "Save" cancel button "Cancel")
    end if
  `);
  const expanded = directory.startsWith("~/") ? join(homedir(), directory.slice(2)) : directory;
  if (!isAbsolute(expanded)) throw new Error("Choose an absolute backup folder path, such as /Users/yourname/Documents/Missy Backups.");
  const backupDirectory = resolve(expanded);
  if (backupDirectory === dataDir) throw new Error("Choose a separate backup folder, not the folder containing missy.db.");
  mkdirSync(backupDirectory, { recursive: true });
  const probe = join(backupDirectory, `.missy-write-check-${process.pid}`);
  writeFileSync(probe, "");
  // No existing database, images, settings or backups are moved or replaced.
  const { unlinkSync } = spawnSync; // unused; probe removed below using filesystem import
  writeFileSync(configFile + ".tmp", JSON.stringify({ backupDirectory }, null, 2), { mode: 0o600 });
  renameSync(configFile + ".tmp", configFile);
}

function desktopShortcut() {
  const desktop = join(homedir(), "Desktop");
  mkdirSync(desktop, { recursive: true });
  const target = join(root, "Start Missy.command");
  const shortcut = join(desktop, "Missy.command");
  try {
    if (lstatSync(shortcut).isSymbolicLink() && realpathSync(shortcut) === realpathSync(target)) return;
    throw new Error("Desktop/Missy.command already exists; it was not overwritten.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  symlinkSync(target, shortcut);
}

async function health() {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(800) });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}

function runNpm(args) {
  const result = spawnSync("npm", args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error("Initial preparation failed. Your existing shop data was not changed. Check the message above and try again.");
}

async function launch() {
  if (process.platform !== "darwin") throw new Error("This launcher is for macOS; use npm run start:offline on other systems.");
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw new Error("Install Node.js 22.13 or newer before launching Missy.");
  const existing = await health();
  if (existing && (existing.app !== "missy" || existing.root !== root || existing.database !== join(dataDir, "missy.db"))) {
    throw new Error(`Port ${port} belongs to another app or Missy folder. Stop that server first; no data has been changed.`);
  }
  setup();
  desktopShortcut();
  if (existing?.ok) { spawnSync("open", [url]); return; }
  if (!existsSync(join(root, "node_modules", "vite"))) {
    console.log("First launch: installing app files. Internet is needed only for this initial step.");
    runNpm(["install"]);
  }
  if (!existsSync(join(root, "dist-offline", "client", "index.html"))) {
    console.log("First launch: preparing the offline app. Future launches skip this step.");
    runNpm(["run", "prepare:offline"]);
  }
  const log = openSync(join(dataDir, "missy-server.log"), "a", 0o600);
  const child = spawn(process.execPath, [join(root, "server", "index.mjs")], {
    cwd: root, env: process.env, detached: true, stdio: ["ignore", log, log],
  });
  closeSync(log);
  child.unref();
  for (let n = 0; n < 100; n++) {
    const ready = await health();
    if (ready?.ok && ready.root === root && ready.database === join(dataDir, "missy.db")) {
      spawnSync("open", [url]);
      console.log("Missy is ready. You can close this window; the shop stays running.");
      return;
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`Missy did not become ready. See ${join(dataDir, "missy-server.log")}. Do not delete your database.`);
}

launch().catch((error) => { console.error(error.message); process.exitCode = 1; });