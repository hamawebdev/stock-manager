/**
 * jsPDF export for Studio documents — the one-click "PDF" path that writes a
 * real .pdf via the Tauri save dialog (browser blob fallback in dev). This is a
 * near-match of the HTML preview (jsPDF only ships the standard fonts, so the
 * chosen family maps to Helvetica); the pixel-perfect path is "Imprimer" (HTML
 * → OS dialog). Mirrors the save flow in `@/lib/export` and `invoice-pdf.ts`.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import { barcodePngDataUrl } from "../label-render";
import type { DocumentModel, PaperFormat } from "./types";

const VIOLET: [number, number, number] = [109, 40, 217];
const MUTED: [number, number, number] = [107, 114, 128];

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function saveBytes(suggestedName: string, bytes: Uint8Array): Promise<void> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    const path = await save({ defaultPath: suggestedName });
    if (!path) return;
    await invoke("write_bytes", { path, data: Array.from(bytes) });
    toast.success(i18n.t("common.exportedTo", { path }));
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

function pageFormat(paper: PaperFormat): { format: string | number[]; width: number } {
  if (paper === "a5") return { format: "a5", width: 148 };
  if (paper === "ticket") return { format: [80, 200], width: 80 };
  return { format: "a4", width: 210 };
}

/** Build the document as a jsPDF and save it to a user-chosen path. */
export async function exportDocumentPdf(
  model: DocumentModel,
  paper: PaperFormat,
): Promise<void> {
  const { format, width } = pageFormat(paper);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format });
  const margin = paper === "ticket" ? 6 : 14;
  const right = width - margin;
  let y = margin + 4;

  // --- Header ---------------------------------------------------------------
  const s = model.shop;
  let textX = margin;
  if (s.logoDataUrl) {
    try {
      doc.addImage(s.logoDataUrl, margin, y - 2, 22, 16, undefined, "FAST");
      textX = margin + 26;
    } catch {
      // Unsupported image format — fall through without the logo.
    }
  }
  doc.setTextColor(...VIOLET);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(s.name, textX, y + 3);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const meta = [s.address, s.phone, s.email].filter(Boolean);
  meta.forEach((line, i) => doc.text(line, textX, y + 8 + i * 4));

  // Right meta: badge + number + date + mode
  doc.setFillColor(...VIOLET);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const badgeW = doc.getTextWidth(model.docTypeLabel) + 8;
  doc.roundedRect(right - badgeW, y - 2, badgeW, 6, 1, 1, "F");
  doc.text(model.docTypeLabel, right - badgeW + 4, y + 2.3);
  doc.setTextColor(30, 27, 46);
  doc.setFontSize(14);
  doc.text(model.numberLabel, right, y + 11, { align: "right" });
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`Date : ${model.dateLabel}`, right, y + 16, { align: "right" });
  if (model.paymentMode) {
    doc.text(`Mode : ${model.paymentMode}`, right, y + 20, { align: "right" });
  }

  y += Math.max(20, 8 + meta.length * 4) + 6;

  // --- Party ----------------------------------------------------------------
  if (model.party) {
    const p = model.party;
    const rowsText = p.rows.map((r) => `${r.label}: ${r.value}`).join("    ");
    const boxH = 12 + (rowsText ? 5 : 0);
    doc.setFillColor(245, 243, 255);
    doc.roundedRect(margin, y, right - margin, boxH, 1.5, 1.5, "F");
    doc.setTextColor(...MUTED);
    doc.setFontSize(7);
    doc.text(p.blockLabel, margin + 3, y + 4);
    doc.setTextColor(30, 27, 46);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    if (p.name) doc.text(p.name, margin + 3, y + 9);
    if (rowsText) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(75, 85, 99);
      doc.text(rowsText, margin + 3, y + 14);
    }
    y += boxH + 4;
  }

  // --- Body table -----------------------------------------------------------
  if (model.items) {
    autoTable(doc, {
      startY: y,
      head: [["RÉF", "DÉSIGNATION", "QTÉ", model.puLabel, "TOTAL"]],
      body: model.items.map((r) => [r.ref, r.designation, r.qty, r.pu, r.total]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: VIOLET, halign: "left" },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    });
    y = tableEndY(doc) + 6;
  } else if (model.ledger) {
    autoTable(doc, {
      startY: y,
      head: [["DATE", "LIBELLÉ", "DÉBIT", "CRÉDIT", "SOLDE"]],
      body: model.ledger.map((r) => [r.date, r.label, r.debit, r.credit, r.solde]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: VIOLET, halign: "left" },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    });
    y = tableEndY(doc) + 6;
  }

  // --- Totals ---------------------------------------------------------------
  for (const line of model.totals) {
    doc.setFont("helvetica", line.strong ? "bold" : "normal");
    doc.setFontSize(line.strong ? 11 : 9);
    setTone(doc, line.tone, line.strong);
    doc.text(line.label, right - 60, y);
    doc.text(line.value, right, y, { align: "right" });
    y += line.strong ? 7 : 5.5;
  }

  // --- Final balance (statements) ------------------------------------------
  if (model.finalBalance) {
    y += 2;
    doc.setFillColor(...VIOLET);
    doc.roundedRect(right - 90, y, 90, 9, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(model.finalBalance.label, right - 87, y + 6);
    doc.text(model.finalBalance.value, right - 3, y + 6, { align: "right" });
    y += 14;
  }

  // --- Amount in words ------------------------------------------------------
  if (model.amountInWords) {
    doc.setTextColor(55, 65, 81);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    const text = `Arrêté la présente à la somme de : ${model.amountInWords}`;
    const wrapped = doc.splitTextToSize(text, right - margin) as string[];
    doc.text(wrapped, margin, y + 4);
    y += 4 + wrapped.length * 4 + 4;
  }

  // --- Barcode --------------------------------------------------------------
  if (model.barcodeValue) {
    const png = barcodePngDataUrl(model.barcodeValue, true);
    if (png) {
      const bw = 56;
      doc.addImage(png, "PNG", (width - bw) / 2, y, bw, 14, undefined, "FAST");
    }
  }

  await saveBytes(`${model.numberRaw}.pdf`, new Uint8Array(doc.output("arraybuffer")));
}

function tableEndY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function setTone(doc: jsPDF, tone: DocumentModel["totals"][number]["tone"], strong?: boolean): void {
  if (tone === "primary") doc.setTextColor(...VIOLET);
  else if (tone === "danger") doc.setTextColor(220, 38, 38);
  else if (tone === "muted") doc.setTextColor(...MUTED);
  else doc.setTextColor(strong ? 30 : 55, strong ? 27 : 65, strong ? 46 : 81);
}
