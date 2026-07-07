import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AttachmentsField } from "./attachments-field";
import {
  useCreateExpense,
  useUpdateExpense,
  useCurrency,
  useExpenseAttachments,
  qk,
} from "@/lib/pos/queries";
import { parseMoney } from "@/lib/money";
import {
  saveAttachment,
  deleteAttachment,
  pickAttachmentFiles,
  type PickedFile,
} from "@/lib/expense-attachments";
import type {
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseRow,
  ExpenseInput,
} from "@/lib/pos/expenses";

const NONE = "__none__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing expense for edit, or null to create a new one. */
  expense: ExpenseRow | null;
  categories: ExpenseCategory[];
  methods: ExpensePaymentMethod[];
}

export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  categories,
  methods,
}: Props) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const qc = useQueryClient();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const savedAttachments = useExpenseAttachments(expense?.id ?? null);

  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [methodId, setMethodId] = useState<number | null>(null);
  const [vendor, setVendor] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<PickedFile[]>([]);
  const [removedIds, setRemovedIds] = useState<number[]>([]);

  // Reset the form whenever the dialog opens or the target expense changes
  // (render-phase adjustment, mirroring the suppliers-dialog pattern).
  const [prevKey, setPrevKey] = useState<string | null>(null);
  const key = open ? `${expense?.id ?? "new"}` : null;
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) {
      setAmount(
        expense
          ? (expense.amount_cents / 10 ** currency.decimals).toFixed(
              currency.decimals,
            )
          : "",
      );
      setDate(expense?.expense_date ?? new Date().toISOString().slice(0, 10));
      setCategoryId(expense?.category_id ?? null);
      setMethodId(expense?.payment_method_id ?? null);
      setVendor(expense?.vendor ?? "");
      setReference(expense?.reference ?? "");
      setNote(expense?.note ?? "");
      setPending([]);
      setRemovedIds([]);
    }
  }

  const visibleSaved = useMemo(
    () => (savedAttachments.data ?? []).filter((a) => !removedIds.includes(a.id)),
    [savedAttachments.data, removedIds],
  );

  async function onPick() {
    const files = await pickAttachmentFiles();
    if (files.length) setPending((p) => [...p, ...files]);
  }

  const saving = createExpense.isPending || updateExpense.isPending;

  async function save() {
    const amountCents = parseMoney(amount || "0", currency.decimals);
    if (amountCents == null || amountCents <= 0) {
      toast.error(t("expenses.toast.amountRequired"));
      return;
    }
    if (!date) {
      toast.error(t("expenses.toast.dateRequired"));
      return;
    }

    const input: ExpenseInput = {
      category_id: categoryId,
      payment_method_id: methodId,
      amount_cents: amountCents,
      expense_date: date,
      vendor: vendor.trim() || null,
      reference: reference.trim() || null,
      note: note.trim() || null,
    };

    try {
      let id: number;
      if (expense) {
        await updateExpense.mutateAsync({ id: expense.id, input });
        id = expense.id;
      } else {
        id = await createExpense.mutateAsync(input);
      }

      // Remove attachments the user deleted (edit mode).
      for (const a of savedAttachments.data ?? []) {
        if (removedIds.includes(a.id)) await deleteAttachment(a);
      }
      // Persist newly picked files against the (now-known) expense id.
      for (const f of pending) {
        await saveAttachment(id, f.bytes, f.name, f.mime);
      }
      if (pending.length || removedIds.length) {
        qc.invalidateQueries({ queryKey: qk.expenseAttachments(id) });
        qc.invalidateQueries({ queryKey: ["expenses"] });
      }

      toast.success(t("expenses.toast.saved"));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {expense ? t("expenses.editTitle") : t("expenses.addTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-amount">{t("expenses.amount")}</Label>
              <Input
                id="exp-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-date">{t("expenses.date")}</Label>
              <Input
                id="exp-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("expenses.category")}</Label>
              <Select
                value={categoryId ? String(categoryId) : NONE}
                onValueChange={(v) => setCategoryId(v === NONE ? null : Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("expenses.uncategorized")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("expenses.uncategorized")}</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("expenses.paymentMethod")}</Label>
              <Select
                value={methodId ? String(methodId) : NONE}
                onValueChange={(v) => setMethodId(v === NONE ? null : Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("expenses.selectMethod")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("common.none")}</SelectItem>
                  {methods.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-vendor">{t("expenses.vendor")}</Label>
              <Input
                id="exp-vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder={t("expenses.vendorPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-ref">{t("expenses.reference")}</Label>
              <Input
                id="exp-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={t("expenses.referencePlaceholder")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exp-note">{t("expenses.note")}</Label>
            <Textarea
              id="exp-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>

          <AttachmentsField
            saved={visibleSaved}
            pending={pending}
            onPick={onPick}
            onRemoveSaved={(a) => setRemovedIds((r) => [...r, a.id])}
            onRemovePending={(i) =>
              setPending((p) => p.filter((_, idx) => idx !== i))
            }
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
