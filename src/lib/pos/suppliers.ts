/**
 * Suppliers data access. A product may reference one supplier; suppliers can be
 * created inline from the product page and are soft-deleted (archived) so any
 * historical product links stay readable.
 */
import { getDb } from "./db";
import type { Supplier } from "./types";

export interface SupplierInput {
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
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
    `INSERT INTO suppliers (name, contact_name, phone, email, address, notes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.name.trim(),
      input.contact_name ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.notes ?? null,
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
            address = $5, notes = $6
      WHERE id = $7`,
    [
      input.name.trim(),
      input.contact_name ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.notes ?? null,
      id,
    ],
  );
}

export async function archiveSupplier(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE suppliers SET archived = 1 WHERE id = $1", [id]);
}
