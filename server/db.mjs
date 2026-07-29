import Database from "better-sqlite3";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "..");
export const DATA_DIR = process.env.MISSY_DATA_DIR
  ? resolve(process.env.MISSY_DATA_DIR)
  : join(ROOT, "data");
export const DB_PATH = join(DATA_DIR, "missy.db");
export const BACKUP_DIR = join(DATA_DIR, "backups");
export const UPLOAD_DIR = join(ROOT, "uploads", "product-images");

for (const dir of [DATA_DIR, BACKUP_DIR, UPLOAD_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export const CHART_OF_ACCOUNTS = [
  ["1000", "Cash on Hand", "asset"],
  ["1010", "Bank Account", "asset"],
  ["1100", "Accounts Receivable", "asset"],
  ["1200", "Inventory", "asset"],
  ["1300", "VAT Input (Recoverable)", "asset"],
  ["2000", "Accounts Payable", "liability"],
  ["2100", "VAT Output (Payable)", "liability"],
  ["2200", "Withholding Tax Payable", "liability"],
  ["3000", "Owner's Equity", "equity"],
  ["3900", "Retained Earnings", "equity"],
  ["4000", "Sales Revenue", "income"],
  ["4100", "Other Income", "income"],
  ["5000", "Cost of Goods Sold", "expense"],
  ["6000", "General Expenses", "expense"],
  ["6100", "Rent", "expense"],
  ["6200", "Utilities", "expense"],
  ["6300", "Salaries & Wages", "expense"],
  ["6400", "Transport", "expense"],
  ["6500", "Repairs & Maintenance", "expense"],
];

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function newSecret() {
  return randomBytes(32).toString("hex");
}

export function newId() {
  return randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

let db;

/** Opens (creating if needed) the single SQLite file and applies the schema. */
export function openDb() {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(readFileSync(join(here, "schema.sql"), "utf8"));
  seed(db);
  return db;
}

export function reopenDb() {
  if (db) {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    db = undefined;
  }
  return openDb();
}

function seed(handle) {
  const insertAccount = handle.prepare(
    "INSERT OR IGNORE INTO accounts (id, code, name, type, is_system) VALUES (?, ?, ?, ?, 1)",
  );
  const seedAccounts = handle.transaction(() => {
    for (const [code, name, type] of CHART_OF_ACCOUNTS) {
      insertAccount.run(randomUUID(), code, name, type);
    }
  });
  seedAccounts();

  const admins = handle.prepare("SELECT COUNT(*) AS n FROM app_users").get();
  if (admins.n === 0) {
    const salt = newSecret();
    handle
      .prepare(
        `INSERT INTO app_users (id, username, full_name, password_hash, password_salt, role, permissions, active)
         VALUES (?, 'admin', 'Administrator', ?, ?, 'admin', '[]', 1)`,
      )
      .run(randomUUID(), sha256(`${salt}:admin`), salt);
    console.log("[db] Created default admin account (username: admin, password: admin)");
  }
}
