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
  archived: number; // 0 | 1
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
  created_at: string;
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

export interface ShopSettings {
  shop_name: string;
  currency_symbol: string;
  currency_decimals: number;
  receipt_header: string;
  receipt_footer: string;
}
