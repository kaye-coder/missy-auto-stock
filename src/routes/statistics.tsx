import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { currency } from "@/lib/format";
import { TrendingUp, TrendingDown, DollarSign, Percent, PackageMinus, BarChart3 } from "lucide-react";
import type { Product, Sale, SaleItem, Category } from "@/lib/db-types";

export const Route = createFileRoute("/statistics")({
  head: () => ({ meta: [{ title: "Statistics — Missy" }] }),
  component: StatsPage,
});

// Pink palette only — different shades of pink for every visualization
const PINK_SHADES = [
  "#be185d", "#db2777", "#ec4899", "#f472b6", "#f9a8d4",
  "#fbcfe8", "#9d174d", "#831843", "#e879a6", "#f8b4d1",
];
const PINK_PRIMARY = "#ec4899";
const PINK_DEEP = "#be185d";
const PINK_SOFT = "#f9a8d4";

type Metric = "revenue" | "profit" | "loss" | "units" | "overall";
type GroupBy = "day" | "week" | "month" | "all";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isoWeek(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week: weekNo };
}

function StatsPage() {
  const now = new Date();
  const currentYear = now.getFullYear();

  const [metric, setMetric] = useState<Metric>("overall");
  const [groupBy, setGroupBy] = useState<GroupBy>("month");

  // month/week filters
  const [year, setYear] = useState<number>(currentYear);
  const [startMonth, setStartMonth] = useState<number>(0);
  const [endMonth, setEndMonth] = useState<number>(now.getMonth());
  const [startWeek, setStartWeek] = useState<number>(1);
  const [endWeek, setEndWeek] = useState<number>(isoWeek(now).week);

  // day range
  const isoDay = (d: Date) => d.toISOString().slice(0, 10);
  const [dayFrom, setDayFrom] = useState<string>(isoDay(new Date(Date.now() - 30 * 864e5)));
  const [dayTo, setDayTo] = useState<string>(isoDay(now));

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products" as never).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as Product[];
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories" as never).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as Category[];
    },
  });
  const { data: sales = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Sale[];
    },
  });
  const { data: saleItems = [] } = useQuery({
    queryKey: ["sale_items_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sale_items" as never).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as SaleItem[];
    },
  });

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // Available years from data
  const availableYears = useMemo(() => {
    const set = new Set<number>([currentYear]);
    for (const s of sales) set.add(new Date(s.created_at).getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [sales, currentYear]);

  // Sales in currently selected range
  const { filteredSales, rangeLabel } = useMemo(() => {
    if (groupBy === "all") {
      return { filteredSales: sales, rangeLabel: "All time" };
    }
    if (groupBy === "month") {
      const s = new Date(year, Math.min(startMonth, endMonth), 1).getTime();
      const e = new Date(year, Math.max(startMonth, endMonth) + 1, 1).getTime();
      const arr = sales.filter((x) => {
        const t = new Date(x.created_at).getTime();
        return t >= s && t < e;
      });
      const a = MONTHS[Math.min(startMonth, endMonth)];
      const b = MONTHS[Math.max(startMonth, endMonth)];
      return { filteredSales: arr, rangeLabel: `${a} – ${b} ${year}` };
    }
    if (groupBy === "week") {
      const arr = sales.filter((x) => {
        const d = new Date(x.created_at);
        const w = isoWeek(d);
        if (w.year !== year) return false;
        const lo = Math.min(startWeek, endWeek);
        const hi = Math.max(startWeek, endWeek);
        return w.week >= lo && w.week <= hi;
      });
      return { filteredSales: arr, rangeLabel: `Weeks ${Math.min(startWeek, endWeek)}–${Math.max(startWeek, endWeek)}, ${year}` };
    }
    // day
    const s = new Date(dayFrom + "T00:00:00").getTime();
    const e = new Date(dayTo + "T23:59:59").getTime();
    const arr = sales.filter((x) => {
      const t = new Date(x.created_at).getTime();
      return t >= s && t <= e;
    });
    return { filteredSales: arr, rangeLabel: `${dayFrom} → ${dayTo}` };
  }, [sales, groupBy, year, startMonth, endMonth, startWeek, endWeek, dayFrom, dayTo]);

  const filteredSaleIds = useMemo(() => new Set(filteredSales.map((s) => s.id)), [filteredSales]);
  const filteredItems = useMemo(
    () => saleItems.filter((i) => filteredSaleIds.has(i.sale_id)),
    [saleItems, filteredSaleIds],
  );

  const stats = useMemo(() => {
    let revenue = 0, cost = 0, tax = 0, discount = 0, units = 0;
    for (const s of filteredSales) {
      revenue += Number(s.total);
      tax += Number(s.tax);
      discount += Number(s.discount);
    }
    for (const it of filteredItems) {
      const p = productMap.get(it.product_id ?? "");
      const c = p ? Number(p.cost) : 0;
      cost += c * Number(it.quantity);
      units += Number(it.quantity);
    }
    const profit = revenue - tax - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, cost, profit, loss: Math.max(0, -profit), tax, discount, units, margin, txns: filteredSales.length };
  }, [filteredSales, filteredItems, productMap]);

  // Bucketed data based on grouping
  const bucketed = useMemo(() => {
    type B = { key: string; label: string; revenue: number; cost: number; tax: number; profit: number; units: number };
    const map = new Map<string, B>();
    const itemsBySale = new Map<string, SaleItem[]>();
    for (const it of filteredItems) {
      const arr = itemsBySale.get(it.sale_id) ?? [];
      arr.push(it);
      itemsBySale.set(it.sale_id, arr);
    }
    const bucketOf = (d: Date): { key: string; label: string } => {
      if (groupBy === "month" || groupBy === "all") {
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return { key: k, label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` };
      }
      if (groupBy === "week") {
        const w = isoWeek(d);
        const k = `${w.year}-W${String(w.week).padStart(2, "0")}`;
        return { key: k, label: `W${w.week}` };
      }
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return { key: k, label: k.slice(5) };
    };
    for (const s of filteredSales) {
      const d = new Date(s.created_at);
      const { key, label } = bucketOf(d);
      const cur = map.get(key) ?? { key, label, revenue: 0, cost: 0, tax: 0, profit: 0, units: 0 };
      const rev = Number(s.total);
      const tx = Number(s.tax);
      let cst = 0, u = 0;
      for (const it of itemsBySale.get(s.id) ?? []) {
        const p = productMap.get(it.product_id ?? "");
        cst += (p ? Number(p.cost) : 0) * Number(it.quantity);
        u += Number(it.quantity);
      }
      cur.revenue += rev;
      cur.cost += cst;
      cur.tax += tx;
      cur.profit += rev - tx - cst;
      cur.units += u;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [filteredSales, filteredItems, productMap, groupBy]);

  // Category / payment / product breakdowns
  const revenueByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of filteredItems) {
      const p = productMap.get(it.product_id ?? "");
      const catName = p?.category_id ? categoryMap.get(p.category_id)?.name ?? "Other" : "Uncategorized";
      map.set(catName, (map.get(catName) ?? 0) + Number(it.subtotal));
    }
    return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredItems, productMap, categoryMap]);

  const byPayment = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of filteredSales) {
      map.set(s.payment_method, (map.get(s.payment_method) ?? 0) + Number(s.total));
    }
    return Array.from(map, ([name, value]) => ({ name, value }));
  }, [filteredSales]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; profit: number; units: number }>();
    for (const it of filteredItems) {
      const key = it.product_id ?? it.product_name;
      const p = productMap.get(it.product_id ?? "");
      const cur = map.get(key) ?? { name: it.product_name, revenue: 0, profit: 0, units: 0 };
      const rev = Number(it.subtotal);
      const cst = (p ? Number(p.cost) : 0) * Number(it.quantity);
      cur.revenue += rev;
      cur.profit += rev - cst;
      cur.units += Number(it.quantity);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [filteredItems, productMap]);

  const metricInfo: Record<Metric, { label: string; dataKey: string; color: string }> = {
    revenue: { label: "Revenue", dataKey: "revenue", color: PINK_PRIMARY },
    profit:  { label: "Profit",  dataKey: "profit",  color: PINK_DEEP },
    loss:    { label: "Loss",    dataKey: "loss",    color: "#831843" },
    units:   { label: "Units sold", dataKey: "units", color: PINK_SOFT },
    overall: { label: "Overall", dataKey: "revenue", color: PINK_PRIMARY },
  };

  const bucketedForChart = useMemo(() => {
    if (metric !== "loss") return bucketed;
    return bucketed.map((b) => ({ ...b, loss: Math.max(0, -b.profit) }));
  }, [bucketed, metric]);

  const groupLabel = groupBy === "day" ? "Day" : groupBy === "week" ? "Week" : groupBy === "month" ? "Month" : "Overall";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statistics & Reports"
        description="Choose a metric and a time window — everything in pink."
      />

      {/* Controls */}
      <Card className="border-pink-200/60">
        <CardContent className="grid gap-4 p-5 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-pink-700">Metric</Label>
            <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="overall">Overall (everything)</SelectItem>
                <SelectItem value="revenue">Revenue</SelectItem>
                <SelectItem value="profit">Profit</SelectItem>
                <SelectItem value="loss">Loss</SelectItem>
                <SelectItem value="units">Units sold</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-pink-700">Group by</Label>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Per day</SelectItem>
                <SelectItem value="week">Per week</SelectItem>
                <SelectItem value="month">Per month</SelectItem>
                <SelectItem value="all">All at once</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {groupBy === "month" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-pink-700">Year</Label>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-pink-700">From</Label>
                  <Select value={String(startMonth)} onValueChange={(v) => setStartMonth(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-pink-700">To</Label>
                  <Select value={String(endMonth)} onValueChange={(v) => setEndMonth(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {groupBy === "week" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-pink-700">Year</Label>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-pink-700">From week</Label>
                  <Input type="number" min={1} max={53} value={startWeek}
                    onChange={(e) => setStartWeek(Math.max(1, Math.min(53, Number(e.target.value) || 1)))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-pink-700">To week</Label>
                  <Input type="number" min={1} max={53} value={endWeek}
                    onChange={(e) => setEndWeek(Math.max(1, Math.min(53, Number(e.target.value) || 1)))} />
                </div>
              </div>
            </>
          )}

          {groupBy === "day" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-pink-700">From</Label>
                <Input type="date" value={dayFrom} onChange={(e) => setDayFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-pink-700">To</Label>
                <Input type="date" value={dayTo} onChange={(e) => setDayTo(e.target.value)} />
              </div>
            </>
          )}

          {groupBy === "all" && (
            <div className="md:col-span-2 flex items-end">
              <p className="text-sm text-muted-foreground">Showing every sale ever recorded.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-pink-100 text-pink-800 hover:bg-pink-100">{metricInfo[metric].label}</Badge>
        <Badge className="bg-pink-50 text-pink-700 hover:bg-pink-50 border border-pink-200">{groupLabel}</Badge>
        <Badge variant="outline" className="border-pink-300 text-pink-700">{rangeLabel}</Badge>
      </div>

      {/* KPIs — only shown for "overall" */}
      {metric === "overall" && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Revenue" value={currency(stats.revenue)} icon={DollarSign} shade="from-pink-500/20 to-pink-500/5" />
          <Kpi
            label={stats.profit >= 0 ? "Profit" : "Loss"}
            value={currency(Math.abs(stats.profit))}
            icon={stats.profit >= 0 ? TrendingUp : TrendingDown}
            shade={stats.profit >= 0 ? "from-pink-400/25 to-pink-300/5" : "from-pink-800/25 to-pink-700/5"}
          />
          <Kpi label="Margin" value={`${stats.margin.toFixed(1)}%`} icon={Percent} shade="from-pink-300/25 to-pink-200/5" />
          <Kpi label="Units sold" value={stats.units.toLocaleString()} icon={PackageMinus} shade="from-pink-600/20 to-pink-400/5" />
        </div>
      )}

      {/* Main metric chart */}
      <ChartCard
        title={`${metricInfo[metric].label} ${groupBy === "all" ? "(all time)" : `per ${groupLabel.toLowerCase()}`}`}
        description={rangeLabel}
      >
        {bucketedForChart.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={320}>
            {metric === "overall" ? (
              <LineChart data={bucketedForChart}>
                <CartesianGrid strokeDasharray="3 3" stroke={PINK_SOFT} strokeOpacity={0.5} />
                <XAxis dataKey="label" fontSize={11} stroke={PINK_DEEP} />
                <YAxis fontSize={11} stroke={PINK_DEEP} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                <RTooltip formatter={(v: number) => currency(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="revenue" stroke={PINK_PRIMARY} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="profit" stroke={PINK_DEEP} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cost" stroke={PINK_SOFT} strokeWidth={2} dot={false} />
              </LineChart>
            ) : (
              <BarChart data={bucketedForChart}>
                <CartesianGrid strokeDasharray="3 3" stroke={PINK_SOFT} strokeOpacity={0.5} />
                <XAxis dataKey="label" fontSize={11} stroke={PINK_DEEP} />
                <YAxis fontSize={11} stroke={PINK_DEEP}
                  tickFormatter={(v) => metric === "units" ? String(v) : (v / 1000).toFixed(0) + "k"} />
                <RTooltip formatter={(v: number) => metric === "units" ? v.toLocaleString() : currency(v)} />
                <Bar dataKey={metricInfo[metric].dataKey} fill={metricInfo[metric].color} radius={[6, 6, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Overall view: breakdowns */}
      {metric === "overall" && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ChartCard title="Revenue by Category" description="Where the money comes from">
              {revenueByCategory.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={revenueByCategory} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                      {revenueByCategory.map((_, i) => <Cell key={i} fill={PINK_SHADES[i % PINK_SHADES.length]} />)}
                    </Pie>
                    <RTooltip formatter={(v: number) => currency(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Profit vs Cost vs Tax" description="Where revenue goes">
              {[
                { name: "Profit", value: Math.max(0, stats.profit) },
                { name: "Cost of Goods", value: stats.cost },
                { name: "Tax", value: stats.tax },
              ].filter((d) => d.value > 0).length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Profit", value: Math.max(0, stats.profit) },
                        { name: "Cost of Goods", value: stats.cost },
                        { name: "Tax", value: stats.tax },
                      ].filter((d) => d.value > 0)}
                      dataKey="value" nameKey="name" outerRadius={95} label={(e) => e.name}
                    >
                      {[PINK_DEEP, PINK_PRIMARY, PINK_SOFT].map((c, i) => <Cell key={i} fill={c} />)}
                    </Pie>
                    <RTooltip formatter={(v: number) => currency(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Payment Methods" description="How customers pay">
              {byPayment.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={byPayment} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                      {byPayment.map((_, i) => <Cell key={i} fill={PINK_SHADES[i % PINK_SHADES.length]} />)}
                    </Pie>
                    <RTooltip formatter={(v: number) => currency(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Top Products" description="By revenue">
            {topProducts.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={topProducts} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={PINK_SOFT} strokeOpacity={0.5} />
                  <XAxis type="number" fontSize={11} stroke={PINK_DEEP} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                  <YAxis type="category" dataKey="name" fontSize={11} width={110} stroke={PINK_DEEP} />
                  <RTooltip formatter={(v: number) => currency(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" fill={PINK_PRIMARY} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="profit" fill={PINK_DEEP} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-pink-800">
                <BarChart3 className="h-5 w-5" /> Profit & Loss Summary
              </CardTitle>
              <CardDescription>{rangeLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                <Row label="Gross revenue" value={currency(stats.revenue)} />
                <Row label="Transactions" value={stats.txns.toLocaleString()} />
                <Row label="Cost of goods sold" value={`- ${currency(stats.cost)}`} />
                <Row label="Tax collected" value={`- ${currency(stats.tax)}`} />
                <Row label="Discounts given" value={currency(stats.discount)} />
                <Row label="Units sold" value={stats.units.toLocaleString()} />
                <Row
                  label={stats.profit >= 0 ? "Net profit" : "Net loss"}
                  value={currency(Math.abs(stats.profit))}
                  tone={stats.profit >= 0 ? "text-pink-700" : "text-pink-900"}
                  strong
                />
                <Row label="Profit margin" value={`${stats.margin.toFixed(1)}%`} strong />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Single-metric view: focused summary */}
      {metric !== "overall" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-pink-800">{metricInfo[metric].label} — {rangeLabel}</CardTitle>
            <CardDescription>Totals across the selected window</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <Row label="Revenue" value={currency(stats.revenue)} />
              <Row label="Profit" value={currency(stats.profit)} tone={stats.profit >= 0 ? "text-pink-700" : "text-pink-900"} strong />
              <Row label="Loss" value={currency(stats.loss)} tone="text-pink-900" />
              <Row label="Units" value={stats.units.toLocaleString()} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, icon: Icon, shade }: { label: string; value: string; icon: any; shade: string }) {
  return (
    <Card className={`bg-gradient-to-br ${shade} border-pink-200/60`}>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <div className="text-xs uppercase tracking-wide text-pink-700">{label}</div>
          <div className="mt-1 text-2xl font-bold text-pink-900">{value}</div>
        </div>
        <Icon className="h-8 w-8 text-pink-500/70" />
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="border-pink-200/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-pink-800">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Row({ label, value, tone, strong }: { label: string; value: React.ReactNode; tone?: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-md border border-pink-200/60 bg-pink-50/40 px-3 py-2 ${strong ? "font-semibold" : ""}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm ${tone ?? "text-pink-900"}`}>{value}</span>
    </div>
  );
}

function Empty() {
  return <div className="flex h-[280px] items-center justify-center text-sm text-pink-500/70">No data for this selection</div>;
}
