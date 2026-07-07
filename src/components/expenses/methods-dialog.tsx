import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Check, Pencil, Archive, RotateCcw, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  useExpenseMethods,
  useCreateExpenseMethod,
  useUpdateExpenseMethod,
  useArchiveExpenseMethod,
} from "@/lib/pos/queries";
import type { ExpensePaymentMethod } from "@/lib/pos/expenses";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "Manage payment methods": add, rename, archive / restore. */
export function MethodsDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const methods = useExpenseMethods(true);
  const create = useCreateExpenseMethod();
  const update = useUpdateExpenseMethod();
  const archive = useArchiveExpenseMethod();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  async function add() {
    if (!newName.trim()) return;
    try {
      await create.mutateAsync(newName);
      setNewName("");
      toast.success(t("expenses.toast.methodSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  function startEdit(m: ExpensePaymentMethod) {
    setEditingId(m.id);
    setEditName(m.name);
  }

  async function saveEdit() {
    if (editingId == null || !editName.trim()) return;
    try {
      await update.mutateAsync({ id: editingId, name: editName });
      setEditingId(null);
      toast.success(t("expenses.toast.methodSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("expenses.managePaymentMethods")}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={t("expenses.newMethod")}
            className="flex-1"
          />
          <Button size="icon" onClick={add} disabled={create.isPending}>
            <Plus className="size-4" />
          </Button>
        </div>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {methods.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            (methods.data ?? []).map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2 py-1.5",
                  m.archived ? "opacity-50" : "",
                )}
              >
                {editingId === m.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                      className="h-8 flex-1"
                      autoFocus
                    />
                    <Button size="icon" variant="ghost" className="size-8" onClick={saveEdit}>
                      <Check className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="size-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 truncate text-sm">{m.name}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => startEdit(m)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() =>
                        archive.mutate({ id: m.id, restore: m.archived === 1 })
                      }
                      title={m.archived ? t("common.retry") : t("common.delete")}
                    >
                      {m.archived ? (
                        <RotateCcw className="size-4" />
                      ) : (
                        <Archive className="size-4" />
                      )}
                    </Button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
