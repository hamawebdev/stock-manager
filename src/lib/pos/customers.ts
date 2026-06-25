/**
 * Customers: a contact record so a sale can be attributed to a person, their
 * purchase history shown, and — since migration 007 — an account balance (A/R)
 * tracked. Legal/fiscal fields mirror suppliers so the same document templates
 * (client info block, Relevé de Compte) work for both parties.
 */
import { getDb } from "./db";
import { PAYMENT_METHOD_LABELS_FR } from "./payment-methods";
import type {
  CustomerBalance,
  CustomerPaymentMethod,
  LedgerEntry,
  Sale,
} from "./types";

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  archived: number;
  created_at: string;
  /** Contact + fiscal/legal fields (migration 007). */
  address: string | null;
  phone_fixe: string | null;
  fax: string | null;
  activity: string | null;
  nif: string | null;
  nis: string | null;
  rc: string | null;
  art_imposition: string | null;
  rib: string | null;
}

export interface CustomerInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
  address?: string | null;
  phone_fixe?: string | null;
  fax?: string | null;
  activity?: string | null;
  nif?: string | null;
  nis?: string | null;
  rc?: string | null;
  art_imposition?: string | null;
  rib?: string | null;
}

const N = (v: string | null | undefined): string | null => v?.trim() || null;

/** Search by name / phone / email for the attach-to-sale picker. */
export async function searchCustomers(
  query: string,
  limit = 20,
): Promise<Customer[]> {
  const db = await getDb();
  const q = query.trim();
  if (!q) {
    return db.select<Customer[]>(
      "SELECT * FROM customers WHERE archived = 0 ORDER BY created_at DESC LIMIT $1",
      [limit],
    );
  }
  const like = `%${q}%`;
  return db.select<Customer[]>(
    `SELECT * FROM customers
       WHERE archived = 0
         AND (name LIKE $1 OR phone LIKE $1 OR email LIKE $1)
       ORDER BY name LIMIT $2`,
    [like, limit],
  );
}

export async function getCustomer(id: number): Promise<Customer | null> {
  const db = await getDb();
  const rows = await db.select<Customer[]>(
    "SELECT * FROM customers WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO customers
       (name, phone, email, note, address, phone_fixe, fax, activity,
        nif, nis, rc, art_imposition, rib)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      input.name.trim(),
      N(input.phone),
      N(input.email),
      N(input.note),
      N(input.address),
      N(input.phone_fixe),
      N(input.fax),
      N(input.activity),
      N(input.nif),
      N(input.nis),
      N(input.rc),
      N(input.art_imposition),
      N(input.rib),
    ],
  );
  const created = await getCustomer(res.lastInsertId as number);
  if (!created) throw new Error("Failed to create customer");
  return created;
}

export async function updateCustomer(
  id: number,
  input: CustomerInput,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE customers
        SET name = $1, phone = $2, email = $3, note = $4, address = $5,
            phone_fixe = $6, fax = $7, activity = $8, nif = $9, nis = $10,
            rc = $11, art_imposition = $12, rib = $13
      WHERE id = $14`,
    [
      input.name.trim(),
      N(input.phone),
      N(input.email),
      N(input.note),
      N(input.address),
      N(input.phone_fixe),
      N(input.fax),
      N(input.activity),
      N(input.nif),
      N(input.nis),
      N(input.rc),
      N(input.art_imposition),
      N(input.rib),
      id,
    ],
  );
}

/** Completed sales for this customer, newest first (their purchase history). */
export async function getPurchaseHistory(
  customerId: number,
  limit = 50,
): Promise<Sale[]> {
  const db = await getDb();
  return db.select<Sale[]>(
    `SELECT * FROM sales
       WHERE customer_id = $1
       ORDER BY id DESC LIMIT $2`,
    [customerId, limit],
  );
}

/**
 * Account balance: total invoiced (TTC) minus total paid. Positive balance means
 * the customer owes us. Mirrors `getSupplierBalance` — every versement (including
 * the one recorded at sale time) lives in `customer_payments`, so summing that
 * table avoids double-counting `sales.paid_cents`.
 */
export async function getCustomerBalance(
  customerId: number,
): Promise<CustomerBalance> {
  const db = await getDb();
  const [s] = await db.select<{ total: number; n: number }[]>(
    `SELECT COALESCE(SUM(total_ttc_cents), 0) AS total, COUNT(*) AS n
       FROM sales
      WHERE customer_id = $1 AND status = 'completed'`,
    [customerId],
  );
  const [p] = await db.select<{ total: number }[]>(
    "SELECT COALESCE(SUM(amount_cents), 0) AS total FROM customer_payments WHERE customer_id = $1",
    [customerId],
  );
  const total_sales_cents = s?.total ?? 0;
  const total_paid_cents = p?.total ?? 0;
  return {
    total_sales_cents,
    total_paid_cents,
    balance_cents: total_sales_cents - total_paid_cents,
    sale_count: s?.n ?? 0,
  };
}

/**
 * Full account statement (Relevé de Compte): every sale (débit) and versement
 * (crédit) interleaved by date with a running solde. A negative payment (refund/
 * avoir) counts as a débit. Computed in JS so the running balance is explicit.
 */
export async function getCustomerLedger(
  customerId: number,
): Promise<LedgerEntry[]> {
  const db = await getDb();
  const sales = await db.select<
    { code: string; total_ttc_cents: number; created_at: string }[]
  >(
    `SELECT code, total_ttc_cents, created_at
       FROM sales
      WHERE customer_id = $1 AND status = 'completed'`,
    [customerId],
  );
  const payments = await db.select<
    {
      amount_cents: number;
      method: CustomerPaymentMethod;
      note: string | null;
      reference: string | null;
      created_at: string;
      sale_code: string | null;
    }[]
  >(
    `SELECT cp.amount_cents, cp.method, cp.note, cp.reference, cp.created_at,
            s.code AS sale_code
       FROM customer_payments cp
       LEFT JOIN sales s ON s.id = cp.sale_id
      WHERE cp.customer_id = $1`,
    [customerId],
  );

  type Raw = Omit<LedgerEntry, "balance_cents">;
  const rows: Raw[] = [
    ...sales.map(
      (r): Raw => ({
        date: r.created_at,
        label: `Vente N° ${r.code}`,
        debit_cents: r.total_ttc_cents,
        credit_cents: 0,
      }),
    ),
    ...payments.map((r): Raw => {
      const detail = r.note ?? (r.sale_code ? `Règlement ${r.sale_code}` : r.reference);
      return {
        date: r.created_at,
        label: `Versement (${PAYMENT_METHOD_LABELS_FR[r.method]})${detail ? ` — ${detail}` : ""}`,
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
