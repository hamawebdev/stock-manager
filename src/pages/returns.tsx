import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { VariantSearch } from "@/components/pos/variant-search";
import { useProcessReturn, useCurrency } from "@/lib/pos/queries";
import { findSaleByCode, getSaleItems } from "@/lib/pos/sales";
import { formatMoney } from "@/lib/money";
import type { VariantDetail } from "@/lib/pos/types";

interface InRow {
  key: string;
  variant_id: number;
  sale_item_id: number | null;
  description: string;
  qty: number;
  maxQty: number | null; // remaining returnable qty when tied to a sale line
  unit_price_cents: number;
  restock: boolean;
}

interface OutRow {
  key: string;
  variant_id: number;
  description: string;
  qty: number;
  unit_price_cents: number;
}

let keySeq = 0;
const nextKey = () => `r${keySeq++}`;

export default function ReturnsPage() {
  const currency = useCurrency();
  const processReturn = useProcessReturn();

  const [saleCode, setSaleCode] = useState("");
  const [saleId, setSaleId] = useState<number | null>(null);
  const [inRows, setInRows] = useState<InRow[]>([]);
  const [outRows, setOutRows] = useState<OutRow[]>([]);

  async function loadSale() {
    const code = saleCode.trim();
    if (!code) return;
    const sale = await findSaleByCode(code);
    if (!sale) {
      toast.error(`No sale with code ${code}`);
      return;
    }
    const items = await getSaleItems(sale.id);
    setSaleId(sale.id);
    setInRows(
      items.map((it) => ({
        key: nextKey(),
        variant_id: it.variant_id,
        sale_item_id: it.id,
        description: it.description,
        qty: Math.max(0, it.qty - it.qty_returned),
        maxQty: Math.max(0, it.qty - it.qty_returned),
        unit_price_cents: it.unit_price_cents,
        restock: true,
      })),
    );
    toast.success(`Loaded sale ${sale.code}`);
  }

  function addManualReturn(v: VariantDetail) {
    setInRows((rows) => [
      ...rows,
      {
        key: nextKey(),
        variant_id: v.id,
        sale_item_id: null,
        description: `${v.product_name} ${[v.size_name, v.color_name].filter(Boolean).join(" / ")}`.trim(),
        qty: 1,
        maxQty: null,
        unit_price_cents: v.effective_price_cents,
        restock: true,
      },
    ]);
  }

  function addExchange(v: VariantDetail) {
    setOutRows((rows) => [
      ...rows,
      {
        key: nextKey(),
        variant_id: v.id,
        description: `${v.product_name} ${[v.size_name, v.color_name].filter(Boolean).join(" / ")}`.trim(),
        qty: 1,
        unit_price_cents: v.effective_price_cents,
      },
    ]);
  }

  const patchIn = (key: string, patch: Partial<InRow>) =>
    setInRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const patchOut = (key: string, patch: Partial<OutRow>) =>
    setOutRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const returnValue = inRows.reduce((s, r) => s + r.qty * r.unit_price_cents, 0);
  const exchangeValue = outRows.reduce((s, r) => s + r.qty * r.unit_price_cents, 0);
  const net = returnValue - exchangeValue; // >0 refund customer, <0 collect

  function reset() {
    setSaleCode("");
    setSaleId(null);
    setInRows([]);
    setOutRows([]);
  }

  async function handleProcess() {
    const inItems = inRows.filter((r) => r.qty > 0);
    if (inItems.length === 0) {
      toast.error("Add at least one item to return");
      return;
    }
    try {
      const result = await processReturn.mutateAsync({
        original_sale_id: saleId,
        inItems: inItems.map((r) => ({
          variant_id: r.variant_id,
          sale_item_id: r.sale_item_id,
          description: r.description,
          qty: r.qty,
          unit_price_cents: r.unit_price_cents,
          restock: r.restock,
        })),
        outItems: outRows
          .filter((r) => r.qty > 0)
          .map((r) => ({
            variant_id: r.variant_id,
            description: r.description,
            qty: r.qty,
            unit_price_cents: r.unit_price_cents,
          })),
      });
      const settle =
        result.net_cash_cents >= 0
          ? `refund ${formatMoney(result.net_cash_cents, currency)}`
          : `collect ${formatMoney(-result.net_cash_cents, currency)}`;
      toast.success(`${result.code} (${result.kind}) — ${settle}`);
      reset();
    } catch (err) {
      toast.error(`Could not process: ${String(err)}`);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Returns &amp; Exchanges</h1>
        <p className="text-muted-foreground text-sm">
          Look up a receipt or add items manually. Add replacement items to make
          it an exchange.
        </p>
      </div>

      {/* Receipt lookup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Original receipt (optional)</CardTitle>
          <CardDescription>
            Enter the receipt code to pre-fill returnable items.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            placeholder="e.g. S-000123"
            value={saleCode}
            onChange={(e) => setSaleCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadSale()}
            className="max-w-xs"
          />
          <Button variant="outline" onClick={loadSale}>
            Look up
          </Button>
        </CardContent>
      </Card>

      {/* Items being returned */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items being returned</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <VariantSearch
            onPick={addManualReturn}
            placeholder="Add a returned item by name / SKU…"
          />
          {inRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No items yet.</p>
          ) : (
            <ul className="divide-y">
              {inRows.map((r) => (
                <li key={r.key} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{r.description}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatMoney(r.unit_price_cents, currency)} each
                      {r.maxQty != null ? ` · max ${r.maxQty}` : " · no receipt"}
                    </p>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={r.restock}
                      onCheckedChange={(c) => patchIn(r.key, { restock: !!c })}
                    />
                    Restock
                  </label>
                  <Input
                    className="h-8 w-16 text-right"
                    inputMode="numeric"
                    value={String(r.qty)}
                    onChange={(e) => {
                      let q = Math.max(0, Number(e.target.value) || 0);
                      if (r.maxQty != null) q = Math.min(q, r.maxQty);
                      patchIn(r.key, { qty: q });
                    }}
                  />
                  <span className="w-20 text-right text-sm font-medium">
                    {formatMoney(r.qty * r.unit_price_cents, currency)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      setInRows((rows) => rows.filter((x) => x.key !== r.key))
                    }
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Exchange items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Replacement items (exchange)</CardTitle>
          <CardDescription>
            Optional. Add items the customer takes in exchange.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <VariantSearch
            onPick={addExchange}
            placeholder="Add a replacement item by name / SKU…"
          />
          {outRows.length > 0 && (
            <ul className="divide-y">
              {outRows.map((r) => (
                <li key={r.key} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{r.description}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatMoney(r.unit_price_cents, currency)} each
                    </p>
                  </div>
                  <Input
                    className="h-8 w-16 text-right"
                    inputMode="numeric"
                    value={String(r.qty)}
                    onChange={(e) =>
                      patchOut(r.key, {
                        qty: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                  <span className="w-20 text-right text-sm font-medium">
                    {formatMoney(r.qty * r.unit_price_cents, currency)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      setOutRows((rows) => rows.filter((x) => x.key !== r.key))
                    }
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Settlement */}
      <Card>
        <CardContent className="space-y-2 pt-6">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Returned value</span>
            <span>{formatMoney(returnValue, currency)}</span>
          </div>
          {exchangeValue > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Replacement value</span>
              <span>-{formatMoney(exchangeValue, currency)}</span>
            </div>
          )}
          <div className="flex items-center justify-between border-t pt-2">
            <span className="font-semibold">
              {net >= 0 ? "Refund to customer" : "Collect from customer"}
            </span>
            <span className="text-xl font-bold">
              {formatMoney(Math.abs(net), currency)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 pt-2">
            <Badge variant="outline">
              {outRows.length > 0 ? "Exchange" : "Refund"}
            </Badge>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={reset}>
                Cancel
              </Button>
              <Button
                onClick={handleProcess}
                disabled={processReturn.isPending || inRows.length === 0}
              >
                Process
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
