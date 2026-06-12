/**
 * Bulk catalog operations: spreadsheet import plus multi-select actions
 * (category assignment, archive) for the inventory list. Prices arrive already
 * converted to minor units by the caller (which knows the shop currency).
 */
import { getDb } from "./db";
import { createProductWithVariants } from "./product-form";

/** Resolve a category by name, creating it if needed. */
export async function ensureCategory(name: string): Promise<number> {
  const db = await getDb();
  const trimmed = name.trim();
  await db.execute("INSERT OR IGNORE INTO categories (name) VALUES ($1)", [
    trimmed,
  ]);
  const [row] = await db.select<{ id: number }[]>(
    "SELECT id FROM categories WHERE name = $1",
    [trimmed],
  );
  return row.id;
}

/** Resolve a supplier by name, creating it if needed. */
export async function ensureSupplier(name: string): Promise<number> {
  const db = await getDb();
  const trimmed = name.trim();
  await db.execute("INSERT OR IGNORE INTO suppliers (name) VALUES ($1)", [
    trimmed,
  ]);
  const [row] = await db.select<{ id: number }[]>(
    "SELECT id FROM suppliers WHERE name = $1",
    [trimmed],
  );
  return row.id;
}

export interface BulkImportRow {
  name: string;
  category?: string | null;
  supplier?: string | null;
  reference?: string | null;
  barcode?: string | null;
  purchase_cents: number;
  selling_cents: number;
  stock: number;
  low_stock?: number | null;
}

export interface BulkImportResult {
  created: number;
  failed: number;
  errors: string[];
}

/**
 * Import products from parsed spreadsheet rows. Each row becomes a simple
 * product (one default variant) with opening stock. Categories and suppliers
 * are matched by name and created on demand. Rows are independent: one bad row
 * does not abort the rest.
 */
export async function bulkImportProducts(
  rows: BulkImportRow[],
): Promise<BulkImportResult> {
  const result: BulkImportResult = { created: 0, failed: 0, errors: [] };
  const catCache = new Map<string, number>();
  const supCache = new Map<string, number>();

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    try {
      if (!r.name?.trim()) throw new Error("missing name");
      let categoryId: number | null = null;
      if (r.category?.trim()) {
        const key = r.category.trim().toLowerCase();
        categoryId = catCache.get(key) ?? (await ensureCategory(r.category));
        catCache.set(key, categoryId);
      }
      let supplierId: number | null = null;
      if (r.supplier?.trim()) {
        const key = r.supplier.trim().toLowerCase();
        supplierId = supCache.get(key) ?? (await ensureSupplier(r.supplier));
        supCache.set(key, supplierId);
      }
      await createProductWithVariants({
        name: r.name.trim(),
        category_id: categoryId,
        supplier_id: supplierId,
        brand: null,
        reference: r.reference?.trim() || null,
        description: null,
        notes: null,
        cost_cents: r.purchase_cents,
        price_cents: r.selling_cents,
        low_stock_threshold: r.low_stock ?? null,
        reorder_quantity: null,
        out_of_stock_alert: 1,
        variants: [
          {
            size_id: null,
            color_id: null,
            sku: "",
            barcode: r.barcode?.trim() || null,
            stock: r.stock || 0,
          },
        ],
      });
      result.created++;
    } catch (e) {
      result.failed++;
      result.errors.push(`Row ${idx + 2}: ${String(e)}`);
    }
  }
  return result;
}

/** Reassign many products to a category in one statement. */
export async function bulkAssignCategory(
  productIds: number[],
  categoryId: number | null,
): Promise<void> {
  if (productIds.length === 0) return;
  const db = await getDb();
  const placeholders = productIds.map((_, i) => `$${i + 2}`).join(", ");
  await db.execute(
    `UPDATE products SET category_id = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders})`,
    [categoryId, ...productIds],
  );
}

/** Archive (soft-delete) many products and their variants. */
export async function bulkArchiveProducts(productIds: number[]): Promise<void> {
  if (productIds.length === 0) return;
  const db = await getDb();
  const placeholders = productIds.map((_, i) => `$${i + 1}`).join(", ");
  await db.execute(
    `UPDATE products SET archived = 1 WHERE id IN (${placeholders})`,
    productIds,
  );
  await db.execute(
    `UPDATE variants SET archived = 1 WHERE product_id IN (${placeholders})`,
    productIds,
  );
}
