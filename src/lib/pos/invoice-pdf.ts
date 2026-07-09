/**
 * A4 PDF invoice for a completed sale. The thermal/ESC-POS receipt path lives in
 * `hardware.ts`; this is the printable/emailable A4 document. Bytes are built in
 * the frontend and saved to a user-chosen path via the dialog + `write_bytes`
 * command, with a browser blob-download fallback for `npm run dev`.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import i18n, { intlLocale } from "@/lib/i18n";
import { formatMoney, type CurrencyConfig } from "@/lib/money";
import type { Sale, SaleItem, ShopSettings } from "./types";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function saveBytes(suggestedName: string, bytes: Uint8Array): Promise<void> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/api/dialog");
    const { invoke } = await import("@tauri-apps/api/tauri");
    const path = await save({ defaultPath: suggestedName });
    if (!path) return;
    await invoke("write_bytes", { path, data: Array.from(bytes) });
    toast.success(i18n.t("invoice.savedTo", { path }));
    return;
  }
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function generateInvoicePdf(
  sale: Sale,
  items: SaleItem[],
  settings: ShopSettings,
  currency: CurrencyConfig,
): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const m = (c: number) => formatMoney(c, currency);

  doc.setFontSize(18);
  doc.text(settings.shop_name || i18n.t("invoice.invoice"), 14, 20);
  doc.setFontSize(10);
  doc.text(i18n.t("invoice.invoiceCode", { code: sale.code }), 14, 28);
  doc.text(new Date(sale.created_at).toLocaleString(intlLocale()), 14, 33);
  if (settings.receipt_header) doc.text(settings.receipt_header, 14, 38);

  autoTable(doc, {
    startY: 44,
    head: [[
      i18n.t("invoice.item"),
      i18n.t("invoice.qty"),
      i18n.t("invoice.unit"),
      i18n.t("invoice.discount"),
      i18n.t("invoice.total"),
    ]],
    body: items.map((it) => [
      it.description,
      String(it.qty),
      m(it.unit_price_cents),
      it.line_discount_cents > 0 ? `-${m(it.line_discount_cents)}` : "—",
      m(it.line_total_cents),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  });

  // jspdf-autotable stashes the final Y on the doc instance.
  const endY = (doc as unknown as { lastAutoTable: { finalY: number } })
    .lastAutoTable.finalY;
  let y = endY + 8;
  const right = 196;
  const put = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, 140, y);
    doc.text(value, right, y, { align: "right" });
    y += 6;
  };
  put(i18n.t("invoice.subtotal"), m(sale.subtotal_cents));
  if (sale.cart_discount_cents > 0) put(i18n.t("invoice.discount"), `-${m(sale.cart_discount_cents)}`);
  put(i18n.t("invoice.total"), m(sale.total_cents), true);
  put(i18n.t("invoice.cash"), m(sale.cash_tendered_cents));
  put(i18n.t("invoice.change"), m(sale.change_cents));

  if (settings.receipt_footer) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(settings.receipt_footer, 14, y + 6);
  }

  await saveBytes(`invoice-${sale.code}.pdf`, new Uint8Array(doc.output("arraybuffer")));
}
