/**
 * Product catalog import / export (the Inventory "Import & Export" feature).
 *
 * The on-disk shape is one spreadsheet row per *variant*, with the owning
 * product's fields repeated on each of its rows. Export writes exactly the
 * columns import reads, so an exported file can be edited and re-imported
 * (round-trip) for backup, migration, and bulk create-or-update.
 *
 * Import is an UPSERT keyed on the product `reference` (unique), falling back to
 * a variant `barcode` when a row has no reference. Categories, suppliers, sizes
 * and colors are matched by name and created on demand. Product groups are
 * independent: one bad product does not abort the rest.
 *
 * Prices arrive already converted to minor units by the caller (the page, which
 * knows the shop currency). `*_cents = null` means "column left blank" — on
 * update those fields are left untouched rather than cleared.
 */
import { getDb, withTx, type Db } from "./db";
import { buildSku } from "./catalog";
import { applyMovement } from "./inventory";
import { createProductWithVariants, type VariantDraft } from "./product-form";
import { ensureCategory, ensureColor, ensureSize, ensureSupplier } from "./bulk";
import type { ExportColumn } from "@/lib/export";

// --- Export ----------------------------------------------------------------

/** One exported variant row, joined with its product + lookup names. */
export interface CatalogExportRow {
  name: string;
  category: string | null;
  supplier: string | null;
  brand: string | null;
  reference: string | null;
  description: string | null;
  notes: string | null;
  cost_cents: number;
  price_cents: number;
  low_stock_threshold: number | null;
  reorder_quantity: number | null;
  out_of_stock_alert: number;
  size: string | null;
  color: string | null;
  sku: string | null;
  barcode: string | null;
  stock: number | null;
  variant_cost_cents: number | null;
  variant_price_cents: number | null;
}

/**
 * All active products as one row per active variant, for the Excel export.
 * Products with no active variants still emit a single (variant-less) row so a
 * backup never silently drops them.
 */
export async function listCatalogForExport(): Promise<CatalogExportRow[]> {
  const db = await getDb();
  return db.select<CatalogExportRow[]>(
    `SELECT p.name, c.name AS category, sup.name AS supplier, p.brand,
            p.reference, p.description, p.notes, p.cost_cents, p.price_cents,
            p.low_stock_threshold, p.reorder_quantity, p.out_of_stock_alert,
            s.name AS size, col.name AS color, v.sku, v.barcode, v.stock,
            v.cost_cents AS variant_cost_cents, v.price_cents AS variant_price_cents
       FROM products p
       LEFT JOIN categories c   ON c.id = p.category_id
       LEFT JOIN suppliers  sup ON sup.id = p.supplier_id
       LEFT JOIN variants   v   ON v.product_id = p.id AND v.archived = 0
       LEFT JOIN sizes      s   ON s.id = v.size_id
       LEFT JOIN colors     col ON col.id = v.color_id
      WHERE p.archived = 0
      ORDER BY p.name, s.sort_order, col.name`,
  );
}

/**
 * The Excel column layout, shared by export and the import template so a file
 * exported here can be edited and re-imported. Money columns are written as
 * plain decimals (not minor units) using the shop's `decimals`; blank cells
 * mean "inherit / unset". Header names must stay in sync with the import
 * parser's field lookups in `bulk-import.tsx`.
 */
