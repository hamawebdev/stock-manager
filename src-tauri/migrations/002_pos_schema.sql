-- POS schema for a single-store, cash-only clothing shop.
-- Money is stored as INTEGER minor units (cents/centimes). No tax in v1.
-- See `migrations()` in src/lib.rs for conventions.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Lookups
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sizes are ordered (XS < S < M ...) via sort_order for matrix display.
CREATE TABLE IF NOT EXISTS sizes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS colors (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  hex  TEXT  -- optional swatch, e.g. '#000000'
);

-- ---------------------------------------------------------------------------
-- Catalog: a Product (style) fans out into Variants (size x color)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  brand        TEXT,
  description  TEXT,
  -- Defaults inherited by new variants (minor units). Per-variant overrides win.
  cost_cents   INTEGER NOT NULL DEFAULT 0,
  price_cents  INTEGER NOT NULL DEFAULT 0,
  archived     INTEGER NOT NULL DEFAULT 0,  -- soft-delete; keep history intact
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_products_name     ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

-- The sellable / stockable unit. One row per product x size x color.
CREATE TABLE IF NOT EXISTS variants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size_id     INTEGER REFERENCES sizes(id)  ON DELETE RESTRICT,
  color_id    INTEGER REFERENCES colors(id) ON DELETE RESTRICT,
  sku         TEXT NOT NULL UNIQUE,
  barcode     TEXT UNIQUE,             -- scanned at checkout; may equal sku
  price_cents INTEGER,                 -- NULL => inherit products.price_cents
  cost_cents  INTEGER,                 -- NULL => inherit products.cost_cents
  stock       INTEGER NOT NULL DEFAULT 0,  -- materialized from movements ledger
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (product_id, size_id, color_id)
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_barcode ON variants(barcode);

-- ---------------------------------------------------------------------------
-- Inventory ledger: append-only, signed deltas. Source of stock truth.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inventory_movements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  delta      INTEGER NOT NULL,   -- +receiving/return, -sale, +/- adjustment
  reason     TEXT NOT NULL,      -- 'sale' | 'return' | 'receiving' | 'adjustment' | 'stocktake'
  ref_type   TEXT,               -- 'sale' | 'return' | NULL
  ref_id     INTEGER,            -- id in the referenced table
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_movements_variant ON inventory_movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_movements_ref     ON inventory_movements(ref_type, ref_id);

-- ---------------------------------------------------------------------------
-- Sales (cash only, no tax). Discounts are manual, per-line and per-cart.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sales (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  code                TEXT NOT NULL UNIQUE,        -- human receipt no., e.g. 'S-000123'
  subtotal_cents      INTEGER NOT NULL,            -- sum of line_total before cart discount
  cart_discount_cents INTEGER NOT NULL DEFAULT 0,  -- whole-cart discount amount
  total_cents         INTEGER NOT NULL,            -- amount owed
  cash_tendered_cents INTEGER NOT NULL DEFAULT 0,
  change_cents        INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'completed', -- 'completed' | 'voided'
  note                TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);

CREATE TABLE IF NOT EXISTS sale_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id             INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  variant_id          INTEGER NOT NULL REFERENCES variants(id) ON DELETE RESTRICT,
  -- denormalized for an immutable receipt even if the catalog changes later
  description         TEXT NOT NULL,
  qty                 INTEGER NOT NULL,
  unit_price_cents    INTEGER NOT NULL,
  line_discount_cents INTEGER NOT NULL DEFAULT 0,
  line_total_cents    INTEGER NOT NULL,  -- qty*unit_price - line_discount
  qty_returned        INTEGER NOT NULL DEFAULT 0  -- tracks partial returns
);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale    ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_variant ON sale_items(variant_id);

-- ---------------------------------------------------------------------------
-- Returns & exchanges. A return brings items back in (restock optional) and,
-- for an exchange, sends replacement items out. net_cash_cents settles up:
--   > 0  shop pays customer (refund)   < 0  customer pays shop (upcharge)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS returns (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT NOT NULL UNIQUE,          -- e.g. 'R-000045'
  original_sale_id  INTEGER REFERENCES sales(id) ON DELETE SET NULL,  -- NULL = no receipt
  kind              TEXT NOT NULL DEFAULT 'refund', -- 'refund' | 'exchange'
  return_value_cents   INTEGER NOT NULL DEFAULT 0,  -- value of goods coming back
  exchange_value_cents INTEGER NOT NULL DEFAULT 0,  -- value of replacement goods
  net_cash_cents       INTEGER NOT NULL DEFAULT 0,  -- +paid to customer / -collected
  note              TEXT,
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_returns_sale ON returns(original_sale_id);

-- Items coming back into the shop.
CREATE TABLE IF NOT EXISTS return_in_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id        INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  variant_id       INTEGER NOT NULL REFERENCES variants(id) ON DELETE RESTRICT,
  sale_item_id     INTEGER REFERENCES sale_items(id) ON DELETE SET NULL,
  description      TEXT NOT NULL,
  qty              INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  restock          INTEGER NOT NULL DEFAULT 1  -- 0 = damaged-out, don't restock
);
CREATE INDEX IF NOT EXISTS idx_return_in_return ON return_in_items(return_id);

-- Replacement items going out in an exchange.
CREATE TABLE IF NOT EXISTS return_out_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id        INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  variant_id       INTEGER NOT NULL REFERENCES variants(id) ON DELETE RESTRICT,
  description      TEXT NOT NULL,
  qty              INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  line_total_cents INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_return_out_return ON return_out_items(return_id);

-- ---------------------------------------------------------------------------
-- Cash management: end-of-day reconciliation + drawer events (pay in/out).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cash_sessions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  opened_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at           TEXT,
  opening_float_cents INTEGER NOT NULL DEFAULT 0,
  expected_cents      INTEGER,  -- computed at close: float + cash sales +/- events - refunds
  counted_cents       INTEGER,  -- physically counted at close
  variance_cents      INTEGER,  -- counted - expected
  note                TEXT
);

CREATE TABLE IF NOT EXISTS cash_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER REFERENCES cash_sessions(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL,   -- 'pay_in' | 'pay_out' | 'no_sale'
  amount_cents INTEGER NOT NULL DEFAULT 0,
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Settings: key/value store for shop profile, currency, receipt text, etc.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ---------------------------------------------------------------------------
-- Seed data: common clothing sizes and colors (idempotent).
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO sizes (name, sort_order) VALUES
  ('XS', 1), ('S', 2), ('M', 3), ('L', 4), ('XL', 5), ('XXL', 6), ('XXXL', 7);

INSERT OR IGNORE INTO colors (name, hex) VALUES
  ('Black',  '#000000'),
  ('White',  '#FFFFFF'),
  ('Grey',   '#808080'),
  ('Navy',   '#1F2A44'),
  ('Blue',   '#2563EB'),
  ('Red',    '#DC2626'),
  ('Green',  '#16A34A'),
  ('Beige',  '#D9C8A9'),
  ('Brown',  '#7C4A2D'),
  ('Pink',   '#EC4899');

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('shop_name', 'My Shop'),
  ('currency_symbol', ''),       -- e.g. 'DA', '€', '$' — confirm with owner
  ('currency_decimals', '2'),
  ('receipt_header', ''),
  ('receipt_footer', 'Thank you!');
