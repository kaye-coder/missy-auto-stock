import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, ShieldCheck, ShieldOff } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ExportButtons } from "@/components/ExportButtons";
import {
  MODULES, createUser, deleteUser, isAdmin, listUsers, updateUser,
  type ModuleKey, type Role, type User,
} from "@/lib/auth";

export const Route = createFileRoute("/users")({
  head: () => ({ meta: [{ title: "Users — Missy" }] }),
  component: UsersPage,
});

const MODULE_LABELS: Record<ModuleKey, string> = {
  pos: "Point of Sale",
  inventory: "Inventory",
  categories: "Categories",
  customers: "Customers",
  suppliers: "Suppliers",
  sales: "Sales History",
  purchases: "Purchases",
  expenses: "Expenses",
  accounting: "Accounting",
  reconciliation: "Reconciliation",
  statistics: "Statistics",
  settings: "Settings",
  users: "User Management",
};

interface FormState {
  id: string | null;
  username: string;
  fullName: string;
  password: string;
  role: Role;
  permissions: ModuleKey[];
  active: boolean;
}

const EMPTY: FormState = {
  id: null,
  username: "",
  fullName: "",
  password: "",
  role: "cashier",
  permissions: ["pos", "sales"],
  active: true,
};

function UsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const refresh = () => setUsers(listUsers());

  useEffect(() => {
    if (!isAdmin()) {
      toast.error("Admin access required");
      navigate({ to: "/" });
      return;
    }
    refresh();
    const h = () => refresh();
    window.addEventListener("missy:users-changed", h);
    return () => window.removeEventListener("missy:users-changed", h);
  }, [navigate]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        !q ||
        u.username.toLowerCase().includes(q) ||
        u.fullName.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q),
    );
  }, [users, search]);

  const openNew = () => {
    setForm(EMPTY);
    setOpen(true);
  };

  const openEdit = (u: User) => {
    setForm({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      password: "",
      role: u.role,
      permissions: u.permissions,
      active: u.active,
    });
    setOpen(true);
  };

  const togglePerm = (m: ModuleKey) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(m)
        ? f.permissions.filter((p) => p !== m)
        : [...f.permissions, m],
    }));
  };

  const submit = () => {
    try {
      if (!form.username.trim()) throw new Error("Username is required");
      if (!form.fullName.trim()) throw new Error("Full name is required");
      if (!form.id && !form.password) throw new Error("Password is required for new users");
      if (form.id) {
        const patch: Partial<User> = {
          username: form.username.trim(),
          fullName: form.fullName.trim(),
          role: form.role,
          permissions: form.permissions,
          active: form.active,
        };
        if (form.password) patch.password = form.password;
        updateUser(form.id, patch);
        toast.success("User updated");
      } else {
        createUser({
          username: form.username.trim(),
          fullName: form.fullName.trim(),
          password: form.password,
          role: form.role,
          permissions: form.permissions,
          active: form.active,
        });
        toast.success("User created");
      }
      setOpen(false);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = (u: User) => {
    if (!confirm(`Delete user "${u.username}"?`)) return;
    try {
      deleteUser(u.id);
      toast.success("User deleted");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & Access"
        description="Create staff accounts and control which modules each user can access."
        actions={
          <>
            <ExportButtons
              filename="users"
              title="Users"
              columns={[
                { header: "Username", accessor: (u: User) => u.username },
                { header: "Full name", accessor: (u) => u.fullName },
                { header: "Role", accessor: (u) => u.role },
                { header: "Active", accessor: (u) => (u.active ? "Yes" : "No") },
                { header: "Permissions", accessor: (u) => u.permissions.join(", ") },
                { header: "Created", accessor: (u) => new Date(u.createdAt).toLocaleString() },
              ]}
              rows={filtered}
            />
            <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />New user</Button>
          </>
        }
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Full name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>{u.fullName}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge>
                    </TableCell>
                    <TableCell>
                      {u.active ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <ShieldCheck className="h-3 w-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <ShieldOff className="h-3 w-3" /> Disabled
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md text-xs text-muted-foreground">
                      {u.role === "admin" ? "All modules" : u.permissions.join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => remove(u)}
                        disabled={u.username === "admin"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No users match your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit user" : "Create user"}</DialogTitle>
            <DialogDescription>
              Admins have full access. Assign only needed modules for cashier or custom roles.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Password {form.id && <span className="text-xs text-muted-foreground">(leave blank to keep)</span>}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin (full access)</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                id="active"
                type="checkbox"
                className="h-4 w-4 accent-accent"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              <Label htmlFor="active" className="cursor-pointer">Account active</Label>
            </div>
          </div>

          {form.role !== "admin" && (
            <div className="space-y-2">
              <Label>Module permissions</Label>
              <div className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-3">
                {MODULES.filter((m) => m !== "users").map((m) => (
                  <label key={m} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-accent"
                      checked={form.permissions.includes(m)}
                      onChange={() => togglePerm(m)}
                    />
                    {MODULE_LABELS[m]}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                User Management is restricted to admins.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>{form.id ? "Save changes" : "Create user"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