export function catalogExportColumns(
  decimals: number,
): ExportColumn<CatalogExportRow>[] {
  const dec = (cents: number | null): number | string =>
    cents == null ? "" : cents / 10 ** decimals;
  const num = (n: number | null): number | string => (n == null ? "" : n);
  return [
    { header: "name", value: (r) => r.name },
    { header: "category", value: (r) => r.category ?? "" },
    { header: "supplier", value: (r) => r.supplier ?? "" },
    { header: "brand", value: (r) => r.brand ?? "" },
    { header: "reference", value: (r) => r.reference ?? "" },
    { header: "description", value: (r) => r.description ?? "" },
    { header: "notes", value: (r) => r.notes ?? "" },
    { header: "purchase_price", value: (r) => dec(r.cost_cents) },
    { header: "selling_price", value: (r) => dec(r.price_cents) },
    { header: "low_stock", value: (r) => num(r.low_stock_threshold) },
    { header: "reorder_qty", value: (r) => num(r.reorder_quantity) },
    { header: "out_of_stock_alert", value: (r) => r.out_of_stock_alert },
    { header: "size", value: (r) => r.size ?? "" },
    { header: "color", value: (r) => r.color ?? "" },
    { header: "sku", value: (r) => r.sku ?? "" },
    { header: "barcode", value: (r) => r.barcode ?? "" },
    { header: "stock", value: (r) => num(r.stock) },
    { header: "variant_purchase_price", value: (r) => dec(r.variant_cost_cents) },
    { header: "variant_selling_price", value: (r) => dec(r.variant_price_cents) },
  ];
}

// --- Import ----------------------------------------------------------------

/**
 * How the on-hand stock of an *existing* variant is reconciled with the sheet's
 * stock value. New products/variants always take the sheet value as opening
 * stock regardless of policy.
 */
export type StockPolicy =
  /** Leave existing stock untouched; only new variants get the sheet value. */
  | "create_only"
  /** Set stock to the sheet value (records a 'stocktake' adjustment). */
  | "overwrite"
  /** Add the sheet value to current stock (records a 'receiving' movement). */
  | "add";

/**
 * One parsed variant row. Product-level fields are repeated on every row of the
 * same product; `null` (as opposed to `0`) means the column was blank.
 */
export interface CatalogImportRow {
  // product-level
  name: string;
  category: string | null;
  supplier: string | null;
  brand: string | null;
  reference: string | null;
  description: string | null;
  notes: string | null;
  cost_cents: number | null;
  price_cents: number | null;
  low_stock: number | null;
  reorder_qty: number | null;
  out_of_stock_alert: number | null;
  // variant-level
  size: string | null;
  color: string | null;
  sku: string | null;
  barcode: string | null;
  stock: number;
  variant_cost_cents: number | null;
  variant_price_cents: number | null;
}

export interface CatalogImportResult {
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
  failed: number; // product groups that errored
  errors: string[];
}

/** A product plus its variant rows, after grouping the flat sheet. */
interface ProductGroup {
  key: string;
  head: CatalogImportRow; // canonical product-level fields (first row seen)
  rows: CatalogImportRow[];
}

