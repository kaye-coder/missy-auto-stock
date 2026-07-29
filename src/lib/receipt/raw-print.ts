import { loadSettings } from "@/lib/settings";
import { renderReceiptBlocks } from "./plain-text";
import { PAPER_PROFILES, type PaperSize, type ReceiptData } from "./types";

/**
 * Sends the receipt to the locally attached thermal printer as a raw ESC/POS
 * stream through CUPS. Raw streams are continuous — no page size, no page
 * breaks, no blank leading page — which is what the browser print path could
 * never guarantee.
 */
export async function printRawReceipt(data: ReceiptData, paper: PaperSize): Promise<boolean> {
  if (!PAPER_PROFILES[paper].thermal) return false;
  const blocks = renderReceiptBlocks(data, loadSettings(), paper);
  const res = await fetch("/api/print", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ blocks, paper }),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: { printer?: string }; error?: string };
  if (!res.ok || !json?.data?.printer) {
    throw new Error(json?.error || "Raw receipt printing failed");
  }
  return true;
}
