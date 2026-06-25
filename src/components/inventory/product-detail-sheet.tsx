import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Tag } from "lucide-react";
import { toast } from "sonner";
import {
  useProductVariants,
  useUpdateVariant,
  useCurrency,
} from "@/lib/pos/queries";
import type { ProductSummary } from "@/lib/pos/catalog";
import type { VariantDetail } from "@/lib/pos/types";
import { formatMoney, parseMoney } from "@/lib/money";
import { printLabel } from "@/lib/pos/hardware";
import { VariantMatrixDialog } from "./variant-matrix-dialog";
import { AdjustStockDialog } from "./adjust-stock-dialog";

interface Props {
  product: ProductSummary | null;
  onOpenChange: (open: boolean) => void;
  onEditProduct: (product: ProductSummary) => void;
}

export function ProductDetailSheet({
  product,
  onOpenChange,
  onEditProduct,
}: Props) {
  const { t } = useTranslation();
  const open = !!product;
  const variants = useProductVariants(product?.id ?? null);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<VariantDetail | null>(null);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {product && (
          <>
            <SheetHeader>
              <div className="flex items-center justify-between gap-2 pe-6">
                <div>
                  <SheetTitle>{product.name}</SheetTitle>
                  <SheetDescription>
                    {product.category_name ?? t("inventory.uncategorized")}
                    {product.brand ? ` · ${product.brand}` : ""}
                  </SheetDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEditProduct(product)}
                >
                  <Pencil /> {t("common.edit")}
                </Button>
              </div>
            </SheetHeader>

            <div className="flex items-center justify-between px-4">
              <h3 className="text-sm font-medium">
                {t("inventory.variantsCount", { count: variants.data?.length ?? 0 })}
              </h3>
              <Button size="sm" onClick={() => setMatrixOpen(true)}>
                <Plus /> {t("inventory.addVariants")}
              </Button>
            </div>

            <div className="px-4 pb-6">
              {variants.data && variants.data.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("inventory.size")}</TableHead>
                      <TableHead>{t("inventory.color")}</TableHead>
                      <TableHead>{t("inventory.barcode")}</TableHead>
                      <TableHead className="text-end">{t("common.price")}</TableHead>
                      <TableHead className="text-end">{t("inventory.stock")}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {variants.data.map((v) => (
                      <VariantRow
                        key={v.id}
                        variant={v}
                        productId={product.id}
                        onAdjust={() => setAdjustTarget(v)}
                      />
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  {t("inventory.noVariantsHint")}
                </p>
              )}
            </div>

            <VariantMatrixDialog
              open={matrixOpen}
              onOpenChange={setMatrixOpen}
              productId={product.id}
              productName={product.name}
            />
            <AdjustStockDialog
              open={!!adjustTarget}
              onOpenChange={(o) => !o && setAdjustTarget(null)}
              productId={product.id}
              variant={adjustTarget}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** One editable variant row: barcode and price commit on blur if changed. */
function VariantRow({
  variant,
  productId,
  onAdjust,
}: {
  variant: VariantDetail;
  productId: number;
  onAdjust: () => void;
}) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const update = useUpdateVariant(productId);
  const [barcode, setBarcode] = useState(variant.barcode ?? "");
  const [price, setPrice] = useState(
    formatMoney(variant.effective_price_cents, { ...currency, symbol: "" }),
  );

  async function commitBarcode() {
    const next = barcode.trim() || null;
    if (next === (variant.barcode ?? null)) return;
    try {
      await update.mutateAsync({ id: variant.id, fields: { barcode: next } });
    } catch (err) {
      toast.error(t("inventory.barcodeNotSaved", { error: String(err) }));
      setBarcode(variant.barcode ?? "");
    }
  }

  async function commitPrice() {
    const cents = parseMoney(price || "0", currency.decimals);
    if (cents == null) {
      toast.error(t("inventory.invalidPrice"));
      setPrice(formatMoney(variant.effective_price_cents, { ...currency, symbol: "" }));
      return;
    }
    if (cents === variant.price_cents) return;
    try {
      await update.mutateAsync({ id: variant.id, fields: { price_cents: cents } });
    } catch (err) {
      toast.error(t("inventory.priceNotSaved", { error: String(err) }));
    }
  }

  async function handlePrintLabel() {
    if (!variant.barcode) {
      toast.error(t("inventory.noBarcodeToPrint"));
      return;
    }
    try {
      await printLabel({
        title: variant.product_name,
        variant: [variant.size_name, variant.color_name].filter(Boolean).join(" / "),
        barcode: variant.barcode,
        price_cents: variant.effective_price_cents,
        currency,
      });
      toast.success(t("inventory.labelSent"));
    } catch (err) {
      toast.error(t("inventory.labelFailed", { error: String(err) }));
    }
  }

  return (
    <TableRow>
      <TableCell>{variant.size_name ?? "—"}</TableCell>
      <TableCell>
        <span className="flex items-center gap-1.5">
          {variant.color_hex && (
            <span
              className="size-3 rounded-full border"
              style={{ backgroundColor: variant.color_hex }}
            />
          )}
          {variant.color_name ?? "—"}
        </span>
      </TableCell>
      <TableCell>
        <Input
          className="h-8 w-32 font-mono text-xs"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          onBlur={commitBarcode}
        />
      </TableCell>
      <TableCell className="text-end">
        <Input
          className="h-8 w-20 text-end"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={commitPrice}
        />
      </TableCell>
      <TableCell className="text-end">
        <Badge variant={variant.stock <= 0 ? "destructive" : "secondary"}>
          {variant.stock}
        </Badge>
      </TableCell>
      <TableCell className="text-end whitespace-nowrap">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handlePrintLabel}
          title={t("inventory.printLabel")}
        >
          <Tag />
        </Button>
        <Button variant="ghost" size="sm" onClick={onAdjust}>
          {t("inventory.adjust")}
        </Button>
      </TableCell>
    </TableRow>
  );
}
