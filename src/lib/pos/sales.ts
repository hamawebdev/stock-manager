/**
 * Sales data access. Completing a sale is a single transaction: persist the
 * sale + its lines, decrement each variant's stock through the inventory ledger,
 * and (for a named customer) record the at-sale versement so the customer
 * account / Relevé de Compte is correct.
 *
 * Retail prices are tax-INCLUSIVE (P.U TTC), so the HT base and TVA are
 * back-derived from the TTC total at sale time — see `computeSaleTotals`. Sales
 * may be settled in full or on credit (paid_cents < total_ttc); a credit sale
 * requires a named customer (walk-ins must pay in full).
 */
import type Database from "@tauri-apps/plugin-sql";
import { getDb, withTx } from "./db";
import { applyMovement } from "./inventory";
import { getSetting } from "./settings";
import type { CustomerPaymentMethod, Sale, SaleItem, SaleRow } from "./types";

export interface CartLineInput {
  variant_id: number;
  description: string;
  qty: number;
  unit_price_cents: number; // TTC
  line_discount_cents: number;
}

export interface CompleteSaleInput {
  lines: CartLineInput[];
  cart_discount_cents: number;
  tva_enabled: boolean;
  tva_rate: number; // whole percent
  payment_method: CustomerPaymentMethod;
  /** Amount settling the invoice now (≤ total). Credit sale when below total. */
  paid_cents: number;
  /** Cash handed over (espèces) — drives change; defaults to paid_cents. */
  cash_tendered_cents?: number;
  note?: string | null;
  customer_id?: number | null;
}

export interface CompletedSale {
  id: number;
  code: string;
  subtotal_ht_cents: number;
  tva_cents: number;
  total_ttc_cents: number;
  paid_cents: number;
  change_cents: number;
}

export interface SaleTotals {
  subtotal_ht_cents: number;
  tva_cents: number;
  total_ttc_cents: number;
}

function lineTotal(l: CartLineInput): number {
  return Math.max(0, l.qty * l.unit_price_cents - l.line_discount_cents);
}

/**
 * Derive the HT base and TVA from a tax-inclusive (TTC) total. With TVA off (or
 * a zero rate) the whole amount is treated as HT with no tax line. Shared by the
 * checkout footer and the repo so the figures always agree.
 */
export function computeSaleTotals(
  totalTtcCents: number,
  tvaEnabled: boolean,
  tvaRate: number,
): SaleTotals {
  if (!tvaEnabled || tvaRate <= 0) {
    return {
      subtotal_ht_cents: totalTtcCents,
      tva_cents: 0,
      total_ttc_cents: totalTtcCents,
    };
  }
  const ht = Math.round((totalTtcCents * 100) / (100 + tvaRate));
  return {
    subtotal_ht_cents: ht,
    tva_cents: totalTtcCents - ht,
    total_ttc_cents: totalTtcCents,
  };
}

/** Allocate the next year-scoped invoice code, e.g. `FAC-2026-0031`. */
async function nextSaleCode(db: Database): Promise<string> {
  const prefix = (await getSetting("sale_code_prefix")) || "FAC";
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;
  const [{ n }] = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM sales WHERE code LIKE $1",
    [like],
  );
  return `${prefix}-${year}-${String(n + 1).padStart(4, "0")}`;
}

/** Persist a completed sale, decrement stock, and record the at-sale payment. */
export async function completeSale(
  input: CompleteSaleInput,
): Promise<CompletedSale> {
  if (input.lines.length === 0) throw new Error("Cart is empty");

  const subtotal = input.lines.reduce((s, l) => s + lineTotal(l), 0);
  const totalTtc = Math.max(0, subtotal - input.cart_discount_cents);
  const totals = computeSaleTotals(totalTtc, input.tva_enabled, input.tva_rate);

  const tendered = input.cash_tendered_cents ?? input.paid_cents;
  const paid = Math.max(0, Math.min(input.paid_cents, totalTtc));
  const change =
    input.payment_method === "especes" ? Math.max(0, tendered - totalTtc) : 0;

  if (paid < totalTtc && input.customer_id == null) {
    throw new Error("A credit sale requires a named customer");
  }

  return withTx(async (db) => {
    const code = await nextSaleCode(db);

    const res = await db.execute(
      `INSERT INTO sales
         (code, subtotal_cents, cart_discount_cents, total_cents,
          cash_tendered_cents, change_cents, status, note, customer_id,
          tva_enabled, tva_rate, subtotal_ht_cents, tva_cents, total_ttc_cents,
          paid_cents, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        code,
        subtotal,
        input.cart_discount_cents,
        totalTtc,
        tendered,
        change,
        input.note ?? null,
        input.customer_id ?? null,
        input.tva_enabled ? 1 : 0,
        input.tva_enabled ? input.tva_rate : 0,
        totals.subtotal_ht_cents,
        totals.tva_cents,
        totals.total_ttc_cents,
        paid,
        input.payment_method,
      ],
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

    // Record the at-sale versement against the customer account so it shows in
    // the Relevé de Compte. No cash_event here — the drawer counts this sale's
    // cash via sales.paid_cents (see cash.ts), and double-counting must be
    // avoided. Walk-in sales (no customer) carry no account entry.
    if (input.customer_id != null && paid > 0) {
      await db.execute(
        `INSERT INTO customer_payments
           (customer_id, sale_id, amount_cents, method, reference, note, cash_event_id)
         VALUES ($1, $2, $3, $4, $5, NULL, NULL)`,
        [input.customer_id, saleId, paid, input.payment_method, code],
      );
    }

    return {
      id: saleId,
      code,
      subtotal_ht_cents: totals.subtotal_ht_cents,
      tva_cents: totals.tva_cents,
      total_ttc_cents: totals.total_ttc_cents,
      paid_cents: paid,
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

/** All sales with their customer name, newest first — the Studio "Ventes" list. */
export async function listSales(limit = 200): Promise<SaleRow[]> {
  const db = await getDb();
  return db.select<SaleRow[]>(
    `SELECT s.*, c.name AS customer_name
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.status = 'completed'
      ORDER BY s.id DESC LIMIT $1`,
    [limit],
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
