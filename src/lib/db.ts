import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

/**
 * Returns a lazily-initialized connection to the bundled SQLite database.
 * Migrations are defined in `src-tauri/src/lib.rs` and run automatically on load.
 */
export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:app.db");
  }
  return db;
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
