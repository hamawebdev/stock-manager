/**
 * Product & transaction area: scan, search, browse by category/brand, and add
 * items to the cart from a visual card grid. Optimised for clothing retail —
 * cards show the product image, on-hand stock and price; tapping a card opens
 * the size/color variant picker.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Search, Package, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useProductsPage,
  useCategories,
  useBrands,
  useCurrency,
  useInventorySettings,
} from "@/lib/pos/queries";
import { useBarcodeScanner } from "@/lib/pos/use-scanner";
import { findVariantByBarcode, searchVariants } from "@/lib/pos/catalog";
import { useQuery } from "@tanstack/react-query";
import { productImageSrc } from "@/lib/images";
import { formatMoney } from "@/lib/money";
import { variantDescription, variantLabel } from "@/lib/pos/labels";
import { VariantPicker } from "./variant-picker";
import type { ProductSummary } from "@/lib/pos/catalog";
import type { VariantDetail } from "@/lib/pos/types";

interface Props {
  /** Add a chosen variant to the cart. */
  onAddVariant: (variant: VariantDetail) => void;
  /** Disable the scanner when a blocking overlay is open. */
  scannerEnabled?: boolean;
}

export function ProductBrowser({ onAddVariant, scannerEnabled = true }: Props) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const categories = useCategories();
  const brands = useBrands();
  const invSettings = useInventorySettings();

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ id: number; name: string } | null>(null);

  const page = useProductsPage({
    search,
    categoryId,
    brand,
    stockStatus: "all",
    defaultLowStock: invSettings.data?.default_low_stock_threshold ?? 5,
    limit: 60,
    offset: 0,
  });

  // Free-text variant matches (name / SKU / barcode) — quick add without the grid.
  const variantHits = useQuery({
    queryKey: ["pos-variant-search", search],
    queryFn: () => searchVariants(search, 8),
    enabled: search.trim().length > 0,
  });

  // Keyboard-wedge scanner: exact barcode → straight into the cart.
  useBarcodeScanner(
    async (code) => {
      const v = await findVariantByBarcode(code);
      if (v) {
        onAddVariant(v);
        toast.success(t("payments.browser.added", { item: variantDescription(v) }));
      } else {
        toast.error(t("payments.browser.noBarcode", { code }));
      }
    },
    { enabled: scannerEnabled },
  );

  function pickVariant(v: VariantDetail) {
    onAddVariant(v);
    setPicker(null);
    setSearch("");
  }

  const rows = page.data?.rows ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Search + scan */}
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 start-3 size-4 -translate-y-1/2" />
        <Input
          data-pos-search
          className="ps-9"
          placeholder={t("payments.browser.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        {search.trim() && (variantHits.data?.length ?? 0) > 0 && (
          <div className="bg-popover absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border shadow-md">
            {variantHits.data!.map((v) => (
              <button
                key={v.id}
                className="hover:bg-accent flex w-full items-center justify-between px-3 py-2 text-start text-sm"
                onClick={() => pickVariant(v)}
              >
                <span>
                  {v.product_name}{" "}
                  <span className="text-muted-foreground">{variantLabel(v)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant={v.stock <= 0 ? "destructive" : "success"}>
                    {v.stock}
                  </Badge>
                  {formatMoney(v.effective_price_cents, currency)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Category + brand filter dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          size="sm"
          className="min-w-36"
          value={categoryId ?? ""}
          onChange={(e) =>
            setCategoryId(e.target.value ? Number(e.target.value) : null)
          }
        >
          <NativeSelectOption value="">
            {t("payments.browser.category")}
          </NativeSelectOption>
          {categories.data?.map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>
              {c.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <NativeSelect
          size="sm"
          className="min-w-36"
          value={brand ?? ""}
          onChange={(e) => setBrand(e.target.value || null)}
        >
          <NativeSelectOption value="">
            {t("payments.browser.brand")}
          </NativeSelectOption>
          {brands.data?.map((b) => (
            <NativeSelectOption key={b} value={b}>
              {b}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {/* Card grid */}
      <ScrollArea className="min-h-0 flex-1 rounded-md border">
        {page.isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-muted-foreground flex h-48 flex-col items-center justify-center gap-2">
            <Package className="size-7" />
            <p className="text-sm">{t("payments.browser.noProducts")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {rows.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                currency={currency}
                onClick={() => setPicker({ id: p.id, name: p.name })}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <VariantPicker
        productId={picker?.id ?? null}
        productName={picker?.name ?? ""}
        onPick={pickVariant}
        onClose={() => setPicker(null)}
      />
    </div>
  );
}

function ProductCard({
  product,
  currency,
  onClick,
}: {
  product: ProductSummary;
  currency: ReturnType<typeof useCurrency>;
  onClick: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    // No image → leave `src` null (the placeholder renders). Resolving the
    // asset URL is async, so the setState below runs after an await, not
    // synchronously in the effect body.
    if (!product.primary_image_path) return;
    let alive = true;
    productImageSrc(product.primary_image_path)
      .then((url) => alive && setSrc(url))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [product.primary_image_path]);

  const out = product.total_stock <= 0;

  return (
    <button
      onClick={onClick}
      className="hover:border-primary group flex flex-col overflow-hidden rounded-lg border text-start transition-colors"
    >
      <div className="bg-muted relative aspect-square w-full">
        {src ? (
          <img src={src} alt={product.name} className="size-full object-cover" />
        ) : (
          <div className="text-muted-foreground flex size-full items-center justify-center">
            <Package className="size-7" />
          </div>
        )}
        <Badge
          variant={out ? "destructive" : "success"}
          className="absolute top-1 end-1"
        >
          {product.total_stock}
        </Badge>
      </div>
      <div className="flex flex-col gap-0.5 p-2">
        <p className="truncate text-sm font-medium">{product.name}</p>
        <p className="text-muted-foreground truncate text-xs">
          {product.category_name ?? product.brand ?? "—"}
        </p>
        <p className="text-sm font-semibold">
          {formatMoney(product.price_cents, currency)}
        </p>
      </div>
    </button>
  );
}
