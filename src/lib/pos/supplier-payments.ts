/**
 * Supplier payments (versements) — the money side of purchasing. A payment can
 * be tied to one purchase or be a global account payment (purchase_id null).
 * Amounts are signed: a positive amount is money paid to the supplier, a
 * negative amount is a refund / return ("remboursement"/"retour") coming back.
 *
 * A *cash* payment also writes a matching cash_events row in the open register
 * session (pay_out for money out, pay_in for a refund) so the drawer
 * reconciliation in `cash.ts` stays correct; cash_event_id links the two so a
 * deletion reverses both.
 */
import { getDb, withTx } from "./db";
import type { SupplierPayment, SupplierPaymentMethod } from "./types";

export interface SupplierPaymentInput {
  supplier_id: number;
  purchase_id?: number | null;
  amount_cents: number;
  method: SupplierPaymentMethod;
  reference?: string | null;
  note?: string | null;
}

export async function listPaymentsBySupplier(
  supplierId: number,
): Promise<SupplierPayment[]> {
  const db = await getDb();
  return db.select<SupplierPayment[]>(
    "SELECT * FROM supplier_payments WHERE supplier_id = $1 ORDER BY id DESC",
    [supplierId],
  );
}

/**
 * Record a payment. Inside one transaction: optionally write a cash event,
 * insert the payment, and keep the purchase's denormalised paid_cents in sync.
 */
export async function addPayment(
  input: SupplierPaymentInput,
): Promise<number> {
  if (!Number.isFinite(input.amount_cents) || input.amount_cents === 0) {
    throw new Error("Payment amount must be non-zero");
  }
  return withTx(async (db) => {
    let cashEventId: number | null = null;

    if (input.method === "cash") {
      const [session] = await db.select<{ id: number }[]>(
        "SELECT id FROM cash_sessions WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1",
      );
      if (session) {
        // Money out of the drawer pays the supplier; a refund pays back in.
        const kind = input.amount_cents >= 0 ? "pay_out" : "pay_in";
        const reasonParts = ["Paiement fournisseur", input.reference, input.note]
          .filter(Boolean)
          .join(" — ");
        const res = await db.execute(
          "INSERT INTO cash_events (session_id, kind, amount_cents, reason) VALUES ($1, $2, $3, $4)",
          [session.id, kind, Math.abs(input.amount_cents), reasonParts],
        );
        cashEventId = res.lastInsertId as number;
      }
    }

    const res = await db.execute(
      `INSERT INTO supplier_payments
         (supplier_id, purchase_id, amount_cents, method, reference, note, cash_event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.supplier_id,
        input.purchase_id ?? null,
        input.amount_cents,
        input.method,
        input.reference ?? null,
        input.note ?? null,
        cashEventId,
      ],
    );

    if (input.purchase_id != null) {
      await db.execute(
        "UPDATE purchases SET paid_cents = paid_cents + $1 WHERE id = $2",
        [input.amount_cents, input.purchase_id],
      );
    }

    return res.lastInsertId as number;
  });
}

/** Delete a payment, reversing its cash event and the purchase's paid total. */
export async function deletePayment(id: number): Promise<void> {
  await withTx(async (db) => {
    const [payment] = await db.select<SupplierPayment[]>(
      "SELECT * FROM supplier_payments WHERE id = $1",
      [id],
    );
    if (!payment) return;

    if (payment.cash_event_id != null) {
      await db.execute("DELETE FROM cash_events WHERE id = $1", [
        payment.cash_event_id,
      ]);
    }
    if (payment.purchase_id != null) {
      await db.execute(
        "UPDATE purchases SET paid_cents = paid_cents - $1 WHERE id = $2",
        [payment.amount_cents, payment.purchase_id],
      );
    }
    await db.execute("DELETE FROM supplier_payments WHERE id = $1", [id]);
  });
}
