/**
 * Transaction history (side sheet). Lists recent sales AND returns in one
 * timeline. Sales offer reprint-receipt / A4-PDF and a "Return" shortcut;
 * returns are clearly marked and linked back to their original sale.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Printer, FileText, Loader2, Undo2, CornerUpLeft } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { listRecentSales, getSaleItems } from "@/lib/pos/sales";
import { listRecentReturns } from "@/lib/pos/returns";
import { useCurrency, useSettings } from "@/lib/pos/queries";
import { currencyFromSettings } from "@/lib/pos/settings";
import { buildReceiptFromSale } from "@/lib/pos/receipt";
import { printReceipt } from "@/lib/pos/hardware";
import { generateInvoicePdf } from "@/lib/pos/invoice-pdf";
import { formatMoney } from "@/lib/money";
import { intlLocale } from "@/lib/i18n";

type Entry =
  | {
      kind: "sale";
      id: number;
      code: string;
      created_at: string;
      total_cents: number;
    }
  | {
      kind: "return";
      id: number;
      code: string;
      created_at: string;
      net_cash_cents: number;
      original_sale_code: string | null;
      customer_name: string | null;
    };

export function HistorySheet({
  open,
  onOpenChange,
  onReturnSale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Start a return pre-loaded from a sale in the history list. */
  onReturnSale: (saleId: number) => void;
}) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const settings = useSettings();
  const [busy, setBusy] = useState<number | null>(null);

  const sales = useQuery({
    queryKey: ["recent-sales", open],
    queryFn: () => listRecentSales(50),
    enabled: open,
  });
  const returns = useQuery({
    queryKey: ["recent-returns", open],
    queryFn: () => listRecentReturns(50),
    enabled: open,
  });

  const loading = sales.isLoading || returns.isLoading;

  const entries: Entry[] = [
    ...(sales.data ?? []).map(
      (s): Entry => ({
        kind: "sale",
        id: s.id,
        code: s.code,
        created_at: s.created_at,
        total_cents: s.total_cents,
      }),
    ),
    ...(returns.data ?? []).map(
      (r): Entry => ({
        kind: "return",
        id: r.id,
        code: r.code,
        created_at: r.created_at,
        net_cash_cents: r.net_cash_cents,
        original_sale_code: r.original_sale_code,
        customer_name: r.customer_name,
      }),
    ),
  ].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  async function reprint(saleId: number) {
    setBusy(saleId);
    try {
      const [sale, items] = await Promise.all([
        sales.data?.find((s) => s.id === saleId) ?? null,
        getSaleItems(saleId),
      ]);
      if (!sale || !settings.data) return;
      const cur = currencyFromSettings(settings.data);
      await printReceipt(buildReceiptFromSale(sale, items, settings.data, cur));
      toast.success(t("payments.reprinted", { code: sale.code }));
    } catch (err) {
      toast.error(t("payments.reprintFailed", { error: String(err) }));
    } finally {
      setBusy(null);
    }
  }

  async function pdf(saleId: number) {
    setBusy(saleId);
    try {
      const sale = sales.data?.find((s) => s.id === saleId);
      const items = await getSaleItems(saleId);
      if (!sale || !settings.data) return;
      await generateInvoicePdf(
        sale,
        items,
        settings.data,
        currencyFromSettings(settings.data),
      );
    } catch (err) {
      toast.error(t("payments.history.invoiceFailed", { error: String(err) }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-hidden sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("payments.history.title")}</SheetTitle>
          <SheetDescription>{t("payments.history.description")}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="text-muted-foreground size-5 animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {t("payments.history.noTransactions")}
            </p>
          ) : (
            <ul className="divide-y">
              {entries.map((e) =>
                e.kind === "sale" ? (
                  <li
                    key={`s-${e.id}`}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{e.code}</p>
                      <p className="text-muted-foreground text-xs">
                        {new Date(e.created_at).toLocaleString(intlLocale())} ·{" "}
                        {formatMoney(e.total_cents, currency)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={t("payments.history.returnModify")}
                        onClick={() => onReturnSale(e.id)}
                      >
                        <Undo2 />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy === e.id}
                        onClick={() => reprint(e.id)}
                        title={t("payments.history.reprintReceipt")}
                      >
                        <Printer />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy === e.id}
                        onClick={() => pdf(e.id)}
                        title={t("payments.history.a4Invoice")}
                      >
                        <FileText />
                      </Button>
                    </div>
                  </li>
                ) : (
                  <li
                    key={`r-${e.id}`}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{e.code}</p>
                        <Badge variant="destructive">{t("payments.returns.refund")}</Badge>
                      </div>
                      <p className="text-muted-foreground flex items-center gap-1 text-xs">
                        {new Date(e.created_at).toLocaleString(intlLocale())}
                        {e.original_sale_code && (
                          <>
                            {" · "}
                            <CornerUpLeft className="size-3" />
                            {t("payments.history.from", { code: e.original_sale_code })}
                          </>
                        )}
                        {e.customer_name ? ` · ${e.customer_name}` : ""}
                      </p>
                    </div>
                    <span className="text-destructive text-sm font-medium">
                      −{formatMoney(Math.abs(e.net_cash_cents), currency)}
                    </span>
                  </li>
                ),
              )}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
