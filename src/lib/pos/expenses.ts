/**
 * Expenses data access — a self-contained operating-expense ledger with its own
 * categories, configurable payment methods, attachments and recurring
 * templates. Deliberately independent of purchasing / supplier payments and of
 * the cash-session reconciliation, so nothing is double-counted (see migration
 * 008). Money is INTEGER minor units; `expense_date` is a plain ISO date
 * ('YYYY-MM-DD'), so date grouping needs no 'localtime' modifier.
 */
import { getDb, withTx } from "./db";

export type RecurringFrequency =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export interface ExpenseCategory {
  id: number;
  name: string;
  color: string | null;
  sort_order: number;
  archived: number;
  created_at: string;
}

export interface ExpensePaymentMethod {
  id: number;
  name: string;
  sort_order: number;
  archived: number;
  created_at: string;
}

export interface RecurringTemplate {
  id: number;
  name: string;
  category_id: number | null;
  payment_method_id: number | null;
  amount_cents: number;
  vendor: string | null;
  note: string | null;
  frequency: RecurringFrequency;
  next_due_date: string | null;
  active: number;
  created_at: string;
}

/** Recurring template joined with its category / method names for display. */
export interface RecurringTemplateRow extends RecurringTemplate {
  category_name: string | null;
  category_color: string | null;
  method_name: string | null;
}

export interface Expense {
  id: number;
  code: string | null;
  category_id: number | null;
  payment_method_id: number | null;
  template_id: number | null;
  amount_cents: number;
  expense_date: string;
  vendor: string | null;
  reference: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** Expense joined with category / method labels + attachment count, for lists. */
export interface ExpenseRow extends Expense {
  category_name: string | null;
  category_color: string | null;
  method_name: string | null;
  attachment_count: number;
}

export interface ExpenseAttachment {
  id: number;
  expense_id: number;
  path: string;
  file_name: string;
  mime: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface ExpenseInput {
  category_id: number | null;
  payment_method_id: number | null;
  amount_cents: number;
  expense_date: string;
  vendor: string | null;
  reference: string | null;
  note: string | null;
}

export interface ExpenseFilters {
  search?: string | null;
  category_id?: number | null;
  payment_method_id?: number | null;
  from?: string | null; // ISO date, inclusive
  to?: string | null; // ISO date, inclusive
}

// --- Categories ------------------------------------------------------------

export async function listCategories(
  includeArchived = false,
): Promise<ExpenseCategory[]> {
  const db = await getDb();
  return db.select<ExpenseCategory[]>(
    `SELECT * FROM expense_categories
      ${includeArchived ? "" : "WHERE archived = 0"}
      ORDER BY archived, sort_order, name`,
  );
}

export async function createCategory(
  name: string,
  color: string | null = null,
): Promise<number> {
  const db = await getDb();
  const [{ n }] = await db.select<{ n: number }[]>(
    "SELECT COALESCE(MAX(sort_order), 0) AS n FROM expense_categories",
  );
  const res = await db.execute(
    "INSERT INTO expense_categories (name, color, sort_order) VALUES ($1, $2, $3)",
    [name.trim(), color, n + 1],
  );
  return res.lastInsertId as number;
}

export async function updateCategory(
  id: number,
  patch: { name?: string; color?: string | null },
): Promise<void> {
  const db = await getDb();
  const [cur] = await db.select<ExpenseCategory[]>(
    "SELECT * FROM expense_categories WHERE id = $1",
    [id],
  );
  if (!cur) throw new Error("Category not found");
  await db.execute(
    "UPDATE expense_categories SET name = $1, color = $2 WHERE id = $3",
    [
      patch.name?.trim() ?? cur.name,
      patch.color !== undefined ? patch.color : cur.color,
      id,
    ],
  );
}

/** Archive (soft-delete) a category. Historical expenses keep their link. */
export async function archiveCategory(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE expense_categories SET archived = 1 WHERE id = $1", [
    id,
  ]);
}

export async function restoreCategory(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE expense_categories SET archived = 0 WHERE id = $1", [
    id,
  ]);
}

// --- Payment methods -------------------------------------------------------

export async function listPaymentMethods(
  includeArchived = false,
): Promise<ExpensePaymentMethod[]> {
  const db = await getDb();
  return db.select<ExpensePaymentMethod[]>(
    `SELECT * FROM expense_payment_methods
      ${includeArchived ? "" : "WHERE archived = 0"}
      ORDER BY archived, sort_order, name`,
  );
}

