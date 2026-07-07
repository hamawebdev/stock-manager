/**
 * "Compte client": the customer accounts-receivable ledger — balance KPIs, a
 * versement form (global or tied to an invoice), and payment history. The
 * sell-side mirror of `SupplierPaymentsTab`. A note mentioning a refund/avoir
 * records a negative amount (money back to the customer).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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
  useAddCustomerPayment,
  useCurrency,
  useCustomerBalance,
  useCustomerHistory,
  useCustomerPayments,
  useDeleteCustomerPayment,
} from "@/lib/pos/queries";
import {
  CUSTOMER_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS_FR,
} from "@/lib/pos/payment-methods";
import type { Customer } from "@/lib/pos/customers";
import type { CustomerPaymentMethod } from "@/lib/pos/types";
import { SummaryCards } from "@/components/purchasing/summary-cards";

const REFUND_RE = /rembours|retour|refund|return|avoir|استرجاع|إرجاع/i;

export function CustomerPaymentsTab({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const money = (c: number) => formatMoney(c, currency);

  const balance = useCustomerBalance(customer.id);
  const payments = useCustomerPayments(customer.id);
  const sales = useCustomerHistory(customer.id);
  const addPayment = useAddCustomerPayment();
  const deletePayment = useDeleteCustomerPayment();

  const [scope, setScope] = useState<"global" | "invoice">("global");
  const [saleId, setSaleId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<CustomerPaymentMethod>("especes");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const b = balance.data;

  async function submit() {
    const parsed = parseMoney(amount, currency.decimals);
    if (parsed == null || parsed === 0) {
      toast.error(t("payments.account.amount"));
      return;
    }
    const signed = REFUND_RE.test(note) ? -Math.abs(parsed) : parsed;
    try {
      await addPayment.mutateAsync({
        customer_id: customer.id,
        sale_id: scope === "invoice" && saleId ? Number(saleId) : null,
        amount_cents: signed,
        method,
        reference: reference.trim() || null,
        note: note.trim() || null,
      });
      toast.success(t("payments.account.paymentAdded"));
      setAmount("");
      setReference("");
      setNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  async function remove(id: number) {
    try {
      await deletePayment.mutateAsync({ id, customerId: customer.id });
      toast.success(t("payments.account.paymentDeleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  return (
    <div className="space-y-5">
      <SummaryCards
        cards={[
          {
            label: t("payments.account.totalInvoiced"),
            value: money(b?.total_sales_cents ?? 0),
            tone: "primary",
          },
          {
            label: t("payments.account.totalPaid"),
            value: money(b?.total_paid_cents ?? 0),
            tone: "primary",
          },
          {
            label: t("payments.account.balance"),
            value: money(b?.balance_cents ?? 0),
            tone: "danger",
          },
        ]}
      />

      {/* New payment */}
      <div className="bg-card space-y-4 rounded-xl border p-4">
        <p className="text-sm font-semibold">{t("payments.account.newPayment")}</p>

        <div className="bg-muted inline-flex rounded-lg p-1 text-sm">
          {(["global", "invoice"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition",
                scope === s ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              {s === "global"
                ? t("payments.account.global")
                : t("payments.account.onInvoice")}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {scope === "invoice" && (
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
              <Label>{t("payments.account.onInvoice")}</Label>
              <Select value={saleId} onValueChange={setSaleId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("payments.account.selectInvoice")} />
                </SelectTrigger>
                <SelectContent>
                  {(sales.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.code} — {money(s.total_ttc_cents)} ({money(s.paid_cents)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t("payments.account.amount")}</Label>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("payments.account.method")}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as CustomerPaymentMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABELS_FR[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("payments.account.reference")}</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("payments.account.note")}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <p className="text-muted-foreground text-xs">{t("payments.account.refundHint")}</p>

        <Button onClick={submit} disabled={addPayment.isPending} className="w-full">
          {t("payments.account.addPayment")}
        </Button>
      </div>

      {/* History */}
      <div className="space-y-3">
        <p className="text-sm font-semibold">{t("payments.account.history")}</p>

        {payments.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (payments.data ?? []).length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {t("payments.account.noPayments")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("payments.account.date")}</TableHead>
                <TableHead>{t("payments.account.method")}</TableHead>
                <TableHead className="text-end">{t("payments.account.amount")}</TableHead>
                <TableHead>{t("payments.account.note")}</TableHead>
                <TableHead className="text-end">{t("payments.account.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(payments.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.created_at.slice(0, 16).replace("T", " ")}</TableCell>
                  <TableCell>{PAYMENT_METHOD_LABELS_FR[p.method]}</TableCell>
                  <TableCell
                    className={cn(
                      "text-end font-medium",
                      p.amount_cents < 0 && "text-success",
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
