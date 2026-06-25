import type { VariantDetail } from "./types";

/** "M / Black" — the size/color label shown next to a product name. */
export function variantLabel(v: Pick<VariantDetail, "size_name" | "color_name">): string {
  return [v.size_name, v.color_name].filter(Boolean).join(" / ");
}

/** Full one-line description used on receipts and cart lines. */
export function variantDescription(v: VariantDetail): string {
  return `${v.product_name} ${variantLabel(v)}`.trim();
}
