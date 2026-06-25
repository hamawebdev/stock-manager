import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Trash2, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatMoney, parseMoney } from "@/lib/money";
import {
  useAddSupplierPayment,
  useCurrency,
  useDeleteSupplierPayment,
  usePurchasesBySupplier,
  useSupplierBalance,
  useSupplierPayments,
} from "@/lib/pos/queries";
import type { Supplier, SupplierPaymentMethod } from "@/lib/pos/types";
import { SummaryCards } from "./summary-cards";
import { exportSupplierStatement } from "./purchase-export";

const METHODS: SupplierPaymentMethod[] = ["cash", "cheque", "transfer", "card_other"];
const REFUND_RE = /rembours|retour|refund|return|استرجاع|إرجاع/i;

/** "Paiements & Solde": balance KPIs, a payment form, and payment history. */
export function SupplierPaymentsTab({ supplier }: { supplier: Supplier }) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const money = (c: number) => formatMoney(c, currency);

  const balance = useSupplierBalance(supplier.id);
  const payments = useSupplierPayments(supplier.id);
  const purchases = usePurchasesBySupplier(supplier.id);
  const addPayment = useAddSupplierPayment();
  const deletePayment = useDeleteSupplierPayment();

  const [scope, setScope] = useState<"global" | "invoice">("global");
  const [purchaseId, setPurchaseId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<SupplierPaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const b = balance.data;
  const invoiceablePurchases = (purchases.data ?? []).filter(
    (p) => p.status === "confirmed",
  );

  async function submit() {
    const parsed = parseMoney(amount, currency.decimals);
    if (parsed == null || parsed === 0) {
      toast.error(t("purchasing.suppliers.amount"));
      return;
    }
    // The screenshot convention: a note mentioning a refund/return deducts.
    const signed = REFUND_RE.test(note) ? -Math.abs(parsed) : parsed;
    try {
      await addPayment.mutateAsync({
        supplier_id: supplier.id,
        purchase_id:
          scope === "invoice" && purchaseId ? Number(purchaseId) : null,
        amount_cents: signed,
        method,
        reference: reference.trim() || null,
        note: note.trim() || null,
      });
      toast.success(t("purchasing.toast.paymentAdded"));
      setAmount("");
      setReference("");
      setNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("purchasing.toast.error"));
    }
  }

  async function remove(id: number) {
    try {
      await deletePayment.mutateAsync({ id, supplierId: supplier.id });
      toast.success(t("purchasing.toast.paymentDeleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("purchasing.toast.error"));
    }
  }

  return (
    <div className="space-y-5">
      <SummaryCards
        cards={[
          {
            label: t("purchasing.cards.totalPurchases"),
            value: money(b?.total_purchases_cents ?? 0),
            tone: "primary",
          },
          {
            label: t("purchasing.cards.totalPaid"),
            value: money(b?.total_paid_cents ?? 0),
            tone: "primary",
          },
          {
            label: t("purchasing.cards.globalBalance"),
            value: money(b?.balance_cents ?? 0),
            tone: "danger",
          },
        ]}
      />

      {/* New payment */}
      <div className="bg-card space-y-4 rounded-xl border p-4">
        <p className="text-sm font-semibold">{t("purchasing.suppliers.newPayment")}</p>

        <div className="bg-muted inline-flex rounded-lg p-1 text-sm">
          {(["global", "invoice"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition",
                scope === s
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              {s === "global"
                ? t("purchasing.suppliers.global")
                : t("purchasing.suppliers.onInvoice")}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {scope === "invoice" && (
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
              <Label>{t("purchasing.suppliers.onInvoice")}</Label>
              <Select value={purchaseId} onValueChange={setPurchaseId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("purchasing.suppliers.selectPurchaseOptional")} />
                </SelectTrigger>
                <SelectContent>
                  {invoiceablePurchases.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.code} — {money(p.total_ttc_cents)} ({money(p.paid_cents)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t("purchasing.suppliers.amount")}</Label>
            <Input
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
          <div className="space-y-1.5">
            <Label>{t("purchasing.suppliers.refPlaceholder")}</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t("purchasing.suppliers.refPlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("purchasing.suppliers.note")}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <p className="text-muted-foreground text-xs">
          {t("purchasing.suppliers.refundHint")}
        </p>

        <Button onClick={submit} disabled={addPayment.isPending} className="w-full">
          {t("purchasing.suppliers.addPayment")}
        </Button>
      </div>

      {/* History */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">
            {t("purchasing.suppliers.paymentHistory")}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={(payments.data ?? []).length === 0}
            onClick={() =>
              exportSupplierStatement(supplier, payments.data ?? [], currency, t)
            }
          >
            <FileDown className="size-4" />
            {t("purchasing.suppliers.globalStatement")}
          </Button>
        </div>

        {payments.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (payments.data ?? []).length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {t("purchasing.empty.noPayments")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("purchasing.table.date")}</TableHead>
                <TableHead>{t("purchasing.table.method")}</TableHead>
                <TableHead className="text-end">{t("purchasing.table.amount")}</TableHead>
                <TableHead>{t("purchasing.table.note")}</TableHead>
                <TableHead className="text-end">{t("purchasing.table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(payments.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.created_at.slice(0, 16).replace("T", " ")}</TableCell>
                  <TableCell>{t(`purchasing.methods.${p.method}`)}</TableCell>
                  <TableCell
                    className={cn(
                      "text-end font-medium",
                      p.amount_cents < 0 && "text-emerald-600 dark:text-emerald-500",
                    )}
                  >
                    {money(p.amount_cents)}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-40 truncate">
                    {p.note ?? p.reference ?? "—"}
                  </TableCell>
                  <TableCell className="text-end">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove(p.id)}
                      aria-label={t("common.delete")}
                    >
                      <Trash2 className="text-destructive size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
