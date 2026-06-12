import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { searchVariants } from "@/lib/pos/catalog";
import { useCurrency } from "@/lib/pos/queries";
import { formatMoney } from "@/lib/money";
import type { VariantDetail } from "@/lib/pos/types";

function variantLabel(v: VariantDetail): string {
  return [v.size_name, v.color_name].filter(Boolean).join(" / ");
}

interface Props {
  onPick: (variant: VariantDetail) => void;
  placeholder?: string;
}

/** Search products/variants and pick one. Clears the query after a pick. */
export function VariantSearch({ onPick, placeholder }: Props) {
  const currency = useCurrency();
  const [query, setQuery] = useState("");

  const results = useQuery({
    queryKey: ["variant-search", query],
    queryFn: () => searchVariants(query, 12),
    enabled: query.trim().length > 0,
  });

  return (
    <div className="relative">
      <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        className="pl-9"
        placeholder={placeholder ?? "Search by name / SKU…"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() && (
        <div className="bg-popover absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border shadow-md">
          {results.data?.length ? (
            results.data.map((v) => (
              <button
                key={v.id}
                className="hover:bg-accent flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                onClick={() => {
                  onPick(v);
                  setQuery("");
                }}
              >
                <span>
                  {v.product_name}{" "}
                  <span className="text-muted-foreground">
                    {variantLabel(v)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant={v.stock <= 0 ? "destructive" : "secondary"}>
                    {v.stock}
                  </Badge>
                  {formatMoney(v.effective_price_cents, currency)}
                </span>
              </button>
            ))
          ) : (
            <p className="text-muted-foreground px-3 py-2 text-sm">
              {results.isFetching ? "Searching…" : "No matches."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
