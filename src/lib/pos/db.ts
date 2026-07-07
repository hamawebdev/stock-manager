import type Database from "@tauri-apps/plugin-sql";
import { ensureConnPragmas, getRawDb, serialize } from "@/lib/db";

export { getDb } from "@/lib/db";
export type { Db } from "@/lib/db";

/**
 * Run `fn` inside a SQLite transaction, committing on success and rolling back
 * on any error. plugin-sql exposes no transaction object, so we drive
 * BEGIN/COMMIT/ROLLBACK explicitly.
 *
 * The entire BEGIN…COMMIT sequence runs inside a single `serialize` slot, so no
 * other database operation can interleave with it. That is what makes the
 * hand-rolled transaction safe: plugin-sql's underlying sqlx pool would
 * otherwise route the statements across different physical connections and the
 * BEGIN IMMEDIATE write lock would deadlock the later writes (SQLITE_BUSY,
 * "database is locked"). `fn` receives the raw pooled handle directly — its
 * statements must bypass the queue, because this transaction already holds it
 * (re-entering `serialize` would enqueue behind the transaction awaiting them).
 *
 * Uses BEGIN IMMEDIATE to take the RESERVED write lock up front.
 *
 * Invariant: code inside `fn` must use the passed `db`, never a standalone
 * `getDb()`/settings helper — that would enqueue behind this transaction and
 * deadlock.
 */
export async function withTx<T>(
  fn: (db: Database) => Promise<T>,
): Promise<T> {
  const db = await getRawDb();
  return serialize(async () => {
    // The pooled connection may have been recycled by sqlx since load, dropping
    // busy_timeout (→ 0) and foreign_keys. Re-assert them before BEGIN so the
    // whole transaction has a lock timeout (no instant "database is locked") and
    // FK enforcement. foreign_keys is a no-op inside a transaction, so it must
    // precede BEGIN. This slot owns the single connection, so these PRAGMAs and
    // every statement below run on the same one.
    await ensureConnPragmas(db);
    await db.execute("BEGIN IMMEDIATE");
    try {
      const result = await fn(db);
      await db.execute("COMMIT");
      return result;
    } catch (err) {
      // Guard against "no transaction is active" when SQLite already rolled back
      // automatically (e.g. after a failed COMMIT or a deferred constraint error).
      try {
        await db.execute("ROLLBACK");
      } catch {
        // Swallow — the transaction is already gone; re-throw the original error.
      }
      throw err;
    }
  });
}
