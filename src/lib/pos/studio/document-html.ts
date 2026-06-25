/**
 * Renders a {@link DocumentModel} to a self-contained A4/A5/Ticket HTML string,
 * styled to match the purple "Infinity" reference. The SAME string feeds both
 * the live preview iframe and the OS print dialog (via `printHtml`), so what you
 * see is exactly what prints. The jsPDF path (`studio-pdf.ts`) is a separate,
 * near-match renderer. Mirrors the HTML-string approach in `label-render.ts`.
 */
import { barcodeSvgMarkup } from "../label-render";
import type { DocumentModel, PaperFormat, StudioSettings, Tone } from "./types";

const PAGE: Record<PaperFormat, { w: number; h: number | null; pad: number }> = {
  a4: { w: 210, h: 297, pad: 14 },
  a5: { w: 148, h: 210, pad: 10 },
  ticket: { w: 80, h: null, pad: 5 },
};

const VIOLET = "#6d28d9";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

function toneClass(tone?: Tone): string {
  return tone && tone !== "default" ? ` tone-${tone}` : "";
}

function headerHtml(model: DocumentModel, logoScale: number): string {
  const s = model.shop;
  const logo = s.logoDataUrl
    ? `<img class="logo" style="height:${(18 * logoScale) / 100}mm" src="${s.logoDataUrl}" alt="" />`
    : "";
  const meta = [s.address, s.phone, s.email].filter(Boolean).map(esc).join("<br/>");
  const sub = [
    `Date : ${esc(model.dateLabel)}`,
    model.paymentMode ? `Mode : ${esc(model.paymentMode)}` : "",
  ]
    .filter(Boolean)
    .join("<br/>");
  return `<div class="head">
    <div class="brand">
      ${logo}
      <div class="shop-name">${esc(s.name)}</div>
      <div class="shop-meta">${meta}</div>
    </div>
    <div class="doc-meta">
      <span class="badge">${esc(model.docTypeLabel)}</span>
      <div class="doc-no">${esc(model.numberLabel)}</div>
      <div class="doc-sub">${sub}</div>
    </div>
  </div>`;
}

function partyHtml(model: DocumentModel): string {
  const p = model.party;
  if (!p) return "";
  const rows = p.rows
    .map((r) => `<span><b>${esc(r.label)}:</b> ${esc(r.value)}</span>`)
    .join("");
  return `<div class="party">
    <div class="party-label">${esc(p.blockLabel)}</div>
    ${p.name ? `<div class="party-name">${esc(p.name)}</div>` : ""}
    ${rows ? `<div class="party-rows">${rows}</div>` : ""}
  </div>`;
}

