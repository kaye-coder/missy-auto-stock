import test from "node:test";
import assert from "node:assert/strict";
import { open } from "./sqlite.mjs";
import { readFileSync } from "node:fs";
import { runSelect } from "./rest.mjs";

test("additive indexes preserve existing data and accelerate dated sales reads", async () => {
  const db = await open(":memory:");
  try {
    const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
    db.exec(schema);
    db.prepare("INSERT INTO sales(id, receipt_number, total, created_at) VALUES (?, ?, ?, ?)").run("existing", "RC-1", 4500, "2026-11-01T09:00:00Z");
    db.exec(schema);
    assert.equal(db.prepare("SELECT total FROM sales WHERE id = ?").get("existing").total, 4500);
    const plan = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM sales WHERE created_at >= ? ORDER BY created_at").all("2026-11-01");
    assert.ok(plan.some((row) => row.detail.includes("idx_sales_created")));
  } finally { db.close(); }
});

test("optimized embedded reads preserve aliases, children and booleans without changing records", async () => {
  const db = await open(":memory:");
  try {
    db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
    db.prepare("INSERT INTO accounts(id, code, name, type) VALUES ('cash','1000','Cash','asset')").run();
    const insertEntry = db.prepare("INSERT INTO journal_entries(id, entry_date, reference, source_type) VALUES (?, '2026-11-01', ?, 'manual')");
    for (let n = 0; n < 3; n++) {
      insertEntry.run(`entry-${n}`, `REF-${n}`);
      db.prepare("INSERT INTO journal_lines(id, entry_id, account_id, debit) VALUES (?, ?, 'cash', 4500)").run(`line-${n}`, `entry-${n}`);
    }
    let preparations = 0;
    const measured = { ...db, prepare(sql) { preparations++; return db.prepare(sql); } };
    const rows = runSelect(measured, { table: "journal_entries", select: "*, lines:journal_lines(*)", order: [{ column: "id" }] });
    assert.equal(preparations, 2);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].posted, true);
    assert.equal(rows[0].lines[0].debit, 4500);
    assert.equal(rows[0].lines[0].reconciled, false);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM journal_lines").get().n, 3);
  } finally { db.close(); }
});