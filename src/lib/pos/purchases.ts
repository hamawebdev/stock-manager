/**
 * Purchases (achats) data access — the buy-side counterpart to sales. A purchase
 * is built as a 'draft' (freely editable, no side effects) and only on confirm
 * does it: assign a sequential code, receive stock through the inventory ledger
 * (reason 'receiving'), and roll each received variant's cost into a weighted
 * average. TVA is per-purchase. Money is INTEGER minor units; qty is REAL so
 * weight/volume units (Kg, L) can be received with decimals.
 */
import type Database from "tauri-plugin-sql-api";
import { getDb, withTx } from "./db";
import { applyMovement } from "./inventory";
import type {
  PaymentTerms,
  Purchase,
  PurchaseItem,
  PurchaseRow,
} from "./types";

export interface PurchaseLineInput {
  variant_id: number | null;
  description: string;
  qty: number;
  unit: string | null;
  unit_cost_ht_cents: number;
}

export interface PurchaseInput {
  supplier_id: number | null;
  purchase_date: string | null;
  invoice_ref: string | null;
  note: string | null;
  tva_enabled: boolean;
  tva_rate: number;
  payment_terms: PaymentTerms | null;
  lines: PurchaseLineInput[];
}

export interface PurchaseTotals {
  subtotal_ht_cents: number;
  tva_cents: number;
  total_ttc_cents: number;
}

export function lineTotalHt(line: PurchaseLineInput): number {
  return Math.round(line.qty * line.unit_cost_ht_cents);
}

/** Shared HT / TVA / TTC math, used by both the UI footer and the repo. */
export function computePurchaseTotals(
  lines: PurchaseLineInput[],
  tvaEnabled: boolean,
  tvaRate: number,
): PurchaseTotals {
  const subtotal = lines.reduce((s, l) => s + lineTotalHt(l), 0);
  const tva = tvaEnabled ? Math.round((subtotal * tvaRate) / 100) : 0;
  return {
    subtotal_ht_cents: subtotal,
    tva_cents: tva,
    total_ttc_cents: subtotal + tva,
  };
}

export async function listPurchases(): Promise<PurchaseRow[]> {
  const db = await getDb();
  return db.select<PurchaseRow[]>(
    `SELECT p.*, s.name AS supplier_name
       FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
      ORDER BY p.id DESC`,
  );
}

export async function listPurchasesBySupplier(
  supplierId: number,
): Promise<PurchaseRow[]> {
  const db = await getDb();
  return db.select<PurchaseRow[]>(
    `SELECT p.*, s.name AS supplier_name
       FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.supplier_id = $1
      ORDER BY p.id DESC`,
    [supplierId],
  );
}

export async function getPurchase(id: number): Promise<PurchaseRow | null> {
  const db = await getDb();
  const rows = await db.select<PurchaseRow[]>(
    `SELECT p.*, s.name AS supplier_name
       FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getPurchaseItems(
  purchaseId: number,
): Promise<PurchaseItem[]> {
  const db = await getDb();
  return db.select<PurchaseItem[]>(
    "SELECT * FROM purchase_items WHERE purchase_id = $1 ORDER BY id",
    [purchaseId],
  );
}

async function writeItems(
  db: Database,
  purchaseId: number,
  lines: PurchaseLineInput[],
): Promise<void> {
  for (const l of lines) {
    await db.execute(
      `INSERT INTO purchase_items
         (purchase_id, variant_id, description, qty, unit,
          unit_cost_ht_cents, line_total_ht_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        purchaseId,
        l.variant_id,
        l.description,
        l.qty,
        l.unit,
        l.unit_cost_ht_cents,
        lineTotalHt(l),
      ],
    );
  }
}

