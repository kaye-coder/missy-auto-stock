import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { localDb as supabase } from "@/lib/local-client";
import { currency, dateTime } from "@/lib/format";
import { getSession } from "@/lib/auth";
import { printReceipt } from "@/lib/receipt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Printer, Wallet } from "lucide-react";
import type { Customer, Sale } from "@/lib/db-types";

export interface CustomerPayment {
  id: string;
  customer_id: string;
  payment_number: string;
  amount: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
}

export function CustomerAccountDialog({
  customer,
  onOpenChange,
}: {
  customer: Customer | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const customerId = customer?.id;

  const { data: sales = [] } = useQuery({
    queryKey: ["customer-sales", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales" as never)
        .select("*")
        .eq("customer_id", customerId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Sale[];
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["customer-payments", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_payments" as never)
        .select("*")
        .eq("customer_id", customerId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CustomerPayment[];
    },
  });

  const creditSales = useMemo(
    () => sales.filter((s) => s.balance_due > 0 || s.payment_method === "credit"),
    [sales],
  );
  const balance = useMemo(
    () => sales.reduce((sum, s) => sum + Number(s.balance_due || 0), 0),
    [sales],
  );

  const printPaymentReceipt = (paid: number, remaining: number, ref: string) => {
    printReceipt({
      receiptNumber: ref,
      createdAt: new Date().toISOString(),
      cashier: getSession()?.fullName,
      customerName: customer?.name,
      paymentMethod: method,
      lines: [{ name: "Payment on account", qty: 1, unit_price: paid }],
      subtotal: paid,
      discount: 0,
      tax: 0,
      taxLabel: "VAT",
      taxRate: 0,
      total: paid,
      amountPaid: paid,
      balanceDue: remaining,
    });
  };

  const record = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!customerId) throw new Error("No customer selected");
      if (!Number.isFinite(value) || value <= 0) throw new Error("Enter a valid amount");
      if (value > balance + 0.5) throw new Error("Amount is more than the outstanding balance");
      const { data, error } = await supabase
        .from("customer_payments" as never)
        .insert({
          customer_id: customerId,
          amount: value,
          payment_method: method,
          notes: notes.trim() || null,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as CustomerPayment;
    },
    onSuccess: (payment) => {
      const remaining = Math.max(0, balance - Number(payment.amount));
      toast.success(`Payment of ${currency(payment.amount)} recorded`);
      printPaymentReceipt(Number(payment.amount), remaining, payment.payment_number);
      setAmount("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["customer-sales", customerId] });
      qc.invalidateQueries({ queryKey: ["customer-payments", customerId] });
      qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!customer} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer?.name} — account</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total owed</p>
          <p className="text-3xl font-semibold text-primary">{currency(balance)}</p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Record payment</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="mobile">Mobile money</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={() => record.mutate()}
                disabled={record.isPending || balance <= 0}
              >
                <Wallet className="h-4 w-4" />
                {record.isPending ? "Saving…" : "Record payment"}
              </Button>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Credit sales</h3>
          <div className="rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creditSales.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No credit sales.</TableCell></TableRow>
                ) : creditSales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.receipt_number}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{dateTime(s.created_at)}</TableCell>
                    <TableCell className="text-right">{currency(s.total)}</TableCell>
                    <TableCell className="text-right">{currency(s.amount_paid)}</TableCell>
                    <TableCell className="text-right font-medium">{currency(s.balance_due)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Payments</h3>
          <div className="rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No payments yet.</TableCell></TableRow>
                ) : payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.payment_number}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{dateTime(p.created_at)}</TableCell>
                    <TableCell className="capitalize">{p.payment_method}</TableCell>
                    <TableCell className="text-right">{currency(p.amount)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => printPaymentReceipt(Number(p.amount), balance, p.payment_number)}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
