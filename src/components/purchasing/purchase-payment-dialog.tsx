import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney, parseMoney } from "@/lib/money";
import { useAddSupplierPayment, useCurrency } from "@/lib/pos/queries";
import type { SupplierPaymentMethod } from "@/lib/pos/types";

const METHODS: SupplierPaymentMethod[] = ["cash", "cheque", "transfer", "card_other"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: number;
  purchaseId: number;
  totalCents: number;
  /** Pre-fill the full total (Paid in Full) vs leave empty (Partial). */
  prefillFull: boolean;
  onDone: () => void;
}

/** Captures the payment made when a purchase is validated (cash/partial terms). */
export function PurchasePaymentDialog({
  open,
  onOpenChange,
  supplierId,
  purchaseId,
  totalCents,
  prefillFull,
  onDone,
}: Props) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const addPayment = useAddSupplierPayment();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<SupplierPaymentMethod>("cash");

  // Initialise the fields the first render the dialog is open (no effect needed).
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setAmount(
      prefillFull
        ? (totalCents / 10 ** currency.decimals).toFixed(currency.decimals)
        : "",
    );
    setMethod("cash");
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  async function submit() {
    const parsed = parseMoney(amount, currency.decimals);
    if (parsed == null || parsed <= 0) {
      toast.error(t("purchasing.suppliers.amount"));
      return;
    }
    try {
      await addPayment.mutateAsync({
        supplier_id: supplierId,
        purchase_id: purchaseId,
        amount_cents: parsed,
        method,
        reference: null,
        note: null,
      });
      toast.success(t("purchasing.toast.paymentAdded"));
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("purchasing.toast.error"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("purchasing.suppliers.newPayment")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            {t("purchasing.totalTtc")}: {formatMoney(totalCents, currency)}
          </p>
          <div className="space-y-1.5">
            <Label>{t("purchasing.suppliers.amount")}</Label>
            <Input
              autoFocus
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("purchasing.suppliers.method")}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as SupplierPaymentMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`purchasing.methods.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={addPayment.isPending}>
            {t("purchasing.suppliers.addPayment")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
