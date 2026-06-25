/**
 * Denomination counter ("count the drawer"). The cashier enters how many of
 * each Algerian Dinar note/coin is physically in the till; the dialog tallies
 * the grand total and hands it (plus the per-denomination breakdown) back to
 * the close flow as the counted amount.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatMoney } from "@/lib/money";
import { useCurrency } from "@/lib/pos/queries";

/** DZD notes & coins, largest first (whole dinars). */
const DZD_DENOMINATIONS = [2000, 1000, 500, 200, 100, 50, 20, 10, 5];

export function DenominationCounter({
  open,
  onOpenChange,
  onUse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the counted total (minor units) and the tally JSON. */
  onUse: (totalCents: number, breakdownJson: string) => void;
}) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const factor = 10 ** currency.decimals;
  // Each denomination's value in minor units (cents).
  const rows = useMemo(
    () => DZD_DENOMINATIONS.map((da) => ({ da, cents: da * factor })),
    [factor],
  );

  // Map of denomination-cents -> quantity string.
  const [qty, setQty] = useState<Record<number, string>>({});

  const total = rows.reduce(
    (sum, r) => sum + r.cents * (parseInt(qty[r.cents] ?? "", 10) || 0),
    0,
  );

  function setRow(cents: number, value: string) {
    const digits = value.replace(/\D/g, "");
    setQty((q) => ({ ...q, [cents]: digits }));
  }

  function handleUse() {
    const breakdown: Record<string, number> = {};
    for (const r of rows) {
      const n = parseInt(qty[r.cents] ?? "", 10) || 0;
      if (n > 0) breakdown[String(r.cents)] = n;
    }
    onUse(total, JSON.stringify(breakdown));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("payments.denom.title")}</DialogTitle>
          <DialogDescription>{t("payments.denom.description")}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] pe-3">
          <div className="grid gap-1">
            <div className="text-muted-foreground grid grid-cols-[1fr_5rem_auto] items-center gap-3 px-1 pb-1 text-xs">
              <span>{t("payments.denom.value")}</span>
              <span className="text-center">{t("common.quantity")}</span>
              <span className="text-end">{t("payments.denom.subtotal")}</span>
            </div>
            {rows.map((r) => {
              const n = parseInt(qty[r.cents] ?? "", 10) || 0;
              return (
                <div
                  key={r.cents}
                  className="grid grid-cols-[1fr_5rem_auto] items-center gap-3 border-b py-1.5 last:border-b-0"
                >
                  <span className="text-sm font-medium">
                    {formatMoney(r.cents, currency)}
                  </span>
                  <Input
                    inputMode="numeric"
                    className="h-8 text-center"
                    value={qty[r.cents] ?? ""}
                    onChange={(e) => setRow(r.cents, e.target.value)}
                    placeholder="0"
                  />
                  <span className="text-end text-sm tabular-nums">
                    {formatMoney(r.cents * n, currency)}
                  </span>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between border-t pt-3">
          <span className="font-semibold">{t("payments.denom.totalCounted")}</span>
          <span className="text-xl font-bold tabular-nums">
            {formatMoney(total, currency)}
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleUse}>{t("payments.denom.useTotal")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
