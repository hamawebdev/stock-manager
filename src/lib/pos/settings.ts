/** Shop settings: a typed view over the `settings` key/value table. */
import { getDb } from "./db";
import type { CurrencyConfig } from "@/lib/money";
import type { ShopSettings } from "./types";

const DEFAULTS: ShopSettings = {
  shop_name: "My Shop",
  currency_symbol: "",
  currency_decimals: 2,
  receipt_header: "",
  receipt_footer: "Thank you!",
  shop_address: "",
  shop_phone: "",
  shop_email: "",
  shop_logo: "",
  shop_nif: "",
  shop_nis: "",
  shop_rc: "",
  shop_art: "",
  default_tva_rate: 19,
};

export async function getSettings(): Promise<ShopSettings> {
  const db = await getDb();
  const rows = await db.select<{ key: string; value: string | null }[]>(
    "SELECT key, value FROM settings",
  );
  const map = new Map(rows.map((r) => [r.key, r.value ?? ""]));
  return {
    shop_name: map.get("shop_name") || DEFAULTS.shop_name,
    currency_symbol: map.get("currency_symbol") ?? DEFAULTS.currency_symbol,
    currency_decimals: Number(map.get("currency_decimals") ?? DEFAULTS.currency_decimals),
    receipt_header: map.get("receipt_header") ?? DEFAULTS.receipt_header,
    receipt_footer: map.get("receipt_footer") ?? DEFAULTS.receipt_footer,
    shop_address: map.get("shop_address") ?? DEFAULTS.shop_address,
    shop_phone: map.get("shop_phone") ?? DEFAULTS.shop_phone,
    shop_email: map.get("shop_email") ?? DEFAULTS.shop_email,
    shop_logo: map.get("shop_logo") ?? DEFAULTS.shop_logo,
    shop_nif: map.get("shop_nif") ?? DEFAULTS.shop_nif,
    shop_nis: map.get("shop_nis") ?? DEFAULTS.shop_nis,
    shop_rc: map.get("shop_rc") ?? DEFAULTS.shop_rc,
    shop_art: map.get("shop_art") ?? DEFAULTS.shop_art,
    default_tva_rate: Number(map.get("default_tva_rate") ?? DEFAULTS.default_tva_rate),
  };
}

/** Read a single raw setting value, or null when unset. */
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string | null }[]>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export function currencyFromSettings(s: ShopSettings): CurrencyConfig {
  return { symbol: s.currency_symbol, decimals: s.currency_decimals };
}

export interface InventorySettings {
  barcode_symbology: "ean13" | "code128";
  barcode_prefix: string;
  default_low_stock_threshold: number;
}

const INVENTORY_DEFAULTS: InventorySettings = {
  barcode_symbology: "ean13",
  barcode_prefix: "20",
  default_low_stock_threshold: 5,
};

/** Inventory-refactor settings (barcode config + low-stock default). */
export async function getInventorySettings(): Promise<InventorySettings> {
  const db = await getDb();
  const rows = await db.select<{ key: string; value: string | null }[]>(
    `SELECT key, value FROM settings
      WHERE key IN ('barcode_symbology', 'barcode_prefix', 'default_low_stock_threshold')`,
  );
  const map = new Map(rows.map((r) => [r.key, r.value ?? ""]));
  const sym = map.get("barcode_symbology");
  return {
    barcode_symbology: sym === "code128" ? "code128" : "ean13",
    barcode_prefix: map.get("barcode_prefix") || INVENTORY_DEFAULTS.barcode_prefix,
    default_low_stock_threshold:
      Number(map.get("default_low_stock_threshold")) ||
      INVENTORY_DEFAULTS.default_low_stock_threshold,
  };
}
