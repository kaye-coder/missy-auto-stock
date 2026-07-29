import { currency, dateTime } from "@/lib/format";
import type { CheckoutSettings } from "@/lib/settings";
import { toPrinterSafe } from "./encoding";
import { escapeHtml } from "./encoding";
import { PAPER_PROFILES, type PaperSize, type ReceiptData } from "./types";

/**
 * Thermal receipt renderer.
 *
 * Thermal printers are character devices: they render a fixed-pitch font from a
 * legacy code page. Sending them proportional fonts, colours, images or Unicode
 * punctuation is what produces the garbled output. Everything below is plain
 * ASCII laid out on a fixed character grid (32 cols at 58mm, 42 at 80mm).
 */
export function columnsFor(paper: PaperSize): number {
  return paper === "58mm" ? 32 : 42;
}

const clean = (s: string) => toPrinterSafe(s).replace(/\s+/g, " ").trim();

function wrap(text: string, width: number): string[] {
  const words = clean(text).split(" ");
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if (!line.length) line = w.slice(0, width);
    else if (line.length + 1 + w.length <= width) line += ` ${w}`;
    else {
      out.push(line);
      line = w.slice(0, width);
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

export function renderReceiptText(
  r: ReceiptData,
  s: CheckoutSettings,
  paper: PaperSize,
): string {
  const W = columnsFor(paper);
  const L: string[] = [];

  const center = (t: string) => {
    for (const line of wrap(t, W)) {
      const pad = Math.max(0, Math.floor((W - line.length) / 2));
      L.push(" ".repeat(pad) + line);
    }
  };
  const pair = (k: string, v: string) => {
    const key = clean(k);
    const val = clean(v);
    const space = Math.max(1, W - key.length - val.length);
    if (key.length + val.length + 1 > W) {
      L.push(key.slice(0, W));
      L.push(" ".repeat(Math.max(0, W - val.length)) + val);
    } else {
      L.push(key + " ".repeat(space) + val);
    }
  };
  const rule = (ch = "-") => L.push(ch.repeat(W));

  center((s.businessName || "Missy").toUpperCase());
  if (s.businessAddress) center(s.businessAddress);
  if (s.businessPhone) center(`Tel: ${s.businessPhone}`);
  if (s.tinNumber) center(`TIN: ${s.tinNumber}`);
  rule("=");

  pair("Receipt", r.receiptNumber);
  pair("Date", dateTime(r.createdAt));
  pair("Cashier", r.cashier ?? "-");
  pair("Customer", r.customerName ?? "Walk-in");
  pair("Payment", r.paymentMethod.toUpperCase());
  rule();

  L.push("ITEM");
  for (const l of r.lines) {
    for (const line of wrap(l.name, W)) L.push(line);
    pair(`  ${l.qty} x ${currency(l.unit_price)}`, currency(l.qty * l.unit_price));
  }
  rule();

  pair("Subtotal", currency(r.subtotal));
  if (r.discount > 0) pair("Discount", `-${currency(r.discount)}`);
  pair(`${r.taxLabel} (${(r.taxRate * 100).toFixed(0)}%)`, currency(r.tax));
  if (r.wht && r.wht > 0)
    pair(`WHT (${((r.whtRate ?? 0) * 100).toFixed(0)}%)`, `-${currency(r.wht)}`);
  if (r.lst && r.lst > 0) pair("Local Service Tax", currency(r.lst));
  rule("=");
  pair("TOTAL", currency(r.total));
  if (typeof r.amountPaid === "number") pair("Amount Paid", currency(r.amountPaid));
  if (r.balanceDue && r.balanceDue > 0) pair("Balance Due", currency(r.balanceDue));
  rule("=");
  center("Thank you!");
  center("Please keep this receipt.");
  L.push("");
  L.push("");
  L.push("");

  return L.map((line) => toPrinterSafe(line)).join("\n");
}

/** Standalone monospace document used for preview and for the print job. */
export function buildTextDocument(
  r: ReceiptData,
  s: CheckoutSettings,
  paper: PaperSize,
  autoPrint = true,
  logoSrc?: string,
): string {
  const p = PAPER_PROFILES[paper];
  const text = renderReceiptText(r, s, paper);
  const fontPx = paper === "58mm" ? 11 : 12;
  const logo = logoSrc
    ? `<img class="logo" src="${escapeHtml(logoSrc)}" alt="${escapeHtml(s.businessName || "Missy")}" />`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8" />
<title>Receipt ${escapeHtml(r.receiptNumber)}</title>
<style>
  @page { size: ${p.widthMm}mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000;
    width: ${p.widthMm}mm; height: auto; overflow: visible; }
  .logo { display: block; margin: 2mm auto 0; width: ${Math.round(p.widthMm * 0.55)}mm;
    filter: grayscale(1) contrast(2); }
  pre { margin: 0; padding: 2mm; width: ${p.widthMm}mm; box-sizing: border-box;
    font-family: "Courier New", Courier, monospace;
    font-size: ${fontPx}px; line-height: 1.25; font-weight: 700;
    white-space: pre; letter-spacing: 0; color: #000;
    height: auto; max-height: none; overflow: visible; }
  @media print { html, body { width: ${p.widthMm}mm; height: auto; overflow: visible; }
    pre { page-break-inside: auto; break-inside: auto; } }
</style></head><body>${logo}<pre>${escapeHtml(text)}</pre>
${autoPrint ? `<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();setTimeout(function(){window.close();},400);},120);});window.addEventListener('afterprint',function(){window.close();});</script>` : ""}
</body></html>`;
}
