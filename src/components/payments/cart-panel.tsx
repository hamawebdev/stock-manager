/**
 * Cart panel: the current sale's line items with quantity, line discount,
 * permission-gated price override, an optional note, and remove. Reuses the
 * shared cart store and its pure total helpers.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Minus, Plus, Trash2, ShoppingCart, Pencil, StickyNote, Undo2, Package } from "lucide-react";
import { toast } from "sonner";
import {
  useCartStore,
  lineTotalCents,
  type CartLine,
} from "@/store/use-cart-store";
import { DiscountPopover } from "@/components/sell/discount-popover";
import { useCurrency, useProductImages } from "@/lib/pos/queries";
import { formatMoney, parseMoney } from "@/lib/money";
import { variantLabel } from "@/lib/pos/labels";
import { productImageSrc } from "@/lib/images";
import { useManagerGate } from "./manager-gate";

export function CartPanel() {
  const { t } = useTranslation();
  const currency = useCurrency();
  const lines = useCartStore((s) => s.lines);
  const setQty = useCartStore((s) => s.setQty);
  const setLineDiscount = useCartStore((s) => s.setLineDiscount);
  const removeLine = useCartStore((s) => s.removeLine);
  const returnMode = useCartStore((s) => s.returnMode);
  const originalSaleId = useCartStore((s) => s.originalSaleId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {returnMode && (
        <div className="bg-destructive/10 text-destructive flex shrink-0 items-center gap-2 px-3 py-2 text-xs font-medium">
          <Undo2 className="size-3.5" />
          {originalSaleId != null
            ? t("payments.returns.returningSale")
            : t("payments.returns.returnModeBanner")}
        </div>
      )}

      {lines.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 py-10">
          <ShoppingCart className="size-8" />
          <p className="text-sm">
            {returnMode
              ? t("payments.returns.emptyHint")
              : t("payments.cart.empty")}
          </p>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          <ul className="divide-y">
            {lines.map((l) => (
              <li key={l.variant.id} className="flex gap-2.5 p-3">
                <CartLineThumb
                  productId={l.variant.product_id}
                  name={l.variant.product_name}
                />

                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {/* Title row: product + sku · variant · stock, with line total */}
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {l.variant.product_name}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {[
                          l.variant.sku,
                          variantLabel(l.variant),
                          `${t("payments.cart.col.stock")} ${l.variant.stock}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {l.note && (
                        <p className="text-muted-foreground truncate text-xs italic">
                          “{l.note}”
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-semibold">
                      {formatMoney(lineTotalCents(l), currency)}
                    </span>
                  </div>

                  {/* Controls row: qty stepper · unit price · line actions */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => setQty(l.variant.id, l.qty - 1)}
                      >
                        <Minus />
                      </Button>
                      <span className="w-7 text-center text-sm">{l.qty}</span>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        disabled={l.max_qty != null && l.qty >= l.max_qty}
                        onClick={() => setQty(l.variant.id, l.qty + 1)}
                      >
                        <Plus />
                      </Button>
                      {returnMode && l.max_qty != null && (
                        <span className="text-muted-foreground text-xs">
                          / {l.max_qty}
                        </span>
                      )}
                    </div>

                    <span className="text-muted-foreground text-xs">
                      × {formatMoney(l.unit_price_cents, currency)}
                    </span>

                    <div className="ms-auto flex items-center gap-0.5">
                      {!returnMode && (
                        <>
                          <PriceEditor line={l} />
                          <NotePopover line={l} />
                          <DiscountPopover
                            value={l.discount}
                            onChange={(d) => setLineDiscount(l.variant.id, d)}
                            label="—"
                          />
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeLine(l.variant.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}

/**
 * Small product thumbnail for a cart line. Variants don't carry an image path,
 * so we resolve the owning product's primary image (cached per product) and fall
 * back to a placeholder icon when there's no image.
 */
function CartLineThumb({ productId, name }: { productId: number; name: string }) {
  const imgs = useProductImages(productId);
  const path = imgs.data?.[0]?.path ?? null; // listProductImages orders primary first
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    // No image → leave `src` null (the placeholder renders). Resolving the asset
    // URL is async, so the setState runs after an await, not synchronously here.
    if (!path) return;
    let alive = true;
    productImageSrc(path)
      .then((url) => alive && setSrc(url))
      .catch(() => { });
    return () => {
      alive = false;
    };
  }, [path]);

  return (
    <div className="bg-muted size-9 shrink-0 overflow-hidden rounded-md">
      {src ? (
        <img src={src} alt={name} className="size-full object-cover" />
      ) : (
        <div className="text-muted-foreground flex size-full items-center justify-center">
          <Package className="size-4" />
        </div>
      )}
    </div>
  );
}

/** Permission-gated unit-price override. */
function PriceEditor({ line }: { line: CartLine }) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const setUnitPrice = useCartStore((s) => s.setUnitPrice);
  const { requireManager } = useManagerGate();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");

  async function openEditor() {
    const ok = await requireManager(t("payments.cart.overridePriceReason"));
    if (!ok) return;
    setRaw(formatMoney(line.unit_price_cents, { ...currency, symbol: "" }));
    setOpen(true);
  }

  function apply() {
    const cents = parseMoney(raw, currency.decimals);
    if (cents == null) {
      toast.error(t("payments.cart.invalidPrice"));
      return;
    }
    setUnitPrice(line.variant.id, cents);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={(o) => (o ? openEditor() : setOpen(false))}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" title={t("payments.cart.editPrice")}>
          <Pencil />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48">
        <div className="grid gap-2">
          <p className="text-sm font-medium">{t("payments.cart.unitPrice")}</p>
          <Input
            inputMode="decimal"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            autoFocus
          />
          <Button size="sm" onClick={apply}>
            {t("common.apply")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotePopover({ line }: { line: CartLine }) {
  const { t } = useTranslation();
  const setLineNote = useCartStore((s) => s.setLineNote);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={line.note ? "secondary" : "ghost"}
          size="icon-sm"
          title={t("payments.cart.lineNote")}
        >
          <StickyNote />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56">
        <div className="grid gap-2">
          <p className="text-sm font-medium">{t("common.notes")}</p>
          <Textarea
            rows={3}
            defaultValue={line.note ?? ""}
            placeholder={t("payments.cart.notePlaceholder")}
            onChange={(e) => setLineNote(line.variant.id, e.target.value || null)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
