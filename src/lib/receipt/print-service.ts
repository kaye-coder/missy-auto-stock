import { loadSettings } from "@/lib/settings";
import { buildReceiptDocument } from "./template";
import { buildTextDocument } from "./plain-text";
import { PAPER_PROFILES, type PaperSize, type ReceiptData } from "./types";

export class PrintError extends Error {}

/**
 * Sends the receipt to the system print pipeline (CUPS/AirPrint on macOS).
 *
 * Thermal profiles (58mm / 80mm) are printed as fixed-pitch ASCII text — no
 * images, no web fonts, no Unicode punctuation — which is what thermal
 * printers can actually render. A4 keeps the styled HTML layout.
 *
 * Printing happens from a hidden iframe in the current tab so no extra tab or
 * confirmation step appears. With the browser launched in kiosk-printing mode
 * (or a default printer set) the job goes straight to the printer.
 */
export function printReceiptDocument(data: ReceiptData, paper: PaperSize): void {
  const settings = loadSettings();
  const html = PAPER_PROFILES[paper].thermal
    ? buildTextDocument(data, settings, paper, false)
    : buildReceiptDocument(data, settings, paper, false);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    visibility: "hidden",
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

  const fire = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(() => iframe.remove(), 2000);
    }
  };

  if (PAPER_PROFILES[paper].thermal) {
    // Text-only: nothing to wait for.
    window.setTimeout(fire, 60);
  } else {
    window.setTimeout(fire, 500);
  }
}
