/**
 * Returns / refunds. A return brings items back into the shop (restocking) and
 * refunds their value to the customer. Everything happens in one transaction so
 * stock and the cash settlement stay consistent.
 *
 * net_cash_cents is the amount paid back to the customer (the refund total).
 */
import { getDb, withTx } from "./db";
import { applyMovement } from "./inventory";
import type { ReturnRow } from "./types";

export interface ReturnInItemInput {
  variant_id: number;
  sale_item_id?: number | null;
  description: string;
  qty: number;
  unit_price_cents: number;
  restock: boolean;
}

export interface ProcessReturnInput {
  original_sale_id?: number | null;
  inItems: ReturnInItemInput[];
  note?: string | null;
}

export interface ProcessedReturn {
  id: number;
  code: string;
  return_value_cents: number;
  net_cash_cents: number;
}

export async function processReturn(
  input: ProcessReturnInput,
): Promise<ProcessedReturn> {
  if (input.inItems.length === 0) {
    throw new Error("Select at least one item to return");
  }

  const returnValue = input.inItems.reduce(
    (s, i) => s + i.qty * i.unit_price_cents,
    0,
  );

  return withTx(async (db) => {
    const [{ n }] = await db.select<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM returns",
    );
    const code = `R-${String(n + 1).padStart(6, "0")}`;

    // kind is always 'refund' now (exchanges removed); exchange_value stays 0.
    const res = await db.execute(
      `INSERT INTO returns
         (code, original_sale_id, kind, return_value_cents,
          exchange_value_cents, net_cash_cents, note)
       VALUES ($1, $2, 'refund', $3, 0, $4, $5)`,
      [code, input.original_sale_id ?? null, returnValue, returnValue, input.note ?? null],
    );
    const returnId = res.lastInsertId as number;

    // Items coming back in (restock + reduce the original sale's open qty).
    for (const i of input.inItems) {
      await db.execute(
        `INSERT INTO return_in_items
           (return_id, variant_id, sale_item_id, description, qty,
            unit_price_cents, restock)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [returnId, i.variant_id, i.sale_item_id ?? null, i.description, i.qty, i.unit_price_cents, i.restock ? 1 : 0],
      );
      if (i.restock) {
        await applyMovement(db, {
          variantId: i.variant_id,
          delta: i.qty,
          reason: "return",
          refType: "return",
          refId: returnId,
        });
      }
      if (i.sale_item_id != null) {
        await db.execute(
          "UPDATE sale_items SET qty_returned = qty_returned + $1 WHERE id = $2",
          [i.qty, i.sale_item_id],
        );
      }
    }

    return {
      id: returnId,
      code,
      return_value_cents: returnValue,
      net_cash_cents: returnValue,
    };
  });
}

/**
 * Recent returns for the transaction-history timeline, each joined to its
 * original sale code and the customer it was attributed to (via the sale).
 */
export async function listRecentReturns(limit = 50): Promise<ReturnRow[]> {
  const db = await getDb();
  return db.select<ReturnRow[]>(
    `SELECT r.id, r.code, r.original_sale_id, r.kind,
            r.return_value_cents, r.exchange_value_cents, r.net_cash_cents,
            r.note, r.created_at,
            s.code AS original_sale_code,
            c.name AS customer_name
       FROM returns r
       LEFT JOIN sales s     ON s.id = r.original_sale_id
       LEFT JOIN customers c ON c.id = s.customer_id
      ORDER BY r.id DESC
      LIMIT $1`,
    [limit],
  );
}
