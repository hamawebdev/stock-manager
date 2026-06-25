/**
 * Normalise a loaded `DocData` bundle + shop/settings into a presentation-ready
 * `DocumentModel`. Pure and synchronous, so the preview re-renders instantly on
 * any settings change. All labels are French (Algerian commercial documents).
 */
import { formatMoney, type CurrencyConfig } from "@/lib/money";
import { amountToFrenchWords } from "@/lib/num-to-words";
import { paymentMethodLabel, supplierMethodLabel } from "../payment-methods";
import type { Customer } from "../customers";
import type { LedgerEntry, Supplier } from "../types";
import type {
  DocData,
  DocLedgerRow,
  DocLineItem,
  DocParty,
  DocTotalLine,
  DocumentModel,
  PartyFields,
  StudioSettings,
  DocShop,
} from "./types";

/** ISO timestamp ("YYYY-MM-DD …") → "DD/MM/YYYY". */
export function formatDocDate(iso: string | null): string {
  if (!iso) return "";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso;
}

/** Build the toggled legal/contact rows for a customer or supplier party. */
function partyRows(
  entity: Customer | Supplier,
  fields: PartyFields,
): { label: string; value: string }[] {
  const candidates: { on: boolean; label: string; value: string | null }[] = [
    { on: fields.phone, label: "Tél", value: entity.phone },
    { on: fields.rib, label: "RIB", value: entity.rib },
    { on: fields.nif, label: "NIF", value: entity.nif },
    { on: fields.nis, label: "NIS", value: entity.nis },
    { on: fields.rc, label: "RC", value: entity.rc },
    { on: fields.art, label: "ART", value: entity.art_imposition },
  ];
  return candidates
    .filter((c) => c.on && c.value && c.value.trim())
    .map((c) => ({ label: c.label, value: c.value!.trim() }));
}

function ledgerRows(
  entries: LedgerEntry[],
  m: (c: number) => string,
): DocLedgerRow[] {
  return entries.map((e) => ({
    date: formatDocDate(e.date),
    label: e.label,
    debit: e.debit_cents ? m(e.debit_cents) : "-",
    credit: e.credit_cents ? m(e.credit_cents) : "-",
    solde: m(e.balance_cents),
  }));
}

function lineRows(lines: DocLineItem[], m: (c: number) => string) {
  return lines.map((l) => ({
    ref: l.ref || "—",
    designation: l.description,
    qty: l.unit ? `${l.qty} ${l.unit}` : String(l.qty),
    pu: m(l.unit_price_cents),
    total: m(l.line_total_cents),
  }));
}

