import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SupplierInput } from "@/lib/pos/suppliers";

interface Props {
  value: SupplierInput;
  onChange: (patch: Partial<SupplierInput>) => void;
}

/** The "Informations" tab: contact + fiscal/legal supplier fields. */
export function SupplierForm({ value, onChange }: Props) {
  const { t } = useTranslation();
  const f = (key: string) => t(`purchasing.suppliers.fields.${key}`);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={f("name")} required>
          <Input
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label={f("activity")}>
          <Input
            value={value.activity ?? ""}
            placeholder={t("purchasing.suppliers.activityPlaceholder")}
            onChange={(e) => onChange({ activity: e.target.value })}
          />
        </Field>
        <Field label={f("mobile")}>
          <Input
            value={value.phone ?? ""}
            onChange={(e) => onChange({ phone: e.target.value })}
          />
        </Field>
        <Field label={f("email")}>
          <Input
            type="email"
            value={value.email ?? ""}
            onChange={(e) => onChange({ email: e.target.value })}
          />
        </Field>
        <Field label={f("phoneFixe")}>
          <Input
            value={value.phone_fixe ?? ""}
            onChange={(e) => onChange({ phone_fixe: e.target.value })}
          />
        </Field>
        <Field label={f("fax")}>
          <Input
            value={value.fax ?? ""}
            onChange={(e) => onChange({ fax: e.target.value })}
          />
        </Field>
      </div>

      <Field label={f("address")}>
        <Textarea
          rows={2}
          value={value.address ?? ""}
          onChange={(e) => onChange({ address: e.target.value })}
        />
      </Field>

      <div className="space-y-4">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide">
          {f("fiscality")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={f("nif")}>
            <Input
              value={value.nif ?? ""}
              onChange={(e) => onChange({ nif: e.target.value })}
            />
          </Field>
          <Field label={f("nis")}>
            <Input
              value={value.nis ?? ""}
              onChange={(e) => onChange({ nis: e.target.value })}
            />
          </Field>
          <Field label={f("rc")}>
            <Input
              value={value.rc ?? ""}
              onChange={(e) => onChange({ rc: e.target.value })}
            />
          </Field>
          <Field label={f("artImposition")}>
            <Input
              value={value.art_imposition ?? ""}
              onChange={(e) => onChange({ art_imposition: e.target.value })}
            />
          </Field>
          <Field label={f("rib")} className="sm:col-span-2">
            <Input
              value={value.rib ?? ""}
              onChange={(e) => onChange({ rib: e.target.value })}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
