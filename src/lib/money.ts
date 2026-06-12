/**
 * Money utilities. All amounts in the database are INTEGER minor units
 * (cents/centimes); we only convert to a decimal string at the display edge.
 * This avoids floating-point rounding errors in totals and change.
 */

export interface CurrencyConfig {
  symbol: string;
  decimals: number; // e.g. 2 for cents, 0 for whole-unit currencies
}

export const DEFAULT_CURRENCY: CurrencyConfig = { symbol: "", decimals: 2 };

/** Format minor units as a display string, e.g. 12345 -> "123.45 DA". */
export function formatMoney(
  cents: number,
  currency: CurrencyConfig = DEFAULT_CURRENCY,
): string {
  const { symbol, decimals } = currency;
  const factor = 10 ** decimals;
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / factor);
  const amount =
    decimals > 0
      ? `${whole}.${String(abs % factor).padStart(decimals, "0")}`
      : String(whole);
  return symbol ? `${sign}${amount} ${symbol}` : `${sign}${amount}`;
}

/**
 * Parse a user-entered decimal string into minor units. Returns null on
 * invalid input. Accepts "12", "12.5", "12.50", "1,234.5".
 */
export function parseMoney(
  input: string,
  decimals = DEFAULT_CURRENCY.decimals,
): number | null {
  const cleaned = input.replace(/[\s,]/g, "").trim();
  if (cleaned === "" || !/^-?\d*(\.\d*)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10 ** decimals);
}

/** Apply a discount to a base amount (minor units). */
export function applyDiscount(
  baseCents: number,
  discount: { type: "percent" | "fixed"; value: number },
): number {
  if (discount.type === "percent") {
    const pct = Math.max(0, Math.min(100, discount.value));
    return Math.round((baseCents * pct) / 100);
  }
  return Math.max(0, Math.min(baseCents, Math.round(discount.value)));
}
