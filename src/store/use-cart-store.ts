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
}

interface CartState {
  lines: CartLine[];
  cartDiscount: Discount | null;
  /** Add a variant (or bump qty if already in the cart). */
  addVariant: (variant: VariantDetail) => void;
  setQty: (variantId: number, qty: number) => void;
  setLineDiscount: (variantId: number, discount: Discount | null) => void;
  removeLine: (variantId: number) => void;
  setCartDiscount: (discount: Discount | null) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  cartDiscount: null,

  addVariant: (variant) =>
    set((s) => {
      const existing = s.lines.find((l) => l.variant.id === variant.id);
      if (existing) {
        return {
          lines: s.lines.map((l) =>
            l.variant.id === variant.id ? { ...l, qty: l.qty + 1 } : l,
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
          },
        ],
      };
    }),

  setQty: (variantId, qty) =>
    set((s) => ({
      lines:
        qty <= 0
          ? s.lines.filter((l) => l.variant.id !== variantId)
          : s.lines.map((l) =>
              l.variant.id === variantId ? { ...l, qty } : l,
            ),
    })),

  setLineDiscount: (variantId, discount) =>
    set((s) => ({
      lines: s.lines.map((l) =>
        l.variant.id === variantId ? { ...l, discount } : l,
      ),
    })),

  removeLine: (variantId) =>
    set((s) => ({ lines: s.lines.filter((l) => l.variant.id !== variantId) })),

  setCartDiscount: (cartDiscount) => set({ cartDiscount }),
  clear: () => set({ lines: [], cartDiscount: null }),
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
