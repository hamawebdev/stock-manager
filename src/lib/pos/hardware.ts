/**
 * Hardware service. The owner configures everything in Settings; this module
 * reads that config and dispatches print/drawer actions to the right backend:
 *   - escpos_usb / escpos_network  → build ESC/POS bytes, send via Rust `print_raw`
 *   - os                           → render HTML and use the system print dialog
 *   - disabled                     → no-op
 */
import { invoke } from "@tauri-apps/api/tauri";
import type { jsPDF } from "jspdf";
import { getDb } from "./db";
import { EscPosBuilder } from "./escpos";
import i18n from "@/lib/i18n";
import { formatMoney, type CurrencyConfig } from "@/lib/money";
import type { LabelTemplate } from "./label-template";
import {
  labelDesignHtml,
  labelDesignPdf,
  labelDesignEscpos,
  type LabelPrintItem,
} from "./label-render";

// --- Config ---------------------------------------------------------------

export type PrinterMode = "escpos_usb" | "escpos_network" | "os" | "disabled";
export type DrawerMode = "printer" | "usb" | "none";
/** Label output target. `pdf` exports a file; the rest mirror PrinterMode. */
export type LabelMode = PrinterMode | "same_as_receipt" | "pdf";

export interface HardwareConfig {
  printer_mode: PrinterMode;
  printer_address: string; // USB device path or "ip:port"
  paper_width: "80" | "58";
  drawer_mode: DrawerMode;
  drawer_address: string; // USB device path when drawer_mode = "usb"
  label_mode: LabelMode;
  label_address: string;
  label_width_mm: number;
  label_height_mm: number;
}

export const HARDWARE_DEFAULTS: HardwareConfig = {
  printer_mode: "os",
  printer_address: "",
  paper_width: "80",
  drawer_mode: "printer",
  drawer_address: "",
  label_mode: "same_as_receipt",
  label_address: "",
  label_width_mm: 50,
  label_height_mm: 30,
};

const HW_KEYS = Object.keys(HARDWARE_DEFAULTS) as (keyof HardwareConfig)[];

export async function getHardwareConfig(): Promise<HardwareConfig> {
  const db = await getDb();
  const rows = await db.select<{ key: string; value: string | null }[]>(
    `SELECT key, value FROM settings WHERE key LIKE 'hw_%'`,
  );
  const map = new Map(rows.map((r) => [r.key.replace(/^hw_/, ""), r.value]));
  const cfg = { ...HARDWARE_DEFAULTS };
  for (const k of HW_KEYS) {
    const v = map.get(k);
    if (v == null) continue;
    if (k === "label_width_mm" || k === "label_height_mm") {
      (cfg[k] as number) = Number(v) || HARDWARE_DEFAULTS[k];
    } else {
      (cfg[k] as string) = v;
    }
  }
  return cfg;
}

export async function saveHardwareConfig(cfg: HardwareConfig): Promise<void> {
  const db = await getDb();
  for (const k of HW_KEYS) {
    await db.execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [`hw_${k}`, String(cfg[k])],
    );
  }
}

export function colsFor(width: "80" | "58"): number {
  return width === "58" ? 32 : 48;
}

// --- Print payloads --------------------------------------------------------

export interface ReceiptLine {
  description: string;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
}

export interface ReceiptData {
  shop_name: string;
  header?: string;
  footer?: string;
  code: string;
  datetime: string;
  lines: ReceiptLine[];
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  tendered_cents: number;
  change_cents: number;
  /** Unpaid balance when the customer settles only part of the total (credit). */
  remaining_cents: number;
  currency: CurrencyConfig;
}

export interface LabelData {
  title: string;
  variant: string; // e.g. "M / Black"
  barcode: string;
  price_cents: number;
  currency: CurrencyConfig;
}

// --- Byte builders ---------------------------------------------------------

