/**
 * Product image storage for the desktop app. Image bytes are written to disk
 * under the app-config dir (next to `app.db`, so they travel with backups);
 * only the relative path is stored in the `product_images` table. The webview
 * renders them through the Tauri asset protocol via `convertFileSrc`.
 *
 * All Tauri APIs are imported lazily so this module also type-checks/builds in a
 * plain-browser context (where the image pipeline is simply unavailable).
 */
import { getDb } from "./pos/db";
import type { ProductImage } from "./pos/types";

const ROOT = "product-images"; // relative to the app-config base dir

async function fs() {
  return import("@tauri-apps/plugin-fs");
}
async function pathApi() {
  return import("@tauri-apps/api/path");
}

function extFromName(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return (m?.[1] ?? "png").toLowerCase();
}

export async function listProductImages(
  productId: number,
): Promise<ProductImage[]> {
  const db = await getDb();
  return db.select<ProductImage[]>(
    `SELECT * FROM product_images WHERE product_id = $1
      ORDER BY is_primary DESC, sort_order, id`,
    [productId],
  );
}

/** Resolve a stored relative path to an <img>-loadable asset URL. */
export async function productImageSrc(relPath: string): Promise<string> {
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  const { appConfigDir, join } = await pathApi();
  const abs = await join(await appConfigDir(), ROOT, relPath);
  return convertFileSrc(abs);
}

/**
 * Persist image bytes for a product and record the row. `sortOrder` defaults to
 * after the current last image; the first image saved for a product becomes its
 * primary unless `isPrimary` is given.
 */
export async function saveProductImage(
  productId: number,
  bytes: Uint8Array,
  fileName: string,
  opts: { isPrimary?: boolean; sortOrder?: number } = {},
): Promise<ProductImage> {
  const { mkdir, writeFile, BaseDirectory } = await fs();
  const { join } = await pathApi();

  const dir = await join(ROOT, String(productId));
  await mkdir(dir, { baseDir: BaseDirectory.AppConfig, recursive: true });

  const ext = extFromName(fileName);
  const rel = await join(String(productId), `${crypto.randomUUID()}.${ext}`);
  await writeFile(await join(ROOT, rel), bytes, {
    baseDir: BaseDirectory.AppConfig,
  });

  const db = await getDb();
  const existing = await listProductImages(productId);
  const isPrimary = opts.isPrimary ?? existing.length === 0;
  const sortOrder = opts.sortOrder ?? existing.length;
  if (isPrimary) {
    await db.execute(
      "UPDATE product_images SET is_primary = 0 WHERE product_id = $1",
      [productId],
    );
  }
  const res = await db.execute(
    `INSERT INTO product_images (product_id, path, is_primary, sort_order)
     VALUES ($1, $2, $3, $4)`,
    [productId, rel, isPrimary ? 1 : 0, sortOrder],
  );
  return {
    id: res.lastInsertId as number,
    product_id: productId,
    path: rel,
    is_primary: isPrimary ? 1 : 0,
    sort_order: sortOrder,
    created_at: new Date().toISOString(),
  };
}

export async function deleteProductImage(id: number): Promise<void> {
  const db = await getDb();
  const [row] = await db.select<ProductImage[]>(
    "SELECT * FROM product_images WHERE id = $1",
    [id],
  );
  if (!row) return;
  try {
    const { remove, BaseDirectory } = await fs();
    const { join } = await pathApi();
    await remove(await join(ROOT, row.path), {
      baseDir: BaseDirectory.AppConfig,
    });
  } catch {
    // File may already be gone; the DB row removal below is what matters.
  }
  await db.execute("DELETE FROM product_images WHERE id = $1", [id]);
}

export async function setPrimaryImage(
  productId: number,
  imageId: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE product_images SET is_primary = 0 WHERE product_id = $1",
    [productId],
  );
  await db.execute(
    "UPDATE product_images SET is_primary = 1 WHERE id = $1",
    [imageId],
  );
}

/** Read a browser File into bytes for `saveProductImage`. */
export async function fileToBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
