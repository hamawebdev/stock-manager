import { useEffect, useState } from "react";
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
      toast.error("Enter a valid quantity");
      return;
    }
    if (delta === 0) {
      toast.message("No change to apply");
      onOpenChange(false);
      return;
    }
    if (resultStock < 0) {
      toast.error("Stock cannot go below zero");
      return;
    }
    try {
      await adjust.mutateAsync({
        variantId: variant!.id,
        delta,
        reason: REASON[mode],
        note: note.trim() || null,
      });
      toast.success("Stock updated");
      onOpenChange(false);
    } catch (err) {
      toast.error(`Could not adjust stock: ${String(err)}`);
    }
  }

  const label = [variant.size_name, variant.color_name].filter(Boolean).join(" / ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {variant.product_name}
            {label ? ` — ${label}` : ""} · on hand: {variant.stock}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => v && setMode(v as Mode)}
            className="justify-start"
          >
            <ToggleGroupItem value="add">Receive</ToggleGroupItem>
            <ToggleGroupItem value="remove">Remove</ToggleGroupItem>
            <ToggleGroupItem value="set">Set count</ToggleGroupItem>
          </ToggleGroup>

          <div className="grid gap-2">
            <Label htmlFor="qty">
              {mode === "set" ? "Counted quantity" : "Quantity"}
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
            <Label htmlFor="note">Note (optional)</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. supplier delivery #123"
            />
          </div>

          {valid && (
            <p className="text-muted-foreground text-sm">
              New on-hand: <span className="text-foreground font-medium">{resultStock}</span>{" "}
              ({delta >= 0 ? "+" : ""}
              {delta})
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={adjust.isPending || !valid}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
