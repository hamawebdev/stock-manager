-- Purchasing & Supplier Management (migration 6).
-- Adds the buy-side counterpart to sales: purchases (achats) with line items,
-- a supplier payment ledger (versements), and the fiscal/legal fields a
-- supplier record needs. Everything is additive and nullable so the migration
-- is safe on an existing database. Money stays INTEGER minor units.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Extend suppliers with the contact + fiscal/legal fields from the supplier
-- form (activity, fixed line, fax, NIF/NIS/RC, tax article, bank RIB). SQLite
-- requires one ADD COLUMN per statement; each is nullable.
-- ---------------------------------------------------------------------------

ALTER TABLE suppliers ADD COLUMN activity       TEXT; -- business activity
ALTER TABLE suppliers ADD COLUMN phone_fixe     TEXT; -- landline
ALTER TABLE suppliers ADD COLUMN fax            TEXT;
ALTER TABLE suppliers ADD COLUMN nif            TEXT; -- N° d'Identification Fiscale
ALTER TABLE suppliers ADD COLUMN nis            TEXT; -- N° d'Identification Statistique
ALTER TABLE suppliers ADD COLUMN rc             TEXT; -- Registre du Commerce
ALTER TABLE suppliers ADD COLUMN art_imposition TEXT; -- Article d'imposition
ALTER TABLE suppliers ADD COLUMN rib            TEXT; -- bank account / RIB

-- ---------------------------------------------------------------------------
-- Purchases (achat header). A purchase starts as a 'draft' (editable, no side
-- effects) and only on 'confirmed' does it receive stock + update cost and the
-- supplier balance. TVA is per-purchase (rate stored as whole percent).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS purchases (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  code               TEXT UNIQUE,                 -- 'A-000001', assigned on confirm
  supplier_id        INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'draft', -- 'draft'|'confirmed'|'cancelled'
  purchase_date      TEXT,                        -- user-set date (ISO yyyy-mm-dd)
  invoice_ref        TEXT,                        -- supplier invoice ref / note
  note               TEXT,
  tva_enabled        INTEGER NOT NULL DEFAULT 0,
  tva_rate           INTEGER NOT NULL DEFAULT 19, -- whole percent
  subtotal_ht_cents  INTEGER NOT NULL DEFAULT 0,
  tva_cents          INTEGER NOT NULL DEFAULT 0,
  total_ttc_cents    INTEGER NOT NULL DEFAULT 0,
  paid_cents         INTEGER NOT NULL DEFAULT 0,  -- denormalised sum of allocations
  payment_terms      TEXT,                        -- 'credit'|'partial'|'cash' (UI hint)
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status   ON purchases(status);

-- ---------------------------------------------------------------------------
-- Purchase line items. variant_id is NULL for a free line ("Ligne libre",
-- e.g. a service or an item not in the catalog). qty is REAL so weight/volume
-- units (Kg, L) can be received with decimals.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS purchase_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id         INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  variant_id          INTEGER REFERENCES variants(id) ON DELETE SET NULL,
  description         TEXT NOT NULL,
  qty                 REAL NOT NULL,
  unit                TEXT,                        -- display label: 'u'|'Kg'|'L'...
  unit_cost_ht_cents  INTEGER NOT NULL,
  line_total_ht_cents INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);

-- ---------------------------------------------------------------------------
-- Supplier payments (versements). purchase_id NULL means a global account
-- payment (not tied to a single achat). amount_cents may be negative for a
-- refund/return ("remboursement"/"retour"). A cash payment also writes a
-- pay_out cash_event; cash_event_id links the two so deletion can reverse it.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS supplier_payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id   INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  purchase_id   INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
  amount_cents  INTEGER NOT NULL,
  method        TEXT NOT NULL,                     -- 'cash'|'cheque'|'transfer'|'card_other'
  reference     TEXT,                              -- transaction reference
  note          TEXT,
  cash_event_id INTEGER REFERENCES cash_events(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_purchase ON supplier_payments(purchase_id);
