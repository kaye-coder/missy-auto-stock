import { loadSettings } from "@/lib/settings";
import { logoUrl } from "@/lib/logo";
import { buildReceiptDocument } from "./template";
import { buildTextDocument } from "./plain-text";
import { PAPER_PROFILES, type PaperSize, type ReceiptData } from "./types";

export class PrintError extends Error {}

/** Absolute URL so the print iframe can resolve the bundled logo. */
export function absoluteLogoUrl(): string {
  try {
    return new URL(logoUrl, window.location.href).href;
  } catch {
    return logoUrl;
  }
}

/**
 * Print pipeline.
 *
 * 1. Raw ESC/POS through CUPS (`lp -o raw`) — a continuous byte stream with no
 *    page size, so nothing paginates and no blank page is emitted.
 * 2. Browser print as fallback (no local printer / non-thermal paper), using
 *    the continuous X58mmY3276mm media instead of a fixed 210mm page.
 */
export function printReceiptDocument(data: ReceiptData, paper: PaperSize): void {
  const settings = loadSettings();
  const profile = PAPER_PROFILES[paper];
  const html = profile.thermal
    ? buildTextDocument(data, settings, paper, false, absoluteLogoUrl())
    : buildReceiptDocument(data, settings, paper, false);

  void (async () => {
    if (await printRawReceipt(data, paper)) return;
    printWithFrame(html, profile.widthMm);
  })();
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

