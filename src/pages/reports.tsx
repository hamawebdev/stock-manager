import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n";
import {
  useTodaySummary,
  useSalesByDay,
  useTopSellers,
  useReturnsReport,
  useInventoryValuation,
  useInventoryKpis,
  useInventorySettings,
  useCurrency,
} from "@/lib/pos/queries";
import { formatMoney } from "@/lib/money";

export default function ReportsPage() {
  const { t } = useTranslation();
  const currency = useCurrency();
  const today = useTodaySummary();
  const byDay = useSalesByDay(14);
  const top = useTopSellers(30, 10);
  const returnsReport = useReturnsReport(30);
  const valuation = useInventoryValuation();
  const inv = useInventorySettings();
  const kpis = useInventoryKpis(inv.data?.default_low_stock_threshold ?? 5);

  const summary = today.data;
  const ret = returnsReport.data;
  const v = valuation.data;
  const k = kpis.data;
  const topProduct = top.data?.[0]?.product_name;

  const chartData = (byDay.data ?? []).map((d) => ({
    day: d.day.slice(5), // MM-DD
    total: d.total_cents / 10 ** currency.decimals,
    count: d.count,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("reports.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("reports.subtitle")}</p>
      </div>

      {/* Today */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t("reports.salesToday")} value={summary ? String(summary.sale_count) : "…"} />
        <Stat label={t("reports.netSales")} value={summary ? formatMoney(summary.net_cents, currency) : "…"} />
        <Stat label={t("reports.itemsSold")} value={summary ? String(summary.items_sold) : "…"} />
        <Stat
          label={t("reports.refunds")}
          value={summary ? formatMoney(summary.refund_cents, currency) : "…"}
          sub={summary ? t("reports.returnsCount", { count: summary.return_count }) : undefined}
        />
      </div>

      {/* Inventory KPIs */}
      <div>
        <h2 className="text-muted-foreground mb-2 text-sm font-medium">
          {t("inventory.title")}
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat label={t("reports.totalProducts")} value={k ? String(k.total_products) : "…"} />
          <Stat label={t("reports.lowStock")} value={k ? String(k.low_stock) : "…"} />
          <Stat label={t("reports.outOfStock")} value={k ? String(k.out_of_stock) : "…"} />
          <Stat
            label={t("reports.inventoryValue")}
            value={v ? formatMoney(v.retail_value_cents, currency) : "…"}
          />
          <Stat label={t("reports.topSeller")} value={topProduct ?? "—"} />
        </div>
      </div>

      {/* Sales trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reports.netSales14")}</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {chartData.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="day" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} width={48} />
                <Tooltip
                  formatter={(value) =>
                    formatMoney(
                      Math.round(Number(value) * 10 ** currency.decimals),
                      currency,
                    )
                  }
                />
                <Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top sellers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reports.topSellers30")}</CardTitle>
        </CardHeader>
        <CardContent>
          {top.data && top.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("bestSellers.col.product")}</TableHead>
                  <TableHead>{t("inventory.variantEditor.variant")}</TableHead>
                  <TableHead className="text-end">{t("reports.sold")}</TableHead>
                  <TableHead className="text-end">{t("bestSellers.col.revenue")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top.data.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{s.product_name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {[s.size_name, s.color_name].filter(Boolean).join(" / ") || "—"}
                    </TableCell>
                    <TableCell className="text-end">{s.qty_sold}</TableCell>
                    <TableCell className="text-end">
                      {formatMoney(s.revenue_cents, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty />
          )}
        </CardContent>
      </Card>

      {/* Returns & refunds */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reports.returnsTitle")}</CardTitle>
          <CardDescription>
            {ret
              ? t("reports.returnsSummary", { count: ret.return_count, amount: formatMoney(ret.refund_total_cents, currency) })
              : "…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ret && ret.rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("payments.return")}</TableHead>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("reports.originalSale")}</TableHead>
                  <TableHead>{t("payments.actions.customer")}</TableHead>
                  <TableHead className="text-end">{t("reports.refund")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ret.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.code}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString(intlLocale())}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.original_sale_code ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.customer_name ?? t("reports.walkIn")}
                    </TableCell>
                    <TableCell className="text-end">
                      {formatMoney(r.net_cash_cents, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty />
          )}
        </CardContent>
      </Card>

      {/* Inventory valuation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reports.stockOnHand")}</CardTitle>
          <CardDescription>
            {t("reports.acrossVariants", { count: v ? v.variant_count : 0 })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <Mini label={t("reports.units")} value={v ? String(v.units) : "…"} />
          <Mini
            label={t("reports.costValue")}
            value={v ? formatMoney(v.cost_value_cents, currency) : "…"}
          />
          <Mini
            label={t("reports.retailValue")}
            value={v ? formatMoney(v.retail_value_cents, currency) : "…"}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function Empty() {
  const { t } = useTranslation();
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center py-8 text-sm">
      {t("reports.noData")}
    </div>
  );
}
