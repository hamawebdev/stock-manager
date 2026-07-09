use tauri_plugin_sql::{Migration, MigrationKind};

/// A serializable error type for fallible Tauri commands.
/// The frontend receives the `message` string.
#[derive(Debug, thiserror::Error, serde::Serialize)]
#[error("{message}")]
pub struct CommandError {
    pub message: String,
}

impl CommandError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Example of a fallible command with a typed error.
#[tauri::command]
fn safe_divide(a: f64, b: f64) -> Result<f64, CommandError> {
    if b == 0.0 {
        return Err(CommandError::new("cannot divide by zero"));
    }
    Ok(a / b)
}

/// Send a raw byte stream to a printer. All ESC/POS formatting is built on the
/// frontend (`src/lib/pos/escpos.ts`); this command is a thin transport:
/// - `transport = "usb"`     → append the bytes to a device/spool path
///   (e.g. `/dev/usb/lp0`, a Windows share, or a printer queue path)
/// - `transport = "network"` → open a TCP socket to `address` ("ip:port",
///   port 9100 for most network thermal printers) and write the bytes.
#[tauri::command]
fn print_raw(transport: String, address: String, data: Vec<u8>) -> Result<(), CommandError> {
    use std::io::Write;
    match transport.as_str() {
        "network" => {
            let mut stream = std::net::TcpStream::connect(&address)
                .map_err(|e| CommandError::new(format!("connect {address}: {e}")))?;
            stream
                .write_all(&data)
                .map_err(|e| CommandError::new(format!("write {address}: {e}")))?;
        }
        "usb" => {
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .append(true)
                .open(&address)
                .map_err(|e| CommandError::new(format!("open {address}: {e}")))?;
            file.write_all(&data)
                .map_err(|e| CommandError::new(format!("write {address}: {e}")))?;
        }
        other => return Err(CommandError::new(format!("unknown transport: {other}"))),
    }
    Ok(())
}

/// Write raw bytes to a user-chosen path (used by Excel / PDF export, which
/// build the file in the frontend and save it to a location picked via the
/// dialog plugin). Mirrors the `print_raw` transport pattern.
#[tauri::command]
fn write_bytes(path: String, data: Vec<u8>) -> Result<(), CommandError> {
    std::fs::write(&path, &data)
        .map_err(|e| CommandError::new(format!("write {path}: {e}")))?;
    Ok(())
}

/// Resolve the path of the bundled SQLite database (`sqlite:app.db`), which
/// tauri-plugin-sql stores in the app config directory.
fn db_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, CommandError> {
    let dir = app
        .path_resolver()
        .app_config_dir()
        .ok_or_else(|| CommandError::new("could not resolve app config dir"))?;
    Ok(dir.join("app.db"))
}

/// Copy the live database to a user-chosen file (local backup).
#[tauri::command]
fn db_backup(app: tauri::AppHandle, dest: String) -> Result<(), CommandError> {
    let src = db_path(&app)?;
    std::fs::copy(&src, &dest)
        .map_err(|e| CommandError::new(format!("backup to {dest}: {e}")))?;
    Ok(())
}

/// Overwrite the live database with a backup file. The app must be restarted
/// afterwards so the SQL plugin reopens the restored file.
#[tauri::command]
fn db_restore(app: tauri::AppHandle, src: String) -> Result<(), CommandError> {
    let dest = db_path(&app)?;
    std::fs::copy(&src, &dest)
        .map_err(|e| CommandError::new(format!("restore from {src}: {e}")))?;
    Ok(())
}

/// Replace tauri-plugin-sql's default connection pool (which allows up to 10
/// SQLite connections) with a single-connection pool.
///
/// The frontend drives transactions by hand — `withTx` runs
/// `BEGIN IMMEDIATE` … `COMMIT` as *separate* `execute` calls. The plugin routes
/// each call to an arbitrary connection from the pool, so with more than one
/// pooled connection a transaction's statements can land on different physical
/// connections: `BEGIN IMMEDIATE` takes the write lock on one, a later statement
/// runs on another and blocks on that lock, and after `busy_timeout` it fails
/// with "database is locked". Pinning the pool to exactly one connection makes
/// that split impossible.
///
/// Called once from the frontend right after `Database.load`, so the plugin has
/// already created its pool and run migrations on it; this swaps in the pinned
/// pool afterwards (the previous pool is dropped). Connection reaping is disabled
/// so the single connection is never replaced mid-transaction.
///
/// Note (v1): the v1 SQL plugin stores instances as
/// `DbInstances(Mutex<HashMap<String, Pool<Sqlite>>>)` — a plain `Pool`, not a
/// `DbPool` enum, behind a tokio `Mutex` — hence `.lock()` and a bare `pool`.
#[tauri::command]
async fn db_use_single_connection(
    app: tauri::AppHandle,
    db_instances: tauri::State<'_, tauri_plugin_sql::DbInstances>,
) -> Result<(), CommandError> {
    use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
    use std::time::Duration;

    let path = db_path(&app)?;
    let opts = SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(false)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(5))
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .min_connections(1)
        .idle_timeout(Option::<Duration>::None)
        .max_lifetime(Option::<Duration>::None)
        .connect_with(opts)
        .await
        .map_err(|e| CommandError::new(format!("open single-connection pool: {e}")))?;

    // Swap the pinned pool in under the same key the frontend uses
    // (`sqlite:app.db`); dropping the returned value releases the old pool.
    db_instances
        .0
        .lock()
        .await
        .insert("sqlite:app.db".to_string(), pool);
    Ok(())
}

/// SQLite migrations applied to `sqlite:app.db` on startup.
///
/// Conventions for the POS schema (migration 2):
/// - All monetary values are stored as INTEGER **minor units** (e.g. cents /
///   centimes) to avoid floating-point rounding errors. The frontend formats
///   them for display.
/// - `inventory_movements` is an append-only ledger: every stock change (sale,
///   return, receiving, manual adjustment, stock-take) writes a signed `delta`
///   row, so a variant's stock history is fully auditable. `variants.stock` is
///   the materialized running total, updated in the same transaction.
fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: "CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
              );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_pos_schema",
            sql: include_str!("../migrations/002_pos_schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "inventory_refactor",
            sql: include_str!("../migrations/003_inventory_refactor.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "payment_center",
            sql: include_str!("../migrations/004_payment_center.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "cash_session_notes",
            sql: include_str!("../migrations/005_cash_session_notes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "purchasing",
            sql: include_str!("../migrations/006_purchasing.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "studio_billing",
            sql: include_str!("../migrations/007_studio_billing.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "expenses",
            sql: include_str!("../migrations/008_expenses.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "cogs",
            sql: include_str!("../migrations/009_cogs.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

pub fn run() {
    use tauri::Manager;

    tauri::Builder::default()
        // `single_instance` must be registered first.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:app.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            greet,
            safe_divide,
            print_raw,
            write_bytes,
            db_backup,
            db_restore,
            db_use_single_connection
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
