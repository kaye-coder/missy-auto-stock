import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { ExportButtons } from "@/components/ExportButtons";
import type { Account, JournalEntry, JournalLine } from "@/lib/db-types";
import { currency } from "@/lib/format";

export const Route = createFileRoute("/reconciliation")({
  head: () => ({ meta: [{ title: "Reconciliation — Missy" }] }),
  component: ReconciliationPage,
});

type Row = JournalLine & { entry: JournalEntry };

function ReconciliationPage() {
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filter, setFilter] = useState<"all" | "unreconciled" | "reconciled">("unreconciled");
  const [search, setSearch] = useState("");

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", "cash-bank"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts" as never).select("*").eq("type", "asset").order("code");
      if (error) throw error;
      const list = (data ?? []) as unknown as Account[];
      return list.filter(a => ["1000", "1010", "1100", "2000"].includes(a.code) || /cash|bank|payable|receivable/i.test(a.name));
    },
  });

  // set default account
  useMemo(() => {
    if (!accountId && accounts.length > 0) setAccountId(accounts[0].id);
  }, [accountId, accounts]);

  const { data: rows = [] } = useQuery({
    queryKey: ["reconciliation", accountId, from, to],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_lines" as never)
        .select("*, entry:journal_entries(*)")
        .eq("account_id", accountId);
      if (error) throw error;
      let list = (data ?? []) as unknown as Row[];
      if (from) list = list.filter(r => r.entry.entry_date >= from);
      if (to) list = list.filter(r => r.entry.entry_date <= to);
      return list.sort((a, b) => a.entry.entry_date.localeCompare(b.entry.entry_date));
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => {
      if (filter === "unreconciled" && r.reconciled) return false;
      if (filter === "reconciled" && !r.reconciled) return false;
      if (!q) return true;
      return (r.entry.reference + " " + (r.entry.memo ?? "") + " " + (r.description ?? "")).toLowerCase().includes(q);
    });
  }, [rows, filter, search]);

  const toggle = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await supabase.from("journal_lines" as never)
        .update({ reconciled: !row.reconciled, reconciled_at: row.reconciled ? null : new Date().toISOString() } as never)
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reconciliation"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkMark = useMutation({
    mutationFn: async (reconciled: boolean) => {
      const ids = filtered.filter(r => r.reconciled !== reconciled).map(r => r.id);
      if (ids.length === 0) return;
      const { error } = await supabase.from("journal_lines" as never)
        .update({ reconciled, reconciled_at: reconciled ? new Date().toISOString() : null } as never)
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["reconciliation"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalDebit = rows.reduce((s, r) => s + Number(r.debit || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit || 0), 0);
  const bookBalance = totalDebit - totalCredit; // for asset accounts
  const reconciledBalance = rows.filter(r => r.reconciled).reduce((s, r) => s + Number(r.debit || 0) - Number(r.credit || 0), 0);
  const unreconciled = bookBalance - reconciledBalance;
  const acct = accounts.find(a => a.id === accountId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank / Cash Reconciliation"
        description="Match ledger entries to your bank statement or cash count."
        actions={
          <ExportButtons
            filename="reconciliation"
            title={`Reconciliation ${acct ? "— " + acct.name : ""}`}
            columns={[
              { header: "Date", accessor: (r: Row) => r.entry.entry_date },
              { header: "Reference", accessor: (r) => r.entry.reference },
              { header: "Memo", accessor: (r) => r.entry.memo ?? "" },
              { header: "Debit", accessor: (r) => Number(r.debit) },
              { header: "Credit", accessor: (r) => Number(r.credit) },
              { header: "Status", accessor: (r) => (r.reconciled ? "Reconciled" : "Unreconciled") },
            ]}
            rows={filtered}
          />
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Account</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Select account" /></SelectTrigger>
            <SelectContent>
              {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
        <div>
          <Label className="text-xs">Show</Label>
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unreconciled">Unreconciled</SelectItem>
              <SelectItem value="reconciled">Reconciled</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input className="flex-1 min-w-[200px]" placeholder="Search reference, memo…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Book balance</div><div className="text-xl font-bold">{currency(bookBalance)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Reconciled</div><div className="text-xl font-bold text-primary">{currency(reconciledBalance)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Unreconciled</div><div className={`text-xl font-bold ${Math.abs(unreconciled) > 0.5 ? "text-destructive" : ""}`}>{currency(unreconciled)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Entries</div><div className="text-xl font-bold">{rows.length}</div></CardContent></Card>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => bulkMark.mutate(true)}>Mark all shown as reconciled</Button>
        <Button size="sm" variant="outline" onClick={() => bulkMark.mutate(false)}>Unmark all shown</Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Memo / Description</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                {acct ? "No entries match." : "Pick a cash or bank account."}
              </TableCell></TableRow>
            ) : filtered.map(r => (
              <TableRow key={r.id} className={r.reconciled ? "bg-primary/5" : ""}>
                <TableCell>
                  <Checkbox checked={r.reconciled} onCheckedChange={() => toggle.mutate(r)} />
                </TableCell>
                <TableCell className="text-sm">{r.entry.entry_date}</TableCell>
                <TableCell className="font-mono text-xs">{r.entry.reference}</TableCell>
                <TableCell className="text-sm">{r.entry.memo ?? r.description ?? "—"}</TableCell>
                <TableCell className="text-xs capitalize text-muted-foreground">{r.entry.source_type}</TableCell>
                <TableCell className="text-right">{r.debit ? currency(r.debit) : ""}</TableCell>
                <TableCell className="text-right">{r.credit ? currency(r.credit) : ""}</TableCell>
                <TableCell>
                  {r.reconciled
                    ? <Badge variant="secondary" className="text-[10px]">Reconciled</Badge>
                    : <Badge variant="outline" className="text-[10px] text-destructive border-destructive/40">Open</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
