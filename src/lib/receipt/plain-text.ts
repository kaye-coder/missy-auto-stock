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

/** One printed line plus the ESC/POS emphasis it should use. */
export interface ReceiptBlock {
  text: string;
  /** double width + height (half the columns) */
  double?: boolean;
  bold?: boolean;
  center?: boolean;
}

const clean = (s: string) => toPrinterSafe(s).replace(/\s+/g, " ").trim();

/** Word-boundary wrapping; only words longer than the full width are broken. */
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  const flush = () => {
    if (line) out.push(line);
    line = "";
  };
  for (const word of clean(text).split(" ")) {
    if (!word) continue;
    let w = word;
    // A single word wider than the paper must be broken, but only that word.
    while (w.length > width) {
      flush();
      out.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (!line.length) line = w;
    else if (line.length + 1 + w.length <= width) line += ` ${w}`;
    else {
      flush();
      line = w;
    }
  }
  flush();
  return out.length ? out : [""];
}

export function renderReceiptBlocks(
  r: ReceiptData,
  s: CheckoutSettings,
  paper: PaperSize,
): ReceiptBlock[] {
  const W = columnsFor(paper);
  const B: ReceiptBlock[] = [];

  const push = (text: string, extra: Partial<ReceiptBlock> = {}) => B.push({ text, ...extra });
  const blank = () => push("");

  const center = (t: string, extra: Partial<ReceiptBlock> = {}) => {
    const width = extra.double ? Math.floor(W / 2) : W;
    for (const line of wrap(t, width)) push(line, { center: true, ...extra });
  };

  /** Label left, value hard right on the same column for every line. */
  const pair = (k: string, v: string, extra: Partial<ReceiptBlock> = {}) => {
    const width = extra.double ? Math.floor(W / 2) : W;
    const val = clean(v);
    const indent = /^\s+/.exec(k)?.[0] ?? "";
    const keyWidth = width - val.length - 1 - indent.length;
    if (keyWidth < 4) {
      // Value nearly fills the line: label above, value right-aligned below.
      for (const line of wrap(k, width)) push(indent + line, extra);
      push(" ".repeat(Math.max(0, width - val.length)) + val, extra);
      return;
    }
    const keyLines = wrap(k, keyWidth).map((l) => indent + l);
    // Every line but the last is label overflow; the value rides the last one.
    for (const line of keyLines.slice(0, -1)) push(line, extra);
    const last = keyLines[keyLines.length - 1];
    push(last + " ".repeat(Math.max(1, width - last.length - val.length)) + val, extra);
  };
  const rule = (ch = "-") => push(ch.repeat(W));

  // Header — centred branding
  center((s.businessName || "Missy").toUpperCase(), { double: true, bold: true });
  if (s.businessAddress) center(s.businessAddress);
  if (s.businessPhone) center(`Tel: ${s.businessPhone}`);
  if (s.tinNumber) center(`TIN: ${s.tinNumber}`);
  rule("=");

  // Transaction details — left labels, right values
  pair("Receipt", r.receiptNumber);
  pair("Date", dateTime(r.createdAt));
  pair("Cashier", r.cashier ?? "-");
  pair("Customer", r.customerName ?? "Walk-in");
  pair("Payment", r.paymentMethod.toUpperCase());
  rule();

  // Items — name wrapped on its own lines, qty x price with total right-aligned
  push("ITEMS", { bold: true });
  blank();
  for (const l of r.lines) {
    for (const line of wrap(l.name, W)) push(line);
    pair(`  ${l.qty} x ${currency(l.unit_price)}`, currency(l.qty * l.unit_price));
  }
  blank();
  rule();

  // Money block — every value right-aligned to the same column
  pair("Subtotal", currency(r.subtotal));
  if (r.discount > 0) pair("Discount", `-${currency(r.discount)}`);
  pair(`${r.taxLabel} (${(r.taxRate * 100).toFixed(0)}%)`, currency(r.tax));
  if (r.wht && r.wht > 0)
    pair(`WHT (${((r.whtRate ?? 0) * 100).toFixed(0)}%)`, `-${currency(r.wht)}`);
  if (r.lst && r.lst > 0) pair("Local Service Tax", currency(r.lst));
  rule("=");
  pair("TOTAL", currency(r.total), { double: true, bold: true });
  rule("=");
  if (typeof r.amountPaid === "number") pair("Amount Paid", currency(r.amountPaid), { bold: true });
  if (r.balanceDue && r.balanceDue > 0) pair("Balance Due", currency(r.balanceDue), { bold: true });

  // Footer — centred
  blank();
  center("Thank you!", { bold: true });
  center("Please keep this receipt for your records.");


  return B.map((b) => ({ ...b, text: toPrinterSafe(b.text) }));
}

export function renderReceiptText(
  r: ReceiptData,
  s: CheckoutSettings,
  paper: PaperSize,
): string {
  const W = columnsFor(paper);
  return renderReceiptBlocks(r, s, paper)
    .map((b) => {
      const width = b.double ? Math.floor(W / 2) : W;
      if (!b.center) return b.text;
      const pad = Math.max(0, Math.floor((width - b.text.length) / 2));
      return " ".repeat(pad) + b.text;
    })
    .join("\n");
}

/** Standalone monospace document used for preview and for the print job. */
export function buildTextDocument(
  r: ReceiptData,
  s: CheckoutSettings,
  paper: PaperSize,
  _autoPrint = false,
  logoSrc?: string,
): string {
  const p = PAPER_PROFILES[paper];
  const blocks = renderReceiptBlocks(r, s, paper);
  /**
   * Readable thermal sizing: ~32 chars across 58mm means roughly 1.6mm per
   * character, i.e. a 15px monospace body instead of the previous 11px.
   */
  const fontPx = paper === "58mm" ? 15 : 16;
  const logoHeightMm = logoSrc ? Math.min(22, Math.round(p.widthMm * 0.35)) : 0;
  const logo = logoSrc
    ? `<img class="logo" src="${escapeHtml(logoSrc)}" alt="${escapeHtml(s.businessName || "Missy")}" />`
    : "";
  const body = blocks
    .map((b) => {
      const cls = [b.double ? "d" : "", b.bold ? "b" : "", b.center ? "c" : ""]
        .filter(Boolean)
        .join(" ");
      return `<div class="line${cls ? " " + cls : ""}">${escapeHtml(b.text) || "&nbsp;"}</div>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8" />
<title>Receipt ${escapeHtml(r.receiptNumber)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000;
    width: ${p.widthMm}mm; overflow: visible; }
  .receipt-paper { width: ${p.widthMm}mm; padding: 2mm; overflow: visible;
    page-break-inside: avoid; break-inside: avoid; page-break-after: avoid; break-after: avoid; }
  .logo { display: block; margin: 1mm auto; width: ${Math.round(p.widthMm * 0.55)}mm;
    max-height: ${logoHeightMm || 18}mm; object-fit: contain; filter: grayscale(1) contrast(2); }
  .line { font-family: "Courier New", Courier, monospace; font-size: ${fontPx}px;
    line-height: 1.2; font-weight: 600; white-space: pre; color: #000;
    page-break-inside: avoid; break-inside: avoid; }
  .line.b { font-weight: 900; }
  .line.d { font-size: ${Math.round(fontPx * 1.9)}px; font-weight: 900; letter-spacing: -0.5px; }
  .line.c { text-align: center; }
</style></head><body><div class="receipt-paper">${logo}${body}</div>
</body></html>`;
}
