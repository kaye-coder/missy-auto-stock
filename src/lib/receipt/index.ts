export * from "./types";
export * from "./encoding";
export * from "./template";
export * from "./plain-text";
export { printReceiptDocument, PrintError } from "./print-service";
export { downloadReceiptPdf } from "./pdf-service";

import { printReceiptDocument } from "./print-service";
import { loadPaperSize, type ReceiptData } from "./types";

/** Backwards-compatible one-shot print using the saved paper profile. */
export function printReceipt(data: ReceiptData): void {
  printReceiptDocument(data, loadPaperSize());
}
