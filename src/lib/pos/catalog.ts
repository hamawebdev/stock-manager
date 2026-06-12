/**
 * Catalog data access: categories, sizes, colors, products, and the
 * size x color variant matrix. Variants are the sellable/stockable unit.
 */
import { getDb, withTx } from "./db";
import type {
  Category,
  Color,
  Product,
  ProductImage,
  Size,
  Variant,
  VariantDetail,
} from "./types";

// --- Lookups ---------------------------------------------------------------

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  return db.select<Category[]>("SELECT * FROM categories ORDER BY name");
}

/** Create a category and return its new id (so it can be auto-selected). */
export async function createCategory(name: string): Promise<number> {
  const db = await getDb();
  const res = await db.execute("INSERT INTO categories (name) VALUES ($1)", [
    name.trim(),
  ]);
  return res.lastInsertId as number;
}

export async function listSizes(): Promise<Size[]> {
  const db = await getDb();
  return db.select<Size[]>(
    "SELECT * FROM sizes ORDER BY sort_order, name",
  );
}

export async function listColors(): Promise<Color[]> {
  const db = await getDb();
  return db.select<Color[]>("SELECT * FROM colors ORDER BY name");
}

export async function createSize(name: string, sortOrder = 0): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO sizes (name, sort_order) VALUES ($1, $2)",
    [name, sortOrder],
  );
}

export async function createColor(
  name: string,
  hex: string | null = null,
): Promise<void> {
  const db = await getDb();
  await db.execute("INSERT INTO colors (name, hex) VALUES ($1, $2)", [
    name,
    hex,
  ]);
}

// --- Products --------------------------------------------------------------

export interface ProductInput {
  name: string;
  category_id: number | null;
  brand: string | null;
  description: string | null;
  cost_cents: number;
  price_cents: number;
  // Added in the inventory refactor; optional so older callers still compile.
  supplier_id?: number | null;
  reference?: string | null;
  notes?: string | null;
  low_stock_threshold?: number | null;
  reorder_quantity?: number | null;
  out_of_stock_alert?: number; // 0 | 1
}

export async function listProducts(): Promise<Product[]> {
  const db = await getDb();
  return db.select<Product[]>(
    "SELECT * FROM products WHERE archived = 0 ORDER BY name",
  );
}

export interface ProductSummary extends Product {
  category_name: string | null;
  supplier_name: string | null;
  variant_count: number;
  total_stock: number;
  primary_image_path: string | null;
}

const PRODUCT_SUMMARY_SELECT = `
  SELECT p.*, c.name AS category_name, sup.name AS supplier_name,
         COUNT(v.id) AS variant_count,
         COALESCE(SUM(v.stock), 0) AS total_stock,
         (SELECT pi.path FROM product_images pi
           WHERE pi.product_id = p.id
           ORDER BY pi.is_primary DESC, pi.sort_order, pi.id LIMIT 1) AS primary_image_path
    FROM products p
    LEFT JOIN categories c   ON c.id = p.category_id
    LEFT JOIN suppliers  sup ON sup.id = p.supplier_id
    LEFT JOIN variants   v   ON v.product_id = p.id AND v.archived = 0`;

/** Products with aggregated variant count and on-hand stock, for the list view. */
export async function listProductSummaries(): Promise<ProductSummary[]> {
  const db = await getDb();
  return db.select<ProductSummary[]>(
    `${PRODUCT_SUMMARY_SELECT}
      WHERE p.archived = 0
      GROUP BY p.id
      ORDER BY p.name`,
  );
}

export type StockStatusFilter = "all" | "in_stock" | "low" | "out";

export interface ProductPageQuery {
  search?: string;
  categoryId?: number | null;
  supplierId?: number | null;
  stockStatus?: StockStatusFilter;
  /** Global fallback when a product has no `low_stock_threshold`. */
  defaultLowStock?: number;
  limit?: number;
  offset?: number;
}

export interface ProductPage {
  rows: ProductSummary[];
  total: number;
}

/**
 * Server-side (SQL) paginated + filtered product list for large inventories.
 * Filtering by stock status is applied via HAVING on the aggregated stock so it
 * composes with pagination.
 */