export async function createPaymentMethod(name: string): Promise<number> {
  const db = await getDb();
  const [{ n }] = await db.select<{ n: number }[]>(
    "SELECT COALESCE(MAX(sort_order), 0) AS n FROM expense_payment_methods",
  );
  const res = await db.execute(
    "INSERT INTO expense_payment_methods (name, sort_order) VALUES ($1, $2)",
    [name.trim(), n + 1],
  );
  return res.lastInsertId as number;
}

export async function updatePaymentMethod(
  id: number,
  name: string,
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE expense_payment_methods SET name = $1 WHERE id = $2", [
    name.trim(),
    id,
  ]);
}

export async function archivePaymentMethod(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE expense_payment_methods SET archived = 1 WHERE id = $1",
    [id],
  );
}

export async function restorePaymentMethod(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE expense_payment_methods SET archived = 0 WHERE id = $1",
    [id],
  );
}

// --- Expenses (ledger) -----------------------------------------------------

/** Build the WHERE clause + bind args shared by list and analytics queries. */
function buildFilter(f: ExpenseFilters): { where: string; args: unknown[] } {
  const clauses: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  if (f.from) {
    clauses.push(`e.expense_date >= $${i++}`);
    args.push(f.from);
  }
  if (f.to) {
    clauses.push(`e.expense_date <= $${i++}`);
    args.push(f.to);
  }
  if (f.category_id != null) {
    clauses.push(`e.category_id = $${i++}`);
    args.push(f.category_id);
  }
  if (f.payment_method_id != null) {
    clauses.push(`e.payment_method_id = $${i++}`);
    args.push(f.payment_method_id);
  }
  const q = f.search?.trim();
  if (q) {
    // Numbered placeholders are bound positionally, so each `$N` gets its own
    // arg (the rest of the codebase never reuses a placeholder index).
    const pat = `%${q}%`;
    clauses.push(
      `(e.vendor LIKE $${i} OR e.reference LIKE $${i + 1} OR e.note LIKE $${i + 2} OR e.code LIKE $${i + 3})`,
    );
    args.push(pat, pat, pat, pat);
  }
  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    args,
  };
}

export async function listExpenses(
  filters: ExpenseFilters = {},
): Promise<ExpenseRow[]> {
  const db = await getDb();
  const { where, args } = buildFilter(filters);
  return db.select<ExpenseRow[]>(
    `SELECT e.*,
            c.name  AS category_name,
            c.color AS category_color,
            m.name  AS method_name,
            (SELECT COUNT(*) FROM expense_attachments a WHERE a.expense_id = e.id)
              AS attachment_count
       FROM expenses e
       LEFT JOIN expense_categories c      ON c.id = e.category_id
       LEFT JOIN expense_payment_methods m ON m.id = e.payment_method_id
       ${where}
      ORDER BY e.expense_date DESC, e.id DESC`,
    args,
  );
}

export async function getExpense(id: number): Promise<ExpenseRow | null> {
  const rows = await listExpensesByIds([id]);
  return rows[0] ?? null;
}

async function listExpensesByIds(ids: number[]): Promise<ExpenseRow[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
  return db.select<ExpenseRow[]>(
    `SELECT e.*,
            c.name  AS category_name,
            c.color AS category_color,
            m.name  AS method_name,
            (SELECT COUNT(*) FROM expense_attachments a WHERE a.expense_id = e.id)
              AS attachment_count
       FROM expenses e
       LEFT JOIN expense_categories c      ON c.id = e.category_id
       LEFT JOIN expense_payment_methods m ON m.id = e.payment_method_id
      WHERE e.id IN (${placeholders})`,
    ids,
  );
}

