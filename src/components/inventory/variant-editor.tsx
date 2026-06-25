import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Boxes, Layers, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useColors, useSizes } from "@/lib/pos/queries";
import { generateBarcode, type BarcodeSymbology } from "@/lib/pos/barcode";

export interface VariantRow {
  key: string;
  /** Present when the row maps to an existing saved variant (edit mode). */
  variantId?: number;
  size_id: number | null;
  color_id: number | null;
  size_name: string;
  color_name: string;
  color_hex: string | null;
  sku: string; // "" => auto (canonical SKU assigned on save)
  barcode: string; // "" => equals SKU
  stock: string; // numeric string
}

interface Props {
  hasVariants: boolean;
  onToggle: (hasVariants: boolean) => void;
  simpleStock: string;
  onSimpleStock: (v: string) => void;
  rows: VariantRow[];
  onRows: (rows: VariantRow[]) => void;
  symbology: BarcodeSymbology;
  barcodePrefix: string;
}

/**
 * Inventory section: pick "simple" (one default variant carrying a single stock
 * count) or "variants" (a size x color grid with per-row stock / SKU / barcode).
 * Keeps the existing size x color model — a simple product is just one variant
 * with no size/color.
 */
export function VariantEditor({
  hasVariants,
  onToggle,
  simpleStock,
  onSimpleStock,
  rows,
  onRows,
  symbology,
  barcodePrefix,
}: Props) {
  const { t } = useTranslation();
  const sizes = useSizes();
  const colors = useColors();
  const [sizeIds, setSizeIds] = useState<Set<number>>(new Set());
  const [colorIds, setColorIds] = useState<Set<number>>(new Set());

  function toggleSet(set: Set<number>, id: number): Set<number> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function addCombinations() {
    const sizeList = sizes.data?.filter((s) => sizeIds.has(s.id)) ?? [];
    const colorList = colors.data?.filter((c) => colorIds.has(c.id)) ?? [];
    if (sizeList.length === 0 && colorList.length === 0) {
      toast.error(t("inventory.variantEditor.selectSizeColor"));
      return;
    }
    // Allow size-only or color-only grids by treating an empty axis as [null].
    const sAxis = sizeList.length ? sizeList : [null];
    const cAxis = colorList.length ? colorList : [null];
    const next = [...rows];
    let added = 0;
    for (const s of sAxis) {
      for (const c of cAxis) {
        const sid = s?.id ?? null;
        const cid = c?.id ?? null;
        if (next.some((r) => r.size_id === sid && r.color_id === cid)) continue;
        next.push({
          key: crypto.randomUUID(),
          size_id: sid,
          color_id: cid,
          size_name: s?.name ?? "—",
          color_name: c?.name ?? "—",
          color_hex: c?.hex ?? null,
          sku: "",
          barcode: "",
          stock: "0",
        });
        added++;
      }
    }
    onRows(next);
    setSizeIds(new Set());
    setColorIds(new Set());
    if (added === 0) toast.info(t("inventory.variantEditor.alreadyExist"));
  }

  function updateRow(key: string, patch: Partial<VariantRow>) {
    onRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    onRows(rows.filter((r) => r.key !== key));
  }

  async function genRowBarcode(key: string) {
    try {
      const code = await generateBarcode(symbology, { prefix: barcodePrefix });
      updateRow(key, { barcode: code });
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="grid gap-4">
      {/* Simple / Variants toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onToggle(false)}
          className={cn(
            "flex items-center gap-2 rounded-lg border p-3 text-start text-sm transition-colors",
            !hasVariants ? "border-primary bg-primary/5" : "hover:bg-accent/40",
          )}
        >
          <Boxes className="size-5 shrink-0" />
          <span>
            <span className="block font-medium">{t("inventory.variantEditor.simpleProduct")}</span>
            <span className="text-muted-foreground text-xs">{t("inventory.variantEditor.oneStockCount")}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => onToggle(true)}
          className={cn(
            "flex items-center gap-2 rounded-lg border p-3 text-start text-sm transition-colors",
            hasVariants ? "border-primary bg-primary/5" : "hover:bg-accent/40",
          )}
        >
          <Layers className="size-5 shrink-0" />
          <span>
            <span className="block font-medium">{t("inventory.variantEditor.hasVariants")}</span>
            <span className="text-muted-foreground text-xs">
              {t("inventory.variantEditor.hasVariantsHint")}
            </span>
          </span>
        </button>
      </div>

      {!hasVariants ? (
        <div className="grid max-w-xs gap-2">
          <Label htmlFor="simple-stock">{t("inventory.variantEditor.currentStock")}</Label>
          <Input
            id="simple-stock"
            inputMode="numeric"
            value={simpleStock}
            onChange={(e) => onSimpleStock(e.target.value)}
            placeholder="0"
          />
        </div>
      ) : (
        <div className="grid gap-4">
          {/* Size / color pickers */}
          <div className="grid gap-3 rounded-lg border p-3">
            <div className="grid gap-2">
              <Label>{t("settings.lookups.sizes")}</Label>
              <div className="flex flex-wrap gap-2">
                {sizes.data?.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm"
                  >
                    <Checkbox
                      checked={sizeIds.has(s.id)}
                      onCheckedChange={() => setSizeIds((p) => toggleSet(p, s.id))}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("settings.lookups.colors")}</Label>
              <div className="flex flex-wrap gap-2">
                {colors.data?.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm"
                  >
                    <Checkbox
                      checked={colorIds.has(c.id)}
                      onCheckedChange={() => setColorIds((p) => toggleSet(p, c.id))}
                    />
                    {c.hex && (
                      <span
                        className="size-3 rounded-full border"
                        style={{ backgroundColor: c.hex }}
                      />
                    )}
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Button type="button" variant="secondary" size="sm" onClick={addCombinations}>
                <Plus className="size-4" /> {t("inventory.variantEditor.addCombinations")}
              </Button>
            </div>
          </div>

          {/* Editable variant rows */}
          {rows.length > 0 ? (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("inventory.variantEditor.variant")}</TableHead>
                    <TableHead>{t("inventory.form.sku")}</TableHead>
                    <TableHead>{t("inventory.barcode")}</TableHead>
                    <TableHead className="w-24 text-end">{t("inventory.stock")}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          {r.color_hex && (
                            <span
                              className="size-3 rounded-full border"
                              style={{ backgroundColor: r.color_hex }}
                            />
                          )}
                          {r.size_name} / {r.color_name}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 w-32 font-mono text-xs"
                          value={r.sku}
                          placeholder={t("inventory.variantEditor.autoPlaceholder")}
                          onChange={(e) => updateRow(r.key, { sku: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Input
                            className="h-8 w-32 font-mono text-xs"
                            value={r.barcode}
                            placeholder={t("inventory.variantEditor.equalsSkuPlaceholder")}
                            onChange={(e) =>
                              updateRow(r.key, { barcode: e.target.value })
                            }
                          />
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            title={t("inventory.variantEditor.generateBarcode")}
                            onClick={() => genRowBarcode(r.key)}
                          >
                            <RefreshCw className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-end">
                        <Input
                          className="h-8 w-20 text-end"
                          inputMode="numeric"
                          value={r.stock}
                          onChange={(e) => updateRow(r.key, { stock: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          title={t("common.remove")}
                          onClick={() => removeRow(r.key)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-sm">
              {t("inventory.variantEditor.pickHint")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