export async function listProductsPage(q: ProductPageQuery): Promise<ProductPage> {
  const db = await getDb();
  const low = q.defaultLowStock ?? 5;
  const where: string[] = ["p.archived = 0"];
  const args: unknown[] = [];
  let i = 1;
  if (q.search?.trim()) {
    where.push(`(p.name LIKE $${i} OR p.reference LIKE $${i} OR p.brand LIKE $${i})`);
    args.push(`%${q.search.trim()}%`);
    i++;
  }
  if (q.categoryId != null) {
    where.push(`p.category_id = $${i++}`);
    args.push(q.categoryId);
  }
  if (q.supplierId != null) {
    where.push(`p.supplier_id = $${i++}`);
    args.push(q.supplierId);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;

  // Stock-status filter operates on the aggregated on-hand total.
  let having = "";
  if (q.stockStatus === "out") having = "HAVING total_stock <= 0";
  else if (q.stockStatus === "in_stock") having = "HAVING total_stock > 0";
  else if (q.stockStatus === "low")
    having = `HAVING total_stock > 0 AND total_stock <= COALESCE(p.low_stock_threshold, ${low})`;

  const countRows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM (
        SELECT p.id, COALESCE(SUM(v.stock),0) AS total_stock, p.low_stock_threshold
          FROM products p
          LEFT JOIN variants v ON v.product_id = p.id AND v.archived = 0
          ${whereSql}
          GROUP BY p.id
          ${having}
     )`,
    args,
  );

  const pageArgs = [...args];
  let pageSql = `${PRODUCT_SUMMARY_SELECT} ${whereSql} GROUP BY p.id ${having} ORDER BY p.name`;
  if (q.limit != null) {
    pageSql += ` LIMIT $${i} OFFSET $${i + 1}`;
    pageArgs.push(q.limit, q.offset ?? 0);
  }
  const rows = await db.select<ProductSummary[]>(pageSql, pageArgs);
  return { rows, total: countRows[0]?.n ?? 0 };
}

export async function getProduct(id: number): Promise<Product | null> {
  const db = await getDb();
  const rows = await db.select<Product[]>(
    "SELECT * FROM products WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function createProduct(input: ProductInput): Promise<number> {
  const db = await getDb();
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
  return res.lastInsertId as number;
}

export async function updateProduct(
  id: number,
  input: ProductInput,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE products
        SET name = $1, category_id = $2, supplier_id = $3, brand = $4,
            reference = $5, description = $6, notes = $7,
            cost_cents = $8, price_cents = $9,
            low_stock_threshold = $10, reorder_quantity = $11,
            out_of_stock_alert = COALESCE($12, out_of_stock_alert),
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
      input.out_of_stock_alert ?? null,
      id,
    ],
  );
}

/** Suggest a unique product reference / style code for the "Generate" button. */
export async function generateUniqueReference(): Promise<string> {
  const db = await getDb();
  for (let attempt = 0; attempt < 40; attempt++) {
    const ref = `SKU-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const rows = await db.select<{ n: number }[]>(
      "SELECT 1 AS n FROM products WHERE reference = $1 LIMIT 1",
      [ref],
    );
    if (rows.length === 0) return ref;
  }
  throw new Error("Could not generate a unique reference");
}

/** Soft-delete: keep the product (and its sales history) but hide it. */
export async function archiveProduct(id: number): Promise<void> {
  await withTx(async (db) => {
    await db.execute("UPDATE products SET archived = 1 WHERE id = $1", [id]);
    await db.execute(
      "UPDATE variants SET archived = 1 WHERE product_id = $1",
      [id],
    );
  });
}

// --- Variants (the size x color matrix) ------------------------------------

/**
 * Canonical, collision-free SKU. The (product, size, color) tuple is already
 * UNIQUE in the schema, so this composite is guaranteed unique too.
 */
export function buildSku(productId: number, sizeId: number | null, colorId: number | null): string {
  return `P${productId}-S${sizeId ?? "X"}-C${colorId ?? "X"}`;
}

export interface VariantSpec {
  size_id: number | null;
  color_id: number | null;
}

/**
 * Generate variants for a product from selected sizes x colors. Skips any
 * (size,color) combo that already exists. Barcode defaults to the SKU
 * (Code128 prints fine); the owner can overwrite it with a scanned barcode.
 * Returns the number of variants created.
 */
export async function generateVariants(
  productId: number,
  specs: VariantSpec[],
): Promise<number> {
  return withTx(async (db) => {
    let created = 0;
    for (const { size_id, color_id } of specs) {
      const sku = buildSku(productId, size_id, color_id);
      const res = await db.execute(
        `INSERT OR IGNORE INTO variants
           (product_id, size_id, color_id, sku, barcode)
         VALUES ($1, $2, $3, $4, $4)`,
        [productId, size_id, color_id, sku],
      );
      created += res.rowsAffected;
    }
    return created;
  });
}

