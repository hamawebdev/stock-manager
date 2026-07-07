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
  useExpenseCategories,
  useCreateExpenseCategory,
  useUpdateExpenseCategory,
  useArchiveExpenseCategory,
} from "@/lib/pos/queries";
import type { ExpenseCategory } from "@/lib/pos/expenses";

const SWATCHES = [
  "#6366f1",
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#64748b",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "Manage expense categories": add, rename, recolour, archive / restore. */
export function CategoriesDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const cats = useExpenseCategories(true);
  const create = useCreateExpenseCategory();
  const update = useUpdateExpenseCategory();
  const archive = useArchiveExpenseCategory();

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(SWATCHES[0]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string | null>(null);

  async function add() {
    if (!newName.trim()) return;
    try {
      await create.mutateAsync({ name: newName, color: newColor });
      setNewName("");
      toast.success(t("expenses.toast.categorySaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  function startEdit(c: ExpenseCategory) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditColor(c.color);
  }

  async function saveEdit() {
    if (editingId == null || !editName.trim()) return;
    try {
      await update.mutateAsync({ id: editingId, name: editName, color: editColor });
      setEditingId(null);
      toast.success(t("expenses.toast.categorySaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("expenses.manageCategories")}</DialogTitle>
        </DialogHeader>

        {/* Add row */}
        <div className="flex items-center gap-2">
          <ColorPicker value={newColor} onChange={setNewColor} />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={t("expenses.newCategory")}
            className="flex-1"
          />
          <Button size="icon" onClick={add} disabled={create.isPending}>
            <Plus className="size-4" />
          </Button>
        </div>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {cats.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            (cats.data ?? []).map((c) => (
              <div
                key={c.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2 py-1.5",
                  c.archived ? "opacity-50" : "",
                )}
              >
                {editingId === c.id ? (
                  <>
                    <ColorPicker
                      value={editColor ?? SWATCHES[0]}
                      onChange={setEditColor}
                    />
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
                    <span
                      className="size-3.5 shrink-0 rounded-full border"
                      style={{ backgroundColor: c.color ?? "transparent" }}
                    />
                    <span className="flex-1 truncate text-sm">{c.name}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => startEdit(c)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() =>
                        archive.mutate({ id: c.id, restore: c.archived === 1 })
                      }
                      title={c.archived ? t("common.retry") : t("common.delete")}
                    >
                      {c.archived ? (
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

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="size-8 shrink-0 rounded-md border"
        style={{ backgroundColor: value }}
        aria-label="color"
      />
      {open && (
        <div className="bg-popover absolute z-50 mt-1 grid grid-cols-5 gap-1 rounded-md border p-2 shadow-md">
          {SWATCHES.map((s) => (
            <button
              key={s}
              type="button"
              className="size-5 rounded-full ring-offset-1 hover:ring-2"
              style={{ backgroundColor: s }}
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
