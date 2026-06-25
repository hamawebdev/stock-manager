/**
 * Customer payments (versements) — the money side of customer A/R, the sell-side
 * mirror of `supplier-payments.ts`. A payment can be tied to one sale (invoice)
 * or be a global account payment (sale_id null). Amounts are signed: a positive
 * amount is money the customer pays us, a negative amount is a refund / credit
 * note ("avoir"/"retour") going back to them.
 *
 * A *cash* payment also writes a matching cash_events row in the open register
 * session (pay_in for money received, pay_out for a refund) so the drawer
 * reconciliation in `cash.ts` stays correct; cash_event_id links the two so a
 * deletion reverses both.
 */
import { getDb, withTx } from "./db";
import type { CustomerPayment, CustomerPaymentMethod } from "./types";

export interface CustomerPaymentInput {
  customer_id: number;
  sale_id?: number | null;
  amount_cents: number;
  method: CustomerPaymentMethod;
  reference?: string | null;
  note?: string | null;
}

export async function listPaymentsByCustomer(
  customerId: number,
): Promise<CustomerPayment[]> {
  const db = await getDb();
  return db.select<CustomerPayment[]>(
    "SELECT * FROM customer_payments WHERE customer_id = $1 ORDER BY id DESC",
    [customerId],
  );
}

/**
 * Record a payment. Inside one transaction: optionally write a cash event and
 * insert the payment. Note `sales.paid_cents` is an at-issuance snapshot set by
 * `completeSale` and is deliberately NOT mutated here — later versements live in
 * this table and feed the customer balance / Relevé de Compte, while the drawer
 * counts their cash via the linked pay_in event. (See cash.ts computeBreakdown.)
 */
export async function addPayment(
  input: CustomerPaymentInput,
): Promise<number> {
  if (!Number.isFinite(input.amount_cents) || input.amount_cents === 0) {
    throw new Error("Payment amount must be non-zero");
  }
  return withTx(async (db) => {
    let cashEventId: number | null = null;

    if (input.method === "especes") {
      const [session] = await db.select<{ id: number }[]>(
        "SELECT id FROM cash_sessions WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1",
      );
      if (session) {
        // Money into the drawer from the customer; a refund pays back out.
        const kind = input.amount_cents >= 0 ? "pay_in" : "pay_out";
        const reasonParts = ["Versement client", input.reference, input.note]
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
      `INSERT INTO customer_payments
         (customer_id, sale_id, amount_cents, method, reference, note, cash_event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.customer_id,
        input.sale_id ?? null,
        input.amount_cents,
        input.method,
        input.reference ?? null,
        input.note ?? null,
        cashEventId,
      ],
    );

    return res.lastInsertId as number;
  });
}

/** Delete a payment, reversing its linked cash event. */
export async function deletePayment(id: number): Promise<void> {
  await withTx(async (db) => {
    const [payment] = await db.select<CustomerPayment[]>(
      "SELECT * FROM customer_payments WHERE id = $1",
      [id],
    );
    if (!payment) return;

    if (payment.cash_event_id != null) {
      await db.execute("DELETE FROM cash_events WHERE id = $1", [
        payment.cash_event_id,
      ]);
    }
    await db.execute("DELETE FROM customer_payments WHERE id = $1", [id]);
  });
}
