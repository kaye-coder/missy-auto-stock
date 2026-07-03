import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Pencil, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ExportButtons } from "@/components/ExportButtons";
import type { Expense, Account, Supplier } from "@/lib/db-types";
import { currency } from "@/lib/format";

export const Route = createFileRoute("/expenses")({
  head: () => ({ meta: [{ title: "Expenses — Missy" }] }),
  component: ExpensesPage,
});

interface Form {
  expense_date: string;
  account_id: string;
  category: string;
  description: string;
  amount: string;
  vat_input: string;
  wht: string;
  payment_method: string;
  reference: string;
  supplier_id: string;
}
const today = () => new Date().toISOString().slice(0, 10);
const empty = (): Form => ({
  expense_date: today(), account_id: "", category: "", description: "",
  amount: "", vat_input: "0", wht: "0", payment_method: "cash", reference: "", supplier_id: "",
});

function ExpensesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<Form>(empty());
  const [confirmDel, setConfirmDel] = useState<Expense | null>(null);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses" as never).select("*").order("expense_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Expense[];
    },
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts" as never).select("*").eq("type", "expense").order("code");
      if (error) throw error;
      return (data ?? []) as unknown as Account[];
    },
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers" as never).select("*").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Supplier[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(form.amount) || 0;
      const vat = parseFloat(form.vat_input) || 0;
      const wht = parseFloat(form.wht) || 0;
      if (!form.category.trim()) throw new Error("Category is required");
      if (amt <= 0) throw new Error("Amount must be > 0");
      const payload = {
        expense_date: form.expense_date,
        account_id: form.account_id || null,
        category: form.category.trim(),
        description: form.description.trim() || null,
        amount: amt,
        vat_input: vat,
        wht,
        total: amt + vat,
        payment_method: form.payment_method,
        reference: form.reference.trim() || null,
        supplier_id: form.supplier_id || null,
      };
      if (editing) {
        // delete old entry (trigger reverses journal), reinsert to re-post
        const { error: delErr } = await supabase.from("expenses" as never).delete().eq("id", editing.id);
        if (delErr) throw delErr;
        const { error } = await supabase.from("expenses" as never).insert(payload as never);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("expenses" as never).insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Expense updated" : "Expense recorded and posted");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      setOpen(false); setForm(empty()); setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense deleted");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      setConfirmDel(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (e: Expense) => {
    setEditing(e);
    setForm({
      expense_date: e.expense_date,
      account_id: e.account_id ?? "",
      category: e.category,
      description: e.description ?? "",
      amount: String(e.amount),
      vat_input: String(e.vat_input),
      wht: String(e.wht),
      payment_method: e.payment_method,
      reference: e.reference ?? "",
      supplier_id: e.supplier_id ?? "",
    });
    setOpen(true);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return expenses.filter(e => {
      if (from && e.expense_date < from) return false;
      if (to && e.expense_date > to) return false;
      if (!q) return true;
      return (e.category + " " + (e.description ?? "") + " " + (e.reference ?? "")).toLowerCase().includes(q);
    });
  }, [expenses, search, from, to]);

  const total = useMemo(() => filtered.reduce((s, e) => s + Number(e.total || 0), 0), [filtered]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description={`${filtered.length} of ${expenses.length} entries · ${currency(total)}`}
        actions={
          <>
          <ExportButtons
            filename="expenses"
            title="Expenses"
            columns={[
              { header: "Date", accessor: (e: Expense) => e.expense_date },
              { header: "Category", accessor: (e) => e.category },
              { header: "Description", accessor: (e) => e.description ?? "" },
              { header: "Amount", accessor: (e) => Number(e.amount) },
              { header: "VAT", accessor: (e) => Number(e.vat_input) },
              { header: "WHT", accessor: (e) => Number(e.wht) },
              { header: "Total", accessor: (e) => Number(e.total) },
              { header: "Payment", accessor: (e) => e.payment_method },
              { header: "Reference", accessor: (e) => e.reference ?? "" },
            ]}
            rows={filtered}
          />
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(empty()); setEditing(null); } }}>
            <DialogTrigger asChild><Button onClick={() => { setEditing(null); setForm(empty()); }}><Plus className="h-4 w-4" /> Add expense</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{editing ? "Edit expense" : "New expense"}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Date</Label>
                  <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
                </div>
                <div><Label>Category</Label>
                  <Input placeholder="e.g. Rent, Utilities" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                </div>
                <div className="col-span-2"><Label>Account (COA)</Label>
                  <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select expense account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Amount (excl. VAT)</Label>
                  <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div><Label>VAT input</Label>
                  <Input type="number" value={form.vat_input} onChange={(e) => setForm({ ...form, vat_input: e.target.value })} />
                </div>
                <div><Label>WHT withheld</Label>
                  <Input type="number" value={form.wht} onChange={(e) => setForm({ ...form, wht: e.target.value })} />
                </div>
                <div><Label>Payment</Label>
                  <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank">Bank</SelectItem>
                      <SelectItem value="credit">Credit (Payable)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Supplier (optional)</Label>
                  <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Reference / invoice #</Label>
                  <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
                </div>
                <div className="col-span-2"><Label>Description</Label>
                  <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving..." : "Save & post"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by category, description, ref…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
        {(search || from || to) && <Button variant="ghost" onClick={() => { setSearch(""); setFrom(""); setTo(""); }}>Clear</Button>}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Ref</TableHead>
              <TableHead>Pay</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">VAT</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">No matching expenses.</TableCell></TableRow>
            ) : filtered.map(e => (
              <TableRow key={e.id}>
                <TableCell className="text-sm">{e.expense_date}</TableCell>
                <TableCell className="font-medium">{e.category}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.description ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.reference ?? "—"}</TableCell>
                <TableCell className="text-sm capitalize">{e.payment_method}</TableCell>
                <TableCell className="text-right">{currency(e.amount)}</TableCell>
                <TableCell className="text-right">{currency(e.vat_input)}</TableCell>
                <TableCell className="text-right font-medium">{currency(e.total)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(e)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setConfirmDel(e)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>Journal entries will be reversed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDel && del.mutate(confirmDel.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
