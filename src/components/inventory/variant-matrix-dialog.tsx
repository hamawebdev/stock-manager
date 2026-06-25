import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useColors, useGenerateVariants, useSizes } from "@/lib/pos/queries";
import type { VariantSpec } from "@/lib/pos/catalog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: number;
  productName: string;
}

/**
 * Pick a set of sizes and colors; we create one variant per selected
 * (size x color) combination. Existing combinations are skipped server-side.
 */
export function VariantMatrixDialog({
  open,
  onOpenChange,
  productId,
  productName,
}: Props) {
  const { t } = useTranslation();
  const sizes = useSizes();
  const colors = useColors();
  const generate = useGenerateVariants();

  const [sizeIds, setSizeIds] = useState<Set<number>>(new Set());
  const [colorIds, setColorIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open) {
      setSizeIds(new Set());
      setColorIds(new Set());
    }
  }, [open]);

  function toggle(set: Set<number>, id: number): Set<number> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  const combos = sizeIds.size * colorIds.size;

  async function handleGenerate() {
    if (combos === 0) {
      toast.error(t("inventory.matrix.selectSizeColor"));
      return;
    }
    const specs: VariantSpec[] = [];
    for (const size_id of sizeIds) {
      for (const color_id of colorIds) {
        specs.push({ size_id, color_id });
      }
    }
    try {
      const created = await generate.mutateAsync({ productId, specs });
      const skipped = specs.length - created;
      const base = t("inventory.matrix.added", { count: created });
      toast.success(skipped > 0 ? `${base} ${t("inventory.matrix.alreadyExisted", { count: skipped })}` : base);
      onOpenChange(false);
    } catch (err) {
      toast.error(t("inventory.matrix.couldNotGenerate", { error: String(err) }));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("inventory.matrix.title", { name: productName })}</DialogTitle>
          <DialogDescription>{t("inventory.matrix.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          <div className="grid gap-2">
            <Label>{t("settings.lookups.sizes")}</Label>
            <div className="flex flex-wrap gap-3">
              {sizes.data?.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                >
                  <Checkbox
                    checked={sizeIds.has(s.id)}
                    onCheckedChange={() => setSizeIds((p) => toggle(p, s.id))}
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>{t("settings.lookups.colors")}</Label>
            <div className="flex flex-wrap gap-3">
              {colors.data?.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                >
                  <Checkbox
                    checked={colorIds.has(c.id)}
                    onCheckedChange={() => setColorIds((p) => toggle(p, c.id))}
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
        </div>

        <DialogFooter className="items-center justify-between sm:justify-between">
          <span className="text-muted-foreground text-sm">
            {t("inventory.matrix.toCreate", { count: combos })}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleGenerate} disabled={generate.isPending || combos === 0}>
              {t("inventory.form.generate")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
