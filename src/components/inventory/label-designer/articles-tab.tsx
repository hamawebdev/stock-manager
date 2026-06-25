import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Plus, Minus, X, Tags } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import * as catalog from "@/lib/pos/catalog";
import type { VariantDetail } from "@/lib/pos/types";
import { useLabelDesignerStore } from "@/store/use-label-designer-store";

/** Compact "size / color" descriptor for a variant. */
function variantLabel(v: VariantDetail): string {
  return [v.size_name, v.color_name].filter(Boolean).join(" / ");
}

export function ArticlesTab() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VariantDetail[]>([]);

  const basket = useLabelDesignerStore((s) => s.basket);
  const previewIndex = useLabelDesignerStore((s) => s.previewIndex);
  const addBasketItem = useLabelDesignerStore((s) => s.addBasketItem);
  const removeBasketItem = useLabelDesignerStore((s) => s.removeBasketItem);
  const setQty = useLabelDesignerStore((s) => s.setQty);
  const setPreviewIndex = useLabelDesignerStore((s) => s.setPreviewIndex);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const id = setTimeout(() => {
      catalog
        .searchVariants(q, 20)
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query]);

  const inBasket = new Set(basket.map((b) => b.variant.id));

  async function add(v: VariantDetail) {
    const product = await catalog.getProduct(v.product_id).catch(() => null);
    addBasketItem({ variant: v, reference: product?.reference ?? null, qty: 1 });
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 start-3 size-4 -translate-y-1/2" />
        <Input
          className="ps-9"
          placeholder={t("labelDesigner.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {results.length > 0 && (
        <div className="max-h-44 overflow-auto rounded-md border">
          {results.map((v) => (
            <button
              key={v.id}
              type="button"
              disabled={inBasket.has(v.id)}
              onClick={() => add(v)}
              className="hover:bg-accent flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm disabled:opacity-40"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{v.product_name}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  {[variantLabel(v), v.barcode].filter(Boolean).join(" · ")}
                </span>
              </span>
              <Plus className="size-4 shrink-0" />
            </button>
          ))}
        </div>
      )}

      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span className="font-semibold tracking-wide uppercase">{t("labelDesigner.basket")}</span>
        <span>{t("labelDesigner.basketCount", { count: basket.length })}</span>
      </div>

      <ScrollArea className="min-h-0 flex-1 rounded-md border">
        {basket.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 p-8 text-center text-sm">
            <Tags className="size-7" />
            {t("labelDesigner.basketEmpty")}
          </div>
        ) : (
          <ul className="divide-y">
            {basket.map((item, i) => (
              <li
                key={item.variant.id}
                onClick={() => setPreviewIndex(i)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-3 py-2",
                  i === previewIndex && "bg-accent/60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {item.variant.product_name}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {[variantLabel(item.variant), item.variant.barcode]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <div
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setQty(item.variant.id, item.qty - 1)}
                  >
                    <Minus />
                  </Button>
                  <span className="w-7 text-center text-sm tabular-nums">{item.qty}</span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setQty(item.variant.id, item.qty + 1)}
                  >
                    <Plus />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeBasketItem(item.variant.id)}
                  >
                    <X />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
