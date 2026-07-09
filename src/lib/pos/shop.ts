/**
 * Shop branding assets — the company logo printed on Studio documents. The image
 * bytes live under <app-config>/shop-assets/ (so they travel with DB backups);
 * only the relative path is stored, in the `shop_logo` setting. Mirrors the
 * product-image pipeline in `@/lib/images`. All Tauri APIs are imported lazily so
 * this module also builds in a plain-browser context.
 */
import { getSetting, setSetting } from "./settings";

const ROOT = "shop-assets"; // relative to the app-config base dir

async function fs() {
  return import("@tauri-apps/api/fs");
}
async function pathApi() {
  return import("@tauri-apps/api/path");
}

function extFromName(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return (m?.[1] ?? "png").toLowerCase();
}

function mimeFor(ext: string): string {
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

/** Persist new logo bytes and record the relative path in `shop_logo`. */
export async function saveShopLogo(
  bytes: Uint8Array,
  fileName: string,
): Promise<string> {
  const { createDir, writeBinaryFile, BaseDirectory } = await fs();
  const { join } = await pathApi();
  await createDir(ROOT, { dir: BaseDirectory.AppConfig, recursive: true });
  const rel = `logo-${crypto.randomUUID()}.${extFromName(fileName)}`;
  await writeBinaryFile(await join(ROOT, rel), bytes, {
    dir: BaseDirectory.AppConfig,
  });
  await setSetting("shop_logo", rel);
  return rel;
}

/** Resolve the stored logo to an <img>-loadable asset URL (for live UI). */
export async function shopLogoSrc(relPath: string): Promise<string | null> {
  if (!relPath) return null;
  const { convertFileSrc } = await import("@tauri-apps/api/tauri");
  const { appConfigDir, join } = await pathApi();
  return convertFileSrc(await join(await appConfigDir(), ROOT, relPath));
}

/** Read the logo as a base64 data URL — reliable for print iframes and jsPDF. */
export async function shopLogoDataUrl(relPath: string): Promise<string | null> {
  if (!relPath) return null;
  try {
    const { readBinaryFile, BaseDirectory } = await fs();
    const { join } = await pathApi();
    const bytes = await readBinaryFile(await join(ROOT, relPath), {
      dir: BaseDirectory.AppConfig,
    });
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return `data:${mimeFor(extFromName(relPath))};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

/** Remove the stored logo file and clear the setting. */
export async function removeShopLogo(): Promise<void> {
  const rel = await getSetting("shop_logo");
  if (rel) {
    try {
      const { removeFile, BaseDirectory } = await fs();
      const { join } = await pathApi();
      await removeFile(await join(ROOT, rel), { dir: BaseDirectory.AppConfig });
    } catch {
      // File may already be gone; clearing the setting below is what matters.
    }
  }
  await setSetting("shop_logo", "");
}
