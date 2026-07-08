import { useMemo, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
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
  useSalesSummary,
  useSalesByDay,
  useTopSellers,
  useReturnsReport,
  useInventoryValuation,
  useInventoryKpis,
  useInventorySettings,
  useProfitSummary,
  useProfitByDay,
  useCurrency,
} from "@/lib/pos/queries";
import { pickGranularity } from "@/lib/pos/reports";
import {
  REPORT_RANGE_PRESETS,
  resolveRange,
  previousRange,
  type RangePreset,
  type DateRange,
} from "@/lib/date-ranges";
import { formatMoney } from "@/lib/money";

export default function ReportsPage() {
  const { t } = useTranslation();
  const currency = useCurrency();

  const [preset, setPreset] = useState<RangePreset>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = useMemo<DateRange>(
    () =>
      preset === "custom"
        ? { from: customFrom || null, to: customTo || null }
        : resolveRange(preset),
    [preset, customFrom, customTo],
  );
  const prev = useMemo(() => previousRange(range), [range]);
  const granularity = useMemo(() => pickGranularity(range), [range]);

  const summary = useSalesSummary(range);
  const summaryPrev = useSalesSummary(prev);
  const profit = useProfitSummary(range);
  const profitPrev = useProfitSummary(prev);
  const byDay = useSalesByDay(range, granularity);
  const profitByDay = useProfitByDay(range, granularity);
  const top = useTopSellers(range, 10);
  const returnsReport = useReturnsReport(range);
  const valuation = useInventoryValuation();
  const inv = useInventorySettings();
  const kpis = useInventoryKpis(inv.data?.default_low_stock_threshold ?? 5);

  const s = summary.data;
  const sp = summaryPrev.data;
  const p = profit.data;
  const pp = profitPrev.data;
  const ret = returnsReport.data;
  const v = valuation.data;
  const k = kpis.data;
  const topProduct = top.data?.[0]?.product_name;

  const factor = 10 ** currency.decimals;

  const chartData = useMemo(
    () =>
      (byDay.data ?? []).map((d) => ({
        day: granularity === "month" ? d.day.slice(2) : d.day.slice(5),
        total: d.total_cents / factor,
      })),
    [byDay.data, granularity, factor],
  );

  const profitChartData = useMemo(
    () =>
      (profitByDay.data ?? []).map((d) => ({
        day: granularity === "month" ? d.day.slice(2) : d.day.slice(5),
        profit: d.profit_cents / factor,
      })),
    [profitByDay.data, granularity, factor],
  );

  const fmtDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(intlLocale());
  const rangeText =
    range.from && range.to
      ? `${fmtDate(range.from)} – ${fmtDate(range.to)}`
      : t("reports.range.all");

  const moneyTooltip = (value: number | string) =>
    formatMoney(Math.round(Number(value) * factor), currency);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("reports.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("reports.subtitle")}</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
        <Select value={preset} onValueChange={(val) => setPreset(val as RangePreset)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPORT_RANGE_PRESETS.map((pr) => (
              <SelectItem key={pr} value={pr}>
                {t(`reports.range.${pr}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {preset === "custom" && (
          <>
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="w-40"
            />
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="w-40"
            />
          </>
        )}

        <span className="text-muted-foreground ms-auto text-sm">{rangeText}</span>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">{t("reports.tab.overview")}</TabsTrigger>
          <TabsTrigger value="sales">{t("reports.tab.sales")}</TabsTrigger>
          <TabsTrigger value="inventory">{t("reports.tab.inventory")}</TabsTrigger>
        </TabsList>

        {/* ---------------- Overview ---------------- */}
        <TabsContent value="overview" className="mt-0 space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label={t("reports.salesCount")}
              value={s ? String(s.sale_count) : "…"}
              delta={{ current: s?.sale_count, previous: sp?.sale_count }}
            />
            <Stat
              label={t("reports.netSales")}
              value={s ? formatMoney(s.net_cents, currency) : "…"}
              delta={{ current: s?.net_cents, previous: sp?.net_cents }}
            />
            <Stat
              label={t("reports.itemsSold")}
              value={s ? String(s.items_sold) : "…"}
              delta={{ current: s?.items_sold, previous: sp?.items_sold }}
            />
            <Stat
              label={t("reports.refunds")}
              value={s ? formatMoney(s.refund_cents, currency) : "…"}
              sub={s ? t("reports.returnsCount", { count: s.return_count }) : undefined}
              delta={{
                current: s?.refund_cents,
                previous: sp?.refund_cents,
                higherIsBetter: false,
              }}
            />
          </div>

          <div>
            <h2 className="text-muted-foreground mb-2 text-sm font-medium">
              {t("reports.profitTitle")}
            </h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat
                label={t("reports.netProfit")}
                value={p ? formatMoney(p.net_profit_cents, currency) : "…"}
                delta={{ current: p?.net_profit_cents, previous: pp?.net_profit_cents }}
              />
              <Stat
                label={t("reports.revenue")}
                value={p ? formatMoney(p.revenue_cents, currency) : "…"}
                delta={{ current: p?.revenue_cents, previous: pp?.revenue_cents }}
              />
              <Stat
                label={t("reports.cogs")}
                value={p ? formatMoney(p.cogs_cents, currency) : "…"}
                delta={{
                  current: p?.cogs_cents,
                  previous: pp?.cogs_cents,
                  higherIsBetter: false,
                }}
              />
              <Stat
                label={t("reports.returnsImpact")}
                value={p ? formatMoney(p.returns_value_cents, currency) : "…"}
                delta={{
                  current: p?.returns_value_cents,
                  previous: pp?.returns_value_cents,
                  higherIsBetter: false,
                }}
              />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <TrendCard
              title={t("reports.netSalesTrend")}
              data={chartData}
              dataKey="total"
              tooltip={moneyTooltip}
            />
            <TrendCard
              title={t("reports.netProfitTrend")}
              data={profitChartData}
              dataKey="profit"
              tooltip={moneyTooltip}
            />
          </div>
        </TabsContent>

        {/* ---------------- Sales ---------------- */}
        <TabsContent value="sales" className="mt-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("reports.topSellersTitle")}</CardTitle>
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
                    {top.data.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.product_name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {[row.size_name, row.color_name].filter(Boolean).join(" / ") || "—"}
                        </TableCell>
                        <TableCell className="text-end">{row.qty_sold}</TableCell>
                        <TableCell className="text-end">
                          {formatMoney(row.revenue_cents, currency)}
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("reports.returnsTitle")}</CardTitle>
              <CardDescription>
                {ret
                  ? t("reports.returnsSummary", {
                      count: ret.return_count,
                      amount: formatMoney(ret.refund_total_cents, currency),
                    })
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
        </TabsContent>

        {/* ---------------- Inventory ---------------- */}
        <TabsContent value="inventory" className="mt-0 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-muted-foreground text-sm font-medium">
              {t("inventory.title")}
            </h2>
            <span className="text-muted-foreground text-xs">{t("reports.asOfNow")}</span>
          </div>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TrendCard({
  title,
  data,
  dataKey,
  tooltip,
}: {
  title: string;
  data: { day: string }[];
  dataKey: string;
  tooltip: (value: number | string) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {data.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <XAxis dataKey="day" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} width={48} />
              <Tooltip formatter={(value) => tooltip(value as number)} />
              <Bar dataKey={dataKey} fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: {
    current: number | undefined;
    previous: number | undefined;
    higherIsBetter?: boolean;
  };
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {delta && delta.current !== undefined && delta.previous !== undefined && (
          <Delta
            current={delta.current}
            previous={delta.previous}
            higherIsBetter={delta.higherIsBetter ?? true}
          />
        )}
        {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/** Period-over-period change vs the previous equal-length window. */
function Delta({
  current,
  previous,
  higherIsBetter,
}: {
  current: number;
  previous: number;
  higherIsBetter: boolean;
}) {
  const { t } = useTranslation();
  const diff = current - previous;
  const flat = diff === 0;
  const up = diff > 0;
  const favorable = up === higherIsBetter;
  const color = flat
    ? "text-muted-foreground"
    : favorable
      ? "text-success"
      : "text-destructive";
  const arrow = flat ? "→" : up ? "▲" : "▼";
  const pct =
    previous !== 0 ? `${Math.abs((diff / Math.abs(previous)) * 100).toFixed(0)}%` : "";

  return (
    <p className={`text-xs font-medium ${color}`}>
      {arrow} {pct}{" "}
      <span className="text-muted-foreground font-normal">{t("reports.vsPrevious")}</span>
    </p>
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