/** Create an expense, assigning the next sequential code 'E-000001'. */
export async function createExpense(
  input: ExpenseInput,
  templateId: number | null = null,
): Promise<number> {
  return withTx(async (db) => {
    const [{ n }] = await db.select<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM expenses WHERE code IS NOT NULL",
    );
    const code = `E-${String(n + 1).padStart(6, "0")}`;
    const res = await db.execute(
      `INSERT INTO expenses
         (code, category_id, payment_method_id, template_id, amount_cents,
          expense_date, vendor, reference, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        code,
        input.category_id,
        input.payment_method_id,
        templateId,
        input.amount_cents,
        input.expense_date,
        input.vendor,
        input.reference,
        input.note,
      ],
    );
    return res.lastInsertId as number;
  });
}

export async function updateExpense(
  id: number,
  input: ExpenseInput,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE expenses
        SET category_id = $1, payment_method_id = $2, amount_cents = $3,
            expense_date = $4, vendor = $5, reference = $6, note = $7,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $8`,
    [
      input.category_id,
      input.payment_method_id,
      input.amount_cents,
      input.expense_date,
      input.vendor,
      input.reference,
      input.note,
      id,
    ],
  );
}

/** Delete an expense. Attachment rows cascade; their files are removed by the
 *  caller (repo has no filesystem access) — see deleteExpenseWithFiles. */
export async function deleteExpense(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM expenses WHERE id = $1", [id]);
}

// --- Attachments (DB rows; file bytes handled in expense-attachments.ts) ----

export async function listAttachments(
  expenseId: number,
): Promise<ExpenseAttachment[]> {
  const db = await getDb();
  return db.select<ExpenseAttachment[]>(
    "SELECT * FROM expense_attachments WHERE expense_id = $1 ORDER BY id",
    [expenseId],
  );
}

export async function insertAttachment(
  expenseId: number,
  path: string,
  fileName: string,
  mime: string | null,
  sizeBytes: number | null,
): Promise<ExpenseAttachment> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO expense_attachments (expense_id, path, file_name, mime, size_bytes)
     VALUES ($1, $2, $3, $4, $5)`,
    [expenseId, path, fileName, mime, sizeBytes],
  );
  return {
    id: res.lastInsertId as number,
    expense_id: expenseId,
    path,
    file_name: fileName,
    mime,
    size_bytes: sizeBytes,
    created_at: new Date().toISOString(),
  };
}

export async function deleteAttachmentRow(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM expense_attachments WHERE id = $1", [id]);
}

// --- Recurring templates ---------------------------------------------------

export interface RecurringInput {
  name: string;
  category_id: number | null;
  payment_method_id: number | null;
  amount_cents: number;
  vendor: string | null;
  note: string | null;
  frequency: RecurringFrequency;
  next_due_date: string | null;
  active: boolean;
}

export async function listRecurring(): Promise<RecurringTemplateRow[]> {
  const db = await getDb();
  return db.select<RecurringTemplateRow[]>(
    `SELECT r.*,
            c.name  AS category_name,
            c.color AS category_color,
            m.name  AS method_name
       FROM expense_recurring_templates r
       LEFT JOIN expense_categories c      ON c.id = r.category_id
       LEFT JOIN expense_payment_methods m ON m.id = r.payment_method_id
      ORDER BY r.active DESC, r.next_due_date IS NULL, r.next_due_date, r.name`,
  );
}

export async function createRecurring(input: RecurringInput): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO expense_recurring_templates
       (name, category_id, payment_method_id, amount_cents, vendor, note,
        frequency, next_due_date, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.name.trim(),
      input.category_id,
      input.payment_method_id,
      input.amount_cents,
      input.vendor,
      input.note,
      input.frequency,
      input.next_due_date,
      input.active ? 1 : 0,
    ],
  );
  return res.lastInsertId as number;
}

export async function updateRecurring(
  id: number,
  input: RecurringInput,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE expense_recurring_templates
        SET name = $1, category_id = $2, payment_method_id = $3,
            amount_cents = $4, vendor = $5, note = $6, frequency = $7,
            next_due_date = $8, active = $9
      WHERE id = $10`,
    [
      input.name.trim(),
      input.category_id,
      input.payment_method_id,
      input.amount_cents,
      input.vendor,
      input.note,
      input.frequency,
      input.next_due_date,
      input.active ? 1 : 0,
      id,
    ],
  );
}

export async function deleteRecurring(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM expense_recurring_templates WHERE id = $1", [id]);
}

/** Advance an ISO date by one period of `freq`. */
export function advanceDate(iso: string, freq: RecurringFrequency): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  switch (freq) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Post a recurring template into a real expense dated today (or its due date),
 * then advance the template's next_due_date by one period. Returns the new
 * expense id.
 */
export async function postRecurring(templateId: number): Promise<number> {
  return withTx(async (db) => {
    const [tpl] = await db.select<RecurringTemplate[]>(
      "SELECT * FROM expense_recurring_templates WHERE id = $1",
      [templateId],
    );
    if (!tpl) throw new Error("Template not found");

    const date = tpl.next_due_date ?? new Date().toISOString().slice(0, 10);

    const [{ n }] = await db.select<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM expenses WHERE code IS NOT NULL",
    );
    const code = `E-${String(n + 1).padStart(6, "0")}`;
    const res = await db.execute(
      `INSERT INTO expenses
         (code, category_id, payment_method_id, template_id, amount_cents,
          expense_date, vendor, reference, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8)`,
      [
        code,
        tpl.category_id,
        tpl.payment_method_id,
        tpl.id,
        tpl.amount_cents,
        date,
        tpl.vendor,
        tpl.note,
      ],
    );

    const nextDue = advanceDate(date, tpl.frequency);
    await db.execute(
      "UPDATE expense_recurring_templates SET next_due_date = $1 WHERE id = $2",
      [nextDue, templateId],
    );
    return res.lastInsertId as number;
  });
}

