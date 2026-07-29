import { loadSettings } from "@/lib/settings";
import { toast } from "sonner";
import { buildReceiptDocument } from "./template";
import { printRawReceipt } from "./raw-print";
import { PAPER_PROFILES, type PaperSize, type ReceiptData } from "./types";

export class PrintError extends Error {}

/**
 * Print pipeline.
 *
 * Thermal paper is raw ESC/POS only: no iframe, no @page CSS, no window.print,
 * and no browser fallback. Browser printing remains only for A4/PDF-style paper.
 */
export function printReceiptDocument(data: ReceiptData, paper: PaperSize): void {
  const profile = PAPER_PROFILES[paper];

  if (profile.thermal) {
    void printRawReceipt(data, paper).catch((error) => {
      toast.error(error instanceof Error ? error.message : "Raw receipt printing failed");
    });
    return;
  }

  const html = buildReceiptDocument(data, loadSettings(), paper, false);
  printWithFrame(html, profile.widthMm);
}


async function waitForImages(doc: Document, timeoutMs: number): Promise<void> {
  const imgs = Array.from(doc.images ?? []);
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((res) => {
            img.addEventListener("load", () => res(), { once: true });
            img.addEventListener("error", () => res(), { once: true });
            window.setTimeout(res, timeoutMs);
          }),
    ),
  );
}

function printWithFrame(html: string, widthMm: number): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: `${widthMm}mm`,
    height: "100vh",
    border: "0",
    opacity: "0.01",
    pointerEvents: "none",
    zIndex: "-1",
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

  const fire = async () => {
    try {
      await waitForImages(doc, 2500);
      const h = Math.max(
        doc.body?.scrollHeight ?? 0,
        doc.documentElement?.scrollHeight ?? 0,
        1200,
      );
      iframe.style.height = `${h + 120}px`;
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(() => iframe.remove(), 10000);
    }
  };

  if (doc.readyState === "complete") void window.setTimeout(() => void fire(), 200);
  else iframe.addEventListener("load", () => void window.setTimeout(() => void fire(), 200), { once: true });
}

