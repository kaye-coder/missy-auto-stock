import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Eye, Search } from "lucide-react";
import { currency, dateTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { ExportButtons } from "@/components/ExportButtons";
import type { Sale, SaleItem, Customer } from "@/lib/db-types";

export const Route = createFileRoute("/sales")({
  head: () => ({ meta: [{ title: "Sales History — Missy" }] }),
  component: SalesPage,
});

function SalesPage() {
  const [viewing, setViewing] = useState<Sale | null>(null);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: sales = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Sale[];
    },
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers" as never).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as Customer[];
    },
  });
  const { data: items = [] } = useQuery({
    queryKey: ["sale_items", viewing?.id],
    enabled: !!viewing,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items" as never)
        .select("*")
        .eq("sale_id", viewing!.id);
      if (error) throw error;
      return (data ?? []) as unknown as SaleItem[];
    },
  });

  const customerName = (id: string | null) =>
    id ? customers.find((c) => c.id === id)?.name ?? "—" : "Walk-in";

  const filteredSales = useMemo(() => {
    const q = search.toLowerCase();
    return sales.filter((s) => {
      const d = s.created_at.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (!q) return true;
      return (s.receipt_number + " " + customerName(s.customer_id) + " " + s.payment_method).toLowerCase().includes(q);
    });
  }, [sales, search, from, to, customers]);

  const totalRevenue = filteredSales.reduce((s, x) => s + Number(x.total), 0);
  const totalPaid = filteredSales.reduce((s, x) => s + Number(x.amount_paid ?? 0), 0);
  const totalBalanceDue = filteredSales.reduce((s, x) => s + Number(x.balance_due ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales History"
        description={`${filteredSales.length} of ${sales.length} transactions · ${currency(totalRevenue)}`}
        actions={
          <ExportButtons
            filename="sales"
            title="Sales History"
            columns={[
              { header: "Receipt", accessor: (s: Sale) => s.receipt_number },
              { header: "Date", accessor: (s) => new Date(s.created_at).toLocaleString() },
              { header: "Customer", accessor: (s) => customers.find(c => c.id === s.customer_id)?.name ?? "Walk-in" },
              { header: "Payment", accessor: (s) => s.payment_method },
              { header: "Subtotal", accessor: (s) => Number(s.subtotal) },
              { header: "Discount", accessor: (s) => Number(s.discount) },
              { header: "Tax", accessor: (s) => Number(s.tax) },
              { header: "Total", accessor: (s) => Number(s.total) },
              { header: "Paid", accessor: (s) => Number(s.amount_paid ?? 0) },
              { header: "Balance due", accessor: (s) => Number(s.balance_due ?? 0) },
              { header: "Status", accessor: (s) => s.status },
            ]}
            rows={filteredSales}
          />
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search receipt, customer, payment…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
        {(search || from || to) && <Button variant="ghost" onClick={() => { setSearch(""); setFrom(""); setTo(""); }}>Clear</Button>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Transactions</p>
          <p className="mt-1 text-lg font-bold">{filteredSales.length}</p>
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total sales</p>
          <p className="mt-1 text-lg font-bold text-primary">{currency(totalRevenue)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total paid</p>
          <p className="mt-1 text-lg font-bold">{currency(totalPaid)}</p>
        </div>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Balance due</p>
          <p className="mt-1 text-lg font-bold text-destructive">{currency(totalBalanceDue)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Receipt</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSales.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">No matching sales.</TableCell></TableRow>
            ) : filteredSales.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-xs">{s.receipt_number}</TableCell>
                <TableCell className="text-sm">{dateTime(s.created_at)}</TableCell>
                <TableCell>{customerName(s.customer_id)}</TableCell>
                <TableCell><Badge variant="secondary" className="text-[10px] uppercase">{s.payment_method}</Badge></TableCell>
                <TableCell className="text-right font-semibold">{currency(s.total)}</TableCell>
                <TableCell className="text-right">{currency(s.amount_paid ?? 0)}</TableCell>
                <TableCell className={`text-right ${Number(s.balance_due ?? 0) > 0 ? "font-semibold text-destructive" : ""}`}>{currency(s.balance_due ?? 0)}</TableCell>
                <TableCell><Badge variant={s.status === "completed" ? "default" : s.status === "credit" ? "destructive" : "outline"} className="text-[10px] uppercase">{s.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setViewing(s)}>
                    <Eye className="h-4 w-4" /> View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {filteredSales.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="text-right font-semibold">Totals</TableCell>
                <TableCell className="text-right font-bold">{currency(totalRevenue)}</TableCell>
                <TableCell className="text-right font-bold">{currency(totalPaid)}</TableCell>
                <TableCell className="text-right font-bold text-destructive">{currency(totalBalanceDue)}</TableCell>
                <TableCell colSpan={3} />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Receipt {viewing?.receipt_number}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Date:</span> {dateTime(viewing.created_at)}</div>
                <div><span className="text-muted-foreground">Customer:</span> {customerName(viewing.customer_id)}</div>
                <div><span className="text-muted-foreground">Payment:</span> {viewing.payment_method}</div>
                <div><span className="text-muted-foreground">Status:</span> {viewing.status}</div>
              </div>
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="text-sm">{i.product_name}</TableCell>
                        <TableCell className="text-right text-sm">{i.quantity}</TableCell>
                        <TableCell className="text-right text-sm">{currency(i.unit_price)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{currency(i.subtotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{currency(viewing.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>−{currency(viewing.discount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{currency(viewing.tax)}</span></div>
                <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><span>Total</span><span>{currency(viewing.total)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Amount paid</span><span>{currency(viewing.amount_paid ?? 0)}</span></div>
                {Number(viewing.balance_due ?? 0) > 0 && (
                  <div className="flex justify-between font-semibold text-destructive"><span>Balance due</span><span>{currency(viewing.balance_due)}</span></div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
