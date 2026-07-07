/**
 * Payment processing panel (Sell mode). Shows the live total with automatic
 * promotions + manual discounts, an optional TVA breakdown, a payment-mode
 * selector, an on-screen numeric keypad, and one-click confirmation. A named
 * customer may settle on credit (paid below the total → Reste Dû on their
 * account); walk-ins must pay in full. Reuses the cart store, the promotions
 * engine, and the existing sale/receipt/drawer pipeline.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Delete, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  useCartStore,
  cartSubtotalCents,
  cartDiscountCents,
  lineDiscountCents,
  lineTotalCents,
} from "@/store/use-cart-store";
import { DiscountPopover } from "@/components/sell/discount-popover";
import {
  useCompleteSale,
  useProcessReturn,
  useActivePromotions,
  useCurrency,
  useSettings,
} from "@/lib/pos/queries";
import { usePosUiStore } from "@/store/use-pos-ui-store";
import { useManagerGate } from "./manager-gate";
import { applyPromotions } from "@/lib/pos/promotions";
import { getCustomer } from "@/lib/pos/customers";
import { computeSaleTotals } from "@/lib/pos/sales";
import {
  CUSTOMER_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS_FR,
} from "@/lib/pos/payment-methods";
import { currencyFromSettings } from "@/lib/pos/settings";
import { formatMoney, parseMoney } from "@/lib/money";
import { intlLocale } from "@/lib/i18n";
import { variantDescription } from "@/lib/pos/labels";
import { printReceipt, openCashDrawer, type ReceiptData } from "@/lib/pos/hardware";
import type { CustomerPaymentMethod } from "@/lib/pos/types";

interface Props {
  /** Open the customer sheet to attach/replace the customer. */
  onOpenCustomer: () => void;
  /** Called after a sale completes (e.g. to refresh insights). */
  onCompleted?: (saleCode: string) => void;
}

/** Round a total up to common cash denominations for quick-tender buttons. */
function quickAmounts(total: number, factor: number): number[] {
  const steps = [1, 2, 5, 10, 20].map((d) => d * factor);
  const set = new Set<number>([total]);
  for (const step of steps) set.add(Math.ceil(total / step) * step);
  return [...set].filter((v) => v >= total).sort((a, b) => a - b).slice(0, 6);
}

