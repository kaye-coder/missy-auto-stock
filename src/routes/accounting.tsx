import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Download } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import type { Account, AccountType, JournalEntry, JournalLine } from "@/lib/db-types";
import { currency } from "@/lib/format";

export const Route = createFileRoute("/accounting")({
  head: () => ({ meta: [{ title: "Accounting — Missy" }] }),
  component: AccountingPage,
});

const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);

function AccountingPage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounting"
        description="EFRIS / URA-ready ledger, P&L, balance sheet, chart of accounts"
        actions={
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
          </div>
        }
      />

      <Tabs defaultValue="pnl">
        <TabsList>
          <TabsTrigger value="pnl">Profit &amp; Loss</TabsTrigger>
          <TabsTrigger value="balance">Balance Sheet</TabsTrigger>
          <TabsTrigger value="ledger">General Ledger</TabsTrigger>
          <TabsTrigger value="coa">Chart of Accounts</TabsTrigger>
          <TabsTrigger value="efris">EFRIS / URA Export</TabsTrigger>
        </TabsList>
        <TabsContent value="pnl"><ProfitLoss from={from} to={to} /></TabsContent>
        <TabsContent value="balance"><BalanceSheet asOf={to} /></TabsContent>
        <TabsContent value="ledger"><GeneralLedger from={from} to={to} /></TabsContent>
        <TabsContent value="coa"><ChartOfAccounts /></TabsContent>
        <TabsContent value="efris"><EfrisExport from={from} to={to} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Shared queries ---------------- */
