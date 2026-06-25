# Seed data

Comprehensive, interconnected demo data for the Stock Manager POS — an Algerian
single-store clothing shop (dinar / TVA 19% / French commercial documents).

## Files

- `generate-seed.mjs` — deterministic generator (fixed PRNG seed; regenerating
  is byte-stable). Simulates ~6 months of trading (1 Jan – 21 Jun 2026).
- `seed.sql` — the generated, idempotent SQL the generator emits. **This is the
  file you run.**

## What it contains

| Entity | Count | Notes |
|---|---|---|
| Categories | 8 | Hommes, Femmes, Enfants, Chaussures, Accessoires, Sport, Sous-vêtements, Vestes & Manteaux |
| Suppliers | 10 | Full fiscal/legal fields (NIF/NIS/RC/ART/RIB); 1 archived |
| Customers | 30 | 6 B2B (fiscal fields, TVA invoices), 24 individuals; some archived |
| Products | 50 | Brands, references, low-stock thresholds; 1 archived |
| Variants | ~540 | size × color (apparel XS–XXXL, numeric shoe sizes, one-size accessories) |
| Purchases (achats) | 15 | Opening-stock + restocks (confirmed), 1 draft, 1 cancelled; TVA on/off |
| Sales (factures) | ~290 | Retail + B2B TVA invoices, credit sales, discounts, a few voided |
| Returns | ~19 | Refund-only; mostly restocked, a few damaged-out (no restock) |
| Cash sessions | 25 | Weekly reconciliations, all closed; most balanced, a few with variance |
| Customer / supplier versements | — | At-sale + later paydowns; cash ones linked to drawer events |
| Promotions | 5 | Active / scheduled / expired-archived |
| Held carts, activity log, manual adjustments | — | |

The dataset deliberately exercises edge states: outstanding supplier balances and
customer A/R, out-of-stock and low-stock variants, voided sales, partial/credit
payments, damaged returns, draft & cancelled purchases, and cash variances.

## Internal consistency

`seed.sql` mirrors the app's data-layer write conventions exactly, so it is
self-consistent and the app reads it without surprises:

- `variants.stock` always equals `SUM(inventory_movements.delta)` for the variant.
- Completed sale line → `-qty` `sale` movement; voided sales write none.
- Confirmed purchase line → `+qty` `receiving` movement (drafts/cancelled none).
- Refund return: restocked items → `+qty` `return` movement; damaged-out → none.
- Retail prices are TTC; HT/TVA are back-derived (`computeSaleTotals`).
- Purchase costs are HT; TVA added on top (`computePurchaseTotals`).
- Cash session `expected = float + especes-sale paid + pay_in − pay_out − return net`.
- Sale codes `FAC-2026-NNNN`, purchases `A-NNNNNN`, returns `R-NNNNNN`.

These invariants are asserted during development against a freshly-migrated DB.

## Running it

The DB is the app's Tauri SQLite file. For the `com.hamawebdev.stockmanager`
build on Linux it lives at:

```
~/.config/com.hamawebdev.stockmanager/app.db
```

Apply the seed (close the app first):

```bash
sqlite3 ~/.config/com.hamawebdev.stockmanager/app.db < seeds/seed.sql
```

To regenerate `seed.sql` (e.g. after changing volumes/templates):

```bash
node seeds/generate-seed.mjs
```

## ⚠️ Important notes

- **Destructive to demo tables.** `seed.sql` runs inside a transaction that first
  `DELETE`s every business table (products, variants, sales, purchases, cash,
  customers, suppliers, …) and resets their autoincrement counters, then
  re-inserts. It is **idempotent** (re-runnable) but will wipe any existing rows
  in those tables. The migration-seeded `sizes`, `colors` and `settings` are
  preserved (settings values are upserted to the demo shop profile). Back up
  `app.db` first if it holds data you care about.
- **Returns are refund-only.** The current app removed exchanges
  (`returns.ts` only produces `kind='refund'`), so the seed generates refunds
  only. The legacy `return_out_items` table is left empty. Tell me if you want
  exchange rows seeded against the legacy schema.
- **No product images.** `product_images` rows point at binary files on disk
  that a SQL seed can't create, so the table is intentionally left empty.
- **Weighted-average cost is approximate.** Variant cost is set to the latest
  purchase cost rather than a full running weighted average; the inventory
  ledger (the source of truth for stock) is exact.
