/**
 * TypeScript shapes mirroring the POS SQLite schema (migration 002).
 * Money fields are INTEGER minor units; see `@/lib/money`.
 */

export interface Category {
  id: number;
  name: string;
  created_at: string;
}

export interface Size {
  id: number;
  name: string;
  sort_order: number;
}

export interface Color {
  id: number;
  name: string;
  hex: string | null;
}

export interface Supplier {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  /** Fiscal / legal + extra contact fields (migration 006). */
  activity: string | null; // business activity
  phone_fixe: string | null; // landline
  fax: string | null;
  nif: string | null; // N° d'Identification Fiscale
  nis: string | null; // N° d'Identification Statistique
  rc: string | null; // Registre du Commerce
  art_imposition: string | null; // Article d'imposition
  rib: string | null; // bank account / RIB
  archived: number; // 0 | 1
  created_at: string;
}

/** Aggregate balance for a supplier: confirmed purchases vs payments. */
export interface SupplierBalance {
  total_purchases_cents: number;
  total_paid_cents: number;
  balance_cents: number; // purchases - paid (positive => we owe the supplier)
  confirmed_count: number;
}

export type PurchaseStatus = "draft" | "confirmed" | "cancelled";
export type PaymentTerms = "credit" | "partial" | "cash";

export interface Purchase {
  id: number;
  code: string | null; // 'A-000001', assigned on confirm
  supplier_id: number | null;
  status: PurchaseStatus;
  purchase_date: string | null;
  invoice_ref: string | null;
  note: string | null;
  tva_enabled: number; // 0 | 1
  tva_rate: number; // whole percent
  subtotal_ht_cents: number;
  tva_cents: number;
  total_ttc_cents: number;
  paid_cents: number;
  payment_terms: PaymentTerms | null;
  created_at: string;
  confirmed_at: string | null;
}

/** Purchase row joined with its supplier name, for list/detail views. */
export interface PurchaseRow extends Purchase {
  supplier_name: string | null;
}

export interface PurchaseItem {
  id: number;
  purchase_id: number;
  variant_id: number | null; // null => "Ligne libre" (free line)
  description: string;
  qty: number;
  unit: string | null;
  unit_cost_ht_cents: number;
  line_total_ht_cents: number;
}

export type SupplierPaymentMethod = "cash" | "cheque" | "transfer" | "card_other";

export interface SupplierPayment {
  id: number;
  supplier_id: number;
  purchase_id: number | null; // null => global account payment
  amount_cents: number; // negative => refund / return
  method: SupplierPaymentMethod;
  reference: string | null;
  note: string | null;
  cash_event_id: number | null;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  category_id: number | null;
  supplier_id: number | null;
  brand: string | null;
  reference: string | null; // product reference / style code (unique when set)
  description: string | null;
  notes: string | null; // internal comments
  cost_cents: number;
  price_cents: number;
  low_stock_threshold: number | null; // null => use global default
  reorder_quantity: number | null;
  out_of_stock_alert: number; // 0 | 1
  archived: number; // 0 | 1
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: number;
  product_id: number;
  path: string; // relative to <app-config>/product-images/
  is_primary: number; // 0 | 1
  sort_order: number;
  created_at: string;
}

export interface ActivityEntry {
  id: number;
  entity_type: "product" | "variant" | "supplier";
  entity_id: number;
  action: string;
  detail: string | null;
  created_at: string;
}

export interface Variant {
  id: number;
  product_id: number;
  size_id: number | null;
  color_id: number | null;
  sku: string;
  barcode: string | null;
  price_cents: number | null; // null => inherit product
  cost_cents: number | null;
  stock: number;
  archived: number;
  created_at: string;
}

/** Variant joined with its product + lookup names, for display and checkout. */
export interface VariantDetail extends Variant {
  product_name: string;
  /** The owning product's category — used for category-scoped promotions. */
  category_id: number | null;
  size_name: string | null;
  color_name: string | null;
  color_hex: string | null;
  /** Effective price: variant override or product default. */
  effective_price_cents: number;
}

