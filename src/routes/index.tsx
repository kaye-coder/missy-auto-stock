import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Package,
  DollarSign,
  ShoppingCart,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Crown,
  Users,
  Wallet,
  Flame,
  XCircle,
} from "lucide-react";
import { currency, dateTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import type { Product, Sale, SaleItem, Customer } from "@/lib/db-types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Missy POS" },
      { name: "description", content: "Overview of sales, inventory and shop activity." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products" as never).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as Product[];
    },
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Sale[];
    },
  });

  const { data: saleItems = [] } = useQuery({
    queryKey: ["sale_items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sale_items" as never).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as SaleItem[];
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

  // Sales aggregates
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date().toDateString();
  const todaySales = sales.filter((s) => new Date(s.created_at).toDateString() === today);
  const weekSales = sales.filter((s) => now - new Date(s.created_at).getTime() <= 7 * dayMs);
  const monthSales = sales.filter((s) => now - new Date(s.created_at).getTime() <= 30 * dayMs);

  const sum = (arr: Sale[]) => arr.reduce((s, x) => s + Number(x.total), 0);
  const totalRevenue = sum(sales);
  const todayRevenue = sum(todaySales);
  const weekRevenue = sum(weekSales);
  const monthRevenue = sum(monthSales);
  const totalBalanceDue = sales.reduce((s, x) => s + Number(x.balance_due ?? 0), 0);
  const salesOnCredit = sales.filter((s) => Number(s.balance_due ?? 0) > 0).length;

  // Estimated profit (price - cost) per sold unit
  const productById = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products],
  );
  const estimatedProfit = saleItems.reduce((s, it) => {
    const p = it.product_id ? productById[it.product_id] : undefined;
    const cost = p ? Number(p.cost) : 0;
    return s + (Number(it.unit_price) - cost) * it.quantity;
  }, 0);
  const margin = totalRevenue > 0 ? (estimatedProfit / totalRevenue) * 100 : 0;

  // Stock warnings
  const outOfStock = products.filter((p) => p.stock <= 0);
  const lowStock = products
    .filter((p) => p.stock > 0 && p.stock <= p.low_stock_threshold)
    .sort((a, b) => a.stock - b.stock);
  const inventoryValue = products.reduce((s, p) => s + Number(p.price) * p.stock, 0);

  // Top selling items by quantity
  type Agg = { id: string; name: string; qty: number; revenue: number };
  const topSelling: Agg[] = useMemo(() => {
    const map = new Map<string, Agg>();
    for (const it of saleItems) {
      const key = it.product_id ?? it.product_name;
      const prev = map.get(key) ?? { id: key, name: it.product_name, qty: 0, revenue: 0 };
      prev.qty += it.quantity;
      prev.revenue += Number(it.subtotal);
      map.set(key, prev);
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [saleItems]);
  const topQty = topSelling[0]?.qty ?? 0;
  const bestSeller = topSelling[0];

  // Top customers
  const customerById = useMemo(
    () => Object.fromEntries(customers.map((c) => [c.id, c])),
    [customers],
  );
  const topCustomers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; spent: number; orders: number }>();
    for (const s of sales) {
      if (!s.customer_id) continue;
      const c = customerById[s.customer_id];
      if (!c) continue;
      const prev = map.get(s.customer_id) ?? { id: s.customer_id, name: c.name, spent: 0, orders: 0 };
      prev.spent += Number(s.total);
      prev.orders += 1;
      map.set(s.customer_id, prev);
    }
    return [...map.values()].sort((a, b) => b.spent - a.spent).slice(0, 5);
  }, [sales, customerById]);

  // Payment method breakdown (this month)
  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of monthSales) {
      map.set(s.payment_method, (map.get(s.payment_method) ?? 0) + Number(s.total));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthSales]);

  const stats = [
    {
      label: "Today",
      value: currency(todayRevenue),
      sub: `${todaySales.length} sales`,
      icon: TrendingUp,
      accent: "from-primary to-primary-glow",
    },
    {
      label: "This Week",
      value: currency(weekRevenue),
      sub: `${weekSales.length} sales`,
      icon: DollarSign,
      accent: "from-accent to-warning",
    },
    {
      label: "This Month",
      value: currency(monthRevenue),
      sub: `${monthSales.length} sales`,
      icon: Wallet,
      accent: "from-primary to-primary-glow",
    },
    {
      label: "Est. Profit",
      value: currency(estimatedProfit),
      sub: `${margin.toFixed(1)}% margin`,
      icon: Crown,
      accent: "from-accent to-warning",
    },
    {
      label: "Inventory Value",
      value: currency(inventoryValue),
      sub: `${products.length} SKUs`,
      icon: Package,
      accent: "from-primary to-primary-glow",
    },
    {
      label: "All-time Revenue",
      value: currency(totalRevenue),
      sub: `${sales.length} sales`,
      icon: ShoppingCart,
      accent: "from-accent to-warning",
    },
    {
      label: "Balance Due",
      value: currency(totalBalanceDue),
      sub: `${salesOnCredit} unpaid sale${salesOnCredit === 1 ? "" : "s"}`,
      icon: AlertTriangle,
      accent: "from-destructive to-warning",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Welcome back to Missy"
        description="Everything happening in your shop, at a glance."
        actions={
          <Button asChild variant="default" size="lg">
            <Link to="/pos">
              <ShoppingCart className="h-4 w-4" /> Open POS
            </Link>
          </Button>
        }
      />

      {/* Stock alerts banner */}
      {(outOfStock.length > 0 || lowStock.length > 0) && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-destructive/15 p-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">Stock needs your attention</p>
                <p className="text-sm text-muted-foreground">
                  {outOfStock.length > 0 && (
                    <span className="font-medium text-destructive">
                      {outOfStock.length} out of stock
                    </span>
                  )}
                  {outOfStock.length > 0 && lowStock.length > 0 && " · "}
                  {lowStock.length > 0 && (
                    <span className="font-medium text-warning">
                      {lowStock.length} running low
                    </span>
                  )}
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/inventory">Restock now <ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label} className="relative overflow-hidden border-border/60 shadow-sm">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${s.accent}`} />
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </p>
                  <p className="mt-1 truncate text-xl font-bold">{s.value}</p>
                  {s.sub && <p className="text-xs text-muted-foreground">{s.sub}</p>}
                </div>
                <div className="rounded-lg bg-muted p-2">
                  <s.icon className="h-4 w-4 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Best seller spotlight + top selling list */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden border-accent/40 bg-gradient-to-br from-accent/10 via-card to-card lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              <Flame className="h-4 w-4 text-accent" /> Best Seller
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bestSeller ? (
              <div className="space-y-3">
                <p className="text-2xl font-bold leading-tight">{bestSeller.name}</p>
                <div className="flex items-baseline gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Units sold</p>
                    <p className="text-xl font-semibold text-accent">{bestSeller.qty}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Revenue</p>
                    <p className="text-xl font-semibold">{currency(bestSeller.revenue)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No sales data yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Top Selling Items
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/inventory">Inventory <ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {topSelling.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Make a sale to see what's flying off the shelf.
              </p>
            ) : (
              <div className="space-y-3">
                {topSelling.map((t, i) => (
                  <div key={t.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                          {i + 1}
                        </span>
                        <span className="truncate font-medium">{t.name}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                        <span><span className="font-semibold text-foreground">{t.qty}</span> sold</span>
                        <span className="font-semibold text-foreground">{currency(t.revenue)}</span>
                      </div>
                    </div>
                    <Progress value={topQty > 0 ? (t.qty / topQty) * 100 : 0} className="h-1.5" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stock warnings detail + recent sales */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Sales</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/sales">View all <ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {sales.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {sales.slice(0, 6).map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">{s.receipt_number}</p>
                      <p className="text-xs text-muted-foreground">{dateTime(s.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{currency(s.total)}</p>
                      <Badge variant="secondary" className="text-[10px] uppercase">{s.payment_method}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" /> Stock Warnings
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/inventory">Manage</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {outOfStock.length === 0 && lowStock.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">All stocked up 🎉</p>
            ) : (
              <div className="space-y-3">
                {outOfStock.slice(0, 4).map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 p-2">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                        {p.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{p.sku ?? "—"}</p>
                    </div>
                    <Badge variant="destructive" className="text-[10px]">OUT</Badge>
                  </div>
                ))}
                {lowStock.slice(0, 6 - Math.min(outOfStock.length, 4)).map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        threshold {p.low_stock_threshold}
                      </p>
                    </div>
                    <Badge className="bg-warning text-warning-foreground hover:bg-warning/90">
                      {p.stock} left
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top customers + payment mix */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Top Customers
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/customers">All customers</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No registered customers yet.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {topCustomers.map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.orders} orders</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold">{currency(c.spent)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-accent" /> Payments — Last 30 days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paymentBreakdown.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No payments in the last 30 days.
              </p>
            ) : (
              <div className="space-y-3">
                {paymentBreakdown.map(([method, amount]) => {
                  const pct = monthRevenue > 0 ? (amount / monthRevenue) * 100 : 0;
                  return (
                    <div key={method} className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium capitalize">{method}</span>
                        <span className="text-muted-foreground">
                          {currency(amount)} · {pct.toFixed(0)}%
                        </span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
