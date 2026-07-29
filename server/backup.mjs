import { copyFileSync, existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { BACKUP_DIR, DB_PATH, getDb, reopenDb } from "./db.mjs";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const KEEP = 10;

const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

export function listBackups() {
  if (!existsSync(BACKUP_DIR)) return [];
  return readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith(".db"))
    .map((name) => {
      const stats = statSync(join(BACKUP_DIR, name));
      return { name, size: stats.size, createdAt: stats.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Uses SQLite's online backup API, so it is safe while the shop is using the app. */
export async function createBackup(prefix = "missy") {
  const db = getDb();
  const name = `${prefix}-${timestamp()}.db`;
  const target = join(BACKUP_DIR, name).replace(/'/g, "''");
  db.exec(`VACUUM INTO '${target}'`);
  prune();
  return { name, ...listBackups().find((b) => b.name === name) };
}

function prune() {
  const auto = listBackups().filter((b) => b.name.startsWith("missy-"));
  for (const old of auto.slice(KEEP)) unlinkSync(join(BACKUP_DIR, old.name));
}

export async function restoreBackup(name) {
  if (!/^[a-z0-9._-]+\.db$/i.test(name)) throw new Error("Invalid backup name");
  const source = join(BACKUP_DIR, name);
  if (!existsSync(source)) throw new Error("That backup no longer exists");

  await createBackup("pre-restore");
  const db = getDb();
  db.close();
  copyFileSync(source, DB_PATH);
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${DB_PATH}${suffix}`;
    if (existsSync(sidecar)) unlinkSync(sidecar);
  }
  await reopenDb();
  return { ok: true, restored: name };
}

/** Backs up on startup if the newest backup is older than 7 days, then every 7 days. */
export function startBackupSchedule() {
  const run = async () => {
    try {
      const [latest] = listBackups().filter((b) => b.name.startsWith("missy-"));
      const age = latest ? Date.now() - new Date(latest.createdAt).getTime() : Infinity;
      if (age >= WEEK_MS) {
        const backup = await createBackup();
        console.log(`[backup] Weekly backup written: ${backup.name}`);
      }
    } catch (error) {
      console.error("[backup] Scheduled backup failed:", error);
    }
  };
  void run();
  const timer = setInterval(run, 24 * 60 * 60 * 1000);
  timer.unref?.();
  return timer;
}
