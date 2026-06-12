/**
 * Barcode generation + validation. Two symbologies are supported (chosen in
 * Settings): EAN-13 (numeric retail standard, with check digit) and Code 128
 * (alphanumeric, can encode a SKU directly). Rendering to SVG is handled by the
 * <BarcodePreview> component via JsBarcode; this module only deals with values
 * and uniqueness against the `variants.barcode` column.
 */
import { getDb } from "./db";

export type BarcodeSymbology = "ean13" | "code128";

/** EAN-13 check digit for a 12-digit numeric base string. */
export function ean13CheckDigit(base12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = Number(base12[i]);
    sum += i % 2 === 0 ? n : n * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/** True when `value` is a structurally valid EAN-13 (13 digits, valid check). */
export function isValidEan13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  return ean13CheckDigit(value.slice(0, 12)) === Number(value[12]);
}

function randomDigits(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

/** True when no existing variant already uses this barcode. */
export async function barcodeUnique(value: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT 1 AS n FROM variants WHERE barcode = $1 LIMIT 1",
    [value],
  );
  return rows.length === 0;
}

/**
 * Generate a unique EAN-13. `prefix` should sit in the GS1 in-store range
 * (20-29) so generated codes never collide with real manufacturer GTINs.
 */
export async function generateEan13(prefix = "20"): Promise<string> {
  const p = (prefix.replace(/\D/g, "") || "20").slice(0, 6);
  for (let attempt = 0; attempt < 30; attempt++) {
    const base = (p + randomDigits(12)).slice(0, 12);
    const code = base + ean13CheckDigit(base);
    if (await barcodeUnique(code)) return code;
  }
  throw new Error("Could not generate a unique EAN-13 barcode");
}

/** Generate a unique Code 128 value, seeded from a SKU/string when provided. */
export async function generateCode128(seed?: string): Promise<string> {
  const cleanSeed = (seed ?? "").trim().toUpperCase().replace(/\s+/g, "-");
  if (cleanSeed && (await barcodeUnique(cleanSeed))) return cleanSeed;
  for (let attempt = 0; attempt < 30; attempt++) {
    const code = `${cleanSeed ? cleanSeed + "-" : "BC-"}${randomDigits(6)}`;
    if (await barcodeUnique(code)) return code;
  }
  throw new Error("Could not generate a unique Code 128 barcode");
}

export async function generateBarcode(
  symbology: BarcodeSymbology,
  opts: { prefix?: string; seed?: string } = {},
): Promise<string> {
  return symbology === "ean13"
    ? generateEan13(opts.prefix)
    : generateCode128(opts.seed);
}
