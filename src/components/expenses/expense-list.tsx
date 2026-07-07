import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Pencil, Trash2, Printer, Paperclip } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useExpenses, useDeleteExpense, useCurrency, useSettings } from "@/lib/pos/queries";
import { formatMoney } from "@/lib/money";
import { intlLocale } from "@/lib/i18n";
import { printExpenseVoucher } from "@/lib/pos/expense-export";
import type { ExpenseFilters, ExpenseRow } from "@/lib/pos/expenses";

interface Props {
  filters: ExpenseFilters;
  onEdit: (expense: ExpenseRow) => void;
}

export function ExpenseList({ filters, onEdit }: Props) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const settings = useSettings();
  const expenses = useExpenses(filters);
  const del = useDeleteExpense();
  const [toDelete, setToDelete] = useState<ExpenseRow | null>(null);

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast.success(t("expenses.toast.deleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setToDelete(null);
    }
  }

  async function print(e: ExpenseRow) {
    if (!settings.data) return;
    try {
      await printExpenseVoucher(e, settings.data, currency, t);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  if (expenses.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const rows = expenses.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t("expenses.empty")}
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("expenses.code")}</TableHead>
              <TableHead>{t("expenses.date")}</TableHead>
              <TableHead>{t("expenses.category")}</TableHead>
              <TableHead>{t("expenses.vendor")}</TableHead>
              <TableHead>{t("expenses.paymentMethod")}</TableHead>
              <TableHead className="text-end">{t("expenses.amount")}</TableHead>
              <TableHead className="text-end">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {e.code ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {new Date(`${e.expense_date}T00:00:00`).toLocaleDateString(
                    intlLocale(),
                  )}
                </TableCell>
                <TableCell>
                  {e.category_name ? (
                    <Badge
                      variant="secondary"
                      className="gap-1.5"
                      style={
                        e.category_color
                          ? { borderColor: e.category_color }
                          : undefined
                      }
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{
                          backgroundColor: e.category_color ?? "currentColor",
                        }}
                      />
                      {e.category_name}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      {t("expenses.uncategorized")}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="max-w-40 truncate">{e.vendor ?? "—"}</span>
                    {e.attachment_count > 0 && (
                      <span className="text-muted-foreground flex items-center gap-0.5 text-xs">
                        <Paperclip className="size-3" />
                        {e.attachment_count}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {e.method_name ?? "—"}
                </TableCell>
                <TableCell className="text-end font-medium">
                  {formatMoney(e.amount_cents, currency)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => print(e)}
                      title={t("common.print")}
                    >
                      <Printer className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => onEdit(e)}
                      title={t("common.edit")}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive size-8"
                      onClick={() => setToDelete(e)}
                      title={t("common.delete")}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("expenses.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("expenses.deleteConfirm", { code: toDelete?.code ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
