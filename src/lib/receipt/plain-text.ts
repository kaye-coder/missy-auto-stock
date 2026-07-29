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

  L.push("ITEMS");
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
  center("Please keep this receipt for your records.");
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
  const lineHeightPx = fontPx * 1.25;
  const lineHeightMm = lineHeightPx * 0.264583;
  const logoHeightMm = logoSrc ? Math.min(22, Math.round(p.widthMm * 0.35)) : 0;
  const neededMm = Math.ceil(text.split("\n").length * lineHeightMm + logoHeightMm + 18);
  /**
   * Thermal drivers (e.g. YICHIP) only expose fixed media heights — 210mm,
   * 297mm, 3276mm. An arbitrary @page height makes CUPS fall back to its own
   * media and clip the receipt, which is why only the last lines printed.
   * Snap to the nearest supported height instead.
   */
  const SUPPORTED_HEIGHTS_MM = [210, 297, 3276];
  const pageHeightMm = p.thermal
    ? (SUPPORTED_HEIGHTS_MM.find((h) => neededMm <= h) ?? 3276)
    : Math.max(120, neededMm);
  const logo = logoSrc
    ? `<img class="logo" src="${escapeHtml(logoSrc)}" alt="${escapeHtml(s.businessName || "Missy")}" />`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8" />
<title>Receipt ${escapeHtml(r.receiptNumber)}</title>
<style>
  @page { size: ${p.widthMm}mm ${pageHeightMm}mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000;
    width: ${p.widthMm}mm; min-height: ${pageHeightMm}mm; overflow: visible; }
  body { display: block; }
  .receipt-paper { width: ${p.widthMm}mm; min-height: ${pageHeightMm}mm; overflow: visible; }
  .logo { display: block; margin: 2mm auto 1mm; width: ${Math.round(p.widthMm * 0.55)}mm;
    max-height: ${logoHeightMm || 18}mm; object-fit: contain; filter: grayscale(1) contrast(2); }
  pre { display: block; margin: 0; padding: 2mm; width: ${p.widthMm}mm;
    font-family: "Courier New", Courier, monospace;
    font-size: ${fontPx}px; line-height: 1.25; font-weight: 700;
    white-space: pre; letter-spacing: 0; color: #000;
    min-height: ${Math.max(20, pageHeightMm - logoHeightMm - 6)}mm; overflow: visible; }
  @media print { html, body { width: ${p.widthMm}mm; height: auto; overflow: visible; }
    .receipt-paper, pre { page-break-inside: auto; break-inside: auto; overflow: visible; } }
</style></head><body><div class="receipt-paper">${logo}<pre>${escapeHtml(text)}</pre></div>
${autoPrint ? `<script>(function(){var printed=false;function readyImages(){var imgs=Array.prototype.slice.call(document.images||[]);return Promise.all(imgs.map(function(i){return i.complete?Promise.resolve():new Promise(function(res){i.addEventListener('load',res,{once:true});i.addEventListener('error',res,{once:true});setTimeout(res,2000);});}));}function go(){if(printed)return;printed=true;setTimeout(function(){window.focus();window.print();},250);}window.addEventListener('afterprint',function(){setTimeout(function(){window.close();},1500);});window.addEventListener('load',function(){readyImages().then(go);setTimeout(go,3000);});})();</script>` : ""}
</body></html>`;
}
