import { useTranslation } from "react-i18next";
import { CalendarClock, Play } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  useExpenseKpis,
  useExpenseByCategory,
  useCurrency,
  useRecurringTemplates,
  usePostRecurring,
} from "@/lib/pos/queries";
import { formatMoney } from "@/lib/money";
import { intlLocale } from "@/lib/i18n";
import type { ExpenseFilters, RecurringTemplateRow } from "@/lib/pos/expenses";

interface Props {
  filters: ExpenseFilters;
}

/** Overview: headline KPIs, category split and upcoming recurring costs. */
export function ExpenseDashboard({ filters }: Props) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const kpis = useExpenseKpis(filters);
  const byCategory = useExpenseByCategory(filters);
  const recurring = useRecurringTemplates();
  const post = usePostRecurring();

  const k = kpis.data;
  const cats = byCategory.data ?? [];
  const total = k?.total_cents ?? 0;

  const today = new Date().toISOString().slice(0, 10);
  const due = (recurring.data ?? []).filter(
    (r) => r.active === 1 && r.next_due_date && r.next_due_date <= today,
  );

  async function record(r: RecurringTemplateRow) {
    try {
      await post.mutateAsync(r.id);
      toast.success(t("expenses.toast.recorded"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label={t("expenses.kpi.total")}
          value={k ? formatMoney(k.total_cents, currency) : "…"}
        />
        <Stat label={t("expenses.kpi.count")} value={k ? String(k.count) : "…"} />
        <Stat
          label={t("expenses.kpi.average")}
          value={k ? formatMoney(k.avg_cents, currency) : "…"}
        />
        <Stat
          label={t("expenses.kpi.largest")}
          value={k ? formatMoney(k.max_cents, currency) : "…"}
        />
      </div>

      {due.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4" />
              {t("expenses.dueNow")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {due.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatMoney(r.amount_cents, currency)} ·{" "}
                    {r.next_due_date &&
                      new Date(r.next_due_date).toLocaleDateString(intlLocale())}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => record(r)}
                  disabled={post.isPending}
                >
                  <Play className="size-4" />
                  {t("expenses.recordNow")}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("expenses.byCategory")}</CardTitle>
        </CardHeader>
        <CardContent>
          {byCategory.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : cats.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {t("expenses.empty")}
            </p>
          ) : (
            <div className="space-y-3">
              {cats.map((c) => {
                const pct = total > 0 ? (c.total_cents / total) * 100 : 0;
                const color = c.category_color ?? "var(--primary)";
                return (
                  <div key={c.category_id ?? "none"}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        {c.category_name ?? t("expenses.uncategorized")}
                      </span>
                      <span className="text-muted-foreground">
                        {formatMoney(c.total_cents, currency)} · {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="bg-muted h-2 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