function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts" as never).select("*").order("code");
      if (error) throw error;
      return (data ?? []) as unknown as Account[];
    },
  });
}
function useJournal(from?: string, to?: string) {
  return useQuery({
    queryKey: ["journal", from, to],
    queryFn: async () => {
      let q = supabase.from("journal_entries" as never).select("*, journal_lines(*)").order("entry_date");
      if (from) q = q.gte("entry_date", from);
      if (to) q = q.lte("entry_date", to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as (JournalEntry & { journal_lines: JournalLine[] })[];
    },
  });
}

function totalsByAccount(entries: (JournalEntry & { journal_lines: JournalLine[] })[]) {
  const map = new Map<string, { debit: number; credit: number }>();
  for (const e of entries) for (const l of e.journal_lines) {
    const cur = map.get(l.account_id) ?? { debit: 0, credit: 0 };
    cur.debit += Number(l.debit || 0); cur.credit += Number(l.credit || 0);
    map.set(l.account_id, cur);
  }
  return map;
}
const balanceFor = (type: AccountType, d: number, c: number) =>
  type === "asset" || type === "expense" ? d - c : c - d;

function exportCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ---------------- Profit & Loss ---------------- */
function ProfitLoss({ from, to }: { from: string; to: string }) {
  const { data: accounts = [] } = useAccounts();
  const { data: entries = [] } = useJournal(from, to);
  const tots = useMemo(() => totalsByAccount(entries), [entries]);

  const income = accounts.filter(a => a.type === "income");
  const expenses = accounts.filter(a => a.type === "expense");

  const incomeTotal = income.reduce((s, a) => s + balanceFor("income", tots.get(a.id)?.debit ?? 0, tots.get(a.id)?.credit ?? 0), 0);
  const expenseTotal = expenses.reduce((s, a) => s + balanceFor("expense", tots.get(a.id)?.debit ?? 0, tots.get(a.id)?.credit ?? 0), 0);
  const netProfit = incomeTotal - expenseTotal;

  const download = () => {
    const rows: (string | number)[][] = [
      ["Profit & Loss", `${from} to ${to}`], [""],
      ["Code", "Account", "Amount"], ["", "INCOME", ""],
    ];
    income.forEach(a => rows.push([a.code, a.name, balanceFor("income", tots.get(a.id)?.debit ?? 0, tots.get(a.id)?.credit ?? 0)]));
    rows.push(["", "Total Income", incomeTotal], [""], ["", "EXPENSES", ""]);
    expenses.forEach(a => rows.push([a.code, a.name, balanceFor("expense", tots.get(a.id)?.debit ?? 0, tots.get(a.id)?.credit ?? 0)]));
    rows.push(["", "Total Expenses", expenseTotal], [""], ["", "Net Profit", netProfit]);
    exportCSV(`pnl_${from}_${to}.csv`, rows);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Profit &amp; Loss · {from} → {to}</CardTitle>
        <Button variant="outline" size="sm" onClick={download}><Download className="h-4 w-4" /> Export</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow><TableCell colSpan={3} className="font-semibold bg-muted/40">Income</TableCell></TableRow>
            {income.map(a => {
              const t = tots.get(a.id); const bal = balanceFor("income", t?.debit ?? 0, t?.credit ?? 0);
              return (<TableRow key={a.id}><TableCell className="font-mono text-xs">{a.code}</TableCell><TableCell>{a.name}</TableCell><TableCell className="text-right">{currency(bal)}</TableCell></TableRow>);
            })}
            <TableRow><TableCell /><TableCell className="font-semibold">Total Income</TableCell><TableCell className="text-right font-semibold">{currency(incomeTotal)}</TableCell></TableRow>

            <TableRow><TableCell colSpan={3} className="font-semibold bg-muted/40 pt-4">Expenses</TableCell></TableRow>
            {expenses.map(a => {
              const t = tots.get(a.id); const bal = balanceFor("expense", t?.debit ?? 0, t?.credit ?? 0);
              return (<TableRow key={a.id}><TableCell className="font-mono text-xs">{a.code}</TableCell><TableCell>{a.name}</TableCell><TableCell className="text-right">{currency(bal)}</TableCell></TableRow>);
            })}
            <TableRow><TableCell /><TableCell className="font-semibold">Total Expenses</TableCell><TableCell className="text-right font-semibold">{currency(expenseTotal)}</TableCell></TableRow>

            <TableRow className="bg-primary/5"><TableCell /><TableCell className="text-lg font-bold">Net Profit / (Loss)</TableCell><TableCell className={`text-right text-lg font-bold ${netProfit < 0 ? "text-destructive" : ""}`}>{currency(netProfit)}</TableCell></TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ---------------- Balance Sheet ---------------- */
function BalanceSheet({ asOf }: { asOf: string }) {
  const { data: accounts = [] } = useAccounts();
  const { data: entries = [] } = useJournal(undefined, asOf);
  const { data: pnlEntries = [] } = useJournal(undefined, asOf);
  const tots = useMemo(() => totalsByAccount(entries), [entries]);

  const assets = accounts.filter(a => a.type === "asset");
  const liabilities = accounts.filter(a => a.type === "liability");
  const equity = accounts.filter(a => a.type === "equity");
  const income = accounts.filter(a => a.type === "income");
  const expensesAcc = accounts.filter(a => a.type === "expense");

  const totalAssets = assets.reduce((s, a) => s + balanceFor("asset", tots.get(a.id)?.debit ?? 0, tots.get(a.id)?.credit ?? 0), 0);
  const totalLiab = liabilities.reduce((s, a) => s + balanceFor("liability", tots.get(a.id)?.debit ?? 0, tots.get(a.id)?.credit ?? 0), 0);
  const totalEquity = equity.reduce((s, a) => s + balanceFor("equity", tots.get(a.id)?.debit ?? 0, tots.get(a.id)?.credit ?? 0), 0);
  const pnlTots = useMemo(() => totalsByAccount(pnlEntries), [pnlEntries]);
  const currentEarnings =
    income.reduce((s, a) => s + balanceFor("income", pnlTots.get(a.id)?.debit ?? 0, pnlTots.get(a.id)?.credit ?? 0), 0) -
    expensesAcc.reduce((s, a) => s + balanceFor("expense", pnlTots.get(a.id)?.debit ?? 0, pnlTots.get(a.id)?.credit ?? 0), 0);
  const totalEquityWithEarnings = totalEquity + currentEarnings;

  const download = () => {
    const rows: (string | number)[][] = [["Balance Sheet", `As of ${asOf}`], [""], ["Code", "Account", "Amount"], ["", "ASSETS", ""]];
    assets.forEach(a => rows.push([a.code, a.name, balanceFor("asset", tots.get(a.id)?.debit ?? 0, tots.get(a.id)?.credit ?? 0)]));
    rows.push(["", "Total Assets", totalAssets], [""], ["", "LIABILITIES", ""]);
    liabilities.forEach(a => rows.push([a.code, a.name, balanceFor("liability", tots.get(a.id)?.debit ?? 0, tots.get(a.id)?.credit ?? 0)]));
    rows.push(["", "Total Liabilities", totalLiab], [""], ["", "EQUITY", ""]);
    equity.forEach(a => rows.push([a.code, a.name, balanceFor("equity", tots.get(a.id)?.debit ?? 0, tots.get(a.id)?.credit ?? 0)]));
    rows.push(["", "Current Period Earnings", currentEarnings], ["", "Total Equity", totalEquityWithEarnings]);
    rows.push([""], ["", "Total Liabilities + Equity", totalLiab + totalEquityWithEarnings]);
    exportCSV(`balance_sheet_${asOf}.csv`, rows);
  };

  const renderGroup = (label: string, list: Account[], type: AccountType) => (
    <>
      <TableRow><TableCell colSpan={3} className="font-semibold bg-muted/40">{label}</TableCell></TableRow>
      {list.map(a => {
        const t = tots.get(a.id); const bal = balanceFor(type, t?.debit ?? 0, t?.credit ?? 0);
        return (<TableRow key={a.id}><TableCell className="font-mono text-xs">{a.code}</TableCell><TableCell>{a.name}</TableCell><TableCell className="text-right">{currency(bal)}</TableCell></TableRow>);
      })}
    </>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Balance Sheet · as of {asOf}</CardTitle>
        <Button variant="outline" size="sm" onClick={download}><Download className="h-4 w-4" /> Export</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            {renderGroup("Assets", assets, "asset")}
            <TableRow><TableCell /><TableCell className="font-semibold">Total Assets</TableCell><TableCell className="text-right font-semibold">{currency(totalAssets)}</TableCell></TableRow>

            {renderGroup("Liabilities", liabilities, "liability")}
            <TableRow><TableCell /><TableCell className="font-semibold">Total Liabilities</TableCell><TableCell className="text-right font-semibold">{currency(totalLiab)}</TableCell></TableRow>

            {renderGroup("Equity", equity, "equity")}
            <TableRow><TableCell /><TableCell>Current Period Earnings</TableCell><TableCell className="text-right">{currency(currentEarnings)}</TableCell></TableRow>
            <TableRow><TableCell /><TableCell className="font-semibold">Total Equity</TableCell><TableCell className="text-right font-semibold">{currency(totalEquityWithEarnings)}</TableCell></TableRow>

            <TableRow className="bg-primary/5">
              <TableCell /><TableCell className="text-lg font-bold">Liabilities + Equity</TableCell>
              <TableCell className="text-right text-lg font-bold">{currency(totalLiab + totalEquityWithEarnings)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        {Math.abs(totalAssets - (totalLiab + totalEquityWithEarnings)) > 1 && (
          <p className="mt-3 text-xs text-destructive">Warning: Assets don't equal Liabilities + Equity (diff {currency(totalAssets - (totalLiab + totalEquityWithEarnings))}).</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- General Ledger ---------------- */
function GeneralLedger({ from, to }: { from: string; to: string }) {
  const { data: accounts = [] } = useAccounts();
  const { data: entries = [] } = useJournal(from, to);
  const [accountId, setAccountId] = useState<string>("all");

  const rows = useMemo(() => {
    const out: { date: string; ref: string; memo: string; account: string; debit: number; credit: number }[] = [];
    for (const e of entries) for (const l of e.journal_lines) {
      if (accountId !== "all" && l.account_id !== accountId) continue;
      const acc = accounts.find(a => a.id === l.account_id);
      out.push({
        date: e.entry_date, ref: e.reference, memo: e.memo ?? "",
        account: acc ? `${acc.code} — ${acc.name}` : "?",
        debit: Number(l.debit || 0), credit: Number(l.credit || 0),
      });
    }
    return out;
  }, [entries, accounts, accountId]);

  const totalD = rows.reduce((s, r) => s + r.debit, 0);
  const totalC = rows.reduce((s, r) => s + r.credit, 0);

  const download = () => {
    const data: (string | number)[][] = [["Date", "Reference", "Memo", "Account", "Debit", "Credit"]];
    rows.forEach(r => data.push([r.date, r.ref, r.memo, r.account, r.debit, r.credit]));
    data.push(["", "", "", "Totals", totalD, totalC]);
    exportCSV(`ledger_${from}_${to}.csv`, data);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>General Ledger</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={download}><Download className="h-4 w-4" /> Export</Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Ref</TableHead><TableHead>Memo</TableHead>
            <TableHead>Account</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No journal entries in this period.</TableCell></TableRow>
            ) : rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="text-sm">{r.date}</TableCell>
                <TableCell className="font-mono text-xs">{r.ref}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.memo}</TableCell>
                <TableCell className="text-sm">{r.account}</TableCell>
                <TableCell className="text-right">{r.debit ? currency(r.debit) : ""}</TableCell>
                <TableCell className="text-right">{r.credit ? currency(r.credit) : ""}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/40">
              <TableCell colSpan={4} className="font-semibold text-right">Totals</TableCell>
              <TableCell className="text-right font-semibold">{currency(totalD)}</TableCell>
              <TableCell className="text-right font-semibold">{currency(totalC)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ---------------- Chart of Accounts ---------------- */
function ChartOfAccounts() {
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ code: string; name: string; type: AccountType; efris_tax_code: string; description: string }>({
    code: "", name: "", type: "expense", efris_tax_code: "", description: "",
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.code.trim() || !form.name.trim()) throw new Error("Code and name required");
      const { error } = await supabase.from("accounts" as never).insert({
        code: form.code.trim(), name: form.name.trim(), type: form.type,
        efris_tax_code: form.efris_tax_code.trim() || null,
        description: form.description.trim() || null, is_system: false,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Account added"); qc.invalidateQueries({ queryKey: ["accounts"] }); setOpen(false); setForm({ code: "", name: "", type: "expense", efris_tax_code: "", description: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped: Record<AccountType, Account[]> = { asset: [], liability: [], equity: [], income: [], expense: [] };
  accounts.forEach(a => grouped[a.type].push(a));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Chart of Accounts</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" /> Add account</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New account</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
                <div><Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as AccountType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asset">Asset</SelectItem>
                      <SelectItem value="liability">Liability</SelectItem>
                      <SelectItem value="equity">Equity</SelectItem>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>EFRIS tax code (optional)</Label><Input value={form.efris_tax_code} onChange={(e) => setForm({ ...form, efris_tax_code: e.target.value })} /></div>
              <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => add.mutate()} disabled={add.isPending}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead>
            <TableHead>EFRIS</TableHead><TableHead>System</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(["asset", "liability", "equity", "income", "expense"] as AccountType[]).map(t => (
              <TableRow key={`grp-${t}`}>
                <TableCell colSpan={5} className="font-semibold uppercase bg-muted/40">{t}</TableCell>
              </TableRow>
            )).flatMap((header, idx) => {
              const t = (["asset", "liability", "equity", "income", "expense"] as AccountType[])[idx];
              return [header, ...grouped[t].map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.code}</TableCell>
                  <TableCell>{a.name}</TableCell>
                  <TableCell className="text-sm capitalize">{a.type}</TableCell>
                  <TableCell className="text-sm">{a.efris_tax_code ?? "—"}</TableCell>
                  <TableCell className="text-sm">{a.is_system ? "Yes" : "No"}</TableCell>
                </TableRow>
              ))];
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ---------------- EFRIS / URA Export bundle ---------------- */
interface SaleRow { id: string; receipt_number: string; created_at: string; subtotal: number; tax: number; discount: number; total: number; payment_method: string; customer_id: string | null; }
interface SaleItemRow { sale_id: string; product_name: string; quantity: number; unit_price: number; subtotal: number; }
interface PurchaseRow { id: string; purchase_number: string; purchase_date: string; supplier_id: string | null; supplier_invoice: string | null; subtotal: number; vat_input: number; wht: number; total: number; payment_method: string; }
interface ExpenseRow { id: string; expense_date: string; category: string; description: string | null; reference: string | null; amount: number; vat_input: number; wht: number; total: number; payment_method: string; supplier_id: string | null; }
interface CustomerRow { id: string; name: string; tin_number?: string | null; }
interface SupplierRow { id: string; name: string; tin_number: string | null; }

function EfrisExport({ from, to }: { from: string; to: string }) {
  const { data: sales = [] } = useQuery({
    queryKey: ["efris-sales", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales" as never).select("*")
        .gte("created_at", `${from}T00:00:00`).lte("created_at", `${to}T23:59:59`)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as SaleRow[];
    },
  });
  const { data: saleItems = [] } = useQuery({
    queryKey: ["efris-sale-items", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.from("sale_items" as never).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as SaleItemRow[];
    },
  });
  const { data: purchases = [] } = useQuery({
    queryKey: ["efris-purchases", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchases" as never).select("*")
        .gte("purchase_date", from).lte("purchase_date", to).order("purchase_date");
      if (error) throw error;
      return (data ?? []) as unknown as PurchaseRow[];
    },
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ["efris-expenses", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses" as never).select("*")
        .gte("expense_date", from).lte("expense_date", to).order("expense_date");
      if (error) throw error;
      return (data ?? []) as unknown as ExpenseRow[];
    },
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["efris-customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers" as never).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as CustomerRow[];
    },
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["efris-suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers" as never).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as SupplierRow[];
    },
  });

  const customerLookup = (id: string | null) => id ? customers.find(c => c.id === id) : null;
  const supplierLookup = (id: string | null) => id ? suppliers.find(s => s.id === id) : null;

  const salesTotal = useMemo(() => sales.reduce((s, x) => ({
    taxable: s.taxable + Number(x.subtotal) - Number(x.discount),
    vat: s.vat + Number(x.tax),
    total: s.total + Number(x.total),
  }), { taxable: 0, vat: 0, total: 0 }), [sales]);

  const purchasesTotal = useMemo(() => purchases.reduce((s, x) => ({
    taxable: s.taxable + Number(x.subtotal),
    vat: s.vat + Number(x.vat_input),
    wht: s.wht + Number(x.wht),
    total: s.total + Number(x.total),
  }), { taxable: 0, vat: 0, wht: 0, total: 0 }), [purchases]);

  const expensesTotal = useMemo(() => expenses.reduce((s, x) => ({
    taxable: s.taxable + Number(x.amount),
    vat: s.vat + Number(x.vat_input),
    wht: s.wht + Number(x.wht),
    total: s.total + Number(x.total),
  }), { taxable: 0, vat: 0, wht: 0, total: 0 }), [expenses]);

  const netVAT = salesTotal.vat - purchasesTotal.vat - expensesTotal.vat;
  const totalWHT = purchasesTotal.wht + expensesTotal.wht;

  const exportSales = () => {
    const rows: (string | number)[][] = [[
      "Invoice No", "Invoice Date", "Customer Name", "Customer TIN", "Item Description", "Qty",
      "Unit Price (UGX)", "Line Total (UGX)", "Taxable Amount (UGX)", "VAT (UGX)", "Total (UGX)", "Payment Method",
    ]];
    for (const s of sales) {
      const cust = customerLookup(s.customer_id);
      const lines = saleItems.filter(i => i.sale_id === s.id);
      const net = Number(s.subtotal) - Number(s.discount);
      const vatRatio = net > 0 ? Number(s.tax) / net : 0;
      for (const l of lines) {
        const taxable = Number(l.subtotal);
        const vat = taxable * vatRatio;
        rows.push([
          s.receipt_number, s.created_at.slice(0, 10), cust?.name ?? "Walk-in", cust?.tin_number ?? "",
          l.product_name, l.quantity, l.unit_price, l.subtotal, taxable.toFixed(2), vat.toFixed(2),
          (taxable + vat).toFixed(2), s.payment_method,
        ]);
      }
    }
    exportCSV(`EFRIS_Sales_${from}_${to}.csv`, rows);
  };

  const exportPurchases = () => {
    const rows: (string | number)[][] = [[
      "Purchase No", "Purchase Date", "Supplier Name", "Supplier TIN", "Supplier Invoice",
      "Taxable Amount (UGX)", "VAT Input (UGX)", "WHT (UGX)", "Total (UGX)", "Payment Method",
    ]];
    for (const p of purchases) {
      const sup = supplierLookup(p.supplier_id);
      rows.push([
        p.purchase_number, p.purchase_date, sup?.name ?? "", sup?.tin_number ?? "",
        p.supplier_invoice ?? "", p.subtotal, p.vat_input, p.wht, p.total, p.payment_method,
      ]);
    }
    exportCSV(`EFRIS_Purchases_${from}_${to}.csv`, rows);
  };

  const exportExpenses = () => {
    const rows: (string | number)[][] = [[
      "Date", "Reference", "Category", "Description", "Supplier", "Supplier TIN",
      "Amount (UGX)", "VAT Input (UGX)", "WHT (UGX)", "Total (UGX)", "Payment Method",
    ]];
    for (const e of expenses) {
      const sup = supplierLookup(e.supplier_id);
      rows.push([
        e.expense_date, e.reference ?? "", e.category, e.description ?? "",
        sup?.name ?? "", sup?.tin_number ?? "",
        e.amount, e.vat_input, e.wht, e.total, e.payment_method,
      ]);
    }
    exportCSV(`EFRIS_Expenses_${from}_${to}.csv`, rows);
  };

  const exportVAT = () => {
    const rows: (string | number)[][] = [
      ["VAT Return Summary", `${from} to ${to}`], [""],
      ["Section", "Taxable Amount (UGX)", "VAT (UGX)"],
      ["Output VAT (Sales)", salesTotal.taxable.toFixed(2), salesTotal.vat.toFixed(2)],
      ["Input VAT (Purchases)", purchasesTotal.taxable.toFixed(2), purchasesTotal.vat.toFixed(2)],
      ["Input VAT (Expenses)", expensesTotal.taxable.toFixed(2), expensesTotal.vat.toFixed(2)],
      [""],
      ["Net VAT Payable / (Refundable)", "", netVAT.toFixed(2)],
    ];
    exportCSV(`EFRIS_VAT_Summary_${from}_${to}.csv`, rows);
  };

  const exportWHT = () => {
    const rows: (string | number)[][] = [[
      "Date", "Source", "Reference", "Supplier", "Supplier TIN", "Base Amount (UGX)", "WHT (UGX)",
    ]];
    for (const p of purchases.filter(x => Number(x.wht) > 0)) {
      const sup = supplierLookup(p.supplier_id);
      rows.push([p.purchase_date, "Purchase", p.purchase_number, sup?.name ?? "", sup?.tin_number ?? "", p.subtotal, p.wht]);
    }
    for (const e of expenses.filter(x => Number(x.wht) > 0)) {
      const sup = supplierLookup(e.supplier_id);
      rows.push([e.expense_date, "Expense", e.reference ?? "", sup?.name ?? "", sup?.tin_number ?? "", e.amount, e.wht]);
    }
    rows.push(["", "", "", "", "TOTAL WHT", "", totalWHT.toFixed(2)]);
    exportCSV(`EFRIS_WHT_Summary_${from}_${to}.csv`, rows);
  };

  const exportAll = () => { exportSales(); exportPurchases(); exportExpenses(); exportVAT(); exportWHT(); };

  return (
    <Card>
      <CardHeader><CardTitle>EFRIS / URA Audit Export · {from} → {to}</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Sales (Output VAT)</div>
            <div className="text-lg font-bold">{currency(salesTotal.total)}</div>
            <div className="text-xs text-muted-foreground mt-1">VAT: {currency(salesTotal.vat)}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Purchases + Expenses (Input VAT)</div>
            <div className="text-lg font-bold">{currency(purchasesTotal.total + expensesTotal.total)}</div>
            <div className="text-xs text-muted-foreground mt-1">VAT: {currency(purchasesTotal.vat + expensesTotal.vat)}</div>
          </div>
          <div className="rounded-lg border p-4 bg-primary/5">
            <div className="text-xs text-muted-foreground">Net VAT payable</div>
            <div className={`text-lg font-bold ${netVAT < 0 ? "text-primary" : ""}`}>{currency(netVAT)}</div>
            <div className="text-xs text-muted-foreground mt-1">WHT total: {currency(totalWHT)}</div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Each CSV is formatted with the columns required by URA e-invoicing / EFRIS audit review:
            invoice number, date, party name &amp; TIN, taxable amount, VAT, and total. Keep these with your
            filed VAT return for the same period.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportSales} variant="outline"><Download className="h-4 w-4" /> Sales CSV ({sales.length})</Button>
            <Button onClick={exportPurchases} variant="outline"><Download className="h-4 w-4" /> Purchases CSV ({purchases.length})</Button>
            <Button onClick={exportExpenses} variant="outline"><Download className="h-4 w-4" /> Expenses CSV ({expenses.length})</Button>
            <Button onClick={exportVAT} variant="outline"><Download className="h-4 w-4" /> VAT Summary</Button>
            <Button onClick={exportWHT} variant="outline"><Download className="h-4 w-4" /> WHT Summary</Button>
            <Button onClick={exportAll}><Download className="h-4 w-4" /> Download all</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
