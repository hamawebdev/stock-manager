/**
 * French number-to-words for the "Arrêté la présente à la somme de …" line on
 * Algerian commercial documents (Facture, Bon de Commande). Handles the French
 * spelling quirks (soixante-dix, quatre-vingts, et-un, invariable "mille").
 *
 * Verified against the reference screenshots:
 *   1666 → "mille six cent soixante-six"
 *   4713 → "quatre mille sept cent treize"
 */

const UNITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit",
  "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "dix-sept", "dix-huit", "dix-neuf",
];

const TENS: Record<number, string> = {
  2: "vingt",
  3: "trente",
  4: "quarante",
  5: "cinquante",
  6: "soixante",
  8: "quatre-vingt",
};

function below100(n: number): string {
  if (n < 20) return UNITS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  // 70-79 and 90-99 build on soixante / quatre-vingt + a "teen".
  if (t === 7 || t === 9) {
    const base = t === 7 ? "soixante" : "quatre-vingt";
    if (t === 7 && u === 1) return "soixante et onze";
    return `${base}-${UNITS[10 + u]}`;
  }
  const tens = TENS[t];
  if (u === 0) return t === 8 ? "quatre-vingts" : tens;
  if (u === 1 && t !== 8) return `${tens} et un`;
  return `${tens}-${UNITS[u]}`;
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h === 0) return below100(r);
  if (r === 0) return h === 1 ? "cent" : `${UNITS[h]} cents`;
  const hundred = h === 1 ? "cent" : `${UNITS[h]} cent`;
  return `${hundred} ${below100(r)}`;
}

function below1000000(n: number): string {
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  if (th === 0) return below1000(r);
  const thousand = th === 1 ? "mille" : `${below1000(th)} mille`; // "mille" invariable
  return r === 0 ? thousand : `${thousand} ${below1000(r)}`;
}

/** Spell a non-negative integer in French (up to the milliards range). */
export function numberToFrenchWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "zéro";

  const milliards = Math.floor(n / 1_000_000_000);
  n %= 1_000_000_000;
  const millions = Math.floor(n / 1_000_000);
  n %= 1_000_000;

  const parts: string[] = [];
  if (milliards) {
    parts.push(`${milliards === 1 ? "un" : below1000(milliards)} milliard${milliards > 1 ? "s" : ""}`);
  }
  if (millions) {
    parts.push(`${millions === 1 ? "un" : below1000(millions)} million${millions > 1 ? "s" : ""}`);
  }
  if (n) parts.push(below1000000(n));
  return parts.join(" ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Spell a money amount (minor units) as a French sentence, e.g.
 * `4713_93 → "Quatre mille sept cent treize Dinars Algériens et quatre-vingt-treize centimes"`.
 */
export function amountToFrenchWords(
  cents: number,
  decimals: number,
  currencyName = "Dinars Algériens",
  subName = "centimes",
): string {
  const factor = 10 ** decimals;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / factor);
  const frac = abs % factor;
  let out = `${capitalize(numberToFrenchWords(whole))} ${currencyName}`;
  if (frac > 0) out += ` et ${numberToFrenchWords(frac)} ${subName}`;
  return out;
}
