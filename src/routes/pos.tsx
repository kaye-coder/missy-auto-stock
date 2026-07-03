import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Minus, Trash2, Search, Receipt, ShoppingCart, Sparkles, ScanLine } from "lucide-react";
import { currency } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { loadSettings, bestAutoDiscount, type CheckoutSettings } from "@/lib/settings";
import { printReceipt } from "@/lib/receipt";
import { getSession } from "@/lib/auth";
import type { Product, Category, Customer } from "@/lib/db-types";

export const Route = createFileRoute("/pos")({
  head: () => ({ meta: [{ title: "Point of Sale — Missy" }] }),
  component: POSPage,
});

interface CartLine {
  product: Product;
  qty: number;
}


function POSPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<string>("walkin");
  const [payment, setPayment] = useState<string>("cash");
  const [discount, setDiscount] = useState<number>(0);
  const [discountTouched, setDiscountTouched] = useState(false);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [amountPaidTouched, setAmountPaidTouched] = useState(false);
  const [settings, setSettings] = useState<CheckoutSettings>(() => loadSettings());

  useEffect(() => {
    const handler = () => setSettings(loadSettings());
    window.addEventListener("missy:settings-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("missy:settings-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products" as never).select("*").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Product[];
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories" as never).select("*").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Category[];
    },
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers" as never).select("*").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Customer[];
    },
  });

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchCat = activeCat === "all" || p.category_id === activeCat;
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [products, activeCat, search]);

  const addToCart = (p: Product) => {
    if (p.stock <= 0) {
      toast.error(`${p.name} is out of stock`);
      return;
    }
    setCart((c) => {
      const existing = c.find((l) => l.product.id === p.id);
      if (existing) {
        if (existing.qty >= p.stock) {
          toast.warning(`Only ${p.stock} in stock`);
          return c;
        }
        return c.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...c, { product: p, qty: 1 }];
    });
  };

  const changeQty = (id: string, delta: number) => {
    setCart((c) =>
      c
        .map((l) => {
          if (l.product.id !== id) return l;
          const next = l.qty + delta;
          if (next > l.product.stock) {
            toast.warning(`Only ${l.product.stock} in stock`);
            return l;
          }
          return { ...l, qty: next };
        })
        .filter((l) => l.qty > 0)
    );
  };

  const removeLine = (id: string) => setCart((c) => c.filter((l) => l.product.id !== id));

  const [barcode, setBarcode] = useState("");
  const handleScan = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const match =
      products.find((p) => (p.sku ?? "").toLowerCase() === code.toLowerCase()) ??
      products.find((p) => p.name.toLowerCase() === code.toLowerCase());
    if (!match) {
      toast.error(`No product found for "${code}"`);
      return;
    }
    addToCart(match);
    setBarcode("");
  };

  const subtotal = cart.reduce((s, l) => s + Number(l.product.price) * l.qty, 0);
  const autoDiscount = useMemo(
    () => bestAutoDiscount(subtotal, settings.discountRules),
    [subtotal, settings.discountRules],
  );
  const effectiveDiscount = discountTouched ? discount : autoDiscount.amount;
  const taxable = Math.max(0, subtotal - effectiveDiscount);
  const tax = taxable * settings.taxRate;
  const wht = settings.withholdingEnabled ? taxable * settings.withholdingRate : 0;
  const lst = settings.localServiceTaxEnabled ? settings.localServiceTax : 0;
  const total = Math.max(0, taxable + tax + lst - wht);
  const isCredit = payment === "credit";
  const defaultPaid = isCredit ? 0 : total;
  const effectivePaid = Math.min(
    Math.max(0, amountPaidTouched ? amountPaid : defaultPaid),
    total,
  );
  const balanceDue = Math.max(0, total - effectivePaid);

  const checkout = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Cart is empty");
      if ((isCredit || balanceDue > 0) && customerId === "walkin") {
        throw new Error("Select a customer for credit or partial payments");
      }
      const { data: saleRow, error: saleErr } = await supabase
        .from("sales" as never)
        .insert({
          customer_id: customerId === "walkin" ? null : customerId,
          subtotal,
          tax,
          discount: effectiveDiscount,
          total,
          amount_paid: effectivePaid,
          balance_due: balanceDue,
          payment_method: payment,
          status: balanceDue > 0 ? (effectivePaid > 0 ? "partial" : "credit") : "completed",
        } as never)
        .select()
        .single();
      if (saleErr) throw saleErr;
      const sale = saleRow as unknown as { id: string; receipt_number: string };

      const items = cart.map((l) => ({
        sale_id: sale.id,
        product_id: l.product.id,
        product_name: l.product.name,
        quantity: l.qty,
        unit_price: l.product.price,
        subtotal: Number(l.product.price) * l.qty,
      }));
      const { error: itemsErr } = await supabase.from("sale_items" as never).insert(items as never);
      if (itemsErr) throw itemsErr;

      // Stock is decremented automatically by the sale_items insert trigger.
      return sale;
    },
    onSuccess: (sale) => {
      toast.success(`Sale completed — ${sale.receipt_number}`);
      const customerName =
        customerId === "walkin"
          ? "Walk-in"
          : customers.find((c) => c.id === customerId)?.name ?? "Walk-in";
      printReceipt({
        receiptNumber: sale.receipt_number,
        createdAt: new Date().toISOString(),
        cashier: getSession()?.fullName ?? getSession()?.username ?? "—",
        customerName,
        paymentMethod: payment,
        lines: cart.map((l) => ({
          name: l.product.name,
          qty: l.qty,
          unit_price: Number(l.product.price),
        })),
        subtotal,
        discount: effectiveDiscount,
        tax,
        taxLabel: settings.taxLabel,
        taxRate: settings.taxRate,
        wht,
        whtRate: settings.withholdingRate,
        lst,
        total,
        amountPaid: effectivePaid,
        balanceDue,
      });
      setCart([]);
      setDiscount(0);
      setDiscountTouched(false);
      setAmountPaid(0);
      setAmountPaidTouched(false);
      setCustomerId("walkin");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Point of Sale"
        description="Build the cart, take payment, print the receipt."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Catalog */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by product name or barcode..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="relative sm:w-64">
              <ScanLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent" />
              <Input
                placeholder="Scan barcode + Enter"
                className="pl-9"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleScan(barcode);
                  }
                }}
              />
            </div>
            <Select value={activeCat} onValueChange={setActiveCat}>
              <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                disabled={p.stock <= 0}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="aspect-square w-full overflow-hidden bg-muted">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ShoppingCart className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="line-clamp-2 text-sm font-medium leading-tight">{p.name}</p>
                  <div className="mt-auto flex items-end justify-between pt-2">
                    <span className="text-base font-bold">{currency(p.price)}</span>
                    <Badge variant={p.stock <= p.low_stock_threshold ? "destructive" : "secondary"} className="text-[10px]">
                      {p.stock} in stock
                    </Badge>
                  </div>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
                No products match your search.
              </p>
            )}
          </div>
        </div>

        {/* Cart */}
        <Card className="lg:col-span-2 flex flex-col">
          <CardContent className="flex flex-1 flex-col gap-4 pt-6">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <Receipt className="h-5 w-5" /> Current Sale
              </h3>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setCart([])}>Clear</Button>
              )}
            </div>

            <ScrollArea className="-mx-2 max-h-72 flex-1 px-2">
              {cart.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Tap products on the left to add them.
                </p>
              ) : (
                <div className="space-y-2">
                  {cart.map((l) => (
                    <div key={l.product.id} className="flex items-center gap-3 rounded-lg border border-border p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{l.product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {currency(l.product.price)} × {l.qty}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(l.product.id, -1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm font-medium">{l.qty}</span>
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(l.product.id, +1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeLine(l.product.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{currency(subtotal)}</span></div>
              {autoDiscount.rule && !discountTouched && (
                <div className="flex items-center gap-2 rounded-md bg-accent/10 px-2 py-1.5 text-xs text-accent">
                  <Sparkles className="h-3 w-3" />
                  <span className="flex-1 truncate">{autoDiscount.rule.label} applied</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Discount</span>
                <div className="flex items-center gap-1">
                  {discountTouched && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => { setDiscountTouched(false); setDiscount(0); }}
                    >
                      Auto
                    </Button>
                  )}
                  <Input
                    type="number"
                    min={0}
                    value={effectiveDiscount}
                    onChange={(e) => {
                      setDiscountTouched(true);
                      setDiscount(Math.max(0, Number(e.target.value) || 0));
                    }}
                    className="h-8 w-24 text-right"
                  />
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {settings.taxLabel} ({(settings.taxRate * 100).toFixed(settings.taxRate * 100 % 1 === 0 ? 0 : 2)}%)
                </span>
                <span>{currency(tax)}</span>
              </div>
              {settings.withholdingEnabled && (
                <div className="flex justify-between text-destructive">
                  <span>WHT ({(settings.withholdingRate * 100).toFixed(0)}%)</span>
                  <span>−{currency(wht)}</span>
                </div>
              )}
              {settings.localServiceTaxEnabled && lst > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Local Service Tax</span>
                  <span>{currency(lst)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-base font-bold"><span>Total</span><span>{currency(total)}</span></div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Amount paid</span>
                <div className="flex items-center gap-1">
                  {amountPaidTouched && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => { setAmountPaidTouched(false); setAmountPaid(0); }}
                    >
                      Full
                    </Button>
                  )}
                  <Input
                    type="number"
                    min={0}
                    max={total}
                    value={effectivePaid}
                    onChange={(e) => {
                      setAmountPaidTouched(true);
                      setAmountPaid(Math.max(0, Number(e.target.value) || 0));
                    }}
                    className="h-8 w-28 text-right"
                    disabled={isCredit}
                  />
                </div>
              </div>
              {balanceDue > 0 && (
                <div className="flex justify-between font-medium text-destructive">
                  <span>Balance due (A/R)</span>
                  <span>{currency(balanceDue)}</span>
                </div>
              )}
              {(isCredit || balanceDue > 0) && customerId === "walkin" && (
                <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  Select a customer to record credit or partial payment.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="walkin">Walk-in</SelectItem>
                  {customers.filter((c) => c.name !== "Walk-in Customer").map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={payment} onValueChange={setPayment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="transfer">Bank Transfer</SelectItem>
                  <SelectItem value="credit">Credit (on account)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              size="lg"
              className="w-full"
              disabled={cart.length === 0 || checkout.isPending}
              onClick={() => checkout.mutate()}
            >
              {checkout.isPending
                ? "Processing..."
                : isCredit
                  ? `Record credit sale ${currency(total)}`
                  : balanceDue > 0
                    ? `Take ${currency(effectivePaid)} (owes ${currency(balanceDue)})`
                    : `Charge ${currency(total)}`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
