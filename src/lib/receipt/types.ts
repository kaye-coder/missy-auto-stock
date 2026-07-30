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
  fee?: number;
  feeLabel?: string;
  total: number;
  amountPaid?: number;
  balanceDue?: number;
}

/** Paper profiles the receipt adapts to without code changes. */
export type PaperSize = "58mm" | "80mm" | "a4";

export interface PaperProfile {
  id: PaperSize;
  label: string;
  /** printable receipt column width in mm */
  widthMm: number;
  /** base font size in px used for body text */
  baseFontPx: number;
  thermal: boolean;
}

export const PAPER_PROFILES: Record<PaperSize, PaperProfile> = {
  "58mm": { id: "58mm", label: "58mm thermal", widthMm: 58, baseFontPx: 10.5, thermal: true },
  "80mm": { id: "80mm", label: "80mm thermal", widthMm: 80, baseFontPx: 12, thermal: true },
  a4: { id: "a4", label: "A4 / Letter", widthMm: 80, baseFontPx: 12, thermal: false },
};

const PAPER_KEY = "missy.receipt-paper.v1";

export function loadPaperSize(): PaperSize {
  if (typeof window === "undefined") return "80mm";
  const v = localStorage.getItem(PAPER_KEY);
  return v === "58mm" || v === "80mm" || v === "a4" ? v : "80mm";
}

export function savePaperSize(p: PaperSize) {
  if (typeof window !== "undefined") localStorage.setItem(PAPER_KEY, p);
}
