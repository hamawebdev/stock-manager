/** Build a printable ReceiptData from a stored sale + its line items. */
import type { ReceiptData } from "./hardware";
import type { CurrencyConfig } from "@/lib/money";
import { intlLocale } from "@/lib/i18n";
import type { Sale, SaleItem, ShopSettings } from "./types";

export function buildReceiptFromSale(
  sale: Sale,
  items: SaleItem[],
  settings: ShopSettings,
  currency: CurrencyConfig,
): ReceiptData {
  return {
    shop_name: settings.shop_name || "My Shop",
    header: settings.receipt_header,
    footer: settings.receipt_footer,
    code: sale.code,
    datetime: new Date(sale.created_at).toLocaleString(intlLocale()),
    lines: items.map((it) => ({
      description: it.description,
      qty: it.qty,
      unit_price_cents: it.unit_price_cents,
      line_total_cents: it.line_total_cents,
    })),
    subtotal_cents: sale.subtotal_cents,
    discount_cents: sale.cart_discount_cents,
    total_cents: sale.total_cents,
    tendered_cents: sale.cash_tendered_cents,
    change_cents: sale.change_cents,
    remaining_cents: Math.max(0, sale.total_cents - sale.paid_cents),
    currency,
  };
}
