-- Payment Management Center (migration 4).
-- Adds the data behind the unified POS screen: minimal customers, an
-- auto-applied promotions table, suspended/held carts, and a couple of new
-- columns. Money stays INTEGER minor units. Everything here is additive and
-- nullable, so the migration is safe on an existing database.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Customers: lightweight contact record. No loyalty / store credit in v1 —
-- this only lets a sale be attributed to a person for purchase history.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  note       TEXT,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customers_name  ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- Attribute a sale to a customer (optional). The cashier_name column lets the
-- insights strip show who opened the current register.
ALTER TABLE sales ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);

ALTER TABLE cash_sessions ADD COLUMN cashier_name TEXT;

-- ---------------------------------------------------------------------------
-- Promotions: rules applied automatically at checkout. This build evaluates
-- 'percent' and 'fixed' kinds; the 'bogo'/'bundle' kinds and their columns
-- (min_qty / get_qty / bundle_price_cents) are reserved so they can be added
-- later without another schema change. scope_type narrows what a promo hits.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS promotions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT NOT NULL,
  kind               TEXT NOT NULL DEFAULT 'percent', -- 'percent'|'fixed'|'bogo'|'bundle'
  percent            INTEGER,            -- 0-100 when kind='percent'
  amount_cents       INTEGER,            -- per-item discount when kind='fixed'
  scope_type         TEXT NOT NULL DEFAULT 'all', -- 'all'|'category'|'product'
  scope_id           INTEGER,            -- category_id or product_id when scoped
  min_qty            INTEGER NOT NULL DEFAULT 1,   -- line qty required to qualify
  get_qty            INTEGER,            -- reserved (BOGO)
  bundle_price_cents INTEGER,            -- reserved (bundle)
  priority           INTEGER NOT NULL DEFAULT 0,   -- higher wins per line
  active             INTEGER NOT NULL DEFAULT 1,
  starts_at          TEXT,               -- NULL => no start bound (ISO date)
  ends_at            TEXT,               -- NULL => no end bound (ISO date)
  archived           INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(active, archived);

-- ---------------------------------------------------------------------------
-- Held / suspended carts: persist a parked transaction so it survives an app
-- restart and can be resumed later. The cart is stored as a JSON snapshot.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS held_sales (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  label        TEXT NOT NULL,
  customer_id  INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  payload_json TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Settings: manager-PIN gate for sensitive actions. The PIN is stored as a
-- SHA-256 hash; it is a low-security drawer gate (single trusted register),
-- not real authentication.
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('manager_pin_hash', ''),
  ('require_manager_pin', '0');
