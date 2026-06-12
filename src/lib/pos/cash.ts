/**
 * Cash management for a single register: open a session with a float, track
 * the cash that should be in the drawer through the day, and reconcile against
 * a physical count at close.
 *
 * Expected drawer cash =
 *   opening float
 *   + cash taken in completed sales (since the session opened)
 *   - net cash paid out on returns (refunds; exchange upcharges add back)
 *   + pay-ins  - pay-outs
 */
import { getDb } from "./db";

export interface CashSession {
  id: number;
  opened_at: string;
  closed_at: string | null;
  opening_float_cents: number;
  expected_cents: number | null;
  counted_cents: number | null;
  variance_cents: number | null;
  note: string | null;
}

export interface CashEvent {
  id: number;
  session_id: number | null;
  kind: "pay_in" | "pay_out" | "no_sale";
  amount_cents: number;
  reason: string | null;
  created_at: string;
}

export async function getOpenSession(): Promise<CashSession | null> {
  const db = await getDb();
  const rows = await db.select<CashSession[]>(
    "SELECT * FROM cash_sessions WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1",
  );
  return rows[0] ?? null;
}

export async function openSession(
  openingFloatCents: number,
): Promise<CashSession> {
  const db = await getDb();
  const existing = await getOpenSession();
  if (existing) throw new Error("A cash session is already open");
  const res = await db.execute(
    "INSERT INTO cash_sessions (opening_float_cents) VALUES ($1)",
    [openingFloatCents],
  );
  const rows = await db.select<CashSession[]>(
    "SELECT * FROM cash_sessions WHERE id = $1",
    [res.lastInsertId],
  );
  return rows[0];
}

export async function addCashEvent(
  sessionId: number,
  kind: CashEvent["kind"],
  amountCents: number,
  reason: string | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO cash_events (session_id, kind, amount_cents, reason) VALUES ($1, $2, $3, $4)",
    [sessionId, kind, amountCents, reason],
  );
}

export async function listEvents(sessionId: number): Promise<CashEvent[]> {
  const db = await getDb();
  return db.select<CashEvent[]>(
    "SELECT * FROM cash_events WHERE session_id = $1 ORDER BY id DESC",
    [sessionId],
  );
}

export interface CashBreakdown {
  opening_float_cents: number;
  sales_cents: number;
  returns_cash_out_cents: number;
  pay_in_cents: number;
  pay_out_cents: number;
  expected_cents: number;
}

/** Compute the expected drawer total for an open session. */
export async function computeBreakdown(
  session: CashSession,
): Promise<CashBreakdown> {
  const db = await getDb();
  const opened = session.opened_at;

  const [{ v: sales }] = await db.select<{ v: number }[]>(
    `SELECT COALESCE(SUM(total_cents),0) AS v FROM sales
      WHERE status='completed' AND created_at >= $1`,
    [opened],
  );
  const [{ v: returnsNet }] = await db.select<{ v: number }[]>(
    `SELECT COALESCE(SUM(net_cash_cents),0) AS v FROM returns
      WHERE created_at >= $1`,
    [opened],
  );
  const [{ v: payIn }] = await db.select<{ v: number }[]>(
    `SELECT COALESCE(SUM(amount_cents),0) AS v FROM cash_events
      WHERE session_id=$1 AND kind='pay_in'`,
    [session.id],
  );
  const [{ v: payOut }] = await db.select<{ v: number }[]>(
    `SELECT COALESCE(SUM(amount_cents),0) AS v FROM cash_events
      WHERE session_id=$1 AND kind='pay_out'`,
    [session.id],
  );

  const expected =
    session.opening_float_cents + sales - returnsNet + payIn - payOut;
  return {
    opening_float_cents: session.opening_float_cents,
    sales_cents: sales,
    returns_cash_out_cents: returnsNet,
    pay_in_cents: payIn,
    pay_out_cents: payOut,
    expected_cents: expected,
  };
}

export async function closeSession(
  sessionId: number,
  countedCents: number,
): Promise<CashSession> {
  const db = await getDb();
  const rows = await db.select<CashSession[]>(
    "SELECT * FROM cash_sessions WHERE id = $1",
    [sessionId],
  );
  const session = rows[0];
  if (!session) throw new Error("Session not found");
  if (session.closed_at) throw new Error("Session already closed");

  const { expected_cents } = await computeBreakdown(session);
  const variance = countedCents - expected_cents;
  await db.execute(
    `UPDATE cash_sessions
        SET closed_at = CURRENT_TIMESTAMP, expected_cents = $1,
            counted_cents = $2, variance_cents = $3
      WHERE id = $4`,
    [expected_cents, countedCents, variance, sessionId],
  );
  const updated = await db.select<CashSession[]>(
    "SELECT * FROM cash_sessions WHERE id = $1",
    [sessionId],
  );
  return updated[0];
}
