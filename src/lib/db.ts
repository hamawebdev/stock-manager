import Database from "tauri-plugin-sql-api";
import { invoke } from "@tauri-apps/api/tauri";

/** Narrow view of the plugin-sql handle: only the methods the app uses. */
export type Db = Pick<Database, "execute" | "select">;

let loadPromise: Promise<Database> | null = null;

/**
 * Open the database once, then pin it to a single connection. Memoized as a
 * *promise* so concurrent first callers share a single open (no double load).
 *
 * `db_use_single_connection` (Rust) replaces tauri-plugin-sql's default pool
 * (up to 10 SQLite connections) with a single-connection pool, *after* the
 * plugin has run migrations on its pool. Pinning to one connection is what makes
 * the hand-rolled `BEGIN`/`COMMIT` transactions in `withTx` safe: every
 * statement necessarily lands on the same physical connection, so a transaction
 * can never split across connections and deadlock ("database is locked"). WAL /
 * busy_timeout / foreign_keys are applied to that connection at connect time by
 * the pinned pool, so no PRAGMAs are needed here.
 */
function loadRaw(): Promise<Database> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const db = await Database.load("sqlite:app.db");
      await invoke("db_use_single_connection");
      return db;
    })();
  }
  return loadPromise;
}

/**
 * Serialize every database operation through a single-flight FIFO queue.
 *
 * The database is pinned to one physical connection (see `loadRaw`), but
 * plugin-sql acquires+releases that connection per `execute`/`select`. Without
 * serialization another operation could acquire the connection *between* a
 * transaction's `BEGIN` and `COMMIT` (running its statement inside — or aborting
 * — that transaction), or two ops could contend for the single connection. This
 * mutex guarantees no two operations are ever in flight at once, so hand-rolled
 * transactions stay atomic and cannot self-deadlock (SQLITE_BUSY).
 */
let tail: Promise<unknown> = Promise.resolve();

export function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task); // run after the previous op settles (ok or error)
  tail = run.then(
    () => {},
    () => {},
  ); // advance the chain; isolate this op's rejection from the next
  return run;
}

/** Raw pooled handle — for `withTx` only, which owns serialization itself. */
export function getRawDb(): Promise<Database> {
  return loadRaw();
}

/**
 * The shared database handle for all standalone reads and writes. Every
 * `execute`/`select` runs through the serialization queue (see `serialize`).
 */
export async function getDb(): Promise<Db> {
  const db = await loadRaw();
  return {
    execute: (query, bindValues) =>
      serialize(() => db.execute(query, bindValues)),
    select<T>(query: string, bindValues?: unknown[]): Promise<T> {
      return serialize(() => db.select<T>(query, bindValues));
    },
  };
}

export interface Item {
  id: number;
  name: string;
  created_at: string;
}

export async function listItems(): Promise<Item[]> {
  const conn = await getDb();
  return conn.select<Item[]>("SELECT * FROM items ORDER BY id DESC");
}

export async function addItem(name: string): Promise<void> {
  const conn = await getDb();
  await conn.execute("INSERT INTO items (name) VALUES ($1)", [name]);
}

export async function deleteItem(id: number): Promise<void> {
  const conn = await getDb();
  await conn.execute("DELETE FROM items WHERE id = $1", [id]);
}
