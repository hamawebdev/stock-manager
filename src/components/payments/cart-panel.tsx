/**
 * Cart panel: the current sale's line items with quantity, line discount,
 * permission-gated price override, an optional note, and remove. Reuses the
 * shared cart store and its pure total helpers.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { cn } from "@/lib/utils";
import { usePosUiStore } from "@/store/use-pos-ui-store";
import { useManagerGate } from "./manager-gate";

/** Collapse/fade duration for the row removal animation (ms). */
const REMOVE_ANIM_MS = 180;

/**
 * A line counts as "modified" once the cashier has touched its price, added a
 * discount, or attached a note — removing it then warrants a quick confirm so a
 * stray Delete doesn't silently wipe deliberate work. Fresh lines remove
 * instantly. (Return lines are never treated as modified — see requestRemove.)
 */
function isLineModified(l: CartLine): boolean {
  return (
    l.discount != null ||
    !!l.note ||
    l.unit_price_cents !== l.variant.effective_price_cents
  );
}

export function CartPanel() {
  const { t } = useTranslation();
  const currency = useCurrency();
  const lines = useCartStore((s) => s.lines);
  const setQty = useCartStore((s) => s.setQty);
  const setLineDiscount = useCartStore((s) => s.setLineDiscount);
  const removeLine = useCartStore((s) => s.removeLine);
  const returnMode = useCartStore((s) => s.returnMode);
  const originalSaleId = useCartStore((s) => s.originalSaleId);

  // Which line is selected (for keyboard nav / qty / edit / Delete and the
  // highlight) lives in the shared POS-UI store so the global hotkey handler
  // and this panel stay in sync. Local state tracks lines mid-exit-animation
  // and any modified line pending a remove confirm.
  const selectedId = usePosUiStore((s) => s.selectedLineId);
  const setSelectedId = usePosUiStore((s) => s.setSelectedLineId);
  const [removingIds, setRemovingIds] = useState<Set<number>>(new Set());
  const [confirmLine, setConfirmLine] = useState<CartLine | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Drop a stale selection when its line leaves the cart (clear/resume/return
  // reload), and keep the selected line scrolled into view during keyboard nav.
  useEffect(() => {
    if (selectedId != null && !lines.some((l) => l.variant.id === selectedId)) {
      setSelectedId(null);
      return;
    }
    if (selectedId != null) {
      listRef.current
        ?.querySelector(`[data-cart-line="${selectedId}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedId, lines, setSelectedId]);

  // Actually remove a line: play the collapse animation, then commit to the
  // store. Totals, Change, Amount Paid and the Charge button all derive from
  // `lines` via the store, so they recalculate the instant we commit — nothing
  // to recompute here. Selection hops to a neighbour so Delete can repeat.
  const performRemove = useCallback(
    (variantId: number) => {
      setRemovingIds((prev) => {
        if (prev.has(variantId)) return prev; // already leaving
        return new Set(prev).add(variantId);
      });

      const idx = lines.findIndex((l) => l.variant.id === variantId);
      const rest = lines.filter((l) => l.variant.id !== variantId);
      const nextSelected =
        rest.length === 0 ? null : (rest[idx] ?? rest[rest.length - 1]).variant.id;

      window.setTimeout(() => {
        removeLine(variantId);
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(variantId);
          return next;
        });
        if (usePosUiStore.getState().selectedLineId === variantId) {
          setSelectedId(nextSelected);
        }
        toast.success(t("payments.cart.itemRemoved"));
      }, REMOVE_ANIM_MS);
    },
    [lines, removeLine, setSelectedId, t],
  );

  // Entry point for every removal (button click or keyboard). Modified sale
  // lines get a lightweight confirm first; plain lines and return lines go
  // straight through.
  const requestRemove = useCallback(
    (line: CartLine) => {
      if (removingIds.has(line.variant.id)) return;
      if (!returnMode && isLineModified(line)) {
        setConfirmLine(line);
        return;
      }
      performRemove(line.variant.id);
    },
    [removingIds, returnMode, performRemove],
  );

  // Delete/Backspace removes the selected line. Ignored while the user is
  // typing in a field (input/textarea/contenteditable) so editing prices,
  // notes or the search box is never hijacked. The global barcode scanner
  // isn't affected — it only reacts to printable keys, not Delete/Backspace.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (selectedId == null) return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        return;
      }
      const line = lines.find((l) => l.variant.id === selectedId);
      if (!line) return;
      e.preventDefault();
      requestRemove(line);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId, lines, requestRemove]);

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
          <ul className="divide-y" ref={listRef}>
            {lines.map((l) => (
              <li
                key={l.variant.id}
                data-cart-line={l.variant.id}
                onClick={() => setSelectedId(l.variant.id)}
                aria-selected={selectedId === l.variant.id}
                className={cn(
                  "grid transition-all ease-out",
                  removingIds.has(l.variant.id)
                    ? "grid-rows-[0fr] opacity-0"
                    : "grid-rows-[1fr] opacity-100",
                )}
                style={{ transitionDuration: `${REMOVE_ANIM_MS}ms` }}
              >
              <div
                className={cn(
                  "flex gap-2.5 overflow-hidden p-3",
                  selectedId === l.variant.id && "bg-accent/60",
                )}
              >
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

                  {/* Controls row: qty stepper · unit price · line actions.
                      Wraps when the cart column is too narrow to hold the qty
                      stepper, price and every action button on one line, so the
                      trailing actions (incl. remove) drop to a second line
                      instead of overflowing under the line's overflow-hidden. */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
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
                          <span data-line-action="discount">
                            <DiscountPopover
                              value={l.discount}
                              onChange={(d) => setLineDiscount(l.variant.id, d)}
                              label="—"
                            />
                          </span>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={t("payments.cart.removeItem")}
                        title={t("payments.cart.removeItem")}
                        onClick={(e) => {
                          e.stopPropagation();
                          requestRemove(l);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}

      {/* Confirm removing a line the cashier deliberately edited. */}
      <AlertDialog
        open={confirmLine != null}
        onOpenChange={(o) => !o && setConfirmLine(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("payments.cart.removeModifiedTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmLine
                ? t("payments.cart.removeModifiedBody", {
                    name: confirmLine.variant.product_name,
                  })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (confirmLine) performRemove(confirmLine.variant.id);
                setConfirmLine(null);
              }}
            >
              {t("common.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
        <Button
          data-line-action="price"
          variant="ghost"
          size="icon-sm"
          title={t("payments.cart.editPrice")}
        >
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
          data-line-action="note"
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