/** Create a draft purchase (no stock / cost / balance effects). Returns its id. */
export async function saveDraftPurchase(input: PurchaseInput): Promise<number> {
  const totals = computePurchaseTotals(
    input.lines,
    input.tva_enabled,
    input.tva_rate,
  );
  return withTx(async (db) => {
    const res = await db.execute(
      `INSERT INTO purchases
         (supplier_id, status, purchase_date, invoice_ref, note,
          tva_enabled, tva_rate, subtotal_ht_cents, tva_cents,
          total_ttc_cents, payment_terms)
       VALUES ($1, 'draft', $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.supplier_id,
        input.purchase_date,
        input.invoice_ref,
        input.note,
        input.tva_enabled ? 1 : 0,
        input.tva_rate,
        totals.subtotal_ht_cents,
        totals.tva_cents,
        totals.total_ttc_cents,
        input.payment_terms,
      ],
    );
    const purchaseId = res.lastInsertId as number;
    await writeItems(db, purchaseId, input.lines);
    return purchaseId;
  });
}

/** Update an existing draft in place (replaces its lines). Drafts only. */
export async function updateDraftPurchase(
  id: number,
  input: PurchaseInput,
): Promise<void> {
  const totals = computePurchaseTotals(
    input.lines,
    input.tva_enabled,
    input.tva_rate,
  );
  await withTx(async (db) => {
    const [row] = await db.select<{ status: string }[]>(
      "SELECT status FROM purchases WHERE id = $1",
      [id],
    );
    if (!row) throw new Error("Purchase not found");
    if (row.status !== "draft") {
      throw new Error("Only draft purchases can be edited");
    }
    await db.execute(
      `UPDATE purchases
          SET supplier_id = $1, purchase_date = $2, invoice_ref = $3,
              note = $4, tva_enabled = $5, tva_rate = $6,
              subtotal_ht_cents = $7, tva_cents = $8, total_ttc_cents = $9,
              payment_terms = $10
        WHERE id = $11`,
      [
        input.supplier_id,
        input.purchase_date,
        input.invoice_ref,
        input.note,
        input.tva_enabled ? 1 : 0,
        input.tva_rate,
        totals.subtotal_ht_cents,
        totals.tva_cents,
        totals.total_ttc_cents,
        input.payment_terms,
        id,
      ],
    );
    await db.execute("DELETE FROM purchase_items WHERE purchase_id = $1", [id]);
    await writeItems(db, id, input.lines);
  });
}

/**
 * Confirm a draft: assign its code, receive each variant-linked line into stock
 * (rounding decimal qty to a whole-unit delta), and roll the received cost into
 * a weighted average on the variant. Idempotent-guarded against double confirm.
 */
export async function confirmPurchase(id: number): Promise<Purchase> {
  return withTx(async (db) => {
    const rows = await db.select<Purchase[]>(
      "SELECT * FROM purchases WHERE id = $1",
      [id],
    );
    const purchase = rows[0];
    if (!purchase) throw new Error("Purchase not found");
    if (purchase.status === "confirmed") {
      throw new Error("Purchase is already confirmed");
    }
    if (purchase.status === "cancelled") {
      throw new Error("Cancelled purchases cannot be confirmed");
    }

    // Sequential code, allocated only on confirm (drafts have none).
    let code = purchase.code;
    if (!code) {
      const [{ n }] = await db.select<{ n: number }[]>(
        "SELECT COUNT(*) AS n FROM purchases WHERE code IS NOT NULL",
      );
      code = `A-${String(n + 1).padStart(6, "0")}`;
    }

    await db.execute(
      `UPDATE purchases
          SET status = 'confirmed', code = $1, confirmed_at = CURRENT_TIMESTAMP
        WHERE id = $2`,
      [code, id],
    );

    const items = await db.select<PurchaseItem[]>(
      "SELECT * FROM purchase_items WHERE purchase_id = $1",
      [id],
    );

    for (const item of items) {
      if (item.variant_id == null) continue; // free line: no stock effect
      const recvQty = Math.round(item.qty);
      if (recvQty <= 0) continue;

      // Effective current cost = variant override, else product default.
      const [v] = await db.select<{ stock: number; cost: number }[]>(
        `SELECT v.stock AS stock,
                COALESCE(v.cost_cents, p.cost_cents, 0) AS cost
           FROM variants v
           JOIN products p ON p.id = v.product_id
          WHERE v.id = $1`,
        [item.variant_id],
      );
      if (!v) continue;

      const oldStock = Math.max(0, v.stock);
      const denom = oldStock + recvQty;
      const newCost =
        denom > 0
          ? Math.round(
              (oldStock * v.cost + recvQty * item.unit_cost_ht_cents) / denom,
            )
          : item.unit_cost_ht_cents;

      await applyMovement(db, {
        variantId: item.variant_id,
        delta: recvQty,
        reason: "receiving",
        refType: "purchase",
        refId: id,
        note: code,
      });
      await db.execute("UPDATE variants SET cost_cents = $1 WHERE id = $2", [
        newCost,
        item.variant_id,
      ]);
    }

    return { ...purchase, status: "confirmed", code } as Purchase;
  });
}

/**
 * Delete a purchase. If it was confirmed, reverse the received stock (negative
 * movements); the weighted-average cost is left as-is (a known limitation, the
 * same as most average-cost systems). Linked payments are detached (kept as
 * global account payments) by the ON DELETE SET NULL foreign key.
 */
export async function deletePurchase(id: number): Promise<void> {
  await withTx(async (db) => {
    const [purchase] = await db.select<Purchase[]>(
      "SELECT * FROM purchases WHERE id = $1",
      [id],
    );
    if (!purchase) return;

    if (purchase.status === "confirmed") {
      const items = await db.select<PurchaseItem[]>(
        "SELECT * FROM purchase_items WHERE purchase_id = $1",
        [id],
      );
      for (const item of items) {
        if (item.variant_id == null) continue;
        const recvQty = Math.round(item.qty);
        if (recvQty <= 0) continue;
        await applyMovement(db, {
          variantId: item.variant_id,
          delta: -recvQty,
          reason: "receiving",
          refType: "purchase-reversal",
          refId: id,
          note: purchase.code,
        });
      }
    }

    await db.execute("DELETE FROM purchases WHERE id = $1", [id]);
  });
}