export function PaymentPanel({ onOpenCustomer, onCompleted }: Props) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const settings = useSettings();
  const completeSale = useCompleteSale();
  const processReturn = useProcessReturn();
  const activePromos = useActivePromotions();
  const { requireManager } = useManagerGate();

  const lines = useCartStore((s) => s.lines);
  const cartDiscount = useCartStore((s) => s.cartDiscount);
  const setCartDiscount = useCartStore((s) => s.setCartDiscount);
  const customerId = useCartStore((s) => s.customerId);
  const setCustomer = useCartStore((s) => s.setCustomer);
  const clear = useCartStore((s) => s.clear);
  const returnMode = useCartStore((s) => s.returnMode);
  const originalSaleId = useCartStore((s) => s.originalSaleId);

  const [paidInput, setPaidInput] = useState("");
  const [method, setMethod] = useState<CustomerPaymentMethod>("especes");
  const [tvaEnabled, setTvaEnabled] = useState(false);
  const [tvaRate, setTvaRate] = useState<number | null>(null);
  const [guardOpen, setGuardOpen] = useState(false);

  const factor = 10 ** currency.decimals;
  const subtotal = cartSubtotalCents(lines);
  const manualDiscount = cartDiscountCents(lines, cartDiscount);
  const promo = useMemo(
    () => applyPromotions(lines, activePromos.data ?? []),
    [lines, activePromos.data],
  );
  // Promotions + the manual cart discount both fold into the sale's cart discount.
  const totalDiscount = Math.min(subtotal, manualDiscount + promo.autoDiscountCents);
  const total = Math.max(0, subtotal - totalDiscount); // TTC

  const rate = tvaRate ?? settings.data?.default_tva_rate ?? 19;
  const { subtotal_ht_cents, tva_cents } = computeSaleTotals(total, tvaEnabled, rate);

  // A blank amount means "pay the exact total" (the common case). Cash may be
  // tendered above the total (→ change); a named customer may pay below it (→ credit).
  const typedPaid = parseMoney(paidInput || "", currency.decimals);
  const paidCents = typedPaid == null ? total : Math.max(0, typedPaid);
  const isCash = method === "especes";
  const change = isCash ? Math.max(0, paidCents - total) : 0;
  const settled = Math.min(paidCents, total);
  const resteDu = Math.max(0, total - settled);
  const isCredit = resteDu > 0;
  const enough =
    lines.length > 0 && (paidCents >= total || customerId != null);

  // Customer chip
  const customer = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => getCustomer(customerId as number),
    enabled: customerId != null,
  });

  function pushDigit(d: string) {
    setPaidInput((p) => {
      if (d === "." && p.includes(".")) return p;
      return (p + d).replace(/^0+(?=\d)/, "");
    });
  }

  async function confirm() {
    if (!enough) return;
    const snapshot = lines.map((l) => ({
      variant_id: l.variant.id,
      description: variantDescription(l.variant),
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
        cart_discount_cents: totalDiscount,
        tva_enabled: tvaEnabled,
        tva_rate: rate,
        payment_method: method,
        paid_cents: paidCents,
        cash_tendered_cents: paidCents,
        customer_id: customerId,
      });

      const recCurrency = settings.data
        ? currencyFromSettings(settings.data)
        : currency;
      const receipt: ReceiptData = {
        shop_name: settings.data?.shop_name ?? "My Shop",
        header: settings.data?.receipt_header,
        footer: settings.data?.receipt_footer,
        code: sale.code,
        datetime: new Date().toLocaleString(intlLocale()),
        lines: snapshot.map((s) => ({
          description: s.description,
          qty: s.qty,
          unit_price_cents: s.unit_price_cents,
          line_total_cents: s.line_total_cents,
        })),
        subtotal_cents: subtotal,
        discount_cents: totalDiscount,
        total_cents: sale.total_ttc_cents,
        tendered_cents: paidCents,
        change_cents: sale.change_cents,
        currency: recCurrency,
      };
      try {
        await printReceipt(receipt);
        if (isCash) await openCashDrawer();
      } catch (err) {
        toast.error(t("payments.pay.printFailed", { error: String(err) }));
      }

      toast.success(
        isCredit
          ? t("payments.pay.saleCompleteCredit", {
            code: sale.code,
            remaining: formatMoney(resteDu, currency),
          })
          : t("payments.pay.saleComplete", {
            code: sale.code,
            change: formatMoney(sale.change_cents, currency),
          }),
      );
      clear();
      setPaidInput("");
      onCompleted?.(sale.code);
    } catch (err) {
      toast.error(t("payments.pay.couldNotComplete", { error: String(err) }));
    }
  }

  async function confirmRefund() {
    if (lines.length === 0) return;
    // A return for a named customer must be tied to a specific original sale;
    // route ad-hoc named-customer returns through their purchase history.
    if (customerId != null && originalSaleId == null) {
      setGuardOpen(true);
      return;
    }
    if (!(await requireManager(t("payments.returns.processReason")))) return;
    try {
      const res = await processReturn.mutateAsync({
        original_sale_id: originalSaleId,
        inItems: lines.map((l) => ({
          variant_id: l.variant.id,
          sale_item_id: l.sale_item_id ?? null,
          description: variantDescription(l.variant),
          qty: l.qty,
          unit_price_cents: l.unit_price_cents,
          restock: true,
        })),
      });
      toast.success(
        t("payments.returns.refundDone", {
          amount: formatMoney(res.net_cash_cents, currency),
          code: res.code,
        }),
      );
      clear();
      setPaidInput("");
    } catch (err) {
      toast.error(t("payments.returns.couldNotProcess", { error: String(err) }));
    }
  }

  // Expose the primary settle action (Charge in sell mode, Refund in return
  // mode) to the global F2 shortcut. A ref keeps the registered function stable
  // while always calling the latest closure, so the listener never goes stale.
  const submitRef = useRef<() => void>(() => {});
  useEffect(() => {
    submitRef.current = returnMode ? confirmRefund : confirm;
  });
  const setSubmit = usePosUiStore((s) => s.setSubmit);
  useEffect(() => {
    const fn = () => submitRef.current();
    setSubmit(fn);
    return () => setSubmit(null);
  }, [setSubmit]);

  // Return mode: refund-only settlement (single button, no tender/keypad).
  if (returnMode) {
    return (
      <div className="flex h-full flex-col">
        {/* Scrollable summary — the Refund button below stays pinned. */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pe-1">
          {customer.data && (
            <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <Badge variant="secondary">{t("payments.pay.customer")}</Badge>
                <span className="font-medium">{customer.data.name}</span>
              </span>
              <button
                onClick={() => setCustomer(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={t("common.remove")}
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          <div className="space-y-2 rounded-md border p-3">
            <Row
              label={t("payments.returns.returnedValue")}
              value={formatMoney(subtotal, currency)}
            />
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-base font-semibold">
                {t("payments.returns.refundToCustomer")}
              </span>
              <span className="text-2xl font-bold">
                {formatMoney(subtotal, currency)}
              </span>
            </div>
          </div>

        </div>

        {/* Pinned footer — refund action, always in view. */}
        <div className="mt-3 grid shrink-0 gap-2 border-t pt-3">
          <Button variant="outline" onClick={() => clear()}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            className="h-14 text-base"
            disabled={lines.length === 0 || processReturn.isPending}
            onClick={confirmRefund}
          >
            {lines.length === 0
              ? t("payments.returns.addOneItem")
              : t("payments.returns.refundButton", {
                amount: formatMoney(subtotal, currency),
              })}
          </Button>
        </div>

        <AlertDialog open={guardOpen} onOpenChange={setGuardOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("payments.returns.notAllowedTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("payments.returns.notAllowedBody")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setGuardOpen(false)}>
                {t("common.ok")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col"
      onKeyDown={(e) => {
        if (e.key === "Enter") confirm();
      }}
    >
      {/* Scrollable controls — totals/quick-amounts/keypad scroll here so the
          Charge button below stays pinned and always visible. */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pe-1">
        {/* Customer chip */}
        <button
          onClick={onOpenCustomer}
          className="hover:bg-accent flex w-full items-center justify-between rounded-md border px-3 py-2 text-start text-sm"
        >
          {customer.data ? (
            <span className="flex items-center gap-2">
              <Badge variant="secondary">{t("payments.pay.customer")}</Badge>
              <span className="font-medium">{customer.data.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-2">
              <UserPlus className="size-4" /> {t("payments.pay.attachCustomer")}
            </span>
          )}
          {customer.data && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setCustomer(null);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </span>
          )}
        </button>

        {/* Payment mode + TVA */}
        <div className="flex items-center gap-2">
          <Select value={method} onValueChange={(v) => setMethod(v as CustomerPaymentMethod)}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CUSTOMER_PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {PAYMENT_METHOD_LABELS_FR[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t("payments.pay.tva")}</span>
            <Switch checked={tvaEnabled} onCheckedChange={setTvaEnabled} />
            {tvaEnabled && (
              <Input
                inputMode="numeric"
                value={String(rate)}
                onChange={(e) => setTvaRate(Number(e.target.value) || 0)}
                className="h-7 w-14"
                aria-label={t("payments.pay.tvaRate")}
              />
            )}
          </label>
        </div>

        {/* Totals */}
        <div className="space-y-2 rounded-md border p-3">
          <Row label={t("payments.pay.subtotal")} value={formatMoney(subtotal, currency)} />
          {promo.applied.map((a) => (
            <Row
              key={a.promoId}
              label={t("payments.pay.promoLabel", { name: a.name })}
              value={`-${formatMoney(a.amountCents, currency)}`}
              muted
            />
          ))}
          <div className="flex items-center justify-between">
            <DiscountPopover
              value={cartDiscount}
              onChange={setCartDiscount}
              label={t("payments.pay.cartDiscount")}
            />
            <span className="text-sm">
              {manualDiscount > 0 ? `-${formatMoney(manualDiscount, currency)}` : "—"}
            </span>
          </div>
          {tvaEnabled && (
            <>
              <Row label={t("payments.pay.totalHt")} value={formatMoney(subtotal_ht_cents, currency)} muted />
              <Row label={`${t("payments.pay.tva")} ${rate}%`} value={formatMoney(tva_cents, currency)} muted />
            </>
          )}
          <div className="flex items-center justify-between border-t pt-2">
            <span className="text-base font-semibold">{t("payments.pay.totalDue")}</span>
            <span className="text-2xl font-bold">{formatMoney(total, currency)}</span>
          </div>
          {isCredit ? (
            <div className="flex items-center justify-between">
              <span className="text-destructive text-sm font-medium">{t("payments.pay.remaining")}</span>
              <span className="text-destructive text-lg font-semibold">
                {formatMoney(resteDu, currency)}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">{t("payments.pay.change")}</span>
              <span className="text-lg font-semibold">
                {formatMoney(enough ? change : 0, currency)}
              </span>
            </div>
          )}
        </div>

        {/* Quick amounts */}
        <div className="flex flex-wrap gap-1.5">
          {quickAmounts(total, factor).map((amt) => (
            <Button
              key={amt}
              variant="outline"
              size="sm"
              disabled={lines.length === 0}
              onClick={() => setPaidInput(formatMoney(amt, { ...currency, symbol: "" }))}
            >
              {formatMoney(amt, currency)}
            </Button>
          ))}
        </div>

        {/* Numeric keypad */}
        <div className="grid grid-cols-3 gap-1.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <Button
              key={d}
              variant="outline"
              className="h-12 text-lg"
              onClick={() => pushDigit(d)}
            >
              {d}
            </Button>
          ))}
          {currency.decimals > 0 ? (
            <Button variant="outline" className="h-12 text-lg" onClick={() => pushDigit(".")}>
              .
            </Button>
          ) : (
            <Button variant="outline" className="h-12 text-lg" onClick={() => pushDigit("00")}>
              00
            </Button>
          )}
          <Button variant="outline" className="h-12 text-lg" onClick={() => pushDigit("0")}>
            0
          </Button>
          <Button
            variant="outline"
            className="h-12"
            onClick={() => setPaidInput((p) => p.slice(0, -1))}
          >
            <Delete />
          </Button>
        </div>

      </div>

      {/* Pinned footer — amount paid + Charge, always in view. */}
      <div className="mt-3 grid shrink-0 gap-2 border-t pt-3">
        <div className="bg-muted/50 flex items-center justify-between rounded-md px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t("payments.pay.amountPaid")}</span>
          <span className="font-medium">{formatMoney(paidCents, currency)}</span>
        </div>
        <Button
          className="h-14 text-base"
          disabled={!enough || completeSale.isPending}
          onClick={confirm}
        >
          {lines.length === 0
            ? t("payments.pay.cartEmpty")
            : isCredit
              ? t("payments.pay.chargeCredit", { amount: formatMoney(settled, currency) })
              : t("payments.pay.charge", { amount: formatMoney(total, currency) })}
        </Button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${muted ? "text-muted-foreground" : "text-muted-foreground"}`}>
        {label}
      </span>
      <span className={`text-sm ${muted ? "text-muted-foreground" : ""}`}>{value}</span>
    </div>
  );
}
