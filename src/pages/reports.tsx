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
import {
  useTodaySummary,
  useSalesByDay,
  useTopSellers,
  useInventoryValuation,
  useInventoryKpis,
  useInventorySettings,
  useCurrency,
} from "@/lib/pos/queries";
import { formatMoney } from "@/lib/money";

export default function ReportsPage() {
  const currency = useCurrency();
  const today = useTodaySummary();
  const byDay = useSalesByDay(14);
  const top = useTopSellers(30, 10);
  const valuation = useInventoryValuation();
  const inv = useInventorySettings();
  const kpis = useInventoryKpis(inv.data?.default_low_stock_threshold ?? 5);

  const t = today.data;
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
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground text-sm">
          Today at a glance, recent sales, and stock value.
        </p>
      </div>

      {/* Today */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Sales today" value={t ? String(t.sale_count) : "…"} />
        <Stat label="Net sales" value={t ? formatMoney(t.net_cents, currency) : "…"} />
        <Stat label="Items sold" value={t ? String(t.items_sold) : "…"} />
        <Stat
          label="Refunds"
          value={t ? formatMoney(t.refund_cents, currency) : "…"}
          sub={t ? `${t.return_count} returns` : undefined}
        />
      </div>

      {/* Inventory KPIs */}
      <div>
        <h2 className="text-muted-foreground mb-2 text-sm font-medium">
          Inventory
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat label="Total products" value={k ? String(k.total_products) : "…"} />
          <Stat label="Low stock" value={k ? String(k.low_stock) : "…"} />
          <Stat label="Out of stock" value={k ? String(k.out_of_stock) : "…"} />
          <Stat
            label="Inventory value"
            value={v ? formatMoney(v.retail_value_cents, currency) : "…"}
          />
          <Stat label="Top seller" value={topProduct ?? "—"} />
        </div>
      </div>

      {/* Sales trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Net sales — last 14 days</CardTitle>
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
          <CardTitle className="text-base">Top sellers (30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {top.data && top.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top.data.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{s.product_name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {[s.size_name, s.color_name].filter(Boolean).join(" / ") || "—"}
                    </TableCell>
                    <TableCell className="text-right">{s.qty_sold}</TableCell>
                    <TableCell className="text-right">
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

      {/* Inventory valuation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stock on hand</CardTitle>
          <CardDescription>
            Across {v ? v.variant_count : "…"} variants
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <Mini label="Units" value={v ? String(v.units) : "…"} />
          <Mini
            label="Cost value"
            value={v ? formatMoney(v.cost_value_cents, currency) : "…"}
          />
          <Mini
            label="Retail value"
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
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center py-8 text-sm">
      No data yet.
    </div>
  );
}
