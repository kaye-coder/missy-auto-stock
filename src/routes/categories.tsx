import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Tags, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ExportButtons } from "@/components/ExportButtons";
import type { Category, Product } from "@/lib/db-types";

export const Route = createFileRoute("/categories")({
  head: () => ({ meta: [{ title: "Categories — Missy" }] }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [confirmDel, setConfirmDel] = useState<Category | null>(null);
  const [search, setSearch] = useState("");

  const { data: allCategories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories" as never).select("*").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Category[];
    },
  });
  const categories = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return allCategories;
    return allCategories.filter(c => (c.name + " " + (c.description ?? "")).toLowerCase().includes(q));
  }, [allCategories, search]);
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products" as never).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as Product[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name is required");
      const payload = { name: form.name.trim(), description: form.description.trim() || null };
      if (editing) {
        const { error } = await supabase.from("categories" as never).update(payload as never).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("categories" as never).insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Category updated" : "Category created");
      qc.invalidateQueries({ queryKey: ["categories"] });
      setOpen(false); setEditing(null); setForm({ name: "", description: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category deleted");
      qc.invalidateQueries({ queryKey: ["categories"] });
      setConfirmDel(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startCreate = () => { setEditing(null); setForm({ name: "", description: "" }); setOpen(true); };
  const startEdit = (c: Category) => { setEditing(c); setForm({ name: c.name, description: c.description ?? "" }); setOpen(true); };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description="Organize products into shop categories."
        actions={
          <>
          <ExportButtons
            filename="categories"
            title="Categories"
            columns={[
              { header: "Name", accessor: (c: Category) => c.name },
              { header: "Description", accessor: (c) => c.description ?? "" },
              { header: "Created", accessor: (c) => new Date(c.created_at).toLocaleDateString() },
            ]}
            rows={categories}
          />
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm({ name: "", description: "" }); } }}>
            <DialogTrigger asChild>
              <Button onClick={startCreate}><Plus className="h-4 w-4" /> Add category</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div><Label>Description</Label>
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
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search categories…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => {
          const count = products.filter((p) => p.category_id === c.id).length;
          return (
            <Card key={c.id} className="group relative overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-accent/15 p-2 text-accent-foreground"><Tags className="h-5 w-5 text-primary" /></div>
                    <div>
                      <h3 className="font-semibold">{c.name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">{count} products</p>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(c)}><Pencil className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setConfirmDel(c)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
                {c.description && <p className="mt-3 text-sm text-muted-foreground">{c.description}</p>}
              </CardContent>
            </Card>
          );
        })}
        {categories.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-muted-foreground">No categories yet.</p>
        )}
      </div>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              Products in "{confirmDel?.name}" will be uncategorized but kept.
            </AlertDialogDescription>
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
