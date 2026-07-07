-- Expenses Management (migration 8).
-- A self-contained operating-expense ledger: every non-inventory business cost
-- (rent, utilities, salaries, transport, taxes…) with its own categories,
-- configurable payment methods, file attachments (receipts/invoices) and
-- recurring templates. It is deliberately independent of the purchasing /
-- supplier-payment ledger and of the cash-session reconciliation, so nothing is
-- double-counted. Money stays INTEGER minor units; dates are ISO 'YYYY-MM-DD'.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Expense categories. `color` is an optional hex swatch used by the charts and
-- badges. Archiving hides a category from pickers without breaking historical
-- rows (expenses keep their category_id).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS expense_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  color       TEXT,                                -- '#RRGGBB' or NULL
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Payment methods available to expenses. Seeded with the Algerian commercial
-- vocabulary already used elsewhere, but fully user-manageable.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS expense_payment_methods (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Recurring templates. A template is a re-usable definition (e.g. "Monthly
-- rent") that can be posted into a real expense on demand; posting advances
-- next_due_date by the frequency. Deactivating keeps history but stops it
-- appearing in the "due" list.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS expense_recurring_templates (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  category_id       INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
  payment_method_id INTEGER REFERENCES expense_payment_methods(id) ON DELETE SET NULL,
  amount_cents      INTEGER NOT NULL DEFAULT 0,
  vendor            TEXT,
  note              TEXT,
  frequency         TEXT NOT NULL DEFAULT 'monthly', -- 'weekly'|'monthly'|'quarterly'|'yearly'
  next_due_date     TEXT,                            -- ISO 'YYYY-MM-DD'
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_exp_templates_active ON expense_recurring_templates(active);

-- ---------------------------------------------------------------------------
-- Expenses (the ledger). `code` is a sequential human reference 'E-000001'
-- assigned on insert. category/method are SET NULL on delete so removing a
-- category never destroys financial history. template_id records that a row was
-- posted from a recurring template.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS expenses (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT UNIQUE,
  category_id       INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
  payment_method_id INTEGER REFERENCES expense_payment_methods(id) ON DELETE SET NULL,
  template_id       INTEGER REFERENCES expense_recurring_templates(id) ON DELETE SET NULL,
  amount_cents      INTEGER NOT NULL DEFAULT 0,
  expense_date      TEXT NOT NULL,                   -- ISO 'YYYY-MM-DD'
  vendor            TEXT,                            -- payee / beneficiary
  reference         TEXT,                            -- invoice / receipt ref
  note              TEXT,
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_expenses_date     ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_method   ON expenses(payment_method_id);

-- ---------------------------------------------------------------------------
-- Attachments (receipts / scanned invoices). Bytes live on disk under the
-- app-config dir (see src/lib/expense-attachments.ts); only the relative path
-- is stored here, mirroring product_images.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS expense_attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id  INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,                         -- relative to expense-attachments/
  file_name   TEXT NOT NULL,                         -- original display name
  mime        TEXT,
  size_bytes  INTEGER,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_expense_attachments_expense ON expense_attachments(expense_id);

-- ---------------------------------------------------------------------------
-- Seed default categories and payment methods so the module is usable on first
-- open. Guarded by NOT EXISTS so re-running (or seeding a populated DB) is safe.
-- ---------------------------------------------------------------------------

INSERT INTO expense_categories (name, color, sort_order)
SELECT v.name, v.color, v.ord FROM (
  SELECT 'Rent'          AS name, '#6366f1' AS color, 1 AS ord UNION ALL
  SELECT 'Utilities',          '#0ea5e9', 2 UNION ALL
  SELECT 'Salaries',           '#22c55e', 3 UNION ALL
  SELECT 'Supplies',           '#f59e0b', 4 UNION ALL
  SELECT 'Transport',          '#ef4444', 5 UNION ALL
  SELECT 'Maintenance',        '#8b5cf6', 6 UNION ALL
  SELECT 'Marketing',          '#ec4899', 7 UNION ALL
  SELECT 'Taxes & Fees',       '#14b8a6', 8 UNION ALL
  SELECT 'Miscellaneous',      '#64748b', 9
) v
WHERE NOT EXISTS (SELECT 1 FROM expense_categories);

INSERT INTO expense_payment_methods (name, sort_order)
SELECT v.name, v.ord FROM (
  SELECT 'Espèce'   AS name, 1 AS ord UNION ALL
  SELECT 'Chèque',        2 UNION ALL
  SELECT 'Virement',      3 UNION ALL
  SELECT 'CIB',           4 UNION ALL
  SELECT 'CCP',           5
) v
WHERE NOT EXISTS (SELECT 1 FROM expense_payment_methods);
