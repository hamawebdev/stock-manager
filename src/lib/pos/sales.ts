/**
 * Sales data access. Completing a sale is a single transaction: persist the
 * sale + its lines, then decrement each variant's stock through the inventory
 * ledger (so stock history stays consistent with sales).
 */
import { getDb, withTx } from "./db";
import { applyMovement } from "./inventory";
import type { Sale, SaleItem } from "./types";

export interface CartLineInput {
  variant_id: number;
  description: string;
  qty: number;
  unit_price_cents: number;
  line_discount_cents: number;
}

export interface CompleteSaleInput {
  lines: CartLineInput[];
  cart_discount_cents: number;
  cash_tendered_cents: number;
  note?: string | null;
}

export interface CompletedSale {
  id: number;
  code: string;
  subtotal_cents: number;
  cart_discount_cents: number;
  total_cents: number;
  cash_tendered_cents: number;
  change_cents: number;
}

function lineTotal(l: CartLineInput): number {
  return Math.max(0, l.qty * l.unit_price_cents - l.line_discount_cents);
}

/** Persist a completed cash sale and decrement stock. Returns the saved sale. */
export async function completeSale(
  input: CompleteSaleInput,
): Promise<CompletedSale> {
  if (input.lines.length === 0) throw new Error("Cart is empty");

  const subtotal = input.lines.reduce((s, l) => s + lineTotal(l), 0);
  const total = Math.max(0, subtotal - input.cart_discount_cents);
  if (input.cash_tendered_cents < total) {
    throw new Error("Cash tendered is less than the total");
  }
  const change = input.cash_tendered_cents - total;

  return withTx(async (db) => {
    // Sequential receipt code. Safe on a single register (one writer).
    const [{ n }] = await db.select<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM sales",
    );
    const code = `S-${String(n + 1).padStart(6, "0")}`;

    const res = await db.execute(
      `INSERT INTO sales
         (code, subtotal_cents, cart_discount_cents, total_cents,
          cash_tendered_cents, change_cents, status, note)
       VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7)`,
      [code, subtotal, input.cart_discount_cents, total, input.cash_tendered_cents, change, input.note ?? null],
    );
    const saleId = res.lastInsertId as number;

    for (const l of input.lines) {
      await db.execute(
        `INSERT INTO sale_items
           (sale_id, variant_id, description, qty, unit_price_cents,
            line_discount_cents, line_total_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [saleId, l.variant_id, l.description, l.qty, l.unit_price_cents, l.line_discount_cents, lineTotal(l)],
      );
      await applyMovement(db, {
        variantId: l.variant_id,
        delta: -l.qty,
        reason: "sale",
        refType: "sale",
        refId: saleId,
      });
    }

    return {
      id: saleId,
      code,
      subtotal_cents: subtotal,
      cart_discount_cents: input.cart_discount_cents,
      total_cents: total,
      cash_tendered_cents: input.cash_tendered_cents,
      change_cents: change,
    };
  });
}

export async function getSale(id: number): Promise<Sale | null> {
  const db = await getDb();
  const rows = await db.select<Sale[]>("SELECT * FROM sales WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function getSaleItems(saleId: number): Promise<SaleItem[]> {
  const db = await getDb();
  return db.select<SaleItem[]>(
    "SELECT * FROM sale_items WHERE sale_id = $1 ORDER BY id",
    [saleId],
  );
}

/** Most recent sales for the receipt-lookup / reprint flows. */
export async function listRecentSales(limit = 50): Promise<Sale[]> {
  const db = await getDb();
  return db.select<Sale[]>(
    "SELECT * FROM sales ORDER BY id DESC LIMIT $1",
    [limit],
  );
}

export async function findSaleByCode(code: string): Promise<Sale | null> {
  const db = await getDb();
  const rows = await db.select<Sale[]>(
    "SELECT * FROM sales WHERE code = $1",
    [code],
  );
  return rows[0] ?? null;
}
