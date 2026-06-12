import { useEffect, useMemo, useState } from "react";
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
import { formatMoney, parseMoney } from "@/lib/money";
import { useCurrency } from "@/lib/pos/queries";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalCents: number;
  busy?: boolean;
  onConfirm: (tenderedCents: number) => void;
}

/** Round a total up to common cash denominations for quick-tender buttons. */
function quickAmounts(total: number, factor: number): number[] {
  const steps = [1, 2, 5, 10, 20].map((d) => d * factor);
  const set = new Set<number>([total]);
  for (const step of steps) {
    set.add(Math.ceil(total / step) * step);
  }
  return [...set].filter((v) => v >= total).sort((a, b) => a - b).slice(0, 6);
}

export function PaymentDialog({
  open,
  onOpenChange,
  totalCents,
  busy,
  onConfirm,
}: Props) {
  const currency = useCurrency();
  const factor = 10 ** currency.decimals;
  const [tender, setTender] = useState("");

  useEffect(() => {
    if (open) setTender("");
  }, [open]);

  const tenderedCents = useMemo(
    () => parseMoney(tender || "0", currency.decimals) ?? 0,
    [tender, currency.decimals],
  );
  const change = tenderedCents - totalCents;
  const enough = tenderedCents >= totalCents;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cash payment</DialogTitle>
          <DialogDescription>
            Total due: {formatMoney(totalCents, currency)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="tender">Cash received</Label>
            <Input
              id="tender"
              inputMode="decimal"
              value={tender}
              onChange={(e) => setTender(e.target.value)}
              placeholder={formatMoney(totalCents, { ...currency, symbol: "" })}
              className="text-lg"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && enough && onConfirm(tenderedCents)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {quickAmounts(totalCents, factor).map((amt) => (
              <Button
                key={amt}
                variant="outline"
                size="sm"
                onClick={() =>
                  setTender(formatMoney(amt, { ...currency, symbol: "" }))
                }
              >
                {formatMoney(amt, currency)}
              </Button>
            ))}
          </div>

          <div className="bg-muted/50 flex items-center justify-between rounded-md px-3 py-2">
            <span className="text-muted-foreground text-sm">Change</span>
            <span className="text-lg font-semibold">
              {formatMoney(enough ? change : 0, currency)}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!enough || busy}
            onClick={() => onConfirm(tenderedCents)}
          >
            Complete sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
