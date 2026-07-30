import { jsPDF } from "jspdf";
import { currency, dateTime } from "@/lib/format";
import { loadSettings } from "@/lib/settings";
import { toPrinterSafe } from "./encoding";
import { PAPER_PROFILES, type PaperSize, type ReceiptData } from "./types";
import { CONTACT_LINES } from "./contact";

/**
 * Renders the same receipt layout as a PDF (identical content, widths and
 * alignment) so "Download PDF" matches what the printer produces.
 */
export function downloadReceiptPdf(r: ReceiptData, paper: PaperSize): void {
  const s = loadSettings();
  const profile = PAPER_PROFILES[paper];
  const isA4 = paper === "a4";
  const widthMm = isA4 ? 210 : profile.widthMm;
  const colW = profile.widthMm;
  const marginMm = isA4 ? (210 - colW) / 2 : 4;
  const inner = colW - (isA4 ? 0 : 8);

  const doc = new jsPDF({
    unit: "mm",
    format: isA4 ? "a4" : [widthMm, 300],
    orientation: "portrait",
  });

  const left = marginMm;
  const right = marginMm + inner;
  let y = 10;

  const t = (text: string) => toPrinterSafe(text);
  const line = (kind: "dash" | "solid" = "dash") => {
    doc.setDrawColor(kind === "solid" ? 40 : 150);
    doc.setLineWidth(kind === "solid" ? 0.5 : 0.2);
    doc.line(left, y, right, y);
    y += 3.5;
  };
  const pair = (k: string, v: string, size = 8, bold = false) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(t(k), left, y);
    doc.text(t(v), right, y, { align: "right" });
    y += size * 0.52;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(190, 24, 93);
  doc.text(t(s.businessName || "Missy"), left + inner / 2, y, { align: "center" });
  y += 5;
  doc.setTextColor(90);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  for (const info of [
    s.businessAddress,
    s.businessPhone ? `Tel: ${s.businessPhone}` : "",
    s.tinNumber ? `TIN: ${s.tinNumber}` : "",
  ].filter(Boolean)) {
    doc.text(t(info), left + inner / 2, y, { align: "center" });
    y += 3.4;
  }
  doc.setTextColor(20);
  y += 2;
  line();

  pair("Receipt", r.receiptNumber);
  pair("Date", dateTime(r.createdAt));
  pair("Cashier", r.cashier ?? "-");
  pair("Customer", r.customerName ?? "Walk-in");
  pair("Payment", r.paymentMethod.toUpperCase());
  y += 1;
  line();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("ITEMS", left, y);
  y += 4.5;

  for (const l of r.lines) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const nameLines = doc.splitTextToSize(t(l.name), inner - 25) as string[];
    doc.text(nameLines, left, y);
    doc.text(t(currency(l.qty * l.unit_price)), right, y, { align: "right" });
    y += nameLines.length * 3.6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(110);
    doc.text(t(`${l.qty} x ${currency(l.unit_price)}`), left, y);
    doc.setTextColor(20);
    y += 4;
  }

  line();
  pair("Subtotal", currency(r.subtotal));
  if (r.discount > 0) pair("Discount", `-${currency(r.discount)}`);
  pair(`${r.taxLabel} (${(r.taxRate * 100).toFixed(0)}%)`, currency(r.tax));
  if (r.wht && r.wht > 0) pair(`WHT (${((r.whtRate ?? 0) * 100).toFixed(0)}%)`, `-${currency(r.wht)}`);
  if (r.lst && r.lst > 0) pair("Local Service Tax", currency(r.lst));
  if (r.fee && r.fee > 0) pair(r.feeLabel ?? "Fee", currency(r.fee));
  y += 1;
  line("solid");
  pair("TOTAL", currency(r.total), 11, true);
  if (typeof r.amountPaid === "number") pair("Amount Paid", currency(r.amountPaid));
  if (r.balanceDue && r.balanceDue > 0) pair("Balance Due", currency(r.balanceDue));
  y += 1;
  line("solid");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(190, 24, 93);
  doc.text("Thank you! <3", left + inner / 2, y + 2, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(110);
  doc.text("Please keep this receipt for your records.", left + inner / 2, y + 6, { align: "center" });
  CONTACT_LINES.forEach((contact, i) => {
    doc.text(contact, left + inner / 2, y + 10 + i * 3.5, { align: "center" });
  });

  doc.save(`${r.receiptNumber}.pdf`);
}
