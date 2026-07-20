import logoAsset from "@/lib/logo";
import { currency, dateTime } from "@/lib/format";
import { loadSettings, type CheckoutSettings } from "@/lib/settings";

export interface ReceiptLine {
  name: string;
  qty: number;
  unit_price: number;
}

export interface ReceiptData {
  receiptNumber: string;
  createdAt: string;
  cashier?: string;
  customerName?: string;
  paymentMethod: string;
  lines: ReceiptLine[];
  subtotal: number;
  discount: number;
  tax: number;
  taxLabel: string;
  taxRate: number;
  wht?: number;
  whtRate?: number;
  lst?: number;
  total: number;
  amountPaid?: number;
  balanceDue?: number;
}

const logoUrl = (() => {
  if (typeof window === "undefined") return logoAsset.url;
  return new URL(logoAsset.url, window.location.origin).href;
})();

function buildHtml(r: ReceiptData, settings: CheckoutSettings): string {
  const rows = r.lines
    .map(
      (l) => `
      <tr>
        <td class="name">${escapeHtml(l.name)}<div class="sub">${l.qty} × ${currency(l.unit_price)}</div></td>
        <td class="amt">${currency(l.qty * l.unit_price)}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt ${escapeHtml(r.receiptNumber)}</title>
<style>
  :root { --pink: #ec4899; --pink-dark: #be185d; --ink: #1f1f1f; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: var(--ink); font-family: 'Helvetica Neue', Arial, sans-serif; }
  .receipt { width: 80mm; margin: 0 auto; padding: 6mm 5mm; }
  .head { text-align: center; border-bottom: 2px dashed var(--pink); padding-bottom: 8px; margin-bottom: 10px; }
  .head img { max-width: 55mm; max-height: 25mm; object-fit: contain; }
  .brand { font-weight: 800; color: var(--pink-dark); font-size: 14px; margin-top: 4px; letter-spacing: .5px; }
  .bizinfo { font-size: 10.5px; color: #555; margin-top: 2px; }
  .meta { font-size: 11px; margin: 8px 0; }
  .meta div { display: flex; justify-content: space-between; padding: 1px 0; }
  .meta .k { color: #666; }
  h2 { font-size: 12px; margin: 10px 0 4px; color: var(--pink-dark); text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid var(--pink); padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td { padding: 4px 0; vertical-align: top; }
  td.name { padding-right: 6px; }
  td.amt { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .sub { font-size: 10px; color: #777; margin-top: 1px; }
  .totals { margin-top: 8px; border-top: 1px dashed var(--pink); padding-top: 6px; font-size: 12px; }
  .totals .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .totals .grand { font-size: 15px; font-weight: 800; color: var(--pink-dark); border-top: 2px solid var(--pink); margin-top: 6px; padding-top: 6px; }
  .foot { text-align: center; margin-top: 12px; font-size: 11px; color: #555; border-top: 2px dashed var(--pink); padding-top: 8px; }
  .foot .thanks { color: var(--pink-dark); font-weight: 700; font-size: 13px; margin-bottom: 3px; }
  @media print {
    @page { size: 80mm auto; margin: 0; }
    body { background: #fff; }
    .receipt { width: 80mm; padding: 4mm 4mm 8mm; }
  }
</style>
</head>
<body>
  <div class="receipt">
    <div class="head">
      <img src="${logoUrl}" alt="${escapeHtml(settings.businessName)}" />
      <div class="brand">${escapeHtml(settings.businessName)}</div>
      ${settings.businessAddress ? `<div class="bizinfo">${escapeHtml(settings.businessAddress)}</div>` : ""}
      ${settings.businessPhone ? `<div class="bizinfo">Tel: ${escapeHtml(settings.businessPhone)}</div>` : ""}
      ${settings.tinNumber ? `<div class="bizinfo">TIN: ${escapeHtml(settings.tinNumber)}</div>` : ""}
    </div>

    <div class="meta">
      <div><span class="k">Receipt</span><span>${escapeHtml(r.receiptNumber)}</span></div>
      <div><span class="k">Date</span><span>${escapeHtml(dateTime(r.createdAt))}</span></div>
      <div><span class="k">Cashier</span><span>${escapeHtml(r.cashier ?? "—")}</span></div>
      <div><span class="k">Customer</span><span>${escapeHtml(r.customerName ?? "Walk-in")}</span></div>
      <div><span class="k">Payment</span><span>${escapeHtml(r.paymentMethod.toUpperCase())}</span></div>
    </div>

    <h2>Items</h2>
    <table>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${currency(r.subtotal)}</span></div>
      ${r.discount > 0 ? `<div class="row"><span>Discount</span><span>−${currency(r.discount)}</span></div>` : ""}
      <div class="row"><span>${escapeHtml(r.taxLabel)} (${(r.taxRate * 100).toFixed(0)}%)</span><span>${currency(r.tax)}</span></div>
      ${r.wht && r.wht > 0 ? `<div class="row"><span>WHT (${((r.whtRate ?? 0) * 100).toFixed(0)}%)</span><span>−${currency(r.wht)}</span></div>` : ""}
      ${r.lst && r.lst > 0 ? `<div class="row"><span>Local Service Tax</span><span>${currency(r.lst)}</span></div>` : ""}
      <div class="row grand"><span>TOTAL</span><span>${currency(r.total)}</span></div>
      ${typeof r.amountPaid === "number" ? `<div class="row"><span>Amount paid</span><span>${currency(r.amountPaid)}</span></div>` : ""}
      ${r.balanceDue && r.balanceDue > 0 ? `<div class="row" style="color:var(--pink-dark);font-weight:700"><span>Balance due</span><span>${currency(r.balanceDue)}</span></div>` : ""}
    </div>

    <div class="foot">
      <div class="thanks">Thank you! ♥</div>
      <div>Please keep this receipt for your records.</div>
    </div>
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 250);
      window.addEventListener('afterprint', function () { window.close(); });
    });
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/**
 * Opens the receipt in a new window and triggers the browser print dialog.
 * - If a thermal / receipt printer is installed on the machine, the user selects it in the dialog.
 * - If none is available, the user can "Save as PDF" from the same dialog to get a PDF receipt.
 */
export function printReceipt(data: ReceiptData): void {
  const html = buildHtml(data, loadSettings());
  const w = window.open("", "_blank", "width=420,height=680");
  if (!w) {
    // Popup blocked — fall back to in-tab print.
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
    }
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1000);
    }, 400);
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
