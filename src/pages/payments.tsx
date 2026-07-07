/**
 * Payment Management Center — the unified POS workspace that replaces the old
 * Sell, Returns and Cash pages. One screen handles selling, returns/refunds,
 * cash operations, customers, receipts and live store insights, with sensitive
 * actions behind a manager-PIN gate. Returns happen in-place: the cashier hits
 * "Returns", the cart flips into return mode, items are selected/scanned (or an
 * original sale is loaded), and the payment panel refunds instead of charges.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  useHeldSales,
  useHoldSale,
  useResumeHeld,
  useDiscardHeld,
  useSettings,
} from "@/lib/pos/queries";
import { useCartStore } from "@/store/use-cart-store";
import { listRecentSales, getSale, getSaleItems } from "@/lib/pos/sales";
import { getVariantDetail } from "@/lib/pos/catalog";
import { currencyFromSettings } from "@/lib/pos/settings";
import { intlLocale } from "@/lib/i18n";
import { buildReceiptFromSale } from "@/lib/pos/receipt";
import { printReceipt } from "@/lib/pos/hardware";
import type { VariantDetail } from "@/lib/pos/types";

import { ManagerGateProvider } from "@/components/payments/manager-gate";
import { InsightsStrip } from "@/components/payments/insights-strip";
import { QuickActionsBar } from "@/components/payments/quick-actions-bar";
import { ProductBrowser } from "@/components/payments/product-browser";
import { CartPanel } from "@/components/payments/cart-panel";
import { PaymentPanel } from "@/components/payments/payment-panel";
import { CashRegisterSheet } from "@/components/payments/cash-register-sheet";
import { CustomerSheet } from "@/components/payments/customer-sheet";
import { HistorySheet } from "@/components/payments/history-sheet";

export default function PaymentsPage() {
  return (
    <ManagerGateProvider>
      <PaymentCenter />
    </ManagerGateProvider>
  );
}

function PaymentCenter() {
  const { t } = useTranslation();
  const settings = useSettings();

  const held = useHeldSales();
  const holdSale = useHoldSale();
  const resumeHeld = useResumeHeld();
  const discardHeld = useDiscardHeld();

  const addVariant = useCartStore((s) => s.addVariant);
  const clear = useCartStore((s) => s.clear);
  const load = useCartStore((s) => s.load);
  const lines = useCartStore((s) => s.lines);
  const startReturn = useCartStore((s) => s.startReturn);
  const loadSaleForReturn = useCartStore((s) => s.loadSaleForReturn);

  const [cashOpen, setCashOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const anySheetOpen = cashOpen || customerOpen || historyOpen;

  function handleAddVariant(v: VariantDetail) {
    addVariant(v);
  }

  /**
   * Load a specific original sale into the cart in return mode so the cashier
   * can modify quantities and refund. Used by the customer- and transaction-
   * history "Return / modify" actions.
   */
  async function handleReturnSale(saleId: number) {
    try {
      const sale = await getSale(saleId);
      if (!sale) {
        toast.error(t("payments.returns.originalNotFound"));
        return;
      }
      const items = await getSaleItems(saleId);
      const returnable = items.filter((it) => it.qty - it.qty_returned > 0);
      if (returnable.length === 0) {
        toast.info(t("payments.returns.allReturned", { code: sale.code }));
        return;
      }
      const details = await Promise.all(
        returnable.map((it) => getVariantDetail(it.variant_id)),
      );
      const returnLines = returnable.flatMap((it, idx) => {
        const variant = details[idx];
        if (!variant) return [];
        return [
          {
            variant,
            sale_item_id: it.id,
            qty: it.qty - it.qty_returned,
            unit_price_cents: it.unit_price_cents,
          },
        ];
      });
      loadSaleForReturn(saleId, returnLines);
      setCustomerOpen(false);
      setHistoryOpen(false);
      toast.success(t("payments.returns.loadedSale", { code: sale.code }));
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleSuspend() {
    const { lines, cartDiscount, customerId } = useCartStore.getState();
    if (lines.length === 0) return;
    const time = new Date().toLocaleTimeString(intlLocale(), {
      hour: "2-digit",
      minute: "2-digit",
    });
    const label = `${time} · ${t("payments.itemCount", { count: lines.length })}`;
    try {
      await holdSale.mutateAsync({
        label,
        payload: { lines, cartDiscount, customerId },
      });
      clear();
      toast.success(t("payments.suspended"));
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleResume(id: number) {
    try {
      const h = await resumeHeld.mutateAsync(id);
      if (h) {
        load(h.payload);
        toast.success(t("payments.resumed", { label: h.label }));
      }
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handlePrintLast() {
    try {
      const [last] = await listRecentSales(1);
      if (!last || !settings.data) {
        toast.error(t("payments.noSaleToReprint"));
        return;
      }
      const items = await getSaleItems(last.id);
      const cur = currencyFromSettings(settings.data);
      await printReceipt(buildReceiptFromSale(last, items, settings.data, cur));
      toast.success(t("payments.reprinted", { code: last.code }));
    } catch (err) {
      toast.error(t("payments.reprintFailed", { error: String(err) }));
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* Insights */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <InsightsStrip onOpenCash={() => setCashOpen(true)} />
      </div>

      <QuickActionsBar
        onNewSale={clear}
        onStartReturn={startReturn}
        onSuspend={handleSuspend}
        onResume={handleResume}
        onDiscardHeld={(id) => discardHeld.mutate(id)}
        heldSales={held.data ?? []}
        onOpenCash={() => setCashOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        onPrintLast={handlePrintLast}
        cartHasItems={lines.length > 0}
      />

      {/* Workspace — POS layout: products | cart | payment. On lg+ it's a fixed
          3-column row; below lg it stacks into 3 equal rows. Either way the grid
          is bounded to the viewport (grid rows give each panel a definite height)
          and every panel scrolls internally, so the page never scrolls and the
          Charge button in the payment panel stays pinned and in view at any width. */}
      <div className="min-h-0 flex-1">
        <div className="grid h-full min-h-0 grid-cols-1 grid-rows-3 gap-3 overflow-hidden lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_320px] lg:grid-rows-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_360px]">
          {/* Products */}
          <Card className="min-h-0 overflow-hidden p-3">
            <ProductBrowser
              onAddVariant={handleAddVariant}
              scannerEnabled={!anySheetOpen}
            />
          </Card>
          {/* Cart */}
          <Card className="flex min-h-0 flex-col overflow-hidden p-0">
            <CartPanel />
          </Card>
          {/* Payment — totals, amount paid, and a pinned Charge button. The grid
               row bounds the card height so PaymentPanel's flex-col h-full
               resolves, keeping the Charge button pinned without page scroll. */}
          <Card className="flex min-h-0 flex-col overflow-hidden p-3">
            <PaymentPanel onOpenCustomer={() => setCustomerOpen(true)} />
          </Card>
        </div>
      </div>

      {/* Sheets */}
      <CashRegisterSheet open={cashOpen} onOpenChange={setCashOpen} />
      <CustomerSheet
        open={customerOpen}
        onOpenChange={setCustomerOpen}
        onReturnSale={handleReturnSale}
      />
      <HistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onReturnSale={handleReturnSale}
      />
    </div>
  );
}
