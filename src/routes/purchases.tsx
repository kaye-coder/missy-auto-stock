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
import { Plus, Trash2, X, Search, Save } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ExportButtons } from "@/components/ExportButtons";
import type { Purchase, PurchaseItem, Supplier, Product } from "@/lib/db-types";
import { currency } from "@/lib/format";

export const Route = createFileRoute("/purchases")({
  head: () => ({ meta: [{ title: "Purchases — Missy" }] }),
  component: PurchasesPage,
});

interface DraftItem { product_id: string; product_name: string; quantity: number; unit_cost: number; }

function PurchasesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Purchase | null>(null);
  const [confirmDel, setConfirmDel] = useState<Purchase | null>(null);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [editHeader, setEditHeader] = useState({ supplier_id: "", supplier_invoice: "", purchase_date: "", payment_method: "", notes: "" });

  const [supplierId, setSupplierId] = useState("");
  const [invoice, setInvoice] = useState("");
  const [pdate, setPdate] = useState(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState("cash");
  const [vatRate, setVatRate] = useState("18");
  const [whtRate, setWhtRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [productPick, setProductPick] = useState("");
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("");

  const { data: purchases = [] } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchases" as never).select("*").order("purchase_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Purchase[];
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
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products" as never).select("*").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Product[];
    },
  });
  const { data: viewItems = [] } = useQuery({
    queryKey: ["purchase_items", view?.id],
    enabled: !!view,
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_items" as never).select("*").eq("purchase_id", view!.id);
      if (error) throw error;
      return (data ?? []) as unknown as PurchaseItem[];
    },
  });

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.quantity * i.unit_cost, 0), [items]);
  const vat = useMemo(() => (subtotal * (parseFloat(vatRate) || 0)) / 100, [subtotal, vatRate]);
  const wht = useMemo(() => (subtotal * (parseFloat(whtRate) || 0)) / 100, [subtotal, whtRate]);
  const total = subtotal + vat;

  const addItem = () => {
    if (!productPick) return toast.error("Pick a product from inventory");
    const p = products.find(x => x.id === productPick);
    if (!p) return toast.error("Product must exist in inventory before purchasing");
    const q = parseInt(qty) || 0;
    const c = parseFloat(unitCost) || 0;
    if (q <= 0 || c < 0) return toast.error("Enter valid qty and cost");
    setItems([...items, { product_id: p.id, product_name: p.name, quantity: q, unit_cost: c }]);
    setProductPick(""); setQty("1"); setUnitCost("");
  };

  const resetForm = () => {
    setSupplierId(""); setInvoice(""); setPdate(new Date().toISOString().slice(0, 10));
    setPayMethod("cash"); setVatRate("18"); setWhtRate("0"); setNotes("");
    setItems([]); setProductPick(""); setQty("1"); setUnitCost("");
  };

  const save = useMutation({
    mutationFn: async () => {
      if (items.length === 0) throw new Error("Add at least one item");
      const payload = {
        supplier_id: supplierId || null,
        supplier_invoice: invoice.trim() || null,
        purchase_date: pdate,
        subtotal, vat_input: vat, wht, total,
        payment_method: payMethod,
        status: "received",
        notes: notes.trim() || null,
      };
      const { data: p, error } = await supabase.from("purchases" as never).insert(payload as never).select("id").single();
      if (error) throw error;
      const pid = (p as unknown as { id: string }).id;
      const rows = items.map(i => ({
        purchase_id: pid,
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity,
        unit_cost: i.unit_cost,
        subtotal: i.quantity * i.unit_cost,
      }));
      const { error: e2 } = await supabase.from("purchase_items" as never).insert(rows as never);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Purchase recorded — stock and ledger updated");
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      setOpen(false); resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchases" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Purchase deleted — stock and ledger reversed");
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      setConfirmDel(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const supplierName = (id: string | null) => suppliers.find(s => s.id === id)?.name ?? "—";

  const filteredPurchases = useMemo(() => {
    const q = search.toLowerCase();
    return purchases.filter(p => {
      if (fromDate && p.purchase_date < fromDate) return false;
      if (toDate && p.purchase_date > toDate) return false;
      if (!q) return true;
      return (p.purchase_number + " " + (p.supplier_invoice ?? "") + " " + supplierName(p.supplier_id)).toLowerCase().includes(q);
    });
  }, [purchases, search, fromDate, toDate, suppliers]);

  const updateHeader = useMutation({
    mutationFn: async () => {
      if (!view) return;
      const { error } = await supabase.from("purchases" as never).update({
        supplier_id: editHeader.supplier_id || null,
        supplier_invoice: editHeader.supplier_invoice.trim() || null,
        purchase_date: editHeader.purchase_date,
        payment_method: editHeader.payment_method,
        notes: editHeader.notes.trim() || null,
      } as never).eq("id", view.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Purchase updated");
      qc.invalidateQueries({ queryKey: ["purchases"] });
      setView(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchases"
        description={`${purchases.length} purchase orders`}
        actions={
          <>
          <ExportButtons
            filename="purchases"
            title="Purchases"
            columns={[
              { header: "Purchase #", accessor: (p: Purchase) => p.purchase_number },
              { header: "Date", accessor: (p) => p.purchase_date },
              { header: "Supplier", accessor: (p) => suppliers.find(s => s.id === p.supplier_id)?.name ?? "" },
              { header: "Invoice", accessor: (p) => p.supplier_invoice ?? "" },
              { header: "Subtotal", accessor: (p) => Number(p.subtotal) },
              { header: "VAT", accessor: (p) => Number(p.vat_input) },
              { header: "WHT", accessor: (p) => Number(p.wht) },
              { header: "Total", accessor: (p) => Number(p.total) },
              { header: "Payment", accessor: (p) => p.payment_method },
              { header: "Status", accessor: (p) => p.status },
            ]}
            rows={filteredPurchases}
          />
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild><Button onClick={resetForm}><Plus className="h-4 w-4" /> New purchase</Button></DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader><DialogTitle>New purchase order</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Date</Label><Input type="date" value={pdate} onChange={(e) => setPdate(e.target.value)} /></div>
                  <div><Label>Supplier</Label>
                    <Select value={supplierId} onValueChange={setSupplierId}>
                      <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Supplier invoice #</Label><Input value={invoice} onChange={(e) => setInvoice(e.target.value)} /></div>
                </div>

                <div className="rounded-lg border p-3 space-y-3">
                  <div className="text-sm font-medium">Items (must exist in inventory)</div>
                  <div className="grid grid-cols-[1fr_100px_140px_auto] gap-2">
                    <Select value={productPick} onValueChange={(v) => {
                      setProductPick(v);
                      const p = products.find(x => x.id === v);
                      if (p && !unitCost) setUnitCost(String(p.cost || ""));
                    }}>
                      <SelectTrigger><SelectValue placeholder="Choose product from inventory" /></SelectTrigger>
                      <SelectContent>
                        {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} · stock {p.stock}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="number" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
                    <Input type="number" placeholder="Unit cost" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
                    <Button type="button" onClick={addItem}>Add</Button>
                  </div>
                  {items.length > 0 && (
                    <div className="rounded border">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Subtotal</TableHead><TableHead />
                        </TableRow></TableHeader>
                        <TableBody>
                          {items.map((it, i) => (
                            <TableRow key={i}>
                              <TableCell>{it.product_name}</TableCell>
                              <TableCell className="text-right">{it.quantity}</TableCell>
                              <TableCell className="text-right">{currency(it.unit_cost)}</TableCell>
                              <TableCell className="text-right">{currency(it.quantity * it.unit_cost)}</TableCell>
                              <TableCell className="text-right">
                                <Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <div><Label>VAT input %</Label><Input type="number" value={vatRate} onChange={(e) => setVatRate(e.target.value)} /></div>
                  <div><Label>WHT %</Label><Input type="number" value={whtRate} onChange={(e) => setWhtRate(e.target.value)} /></div>
                  <div><Label>Payment</Label>
                    <Select value={payMethod} onValueChange={setPayMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank">Bank</SelectItem>
                        <SelectItem value="credit">Credit (AP)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Subtotal</div>
                    <div className="text-sm">{currency(subtotal)}</div>
                    <div className="text-xs text-muted-foreground mt-1">VAT</div>
                    <div className="text-sm">{currency(vat)}</div>
                    <div className="text-xs text-muted-foreground mt-1">Total</div>
                    <div className="text-lg font-bold">{currency(total)}</div>
                  </div>
                </div>

                <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
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
          <Input className="pl-9" placeholder="Search PO #, invoice, supplier…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div><Label className="text-xs">From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" /></div>
        {(search || fromDate || toDate) && <Button variant="ghost" onClick={() => { setSearch(""); setFromDate(""); setToDate(""); }}>Clear</Button>}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO #</TableHead><TableHead>Date</TableHead><TableHead>Supplier</TableHead>
              <TableHead>Invoice</TableHead><TableHead>Payment</TableHead>
              <TableHead className="text-right">Subtotal</TableHead><TableHead className="text-right">VAT</TableHead>
              <TableHead className="text-right">Total</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPurchases.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">No matching purchases.</TableCell></TableRow>
            ) : filteredPurchases.map(p => (
              <TableRow key={p.id} className="cursor-pointer" onClick={() => {
                setView(p);
                setEditHeader({
                  supplier_id: p.supplier_id ?? "",
                  supplier_invoice: p.supplier_invoice ?? "",
                  purchase_date: p.purchase_date,
                  payment_method: p.payment_method,
                  notes: p.notes ?? "",
                });
              }}>
                <TableCell className="font-mono text-xs">{p.purchase_number}</TableCell>
                <TableCell>{p.purchase_date}</TableCell>
                <TableCell>{supplierName(p.supplier_id)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.supplier_invoice ?? "—"}</TableCell>
                <TableCell className="text-sm capitalize">{p.payment_method}</TableCell>
                <TableCell className="text-right">{currency(p.subtotal)}</TableCell>
                <TableCell className="text-right">{currency(p.vat_input)}</TableCell>
                <TableCell className="text-right font-medium">{currency(p.total)}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); setConfirmDel(p); }}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Purchase {view?.purchase_number}</DialogTitle></DialogHeader>
          {view && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Date</Label>
                  <Input type="date" value={editHeader.purchase_date} onChange={(e) => setEditHeader({ ...editHeader, purchase_date: e.target.value })} />
                </div>
                <div><Label>Supplier</Label>
                  <Select value={editHeader.supplier_id} onValueChange={(v) => setEditHeader({ ...editHeader, supplier_id: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Supplier invoice #</Label>
                  <Input value={editHeader.supplier_invoice} onChange={(e) => setEditHeader({ ...editHeader, supplier_invoice: e.target.value })} />
                </div>
                <div><Label>Payment</Label>
                  <Select value={editHeader.payment_method} onValueChange={(v) => setEditHeader({ ...editHeader, payment_method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank">Bank</SelectItem>
                      <SelectItem value="credit">Credit (AP)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2"><Label>Notes</Label>
                  <Textarea rows={2} value={editHeader.notes} onChange={(e) => setEditHeader({ ...editHeader, notes: e.target.value })} />
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">Items (locked — delete purchase to reverse)</div>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit cost</TableHead><TableHead className="text-right">Subtotal</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {viewItems.map(i => (
                      <TableRow key={i.id}>
                        <TableCell>{i.product_name}</TableCell>
                        <TableCell className="text-right">{i.quantity}</TableCell>
                        <TableCell className="text-right">{currency(i.unit_cost)}</TableCell>
                        <TableCell className="text-right">{currency(i.subtotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="text-right space-y-1">
                <div className="text-sm">Subtotal: {currency(view.subtotal)}</div>
                <div className="text-sm">VAT: {currency(view.vat_input)}</div>
                {view.wht > 0 && <div className="text-sm">WHT: {currency(view.wht)}</div>}
                <div className="text-lg font-bold">Total: {currency(view.total)}</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setView(null)}>Close</Button>
            <Button onClick={() => updateHeader.mutate()} disabled={updateHeader.isPending}>
              <Save className="h-4 w-4" /> {updateHeader.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete purchase?</AlertDialogTitle>
            <AlertDialogDescription>Stock will be reversed and journal entries removed.</AlertDialogDescription>
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
