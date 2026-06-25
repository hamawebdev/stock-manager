/**
 * Held (suspended) sales. A parked cart is stored as a JSON snapshot so it
 * survives an app restart and can be resumed later — useful when a customer
 * steps away to grab another size and the cashier needs to serve the queue.
 */
import { getDb } from "./db";
import type { CartLine, Discount } from "@/store/use-cart-store";

export interface HeldCartPayload {
  lines: CartLine[];
  cartDiscount: Discount | null;
  customerId: number | null;
}

export interface HeldSale {
  id: number;
  label: string;
  customer_id: number | null;
  payload: HeldCartPayload;
  created_at: string;
}

interface HeldRow {
  id: number;
  label: string;
  customer_id: number | null;
  payload_json: string;
  created_at: string;
}

export async function holdSale(
  label: string,
  payload: HeldCartPayload,
): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    "INSERT INTO held_sales (label, customer_id, payload_json) VALUES ($1, $2, $3)",
    [label.trim() || "Held sale", payload.customerId, JSON.stringify(payload)],
  );
  return res.lastInsertId as number;
}

export async function listHeld(): Promise<HeldSale[]> {
  const db = await getDb();
  const rows = await db.select<HeldRow[]>(
    "SELECT * FROM held_sales ORDER BY id DESC",
  );
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    customer_id: r.customer_id,
    payload: JSON.parse(r.payload_json) as HeldCartPayload,
    created_at: r.created_at,
  }));
}

/** Read a held sale and remove it (resuming consumes it). */
export async function resumeHeld(id: number): Promise<HeldSale | null> {
  const db = await getDb();
  const rows = await db.select<HeldRow[]>(
    "SELECT * FROM held_sales WHERE id = $1",
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  await db.execute("DELETE FROM held_sales WHERE id = $1", [id]);
  return {
    id: row.id,
    label: row.label,
    customer_id: row.customer_id,
    payload: JSON.parse(row.payload_json) as HeldCartPayload,
    created_at: row.created_at,
  };
}

export async function discardHeld(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM held_sales WHERE id = $1", [id]);
}
