import { afterInsert, applyDefaults, beforeDelete } from "./domain.mjs";
import { newId } from "./db.mjs";

const TABLES = new Set([
  "accounts",
  "categories",
  "products",
  "customers",
  "suppliers",
  "sales",
  "sale_items",
  "purchases",
  "purchase_items",
  "expenses",
  "journal_entries",
  "journal_lines",
]);

const BOOLEAN_COLUMNS = new Set([
  "accounts.is_system",
  "accounts.active",
  "journal_entries.posted",
  "journal_lines.reconciled",
]);

// Embedded selects used by the app, e.g. "*, journal_lines(*)".
const RELATIONS = {
  "journal_entries.journal_lines": { kind: "children", table: "journal_lines", fk: "entry_id" },
  "journal_lines.journal_entries": { kind: "parent", table: "journal_entries", fk: "entry_id" },
  "sales.sale_items": { kind: "children", table: "sale_items", fk: "sale_id" },
  "purchases.purchase_items": { kind: "children", table: "purchase_items", fk: "purchase_id" },
};

const columnCache = new Map();

function columns(db, table) {
  if (!columnCache.has(table)) {
    columnCache.set(
      table,
      db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name),
    );
  }
  return columnCache.get(table);
}

function assertTable(table) {
  if (!TABLES.has(table)) throw new Error(`Unknown table: ${table}`);
  return table;
}

function toSqlValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

function fromSqlRow(table, row) {
  if (!row) return row;
  const out = { ...row };
  for (const key of Object.keys(out)) {
    if (BOOLEAN_COLUMNS.has(`${table}.${key}`)) out[key] = Boolean(out[key]);
  }
  return out;
}

function buildWhere(filters = []) {
  const clauses = [];
  const params = [];
  for (const f of filters) {
    const col = String(f.column).replace(/[^a-z0-9_]/gi, "");
    switch (f.op) {
      case "eq":
      case "neq":
      case "gt":
      case "gte":
      case "lt":
      case "lte": {
        const sqlOp = { eq: "=", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=" }[f.op];
        if (f.value === null) {
          clauses.push(`${col} IS ${f.op === "eq" ? "" : "NOT "}NULL`);
        } else {
          clauses.push(`${col} ${sqlOp} ?`);
          params.push(toSqlValue(f.value));
        }
        break;
      }
      case "in": {
        const list = Array.isArray(f.value) ? f.value : [];
        if (list.length === 0) {
          clauses.push("0 = 1");
        } else {
          clauses.push(`${col} IN (${list.map(() => "?").join(",")})`);
          params.push(...list.map(toSqlValue));
        }
        break;
      }
      case "is":
        clauses.push(f.value === null ? `${col} IS NULL` : `${col} = ?`);
        if (f.value !== null) params.push(toSqlValue(f.value));
        break;
      case "not.is":
        clauses.push(f.value === null ? `${col} IS NOT NULL` : `${col} != ?`);
        if (f.value !== null) params.push(toSqlValue(f.value));
        break;
      case "like":
      case "ilike":
        clauses.push(`${col} LIKE ?`);
        params.push(String(f.value).replace(/\*/g, "%"));
        break;
      default:
        throw new Error(`Unsupported filter: ${f.op}`);
    }
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", params };
}

function parseEmbeds(table, select) {
  if (!select || !select.includes("(")) return [];
  const embeds = [];
  const re = /(?:([a-z0-9_]+)\s*:\s*)?([a-z0-9_]+)\s*\(([^)]*)\)/gi;
  let match;
  while ((match = re.exec(select))) {
    const [, alias, relTable] = match;
    const relation = RELATIONS[`${table}.${relTable}`];
    if (relation) embeds.push({ alias: alias || relTable, relation });
  }
  return embeds;
}

function attachEmbeds(db, table, rows, select) {
  const embeds = parseEmbeds(table, select);
  if (embeds.length === 0) return rows;
  for (const row of rows) {
    for (const { alias, relation } of embeds) {
      if (relation.kind === "children") {
        row[alias] = db
          .prepare(`SELECT * FROM ${relation.table} WHERE ${relation.fk} = ?`)
          .all(row.id)
          .map((child) => fromSqlRow(relation.table, child));
      } else {
        const parent = db
          .prepare(`SELECT * FROM ${relation.table} WHERE id = ?`)
          .get(row[relation.fk]);
        row[alias] = parent ? fromSqlRow(relation.table, parent) : null;
      }
    }
  }
  return rows;
}

export function runSelect(db, { table, select, filters, order = [], limit, range }) {
  assertTable(table);
  const where = buildWhere(filters);
  let sql = `SELECT * FROM ${table}${where.sql}`;
  if (order.length) {
    sql += ` ORDER BY ${order
      .map((o) => `${String(o.column).replace(/[^a-z0-9_]/gi, "")} ${o.ascending === false ? "DESC" : "ASC"}`)
      .join(", ")}`;
  }
  if (limit) sql += ` LIMIT ${Number(limit)}`;
  else if (range) sql += ` LIMIT ${Number(range.to) - Number(range.from) + 1} OFFSET ${Number(range.from)}`;

  const rows = db.prepare(sql).all(...where.params).map((row) => fromSqlRow(table, row));
  return attachEmbeds(db, table, rows, select);
}

export function runInsert(db, { table, rows, select }) {
  assertTable(table);
  const cols = columns(db, table);
  const inserted = [];
  const tx = db.transaction(() => {
    for (const raw of rows) {
      const row = applyDefaults(table, raw);
      const keys = Object.keys(row).filter((k) => cols.includes(k));
      db.prepare(
        `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
      ).run(...keys.map((k) => toSqlValue(row[k])));
      const stored = fromSqlRow(table, db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(row.id));
      afterInsert(db, table, stored);
      inserted.push(stored);
    }
  });
  tx();
  return attachEmbeds(db, table, inserted, select);
}

export function runUpdate(db, { table, patch, filters, select }) {
  assertTable(table);
  const cols = columns(db, table);
  const keys = Object.keys(patch).filter((k) => cols.includes(k) && k !== "id");
  const where = buildWhere(filters);
  if (keys.length === 0) return runSelect(db, { table, select, filters });

  const setSql = keys.map((k) => `${k} = ?`).join(", ");
  const touch = cols.includes("updated_at") ? ", updated_at = datetime('now')" : "";
  db.prepare(`UPDATE ${table} SET ${setSql}${touch}${where.sql}`).run(
    ...keys.map((k) => toSqlValue(patch[k])),
    ...where.params,
  );
  return runSelect(db, { table, select, filters });
}

export function runDelete(db, { table, filters, select }) {
  assertTable(table);
  const targets = runSelect(db, { table, select, filters });
  const tx = db.transaction(() => {
    for (const row of targets) {
      beforeDelete(db, table, row);
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(row.id);
    }
  });
  tx();
  return targets;
}

export function runRpc(db, fn, args = {}) {
  if (fn === "decrement_product_stock") {
    db.prepare("UPDATE products SET stock = MAX(0, stock - ?), updated_at = datetime('now') WHERE id = ?").run(
      Number(args.p_qty) || 0,
      args.p_product_id,
    );
    return null;
  }
  if (fn === "acct") {
    const row = db.prepare("SELECT id FROM accounts WHERE code = ?").get(args._code);
    return row?.id ?? null;
  }
  throw new Error(`Unknown function: ${fn}`);
}

export { newId };
