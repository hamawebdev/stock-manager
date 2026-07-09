import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Save } from "lucide-react";
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
import { useCreateCategory } from "@/lib/pos/queries";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new category's id so the caller can auto-select it. */
  onCreated: (id: number) => void;
}

/**
 * "Add category" dialog for the product page. A category is just a name, so
 * this mirrors the supplier "+" flow with a single field, then auto-selects
 * the new category in the product form.
 */
export function CategoryCreateDialog({ open, onOpenChange, onCreated }: Props) {
  const { t } = useTranslation();
  const createCategory = useCreateCategory();
  const [name, setName] = useState("");

  // Reset the field each time the dialog opens (render-phase, no effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setName("");
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("inventory.form.nameRequired"));
      return;
    }
    try {
      const id = await createCategory.mutateAsync(trimmed);
      toast.success(t("inventory.form.categoryAdded"));
      onCreated(id);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("purchasing.toast.error"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("inventory.form.addNoun", { noun: t("inventory.form.nounCategory") })}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="new-category-name">{t("common.name")}</Label>
          <Input
            id="new-category-name"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void save();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={createCategory.isPending}>
            <Save className="size-4" />
            {createCategory.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
