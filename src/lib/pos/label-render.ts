/**
 * Renders a {@link LabelTemplate} for a set of variants into the three output
 * formats the designer supports:
 *   - HTML  → faithful, absolute-mm layout for the OS print dialog
 *   - PDF   → jsPDF document at the exact label size (one page per copy)
 *   - ESC/POS → best-effort stacked layout for thermal label printers
 *               (free-form positioning cannot be reproduced on ESC/POS)
 * Field binding (which product/variant value each element shows) lives here too
 * so the canvas, HTML and PDF all resolve values identically.
 */
import JsBarcode from "jsbarcode";
import { jsPDF } from "jspdf";
import { formatMoney, type CurrencyConfig } from "@/lib/money";
import { isValidEan13 } from "./barcode";
import { EscPosBuilder } from "./escpos";
import type { VariantDetail } from "./types";
import type { LabelElement, LabelTemplate } from "./label-template";

/** One label to print: a variant, its product reference, and a copy count. */
export interface LabelPrintItem {
  variant: VariantDetail;
  reference: string | null;
  qty: number;
}

/** Pick the symbology JsBarcode should use for a given value. */
export function symbologyFor(value: string): "EAN13" | "CODE128" {
  return isValidEan13(value) ? "EAN13" : "CODE128";
}

/** The bound display string for an element, given the variant it prints for. */
export function resolveElement(
  el: LabelElement,
  item: LabelPrintItem,
  currency: CurrencyConfig,
): string {
  const v = item.variant;
  switch (el.kind) {
    case "productName":
      return v.product_name;
    case "price":
      return formatMoney(v.effective_price_cents, currency);
    case "barcode":
      return v.barcode ?? "";
    case "reference":
      return item.reference ?? "";
    case "characteristics": {
      const parts: string[] = [];
      if (el.showSize !== false && v.size_name) parts.push(v.size_name);
      if (el.showColor !== false && v.color_name) parts.push(v.color_name);
      return parts.join(" / ");
    }
    case "freeText":
      return el.text ?? "";
    default:
      return "";
  }
}

/** A placeholder item so the canvas is usable before any product is added. */
export function sampleLabelItem(): LabelPrintItem {
  const variant: VariantDetail = {
    id: -1,
    product_id: -1,
    size_id: null,
    color_id: null,
    sku: "SAMPLE-001",
    barcode: "2000000000008",
    price_cents: 0,
    cost_cents: null,
    stock: 0,
    archived: 0,
    created_at: new Date().toISOString(),
    product_name: "PRODUCT NAME",
    category_id: null,
    size_name: "M",
    color_name: "Black",
    color_hex: "#000000",
    effective_price_cents: 0,
  };
  return { variant, reference: "REF-0000", qty: 1 };
}

// --- Barcode rendering -----------------------------------------------------

/**
 * JsBarcode-rendered SVG markup, stretched to fill its element box
 * (`preserveAspectRatio="none"` — bar ratios are preserved within the x-axis,
 * which is all a 1D scanner reads). Returns "" when the value can't be encoded.
 */
export function barcodeSvgMarkup(value: string, showValue: boolean): string {
  if (!value) return "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, value, {
      format: symbologyFor(value),
      displayValue: showValue,
      margin: 0,
      height: 60,
      width: 2,
      fontSize: 16,
      background: "#ffffff",
      lineColor: "#000000",
    });
  } catch {
    return "";
  }
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.style.display = "block";
  return svg.outerHTML;
}

