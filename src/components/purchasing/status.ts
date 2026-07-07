import type { PurchaseStatus } from "@/lib/pos/types";

/**
 * Map a purchase status to a Badge variant for consistent, at-a-glance
 * colouring: confirmed → green, cancelled → red, draft → neutral gray.
 */
export function statusBadgeVariant(
  status: PurchaseStatus,
): "soft-success" | "soft-destructive" | "secondary" {
  switch (status) {
    case "confirmed":
      return "soft-success";
    case "cancelled":
      return "soft-destructive";
    default:
      return "secondary"; // draft
  }
}