function buildReceiptBytes(d: ReceiptData, cols: number): Uint8Array {
  const b = new EscPosBuilder(cols);
  const m = (c: number) => formatMoney(c, d.currency);
  b.init().align("center").bold(true).size(1, 1).line(d.shop_name).size(0, 0).bold(false);
  if (d.header) b.line(d.header);
  b.feed(1).align("left").line(i18n.t("receipt.receiptCode", { code: d.code })).line(d.datetime).rule();
  for (const l of d.lines) {
    b.row(l.description, m(l.line_total_cents));
    if (l.qty > 1) b.line(`  ${l.qty} x ${m(l.unit_price_cents)}`);
  }
  b.rule();
  if (d.discount_cents > 0) {
    b.row(i18n.t("receipt.subtotal"), m(d.subtotal_cents));
    b.row(i18n.t("receipt.discount"), `-${m(d.discount_cents)}`);
  }
  b.bold(true).row(i18n.t("receipt.total"), m(d.total_cents)).bold(false);
  b.row(i18n.t("receipt.cash"), m(d.tendered_cents));
  if (d.remaining_cents > 0) {
    b.bold(true).row(i18n.t("receipt.remaining"), m(d.remaining_cents)).bold(false);
  } else {
    b.row(i18n.t("receipt.change"), m(d.change_cents));
  }
  if (d.footer) b.feed(1).align("center").line(d.footer);
  b.cut();
  return b.build();
}

function buildLabelBytes(d: LabelData): Uint8Array {
  const b = new EscPosBuilder(32);
  b.init().align("center").bold(true).line(d.title).bold(false);
  if (d.variant) b.line(d.variant);
  b.line(formatMoney(d.price_cents, d.currency)).barcode128(d.barcode).feed(1).cut();
  return b.build();
}

// --- Transport dispatch ----------------------------------------------------

async function sendBytes(mode: PrinterMode, address: string, bytes: Uint8Array) {
  if (mode === "escpos_usb") {
    await invoke("print_raw", { transport: "usb", address, data: Array.from(bytes) });
  } else if (mode === "escpos_network") {
    await invoke("print_raw", { transport: "network", address, data: Array.from(bytes) });
  }
}

/** Render arbitrary HTML through the system print dialog (OS mode). */
export function printHtml(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  setTimeout(() => document.body.removeChild(iframe), 1000);
}

