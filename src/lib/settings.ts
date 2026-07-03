export type DiscountRule = {
  id: string;
  label: string;
  minSubtotal: number;
  kind: "percent" | "fixed";
  value: number;
};

export type CheckoutSettings = {
  // Uganda VAT (URA standard rate is 18%)
  taxRate: number; // 0..1
  taxLabel: string;
  // Withholding tax (URA WHT, typically 6% for goods/services to designated agents)
  withholdingEnabled: boolean;
  withholdingRate: number; // 0..1
  // Local Service Tax line (flat add-on, optional)
  localServiceTaxEnabled: boolean;
  localServiceTax: number; // UGX
  // Business identity printed on receipts
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  tinNumber: string; // URA Taxpayer Identification Number
  efrisDeviceId: string; // optional EFRIS / e-invoicing device ID
  discountRules: DiscountRule[];
};

const KEY = "missy.checkout-settings.v2";

export const DEFAULT_SETTINGS: CheckoutSettings = {
  taxRate: 0.18,
  taxLabel: "VAT",
  withholdingEnabled: false,
  withholdingRate: 0.06,
  localServiceTaxEnabled: false,
  localServiceTax: 0,
  businessName: "Missy Car Accessories",
  businessPhone: "",
  businessAddress: "",
  tinNumber: "",
  efrisDeviceId: "",
  discountRules: [
    { id: "r1", label: "Loyalty 5% over UGX 150,000", minSubtotal: 150_000, kind: "percent", value: 5 },
    { id: "r2", label: "Bulk 10% over UGX 500,000", minSubtotal: 500_000, kind: "percent", value: 10 },
  ],
};

export function loadSettings(): CheckoutSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as CheckoutSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: CheckoutSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent("missy:settings-changed"));
}

export function bestAutoDiscount(subtotal: number, rules: DiscountRule[]): { amount: number; rule?: DiscountRule } {
  let best: { amount: number; rule?: DiscountRule } = { amount: 0 };
  for (const r of rules) {
    if (subtotal < r.minSubtotal) continue;
    const amt = r.kind === "percent" ? (subtotal * r.value) / 100 : r.value;
    if (amt > best.amount) best = { amount: amt, rule: r };
  }
  return best;
}
