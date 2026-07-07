/**
 * Expense attachment storage. Receipt / invoice bytes are written to disk under
 * the app-config dir (next to `app.db`, so they travel with backups); only the
 * relative path is recorded in `expense_attachments`. Mirrors the product-image
 * pipeline in `src/lib/images.ts`.
 *
 * All Tauri APIs are imported lazily so this module also type-checks/builds in a
 * plain-browser context (where the file pipeline is simply unavailable).
 */
import {
  insertAttachment,
  listAttachments,
  deleteAttachmentRow,
  type ExpenseAttachment,
} from "./pos/expenses";

const ROOT = "expense-attachments"; // relative to the app-config base dir

async function fs() {
  return import("@tauri-apps/plugin-fs");
}
async function pathApi() {
  return import("@tauri-apps/api/path");
}

function extFromName(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return (m?.[1] ?? "bin").toLowerCase();
}

export { listAttachments };
export type { ExpenseAttachment };

/** Resolve a stored relative path to an openable asset URL (for preview). */
export async function attachmentSrc(relPath: string): Promise<string> {
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  const { appConfigDir, join } = await pathApi();
  const abs = await join(await appConfigDir(), ROOT, relPath);
  return convertFileSrc(abs);
}

/** Absolute on-disk path, for opening the file in the OS default viewer. */
export async function attachmentAbsPath(relPath: string): Promise<string> {
  const { appConfigDir, join } = await pathApi();
  return join(await appConfigDir(), ROOT, relPath);
}

/** Persist file bytes for an expense and record the row. */
export async function saveAttachment(
  expenseId: number,
  bytes: Uint8Array,
  fileName: string,
  mime: string | null = null,
): Promise<ExpenseAttachment> {
  const { mkdir, writeFile, BaseDirectory } = await fs();
  const { join } = await pathApi();

  const dir = await join(ROOT, String(expenseId));
  await mkdir(dir, { baseDir: BaseDirectory.AppConfig, recursive: true });

  const ext = extFromName(fileName);
  const rel = await join(String(expenseId), `${crypto.randomUUID()}.${ext}`);
  await writeFile(await join(ROOT, rel), bytes, {
    baseDir: BaseDirectory.AppConfig,
  });

  return insertAttachment(expenseId, rel, fileName, mime, bytes.byteLength);
}

/** Remove an attachment's file (best-effort) and its DB row. */
export async function deleteAttachment(
  attachment: ExpenseAttachment,
): Promise<void> {
  try {
    const { remove, BaseDirectory } = await fs();
    const { join } = await pathApi();
    await remove(await join(ROOT, attachment.path), {
      baseDir: BaseDirectory.AppConfig,
    });
  } catch {
    // File may already be gone; the DB row removal below is what matters.
  }
  await deleteAttachmentRow(attachment.id);
}

/** Delete every attachment file for an expense (rows cascade with the expense). */
export async function deleteAttachmentFiles(
  expenseId: number,
): Promise<void> {
  try {
    const { remove, BaseDirectory } = await fs();
    const { join } = await pathApi();
    await remove(await join(ROOT, String(expenseId)), {
      baseDir: BaseDirectory.AppConfig,
      recursive: true,
    });
  } catch {
    // No attachments dir for this expense, or already removed.
  }
}

/** Read a browser File into bytes for `saveAttachment`. */
export async function fileToBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export interface PickedFile {
  name: string;
  bytes: Uint8Array;
  mime: string | null;
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  bmp: "image/bmp",
};

function guessMime(name: string): string | null {
  return MIME_BY_EXT[extFromName(name)] ?? null;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Prompt the user to pick one or more receipt/invoice files and read their
 * bytes via the standard `<input type=file>` File API. This works inside the
 * Tauri webview without needing a broad `fs` scope (plugin-fs is restricted to
 * the app dirs), matching how product images are uploaded elsewhere.
 */
export async function pickAttachmentFiles(): Promise<PickedFile[]> {
  return new Promise<PickedFile[]>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".pdf,image/*";
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      const picked = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          bytes: await fileToBytes(f),
          mime: f.type || guessMime(f.name),
        })),
      );
      resolve(picked);
    };
    input.oncancel = () => resolve([]);
    input.click();
  });
}

/** Open a stored attachment in the OS default application. */
export async function openAttachment(relPath: string): Promise<void> {
  if (!isTauri()) {
    window.open(await attachmentSrc(relPath), "_blank");
    return;
  }
  const { openPath } = await import("@tauri-apps/plugin-opener");
  await openPath(await attachmentAbsPath(relPath));
}
