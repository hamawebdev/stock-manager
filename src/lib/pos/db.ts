import type Database from "@tauri-apps/plugin-sql";
import { getDb } from "@/lib/db";

export { getDb };

/**
 * Run `fn` inside a SQLite transaction, committing on success and rolling
 * back on any error. plugin-sql has no transaction object, so we drive
 * BEGIN/COMMIT/ROLLBACK explicitly on the shared connection.
 */
export async function withTx<T>(
  fn: (db: Database) => Promise<T>,
): Promise<T> {
  const db = await getDb();
  await db.execute("BEGIN");
  try {
    const result = await fn(db);
    await db.execute("COMMIT");
    return result;
  } catch (err) {
    await db.execute("ROLLBACK");
    throw err;
  }
}
