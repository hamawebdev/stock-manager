/**
 * Suppliers data access. A product may reference one supplier; suppliers can be
 * created inline from the product page and are soft-deleted (archived) so any
 * historical product links stay readable. Migration 006 added the fiscal/legal
 * fields and the purchasing balance computed in `getSupplierBalance`.
 */
import { getDb } from "./db";
import { SUPPLIER_METHOD_LABELS_FR } from "./payment-methods";
import type { LedgerEntry, Supplier, SupplierBalance, SupplierPaymentMethod } from "./types";

export interface SupplierInput {
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  activity?: string | null;
  phone_fixe?: string | null;
  fax?: string | null;
  nif?: string | null;
  nis?: string | null;
  rc?: string | null;
  art_imposition?: string | null;
  rib?: string | null;
}

export async function listSuppliers(): Promise<Supplier[]> {
  const db = await getDb();
  return db.select<Supplier[]>(
    "SELECT * FROM suppliers WHERE archived = 0 ORDER BY name",
  );
}

export async function getSupplier(id: number): Promise<Supplier | null> {
  const db = await getDb();
  const rows = await db.select<Supplier[]>(
    "SELECT * FROM suppliers WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

/** Create a supplier and return its new id (used by the inline "+" button). */
export async function createSupplier(input: SupplierInput): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO suppliers
       (name, contact_name, phone, email, address, notes,
        activity, phone_fixe, fax, nif, nis, rc, art_imposition, rib)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      input.name.trim(),
      input.contact_name ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.notes ?? null,
      input.activity ?? null,
      input.phone_fixe ?? null,
      input.fax ?? null,
      input.nif ?? null,
      input.nis ?? null,
      input.rc ?? null,
      input.art_imposition ?? null,
      input.rib ?? null,
    ],
  );
  return res.lastInsertId as number;
}

export async function updateSupplier(
  id: number,
  input: SupplierInput,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE suppliers
        SET name = $1, contact_name = $2, phone = $3, email = $4,
            address = $5, notes = $6, activity = $7, phone_fixe = $8,
            fax = $9, nif = $10, nis = $11, rc = $12,
            art_imposition = $13, rib = $14
      WHERE id = $15`,
    [
      input.name.trim(),
      input.contact_name ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.notes ?? null,
      input.activity ?? null,
      input.phone_fixe ?? null,
      input.fax ?? null,
      input.nif ?? null,
      input.nis ?? null,
      input.rc ?? null,
      input.art_imposition ?? null,
      input.rib ?? null,
      id,
    ],
  );
}

export async function archiveSupplier(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE suppliers SET archived = 1 WHERE id = $1", [id]);
}

/**
 * Aggregate the supplier's confirmed-purchase total against the sum of all
 * payments, so the UI can show Total Achats / Total Versé / Solde. Cancelled
 * and draft purchases are excluded from the purchase total.
 */
export async function getSupplierBalance(
  supplierId: number,
): Promise<SupplierBalance> {
  const db = await getDb();
  const [purchases] = await db.select<{ total: number; n: number }[]>(
    `SELECT COALESCE(SUM(total_ttc_cents), 0) AS total, COUNT(*) AS n
       FROM purchases
      WHERE supplier_id = $1 AND status = 'confirmed'`,
    [supplierId],
  );
  const [payments] = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total
       FROM supplier_payments
      WHERE supplier_id = $1`,
    [supplierId],
  );
  const total_purchases_cents = purchases?.total ?? 0;
  const total_paid_cents = payments?.total ?? 0;
  return {
    total_purchases_cents,
    total_paid_cents,
    balance_cents: total_purchases_cents - total_paid_cents,
    confirmed_count: purchases?.n ?? 0,
  };
}

/**
 * Supplier account statement (Relevé Fournisseur): confirmed purchases (débit)
 * and payments (crédit) interleaved by date with a running solde. Mirrors
 * `getCustomerLedger`; a negative payment (refund) counts as a débit.
 */
export async function getSupplierLedger(
  supplierId: number,
): Promise<LedgerEntry[]> {
  const db = await getDb();
  const purchases = await db.select<
    { code: string | null; total_ttc_cents: number; created_at: string }[]
  >(
    `SELECT code, total_ttc_cents, created_at
       FROM purchases
      WHERE supplier_id = $1 AND status = 'confirmed'`,
    [supplierId],
  );
  const payments = await db.select<
    {
      amount_cents: number;
      method: SupplierPaymentMethod;
      note: string | null;
      reference: string | null;
      created_at: string;
      purchase_code: string | null;
    }[]
  >(
    `SELECT sp.amount_cents, sp.method, sp.note, sp.reference, sp.created_at,
            p.code AS purchase_code
       FROM supplier_payments sp
       LEFT JOIN purchases p ON p.id = sp.purchase_id
      WHERE sp.supplier_id = $1`,
    [supplierId],
  );

  type Raw = Omit<LedgerEntry, "balance_cents">;
  const rows: Raw[] = [
    ...purchases.map(
      (r): Raw => ({
        date: r.created_at,
        label: `Achat N° ${r.code ?? "—"}`,
        debit_cents: r.total_ttc_cents,
        credit_cents: 0,
      }),
    ),
    ...payments.map((r): Raw => {
      const detail = r.note ?? (r.purchase_code ? `Règlement ${r.purchase_code}` : r.reference);
      return {
        date: r.created_at,
        label: `Paiement (${SUPPLIER_METHOD_LABELS_FR[r.method]})${detail ? ` — ${detail}` : ""}`,
        debit_cents: r.amount_cents < 0 ? -r.amount_cents : 0,
        credit_cents: r.amount_cents > 0 ? r.amount_cents : 0,
      };
    }),
  ];

  rows.sort((a, b) => a.date.localeCompare(b.date));

  let balance = 0;
  return rows.map((r) => {
    balance += r.debit_cents - r.credit_cents;
    return { ...r, balance_cents: balance };
  });
}