export type MovementReason =
  | "sale"
  | "return"
  | "exchange"
  | "receiving"
  | "adjustment"
  | "stocktake";

export interface InventoryMovement {
  id: number;
  variant_id: number;
  delta: number;
  reason: MovementReason;
  ref_type: string | null;
  ref_id: number | null;
  note: string | null;
  created_at: string;
}

/** Payment modes for sales and customer versements (migration 007). */
export type CustomerPaymentMethod =
  | "especes"
  | "cheque"
  | "virement"
  | "cib"
  | "ccp";

export interface Sale {
  id: number;
  code: string;
  subtotal_cents: number;
  cart_discount_cents: number;
  total_cents: number;
  cash_tendered_cents: number;
  change_cents: number;
  status: "completed" | "voided";
  note: string | null;
  /** Optional customer the sale is attributed to (migration 004). */
  customer_id: number | null;
  created_at: string;
  /** TVA + paid/credit split + payment mode (migration 007). For legacy cash
   *  sales these were backfilled from the totals above (no TVA, paid in full). */
  tva_enabled: number; // 0 | 1
  tva_rate: number; // whole percent
  subtotal_ht_cents: number;
  tva_cents: number;
  total_ttc_cents: number;
  paid_cents: number;
  payment_method: CustomerPaymentMethod | null;
}

/** Sale row joined with its customer name, for the Studio list/detail views. */
export interface SaleRow extends Sale {
  customer_name: string | null;
}

/** Aggregate balance for a customer: sales (TTC) vs payments (mirrors SupplierBalance). */
export interface CustomerBalance {
  total_sales_cents: number;
  total_paid_cents: number;
  balance_cents: number; // sales - paid (positive => the customer owes us)
  sale_count: number;
}

export interface CustomerPayment {
  id: number;
  customer_id: number;
  sale_id: number | null; // null => global account payment
  amount_cents: number; // negative => refund / avoir
  method: CustomerPaymentMethod;
  reference: string | null;
  note: string | null;
  cash_event_id: number | null;
  created_at: string;
}

/**
 * One row of an account statement (Relevé de Compte / Relevé Fournisseur). The
 * French `label` (libellé) is built where the row is produced so document
 * rendering stays presentation-only. A negative payment (refund/avoir) lands in
 * `debit_cents`; `balance_cents` is the running solde after this row.
 */
export interface LedgerEntry {
  date: string;
  label: string;
  debit_cents: number;
  credit_cents: number;
  balance_cents: number;
}

export interface SaleItem {
  id: number;
  sale_id: number;
  variant_id: number;
  description: string;
  qty: number;
  unit_price_cents: number;
  line_discount_cents: number;
  line_total_cents: number;
  qty_returned: number;
}

/** A returns row joined to its original sale code + customer, for history/reports. */
export interface ReturnRow {
  id: number;
  code: string;
  original_sale_id: number | null;
  kind: "refund" | "exchange";
  return_value_cents: number;
  exchange_value_cents: number;
  net_cash_cents: number;
  note: string | null;
  created_at: string;
  /** Joined: code of the linked original sale (null = no receipt / walk-in). */
  original_sale_code: string | null;
  /** Joined: name of the customer on the original sale, if any. */
  customer_name: string | null;
}

export interface ShopSettings {
  shop_name: string;
  currency_symbol: string;
  currency_decimals: number;
  receipt_header: string;
  receipt_footer: string;
  /** Document header / branding + the shop's own legal IDs (migration 007). */
  shop_address: string;
  shop_phone: string;
  shop_email: string;
  shop_logo: string; // relative path under <app-config>/shop-assets/, "" when unset
  shop_nif: string;
  shop_nis: string;
  shop_rc: string;
  shop_art: string;
  /** Default TVA rate (whole percent) prefilled at checkout. */
  default_tva_rate: number;
}
