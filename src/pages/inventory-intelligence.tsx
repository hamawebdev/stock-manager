import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, Brain, Flame, Snowflake, Skull, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import {
  useMovementAnalytics,
  useInventorySettings,
} from "@/lib/pos/queries";
import type { MovementAnalyticsRow } from "@/lib/pos/reports";

interface Row extends MovementAnalyticsRow {
  velocity: number; // units sold per day
  suggested_reorder: number;
}

export default function InventoryIntelligencePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inv = useInventorySettings();
  const defaultLow = inv.data?.default_low_stock_threshold ?? 5;
  const [days, setDays] = useState(30);
  const analytics = useMovementAnalytics(days);

  const rows: Row[] = useMemo(() => {
    return (analytics.data ?? []).map((r) => {
      const threshold = r.low_stock_threshold ?? defaultLow;
      const suggested =
        r.reorder_quantity ?? Math.max(threshold * 2 - r.current_stock, 0);
      return {
        ...r,
        velocity: r.units_sold / days,
        suggested_reorder: suggested,
      };
    });
  }, [analytics.data, days, defaultLow]);

  const fast = useMemo(
    () => rows.filter((r) => r.units_sold > 0).sort((a, b) => b.velocity - a.velocity),
    [rows],
  );
  const slow = useMemo(
    () =>
      rows
        .filter((r) => r.current_stock > 0 && r.units_sold > 0)
        .sort((a, b) => a.velocity - b.velocity),
    [rows],
  );
  const dead = useMemo(
    () => rows.filter((r) => r.units_sold === 0 && r.current_stock > 0),
    [rows],
  );
  const reorder = useMemo(
    () =>
      rows
        .filter((r) => r.current_stock <= (r.low_stock_threshold ?? defaultLow))
        .sort((a, b) => b.velocity - a.velocity),
    [rows, defaultLow],
  );

  const baseCols: ColumnDef<Row>[] = [
    {
      accessorKey: "product_name",
      header: t("bestSellers.col.product"),
      cell: ({ row }) => <span className="font-medium">{row.original.product_name}</span>,
    },
    {
      accessorFn: (r) => r.category_name ?? "—",
      id: "category",
      header: t("inventory.colCategory"),
    },
    { accessorKey: "units_sold", header: t("intelligence.unitsDays", { count: days }) },
    {
      accessorKey: "velocity",
      header: t("intelligence.perDay"),
      cell: ({ row }) => row.original.velocity.toFixed(2),
    },
    { accessorKey: "current_stock", header: t("inventory.stock") },
    {
      accessorKey: "last_sale_date",
      header: t("bestSellers.col.lastSale"),
      cell: ({ row }) =>
        row.original.last_sale_date
          ? format(new Date(row.original.last_sale_date), "yyyy-MM-dd")
          : t("intelligence.never"),
    },
  ];

  const reorderCols: ColumnDef<Row>[] = [
    {
      accessorKey: "product_name",
      header: t("bestSellers.col.product"),
      cell: ({ row }) => <span className="font-medium">{row.original.product_name}</span>,
    },
    { accessorKey: "current_stock", header: t("inventory.stock") },
    {
      accessorFn: (r) => r.low_stock_threshold ?? defaultLow,
      id: "threshold",
      header: t("intelligence.threshold"),
    },
    { accessorKey: "velocity", header: t("intelligence.perDay"), cell: ({ row }) => row.original.velocity.toFixed(2) },
    {
      accessorKey: "suggested_reorder",
      header: t("intelligence.suggestedReorder"),
      cell: ({ row }) => (
        <Badge variant="secondary">{row.original.suggested_reorder}</Badge>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate("/inventory")}>
          <ArrowLeft />
        </Button>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Brain className="size-6" /> {t("intelligence.title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("intelligence.subtitle")}</p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">{t("intelligence.lastDays", { count: 7 })}</SelectItem>
            <SelectItem value="30">{t("intelligence.lastDays", { count: 30 })}</SelectItem>
            <SelectItem value="90">{t("intelligence.lastDays", { count: 90 })}</SelectItem>
            <SelectItem value="365">{t("intelligence.lastDays", { count: 365 })}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="fast">
        <TabsList>
          <TabsTrigger value="fast">
            <Flame className="size-4" /> {t("intelligence.fast")} ({fast.length})
          </TabsTrigger>
          <TabsTrigger value="slow">
            <Snowflake className="size-4" /> {t("intelligence.slow")} ({slow.length})
          </TabsTrigger>
          <TabsTrigger value="dead">
            <Skull className="size-4" /> {t("intelligence.dead")} ({dead.length})
          </TabsTrigger>
          <TabsTrigger value="reorder">
            <RotateCcw className="size-4" /> {t("intelligence.reorder")} ({reorder.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fast" className="mt-4">
          <DataTable
            columns={baseCols}
            data={fast}
            initialSorting={[{ id: "velocity", desc: true }]}
            emptyMessage={analytics.isLoading ? t("common.loading") : t("intelligence.noSales")}
          />
        </TabsContent>
        <TabsContent value="slow" className="mt-4">
          <DataTable
            columns={baseCols}
            data={slow}
            initialSorting={[{ id: "velocity", desc: false }]}
            emptyMessage={analytics.isLoading ? t("common.loading") : t("intelligence.nothingSlow")}
          />
        </TabsContent>
        <TabsContent value="dead" className="mt-4">
          <DataTable
            columns={baseCols}
            data={dead}
            initialSorting={[{ id: "current_stock", desc: true }]}
            emptyMessage={analytics.isLoading ? t("common.loading") : t("intelligence.noDead")}
          />
        </TabsContent>
        <TabsContent value="reorder" className="mt-4">
          <DataTable
            columns={reorderCols}
            data={reorder}
            initialSorting={[{ id: "current_stock", desc: false }]}
            emptyMessage={analytics.isLoading ? t("common.loading") : t("intelligence.healthy")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
