/**
 * Middle pane ("Paramètres"): the template selector, appearance controls
 * (font, size, logo scale, paper format), advanced toggles (density, signature,
 * zebra), the party info-block field toggles, and the Imprimer / PDF actions.
 */
import { useTranslation } from "react-i18next";
import { Printer, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  DocTemplate,
  PaperFormat,
  PartyFields,
  StudioSettings,
} from "@/lib/pos/studio/types";

const FONTS = ["Inter", "Arial", "Times New Roman", "Georgia", "Courier New"];
const PAPERS: PaperFormat[] = ["a4", "a5", "ticket"];
const TEMPLATES: DocTemplate[] = ["facture", "bon_commande", "releve_compte", "releve_fournisseur"];

export function SettingsPanel({
  settings,
  onChange,
  onPrint,
  onExportPdf,
  canExport,
  busy,
}: {
  settings: StudioSettings;
  onChange: (patch: Partial<StudioSettings>) => void;
  onPrint: () => void;
  onExportPdf: () => void;
  canExport: boolean;
  busy?: boolean;
}) {
  const { t } = useTranslation();

  const fields: { key: keyof PartyFields; label: string }[] = [
    { key: "name", label: t("studio.fields.name") },
    { key: "phone", label: t("studio.fields.phone") },
    { key: "rib", label: "RIB" },
    { key: "nif", label: "NIF" },
    { key: "nis", label: "NIS" },
    { key: "rc", label: "RC" },
    { key: "art", label: "ART" },
  ];
  const setField = (k: keyof PartyFields, v: boolean) =>
    onChange({ fields: { ...settings.fields, [k]: v } });

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {/* Template */}
        <Section title={t("studio.template")}>
          <Select value={settings.template} onValueChange={(v) => onChange({ template: v as DocTemplate })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATES.map((tpl) => (
                <SelectItem key={tpl} value={tpl}>
                  {t(`studio.templates.${tpl}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Section>

        {/* Appearance */}
        <Section title={t("studio.appearance")}>
          <Field label={t("studio.font")}>
            <Select value={settings.fontFamily} onValueChange={(v) => onChange({ fontFamily: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONTS.map((f) => (
                  <SelectItem key={f} value={f} style={{ fontFamily: f }}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={`${t("studio.fontSize")}: ${settings.fontSize}`}>
            <Slider min={8} max={18} step={1} value={[settings.fontSize]} onValueChange={([v]) => onChange({ fontSize: v })} />
          </Field>
          <Field label={`${t("studio.logoScale")}: ${settings.logoScale}%`}>
            <Slider min={40} max={160} step={5} value={[settings.logoScale]} onValueChange={([v]) => onChange({ logoScale: v })} />
          </Field>
          <div className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1">
            {PAPERS.map((p) => (
              <button
                key={p}
                onClick={() => onChange({ paper: p })}
                className={cn(
                  "rounded-md py-1.5 text-sm font-medium transition",
                  settings.paper === p ? "bg-background shadow-sm" : "text-muted-foreground",
                )}
              >
                {p === "a4" ? "A4" : p === "a5" ? "A5" : "Ticket"}
              </button>
            ))}
          </div>
        </Section>

        {/* Advanced */}
        <Section title={t("studio.advanced")}>
          <Field label={t("studio.density")}>
            <Slider min={0.6} max={1.4} step={0.1} value={[settings.density]} onValueChange={([v]) => onChange({ density: v })} />
          </Field>
          <Toggle label={t("studio.signature")} checked={settings.showSignature} onChange={(v) => onChange({ showSignature: v })} />
          <Toggle label={t("studio.zebra")} checked={settings.zebra} onChange={(v) => onChange({ zebra: v })} />
        </Section>

        {/* Party info block */}
        <Section title={t("studio.partyBlock")}>
          <Toggle label={t("studio.showBlock")} checked={settings.showParty} onChange={(v) => onChange({ showParty: v })} />
          {settings.showParty && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              {fields.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={settings.fields[f.key]} onCheckedChange={(v) => setField(f.key, v === true)} />
                  {f.label}
                </label>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 border-t p-3">
        <Button variant="outline" onClick={onPrint} disabled={!canExport}>
          <Printer className="size-4" /> {t("studio.printBtn")}
        </Button>
        <Button onClick={onExportPdf} disabled={!canExport || busy}>
          <FileDown className="size-4" /> {t("studio.pdfBtn")}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
