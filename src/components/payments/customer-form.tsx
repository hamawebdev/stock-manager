/**
 * Create / edit a customer, including the fiscal/legal fields the Studio
 * documents print (address, NIF/NIS/RC/ART, RIB). The fiscal block is collapsed
 * by default so the common quick-create stays short.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useCreateCustomer, useUpdateCustomer } from "@/lib/pos/queries";
import type { Customer, CustomerInput } from "@/lib/pos/customers";

interface Props {
  /** Existing customer to edit; omit for create mode. */
  existing?: Customer;
  onSaved: (id: number, name: string) => void;
  onCancel: () => void;
}

export function CustomerForm({ existing, onSaved, onCancel }: Props) {
  const { t } = useTranslation();
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const isEdit = existing != null;

  const [form, setForm] = useState<CustomerInput>({
    name: existing?.name ?? "",
    phone: existing?.phone ?? "",
    email: existing?.email ?? "",
    note: existing?.note ?? "",
    address: existing?.address ?? "",
    phone_fixe: existing?.phone_fixe ?? "",
    fax: existing?.fax ?? "",
    activity: existing?.activity ?? "",
    nif: existing?.nif ?? "",
    nis: existing?.nis ?? "",
    rc: existing?.rc ?? "",
    art_imposition: existing?.art_imposition ?? "",
    rib: existing?.rib ?? "",
  });
  const [showFiscal, setShowFiscal] = useState(false);

  const set = <K extends keyof CustomerInput>(k: K, v: CustomerInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.name?.trim()) {
      toast.error(t("payments.customer.nameRequired"));
      return;
    }
    try {
      if (isEdit) {
        await update.mutateAsync({ id: existing!.id, input: form });
        onSaved(existing!.id, form.name!.trim());
      } else {
        const c = await create.mutateAsync(form);
        onSaved(c.id, c.name);
      }
    } catch (err) {
      toast.error(String(err));
    }
  }

  const fiscal: { key: keyof CustomerInput; label: string }[] = [
    { key: "address", label: t("payments.customer.address") },
    { key: "phone_fixe", label: t("payments.customer.phoneFixe") },
    { key: "nif", label: "NIF" },
    { key: "nis", label: "NIS" },
    { key: "rc", label: "RC" },
    { key: "art_imposition", label: "ART" },
    { key: "rib", label: "RIB" },
  ];

  return (
    <div className="grid gap-3 overflow-y-auto">
      <div className="grid gap-2">
        <Label>{t("common.name")}</Label>
        <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-2">
          <Label>{t("payments.customer.phone")}</Label>
          <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>{t("payments.customer.email")}</Label>
          <Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowFiscal((v) => !v)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm font-medium"
      >
        <ChevronDown className={cn("size-4 transition", showFiscal && "rotate-180")} />
        {t("payments.customer.fiscalDetails")}
      </button>
      {showFiscal && (
        <div className="grid grid-cols-2 gap-2">
          {fiscal.map((f) => (
            <div key={f.key} className="grid gap-2">
              <Label>{f.label}</Label>
              <Input
                value={(form[f.key] as string | null) ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-2">
        <Label>{t("common.notes")}</Label>
        <Textarea rows={2} value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button onClick={submit} disabled={create.isPending || update.isPending}>
          {isEdit ? t("common.save") : t("payments.customer.createAttach")}
        </Button>
      </div>
    </div>
  );
}
