/**
 * Thermal printers driven through CUPS/AirPrint often fall back to a legacy
 * code page (CP437 / CP850 / CP858 / Windows-1252). Any glyph outside that
 * range comes out as garbage symbols. We therefore transliterate the receipt
 * text to a safe subset before it is handed to the printer.
 */
const MAP: Record<string, string> = {
  "×": "x",
  "−": "-",
  "–": "-",
  "—": "-",
  "•": "*",
  "·": "*",
  "♥": "<3",
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  "…": "...",
  "€": "EUR",
  "₤": "GBP",
  "™": "TM",
  "©": "(c)",
  "®": "(r)",
  "→": "->",
  "\u00a0": " ",
};

/** Replace characters that legacy printer code pages cannot render. */
export function toPrinterSafe(input: string): string {
  let out = "";
  for (const ch of input) {
    if (MAP[ch] !== undefined) {
      out += MAP[ch];
      continue;
    }
    const code = ch.codePointAt(0)!;
    if (code < 0x20 && ch !== "\n") continue;
    if (code <= 0x7e) {
      out += ch;
      continue;
    }
    // Strip accents where possible, otherwise drop the glyph.
    const folded = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    out += /^[\x20-\x7e]+$/.test(folded) ? folded : "";
  }
  return out;
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

/** Printer-safe + HTML-escaped in one step. */
export function safe(s: string): string {
  return escapeHtml(toPrinterSafe(s));
}
