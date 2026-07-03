import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus, Save, RotateCcw, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import {
  loadSettings, saveSettings, DEFAULT_SETTINGS,
  type CheckoutSettings, type DiscountRule,
} from "@/lib/settings";
import { currency } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Missy" }] }),
  component: SettingsPage,
});

const RESET_PASSWORD = "master2019!key";

function SettingsPage() {
  const [s, setS] = useState<CheckoutSettings>(DEFAULT_SETTINGS);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPwd, setResetPwd] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => { setS(loadSettings()); }, []);

  const update = <K extends keyof CheckoutSettings>(k: K, v: CheckoutSettings[K]) =>
    setS((cur) => ({ ...cur, [k]: v }));

  const updateRule = (id: string, patch: Partial<DiscountRule>) =>
    setS((cur) => ({
      ...cur,
      discountRules: cur.discountRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));

  const addRule = () =>
    setS((cur) => ({
      ...cur,
      discountRules: [
        ...cur.discountRules,
        { id: crypto.randomUUID(), label: "New rule", minSubtotal: 0, kind: "percent", value: 5 },
      ],
    }));

  const removeRule = (id: string) =>
    setS((cur) => ({ ...cur, discountRules: cur.discountRules.filter((r) => r.id !== id) }));

  const save = () => {
    if (s.taxRate < 0 || s.taxRate > 1) {
      toast.error("Tax rate must be between 0 and 1 (e.g. 0.16 for 16%)");
      return;
    }
    saveSettings(s);
    toast.success("Settings saved");
  };

  const reset = () => {
    setS(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    toast.success("Reset to defaults");
  };

  const wipeAllData = async () => {
    if (resetPwd !== RESET_PASSWORD) {
      toast.error("Incorrect password");
      return;
    }
    setResetting(true);
    try {
      // Order matters: children before parents to satisfy FKs.
      const tables = [
        "journal_lines", "journal_entries",
        "sale_items", "sales",
        "purchase_items", "purchases",
        "expenses",
        "products", "customers", "suppliers", "categories",
      ] as const;
      for (const name of tables) {
        const { error } = await supabase.from(name).delete().not("id", "is", null);
        if (error) throw new Error(`${name}: ${error.message}`);
      }
      toast.success("All data has been reset to zero");
      setResetOpen(false);
      setResetPwd("");
    } catch (e) {
      toast.error((e as Error).message || "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Checkout Settings"
        description="Configure tax rates and automatic discount rules applied at the point of sale."
        actions={
          <>
            <Button variant="outline" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" />Reset</Button>
            <Button onClick={save}><Save className="mr-2 h-4 w-4" />Save changes</Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Business identity</CardTitle>
          <CardDescription>
            Printed on receipts. URA requires the TIN and business name on every fiscal receipt.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="businessName">Business name</Label>
            <Input id="businessName" value={s.businessName} onChange={(e) => update("businessName", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tinNumber">URA TIN</Label>
            <Input
              id="tinNumber"
              value={s.tinNumber}
              placeholder="e.g. 1000123456"
              onChange={(e) => update("tinNumber", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="businessPhone">Telephone / contact</Label>
            <Input
              id="businessPhone"
              value={s.businessPhone}
              placeholder="e.g. +256 700 123 456"
              onChange={(e) => update("businessPhone", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="efrisDeviceId">EFRIS device / e-invoice ID (optional)</Label>
            <Input
              id="efrisDeviceId"
              value={s.efrisDeviceId}
              placeholder="EFRIS device ID for URA e-invoicing"
              onChange={(e) => update("efrisDeviceId", e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="businessAddress">Address</Label>
            <Input
              id="businessAddress"
              value={s.businessAddress}
              placeholder="e.g. Plot 12, Kampala Road, Kampala"
              onChange={(e) => update("businessAddress", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Uganda VAT</CardTitle>
          <CardDescription>
            URA standard VAT is 18%. Applied to (subtotal − discount) on every sale.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="taxLabel">Tax label</Label>
            <Input id="taxLabel" value={s.taxLabel} onChange={(e) => update("taxLabel", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="taxRate">VAT rate (%)</Label>
            <Input
              id="taxRate"
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={(s.taxRate * 100).toFixed(2)}
              onChange={(e) => update("taxRate", Math.max(0, Number(e.target.value) || 0) / 100)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Withholding tax (WHT)</CardTitle>
          <CardDescription>
            For designated withholding agents. Deducted from the amount payable (6% is the
            common URA rate for goods and services).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[auto_1fr_1fr] sm:items-end">
          <div className="flex items-center gap-2">
            <input
              id="whtToggle"
              type="checkbox"
              className="h-4 w-4 accent-accent"
              checked={s.withholdingEnabled}
              onChange={(e) => update("withholdingEnabled", e.target.checked)}
            />
            <Label htmlFor="whtToggle" className="cursor-pointer">Enable WHT</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="whtRate">WHT rate (%)</Label>
            <Input
              id="whtRate"
              type="number"
              step="0.01"
              min={0}
              max={100}
              disabled={!s.withholdingEnabled}
              value={(s.withholdingRate * 100).toFixed(2)}
              onChange={(e) => update("withholdingRate", Math.max(0, Number(e.target.value) || 0) / 100)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            When enabled, WHT is shown on the receipt and deducted from the total.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Local Service Tax</CardTitle>
          <CardDescription>
            Optional flat add-on charged by some Ugandan local governments.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[auto_1fr_1fr] sm:items-end">
          <div className="flex items-center gap-2">
            <input
              id="lstToggle"
              type="checkbox"
              className="h-4 w-4 accent-accent"
              checked={s.localServiceTaxEnabled}
              onChange={(e) => update("localServiceTaxEnabled", e.target.checked)}
            />
            <Label htmlFor="lstToggle" className="cursor-pointer">Enable LST</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lstAmount">Flat amount (UGX)</Label>
            <Input
              id="lstAmount"
              type="number"
              min={0}
              disabled={!s.localServiceTaxEnabled}
              value={s.localServiceTax}
              onChange={(e) => update("localServiceTax", Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <p className="text-xs text-muted-foreground">Added once per sale, after VAT.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Automatic discount rules</CardTitle>
            <CardDescription>
              The best matching rule is suggested at checkout. Cashiers can still override the amount.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addRule}>
            <Plus className="mr-2 h-4 w-4" />Add rule
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {s.discountRules.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No rules yet. Add one to offer automatic discounts.
            </p>
          )}
          {s.discountRules.map((r) => (
            <div
              key={r.id}
              className="grid items-end gap-3 rounded-lg border border-border bg-card/50 p-3 sm:grid-cols-[1.4fr_1fr_0.8fr_1fr_auto]"
            >
              <div className="space-y-1.5">
                <Label className="text-xs">Label</Label>
                <Input value={r.label} onChange={(e) => updateRule(r.id, { label: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Min subtotal</Label>
                <Input
                  type="number"
                  min={0}
                  value={r.minSubtotal}
                  onChange={(e) => updateRule(r.id, { minSubtotal: Math.max(0, Number(e.target.value) || 0) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select
                  value={r.kind}
                  onValueChange={(v) => updateRule(r.id, { kind: v as DiscountRule["kind"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent</SelectItem>
                    <SelectItem value="fixed">Fixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {r.kind === "percent" ? "Percent off (%)" : "Amount off"}
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={r.value}
                  onChange={(e) => updateRule(r.id, { value: Math.max(0, Number(e.target.value) || 0) })}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => removeRule(r.id)}
                aria-label="Remove rule"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <p className="text-xs text-muted-foreground sm:col-span-5">
                Triggers when subtotal ≥ {currency(r.minSubtotal)} —{" "}
                {r.kind === "percent" ? `${r.value}% off` : `${currency(r.value)} off`}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
