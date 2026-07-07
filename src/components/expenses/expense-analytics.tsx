import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import {
  useExpenseByMonth,
  useExpenseByCategory,
  useExpenseByMethod,
  useExpenseTopVendors,
  useCurrency,
} from "@/lib/pos/queries";
import { formatMoney } from "@/lib/money";
import type { ExpenseFilters } from "@/lib/pos/expenses";

const FALLBACK_COLORS = [
  "#6366f1",
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#64748b",
];

interface Props {
  filters: ExpenseFilters;
}

export function ExpenseAnalytics({ filters }: Props) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const byMonth = useExpenseByMonth(12);
  const byCategory = useExpenseByCategory(filters);
  const byMethod = useExpenseByMethod(filters);
  const topVendors = useExpenseTopVendors(filters, 10);

  const factor = 10 ** currency.decimals;
  const money = (v: number | string) =>
    formatMoney(Math.round(Number(v) * factor), currency);

  const monthData = (byMonth.data ?? []).map((m) => ({
    month: m.month.slice(2), // YY-MM
    total: m.total_cents / factor,
  }));

  const pieData = (byCategory.data ?? []).map((c, i) => ({
    name: c.category_name ?? t("expenses.uncategorized"),
    value: c.total_cents / factor,
    color: c.category_color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("expenses.monthlyTrend")}</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {byMonth.isLoading ? (
            <Center>
              <Spinner />
            </Center>
          ) : monthData.length === 0 ? (
            <Center>
              <span className="text-muted-foreground text-sm">
                {t("reports.noData")}
              </span>
            </Center>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthData}>
                <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} width={48} />
                <Tooltip formatter={(v) => money(v as number)} />
                <Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("expenses.byCategory")}</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {pieData.length === 0 ? (
              <Center>
                <span className="text-muted-foreground text-sm">
                  {t("reports.noData")}
                </span>
              </Center>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {pieData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => money(v as number)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("expenses.byMethod")}</CardTitle>
          </CardHeader>
          <CardContent>
            {(byMethod.data ?? []).length === 0 ? (
              <Center>
                <span className="text-muted-foreground text-sm">
                  {t("reports.noData")}
                </span>
              </Center>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("expenses.paymentMethod")}</TableHead>
                    <TableHead className="text-end">{t("expenses.kpi.count")}</TableHead>
                    <TableHead className="text-end">{t("expenses.total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(byMethod.data ?? []).map((m) => (
                    <TableRow key={m.method_id ?? "none"}>
                      <TableCell>{m.method_name ?? t("common.none")}</TableCell>
                      <TableCell className="text-end">{m.count}</TableCell>
                      <TableCell className="text-end font-medium">
                        {formatMoney(m.total_cents, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("expenses.topVendors")}</CardTitle>
        </CardHeader>
        <CardContent>
          {(topVendors.data ?? []).length === 0 ? (
            <Center>
              <span className="text-muted-foreground text-sm">
                {t("reports.noData")}
              </span>
            </Center>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("expenses.vendor")}</TableHead>
                  <TableHead className="text-end">{t("expenses.kpi.count")}</TableHead>
                  <TableHead className="text-end">{t("expenses.total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(topVendors.data ?? []).map((v) => (
                  <TableRow key={v.vendor}>
                    <TableCell className="font-medium">{v.vendor}</TableCell>
                    <TableCell className="text-end">{v.count}</TableCell>
                    <TableCell className="text-end font-medium">
                      {formatMoney(v.total_cents, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center py-8">{children}</div>
  );
}