// --- Analytics -------------------------------------------------------------

export interface ExpenseKpis {
  total_cents: number;
  count: number;
  avg_cents: number;
  max_cents: number;
}

/** Headline totals over the current filter window. */
export async function getKpis(filters: ExpenseFilters = {}): Promise<ExpenseKpis> {
  const db = await getDb();
  const { where, args } = buildFilter(filters);
  const [row] = await db.select<ExpenseKpis[]>(
    `SELECT COALESCE(SUM(amount_cents),0) AS total_cents,
            COUNT(*) AS count,
            COALESCE(CAST(AVG(amount_cents) AS INTEGER),0) AS avg_cents,
            COALESCE(MAX(amount_cents),0) AS max_cents
       FROM expenses e ${where}`,
    args,
  );
  return row ?? { total_cents: 0, count: 0, avg_cents: 0, max_cents: 0 };
}

export interface CategoryBreakdownRow {
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  total_cents: number;
  count: number;
}

export async function getByCategory(
  filters: ExpenseFilters = {},
): Promise<CategoryBreakdownRow[]> {
  const db = await getDb();
  const { where, args } = buildFilter(filters);
  return db.select<CategoryBreakdownRow[]>(
    `SELECT e.category_id,
            c.name  AS category_name,
            c.color AS category_color,
            COALESCE(SUM(e.amount_cents),0) AS total_cents,
            COUNT(*) AS count
       FROM expenses e
       LEFT JOIN expense_categories c ON c.id = e.category_id
       ${where}
      GROUP BY e.category_id
      ORDER BY total_cents DESC`,
    args,
  );
}

export interface MethodBreakdownRow {
  method_id: number | null;
  method_name: string | null;
  total_cents: number;
  count: number;
}

export async function getByMethod(
  filters: ExpenseFilters = {},
): Promise<MethodBreakdownRow[]> {
  const db = await getDb();
  const { where, args } = buildFilter(filters);
  return db.select<MethodBreakdownRow[]>(
    `SELECT e.payment_method_id AS method_id,
            m.name AS method_name,
            COALESCE(SUM(e.amount_cents),0) AS total_cents,
            COUNT(*) AS count
       FROM expenses e
       LEFT JOIN expense_payment_methods m ON m.id = e.payment_method_id
       ${where}
      GROUP BY e.payment_method_id
      ORDER BY total_cents DESC`,
    args,
  );
}

export interface MonthPoint {
  month: string; // 'YYYY-MM'
  total_cents: number;
  count: number;
}

/** Spend per calendar month for the last `months` months (oldest first). */
export async function getByMonth(months = 12): Promise<MonthPoint[]> {
  const db = await getDb();
  const rows = await db.select<MonthPoint[]>(
    `SELECT substr(expense_date, 1, 7) AS month,
            COALESCE(SUM(amount_cents),0) AS total_cents,
            COUNT(*) AS count
       FROM expenses
      WHERE expense_date >= date('now','localtime',$1,'start of month')
      GROUP BY month
      ORDER BY month`,
    [`-${months - 1} months`],
  );
  return rows;
}

export interface VendorSpendRow {
  vendor: string;
  total_cents: number;
  count: number;
}

export async function getTopVendors(
  limit = 10,
  filters: ExpenseFilters = {},
): Promise<VendorSpendRow[]> {
  const db = await getDb();
  const { where, args } = buildFilter(filters);
  const extra = where ? `${where} AND e.vendor IS NOT NULL AND e.vendor <> ''` : `WHERE e.vendor IS NOT NULL AND e.vendor <> ''`;
  return db.select<VendorSpendRow[]>(
    `SELECT e.vendor AS vendor,
            COALESCE(SUM(e.amount_cents),0) AS total_cents,
            COUNT(*) AS count
       FROM expenses e
       ${extra}
      GROUP BY e.vendor
      ORDER BY total_cents DESC
      LIMIT $${args.length + 1}`,
    [...args, limit],
  );
}
