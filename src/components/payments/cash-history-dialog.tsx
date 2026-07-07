/**
 * Cash session history. Read-only list of past closed sessions so the owner can
 * review each day's open/close: float, theoretical total, what was counted, and
 * the variance. Reuses the cash session repository via useCashSessions.
 */
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatMoney } from "@/lib/money";
import { intlLocale } from "@/lib/i18n";
import { useCashSessions, useCurrency } from "@/lib/pos/queries";

export function CashHistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const sessions = useCashSessions(30);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("payments.sessionHistory.title")}</DialogTitle>
          <DialogDescription>{t("payments.sessionHistory.description")}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pe-3">
          {sessions.isLoading ? (
            <p className="text-muted-foreground py-6 text-center text-sm">{t("common.loading")}</p>
          ) : !sessions.data?.length ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {t("payments.sessionHistory.noSessions")}
            </p>
          ) : (
            <div className="grid gap-2">
              {sessions.data.map((s) => {
                const variance = s.variance_cents ?? 0;
                const varianceClass =
                  variance === 0
                    ? "text-success"
                    : "text-destructive";
                return (
                  <div key={s.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {s.closed_at
                          ? new Date(s.closed_at).toLocaleString(intlLocale())
                          : "—"}
                      </span>
                      {s.cashier_name ? (
                        <span className="text-muted-foreground text-xs">
                          {s.cashier_name}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <Cell label={t("payments.cash.openingFloat")} value={formatMoney(s.opening_float_cents, currency)} />
                      <Cell
                        label={t("payments.sessionHistory.theoretical")}
                        value={s.expected_cents == null ? "—" : formatMoney(s.expected_cents, currency)}
                      />
                      <Cell
                        label={t("payments.sessionHistory.counted")}
                        value={s.counted_cents == null ? "—" : formatMoney(s.counted_cents, currency)}
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t("payments.cash.variance")}</span>
                        <span className={`font-medium tabular-nums ${varianceClass}`}>
                          {variance > 0 ? "+" : ""}
                          {formatMoney(variance, currency)}
                        </span>
                      </div>
                    </div>
                    {s.note ? (
                      <p className="text-muted-foreground mt-2 text-xs italic">
                        {s.note}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
