import { currency, dateTime } from "@/lib/format";
import type { CheckoutSettings } from "@/lib/settings";
import logoAsset from "@/lib/logo";
import { safe } from "./encoding";
import { PAPER_PROFILES, type PaperSize, type ReceiptData } from "./types";

export const receiptLogoUrl = (() => {
  if (typeof window === "undefined") return logoAsset.url;
  return new URL(logoAsset.url, window.location.origin).href;
})();

const money = (n: number) => safe(currency(n));

/** Print + preview stylesheet. Identical rules drive screen preview and paper. */
export function buildReceiptStyles(paper: PaperSize): string {
  const p = PAPER_PROFILES[paper];
  const pageRule = p.thermal
    ? `@page { size: ${p.widthMm}mm auto; margin: 0; }`
    : `@page { size: A4 portrait; margin: 8mm; }`;

  return `
  :root { --pink: #ec4899; --pink-dark: #be185d; --ink: #141414; --muted: #5b5b5b; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: var(--ink);
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased; }
  .receipt { width: ${p.widthMm}mm; margin: auto; padding: 4mm; font-size: ${p.baseFontPx}px; line-height: 1.35; }
  .head { text-align: center; padding-bottom: 8px; }
  .head img { max-width: ${Math.round(p.widthMm * 0.6)}mm; max-height: 22mm; object-fit: contain; }
  .brand { font-weight: 800; font-size: ${p.baseFontPx + 4}px; color: var(--pink-dark); margin-top: 4px; letter-spacing: .4px; }
  .bizinfo { font-size: ${p.baseFontPx - 1.5}px; color: var(--muted); margin-top: 1px; }
  .rule { border-top: 1px dashed #999; margin: 8px 0; }
  .rule.solid { border-top: 2px solid #333; }
  .row { display: flex; justify-content: space-between; gap: 8px; padding: 1.5px 0; }
  .row .k { color: var(--muted); }
  .row .v { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  h2 { font-size: ${p.baseFontPx - 0.5}px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
    margin: 8px 0 4px; color: var(--ink); }
  .item { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; }
  .item .name { font-weight: 600; word-break: break-word; }
  .item .qty { font-size: ${p.baseFontPx - 1.5}px; color: var(--muted); margin-top: 1px; font-weight: 400; }
  .item .amt { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .grand { display: flex; justify-content: space-between; font-size: ${p.baseFontPx + 4}px; font-weight: 800;
    padding: 5px 0; }
  .foot { text-align: center; margin-top: 10px; font-size: ${p.baseFontPx - 1}px; color: var(--muted); }
  .foot .thanks { color: var(--pink-dark); font-weight: 800; font-size: ${p.baseFontPx + 1}px; margin-bottom: 3px; }
  @media print {
    ${pageRule}
    html, body { width: ${p.thermal ? `${p.widthMm}mm` : "auto"}; background: #fff;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .receipt { page-break-inside: avoid; break-inside: avoid; }
    .item, .row, .foot, .head, .grand { page-break-inside: avoid; break-inside: avoid; }
  }`;
}

/** The receipt markup itself — shared by the preview and the print document. */
export function buildReceiptBody(r: ReceiptData, s: CheckoutSettings): string {
  const items = r.lines
    .map(
      (l) => `
      <div class="item">
        <div class="name">${safe(l.name)}<div class="qty">${l.qty} x ${money(l.unit_price)}</div></div>
        <div class="amt">${money(l.qty * l.unit_price)}</div>
      </div>`,
    )
    .join("");

  const meta = [
    ["Receipt", safe(r.receiptNumber)],
    ["Date", safe(dateTime(r.createdAt))],
    ["Cashier", safe(r.cashier ?? "-")],
    ["Customer", safe(r.customerName ?? "Walk-in")],
    ["Payment", safe(r.paymentMethod.toUpperCase())],
  ]
    .map(([k, v]) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`)
    .join("");

  return `
  <div class="receipt">
    <div class="head">
      <img src="${receiptLogoUrl}" alt="${safe(s.businessName)}" />
      <div class="brand">${safe(s.businessName)}</div>
      ${s.businessAddress ? `<div class="bizinfo">${safe(s.businessAddress)}</div>` : ""}
      ${s.businessPhone ? `<div class="bizinfo">Tel: ${safe(s.businessPhone)}</div>` : ""}
      ${s.tinNumber ? `<div class="bizinfo">TIN: ${safe(s.tinNumber)}</div>` : ""}
    </div>
    <div class="rule"></div>
    ${meta}
    <div class="rule"></div>
    <h2>Items</h2>
    ${items}
    <div class="rule"></div>
    <div class="row"><span class="k">Subtotal</span><span class="v">${money(r.subtotal)}</span></div>
    ${r.discount > 0 ? `<div class="row"><span class="k">Discount</span><span class="v">-${money(r.discount)}</span></div>` : ""}
    <div class="row"><span class="k">${safe(r.taxLabel)} (${(r.taxRate * 100).toFixed(0)}%)</span><span class="v">${money(r.tax)}</span></div>
    ${r.wht && r.wht > 0 ? `<div class="row"><span class="k">WHT (${((r.whtRate ?? 0) * 100).toFixed(0)}%)</span><span class="v">-${money(r.wht)}</span></div>` : ""}
    ${r.lst && r.lst > 0 ? `<div class="row"><span class="k">Local Service Tax</span><span class="v">${money(r.lst)}</span></div>` : ""}
    <div class="rule solid"></div>
    <div class="grand"><span>TOTAL</span><span>${money(r.total)}</span></div>
    ${typeof r.amountPaid === "number" ? `<div class="row"><span class="k">Amount Paid</span><span class="v">${money(r.amountPaid)}</span></div>` : ""}
    ${r.balanceDue && r.balanceDue > 0 ? `<div class="row"><span class="k">Balance Due</span><span class="v">${money(r.balanceDue)}</span></div>` : ""}
    <div class="rule solid"></div>
    <div class="foot">
      <div class="thanks">Thank you! &lt;3</div>
      <div>Please keep this receipt for your records.</div>
    </div>
  </div>`;
}

/** Full standalone HTML document used by the print window. */
export function buildReceiptDocument(
  r: ReceiptData,
  s: CheckoutSettings,
  paper: PaperSize,
  autoPrint = true,
): string {
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Receipt ${safe(r.receiptNumber)}</title>
<style>${buildReceiptStyles(paper)}</style>
</head><body>${buildReceiptBody(r, s)}
${
  autoPrint
    ? `<script>
  var printed = false;
  function go(){ if (printed) return; printed = true; window.focus(); window.print(); }
  window.addEventListener('afterprint', function(){ window.close(); });
  window.addEventListener('load', function(){
    var imgs = Array.prototype.slice.call(document.images);
    Promise.all(imgs.map(function(i){
      return i.complete ? Promise.resolve() : new Promise(function(res){
        i.addEventListener('load', res); i.addEventListener('error', res);
      });
    })).then(function(){ setTimeout(go, 200); });
    setTimeout(go, 2500);
  });
</script>`
    : ""
}
</body></html>`;
}
