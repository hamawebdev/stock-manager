/**
 * Tabular export helpers (Excel + PDF). The file bytes are built in the
 * frontend; on the desktop they are saved to a user-chosen path via the dialog
 * plugin + the `write_bytes` Rust command, with a plain-browser blob-download
 * fallback for `npm run dev` outside Tauri.
 */
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import i18n from "@/lib/i18n";

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function saveBytes(suggestedName: string, bytes: Uint8Array): Promise<void> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/api/dialog");
    const { invoke } = await import("@tauri-apps/api/tauri");
    const path = await save({ defaultPath: suggestedName });
    if (!path) return; // user cancelled
    await invoke("write_bytes", { path, data: Array.from(bytes) });
    toast.success(i18n.t("common.exportedTo", { path }));
    return;
  }
  // Browser fallback.
  const blob = new Blob([bytes as BlobPart]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportRowsToExcel<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  filename: string,
  sheetName = "Sheet1",
): Promise<void> {
  const aoa = [
    columns.map((c) => c.header),
    ...rows.map((r) => columns.map((c) => c.value(r))),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  await saveBytes(`${filename}.xlsx`, new Uint8Array(out));
}

export async function exportRowsToPdf<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  filename: string,
  title?: string,
): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape" });
  let startY = 14;
  if (title) {
    doc.setFontSize(14);
    doc.text(title, 14, startY);
    startY += 6;
  }
  autoTable(doc, {
    startY,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => String(c.value(r)))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [37, 99, 235] },
  });
  const ab = doc.output("arraybuffer");
  await saveBytes(`${filename}.pdf`, new Uint8Array(ab));
}