/** Group flat variant rows into products: by reference, else by product name. */
function groupByProduct(rows: CatalogImportRow[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();
  for (const r of rows) {
    const key = r.reference
      ? `ref:${r.reference.toLowerCase()}`
      : `name:${r.name.trim().toLowerCase()}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, head: r, rows: [] };
      groups.set(key, g);
    }
    g.rows.push(r);
  }
  return [...groups.values()];
}

/** Resolve an existing product id by reference, then by any variant barcode. */
async function findExistingProduct(g: ProductGroup): Promise<number | null> {
  const db = await getDb();
  if (g.head.reference) {
    const [row] = await db.select<{ id: number }[]>(
      "SELECT id FROM products WHERE reference = $1 AND archived = 0 LIMIT 1",
      [g.head.reference],
    );
    if (row) return row.id;
  }
  for (const r of g.rows) {
    if (!r.barcode) continue;
    const [row] = await db.select<{ product_id: number }[]>(
      "SELECT product_id FROM variants WHERE barcode = $1 AND archived = 0 LIMIT 1",
      [r.barcode],
    );
    if (row) return row.product_id;
  }
  return null;
}

/** A variant row with its size/color already resolved to ids. */
interface ResolvedVariant extends CatalogImportRow {
  size_id: number | null;
  color_id: number | null;
}

function toDraft(v: ResolvedVariant): VariantDraft {
  return {
    size_id: v.size_id,
    color_id: v.color_id,
    sku: v.sku ?? null,
    barcode: v.barcode ?? null,
    price_cents: v.variant_price_cents,
    cost_cents: v.variant_cost_cents,
    stock: v.stock,
  };
}

interface ExistingVariant {
  id: number;
  size_id: number | null;
  color_id: number | null;
  sku: string;
  barcode: string | null;
  stock: number;
}

/** Insert one variant on an existing product (opening stock via 'receiving'). */
async function insertVariantTx(
  db: Db,
  productId: number,
  v: ResolvedVariant,
): Promise<void> {
  const sku = v.sku?.trim() || buildSku(productId, v.size_id, v.color_id);
  const res = await db.execute(
    `INSERT INTO variants
       (product_id, size_id, color_id, sku, barcode, price_cents, cost_cents, stock)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`,
    [
      productId,
      v.size_id,
      v.color_id,
      sku,
      v.barcode?.trim() || sku,
      v.variant_price_cents,
      v.variant_cost_cents,
    ],
  );
  const variantId = res.lastInsertId as number;
  if (v.stock) {
    await applyMovement(db, {
      variantId,
      delta: v.stock,
      reason: "receiving",
      note: "Imported",
    });
  }
}

/** Reconcile one matched variant's fields + stock against a sheet row. */
async function updateVariantTx(
  db: Db,
  orig: ExistingVariant,
  v: ResolvedVariant,
  policy: StockPolicy,
): Promise<void> {
  const sets: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  const nextSku = v.sku?.trim();
  if (nextSku && nextSku !== orig.sku) {
    sets.push(`sku = $${i++}`);
    args.push(nextSku);
  }
  const nextBarcode = v.barcode?.trim() || null;
  if (nextBarcode !== (orig.barcode ?? null)) {
    sets.push(`barcode = $${i++}`);
    args.push(nextBarcode);
  }
  if (v.variant_price_cents != null) {
    sets.push(`price_cents = $${i++}`);
    args.push(v.variant_price_cents);
  }
  if (v.variant_cost_cents != null) {
    sets.push(`cost_cents = $${i++}`);
    args.push(v.variant_cost_cents);
  }
  if (sets.length) {
    args.push(orig.id);
    await db.execute(`UPDATE variants SET ${sets.join(", ")} WHERE id = $${i}`, args);
  }

  if (policy === "create_only") return;
  const delta = policy === "overwrite" ? v.stock - orig.stock : v.stock;
  if (delta !== 0) {
    await applyMovement(db, {
      variantId: orig.id,
      delta,
      reason: policy === "overwrite" ? "stocktake" : "receiving",
      note: "Imported",
    });
  }
}

/** Update an existing product's scalar fields and upsert each of its variants. */
async function updateExistingProduct(
  productId: number,
  g: ProductGroup,
  categoryId: number | null,
  supplierId: number | null,
  variants: ResolvedVariant[],
  policy: StockPolicy,
): Promise<{ created: number; updated: number }> {
  return withTx(async (db) => {
    const h = g.head;
    const sets: string[] = [];
    const args: unknown[] = [];
    let i = 1;
    const set = (col: string, val: unknown) => {
      sets.push(`${col} = $${i++}`);
      args.push(val);
    };
    if (h.name.trim()) set("name", h.name.trim());
    if (h.category != null) set("category_id", categoryId);
    if (h.supplier != null) set("supplier_id", supplierId);
    if (h.brand != null) set("brand", h.brand || null);
    if (h.description != null) set("description", h.description || null);
    if (h.notes != null) set("notes", h.notes || null);
    if (h.cost_cents != null) set("cost_cents", h.cost_cents);
    if (h.price_cents != null) set("price_cents", h.price_cents);
    if (h.low_stock != null) set("low_stock_threshold", h.low_stock);
    if (h.reorder_qty != null) set("reorder_quantity", h.reorder_qty);
    if (h.out_of_stock_alert != null) set("out_of_stock_alert", h.out_of_stock_alert);
    sets.push("updated_at = CURRENT_TIMESTAMP");
    args.push(productId);
    await db.execute(`UPDATE products SET ${sets.join(", ")} WHERE id = $${i}`, args);

    const existing = await db.select<ExistingVariant[]>(
      `SELECT id, size_id, color_id, sku, barcode, stock
         FROM variants WHERE product_id = $1 AND archived = 0`,
      [productId],
    );

    let created = 0;
    let updated = 0;
    for (const v of variants) {
      const match =
        (v.sku ? existing.find((e) => e.sku === v.sku!.trim()) : undefined) ??
        existing.find((e) => e.size_id === v.size_id && e.color_id === v.color_id);
      if (match) {
        await updateVariantTx(db, match, v, policy);
        updated++;
      } else {
        await insertVariantTx(db, productId, v);
        created++;
      }
    }

    await db.execute(
      `INSERT INTO activity_log (entity_type, entity_id, action, detail)
       VALUES ('product', $1, 'updated', 'Imported')`,
      [productId],
    );
    return { created, updated };
  });
}

/**
 * Upsert products from parsed variant rows. Match key is the product reference
 * (barcode fallback); matched products are updated in place, new ones created.
 * Each product group runs in its own transaction so one failure is isolated.
 */
export async function importCatalog(
  rows: CatalogImportRow[],
  policy: StockPolicy,
): Promise<CatalogImportResult> {
  const result: CatalogImportResult = {
    productsCreated: 0,
    productsUpdated: 0,
    variantsCreated: 0,
    variantsUpdated: 0,
    failed: 0,
    errors: [],
  };
  const catCache = new Map<string, number>();
  const supCache = new Map<string, number>();
  const sizeCache = new Map<string, number>();
  const colorCache = new Map<string, number>();

  const cached = async (
    cache: Map<string, number>,
    name: string,
    resolve: (n: string) => Promise<number>,
  ): Promise<number> => {
    const key = name.trim().toLowerCase();
    const hit = cache.get(key);
    if (hit != null) return hit;
    const id = await resolve(name);
    cache.set(key, id);
    return id;
  };

  for (const g of groupByProduct(rows)) {
    try {
      if (!g.head.name.trim()) throw new Error("missing name");

      const categoryId = g.head.category?.trim()
        ? await cached(catCache, g.head.category, ensureCategory)
        : null;
      const supplierId = g.head.supplier?.trim()
        ? await cached(supCache, g.head.supplier, ensureSupplier)
        : null;

      const variants: ResolvedVariant[] = [];
      for (const r of g.rows) {
        variants.push({
          ...r,
          size_id: r.size?.trim()
            ? await cached(sizeCache, r.size, ensureSize)
            : null,
          color_id: r.color?.trim()
            ? await cached(colorCache, r.color, ensureColor)
            : null,
        });
      }

      const existingId = await findExistingProduct(g);
      if (existingId == null) {
        await createProductWithVariants({
          name: g.head.name.trim(),
          category_id: categoryId,
          supplier_id: supplierId,
          brand: g.head.brand || null,
          reference: g.head.reference || null,
          description: g.head.description || null,
          notes: g.head.notes || null,
          cost_cents: g.head.cost_cents ?? 0,
          price_cents: g.head.price_cents ?? 0,
          low_stock_threshold: g.head.low_stock,
          reorder_quantity: g.head.reorder_qty,
          out_of_stock_alert: g.head.out_of_stock_alert ?? 1,
          variants: variants.map(toDraft),
        });
        result.productsCreated++;
        result.variantsCreated += variants.length;
      } else {
        const counts = await updateExistingProduct(
          existingId,
          g,
          categoryId,
          supplierId,
          variants,
          policy,
        );
        result.productsUpdated++;
        result.variantsCreated += counts.created;
        result.variantsUpdated += counts.updated;
      }
    } catch (e) {
      result.failed++;
      result.errors.push(`${g.head.name || g.key}: ${String(e)}`);
    }
  }
  return result;
}