/** PNG data URL of a barcode for embedding in the PDF. */
export function barcodePngDataUrl(value: string, showValue: boolean): string | null {
  if (!value) return null;
  const canvas = document.createElement("canvas");
  try {
    JsBarcode(canvas, value, {
      format: symbologyFor(value),
      displayValue: showValue,
      margin: 0,
      height: 120,
      width: 2,
      fontSize: 28,
      background: "#ffffff",
      lineColor: "#000000",
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

// --- HTML (OS print) -------------------------------------------------------

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

function justifyFor(align: string): string {
  return align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
}

/** Inner markup for one positioned element (without its absolute wrapper). */
function elementInnerHtml(
  el: LabelElement,
  item: LabelPrintItem,
  currency: CurrencyConfig,
): string {
  if (el.kind === "line") {
    return `<div style="width:100%;height:${el.thickness ?? 0.3}mm;background:${el.color};margin-top:auto;margin-bottom:auto"></div>`;
  }
  if (el.kind === "frame") {
    return `<div style="width:100%;height:100%;box-sizing:border-box;border:${el.thickness ?? 0.4}mm solid ${el.color};border-radius:${el.radius ?? 0}mm"></div>`;
  }
  if (el.kind === "barcode") {
    return barcodeSvgMarkup(resolveElement(el, item, currency), el.showValue !== false);
  }
  const text = resolveElement(el, item, currency);
  return `<div style="display:flex;width:100%;height:100%;align-items:center;justify-content:${justifyFor(el.align)};text-align:${el.align};font-size:${el.fontSize}pt;font-weight:${el.bold ? 700 : 400};color:${el.color};line-height:1.05;overflow:hidden;word-break:break-word">${esc(text)}</div>`;
}

function labelHtmlOne(
  template: LabelTemplate,
  item: LabelPrintItem,
  currency: CurrencyConfig,
): string {
  const els = template.elements
    .map((el) => {
      const wrap = `position:absolute;left:${el.x}mm;top:${el.y}mm;width:${el.w}mm;height:${el.h}mm;transform:rotate(${el.rotation}deg);transform-origin:center center;overflow:hidden;box-sizing:border-box`;
      return `<div style="${wrap}">${elementInnerHtml(el, item, currency)}</div>`;
    })
    .join("");
  return `<div class="label">${els}</div>`;
}

/** Faithful HTML for the OS print dialog. Each copy is its own print page. */
export function labelDesignHtml(
  template: LabelTemplate,
  items: LabelPrintItem[],
  currency: CurrencyConfig,
): string {
  const W = template.widthMm;
  const H = template.heightMm;
  const labels: string[] = [];
  for (const item of items) {
    for (let i = 0; i < Math.max(1, item.qty); i++) {
      labels.push(labelHtmlOne(template, item, currency));
    }
  }
  return `<html><head><meta charset="utf-8"><style>
    @page { size: ${W}mm ${H}mm; margin: 0; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; }
    .label { position: relative; width: ${W}mm; height: ${H}mm; overflow: hidden; page-break-after: always; break-after: page; background: #fff; }
    .label:last-child { page-break-after: auto; break-after: auto; }
  </style></head><body>${labels.join("")}</body></html>`;
}

// --- PDF --------------------------------------------------------------------

/** jsPDF document at the exact label size, one page per copy. */
export function labelDesignPdf(
  template: LabelTemplate,
  items: LabelPrintItem[],
  currency: CurrencyConfig,
): jsPDF {
  const W = template.widthMm;
  const H = template.heightMm;
  const doc = new jsPDF({
    unit: "mm",
    format: [W, H],
    orientation: W >= H ? "landscape" : "portrait",
  });

  const pages: LabelPrintItem[] = [];
  for (const item of items) {
    for (let i = 0; i < Math.max(1, item.qty); i++) pages.push(item);
  }
  if (pages.length === 0) pages.push(sampleLabelItem());

  pages.forEach((item, pageIndex) => {
    if (pageIndex > 0) doc.addPage([W, H], W >= H ? "landscape" : "portrait");
    for (const el of template.elements) {
      drawPdfElement(doc, el, item, currency);
    }
  });
  return doc;
}

function drawPdfElement(
  doc: jsPDF,
  el: LabelElement,
  item: LabelPrintItem,
  currency: CurrencyConfig,
): void {
  if (el.kind === "frame") {
    doc.setDrawColor(el.color);
    doc.setLineWidth(el.thickness ?? 0.4);
    if (el.radius && el.radius > 0) {
      doc.roundedRect(el.x, el.y, el.w, el.h, el.radius, el.radius, "S");
    } else {
      doc.rect(el.x, el.y, el.w, el.h, "S");
    }
    return;
  }
  if (el.kind === "line") {
    doc.setDrawColor(el.color);
    doc.setLineWidth(el.thickness ?? 0.3);
    const midY = el.y + el.h / 2;
    doc.line(el.x, midY, el.x + el.w, midY);
    return;
  }
  if (el.kind === "barcode") {
    const png = barcodePngDataUrl(
      resolveElement(el, item, currency),
      el.showValue !== false,
    );
    if (png) {
      doc.addImage(png, "PNG", el.x, el.y, el.w, el.h, undefined, "FAST", el.rotation || 0);
    }
    return;
  }

  const text = resolveElement(el, item, currency);
  if (!text) return;
  doc.setTextColor(el.color);
  doc.setFont("helvetica", el.bold ? "bold" : "normal");
  doc.setFontSize(el.fontSize);
  const lines = doc.splitTextToSize(text, el.w) as string[];
  const fontMm = el.fontSize * 0.352778;
  const lineH = fontMm * 1.1;
  const blockH = lineH * lines.length;
  const startY = el.y + (el.h - blockH) / 2 + fontMm * 0.85;
  const anchorX =
    el.align === "left" ? el.x : el.align === "right" ? el.x + el.w : el.x + el.w / 2;
  lines.forEach((ln, i) => {
    doc.text(ln, anchorX, startY + i * lineH, {
      align: el.align,
      angle: el.rotation ? -el.rotation : undefined,
    });
  });
}

// --- ESC/POS (best-effort) -------------------------------------------------

/**
 * Best-effort thermal output. ESC/POS cannot reproduce free positioning, so we
 * emit a conventional stacked label per copy (name, characteristics, price,
 * barcode) derived from whichever of those elements the template contains.
 */
export function labelDesignEscpos(
  template: LabelTemplate,
  items: LabelPrintItem[],
  currency: CurrencyConfig,
): Uint8Array {
  const has = (k: LabelElement["kind"]) =>
    template.elements.find((e) => e.kind === k);
  const b = new EscPosBuilder(32);
  for (const item of items) {
    for (let i = 0; i < Math.max(1, item.qty); i++) {
      b.init().align("center");
      const nameEl = has("productName");
      if (nameEl) b.bold(true).line(resolveElement(nameEl, item, currency)).bold(false);
      const charEl = has("characteristics");
      if (charEl) {
        const s = resolveElement(charEl, item, currency);
        if (s) b.line(s);
      }
      const priceEl = has("price");
      if (priceEl) b.line(resolveElement(priceEl, item, currency));
      const barcodeEl = has("barcode");
      const code = barcodeEl ? resolveElement(barcodeEl, item, currency) : item.variant.barcode ?? "";
      if (code) b.barcode128(code);
      b.feed(1).cut();
    }
  }
  return b.build();
}
