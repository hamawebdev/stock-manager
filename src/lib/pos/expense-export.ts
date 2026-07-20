/**
 * Export & printing for expenses. Tabular exports (Excel / PDF list) reuse the
 * generic helpers in `src/lib/export.ts`; the single-expense voucher is an A4
 * PDF built with jsPDF, mirroring the sale-invoice document.
 */
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import type { TFunction } from "i18next";
import i18n, { intlLocale } from "@/lib/i18n";
import { formatMoney, type CurrencyConfig } from "@/lib/money";
import { exportRowsToExcel, exportRowsToPdf } from "@/lib/export";
import type { ExpenseRow } from "./expenses";
import type { ShopSettings } from "./types";

function columns(currency: CurrencyConfig, t: TFunction) {
  return [
    { header: t("expenses.code"), value: (e: ExpenseRow) => e.code ?? "" },
    { header: t("expenses.date"), value: (e: ExpenseRow) => e.expense_date },
    {
      header: t("expenses.category"),
      value: (e: ExpenseRow) => e.category_name ?? t("expenses.uncategorized"),
    },
    { header: t("expenses.vendor"), value: (e: ExpenseRow) => e.vendor ?? "" },
    {
      header: t("expenses.paymentMethod"),
      value: (e: ExpenseRow) => e.method_name ?? "",
    },
    {
      header: t("expenses.reference"),
      value: (e: ExpenseRow) => e.reference ?? "",
    },
    { header: t("expenses.note"), value: (e: ExpenseRow) => e.note ?? "" },
    {
      header: t("expenses.amount"),
      value: (e: ExpenseRow) => formatMoney(e.amount_cents, currency),
    },
  ];
}

export async function exportExpensesExcel(
  rows: ExpenseRow[],
  currency: CurrencyConfig,
  t: TFunction,
): Promise<void> {
  await exportRowsToExcel(
    rows,
    columns(currency, t),
    `expenses-${new Date().toISOString().slice(0, 10)}`,
    t("expenses.title"),
  );
}

export async function exportExpensesPdf(
  rows: ExpenseRow[],
  currency: CurrencyConfig,
  t: TFunction,
): Promise<void> {
  const total = rows.reduce((s, r) => s + r.amount_cents, 0);
  const title = `${t("expenses.title")} — ${t("expenses.total")}: ${formatMoney(
    total,
    currency,
  )}`;
  await exportRowsToPdf(
    rows,
    columns(currency, t),
    `expenses-${new Date().toISOString().slice(0, 10)}`,
    title,
  );
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function saveBytes(name: string, bytes: Uint8Array): Promise<void> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    const path = await save({ defaultPath: name });
    if (!path) return;
    await invoke("write_bytes", { path, data: Array.from(bytes) });
    toast.success(i18n.t("common.exportedTo", { path }));
    return;
  }
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** A4 expense voucher for a single expense (printable / archivable proof). */
export async function printExpenseVoucher(
  expense: ExpenseRow,
  settings: ShopSettings,
  currency: CurrencyConfig,
  t: TFunction,
): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(18);
  doc.text(settings.shop_name || t("expenses.title"), 14, 20);
  doc.setFontSize(13);
  doc.text(t("expenses.voucher"), 14, 30);

  doc.setFontSize(10);
  doc.text(`${t("expenses.code")}: ${expense.code ?? "—"}`, 14, 40);
  doc.text(`${t("expenses.date")}: ${expense.expense_date}`, 14, 46);

  const rows: [string, string][] = [
    [t("expenses.category"), expense.category_name ?? t("expenses.uncategorized")],
    [t("expenses.vendor"), expense.vendor ?? "—"],
    [t("expenses.paymentMethod"), expense.method_name ?? "—"],
    [t("expenses.reference"), expense.reference ?? "—"],
    [t("expenses.note"), expense.note ?? "—"],
  ];
  let y = 58;
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold");
    doc.text(label, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, 60, y, { maxWidth: 130 });
    y += 8;
  }

  y += 6;
  doc.setDrawColor(200);
  doc.line(14, y, 196, y);
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(t("expenses.total"), 14, y);
  doc.text(formatMoney(expense.amount_cents, currency), 196, y, {
    align: "right",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    new Date(expense.created_at).toLocaleString(intlLocale()),
    14,
    285,
  );

  await saveBytes(
    `expense-${expense.code ?? expense.id}.pdf`,
    new Uint8Array(doc.output("arraybuffer")),
  );
}
