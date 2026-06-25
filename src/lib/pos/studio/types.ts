/**
 * Studio document module — shared types. A `DocData` bundle (loaded per template
 * in `data.ts`) is normalised by `buildDocumentModel` into a presentation-only
 * `DocumentModel` that both renderers (HTML preview/print + jsPDF) consume.
 */
import type {
  LedgerEntry,
  PurchaseRow,
  Sale,
  Supplier,
  SupplierPayment,
} from "../types";
import type { Customer } from "../customers";

/** A normalised document line (ref resolved from the variant) shared by the
 *  Facture (P.U TTC) and Bon de Commande (P.U HT) line tables. */
export interface DocLineItem {
  ref: string;
  description: string;
  qty: number;
  unit: string | null;
  unit_price_cents: number;
  line_total_cents: number;
}

export type DocTemplate =
  | "facture"
  | "bon_commande"
  | "releve_compte"
  | "releve_fournisseur";

/** Which left-pane source list feeds each template. */
export type SourceKind = "ventes" | "achats" | "clients" | "fournisseurs";

export const TEMPLATE_SOURCE: Record<DocTemplate, SourceKind> = {
  facture: "ventes",
  bon_commande: "achats",
  releve_compte: "clients",
  releve_fournisseur: "fournisseurs",
};

export const SOURCE_TEMPLATE: Record<SourceKind, DocTemplate> = {
  ventes: "facture",
  achats: "bon_commande",
  clients: "releve_compte",
  fournisseurs: "releve_fournisseur",
};

export type PaperFormat = "a4" | "a5" | "ticket";

/** Individually toggleable legal/contact fields on the party block. */
export interface PartyFields {
  name: boolean;
  phone: boolean;
  rib: boolean;
  nif: boolean;
  nis: boolean;
  rc: boolean;
  art: boolean;
}

/** Ephemeral appearance + content settings (reset each visit). */
export interface StudioSettings {
  template: DocTemplate;
  fontFamily: string;
  fontSize: number; // pt
  logoScale: number; // %
  paper: PaperFormat;
  density: number; // line-spacing multiplier, 0.6 .. 1.4
  showSignature: boolean;
  zebra: boolean;
  showParty: boolean;
  fields: PartyFields;
}

export const DEFAULT_STUDIO_SETTINGS: StudioSettings = {
  template: "facture",
  fontFamily: "Inter",
  fontSize: 12,
  logoScale: 100,
  paper: "a4",
  density: 1,
  showSignature: false,
  zebra: false,
  showParty: true,
  fields: { name: true, phone: true, rib: true, nif: true, nis: true, rc: true, art: true },
};

// --- Loaded data bundles (discriminated by template) -----------------------

export type DocData =
  | {
      kind: "facture";
      sale: Sale;
      lines: DocLineItem[];
      customer: Customer | null;
      /** Customer balance just before this invoice (Ancienne Dette). */
      ancienneDette: number;
      /** Customer balance now (Solde Total). */
      soldeTotal: number;
    }
  | {
      kind: "bon_commande";
      purchase: PurchaseRow;
      lines: DocLineItem[];
      payments: SupplierPayment[];
      supplier: Supplier | null;
    }
  | { kind: "releve_compte"; customer: Customer; ledger: LedgerEntry[]; balance: number }
  | { kind: "releve_fournisseur"; supplier: Supplier; ledger: LedgerEntry[]; balance: number };

// --- Normalised, presentation-ready model ----------------------------------

export interface DocShop {
  name: string;
  address: string;
  phone: string;
  email: string;
  logoDataUrl: string | null;
  nif: string;
  nis: string;
  rc: string;
  art: string;
}

export interface DocParty {
  blockLabel: string; // "CLIENT" | "FOURNISSEUR"
  name: string;
  rows: { label: string; value: string }[];
}

export interface DocItemRow {
  ref: string;
  designation: string;
  qty: string;
  pu: string;
  total: string;
}

export interface DocLedgerRow {
  date: string;
  label: string;
  debit: string;
  credit: string;
  solde: string;
}

export type Tone = "default" | "primary" | "muted" | "danger";

export interface DocTotalLine {
  label: string;
  value: string;
  strong?: boolean;
  tone?: Tone;
}

export interface DocPaymentRow {
  date: string;
  label: string;
  amount: string;
}

export interface DocumentModel {
  docTypeLabel: string; // header badge, e.g. "FACTURE"
  numberRaw: string; // "FAC-2026-0031"
  numberLabel: string; // "N° FAC-2026-0031"
  dateLabel: string;
  paymentMode: string | null;
  shop: DocShop;
  party: DocParty | null;
  items: DocItemRow[] | null;
  /** Unit-price column header for the items table ("P.U TTC" | "P.U HT"). */
  puLabel: string;
  ledger: DocLedgerRow[] | null;
  totals: DocTotalLine[];
  amountInWords: string | null;
  paymentHistory: DocPaymentRow[] | null;
  barcodeValue: string | null;
  finalBalance: { label: string; value: string } | null;
}
