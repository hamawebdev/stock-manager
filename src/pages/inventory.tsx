import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  Package,
  TrendingUp,
  Brain,
  FileSpreadsheet,
  Download,
  Archive,
  ImageIcon,
  Tags,
  Barcode,
} from "lucide-react";
import { toast } from "sonner";
import {
  useProducts,
  useCurrency,
  useCategories,
  useBulkAssignCategory,
  useBulkArchive,
} from "@/lib/pos/queries";
import type { ProductSummary } from "@/lib/pos/catalog";
import { formatMoney } from "@/lib/money";
import { productImageSrc } from "@/lib/images";
import { ProductDetailSheet } from "@/components/inventory/product-detail-sheet";
import { LabelDesignerDialog } from "@/components/inventory/label-designer/label-designer-dialog";

export default function InventoryPage() {
  const { t } = useTranslation();
  const products = useProducts();
  const currency = useCurrency();
  const navigate = useNavigate();
  const categories = useCategories();
  const assignCategory = useBulkAssignCategory();
  const archiveMany = useBulkArchive();

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<string>("");
  const [designerOpen, setDesignerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(() => {
    const list = products.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.brand ?? "").toLowerCase().includes(q) ||
        (p.category_name ?? "").toLowerCase().includes(q) ||
        (p.reference ?? "").toLowerCase().includes(q),
    );
  }, [products.data, query]);

  const selected = useMemo(
    () => (products.data ?? []).find((p) => p.id === selectedId) ?? null,
    [products.data, selectedId],
  );

  function toggle(id: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allChecked = filtered.length > 0 && filtered.every((p) => checked.has(p.id));
  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(filtered.map((p) => p.id)));
  }

  async function applyCategory() {
    const ids = [...checked];
    const categoryId = bulkCategory === "none" ? null : Number(bulkCategory);
    try {
      await assignCategory.mutateAsync({ ids, categoryId });
      toast.success(t("inventory.updatedProducts", { count: ids.length }));
      setChecked(new Set());
      setBulkCategory("");
    } catch (e) {
      toast.error(t("inventory.couldNotAssign", { error: String(e) }));
    }
  }

  async function archiveSelected() {
    const ids = [...checked];
    if (!window.confirm(t("inventory.archiveConfirm", { count: ids.length }))) return;
    try {
      await archiveMany.mutateAsync(ids);
      toast.success(t("inventory.archivedProducts", { count: ids.length }));
      setChecked(new Set());
    } catch (e) {
      toast.error(t("inventory.couldNotArchive", { error: String(e) }));
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("inventory.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("inventory.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/inventory/best-sellers")}>
            <TrendingUp /> {t("inventory.bestSellers")}
          </Button>
          <Button variant="outline" onClick={() => navigate("/inventory/intelligence")}>
            <Brain /> {t("inventory.insights")}
          </Button>
          <Button variant="outline" onClick={() => navigate("/inventory/import")}>
            <FileSpreadsheet /> {t("common.import")}
          </Button>
          <Button variant="outline" disabled={exporting} onClick={exportCatalog}>
            <Download /> {t("common.export")}
          </Button>
          <Button variant="outline" onClick={() => setDesignerOpen(true)}>
            <Tags /> {t("labelDesigner.launch")}
          </Button>
          <Button onClick={() => navigate("/inventory/new")}>
            <Plus /> {t("inventory.createProduct")}
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="text-muted-foreground absolute top-1/2 start-3 size-4 -translate-y-1/2" />
        <Input
          className="ps-9"
          placeholder={t("inventory.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Bulk action bar */}
      {checked.size > 0 && (
        <div className="bg-accent/50 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
          <span className="text-sm font-medium">{t("inventory.selectedCount", { count: checked.size })}</span>
          <div className="flex items-center gap-2">
            <Select value={bulkCategory} onValueChange={setBulkCategory}>
              <SelectTrigger className="h-8 w-44">
                <SelectValue placeholder={t("inventory.assignCategoryPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("inventory.uncategorized")}</SelectItem>
                {categories.data?.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="secondary"
              disabled={!bulkCategory || assignCategory.isPending}
              onClick={applyCategory}
            >
              {t("inventory.assign")}
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => setDesignerOpen(true)}>
            <Barcode /> {t("inventory.printBarcodes")}
          </Button>
          <Button size="sm" variant="outline" onClick={archiveSelected}>
            <Archive /> {t("inventory.archive")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>
            {t("common.clear")}
          </Button>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={toggleAll}
                  aria-label={t("inventory.selectAll")}
                />
              </TableHead>
              <TableHead>{t("inventory.colProduct")}</TableHead>
              <TableHead>{t("inventory.colCategory")}</TableHead>
              <TableHead>{t("inventory.colBrand")}</TableHead>
              <TableHead className="text-end">{t("inventory.colVariants")}</TableHead>
              <TableHead className="text-end">{t("inventory.colOnHand")}</TableHead>
              <TableHead className="text-end">{t("inventory.colTotalPaid")}</TableHead>
              <TableHead className="text-end">{t("common.price")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow
                key={p.id}
                className="cursor-pointer"
                data-state={checked.has(p.id) ? "selected" : undefined}
                onClick={() => setSelectedId(p.id)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={checked.has(p.id)}
                    onCheckedChange={() => toggle(p.id)}
                    aria-label={t("inventory.selectProduct", { name: p.name })}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <ProductThumb path={p.primary_image_path} />
                    <span className="font-medium">{p.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.category_name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.brand ?? "—"}
                </TableCell>
                <TableCell className="text-end">{p.variant_count}</TableCell>
                <TableCell className="text-end">
                  <Badge variant={p.total_stock <= 0 ? "destructive" : "success"}>
                    {p.total_stock}
                  </Badge>
                </TableCell>
                <TableCell className="text-end">
                  {formatMoney(p.total_paid_cents, currency)}
                </TableCell>
                <TableCell className="text-end">
                  {formatMoney(p.price_cents, currency)}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center">
                  <Package className="text-muted-foreground mx-auto mb-2 size-8" />
                  <p className="text-muted-foreground text-sm">
                    {products.isLoading
                      ? t("common.loading")
                      : query
                        ? t("inventory.noMatch")
                        : t("inventory.empty")}
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ProductDetailSheet
        product={selected}
        onOpenChange={(o) => !o && setSelectedId(null)}
        onEditProduct={openEdit}
      />

      <LabelDesignerDialog
        open={designerOpen}
        onOpenChange={setDesignerOpen}
        initialProductIds={[...checked]}
      />
    </div>
  );

  function openEdit(p: ProductSummary) {
    navigate(`/inventory/${p.id}/edit`);
  }

  /** Export the full active catalog (one row per variant) to Excel. */
  async function exportCatalog() {
    setExporting(true);
    try {
      const [{ listCatalogForExport, catalogExportColumns }, { exportRowsToExcel }] =
        await Promise.all([
          import("@/lib/pos/catalog-io"),
          import("@/lib/export"),
        ]);
      const rows = await listCatalogForExport();
      if (rows.length === 0) {
        toast.error(t("inventory.exportEmpty"));
        return;
      }
      const date = new Date().toISOString().slice(0, 10);
      await exportRowsToExcel(
        rows,
        catalogExportColumns(currency.decimals),
        `products-export-${date}`,
        t("bulkImport.productsSheet"),
      );
    } catch (e) {
      toast.error(t("inventory.exportFailed", { error: String(e) }));
    } finally {
      setExporting(false);
    }
  }
}

/** Lazily-resolved product thumbnail (via the Tauri asset protocol). */
function ProductThumb({ path }: { path: string | null }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    productImageSrc(path)
      .then((s) => !cancelled && setSrc(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path || !src) {
    return (
      <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded">
        <ImageIcon className="size-4" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="size-8 shrink-0 rounded object-cover"
    />
  );
}
