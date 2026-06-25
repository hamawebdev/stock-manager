/**
 * Printable / exportable purchasing reports: a single-purchase PDF and a
 * supplier "Relevé Global" (statement). Both reuse the generic tabular helpers
 * in `@/lib/export`, so they save through the same Tauri/browser path.
 */
import type { TFunction } from "i18next";
import { exportRowsToPdf, exportRowsToExcel } from "@/lib/export";
import { formatMoney, type CurrencyConfig } from "@/lib/money";
import type {
  PurchaseItem,
  PurchaseRow,
  Supplier,
  SupplierPayment,
} from "@/lib/pos/types";

/** One purchase as a PDF: its line items, titled with supplier + totals. */
export async function exportPurchasePdf(
  purchase: PurchaseRow,
  items: PurchaseItem[],
  currency: CurrencyConfig,
  t: TFunction,
): Promise<void> {
  const money = (c: number) => formatMoney(c, currency);
  const title = [
    purchase.code ?? t("purchasing.status.draft"),
    purchase.supplier_name ?? "",
    purchase.purchase_date ?? "",
    `${t("purchasing.totalTtc")}: ${money(purchase.total_ttc_cents)}`,
  ]
    .filter(Boolean)
    .join("  |  ");

  await exportRowsToPdf(
    items,
    [
      { header: t("purchasing.product"), value: (r) => r.description },
      { header: t("purchasing.qty"), value: (r) => r.qty },
      { header: t("purchasing.unit"), value: (r) => r.unit ?? "" },
      { header: t("purchasing.unitCost"), value: (r) => money(r.unit_cost_ht_cents) },
      { header: t("purchasing.lineTotal"), value: (r) => money(r.line_total_ht_cents) },
    ],
    `${purchase.code ?? "achat"}`,
    title,
  );
}

/** Supplier statement (Relevé Global): all payments + a purchases summary. */
export async function exportSupplierStatement(
  supplier: Supplier,
  payments: SupplierPayment[],
  currency: CurrencyConfig,
  t: TFunction,
): Promise<void> {
  const money = (c: number) => formatMoney(c, currency);
  await exportRowsToExcel(
    payments,
    [
      { header: t("purchasing.table.date"), value: (r) => r.created_at },
      {
        header: t("purchasing.table.method"),
        value: (r) => t(`purchasing.methods.${r.method}`),
      },
      { header: t("purchasing.table.amount"), value: (r) => money(r.amount_cents) },
      { header: t("purchasing.table.note"), value: (r) => r.note ?? r.reference ?? "" },
    ],
    `releve-${supplier.name}`,
    supplier.name,
  );
}
