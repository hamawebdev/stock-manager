/**
 * Returns & exchanges. A return brings items back (optionally restocking) and,
 * for an exchange, sends replacement items out. Everything happens in one
 * transaction so stock and the cash settlement stay consistent.
 *
 * net_cash_cents > 0  → shop pays the customer (refund)
 * net_cash_cents < 0  → customer pays the shop (exchange upcharge)
 */
import { withTx } from "./db";
import { applyMovement } from "./inventory";

export interface ReturnInItemInput {
  variant_id: number;
  sale_item_id?: number | null;
  description: string;
  qty: number;
  unit_price_cents: number;
  restock: boolean;
}

export interface ReturnOutItemInput {
  variant_id: number;
  description: string;
  qty: number;
  unit_price_cents: number;
}

export interface ProcessReturnInput {
  original_sale_id?: number | null;
  inItems: ReturnInItemInput[];
  outItems: ReturnOutItemInput[];
  note?: string | null;
}

export interface ProcessedReturn {
  id: number;
  code: string;
  kind: "refund" | "exchange";
  return_value_cents: number;
  exchange_value_cents: number;
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
  const exchangeValue = input.outItems.reduce(
    (s, o) => s + o.qty * o.unit_price_cents,
    0,
  );
  const kind = input.outItems.length > 0 ? "exchange" : "refund";
  const netCash = returnValue - exchangeValue;

  return withTx(async (db) => {
    const [{ n }] = await db.select<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM returns",
    );
    const code = `R-${String(n + 1).padStart(6, "0")}`;

    const res = await db.execute(
      `INSERT INTO returns
         (code, original_sale_id, kind, return_value_cents,
          exchange_value_cents, net_cash_cents, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [code, input.original_sale_id ?? null, kind, returnValue, exchangeValue, netCash, input.note ?? null],
    );
    const returnId = res.lastInsertId as number;

    // Items coming back in.
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

    // Replacement items going out (exchange) — leave stock.
    for (const o of input.outItems) {
      await db.execute(
        `INSERT INTO return_out_items
           (return_id, variant_id, description, qty, unit_price_cents, line_total_cents)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [returnId, o.variant_id, o.description, o.qty, o.unit_price_cents, o.qty * o.unit_price_cents],
      );
      await applyMovement(db, {
        variantId: o.variant_id,
        delta: -o.qty,
        reason: "exchange",
        refType: "return",
        refId: returnId,
      });
    }

    return {
      id: returnId,
      code,
      kind,
      return_value_cents: returnValue,
      exchange_value_cents: exchangeValue,
      net_cash_cents: netCash,
    };
  });
}
