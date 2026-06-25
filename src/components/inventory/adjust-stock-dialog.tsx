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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { useAdjustStock } from "@/lib/pos/queries";
import type { VariantDetail } from "@/lib/pos/types";
import type { MovementReason } from "@/lib/pos/types";

type Mode = "add" | "remove" | "set";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: number;
  variant: VariantDetail | null;
}

const REASON: Record<Mode, MovementReason> = {
  add: "receiving",
  remove: "adjustment",
  set: "stocktake",
};

export function AdjustStockDialog({
  open,
  onOpenChange,
  productId,
  variant,
}: Props) {
  const { t } = useTranslation();
  const adjust = useAdjustStock(productId);
  const [mode, setMode] = useState<Mode>("add");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setMode("add");
      setQty("");
      setNote("");
    }
  }, [open]);

  if (!variant) return null;

  const n = Number(qty);
  const valid = qty.trim() !== "" && Number.isFinite(n) && n >= 0;

  // Compute the signed delta to apply, given the chosen mode.
  function computeDelta(): number {
    if (mode === "add") return Math.round(n);
    if (mode === "remove") return -Math.round(n);
    return Math.round(n) - (variant!.stock); // set => diff from current
  }

  const delta = valid ? computeDelta() : 0;
  const resultStock = variant.stock + delta;

  async function handleApply() {
    if (!valid) {
      toast.error(t("inventory.adjustStock.invalidQty"));
      return;
    }
    if (delta === 0) {
      toast.message(t("inventory.adjustStock.noChange"));
      onOpenChange(false);
      return;
    }
    if (resultStock < 0) {
      toast.error(t("inventory.adjustStock.belowZero"));
      return;
    }
    try {
      await adjust.mutateAsync({
        variantId: variant!.id,
        delta,
        reason: REASON[mode],
        note: note.trim() || null,
      });
      toast.success(t("inventory.adjustStock.updated"));
      onOpenChange(false);
    } catch (err) {
      toast.error(t("inventory.adjustStock.couldNotAdjust", { error: String(err) }));
    }
  }

  const label = [variant.size_name, variant.color_name].filter(Boolean).join(" / ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("inventory.adjustStock.title")}</DialogTitle>
          <DialogDescription>
            {variant.product_name}
            {label ? ` — ${label}` : ""} · {t("inventory.adjustStock.onHand", { count: variant.stock })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => v && setMode(v as Mode)}
            className="justify-start"
          >
            <ToggleGroupItem value="add">{t("inventory.adjustStock.receive")}</ToggleGroupItem>
            <ToggleGroupItem value="remove">{t("common.remove")}</ToggleGroupItem>
            <ToggleGroupItem value="set">{t("inventory.adjustStock.setCount")}</ToggleGroupItem>
          </ToggleGroup>

          <div className="grid gap-2">
            <Label htmlFor="qty">
              {mode === "set" ? t("inventory.adjustStock.countedQty") : t("common.quantity")}
            </Label>
            <Input
              id="qty"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="note">{t("inventory.adjustStock.noteOptional")}</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("inventory.adjustStock.notePlaceholder")}
            />
          </div>

          {valid && (
            <p className="text-muted-foreground text-sm">
              {t("inventory.adjustStock.newOnHand")}: <span className="text-foreground font-medium">{resultStock}</span>{" "}
              ({delta >= 0 ? "+" : ""}
              {delta})
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleApply} disabled={adjust.isPending || !valid}>
            {t("common.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
