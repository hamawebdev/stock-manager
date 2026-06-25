-- Studio billing & customer A/R (migration 7).
-- Brings the sell-side up to parity with the buy-side so the Studio documents
-- (Facture de Vente, Relevé de Compte) can render real data: sales gain TVA and
-- a paid/credit split, customers gain the fiscal/legal fields + an account
-- ledger (versements), and the shop gains the header/branding settings the
-- documents print. Everything is additive and nullable so the migration is safe
-- on an existing database. Money stays INTEGER minor units.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Extend sales with TVA + a paid/credit split + payment mode. Legacy rows were
-- cash-only and paid in full; the backfill below copies their existing totals
-- across so they keep rendering correctly. `total_ttc_cents` is the source of
-- truth for new sales; reste dû = total_ttc_cents - paid_cents.
-- ---------------------------------------------------------------------------

ALTER TABLE sales ADD COLUMN tva_enabled       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN tva_rate          INTEGER NOT NULL DEFAULT 0; -- whole percent
ALTER TABLE sales ADD COLUMN subtotal_ht_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN tva_cents         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN total_ttc_cents   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN paid_cents        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN payment_method    TEXT; -- 'especes'|'cheque'|'virement'|'cib'|'ccp'

-- Backfill legacy sales: no TVA, paid in full, totals copied from the old fields.
UPDATE sales
   SET subtotal_ht_cents = subtotal_cents,
       total_ttc_cents   = total_cents,
       paid_cents        = total_cents,
       payment_method    = COALESCE(payment_method, 'especes')
 WHERE total_ttc_cents = 0;

-- ---------------------------------------------------------------------------
-- Extend customers with the same contact + fiscal/legal fields suppliers have,
-- so the client info block on documents (NIF/NIS/RC/ART/RIB) has real data.
-- ---------------------------------------------------------------------------

ALTER TABLE customers ADD COLUMN address        TEXT;
ALTER TABLE customers ADD COLUMN phone_fixe     TEXT; -- landline
ALTER TABLE customers ADD COLUMN fax            TEXT;
ALTER TABLE customers ADD COLUMN activity       TEXT; -- business activity
ALTER TABLE customers ADD COLUMN nif            TEXT; -- N° d'Identification Fiscale
ALTER TABLE customers ADD COLUMN nis            TEXT; -- N° d'Identification Statistique
ALTER TABLE customers ADD COLUMN rc             TEXT; -- Registre du Commerce
ALTER TABLE customers ADD COLUMN art_imposition TEXT; -- Article d'imposition
ALTER TABLE customers ADD COLUMN rib            TEXT; -- bank account / RIB

-- ---------------------------------------------------------------------------
-- Customer payments (versements) — the money side of customer A/R, mirroring
-- supplier_payments. sale_id NULL means a global account payment (not tied to a
-- single invoice). amount_cents may be negative for a refund ("avoir"/"retour").
-- A cash payment also writes a pay_in cash_event; cash_event_id links the two so
-- deletion can reverse it.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customer_payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_id       INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  amount_cents  INTEGER NOT NULL,
  method        TEXT NOT NULL,                     -- 'especes'|'cheque'|'virement'|'cib'|'ccp'
  reference     TEXT,                              -- transaction reference
  note          TEXT,
  cash_event_id INTEGER REFERENCES cash_events(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_sale     ON customer_payments(sale_id);

-- ---------------------------------------------------------------------------
-- Shop branding / fiscal settings the documents print (header logo + company
-- contact + the shop's own legal identifiers), plus billing defaults. Stored in
-- the existing key/value settings table. INSERT OR IGNORE keeps any value the
-- owner has already set.
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('shop_address',      ''),
  ('shop_phone',        ''),
  ('shop_email',        ''),
  ('shop_logo',         ''),   -- relative path under <app-config>/shop-assets/
  ('shop_nif',          ''),
  ('shop_nis',          ''),
  ('shop_rc',           ''),
  ('shop_art',          ''),
  ('default_tva_rate',  '19'), -- whole percent, Algerian standard rate
  ('sale_code_prefix',  'FAC');
