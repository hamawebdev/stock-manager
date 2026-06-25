import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/money";
import { useCategories, useCurrency, useVariantSearch } from "@/lib/pos/queries";
import type { VariantDetail } from "@/lib/pos/types";

interface Props {
  onPick: (variant: VariantDetail) => void;
}

/** Searchable product/variant grid; clicking a card adds it to the purchase. */
export function PurchaseProductGrid({ onPick }: Props) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const categories = useCategories();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const variants = useVariantSearch(search);

  const filtered = useMemo(() => {
    const rows = variants.data ?? [];
    if (categoryId === "all") return rows;
    return rows.filter((v) => String(v.category_id) === categoryId);
  }, [variants.data, categoryId]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("purchasing.searchProduct")}
          className="flex-1"
        />
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("purchasing.category")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            {(categories.data ?? []).map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {variants.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            {t("inventory.empty.title", { defaultValue: "No products" })}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {filtered.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onPick(v)}
                className="bg-card hover:border-primary flex flex-col rounded-xl border p-3 text-start transition"
              >
                <span className="line-clamp-2 text-sm font-medium">
                  {v.product_name}
                </span>
                <span className="text-muted-foreground text-xs">{v.sku}</span>
                <span className="mt-2 text-sm font-semibold">
                  {formatMoney(v.cost_cents ?? v.effective_price_cents, currency)}
                </span>
                <span className="text-muted-foreground text-xs">
                  {v.stock} {t("purchasing.unit")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
