/**
 * High-level "save the whole product" operations for the dedicated product
 * page. Wraps product + variant creation and the initial-stock ledger entries
 * in a single transaction, so a half-created product can never be left behind.
 *
 * Variants keep the existing size x color model: a "simple" product is just one
 * variant with size_id/color_id = NULL.
 */
import { getDb, withTx } from "./db";
import { buildSku } from "./catalog";
import { applyMovement } from "./inventory";
import type { ProductInput } from "./catalog";

export interface VariantDraft {
  /** Present => an existing variant being edited (used by the update path). */
  variantId?: number;
  size_id: number | null;
  color_id: number | null;
  /** Optional SKU override; falls back to the canonical buildSku(). */
  sku?: string | null;
  barcode?: string | null;
  price_cents?: number | null; // null => inherit product
  cost_cents?: number | null;
  stock: number; // target on-hand (initial for create, target for update)
}

export interface ProductFormInput extends ProductInput {
  /** One entry per sellable unit. Always at least one (simple => null/null). */
  variants: VariantDraft[];
}

async function insertVariant(
  // db handle from withTx
  db: Awaited<ReturnType<typeof getDb>>,
  productId: number,
  v: VariantDraft,
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
      v.price_cents ?? null,
      v.cost_cents ?? null,
    ],
  );
  const variantId = res.lastInsertId as number;
  if (v.stock && v.stock !== 0) {
    await applyMovement(db, {
      variantId,
      delta: v.stock,
      reason: "receiving",
      note: "Initial stock",
    });
  }
}

/** Create a product, its variants, and the opening stock ledger entries. */
export async function createProductWithVariants(
  input: ProductFormInput,
): Promise<number> {
  return withTx(async (db) => {
    const res = await db.execute(
      `INSERT INTO products
         (name, category_id, supplier_id, brand, reference, description, notes,
          cost_cents, price_cents, low_stock_threshold, reorder_quantity, out_of_stock_alert)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        input.name,
        input.category_id,
        input.supplier_id ?? null,
        input.brand,
        input.reference ?? null,
        input.description,
        input.notes ?? null,
        input.cost_cents,
        input.price_cents,
        input.low_stock_threshold ?? null,
        input.reorder_quantity ?? null,
        input.out_of_stock_alert ?? 1,
      ],
    );
    const productId = res.lastInsertId as number;

    for (const v of input.variants) {
      await insertVariant(db, productId, v);
    }

    await db.execute(
      `INSERT INTO activity_log (entity_type, entity_id, action, detail)
       VALUES ('product', $1, 'created', $2)`,
      [productId, `Created with ${input.variants.length} variant(s)`],
    );
    return productId;
  });
}

/**
 * Update a product's scalar fields and reconcile its variants in one
 * transaction: edit existing rows (SKU / barcode / stock-to-target), add new
 * combinations, and archive any existing variant no longer present. Stock
 * changes are written to the ledger as 'stocktake' movements so history stays
 * accurate.
 */
export async function updateProductWithVariants(
  id: number,
  input: ProductFormInput,
): Promise<void> {
  await withTx(async (db) => {
    await db.execute(
      `UPDATE products
          SET name = $1, category_id = $2, supplier_id = $3, brand = $4,
              reference = $5, description = $6, notes = $7,
              cost_cents = $8, price_cents = $9,
              low_stock_threshold = $10, reorder_quantity = $11,
              out_of_stock_alert = $12,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $13`,
      [
        input.name,
        input.category_id,
        input.supplier_id ?? null,
        input.brand,
        input.reference ?? null,
        input.description,
        input.notes ?? null,
        input.cost_cents,
        input.price_cents,
        input.low_stock_threshold ?? null,
        input.reorder_quantity ?? null,
        input.out_of_stock_alert ?? 1,
        id,
      ],
    );

    const existing = await db.select<
      { id: number; sku: string; barcode: string | null; stock: number }[]
    >(
      "SELECT id, sku, barcode, stock FROM variants WHERE product_id = $1 AND archived = 0",
      [id],
    );
    const existingById = new Map(existing.map((v) => [v.id, v]));
    const handled = new Set<number>();

    for (const v of input.variants) {
      if (v.variantId != null && existingById.has(v.variantId)) {
        const orig = existingById.get(v.variantId)!;
        const fields: string[] = [];
        const args: unknown[] = [];
        let i = 1;
        if (v.sku && v.sku.trim() && v.sku.trim() !== orig.sku) {
          fields.push(`sku = $${i++}`);
          args.push(v.sku.trim());
        }
        const nextBarcode = v.barcode?.trim() || null;
        if (nextBarcode !== (orig.barcode ?? null)) {
          fields.push(`barcode = $${i++}`);
          args.push(nextBarcode);
        }
        if (fields.length) {
          args.push(v.variantId);
          await db.execute(
            `UPDATE variants SET ${fields.join(", ")} WHERE id = $${i}`,
            args,
          );
        }
        const delta = v.stock - orig.stock;
        if (delta !== 0) {
          await applyMovement(db, {
            variantId: v.variantId,
            delta,
            reason: "stocktake",
            note: "Edited on product page",
          });
        }
        handled.add(v.variantId);
      } else {
        const sku = v.sku?.trim() || buildSku(id, v.size_id, v.color_id);
        const dup = await db.select<{ n: number }[]>(
          "SELECT 1 AS n FROM variants WHERE sku = $1 LIMIT 1",
          [sku],
        );
        if (dup.length > 0) continue;
        await insertVariant(db, id, { ...v, sku });
      }
    }

    // Archive existing variants the user removed from the grid.
    for (const v of existing) {
      if (!handled.has(v.id)) {
        await db.execute("UPDATE variants SET archived = 1 WHERE id = $1", [
          v.id,
        ]);
      }
    }

    await db.execute(
      `INSERT INTO activity_log (entity_type, entity_id, action, detail)
       VALUES ('product', $1, 'updated', 'Edited on product page')`,
      [id],
    );
  });
}

/**
 * Append brand-new variant combinations to an existing product (skipping any
 * that already exist) and set their opening stock. Used by the editor's variant
 * grid when new size/color combos are added to a product that already exists.
 */
export async function addVariantsWithStock(
  productId: number,
  drafts: VariantDraft[],
): Promise<number> {
  return withTx(async (db) => {
    let created = 0;
    for (const v of drafts) {
      const sku = v.sku?.trim() || buildSku(productId, v.size_id, v.color_id);
      const exists = await db.select<{ n: number }[]>(
        "SELECT 1 AS n FROM variants WHERE sku = $1 LIMIT 1",
        [sku],
      );
      if (exists.length > 0) continue;
      await insertVariant(db, productId, { ...v, sku });
      created++;
    }
    return created;
  });
}
