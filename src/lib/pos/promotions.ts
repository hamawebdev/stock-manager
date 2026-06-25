/**
 * Promotions: discount rules applied automatically at checkout.
 *
 * This build evaluates the 'percent' and 'fixed' kinds, scoped to all items, a
 * category, or a single product. The pure `applyPromotions` engine returns
 * discount *amounts* only — it never touches stock or mutates the cart — so the
 * caller folds the result into the sale's cart-level discount.
 *
 * The 'bogo' and 'bundle' kinds (and the reserved get_qty / bundle_price_cents
 * columns) are intentionally left unhandled here; they can be added later
 * without a schema change.
 */
import { getDb } from "./db";
import type { CartLine } from "@/store/use-cart-store";
import { lineTotalCents } from "@/store/use-cart-store";

export type PromotionKind = "percent" | "fixed" | "bogo" | "bundle";
export type PromotionScope = "all" | "category" | "product";

export interface Promotion {
  id: number;
  name: string;
  kind: PromotionKind;
  percent: number | null;
  amount_cents: number | null;
  scope_type: PromotionScope;
  scope_id: number | null;
  min_qty: number;
  get_qty: number | null;
  bundle_price_cents: number | null;
  priority: number;
  active: number; // 0 | 1
  starts_at: string | null;
  ends_at: string | null;
  archived: number; // 0 | 1
  created_at: string;
}

export interface PromotionInput {
  name: string;
  kind: PromotionKind;
  percent?: number | null;
  amount_cents?: number | null;
  scope_type: PromotionScope;
  scope_id?: number | null;
  min_qty?: number;
  priority?: number;
  active?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
}

// --- CRUD ------------------------------------------------------------------

export async function listPromotions(): Promise<Promotion[]> {
  const db = await getDb();
  return db.select<Promotion[]>(
    `SELECT * FROM promotions WHERE archived = 0
       ORDER BY active DESC, priority DESC, name`,
  );
}

/** Active, in-date promotions — the set the checkout engine evaluates. */
export async function listActivePromotions(): Promise<Promotion[]> {
  const db = await getDb();
  return db.select<Promotion[]>(
    `SELECT * FROM promotions
       WHERE archived = 0 AND active = 1
         AND (starts_at IS NULL OR date(starts_at) <= date('now','localtime'))
         AND (ends_at   IS NULL OR date(ends_at)   >= date('now','localtime'))
       ORDER BY priority DESC, id`,
  );
}

export async function createPromotion(input: PromotionInput): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO promotions
       (name, kind, percent, amount_cents, scope_type, scope_id, min_qty,
        priority, active, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      input.name.trim(),
      input.kind,
      input.percent ?? null,
      input.amount_cents ?? null,
      input.scope_type,
      input.scope_id ?? null,
      input.min_qty ?? 1,
      input.priority ?? 0,
      input.active === false ? 0 : 1,
      input.starts_at ?? null,
      input.ends_at ?? null,
    ],
  );
  return res.lastInsertId as number;
}

export async function setPromotionActive(
  id: number,
  active: boolean,
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE promotions SET active = $1 WHERE id = $2", [
    active ? 1 : 0,
    id,
  ]);
}

/** Soft-delete so historical sales keep their context. */
export async function archivePromotion(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE promotions SET archived = 1 WHERE id = $1", [id]);
}

// --- Pure engine -----------------------------------------------------------

export interface AppliedPromotion {
  promoId: number;
  name: string;
  amountCents: number;
}

export interface PromotionResult {
  autoDiscountCents: number;
  applied: AppliedPromotion[];
}

function matchesScope(promo: Promotion, line: CartLine): boolean {
  if (promo.scope_type === "all") return true;
  if (promo.scope_type === "product")
    return line.variant.product_id === promo.scope_id;
  if (promo.scope_type === "category")
    return line.variant.category_id === promo.scope_id;
  return false;
}

function lineDiscountForPromo(promo: Promotion, line: CartLine): number {
  if (line.qty < (promo.min_qty || 1)) return 0;
  const base = lineTotalCents(line); // qty*price after any manual line discount
  if (promo.kind === "percent") {
    const pct = Math.max(0, Math.min(100, promo.percent ?? 0));
    return Math.round((base * pct) / 100);
  }
  if (promo.kind === "fixed") {
    const per = Math.max(0, promo.amount_cents ?? 0);
    return Math.min(base, per * line.qty);
  }
  // bogo / bundle reserved for a later build.
  return 0;
}

/**
 * Apply active promotions to a cart. Promotions are evaluated by priority
 * (highest first) and at most one promotion discounts a given line, so rules
 * never stack on the same item. Returns total discount + a per-promo breakdown
 * for display; the caller adds `autoDiscountCents` to the sale's cart discount.
 */
export function applyPromotions(
  lines: CartLine[],
  promos: Promotion[],
): PromotionResult {
  const claimed = new Set<number>(); // variant ids already discounted
  const applied: AppliedPromotion[] = [];
  const ordered = [...promos].sort((a, b) => b.priority - a.priority);

  for (const promo of ordered) {
    let amount = 0;
    for (const line of lines) {
      if (claimed.has(line.variant.id)) continue;
      if (!matchesScope(promo, line)) continue;
      const d = lineDiscountForPromo(promo, line);
      if (d > 0) {
        amount += d;
        claimed.add(line.variant.id);
      }
    }
    if (amount > 0) applied.push({ promoId: promo.id, name: promo.name, amountCents: amount });
  }

  const autoDiscountCents = applied.reduce((s, a) => s + a.amountCents, 0);
  return { autoDiscountCents, applied };
}
