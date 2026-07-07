import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Play, Pencil, Trash2, CalendarClock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useRecurringTemplates,
  useCreateRecurring,
  useUpdateRecurring,
  useDeleteRecurring,
  usePostRecurring,
  useExpenseCategories,
  useExpenseMethods,
  useCurrency,
} from "@/lib/pos/queries";
import { formatMoney, parseMoney } from "@/lib/money";
import { intlLocale } from "@/lib/i18n";
import type {
  RecurringFrequency,
  RecurringInput,
  RecurringTemplateRow,
} from "@/lib/pos/expenses";

const NONE = "__none__";
const FREQUENCIES: RecurringFrequency[] = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RecurringDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const templates = useRecurringTemplates();
  const categories = useExpenseCategories();
  const methods = useExpenseMethods();
  const create = useCreateRecurring();
  const update = useUpdateRecurring();
  const del = useDeleteRecurring();
  const post = usePostRecurring();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [methodId, setMethodId] = useState<number | null>(null);
  const [vendor, setVendor] = useState("");
  const [note, setNote] = useState("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [nextDue, setNextDue] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [active, setActive] = useState(true);

  function resetForm() {
    setEditingId(null);
    setName("");
    setAmount("");
    setCategoryId(null);
    setMethodId(null);
    setVendor("");
    setNote("");
    setFrequency("monthly");
    setNextDue(new Date().toISOString().slice(0, 10));
    setActive(true);
    setShowForm(false);
  }

  function startNew() {
    resetForm();
    setShowForm(true);
  }

  function startEdit(r: RecurringTemplateRow) {
    setEditingId(r.id);
    setName(r.name);
    setAmount((r.amount_cents / 10 ** currency.decimals).toFixed(currency.decimals));
    setCategoryId(r.category_id);
    setMethodId(r.payment_method_id);
    setVendor(r.vendor ?? "");
    setNote(r.note ?? "");
    setFrequency(r.frequency);
    setNextDue(r.next_due_date ?? new Date().toISOString().slice(0, 10));
    setActive(r.active === 1);
    setShowForm(true);
  }

  async function save() {
    if (!name.trim()) {
      toast.error(t("expenses.toast.nameRequired"));
      return;
    }
    const input: RecurringInput = {
      name: name.trim(),
      category_id: categoryId,
      payment_method_id: methodId,
      amount_cents: parseMoney(amount || "0", currency.decimals) ?? 0,
      vendor: vendor.trim() || null,
      note: note.trim() || null,
      frequency,
      next_due_date: nextDue || null,
      active,
    };
    try {
      if (editingId) await update.mutateAsync({ id: editingId, input });
      else await create.mutateAsync(input);
      toast.success(t("expenses.toast.templateSaved"));
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  async function recordNow(r: RecurringTemplateRow) {
    try {
      await post.mutateAsync(r.id);
      toast.success(t("expenses.toast.recorded"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("expenses.recurring")}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            {t("expenses.recurringDesc")}
          </p>
          {!showForm && (
            <Button size="sm" onClick={startNew}>
              <Plus className="size-4" />
              {t("expenses.newTemplate")}
            </Button>
          )}
        </div>

        {showForm ? (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("expenses.templateName")}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("expenses.templateNamePlaceholder")}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("expenses.amount")}</Label>
                <Input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
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
                    {(categories.data ?? []).map((c) => (
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
                    <SelectValue placeholder={t("common.none")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("common.none")}</SelectItem>
                    {(methods.data ?? []).map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>{t("expenses.frequency")}</Label>
                <Select
                  value={frequency}
                  onValueChange={(v) => setFrequency(v as RecurringFrequency)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f} value={f}>
                        {t(`expenses.freq.${f}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("expenses.nextDue")}</Label>
                <Input
                  type="date"
                  value={nextDue}
                  onChange={(e) => setNextDue(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("expenses.vendor")}</Label>
                <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="rec-active" checked={active} onCheckedChange={setActive} />
              <Label htmlFor="rec-active">{t("expenses.active")}</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={resetForm}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" onClick={save} disabled={create.isPending || update.isPending}>
                {t("common.save")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {templates.isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : (templates.data ?? []).length === 0 ? (
              <p className="text-muted-foreground py-10 text-center text-sm">
                {t("expenses.noTemplates")}
              </p>
            ) : (
              (templates.data ?? []).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg border p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{r.name}</span>
                      {r.active === 0 && (
                        <Badge variant="secondary">{t("expenses.inactive")}</Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                      <span>{formatMoney(r.amount_cents, currency)}</span>
                      <span>· {t(`expenses.freq.${r.frequency}`)}</span>
                      {r.category_name && <span>· {r.category_name}</span>}
                      {r.next_due_date && (
                        <span className="flex items-center gap-1">
                          <CalendarClock className="size-3" />
                          {new Date(r.next_due_date).toLocaleDateString(intlLocale())}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => recordNow(r)}
                    disabled={post.isPending}
                    title={t("expenses.recordNow")}
                  >
                    <Play className="size-4" />
                    {t("expenses.recordNow")}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={() => startEdit(r)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive size-8"
                    onClick={() => del.mutate(r.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
