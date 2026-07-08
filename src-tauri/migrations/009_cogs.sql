-- Cost of Goods Sold snapshot (migration 9).
-- Sales did not record the cost of each line at sale time; only a live
-- weighted-average cost lives on the variant, which drifts as purchases roll
-- it forward. To let analytics compute a stable Net Profit (revenue - COGS,
-- restock-aware for returns), snapshot the effective per-unit cost onto each
-- sale line when the sale is completed. Additive and defaulted so the migration
-- is safe on existing data. Money stays INTEGER minor units (HT, tax excluded).

PRAGMA foreign_keys = ON;

ALTER TABLE sale_items ADD COLUMN cost_cents INTEGER NOT NULL DEFAULT 0;

-- Backfill existing lines with the variant's current effective cost (variant
-- override, else product default). Best available basis for historical sales;
-- new sales snapshot their real at-sale cost going forward.
UPDATE sale_items
   SET cost_cents = COALESCE(
     (SELECT COALESCE(v.cost_cents, p.cost_cents, 0)
        FROM variants v
        JOIN products p ON p.id = v.product_id
       WHERE v.id = sale_items.variant_id),
     0
   )
 WHERE cost_cents = 0;
