import Database from "@tauri-apps/plugin-sql";

/** Narrow view of the plugin-sql handle: only the methods the app uses. */
export type Db = Pick<Database, "execute" | "select">;

let loadPromise: Promise<Database> | null = null;

/**
 * Open the database once and apply connection PRAGMAs. Memoized as a *promise*
 * so concurrent first callers share a single `Database.load` (no double open).
 */
function loadRaw(): Promise<Database> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const db = await Database.load("sqlite:app.db");
      await db.execute("PRAGMA journal_mode = WAL");
      await db.execute("PRAGMA busy_timeout = 5000");
      await db.execute("PRAGMA foreign_keys = ON");
      return db;
    })();
  }
  return loadPromise;
}

/**
 * Serialize every database operation through a single-flight FIFO queue.
 *
 * plugin-sql backs the one JS `Database` with a sqlx connection pool (default
 * 10 connections) and acquires an arbitrary connection per `execute`/`select`.
 * Client-driven `BEGIN`/`COMMIT` are only safe if every statement lands on the
 * same physical connection — which holds iff no two operations are ever in
 * flight at once. This mutex guarantees exactly that, so the pool never opens a
 * second connection and transactions cannot self-deadlock (SQLITE_BUSY).
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
 * Re-assert the per-connection PRAGMAs on whatever pooled connection this call
 * lands on. plugin-sql runs each statement against the sqlx pool, which recycles
 * connections (idle_timeout 10m / max_lifetime 30m); a recycled connection loses
 * `busy_timeout` (reverts to 0, so a transient lock fails instantly with
 * "database is locked") and `foreign_keys` (constraints silently stop being
 * enforced). `journal_mode = WAL` is persisted in the database file, so it never
 * needs re-asserting. Must run inside a `serialize` slot so it targets the same
 * connection as the write that follows.
 */
export async function ensureConnPragmas(
  db: Pick<Database, "execute">,
): Promise<void> {
  await db.execute("PRAGMA busy_timeout = 5000");
  await db.execute("PRAGMA foreign_keys = ON");
}

/**
 * The shared database handle for all standalone reads and writes. Every
 * `execute`/`select` runs through the serialization queue (see `serialize`).
 */
export async function getDb(): Promise<Db> {
  const db = await loadRaw();
  return {
    execute: (query, bindValues) =>
      serialize(async () => {
        // Guard standalone writes against a pool connection that was recycled
        // (and so reverted to busy_timeout=0 / foreign_keys=off) since load.
        await ensureConnPragmas(db);
        return db.execute(query, bindValues);
      }),
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
