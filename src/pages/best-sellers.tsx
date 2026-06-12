import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, subDays } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, FileDown, FileText, Search, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import {
  useBestSellers,
  useCategories,
  useCurrency,
  useInventorySettings,
} from "@/lib/pos/queries";
import type { BestSellerProduct } from "@/lib/pos/reports";
import { formatMoney } from "@/lib/money";
import type { ExportColumn } from "@/lib/export";
import { toast } from "sonner";

type StockStatus = "in" | "low" | "out";

function stockStatus(
  stock: number,
  threshold: number | null,
  defaultLow: number,
): StockStatus {
  if (stock <= 0) return "out";
  if (stock <= (threshold ?? defaultLow)) return "low";
  return "in";
}

const STATUS_META: Record<StockStatus, { label: string; variant: "secondary" | "destructive" | "outline" }> = {
  in: { label: "In stock", variant: "secondary" },
  low: { label: "Low", variant: "outline" },
  out: { label: "Out", variant: "destructive" },
};

const today = () => format(new Date(), "yyyy-MM-dd");

export default function BestSellersPage() {
  const navigate = useNavigate();
  const currency = useCurrency();
  const categories = useCategories();
  const inv = useInventorySettings();
  const defaultLow = inv.data?.default_low_stock_threshold ?? 5;

  const [from, setFrom] = useState(() => format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<"all" | StockStatus>("all");

  const best = useBestSellers({ from, to });

  const money = (cents: number) => formatMoney(cents, currency);

  // Apply category + status filters client-side (search handled by the table).
  const rows = useMemo(() => {
    let list = best.data ?? [];
    if (category !== "all") {
      list = list.filter((r) => (r.category_name ?? "—") === category);
    }
    if (status !== "all") {
      list = list.filter(
        (r) => stockStatus(r.current_stock, r.low_stock_threshold, defaultLow) === status,
      );
    }
    return list;
  }, [best.data, category, status, defaultLow]);

  function setPreset(days: number | "all") {
    if (days === "all") {
      setFrom("2000-01-01");
      setTo(today());
    } else {
      setFrom(format(subDays(new Date(), days - 1), "yyyy-MM-dd"));
      setTo(today());
    }
  }

  const columns: ColumnDef<BestSellerProduct>[] = useMemo(
    () => [
      {
        accessorKey: "product_name",
        header: "Product",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.product_name}</span>
        ),
      },
      {
        accessorKey: "reference",
        header: "SKU",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.reference ?? "—"}
          </span>
        ),
      },
      {
        accessorFn: (r) => r.category_name ?? "—",
        id: "category",
        header: "Category",
      },
      { accessorKey: "units_sold", header: "Units sold" },
      {
        accessorKey: "revenue_cents",
        header: "Revenue",
        cell: ({ row }) => formatMoney(row.original.revenue_cents, currency),
      },
      { accessorKey: "current_stock", header: "Stock" },
      {
        id: "status",
        accessorFn: (r) =>
          stockStatus(r.current_stock, r.low_stock_threshold, defaultLow),
        header: "Status",
        cell: ({ row }) => {
          const s = stockStatus(
            row.original.current_stock,
            row.original.low_stock_threshold,
            defaultLow,
          );
          return <Badge variant={STATUS_META[s].variant}>{STATUS_META[s].label}</Badge>;
        },
      },
      {
        accessorKey: "last_sale_date",
        header: "Last sale",
        cell: ({ row }) =>
          row.original.last_sale_date
            ? format(new Date(row.original.last_sale_date), "yyyy-MM-dd")
            : "—",
      },
    ],
    [currency, defaultLow],
  );

  const exportColumns: ExportColumn<BestSellerProduct>[] = [
    { header: "Product", value: (r) => r.product_name },
    { header: "SKU", value: (r) => r.reference ?? "" },
    { header: "Category", value: (r) => r.category_name ?? "" },
    { header: "Units Sold", value: (r) => r.units_sold },
    { header: "Revenue", value: (r) => money(r.revenue_cents) },
    { header: "Current Stock", value: (r) => r.current_stock },
    {
      header: "Stock Status",
      value: (r) =>
        STATUS_META[stockStatus(r.current_stock, r.low_stock_threshold, defaultLow)]
          .label,
    },
    { header: "Last Sale", value: (r) => r.last_sale_date ?? "" },
  ];

  async function onExport(kind: "excel" | "pdf") {
    if (rows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const name = `best-sellers_${from}_to_${to}`;
    try {
      // Lazy-load the export libs (xlsx / jspdf) only when actually exporting.
      const { exportRowsToExcel, exportRowsToPdf } = await import("@/lib/export");
      if (kind === "excel") {
        await exportRowsToExcel(rows, exportColumns, name, "Best Sellers");
      } else {
        await exportRowsToPdf(rows, exportColumns, name, `Best Selling Products (${from} → ${to})`);
      }
    } catch (e) {
      toast.error(`Export failed: ${String(e)}`);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate("/inventory")}>
          <ArrowLeft />
        </Button>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <TrendingUp className="size-6" /> Best selling products
          </h1>
          <p className="text-muted-foreground text-sm">
            Units sold, revenue and stock health over a date range.
          </p>
        </div>
        <Button variant="outline" onClick={() => onExport("excel")}>
          <FileDown /> Excel
        </Button>
        <Button variant="outline" onClick={() => onExport("pdf")}>
          <FileText /> PDF
        </Button>
      </div>

      {/* Filters */}
      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.data?.map((c) => (
                <SelectItem key={c.id} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Stock status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="in">In stock</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="out">Out of stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          <span className="text-muted-foreground text-xs">Quick range:</span>
          {[7, 30, 90].map((d) => (
            <Button key={d} variant="outline" size="sm" onClick={() => setPreset(d)}>
              {d}d
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => setPreset("all")}>
            All time
          </Button>
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        globalFilter={search}
        onGlobalFilterChange={setSearch}
        initialSorting={[{ id: "units_sold", desc: true }]}
        pageSize={15}
        emptyMessage={best.isLoading ? "Loading…" : "No sales in this range."}
      />
    </div>
  );
}
