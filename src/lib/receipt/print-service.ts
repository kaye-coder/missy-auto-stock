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
 * Sends the receipt to the system print pipeline (CUPS/AirPrint on macOS).
 *
 * The iframe is rendered off-screen at full paper width and unbounded height:
 * a 0x0 iframe gives the print engine a zero-sized viewport, which is what was
 * clipping the receipt down to its last few lines.
 */
export function printReceiptDocument(data: ReceiptData, paper: PaperSize): void {
  const settings = loadSettings();
  const profile = PAPER_PROFILES[paper];
  const html = profile.thermal
    ? buildTextDocument(data, settings, paper, false, absoluteLogoUrl())
    : buildReceiptDocument(data, settings, paper, false);

  const printWindow = window.open("", "_blank", "popup=yes,width=420,height=720");
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    const printFromWindow = async () => {
      await waitForImages(printWindow.document, 2500);
      printWindow.setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 200);
      printWindow.setTimeout(() => printWindow.close(), 10000);
    };
    if (printWindow.document.readyState === "complete") void printFromWindow();
    else printWindow.addEventListener("load", () => void printFromWindow(), { once: true });
    return;
  }

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

