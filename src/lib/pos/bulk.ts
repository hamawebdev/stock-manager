/**
 * Bulk catalog operations: name-resolution helpers plus multi-select actions
 * (category assignment, archive) for the inventory list. The spreadsheet
 * import/export itself lives in `./catalog-io`.
 */
import { getDb } from "./db";

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

/** Resolve a size by name, creating it if needed. */
export async function ensureSize(name: string): Promise<number> {
  const db = await getDb();
  const trimmed = name.trim();
  await db.execute("INSERT OR IGNORE INTO sizes (name) VALUES ($1)", [trimmed]);
  const [row] = await db.select<{ id: number }[]>(
    "SELECT id FROM sizes WHERE name = $1",
    [trimmed],
  );
  return row.id;
}

/** Resolve a color by name, creating it if needed. */
export async function ensureColor(name: string): Promise<number> {
  const db = await getDb();
  const trimmed = name.trim();
  await db.execute("INSERT OR IGNORE INTO colors (name) VALUES ($1)", [trimmed]);
  const [row] = await db.select<{ id: number }[]>(
    "SELECT id FROM colors WHERE name = $1",
    [trimmed],
  );
  return row.id;
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
