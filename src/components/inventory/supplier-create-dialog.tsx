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
import { useCreateSupplier } from "@/lib/pos/queries";
import type { SupplierInput } from "@/lib/pos/suppliers";
import { SupplierForm } from "@/components/purchasing/supplier-form";

const EMPTY_FORM: SupplierInput = {
  name: "",
  contact_name: null,
  phone: null,
  email: null,
  address: null,
  notes: null,
  activity: null,
  phone_fixe: null,
  fax: null,
  nif: null,
  nis: null,
  rc: null,
  art_imposition: null,
  rib: null,
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new supplier's id so the caller can auto-select it. */
  onCreated: (id: number) => void;
}

/**
 * Full "Add supplier" dialog for the product page: captures every supplier
 * field (contact + fiscal/legal) via the shared {@link SupplierForm}, then
 * auto-selects the new supplier in the product form.
 */
export function SupplierCreateDialog({ open, onOpenChange, onCreated }: Props) {
  const { t } = useTranslation();
  const createSupplier = useCreateSupplier();
  const [form, setForm] = useState<SupplierInput>(EMPTY_FORM);

  // Reset the form each time the dialog opens (render-phase, no effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setForm(EMPTY_FORM);
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error(t("inventory.form.nameRequired"));
      return;
    }
    try {
      const id = await createSupplier.mutateAsync(form);
      toast.success(t("inventory.form.supplierAdded"));
      onCreated(id);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("purchasing.toast.error"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("inventory.form.addNoun", { noun: t("inventory.form.nounSupplier") })}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto pe-1">
          <SupplierForm
            value={form}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={createSupplier.isPending}>
            <Save className="size-4" />
            {createSupplier.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
