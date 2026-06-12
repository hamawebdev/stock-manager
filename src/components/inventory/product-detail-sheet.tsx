import { useState } from "react";
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
              <div className="flex items-center justify-between gap-2 pr-6">
                <div>
                  <SheetTitle>{product.name}</SheetTitle>
                  <SheetDescription>
                    {product.category_name ?? "Uncategorized"}
                    {product.brand ? ` · ${product.brand}` : ""}
                  </SheetDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEditProduct(product)}
                >
                  <Pencil /> Edit
                </Button>
              </div>
            </SheetHeader>

            <div className="flex items-center justify-between px-4">
              <h3 className="text-sm font-medium">
                Variants ({variants.data?.length ?? 0})
              </h3>
              <Button size="sm" onClick={() => setMatrixOpen(true)}>
                <Plus /> Add variants
              </Button>
            </div>

            <div className="px-4 pb-6">
              {variants.data && variants.data.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Size</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
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
                  No variants yet. Click “Add variants” to generate the
                  size/color grid.
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
      toast.error(`Barcode not saved: ${String(err)}`);
      setBarcode(variant.barcode ?? "");
    }
  }

  async function commitPrice() {
    const cents = parseMoney(price || "0", currency.decimals);
    if (cents == null) {
      toast.error("Invalid price");
      setPrice(formatMoney(variant.effective_price_cents, { ...currency, symbol: "" }));
      return;
    }
    if (cents === variant.price_cents) return;
    try {
      await update.mutateAsync({ id: variant.id, fields: { price_cents: cents } });
    } catch (err) {
      toast.error(`Price not saved: ${String(err)}`);
    }
  }

  async function handlePrintLabel() {
    if (!variant.barcode) {
      toast.error("This variant has no barcode to print");
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
      toast.success("Label sent to printer");
    } catch (err) {
      toast.error(`Label print failed: ${String(err)}`);
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
      <TableCell className="text-right">
        <Input
          className="h-8 w-20 text-right"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={commitPrice}
        />
      </TableCell>
      <TableCell className="text-right">
        <Badge variant={variant.stock <= 0 ? "destructive" : "secondary"}>
          {variant.stock}
        </Badge>
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handlePrintLabel}
          title="Print label"
        >
          <Tag />
        </Button>
        <Button variant="ghost" size="sm" onClick={onAdjust}>
          Adjust
        </Button>
      </TableCell>
    </TableRow>
  );
}
