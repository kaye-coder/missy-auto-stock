/**
 * One-off migration: copies data out of the old hosted Postgres database into
 * the local SQLite file. Run it once, while still online:
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run migrate:postgres
 *
 * It reads through the REST API, so no Postgres client or Docker is needed.
 */
import { getDb, initDb } from "../server/db.mjs";

const URL_BASE = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

// Parents before children so foreign keys always resolve.
const TABLES = [
  "accounts",
  "categories",
  "suppliers",
  "customers",
  "products",
  "sales",
  "sale_items",
  "purchases",
  "purchase_items",
  "expenses",
  "journal_entries",
  "journal_lines",
  "app_users",
];

const BOOLEANS = new Set(["is_system", "active", "posted", "reconciled"]);

if (!URL_BASE || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.");
  process.exit(1);
}

async function fetchAll(table) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=*`, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Range: `${from}-${from + pageSize - 1}`,
      },
    });
    if (res.status === 404) return rows;
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function toSqlValue(key, value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean" || BOOLEANS.has(key)) return value ? 1 : 0;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

await initDb();
const db = getDb();
const existing = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name),
);

db.pragma("foreign_keys = OFF");
for (const table of TABLES) {
  if (!existing.has(table)) continue;
  const rows = await fetchAll(table);
  if (rows.length === 0) {
    console.log(`- ${table}: nothing to copy`);
    continue;
  }
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  let copied = 0;
  const insert = db.transaction(() => {
    for (const row of rows) {
      const keys = Object.keys(row).filter((k) => columns.includes(k));
      db.prepare(
        `INSERT OR REPLACE INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
      ).run(...keys.map((k) => toSqlValue(k, row[k])));
      copied += 1;
    }
  });
  insert();
  console.log(`- ${table}: ${copied} rows copied`);
}
db.pragma("foreign_keys = ON");
console.log("\nMigration finished. Start the app with: npm start");
process.exit(0);