function receiptHtml(d: ReceiptData): string {
  const m = (c: number) => formatMoney(c, d.currency);
  const rows = d.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.description)}${l.qty > 1 ? ` <small>(${l.qty}×${m(l.unit_price_cents)})</small>` : ""}</td><td style="text-align:right">${m(l.line_total_cents)}</td></tr>`,
    )
    .join("");
  return `<html><head><meta charset="utf-8"><style>
    @page { margin: 4mm; }
    body { font-family: ui-monospace, monospace; width: ${d.currency ? "72mm" : "72mm"}; font-size: 12px; }
    h2 { text-align:center; margin:0; } table { width:100%; border-collapse:collapse; }
    td { padding: 1px 0; } .rule { border-top:1px dashed #000; margin:4px 0; }
    .tot td { font-weight:bold; } .center { text-align:center; }
  </style></head><body>
    <h2>${esc(d.shop_name)}</h2>
    ${d.header ? `<div class="center">${esc(d.header)}</div>` : ""}
    <div>${esc(i18n.t("receipt.receiptCode", { code: d.code }))}<br>${esc(d.datetime)}</div>
    <div class="rule"></div>
    <table>${rows}</table>
    <div class="rule"></div>
    <table>
      ${d.discount_cents > 0 ? `<tr><td>${esc(i18n.t("receipt.subtotal"))}</td><td style="text-align:right">${m(d.subtotal_cents)}</td></tr><tr><td>${esc(i18n.t("receipt.discount"))}</td><td style="text-align:right">-${m(d.discount_cents)}</td></tr>` : ""}
      <tr class="tot"><td>${esc(i18n.t("receipt.total"))}</td><td style="text-align:right">${m(d.total_cents)}</td></tr>
      <tr><td>${esc(i18n.t("receipt.cash"))}</td><td style="text-align:right">${m(d.tendered_cents)}</td></tr>
      ${d.remaining_cents > 0
        ? `<tr class="tot"><td>${esc(i18n.t("receipt.remaining"))}</td><td style="text-align:right">${m(d.remaining_cents)}</td></tr>`
        : `<tr><td>${esc(i18n.t("receipt.change"))}</td><td style="text-align:right">${m(d.change_cents)}</td></tr>`}
    </table>
    ${d.footer ? `<div class="rule"></div><div class="center">${esc(d.footer)}</div>` : ""}
  </body></html>`;
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

// --- Public API ------------------------------------------------------------

export async function printReceipt(d: ReceiptData, cfg?: HardwareConfig) {
  const c = cfg ?? (await getHardwareConfig());
  if (c.printer_mode === "disabled") return;
  if (c.printer_mode === "os") {
    printHtml(receiptHtml(d));
    return;
  }
  const bytes = buildReceiptBytes(d, colsFor(c.paper_width));
  await sendBytes(c.printer_mode, c.printer_address, bytes);
}

export async function openCashDrawer(cfg?: HardwareConfig) {
  const c = cfg ?? (await getHardwareConfig());
  if (c.drawer_mode === "none") return;
  const bytes = new EscPosBuilder().drawerKick().build();
  if (c.drawer_mode === "usb") {
    await invoke("print_raw", { transport: "usb", address: c.drawer_address, data: Array.from(bytes) });
  } else if (c.printer_mode === "escpos_usb" || c.printer_mode === "escpos_network") {
    await sendBytes(c.printer_mode, c.printer_address, bytes);
  }
}

export async function printLabel(d: LabelData, cfg?: HardwareConfig) {
  const c = cfg ?? (await getHardwareConfig());
  const mode = c.label_mode === "same_as_receipt" ? c.printer_mode : c.label_mode;
  const address = c.label_mode === "same_as_receipt" ? c.printer_address : c.label_address;
  if (mode === "disabled" || mode === "pdf") return;
  if (mode === "os") {
    printHtml(labelHtml(d, c));
    return;
  }
  await sendBytes(mode, address, buildLabelBytes(d));
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Save a jsPDF doc via the native save dialog, or download it under `npm run dev`. */
async function saveLabelPdf(doc: jsPDF): Promise<void> {
  const bytes = new Uint8Array(doc.output("arraybuffer"));
  const name = `labels-${Date.now()}.pdf`;
  if (isTauri()) {
    const { save } = await import("@tauri-apps/api/dialog");
    const path = await save({
      defaultPath: name,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!path) return;
    await invoke("write_bytes", { path, data: Array.from(bytes) });
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

/**
 * Print a designed label template for a set of variants. The output method
 * follows the configured `label_mode`: `os` renders the faithful HTML through
 * the system print dialog, `pdf` exports a file, ESC/POS modes send a
 * best-effort stacked label, `disabled` is a no-op.
 */
export async function printLabelDesign(
  template: LabelTemplate,
  items: LabelPrintItem[],
  currency: CurrencyConfig,
  cfg?: HardwareConfig,
) {
  const c = cfg ?? (await getHardwareConfig());
  const mode = c.label_mode === "same_as_receipt" ? c.printer_mode : c.label_mode;
  const address = c.label_mode === "same_as_receipt" ? c.printer_address : c.label_address;
  if (mode === "disabled") return;
  if (mode === "pdf") {
    await saveLabelPdf(labelDesignPdf(template, items, currency));
    return;
  }
  if (mode === "os") {
    printHtml(labelDesignHtml(template, items, currency));
    return;
  }
  await sendBytes(mode, address, labelDesignEscpos(template, items, currency));
}

function labelHtml(d: LabelData, c: HardwareConfig): string {
  // For OS mode we render the barcode as plain text; a dedicated barcode font
  // or SVG can be added once the label printer/model is known.
  return `<html><head><meta charset="utf-8"><style>
    @page { size: ${c.label_width_mm}mm ${c.label_height_mm}mm; margin: 1mm; }
    body { font-family: ui-monospace, monospace; text-align:center; margin:0; }
    .t { font-weight:bold; font-size:11px; } .v { font-size:10px; }
    .p { font-size:13px; font-weight:bold; } .b { font-size:10px; letter-spacing:1px; }
  </style></head><body>
    <div class="t">${esc(d.title)}</div>
    ${d.variant ? `<div class="v">${esc(d.variant)}</div>` : ""}
    <div class="p">${formatMoney(d.price_cents, d.currency)}</div>
    <div class="b">${esc(d.barcode)}</div>
  </body></html>`;
}
