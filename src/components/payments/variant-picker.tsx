/**
 * Variant picker: when a product card is tapped, pick the exact size/color
 * variant to add to the cart. Shows per-variant stock so the cashier never
 * sells an out-of-stock combination by accident.
 */
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useProductVariants, useCurrency } from "@/lib/pos/queries";
import { useCartStore } from "@/store/use-cart-store";
import { formatMoney } from "@/lib/money";
import { variantLabel } from "@/lib/pos/labels";
import type { VariantDetail } from "@/lib/pos/types";

interface Props {
  productId: number | null;
  productName: string;
  onPick: (variant: VariantDetail) => void;
  onClose: () => void;
}

export function VariantPicker({ productId, productName, onPick, onClose }: Props) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const variants = useProductVariants(productId);
  // In return mode an out-of-stock variant is exactly what a customer is
  // bringing back, so it must stay selectable (the refund restocks it). Selling
  // an out-of-stock combination is still blocked.
  const returnMode = useCartStore((s) => s.returnMode);
  const rows = (variants.data ?? []).filter((v) => v.archived === 0);

  return (
    <Dialog open={productId != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{productName}</DialogTitle>
        </DialogHeader>
        {variants.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {t("payments.variantPicker.noVariants")}
          </p>
        ) : (
          <div className="grid max-h-80 grid-cols-1 gap-2 overflow-auto">
            {rows.map((v) => {
              const out = v.stock <= 0;
              return (
                <button
                  key={v.id}
                  disabled={out && !returnMode}
                  onClick={() => onPick(v)}
                  className="hover:bg-accent flex items-center justify-between rounded-md border px-3 py-2 text-start text-sm disabled:opacity-50"
                >
                  <span className="flex items-center gap-2">
                    {v.color_hex && (
                      <span
                        className="size-4 rounded-full border"
                        style={{ backgroundColor: v.color_hex }}
                      />
                    )}
                    <span>{variantLabel(v) || v.sku}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant={out ? "destructive" : "success"}>
                      {v.stock}
                    </Badge>
                    {formatMoney(v.effective_price_cents, currency)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
