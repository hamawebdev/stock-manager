import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search, Trash2, Plus, Minus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import {
  useCartStore,
  cartSubtotalCents,
  cartDiscountCents,
  cartTotalCents,
  lineTotalCents,
  lineDiscountCents,
} from "@/store/use-cart-store";
import { useBarcodeScanner } from "@/lib/pos/use-scanner";
import { findVariantByBarcode, searchVariants } from "@/lib/pos/catalog";
import { useCompleteSale, useCurrency, useSettings } from "@/lib/pos/queries";
import { currencyFromSettings } from "@/lib/pos/settings";
import { formatMoney } from "@/lib/money";
import { printReceipt, openCashDrawer, type ReceiptData } from "@/lib/pos/hardware";
import { DiscountPopover } from "@/components/sell/discount-popover";
import { PaymentDialog } from "@/components/sell/payment-dialog";
import type { VariantDetail } from "@/lib/pos/types";

function variantLabel(v: VariantDetail): string {
  return [v.size_name, v.color_name].filter(Boolean).join(" / ");
}

export default function SellPage() {
  const currency = useCurrency();
  const settings = useSettings();
  const completeSale = useCompleteSale();

  const lines = useCartStore((s) => s.lines);
  const cartDiscount = useCartStore((s) => s.cartDiscount);
  const addVariant = useCartStore((s) => s.addVariant);
  const setQty = useCartStore((s) => s.setQty);
  const setLineDiscount = useCartStore((s) => s.setLineDiscount);
  const removeLine = useCartStore((s) => s.removeLine);
  const setCartDiscount = useCartStore((s) => s.setCartDiscount);
  const clear = useCartStore((s) => s.clear);

  const [query, setQuery] = useState("");
  const [payOpen, setPayOpen] = useState(false);

  const subtotal = cartSubtotalCents(lines);
  const discount = cartDiscountCents(lines, cartDiscount);
  const total = cartTotalCents(lines, cartDiscount);

  // Manual search results (also reachable by typing a barcode + Enter).
  const results = useQuery({
    queryKey: ["variant-search", query],
    queryFn: () => searchVariants(query, 12),
    enabled: query.trim().length > 0,
  });

  // Keyboard-wedge scanner: look up the barcode and add to the cart.
  useBarcodeScanner(async (code) => {
    const v = await findVariantByBarcode(code);
    if (v) {
      addVariant(v);
      toast.success(`Added ${v.product_name} ${variantLabel(v)}`);
    } else {
      toast.error(`No item with barcode ${code}`);
    }
  }, { enabled: !payOpen });

  function addAndClear(v: VariantDetail) {
    addVariant(v);
    setQuery("");
  }

  async function handleConfirm(tenderedCents: number) {
    const snapshot = lines.map((l) => ({
      variant_id: l.variant.id,
      description: `${l.variant.product_name} ${variantLabel(l.variant)}`.trim(),
      qty: l.qty,
      unit_price_cents: l.unit_price_cents,
      line_discount_cents: lineDiscountCents(l),
      line_total_cents: lineTotalCents(l),
    }));
    try {
      const sale = await completeSale.mutateAsync({
        lines: snapshot.map((s) => ({
          variant_id: s.variant_id,
          description: s.description,
          qty: s.qty,
          unit_price_cents: s.unit_price_cents,
          line_discount_cents: s.line_discount_cents,
        })),
        cart_discount_cents: discount,
        cash_tendered_cents: tenderedCents,
      });

      // Print receipt + kick drawer (both honor the owner's hardware config).
      const recCurrency = settings.data
        ? currencyFromSettings(settings.data)
        : currency;
      const receipt: ReceiptData = {
        shop_name: settings.data?.shop_name ?? "My Shop",
        header: settings.data?.receipt_header,
        footer: settings.data?.receipt_footer,
        code: sale.code,
        datetime: new Date().toLocaleString(),
        lines: snapshot.map((s) => ({
          description: s.description,
          qty: s.qty,
          unit_price_cents: s.unit_price_cents,
          line_total_cents: s.line_total_cents,
        })),
        subtotal_cents: sale.subtotal_cents,
        discount_cents: sale.cart_discount_cents,
        total_cents: sale.total_cents,
        tendered_cents: sale.cash_tendered_cents,
        change_cents: sale.change_cents,
        currency: recCurrency,
      };
      try {
        await printReceipt(receipt);
        await openCashDrawer();
      } catch (err) {
        toast.error(`Sale saved, but printing failed: ${String(err)}`);
      }

      toast.success(
        `Sale ${sale.code} · change ${formatMoney(sale.change_cents, currency)}`,
      );
      clear();
      setPayOpen(false);
    } catch (err) {
      toast.error(`Could not complete sale: ${String(err)}`);
    }
  }

  return (
    <div className="grid h-full grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_360px]">
      {/* Item entry + search */}
      <div className="flex min-h-0 flex-col gap-3">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            placeholder="Scan a barcode or search by name / SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query.trim() && (
            <div className="bg-popover absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border shadow-md">
              {results.data?.length ? (
                results.data.map((v) => (
                  <button
                    key={v.id}
                    className="hover:bg-accent flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                    onClick={() => addAndClear(v)}
                  >
                    <span>
                      {v.product_name}{" "}
                      <span className="text-muted-foreground">
                        {variantLabel(v)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant={v.stock <= 0 ? "destructive" : "secondary"}>
                        {v.stock}
                      </Badge>
                      {formatMoney(v.effective_price_cents, currency)}
                    </span>
                  </button>
                ))
              ) : (
                <p className="text-muted-foreground px-3 py-2 text-sm">
                  {results.isFetching ? "Searching…" : "No matches."}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Cart */}
        <Card className="flex min-h-0 flex-1 flex-col">
          <CardContent className="flex-1 overflow-auto p-0">
            {lines.length === 0 ? (
              <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 py-16">
                <ShoppingCart className="size-8" />
                <p className="text-sm">Scan or search to add items.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {lines.map((l) => (
                  <li key={l.variant.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {l.variant.product_name}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {variantLabel(l.variant)} ·{" "}
                        {formatMoney(l.unit_price_cents, currency)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => setQty(l.variant.id, l.qty - 1)}
                      >
                        <Minus />
                      </Button>
                      <span className="w-8 text-center text-sm">{l.qty}</span>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => setQty(l.variant.id, l.qty + 1)}
                      >
                        <Plus />
                      </Button>
                    </div>

                    <DiscountPopover
                      value={l.discount}
                      onChange={(d) => setLineDiscount(l.variant.id, d)}
                      label="—"
                    />

                    <span className="w-20 text-right text-sm font-medium">
                      {formatMoney(lineTotalCents(l), currency)}
                    </span>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeLine(l.variant.id)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Totals + checkout */}
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>Sale</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 space-y-3">
          <Row label="Subtotal" value={formatMoney(subtotal, currency)} />
          <div className="flex items-center justify-between">
            <DiscountPopover
              value={cartDiscount}
              onChange={setCartDiscount}
              label="Cart discount"
            />
            <span className="text-sm">
              {discount > 0 ? `-${formatMoney(discount, currency)}` : "—"}
            </span>
          </div>
          <div className="border-t pt-3">
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold">Total</span>
              <span className="text-2xl font-bold">
                {formatMoney(total, currency)}
              </span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-2">
          <Button
            className="h-12 w-full text-base"
            disabled={lines.length === 0}
            onClick={() => setPayOpen(true)}
          >
            Charge {formatMoney(total, currency)}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={lines.length === 0}
            onClick={clear}
          >
            Clear cart
          </Button>
        </CardFooter>
      </Card>

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        totalCents={total}
        busy={completeSale.isPending}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
