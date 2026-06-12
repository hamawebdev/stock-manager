-- Inventory / product-management refactor (migration 3).
-- Adds suppliers, product media, an activity/history log, and richer product
-- attributes. Keeps the existing size x color variant model untouched, so the
-- POS / sales / returns / reporting code keeps working unchanged.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Suppliers: a product may be sourced from one supplier.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS suppliers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  notes        TEXT,
  archived     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Product media: the image bytes live on disk under the app-data dir; this
-- table only stores their relative path plus ordering / primary flag.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS product_images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  path       TEXT NOT NULL,              -- relative to <app-data>/product-images/
  is_primary INTEGER NOT NULL DEFAULT 0, -- 1 => main image
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);

-- ---------------------------------------------------------------------------
-- Activity / history log: a coarse audit trail for the product timeline. The
-- fine-grained stock history already lives in inventory_movements.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,   -- 'product' | 'variant' | 'supplier'
  entity_id   INTEGER NOT NULL,
  action      TEXT NOT NULL,   -- 'created' | 'updated' | 'archived' | 'duplicated' | 'price_changed' | 'stock_adjusted'
  detail      TEXT,            -- short human summary (optionally JSON)
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- New product attributes. SQLite requires one ADD COLUMN per statement; each
-- new column is nullable so the migration is safe on existing rows.
-- ---------------------------------------------------------------------------

ALTER TABLE products ADD COLUMN supplier_id         INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN reference           TEXT;     -- product reference / style code
ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER;  -- NULL => use global default
ALTER TABLE products ADD COLUMN reorder_quantity    INTEGER;  -- optional reorder target
ALTER TABLE products ADD COLUMN out_of_stock_alert  INTEGER NOT NULL DEFAULT 1; -- 1 => alert when stock hits 0
ALTER TABLE products ADD COLUMN notes               TEXT;     -- internal comments (distinct from description)

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_reference
  ON products(reference) WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);

-- ---------------------------------------------------------------------------
-- New settings (key/value): low-stock default + barcode generation config.
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('default_low_stock_threshold', '5'),
  ('barcode_symbology', 'ean13'),   -- 'ean13' | 'code128'
  ('barcode_prefix', '20');         -- GS1 in-store range (20-29) for EAN-13 generation
