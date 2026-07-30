export type MobileMoneyProviderKey = "mtn" | "airtel" | "orange";

export type MobileMoneyProviderConfig = {
  enabled: boolean;
  feeKind: "percent" | "fixed";
  feeValue: number;
};

export const MOBILE_MONEY_PROVIDERS: { key: MobileMoneyProviderKey; label: string; short: string }[] = [
  { key: "mtn", label: "MTN Mobile Money", short: "MTN" },
  { key: "airtel", label: "Airtel Money", short: "Airtel" },
  { key: "orange", label: "Orange Money", short: "Orange" },
];

export function providerLabel(key: string): string {
  return MOBILE_MONEY_PROVIDERS.find((p) => p.key === key)?.label ?? key;
}

export function isMobileMoneyMethod(method: string): method is MobileMoneyProviderKey {
  return MOBILE_MONEY_PROVIDERS.some((p) => p.key === method);
}

export function mobileMoneyFee(base: number, cfg: MobileMoneyProviderConfig | undefined): number {
  if (!cfg) return 0;
  const v = Math.max(0, Number(cfg.feeValue) || 0);
  if (v === 0) return 0;
  return cfg.feeKind === "percent" ? (base * v) / 100 : v;
}
