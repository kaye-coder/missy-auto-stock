import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { localDb as supabase } from "@/lib/local-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { currency } from "@/lib/format";
import { Receipt, TrendingUp, Wallet, CreditCard } from "lucide-react";
import type { Product, Sale, SaleItem, Customer } from "@/lib/db-types";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Missy" },
      { name: "description", content: "Sales, payment method, top item and customer credit reports for any date range." },
      { property: "og:title", content: "Reports — Missy" },
      { property: "og:description", content: "Sales, payment method, top item and customer credit reports for any date range." },
    ],
  }),
  component: ReportsPage,
});

type RangeKey = "today" | "week" | "month" | "custom";

const PINK = "text-pink-600";

function toISODate(d: Date) {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
}

function computeRange(key: RangeKey, from: string, to: string) {
  const now = new Date();
  if (key === "custom") return { from, to };
  if (key === "today") return { from: toISODate(now), to: toISODate(now) };
  if (key === "week") {
    const day = (now.getDay() + 6) % 7; // Monday start
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    return { from: toISODate(start), to: toISODate(now) };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: toISODate(start), to: toISODate(now) };
}

const MOBILE_LABELS: Record<string, string> = {
  mtn: "Mobile Money — MTN",
  airtel: "Mobile Money — Airtel",
  orange: "Mobile Money — Orange",
  mobile: "Mobile Money",
  mobile_money: "Mobile Money",
  mpesa: "Mobile Money",
};

function methodLabel(m: string) {
  const key = (m || "cash").toLowerCase();
  if (MOBILE_LABELS[key]) return MOBILE_LABELS[key];
  if (key === "cash") return "Cash";
  if (key === "credit") return "Credit";
  if (key === "bank" || key === "transfer") return "Bank Transfer";
  if (key === "card") return "Card";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function ReportsPage() {
  const today = toISODate(new Date());
  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);

  const range = computeRange(rangeKey, customFrom, customTo);

  const { data: sales = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Sale[];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["sale_items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sale_items" as never).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as SaleItem[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products" as never).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as Product[];
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

  const report = useMemo(() => {
    const start = new Date(`${range.from}T00:00:00`).getTime();
    const end = new Date(`${range.to}T23:59:59.999`).getTime();
    const inRange = sales.filter((s) => {
      const t = new Date(s.created_at).getTime();
      return t >= start && t <= end;
    });
    const ids = new Set(inRange.map((s) => s.id));
    const rangeItems = items.filter((i) => ids.has(i.sale_id));

    const costOf = new Map(products.map((p) => [p.id, Number(p.cost) || 0]));
    const nameCost = new Map(products.map((p) => [p.name, Number(p.cost) || 0]));

    const revenue = inRange.reduce((a, s) => a + Number(s.total || 0), 0);
    const cost = rangeItems.reduce((a, i) => {
      const c = (i.product_id ? costOf.get(i.product_id) : undefined) ?? nameCost.get(i.product_name) ?? 0;
      return a + c * Number(i.quantity || 0);
    }, 0);

    const byMethod = new Map<string, { total: number; count: number }>();
    for (const s of inRange) {
      const label = methodLabel(s.payment_method);
      const prev = byMethod.get(label) ?? { total: 0, count: 0 };
      byMethod.set(label, { total: prev.total + Number(s.total || 0), count: prev.count + 1 });
    }

    const byItem = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const i of rangeItems) {
      const prev = byItem.get(i.product_name) ?? { name: i.product_name, qty: 0, revenue: 0 };
      prev.qty += Number(i.quantity || 0);
      prev.revenue += Number(i.subtotal || 0);
      byItem.set(i.product_name, prev);
    }

    const balances = new Map<string, number>();
    for (const s of sales) {
      const due = Number(s.balance_due || 0);
      if (due <= 0 || !s.customer_id) continue;
      balances.set(s.customer_id, (balances.get(s.customer_id) ?? 0) + due);
    }
    const credit = [...balances.entries()]
      .map(([id, amount]) => ({
        id,
        name: customers.find((c) => c.id === id)?.name ?? "Unknown customer",
        amount,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      revenue,
      profit: revenue - cost,
      transactions: inRange.length,
      methods: [...byMethod.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.total - a.total),
      topItems: [...byItem.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 15),
      credit,
      creditTotal: credit.reduce((a, c) => a + c.amount, 0),
    };
  }, [sales, items, products, customers, range.from, range.to]);

  const rangeButtons: { key: RangeKey; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "custom", label: "Custom Range" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Sales performance, payment mix, best sellers and outstanding credit." />

      <Card className="border-pink-200 bg-white">
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="flex flex-wrap gap-2">
            {rangeButtons.map((b) => (
              <Button
                key={b.key}
                size="sm"
                variant={rangeKey === b.key ? "default" : "outline"}
                className={
                  rangeKey === b.key
                    ? "bg-pink-600 text-white hover:bg-pink-700"
                    : "border-pink-200 text-pink-700 hover:bg-pink-50"
                }
                onClick={() => setRangeKey(b.key)}
              >
                {b.label}
              </Button>
            ))}
          </div>
          {rangeKey === "custom" && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="from" className="text-xs">From</Label>
                <Input id="from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="to" className="text-xs">To</Label>
                <Input id="to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-40" />
              </div>
            </div>
          )}
          <Badge variant="outline" className="ml-auto border-pink-200 text-pink-700">
            {range.from} → {range.to}
          </Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={<Wallet className="h-4 w-4" />} label="Total Revenue" value={currency(report.revenue)} />
        <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="Total Profit" value={currency(report.profit)} />
        <SummaryCard icon={<Receipt className="h-4 w-4" />} label="Transactions" value={String(report.transactions)} />
        <SummaryCard icon={<CreditCard className="h-4 w-4" />} label="Outstanding Credit" value={currency(report.creditTotal)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-pink-200 bg-white">
          <CardHeader>
            <CardTitle className="text-pink-700">Payment Methods</CardTitle>
            <CardDescription>Sales totals grouped by how customers paid.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.methods.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No sales in this range.</TableCell></TableRow>
                )}
                {report.methods.map((m) => (
                  <TableRow key={m.label}>
                    <TableCell className="font-medium">{m.label}</TableCell>
                    <TableCell className="text-right">{m.count}</TableCell>
                    <TableCell className={`text-right font-semibold ${PINK}`}>{currency(m.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-pink-200 bg-white">
          <CardHeader>
            <CardTitle className="text-pink-700">Outstanding Customer Credit</CardTitle>
            <CardDescription>All-time unpaid balances, highest first.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Amount Owed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.credit.length === 0 && (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No outstanding balances.</TableCell></TableRow>
                )}
                {report.credit.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className={`text-right font-semibold ${PINK}`}>{currency(c.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="border-pink-200 bg-white">
        <CardHeader>
          <CardTitle className="text-pink-700">Top-Selling Items</CardTitle>
          <CardDescription>Ranked by revenue for the selected range.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty Sold</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.topItems.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No items sold in this range.</TableCell></TableRow>
              )}
              {report.topItems.map((it, idx) => (
                <TableRow key={it.name}>
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="font-medium">{it.name}</TableCell>
                  <TableCell className="text-right">{it.qty}</TableCell>
                  <TableCell className={`text-right font-semibold ${PINK}`}>{currency(it.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="border-pink-200 bg-white">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span className="text-pink-600">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-pink-700">{value}</div>
      </CardContent>
    </Card>
  );
}
