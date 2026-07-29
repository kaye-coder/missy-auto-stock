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

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: profile.thermal ? `${profile.widthMm}mm` : "210mm",
    height: "2000px",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
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
      // Grow the frame to the full document height so nothing is clipped.
      const h = doc.documentElement?.scrollHeight ?? 0;
      if (h > 0) iframe.style.height = `${h + 40}px`;
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(() => iframe.remove(), 3000);
    }
  };

  const waitForImages = async () => {
    const imgs = Array.from(doc.images ?? []);
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((res) => {
              img.addEventListener("load", () => res(), { once: true });
              img.addEventListener("error", () => res(), { once: true });
              window.setTimeout(res, 1500);
            }),
      ),
    );
  };

  void waitForImages().then(() => window.setTimeout(fire, 120));
}