export async function updateVariant(
  id: number,
  fields: {
    sku?: string;
    barcode?: string | null;
    price_cents?: number | null;
    cost_cents?: number | null;
  },
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = $${i++}`);
    args.push(value);
  }
  if (sets.length === 0) return;
  args.push(id);
  await db.execute(
    `UPDATE variants SET ${sets.join(", ")} WHERE id = $${i}`,
    args,
  );
}

const VARIANT_DETAIL_SELECT = `
  SELECT v.*, p.name AS product_name,
         s.name AS size_name, c.name AS color_name, c.hex AS color_hex,
         COALESCE(v.price_cents, p.price_cents) AS effective_price_cents
    FROM variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN sizes  s ON s.id = v.size_id
    LEFT JOIN colors c ON c.id = v.color_id`;

export async function listVariantsForProduct(
  productId: number,
): Promise<VariantDetail[]> {
  const db = await getDb();
  return db.select<VariantDetail[]>(
    `${VARIANT_DETAIL_SELECT} WHERE v.product_id = $1 ORDER BY s.sort_order, c.name`,
    [productId],
  );
}

/** Exact barcode match — the checkout scan path. */
export async function findVariantByBarcode(
  barcode: string,
): Promise<VariantDetail | null> {
  const db = await getDb();
  const rows = await db.select<VariantDetail[]>(
    `${VARIANT_DETAIL_SELECT} WHERE v.barcode = $1 AND v.archived = 0 LIMIT 1`,
    [barcode],
  );
  return rows[0] ?? null;
}

/** Free-text search across product name, SKU, and barcode for manual add. */
export async function searchVariants(
  query: string,
  limit = 50,
): Promise<VariantDetail[]> {
  const db = await getDb();
  const like = `%${query}%`;
  return db.select<VariantDetail[]>(
    `${VARIANT_DETAIL_SELECT}
       WHERE v.archived = 0
         AND (p.name LIKE $1 OR v.sku LIKE $1 OR v.barcode LIKE $1)
       ORDER BY p.name, s.sort_order
       LIMIT $2`,
    [like, limit],
  );
}

export async function getVariant(id: number): Promise<Variant | null> {
  const db = await getDb();
  const rows = await db.select<Variant[]>(
    "SELECT * FROM variants WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

// --- Whole-product loading & duplication -----------------------------------

export interface ProductFull {
  product: Product;
  category_name: string | null;
  supplier_name: string | null;
  variants: VariantDetail[];
  images: ProductImage[];
}

/** Load a product with its joined names, variants and images, for the editor. */
export async function getProductFull(id: number): Promise<ProductFull | null> {
  const db = await getDb();
  const product = await getProduct(id);
  if (!product) return null;
  const [meta] = await db.select<
    { category_name: string | null; supplier_name: string | null }[]
  >(
    `SELECT c.name AS category_name, s.name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
      WHERE p.id = $1`,
    [id],
  );
  const variants = await listVariantsForProduct(id);
  const images = await db.select<ProductImage[]>(
    `SELECT * FROM product_images WHERE product_id = $1
      ORDER BY is_primary DESC, sort_order, id`,
    [id],
  );
  return {
    product,
    category_name: meta?.category_name ?? null,
    supplier_name: meta?.supplier_name ?? null,
    variants,
    images,
  };
}

/**
 * Clone a product and all its variants. The copy starts at zero stock with
 * fresh, unique SKUs/barcodes and no shared image rows, so it is fully
 * independent of the original. Returns the new product id.
 */
export async function duplicateProduct(id: number): Promise<number> {
  return withTx(async (db) => {
    const [src] = await db.select<Product[]>(
      "SELECT * FROM products WHERE id = $1",
      [id],
    );
    if (!src) throw new Error("Product not found");

    const res = await db.execute(
      `INSERT INTO products
         (name, category_id, supplier_id, brand, reference, description, notes,
          cost_cents, price_cents, low_stock_threshold, reorder_quantity, out_of_stock_alert)
       VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10, $11)`,
      [
        `${src.name} (copy)`,
        src.category_id,
        src.supplier_id,
        src.brand,
        src.description,
        src.notes,
        src.cost_cents,
        src.price_cents,
        src.low_stock_threshold,
        src.reorder_quantity,
        src.out_of_stock_alert,
      ],
    );
    const newId = res.lastInsertId as number;

    const variants = await db.select<Variant[]>(
      "SELECT * FROM variants WHERE product_id = $1 AND archived = 0",
      [id],
    );
    for (const v of variants) {
      const sku = buildSku(newId, v.size_id, v.color_id);
      await db.execute(
        `INSERT INTO variants
           (product_id, size_id, color_id, sku, barcode, price_cents, cost_cents, stock)
         VALUES ($1, $2, $3, $4, $4, $5, $6, 0)`,
        [newId, v.size_id, v.color_id, sku, v.price_cents, v.cost_cents],
      );
    }

    await db.execute(
      `INSERT INTO activity_log (entity_type, entity_id, action, detail)
       VALUES ('product', $1, 'duplicated', $2)`,
      [newId, `Duplicated from #${id}`],
    );
    return newId;
  });
}
