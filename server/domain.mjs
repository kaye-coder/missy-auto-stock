import { newId } from "./db.mjs";

/** Money helper — SQLite has no exact decimal type, so every amount is rounded to 2dp on write. */
export const r2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const pad = (n, len) => String(n).padStart(len, "0");

function stamp(date = new Date()) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1, 2)}${pad(date.getDate(), 2)}`;
}

export function receiptNumber() {
  return `RCP-${stamp()}-${pad(Math.floor(Math.random() * 100000), 5)}`;
}

export function purchaseNumber() {
  return `PO-${stamp()}-${pad(Math.floor(Math.random() * 100000), 5)}`;
}

/** Replacement for the Postgres acct(code) function. */
export function acct(db, code) {
  const row = db.prepare("SELECT id FROM accounts WHERE code = ? LIMIT 1").get(code);
  if (!row) throw new Error(`Account ${code} is missing from the chart of accounts`);
  return row.id;
}

function addEntry(db, { date, reference, memo, sourceType, sourceId, lines }) {
  const entryId = newId();
  db.prepare(
    `INSERT INTO journal_entries (id, entry_date, reference, memo, source_type, source_id, posted)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
  ).run(entryId, date, reference, memo ?? null, sourceType, sourceId ?? null);

  const insertLine = db.prepare(
    `INSERT INTO journal_lines (id, entry_id, account_id, debit, credit, description)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const line of lines) {
    if (r2(line.debit) === 0 && r2(line.credit) === 0) continue;
    insertLine.run(
      newId(),
      entryId,
      line.account,
      r2(line.debit),
      r2(line.credit),
      line.description ?? null,
    );
  }
  return entryId;
}

function deleteJournalBySource(db, sourceId) {
  db.prepare("DELETE FROM journal_entries WHERE source_id = ?").run(sourceId);
}

/* ---------- former SQL triggers, now plain JavaScript ---------- */

function postSaleJournal(db, sale) {
  const net = r2(sale.subtotal - (sale.discount ?? 0));
  const paid = r2(Math.min(sale.amount_paid ?? sale.total, sale.total));
  const credit = r2(Math.max(sale.total - paid, 0));
  const cashLike = ["bank", "card", "mobile", "mpesa", "transfer"].includes(sale.payment_method);

  addEntry(db, {
    date: String(sale.created_at).slice(0, 10),
    reference: sale.receipt_number,
    memo: `Sale ${sale.receipt_number}`,
    sourceType: "sale",
    sourceId: sale.id,
    lines: [
      {
        account: acct(db, cashLike ? "1010" : "1000"),
        debit: paid,
        credit: 0,
        description: "Sale payment received",
      },
      {
        account: acct(db, "1100"),
        debit: credit,
        credit: 0,
        description: "Credit sale — balance due",
      },
      { account: acct(db, "4000"), debit: 0, credit: net, description: "Sales revenue" },
      { account: acct(db, "2100"), debit: 0, credit: r2(sale.tax), description: "VAT output" },
    ],
  });
}

function postSaleItemCogs(db, item) {
  if (!item.product_id) return;
  const product = db.prepare("SELECT cost FROM products WHERE id = ?").get(item.product_id);
  const cost = r2(product?.cost ?? 0);
  if (cost === 0) return;
  const total = r2(cost * item.quantity);
  const sale = db.prepare("SELECT receipt_number FROM sales WHERE id = ?").get(item.sale_id);

  addEntry(db, {
    date: new Date().toISOString().slice(0, 10),
    reference: `${sale?.receipt_number ?? "SALE"}-COGS`,
    memo: `COGS ${item.product_name}`,
    sourceType: "sale",
    sourceId: item.sale_id,
    lines: [
      { account: acct(db, "5000"), debit: total, credit: 0, description: item.product_name },
      { account: acct(db, "1200"), debit: 0, credit: total, description: item.product_name },
    ],
  });
}

function postPurchaseJournal(db, purchase) {
  const creditCode =
    purchase.payment_method === "bank"
      ? "1010"
      : purchase.payment_method === "credit"
        ? "2000"
        : "1000";

  addEntry(db, {
    date: purchase.purchase_date,
    reference: purchase.purchase_number,
    memo: `Purchase ${purchase.purchase_number}`,
    sourceType: "purchase",
    sourceId: purchase.id,
    lines: [
      {
        account: acct(db, "1200"),
        debit: r2(purchase.subtotal),
        credit: 0,
        description: "Inventory purchased",
      },
      {
        account: acct(db, "1300"),
        debit: r2(purchase.vat_input),
        credit: 0,
        description: "VAT input",
      },
      {
        account: acct(db, "2200"),
        debit: 0,
        credit: r2(purchase.wht),
        description: "Withholding tax",
      },
      {
        account: acct(db, creditCode),
        debit: 0,
        credit: r2(purchase.total - (purchase.wht ?? 0)),
        description: "Payment to supplier",
      },
    ],
  });
}

function postExpenseJournal(db, expense) {
  const creditCode =
    expense.payment_method === "bank"
      ? "1010"
      : expense.payment_method === "credit"
        ? "2000"
        : "1000";
  const expenseAccount = expense.account_id ?? acct(db, "6000");

  addEntry(db, {
    date: expense.expense_date,
    reference: expense.reference || `EXP-${String(expense.id).slice(0, 8)}`,
    memo: `${expense.category} — ${expense.description ?? ""}`,
    sourceType: "expense",
    sourceId: expense.id,
    lines: [
      {
        account: expenseAccount,
        debit: r2(expense.amount),
        credit: 0,
        description: expense.category,
      },
      {
        account: acct(db, "1300"),
        debit: r2(expense.vat_input),
        credit: 0,
        description: "VAT input",
      },
      { account: acct(db, "2200"), debit: 0, credit: r2(expense.wht), description: "WHT withheld" },
      {
        account: acct(db, creditCode),
        debit: 0,
        credit: r2(expense.total - (expense.wht ?? 0)),
        description: "Payment",
      },
    ],
  });
}

function adjustStock(db, productId, delta, cost) {
  if (!productId) return;
  if (cost === undefined) {
    db.prepare(
      "UPDATE products SET stock = MAX(0, stock + ?), updated_at = datetime('now') WHERE id = ?",
    ).run(delta, productId);
  } else {
    db.prepare(
      "UPDATE products SET stock = MAX(0, stock + ?), cost = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(delta, r2(cost), productId);
  }
}

/** Runs after a row is inserted, mirroring the old AFTER INSERT triggers. */
export function afterInsert(db, table, row) {
  if (table === "sales") postSaleJournal(db, row);
  if (table === "sale_items") {
    adjustStock(db, row.product_id, -row.quantity);
    postSaleItemCogs(db, row);
  }
  if (table === "purchases") postPurchaseJournal(db, row);
  if (table === "purchase_items") adjustStock(db, row.product_id, row.quantity, row.unit_cost);
  if (table === "expenses") postExpenseJournal(db, row);
  if (table === "customer_payments") {
    applyCustomerPayment(db, row);
    postCustomerPaymentJournal(db, row);
  }
}

/** Applies a customer payment to their oldest unpaid credit sales. */
function applyCustomerPayment(db, payment) {
  let left = r2(payment.amount);
  const sales = db
    .prepare(
      "SELECT * FROM sales WHERE customer_id = ? AND balance_due > 0 ORDER BY created_at ASC",
    )
    .all(payment.customer_id);
  for (const sale of sales) {
    if (left <= 0) break;
    const applied = Math.min(left, r2(sale.balance_due));
    db.prepare("UPDATE sales SET amount_paid = ?, balance_due = ?, status = ? WHERE id = ?").run(
      r2(sale.amount_paid + applied),
      r2(sale.balance_due - applied),
      r2(sale.balance_due - applied) <= 0 ? "completed" : "partial",
      sale.id,
    );
    left = r2(left - applied);
  }
}

function postCustomerPaymentJournal(db, payment) {
  const debitCode = ["bank", "card", "mobile", "mpesa", "transfer"].includes(
    payment.payment_method,
  )
    ? "1010"
    : "1000";
  addEntry(db, {
    date: String(payment.created_at).slice(0, 10),
    reference: payment.payment_number,
    memo: `Customer payment ${payment.payment_number}`,
    sourceType: "customer_payment",
    sourceId: payment.id,
    lines: [
      {
        account: acct(db, debitCode),
        debit: r2(payment.amount),
        credit: 0,
        description: "Payment received on account",
      },
      {
        account: acct(db, "1100"),
        debit: 0,
        credit: r2(payment.amount),
        description: "Accounts receivable settled",
      },
    ],
  });
}


/** Runs before a row is deleted, mirroring the old BEFORE DELETE triggers + FK cascades. */
export function beforeDelete(db, table, row) {
  if (table === "sales") {
    const items = db.prepare("SELECT * FROM sale_items WHERE sale_id = ?").all(row.id);
    for (const item of items) beforeDelete(db, "sale_items", item);
    db.prepare("DELETE FROM sale_items WHERE sale_id = ?").run(row.id);
    deleteJournalBySource(db, row.id);
  }
  if (table === "sale_items") adjustStock(db, row.product_id, row.quantity);
  if (table === "purchases") {
    const items = db.prepare("SELECT * FROM purchase_items WHERE purchase_id = ?").all(row.id);
    for (const item of items) beforeDelete(db, "purchase_items", item);
    db.prepare("DELETE FROM purchase_items WHERE purchase_id = ?").run(row.id);
    deleteJournalBySource(db, row.id);
  }
  if (table === "purchase_items") adjustStock(db, row.product_id, -row.quantity);
  if (table === "expenses") deleteJournalBySource(db, row.id);
}

/** Defaults the old Postgres column DEFAULTs used to supply. */
export function applyDefaults(table, row) {
  const next = { ...row };
  if (!next.id) next.id = newId();
  if (table === "sales" && !next.receipt_number) next.receipt_number = receiptNumber();
  if (table === "purchases" && !next.purchase_number) next.purchase_number = purchaseNumber();
  if (table === "purchases" && !next.purchase_date)
    next.purchase_date = new Date().toISOString().slice(0, 10);
  if (table === "expenses" && !next.expense_date)
    next.expense_date = new Date().toISOString().slice(0, 10);
  if (table === "customer_payments" && !next.payment_number)
    next.payment_number = `PMT-${stamp()}-${pad(Math.floor(Math.random() * 100000), 5)}`;
  return next;
}