function itemsHtml(model: DocumentModel, zebra: boolean): string {
  if (!model.items) return "";
  const rows = model.items
    .map(
      (r) => `<tr>
      <td class="ref">${esc(r.ref)}</td>
      <td>${esc(r.designation)}</td>
      <td class="num">${esc(r.qty)}</td>
      <td class="num">${esc(r.pu)}</td>
      <td class="num strong">${esc(r.total)}</td>
    </tr>`,
    )
    .join("");
  return `<table class="${zebra ? "zebra" : ""}">
    <thead><tr>
      <th>RÉF</th><th>DÉSIGNATION</th>
      <th class="num">QTÉ</th><th class="num">${esc(model.puLabel)}</th><th class="num">TOTAL</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function ledgerHtml(model: DocumentModel, zebra: boolean): string {
  if (!model.ledger) return "";
  const rows = model.ledger
    .map(
      (r) => `<tr>
      <td>${esc(r.date)}</td>
      <td>${esc(r.label)}</td>
      <td class="num debit">${esc(r.debit)}</td>
      <td class="num credit">${esc(r.credit)}</td>
      <td class="num strong">${esc(r.solde)}</td>
    </tr>`,
    )
    .join("");
  return `<table class="${zebra ? "zebra" : ""}">
    <thead><tr>
      <th>DATE</th><th>LIBELLÉ</th>
      <th class="num">DÉBIT</th><th class="num">CRÉDIT</th><th class="num">SOLDE</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function totalsHtml(model: DocumentModel): string {
  if (!model.totals.length) return "";
  const rows = model.totals
    .map(
      (l) =>
        `<div class="row${l.strong ? " strong" : ""}${toneClass(l.tone)}">
          <span>${esc(l.label)}</span><span>${esc(l.value)}</span>
        </div>`,
    )
    .join("");
  return `<div class="totals">${rows}</div>`;
}

function paymentHistoryHtml(model: DocumentModel): string {
  if (!model.paymentHistory) return "";
  const rows = model.paymentHistory
    .map(
      (p) =>
        `<div class="ph-row"><span>${esc(p.date)}</span><span>${esc(p.label)}</span><span class="num">${esc(p.amount)}</span></div>`,
    )
    .join("");
  return `<div class="pay-history">
    <div class="ph-title">Historique des Paiements</div>
    ${rows}
  </div>`;
}

function footerHtml(model: DocumentModel, settings: StudioSettings): string {
  const parts: string[] = [];
  if (model.amountInWords) {
    parts.push(
      `<div class="words">Arrêté la présente à la somme de : <b>${esc(model.amountInWords)}</b></div>`,
    );
  }
  if (model.finalBalance) {
    parts.push(
      `<div class="solde-final"><span>${esc(model.finalBalance.label)}</span><span>${esc(model.finalBalance.value)}</span></div>`,
    );
  }
  if (model.barcodeValue) {
    const svg = barcodeSvgMarkup(model.barcodeValue, true);
    if (svg) parts.push(`<div class="barcode">${svg}</div>`);
  }
  if (settings.showSignature) {
    parts.push(`<div class="sign">Signature / Cachet</div>`);
  }
  return parts.join("");
}

/** Build the full, self-contained document HTML for preview + print. */
export function documentHtml(model: DocumentModel, settings: StudioSettings): string {
  const page = PAGE[settings.paper];
  const d = settings.density;
  const fs = settings.fontSize;

  const body = model.ledger
    ? ledgerHtml(model, settings.zebra)
    : itemsHtml(model, settings.zebra);

  // Bon de Commande shows payment history beside the totals; otherwise totals alone.
  const totalsBlock = model.paymentHistory
    ? `<div class="two-col">${paymentHistoryHtml(model)}${totalsHtml(model)}</div>`
    : totalsHtml(model);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; background: #f1f1f4; }
    @page { size: ${page.w}mm ${page.h ? page.h + "mm" : "auto"}; margin: 0; }
    body {
      font-family: ${settings.fontFamily}, "Segoe UI", Arial, sans-serif;
      color: #1e1b2e; font-size: ${fs}pt;
    }
    .page {
      width: ${page.w}mm; ${page.h ? `min-height: ${page.h}mm;` : ""}
      padding: ${page.pad}mm; background: #fff; position: relative; margin: 0 auto;
    }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; }
    .brand .logo { display: block; margin-bottom: ${2 * d}mm; object-fit: contain; }
    .brand .shop-name { color: ${VIOLET}; font-size: 1.7em; font-weight: 800; }
    .brand .shop-meta { color: #6b7280; font-size: 0.78em; line-height: 1.5; margin-top: ${1 * d}mm; }
    .doc-meta { text-align: right; }
    .badge {
      display: inline-block; background: ${VIOLET}; color: #fff; padding: 1.5mm 4mm;
      border-radius: 3mm; font-weight: 700; letter-spacing: 0.06em; font-size: 0.8em;
    }
    .doc-no { font-size: 1.5em; font-weight: 800; margin-top: ${3 * d}mm; }
    .doc-sub { color: #6b7280; font-size: 0.82em; line-height: 1.6; margin-top: ${1 * d}mm; }
    .party {
      margin-top: ${6 * d}mm; border: 1px solid #ece9f6; border-radius: 2mm;
      padding: ${4 * d}mm; background: #f5f3ff;
    }
    .party-label { color: #8b87a3; font-size: 0.68em; letter-spacing: 0.12em; text-transform: uppercase; }
    .party-name { font-weight: 700; font-size: 1.15em; margin-top: 0.5mm; }
    .party-rows { display: flex; flex-wrap: wrap; gap: ${1 * d}mm 6mm; margin-top: ${1.5 * d}mm; font-size: 0.8em; color: #4b5563; }
    table { width: 100%; border-collapse: collapse; margin-top: ${6 * d}mm; font-size: 0.9em; }
    th { color: ${VIOLET}; text-align: left; font-size: 0.78em; letter-spacing: 0.04em; border-bottom: 1.5px solid ${VIOLET}; padding: ${2 * d}mm; }
    td { padding: ${2 * d}mm; border-bottom: 1px solid #eceaf2; vertical-align: top; }
    td.ref { color: #6b7280; font-size: 0.92em; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .strong { font-weight: 700; }
    .zebra tbody tr:nth-child(even) { background: #faf9ff; }
    .debit { color: #d97706; }
    .credit { color: #059669; }
    .two-col { display: flex; justify-content: space-between; gap: 8mm; margin-top: ${6 * d}mm; align-items: flex-start; }
    .pay-history { font-size: 0.82em; flex: 1; }
    .ph-title { color: ${VIOLET}; font-weight: 700; margin-bottom: ${1.5 * d}mm; }
    .ph-row { display: flex; gap: 4mm; padding: ${0.8 * d}mm 0; border-bottom: 1px solid #f0eff5; }
    .ph-row span:nth-child(2) { flex: 1; color: #4b5563; }
    .totals { margin-top: ${6 * d}mm; margin-left: auto; width: 78mm; }
    .two-col .totals { margin-top: 0; }
    .totals .row { display: flex; justify-content: space-between; padding: ${1.2 * d}mm 0; font-size: 0.92em; }
    .totals .row.strong { font-size: 1.05em; border-top: 1px solid #eceaf2; padding-top: ${2 * d}mm; }
    .tone-primary { color: ${VIOLET}; }
    .tone-danger { color: #dc2626; }
    .tone-muted { color: #6b7280; }
    .words { margin-top: ${8 * d}mm; font-style: italic; font-size: 0.84em; color: #374151; }
    .solde-final {
      margin-top: ${6 * d}mm; margin-left: auto; width: 90mm; background: ${VIOLET}; color: #fff;
      padding: ${3 * d}mm 4mm; display: flex; justify-content: space-between; font-weight: 800;
      border-radius: 2mm; letter-spacing: 0.03em;
    }
    .barcode { margin-top: ${8 * d}mm; text-align: center; }
    .barcode svg { width: 56mm; height: 14mm; }
    .sign {
      margin-top: ${10 * d}mm; margin-left: auto; width: 52mm; height: 24mm; border: 1px dashed #c9c5da;
      border-radius: 2mm; display: flex; align-items: flex-start; justify-content: center;
      padding-top: 2mm; color: #8b87a3; font-size: 0.8em;
    }
  </style></head><body>
    <div class="page">
      ${headerHtml(model, settings.logoScale)}
      ${partyHtml(model)}
      ${body}
      ${totalsBlock}
      ${footerHtml(model, settings)}
    </div>
  </body></html>`;
}
