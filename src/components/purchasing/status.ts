import type { PurchaseStatus } from "@/lib/pos/types";

/** Map a purchase status to a Badge variant for consistent colouring. */
export function statusBadgeVariant(
  status: PurchaseStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "confirmed":
      return "default";
    case "cancelled":
      return "destructive";
    default:
      return "secondary"; // draft
  }
}
