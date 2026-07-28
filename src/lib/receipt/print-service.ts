import { loadSettings } from "@/lib/settings";
import { buildReceiptDocument } from "./template";
import type { PaperSize, ReceiptData } from "./types";

export class PrintError extends Error {}

/**
 * Sends the receipt to the macOS print system (CUPS/AirPrint) through the
 * browser print pipeline, so any installed printer — USB, Bluetooth, network,
 * AirPrint, thermal or A4 — works with no extra setup.
 */
export function printReceiptDocument(data: ReceiptData, paper: PaperSize): void {
  const html = buildReceiptDocument(data, loadSettings(), paper, true);

  const w = window.open("", "_blank", "width=420,height=680");
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    return;
  }

  // Popup blocked — print from a hidden iframe in the current tab instead.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new PrintError("Printing failed. Please try again.");
  }
  doc.open();
  doc.write(html);
  doc.close();
  window.setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(() => iframe.remove(), 1500);
    }
  }, 500);
}
