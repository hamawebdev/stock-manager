/**
 * Real-time store insights. A compact strip of live indicators across the top
 * of the Payment Management Center. "Real-time" here is in-app polling via
 * React Query (this is a single local-register app — there is no server to push
 * from), refreshed every 10s and on each completed transaction.
 */
import {
  useTodaySummary,
  useOpenSession,
  useCashBreakdown,
  useCurrency,
} from "@/lib/pos/queries";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "@/lib/money";
import {
  User,
  CircleDot,
  Receipt,
  RotateCcw,
  Wallet,
  Hash,
} from "lucide-react";

export function InsightsStrip({ onOpenCash }: { onOpenCash: () => void }) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const qc = useQueryClient();
  const today = useTodaySummary();
  const session = useOpenSession();
  const breakdown = useCashBreakdown(session.data ?? null);

  // Light polling keeps the strip live without a server. 10s is frequent
  // enough for a register and cheap on a local SQLite read.
  useEffect(() => {
    const timer = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["report-today"] });
      qc.invalidateQueries({ queryKey: ["cash-breakdown"] });
    }, 10_000);
    return () => clearInterval(timer);
  }, [qc]);

  const open = session.data;
  const summary = today.data;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
      <Item icon={User} label={t("payments.insights.cashier")} value={open?.cashier_name || "—"} />
      <button onClick={onOpenCash} className="flex items-center gap-1.5">
        <CircleDot
          className={`size-4 ${open ? "text-success" : "text-muted-foreground"}`}
        />
        <span className="text-muted-foreground">{t("payments.insights.register")}</span>
        <span className="font-medium">{open ? t("payments.insights.open") : t("payments.insights.closed")}</span>
      </button>
      <Item
        icon={Receipt}
        label={t("payments.insights.salesToday")}
        value={summary ? formatMoney(summary.net_cents, currency) : "…"}
      />
      <Item icon={Hash} label={t("payments.insights.txns")} value={summary ? String(summary.sale_count) : "…"} />
      <Item
        icon={RotateCcw}
        label={t("payments.insights.returns")}
        value={summary ? String(summary.return_count) : "…"}
      />
      <Item
        icon={Wallet}
        label={t("payments.insights.cashBalance")}
        value={
          open && breakdown.data
            ? formatMoney(breakdown.data.expected_cents, currency)
            : "—"
        }
      />
    </div>
  );
}

function Item({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon className="text-muted-foreground size-4" />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}