export function buildDocumentModel(
  data: DocData,
  shop: DocShop,
  currency: CurrencyConfig,
  settings: StudioSettings,
): DocumentModel {
  const m = (c: number) => formatMoney(c, currency);
  const words = (c: number) => amountToFrenchWords(c, currency.decimals);
  const f = settings.fields;

  const base = {
    shop,
    party: null as DocParty | null,
    items: null as DocumentModel["items"],
    puLabel: "P.U TTC",
    ledger: null as DocumentModel["ledger"],
    totals: [] as DocTotalLine[],
    amountInWords: null as string | null,
    paymentHistory: null as DocumentModel["paymentHistory"],
    barcodeValue: null as string | null,
    finalBalance: null as DocumentModel["finalBalance"],
  };

  switch (data.kind) {
    case "facture": {
      const { sale, lines, customer, ancienneDette } = data;
      const name = customer?.name ?? "Client Comptoir";
      const resteDu = Math.max(0, sale.total_ttc_cents - sale.paid_cents);
      const totals: DocTotalLine[] = [
        { label: "Total HT", value: m(sale.subtotal_ht_cents), tone: "muted" },
        { label: `TVA ${sale.tva_rate}%`, value: m(sale.tva_cents), tone: "muted" },
        { label: "NET À PAYER", value: m(sale.total_ttc_cents), strong: true, tone: "primary" },
        { label: "Versé", value: m(sale.paid_cents), tone: "primary" },
        { label: "Reste Dû", value: m(resteDu), tone: resteDu > 0 ? "danger" : "default" },
      ];
      if (customer) {
        totals.push({ label: "Ancienne Dette", value: m(ancienneDette) });
        totals.push({
          label: "SOLDE TOTAL",
          value: m(ancienneDette + resteDu),
          strong: true,
          tone: "danger",
        });
      }
      return {
        ...base,
        docTypeLabel: "FACTURE",
        numberRaw: sale.code,
        numberLabel: `N° ${sale.code}`,
        dateLabel: formatDocDate(sale.created_at),
        paymentMode: paymentMethodLabel(sale.payment_method).toUpperCase(),
        party: settings.showParty
          ? {
              blockLabel: "CLIENT",
              name: f.name ? name : "",
              rows: customer ? partyRows(customer, f) : [],
            }
          : null,
        items: lineRows(lines, m),
        puLabel: "P.U TTC",
        totals,
        amountInWords: words(sale.total_ttc_cents),
        barcodeValue: sale.code,
      };
    }

    case "bon_commande": {
      const { purchase, lines, payments, supplier } = data;
      const code = purchase.code ?? `#${purchase.id}`;
      const resteDu = Math.max(0, purchase.total_ttc_cents - purchase.paid_cents);
      const totals: DocTotalLine[] = [
        { label: "Total HT", value: m(purchase.subtotal_ht_cents), tone: "muted" },
        { label: `TVA ${purchase.tva_rate}%`, value: m(purchase.tva_cents), tone: "muted" },
        { label: "NET À PAYER", value: m(purchase.total_ttc_cents), strong: true, tone: "primary" },
        { label: "Versé", value: m(purchase.paid_cents), tone: "primary" },
        { label: "Reste Dû", value: m(resteDu), tone: resteDu > 0 ? "danger" : "default" },
      ];
      return {
        ...base,
        docTypeLabel: "BON COMMANDE",
        numberRaw: code,
        numberLabel: `N° ${code}`,
        dateLabel: formatDocDate(purchase.purchase_date ?? purchase.created_at),
        paymentMode: null,
        party:
          settings.showParty && supplier
            ? {
                blockLabel: "FOURNISSEUR",
                name: f.name ? (purchase.supplier_name ?? supplier.name) : "",
                rows: partyRows(supplier, f),
              }
            : null,
        items: lineRows(lines, m),
        puLabel: "P.U HT",
        totals,
        amountInWords: words(purchase.total_ttc_cents),
        paymentHistory: payments.length
          ? payments.map((p) => ({
              date: formatDocDate(p.created_at),
              label: supplierMethodLabel(p.method) + (p.reference ? ` — ${p.reference}` : ""),
              amount: m(p.amount_cents),
            }))
          : null,
        barcodeValue: code,
      };
    }

    case "releve_compte": {
      const { customer, ledger, balance } = data;
      return {
        ...base,
        docTypeLabel: "RELEVÉ DE COMPTE",
        numberRaw: String(customer.id),
        numberLabel: `N° ${customer.id}`,
        dateLabel: formatDocDate(new Date().toISOString()),
        paymentMode: null,
        party: settings.showParty
          ? { blockLabel: "CLIENT", name: f.name ? customer.name : "", rows: partyRows(customer, f) }
          : null,
        ledger: ledgerRows(ledger, m),
        finalBalance: { label: "SOLDE FINAL", value: m(balance) },
      };
    }

    case "releve_fournisseur": {
      const { supplier, ledger, balance } = data;
      return {
        ...base,
        docTypeLabel: "RELEVÉ FOURNISSEUR",
        numberRaw: String(supplier.id),
        numberLabel: `N° ${supplier.id}`,
        dateLabel: formatDocDate(new Date().toISOString()),
        paymentMode: null,
        party: settings.showParty
          ? { blockLabel: "FOURNISSEUR", name: f.name ? supplier.name : "", rows: partyRows(supplier, f) }
          : null,
        ledger: ledgerRows(ledger, m),
        finalBalance: { label: "SOLDE FINAL", value: m(balance) },
      };
    }
  }
}
