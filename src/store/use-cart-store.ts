import { create } from "zustand";
import type { VariantDetail } from "@/lib/pos/types";
import { applyDiscount } from "@/lib/money";

export interface Discount {
  type: "percent" | "fixed";
  value: number; // percent (0-100) or fixed minor units
}

export interface CartLine {
  variant: VariantDetail;
  qty: number;
  unit_price_cents: number;
  discount: Discount | null;
  note?: string | null;
  /** Return mode only: original sale line (null = no receipt) + returnable cap. */
  sale_item_id?: number | null;
  max_qty?: number | null;
}

/** Snapshot used to restore a suspended/held cart. */
export interface CartSnapshot {
  lines: CartLine[];
  cartDiscount: Discount | null;
  customerId: number | null;
}

/** A returnable line loaded from an original sale (Return mode). */
export interface ReturnSaleLine {
  variant: VariantDetail;
  sale_item_id: number;
  qty: number;
  unit_price_cents: number;
}

interface CartState {
  lines: CartLine[];
  cartDiscount: Discount | null;
  /** Customer attached to the current transaction, if any. */
  customerId: number | null;
  /** True when the cart represents a return/refund rather than a sale. */
  returnMode: boolean;
  /** Original sale being refunded, when started from a receipt (else null). */
  originalSaleId: number | null;
  /** Add a variant (or bump qty if already in the cart, respecting any cap). */
  addVariant: (variant: VariantDetail) => void;
  setQty: (variantId: number, qty: number) => void;
  setLineDiscount: (variantId: number, discount: Discount | null) => void;
  setUnitPrice: (variantId: number, cents: number) => void;
  setLineNote: (variantId: number, note: string | null) => void;
  removeLine: (variantId: number) => void;
  setCartDiscount: (discount: Discount | null) => void;
  setCustomer: (customerId: number | null) => void;
  /** Start an empty walk-in return (keeps the attached customer for the guard). */
  startReturn: () => void;
  /** Load an original sale's returnable lines into the cart in return mode. */
  loadSaleForReturn: (saleId: number, lines: ReturnSaleLine[]) => void;
  /** Replace the whole cart (used when resuming a held sale). */
  load: (snapshot: CartSnapshot) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  cartDiscount: null,
  customerId: null,
  returnMode: false,
  originalSaleId: null,

  addVariant: (variant) =>
    set((s) => {
      const existing = s.lines.find((l) => l.variant.id === variant.id);
      if (existing) {
        const cap = existing.max_qty;
        const nextQty =
          cap != null ? Math.min(existing.qty + 1, cap) : existing.qty + 1;
        return {
          lines: s.lines.map((l) =>
            l.variant.id === variant.id ? { ...l, qty: nextQty } : l,
          ),
        };
      }
      return {
        lines: [
          ...s.lines,
          {
            variant,
            qty: 1,
            unit_price_cents: variant.effective_price_cents,
            discount: null,
            note: null,
            sale_item_id: null,
            max_qty: null,
          },
        ],
      };
    }),

  setQty: (variantId, qty) =>
    set((s) => ({
      lines:
        qty <= 0
          ? s.lines.filter((l) => l.variant.id !== variantId)
          : s.lines.map((l) => {
              if (l.variant.id !== variantId) return l;
              const capped = l.max_qty != null ? Math.min(qty, l.max_qty) : qty;
              return { ...l, qty: capped };
            }),
    })),

  setLineDiscount: (variantId, discount) =>
    set((s) => ({
      lines: s.lines.map((l) =>
        l.variant.id === variantId ? { ...l, discount } : l,
      ),
    })),

  setUnitPrice: (variantId, cents) =>
    set((s) => ({
      lines: s.lines.map((l) =>
        l.variant.id === variantId
          ? { ...l, unit_price_cents: Math.max(0, Math.round(cents)) }
          : l,
      ),
    })),

  setLineNote: (variantId, note) =>
    set((s) => ({
      lines: s.lines.map((l) =>
        l.variant.id === variantId ? { ...l, note } : l,
      ),
    })),

  removeLine: (variantId) =>
    set((s) => ({ lines: s.lines.filter((l) => l.variant.id !== variantId) })),

  setCartDiscount: (cartDiscount) => set({ cartDiscount }),
  setCustomer: (customerId) => set({ customerId }),

  startReturn: () =>
    set({
      lines: [],
      cartDiscount: null,
      returnMode: true,
      originalSaleId: null,
    }),

  loadSaleForReturn: (saleId, saleLines) =>
    set({
      returnMode: true,
      originalSaleId: saleId,
      cartDiscount: null,
      lines: saleLines.map((l) => ({
        variant: l.variant,
        qty: l.qty,
        unit_price_cents: l.unit_price_cents,
        discount: null,
        note: null,
        sale_item_id: l.sale_item_id,
        max_qty: l.qty,
      })),
    }),

  load: (snapshot) =>
    set({
      lines: snapshot.lines,
      cartDiscount: snapshot.cartDiscount,
      customerId: snapshot.customerId,
      returnMode: false,
      originalSaleId: null,
    }),
  clear: () =>
    set({
      lines: [],
      cartDiscount: null,
      customerId: null,
      returnMode: false,
      originalSaleId: null,
    }),
}));

// --- Pure total helpers (used by the UI and at checkout) -------------------

export function lineDiscountCents(line: CartLine): number {
  const base = line.qty * line.unit_price_cents;
  return line.discount ? applyDiscount(base, line.discount) : 0;
}

export function lineTotalCents(line: CartLine): number {
  return Math.max(0, line.qty * line.unit_price_cents - lineDiscountCents(line));
}

export function cartSubtotalCents(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + lineTotalCents(l), 0);
}

export function cartDiscountCents(
  lines: CartLine[],
  cartDiscount: Discount | null,
): number {
  if (!cartDiscount) return 0;
  return applyDiscount(cartSubtotalCents(lines), cartDiscount);
}

export function cartTotalCents(
  lines: CartLine[],
  cartDiscount: Discount | null,
): number {
  return Math.max(0, cartSubtotalCents(lines) - cartDiscountCents(lines, cartDiscount));
}
