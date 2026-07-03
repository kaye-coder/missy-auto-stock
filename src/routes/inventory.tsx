import { createFileRoute } from "@tanstack/react-router";
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, Bell, Check, AlertTriangle, Upload, X, Loader2 } from "lucide-react";
import { currency } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { ExportButtons } from "@/components/ExportButtons";
import type { Product, Category } from "@/lib/db-types";

export const Route = createFileRoute("/inventory")({
  head: () => ({ meta: [{ title: "Inventory — Missy" }] }),
  component: InventoryPage,
});

interface Form {
  name: string;
  sku: string;
  description: string;
  category_id: string | null;
  price: number;
  cost: number;
  stock: number;
  low_stock_threshold: number;
  image_url: string;
}
const empty: Form = {
  name: "", sku: "", description: "", category_id: null,
  price: 0, cost: 0, stock: 0, low_stock_threshold: 5, image_url: "",
};

function InventoryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [confirmDel, setConfirmDel] = useState<Product | null>(null);

  const { data: products = [], isLoading } = useQuery({
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

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "—";

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        description: form.description.trim() || null,
        category_id: form.category_id || null,
        price: Number(form.price),
        cost: Number(form.cost),
        stock: Number(form.stock),
        low_stock_threshold: Number(form.low_stock_threshold),
        image_url: form.image_url.trim() || null,
      };
      if (!payload.name) throw new Error("Name is required");
      if (editing) {
        const { error } = await supabase.from("products" as never).update(payload as never).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products" as never).insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Product updated" : "Product created");
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false); setEditing(null); setForm(empty);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product deleted");
      qc.invalidateQueries({ queryKey: ["products"] });
      setConfirmDel(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateThreshold = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: number }) => {
      const { error } = await supabase
        .from("products" as never)
        .update({ low_stock_threshold: value } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alert level updated");
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
  });

  const totals = filtered.reduce(
    (t, p) => {
      const cost = Number(p.cost) * p.stock;
      const price = Number(p.price) * p.stock;
      t.cost += cost;
      t.price += price;
      t.units += p.stock;
      return t;
    },
    { cost: 0, price: 0, units: 0 },
  );
  const totalProfit = totals.price - totals.cost;

  const startCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const startEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, sku: p.sku ?? "", description: p.description ?? "",
      category_id: p.category_id, price: Number(p.price), cost: Number(p.cost),
      stock: p.stock, low_stock_threshold: p.low_stock_threshold, image_url: p.image_url ?? "",
    });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description={`${products.length} products · ${products.reduce((s, p) => s + p.stock, 0)} units in stock`}
        actions={
          <>
          <ExportButtons
            filename="inventory"
            title="Inventory"
            columns={[
              { header: "Name", accessor: (p: typeof filtered[number]) => p.name },
              { header: "SKU", accessor: (p) => p.sku ?? "" },
              { header: "Cost", accessor: (p) => Number(p.cost) },
              { header: "Price", accessor: (p) => Number(p.price) },
              { header: "Unit profit", accessor: (p) => Number(p.price) - Number(p.cost) },
              { header: "Stock", accessor: (p) => p.stock },
              { header: "Stock value (cost)", accessor: (p) => Number(p.cost) * p.stock },
              { header: "Retail value (price)", accessor: (p) => Number(p.price) * p.stock },
              { header: "Potential profit", accessor: (p) => (Number(p.price) - Number(p.cost)) * p.stock },
              { header: "Low stock at", accessor: (p) => p.low_stock_threshold },
            ]}
            rows={filtered}
          />
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm(empty); } }}>
            <DialogTrigger asChild>
              <Button onClick={startCreate}><Plus className="h-4 w-4" /> Add product</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div><Label>SKU</Label>
                  <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
                </div>
                <div><Label>Category</Label>
                  <Select value={form.category_id ?? ""} onValueChange={(v) => setForm({ ...form, category_id: v || null })}>
                    <SelectTrigger><SelectValue placeholder="Pick category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Price</Label>
                  <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
                </div>
                <div><Label>Cost</Label>
                  <Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
                </div>
                <div><Label>Stock</Label>
                  <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
                </div>
                <div><Label>Low-stock threshold</Label>
                  <Input type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: Number(e.target.value) })} />
                </div>
                <div className="sm:col-span-2"><Label>Image</Label>
                  <ImageUploader
                    value={form.image_url}
                    onChange={(url) => setForm({ ...form, image_url: url })}
                  />
                </div>
                <div className="sm:col-span-2"><Label>Description</Label>
                  <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </>
        }
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search inventory..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Units in stock</p>
          <p className="mt-1 text-lg font-bold">{totals.units}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total cost value</p>
          <p className="mt-1 text-lg font-bold">{currency(totals.cost)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total retail value</p>
          <p className="mt-1 text-lg font-bold">{currency(totals.price)}</p>
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Potential profit</p>
          <p className="mt-1 text-lg font-bold text-primary">{currency(totalProfit)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Cost value</TableHead>
              <TableHead className="text-right">Retail value</TableHead>
              <TableHead className="text-right">Profit</TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center gap-1">
                  <Bell className="h-3.5 w-3.5" /> Alert at
                </span>
              </TableHead>
              <TableHead className="text-right">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={12} className="py-10 text-center text-sm text-muted-foreground">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={12} className="py-10 text-center text-sm text-muted-foreground">No products.</TableCell></TableRow>
            ) : filtered.map((p) => {
              const status: "out" | "low" | "ok" =
                p.stock <= 0 ? "out" : p.stock <= p.low_stock_threshold ? "low" : "ok";
              const costValue = Number(p.cost) * p.stock;
              const retailValue = Number(p.price) * p.stock;
              const profit = retailValue - costValue;
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="h-10 w-10 rounded-md object-cover" loading="lazy" />
                      ) : <div className="h-10 w-10 rounded-md bg-muted" />}
                      <div>
                        <p className="font-medium">{p.name}</p>
                        {p.description && <p className="line-clamp-1 text-xs text-muted-foreground">{p.description}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.sku ?? "—"}</TableCell>
                  <TableCell>{catName(p.category_id)}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{currency(p.cost)}</TableCell>
                  <TableCell className="text-right font-medium">{currency(p.price)}</TableCell>
                  <TableCell className="text-right font-semibold">{p.stock}</TableCell>
                  <TableCell className="text-right text-sm">{currency(costValue)}</TableCell>
                  <TableCell className="text-right text-sm">{currency(retailValue)}</TableCell>
                  <TableCell className="text-right text-sm font-medium text-primary">{currency(profit)}</TableCell>
                  <TableCell className="text-right">
                    <ThresholdEditor
                      value={p.low_stock_threshold}
                      pending={updateThreshold.isPending && updateThreshold.variables?.id === p.id}
                      onSave={(value) => updateThreshold.mutate({ id: p.id, value })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {status === "out" ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> Out
                      </Badge>
                    ) : status === "low" ? (
                      <Badge className="gap-1 bg-warning text-warning-foreground hover:bg-warning/90">
                        <AlertTriangle className="h-3 w-3" /> Low
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Check className="h-3 w-3" /> OK
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setConfirmDel(p)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length > 0 && (
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell colSpan={5} className="text-right">Totals</TableCell>
                <TableCell className="text-right">{totals.units}</TableCell>
                <TableCell className="text-right">{currency(totals.cost)}</TableCell>
                <TableCell className="text-right">{currency(totals.price)}</TableCell>
                <TableCell className="text-right text-primary">{currency(totalProfit)}</TableCell>
                <TableCell colSpan={3} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>


      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDel?.name}" will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDel && del.mutate(confirmDel.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ImageUploader({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please pick an image file");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, {
        cacheControl: "31536000",
        upsert: false,
      });
      if (error) throw error;
      const { data, error: signErr } = await supabase.storage
        .from("product-images")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signErr) throw signErr;
      onChange(data.signedUrl);
      toast.success("Image uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {value ? (
        <img src={value} alt="" className="h-20 w-20 rounded-md object-cover border border-border" />
      ) : (
        <div className="h-20 w-20 rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground">No image</div>
      )}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Uploading..." : value ? "Replace" : "Upload"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
            <X className="h-4 w-4" /> Remove
          </Button>
        )}
      </div>
    </div>
  );
}

function ThresholdEditor({
  value,
  pending,
  onSave,
}: {
  value: number;
  pending: boolean;
  onSave: (next: number) => void;
}) {
  const [draft, setDraft] = useState<string>(String(value));

  // Keep draft in sync when value changes externally
  if (draft === "" && value !== 0) {
    // no-op — let the user clear while typing
  }

  const commit = () => {
    const n = Math.max(0, Math.floor(Number(draft)));
    if (!Number.isFinite(n) || n === value) {
      setDraft(String(value));
      return;
    }
    onSave(n);
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <Input
        type="number"
        min={0}
        value={draft}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            setDraft(String(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-8 w-20 text-right"
        aria-label="Low-stock alert threshold"
      />
    </div>
  );
}
