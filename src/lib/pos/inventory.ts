/**
 * Inventory ledger. Every stock change writes a signed `inventory_movements`
 * row and updates the materialized `variants.stock` in the same transaction,
 * so the running total always matches the sum of deltas.
 */
import type Database from "@tauri-apps/plugin-sql";
import { getDb, withTx } from "./db";
import type { InventoryMovement, MovementReason } from "./types";

export interface MovementInput {
  variantId: number;
  delta: number;
  reason: MovementReason;
  refType?: string | null;
  refId?: number | null;
  note?: string | null;
}

/**
 * Low-level: append a movement and bump the variant's stock. Runs on the
 * passed connection WITHOUT its own transaction, so callers (e.g. completing
 * a sale) can batch many movements atomically. Use `adjustStock` for a
 * standalone, self-contained change.
 */
export async function applyMovement(
  db: Database,
  m: MovementInput,
): Promise<void> {
  await db.execute(
    `INSERT INTO inventory_movements
       (variant_id, delta, reason, ref_type, ref_id, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [m.variantId, m.delta, m.reason, m.refType ?? null, m.refId ?? null, m.note ?? null],
  );
  await db.execute(
    "UPDATE variants SET stock = stock + $1 WHERE id = $2",
    [m.delta, m.variantId],
  );
}

/** Standalone stock change (manual adjustment, receiving, stock-take). */
export async function adjustStock(m: MovementInput): Promise<void> {
  await withTx((db) => applyMovement(db, m));
}

export async function listMovements(
  variantId: number,
  limit = 100,
): Promise<InventoryMovement[]> {
  const db = await getDb();
  return db.select<InventoryMovement[]>(
    `SELECT * FROM inventory_movements
      WHERE variant_id = $1 ORDER BY id DESC LIMIT $2`,
    [variantId, limit],
  );
}
