import type Database from "@tauri-apps/plugin-sql";
import { getDb } from "@/lib/db";

export { getDb };

/**
 * Run `fn` inside a SQLite transaction, committing on success and rolling
 * back on any error. plugin-sql has no transaction object, so we drive
 * BEGIN/COMMIT/ROLLBACK explicitly on the shared connection.
 *
 * Uses BEGIN IMMEDIATE to acquire a RESERVED lock immediately, preventing
 * "cannot commit - no transaction is active" errors when concurrent operations
 * interfere with the transaction state on a shared connection.
 */
export async function withTx<T>(
  fn: (db: Database) => Promise<T>,
): Promise<T> {
  const db = await getDb();
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
}
