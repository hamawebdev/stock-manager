import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  Archive,
  ImageIcon,
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

export default function InventoryPage() {
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
      toast.success(`Updated ${ids.length} products`);
      setChecked(new Set());
      setBulkCategory("");
    } catch (e) {
      toast.error(`Could not assign category: ${String(e)}`);
    }
  }

  async function archiveSelected() {
    const ids = [...checked];
    if (!window.confirm(`Archive ${ids.length} products?`)) return;
    try {
      await archiveMany.mutateAsync(ids);
      toast.success(`Archived ${ids.length} products`);
      setChecked(new Set());
    } catch (e) {
      toast.error(`Could not archive: ${String(e)}`);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground text-sm">
            Products and their size/color variants.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/inventory/best-sellers")}>
            <TrendingUp /> Best sellers
          </Button>
          <Button variant="outline" onClick={() => navigate("/inventory/intelligence")}>
            <Brain /> Insights
          </Button>
          <Button variant="outline" onClick={() => navigate("/inventory/import")}>
            <FileSpreadsheet /> Import
          </Button>
          <Button onClick={() => navigate("/inventory/new")}>
            <Plus /> Create product
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          className="pl-9"
          placeholder="Search products…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Bulk action bar */}
      {checked.size > 0 && (
        <div className="bg-accent/50 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
          <span className="text-sm font-medium">{checked.size} selected</span>
          <div className="flex items-center gap-2">
            <Select value={bulkCategory} onValueChange={setBulkCategory}>
              <SelectTrigger className="h-8 w-44">
                <SelectValue placeholder="Assign category…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Uncategorized</SelectItem>
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
              Assign
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={archiveSelected}>
            <Archive /> Archive
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>
            Clear
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
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead className="text-right">Variants</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="text-right">Price</TableHead>
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
                    aria-label={`Select ${p.name}`}
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
                <TableCell className="text-right">{p.variant_count}</TableCell>
                <TableCell className="text-right">
                  <Badge variant={p.total_stock <= 0 ? "destructive" : "secondary"}>
                    {p.total_stock}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {formatMoney(p.price_cents, currency)}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center">
                  <Package className="text-muted-foreground mx-auto mb-2 size-8" />
                  <p className="text-muted-foreground text-sm">
                    {products.isLoading
                      ? "Loading…"
                      : query
                        ? "No products match your search."
                        : "No products yet. Create your first one."}
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
    </div>
  );

  function openEdit(p: ProductSummary) {
    navigate(`/inventory/${p.id}/edit`);
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
