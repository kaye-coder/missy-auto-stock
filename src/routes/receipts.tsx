import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { localDb as supabase } from "@/lib/local-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, Printer, Search } from "lucide-react";
import { currency, dateTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { ReceiptPreview } from "@/components/ReceiptPreview";
import { loadSettings } from "@/lib/settings";
import { loadPaperSize, printReceiptDocument, type ReceiptData } from "@/lib/receipt";
import type { Sale, SaleItem, Customer } from "@/lib/db-types";

export const Route = createFileRoute("/receipts")({
  head: () => ({
    meta: [
      { title: "Receipts — Missy" },
      { name: "description", content: "Browse, view and reprint every receipt issued by the shop." },
      { property: "og:title", content: "Receipts — Missy" },
      { property: "og:description", content: "Browse, view and reprint every receipt issued by the shop." },
    ],
  }),
  component: ReceiptsPage,
});

function ReceiptsPage() {
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<ReceiptData | null>(null);

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

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers" as never).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as Customer[];
    },
  });

  const customerName = (id: string | null) =>
    id ? customers.find((c) => c.id === id)?.name ?? "—" : "Walk-in";

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return sales;
    return sales.filter((s) =>
      (s.receipt_number + " " + customerName(s.customer_id) + " " + s.payment_method)
        .toLowerCase()
        .includes(q),
    );
  }, [sales, search, customers]);

  const buildReceipt = async (sale: Sale): Promise<ReceiptData> => {
    const { data, error } = await supabase
      .from("sale_items" as never)
      .select("*")
      .eq("sale_id", sale.id);
    if (error) throw error;
    const items = (data ?? []) as unknown as SaleItem[];
    const settings = loadSettings();
    const subtotal = Number(sale.subtotal);
    const taxable = Math.max(0, subtotal - Number(sale.discount ?? 0));
    return {
      receiptNumber: sale.receipt_number,
      createdAt: sale.created_at,
      cashier: "—",
      customerName: customerName(sale.customer_id),
      paymentMethod: sale.payment_method,
      lines: items.map((i) => ({
        name: i.product_name,
        qty: Number(i.quantity),
        unit_price: Number(i.unit_price),
      })),
      subtotal,
      discount: Number(sale.discount ?? 0),
      tax: Number(sale.tax ?? 0),
      taxLabel: settings.taxLabel,
      taxRate: taxable > 0 ? Number(sale.tax ?? 0) / taxable : settings.taxRate,
      total: Number(sale.total),
      amountPaid: Number(sale.amount_paid ?? 0),
      balanceDue: Number(sale.balance_due ?? 0),
    };
  };

  const view = async (sale: Sale) => {
    try {
      setPreview(await buildReceipt(sale));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const reprint = async (sale: Sale) => {
    try {
      printReceiptDocument(await buildReceipt(sale), loadPaperSize());
      toast.success(`Printing ${sale.receipt_number}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipts"
        description={`${filtered.length} receipt${filtered.length === 1 ? "" : "s"} saved · view or reprint any time`}
      />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search receipt, customer, payment…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Receipt</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No receipts yet.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.receipt_number}</TableCell>
                <TableCell className="text-muted-foreground">{dateTime(s.created_at)}</TableCell>
                <TableCell>{customerName(s.customer_id)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{s.payment_method}</Badge>
                </TableCell>
                <TableCell className="text-right font-medium">{currency(Number(s.total))}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => view(s)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => reprint(s)}>
                      <Printer className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ReceiptPreview receipt={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
