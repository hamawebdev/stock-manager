import { useTranslation } from "react-i18next";
import {
  Sparkles,
  Type,
  Tag,
  Barcode,
  Hash,
  Star,
  Text as TextIcon,
  Minus,
  Square,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Copy,
  CopyPlus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  LABEL_SIZE_PRESETS,
  isTextKind,
  type LabelAlign,
  type LabelElement,
  type LabelElementKind,
} from "@/lib/pos/label-template";
import { useLabelDesignerStore } from "@/store/use-label-designer-store";

const CUSTOM = "custom";

export function DesignTab() {
  const { t } = useTranslation();
  const template = useLabelDesignerStore((s) => s.template);
  const selectedId = useLabelDesignerStore((s) => s.selectedId);
  const snap = useLabelDesignerStore((s) => s.snap);
  const setSnap = useLabelDesignerStore((s) => s.setSnap);
  const setSize = useLabelDesignerStore((s) => s.setSize);
  const addElement = useLabelDesignerStore((s) => s.addElement);
  const autoFormat = useLabelDesignerStore((s) => s.autoFormat);

  const selected = template.elements.find((e) => e.id === selectedId) ?? null;

  const presetKey =
    LABEL_SIZE_PRESETS.find(
      (p) => p.widthMm === template.widthMm && p.heightMm === template.heightMm,
    )?.key ?? CUSTOM;

  const PALETTE: { kind: LabelElementKind; icon: typeof Type; key: string }[] = [
    { kind: "productName", icon: Type, key: "elProductName" },
    { kind: "price", icon: Tag, key: "elPrice" },
    { kind: "barcode", icon: Barcode, key: "elBarcode" },
    { kind: "reference", icon: Hash, key: "elReference" },
    { kind: "characteristics", icon: Star, key: "elCharacteristics" },
    { kind: "freeText", icon: TextIcon, key: "elFreeText" },
    { kind: "line", icon: Minus, key: "elLine" },
    { kind: "frame", icon: Square, key: "elFrame" },
  ];

  return (
    <div className="grid gap-5 p-4">
      {/* Quick format */}
      <section className="grid gap-3">
        <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {t("labelDesigner.quickFormat")}
        </h4>
        <Select
          value={presetKey}
          onValueChange={(v) => {
            if (v === CUSTOM) return;
            const p = LABEL_SIZE_PRESETS.find((x) => x.key === v);
            if (p) setSize(p.widthMm, p.heightMm);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("labelDesigner.custom")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CUSTOM}>{t("labelDesigner.custom")}</SelectItem>
            {LABEL_SIZE_PRESETS.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label={t("labelDesigner.widthMm")}
            value={template.widthMm}
            onChange={(v) => setSize(Math.max(5, v), template.heightMm)}
          />
          <NumberField
            label={t("labelDesigner.heightMm")}
            value={template.heightMm}
            onChange={(v) => setSize(template.widthMm, Math.max(5, v))}
          />
        </div>
        <label className="flex items-center justify-between">
          <span className="text-sm">{t("labelDesigner.magneticGrid")}</span>
          <Switch checked={snap} onCheckedChange={setSnap} />
        </label>
      </section>

      {/* Element tools */}
      <section className="grid gap-3 border-t pt-4">
        <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {t("labelDesigner.elementTools")}
        </h4>
        <Button variant="secondary" className="justify-start" onClick={autoFormat}>
          <Sparkles className="text-primary" /> {t("labelDesigner.autoFormat")}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          {PALETTE.map(({ kind, icon: Icon, key }) => (
            <Button
              key={kind}
              variant="outline"
              size="sm"
              className="justify-start"
              onClick={() => addElement(kind)}
            >
              <Icon /> {t(`labelDesigner.${key}`)}
            </Button>
          ))}
        </div>
      </section>

      {/* Element editor */}
      <section className="grid gap-3 border-t pt-4">
        <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {t("labelDesigner.elementEdit")}
        </h4>
        {selected ? (
          <ElementEditor el={selected} />
        ) : (
          <p className="text-muted-foreground text-sm">{t("labelDesigner.noSelection")}</p>
        )}
      </section>
    </div>
  );
}

function ElementEditor({ el }: { el: LabelElement }) {
  const { t } = useTranslation();
  const update = useLabelDesignerStore((s) => s.updateElement);
  const remove = useLabelDesignerStore((s) => s.removeElement);
  const duplicate = useLabelDesignerStore((s) => s.duplicateElement);
  const copy = useLabelDesignerStore((s) => s.copy);

  const set = (patch: Partial<LabelElement>) => update(el.id, patch);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t(`labelDesigner.el${kindLabel(el.kind)}`)}</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon-sm" title={t("common.copy")} onClick={copy}>
            <Copy />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title={t("labelDesigner.duplicate")}
            onClick={() => duplicate(el.id)}
          >
            <CopyPlus />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title={t("common.delete")}
            onClick={() => remove(el.id)}
          >
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <NumberField label="X" value={round(el.x)} onChange={(v) => set({ x: v })} />
        <NumberField label="Y" value={round(el.y)} onChange={(v) => set({ y: v })} />
        <NumberField label={t("labelDesigner.wShort")} value={round(el.w)} onChange={(v) => set({ w: v })} />
        <NumberField label={t("labelDesigner.hShort")} value={round(el.h)} onChange={(v) => set({ h: v })} />
      </div>

      <div className="grid gap-1.5">
        <Label className="text-muted-foreground text-[11px]">
          {t("labelDesigner.rotation")} ({el.rotation}°)
        </Label>
        <Slider
          min={-180}
          max={180}
          step={1}
          value={[el.rotation]}
          onValueChange={([v]) => set({ rotation: v })}
        />
      </div>

      {isTextKind(el.kind) && (
        <>
          {el.kind === "freeText" && (
            <div className="grid gap-1.5">
              <Label className="text-muted-foreground text-[11px]">{t("labelDesigner.text")}</Label>
              <Input
                className="h-8"
                value={el.text ?? ""}
                onChange={(e) => set({ text: e.target.value })}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label={t("labelDesigner.fontSize")}
              value={el.fontSize}
              onChange={(v) => set({ fontSize: Math.max(4, v) })}
            />
            <div className="grid gap-1.5">
              <Label className="text-muted-foreground text-[11px]">{t("labelDesigner.align")}</Label>
              <div className="flex gap-1">
                {(["left", "center", "right"] as LabelAlign[]).map((a) => (
                  <Button
                    key={a}
                    type="button"
                    variant={el.align === a ? "default" : "outline"}
                    size="icon-sm"
                    onClick={() => set({ align: a })}
                  >
                    {a === "left" ? <AlignLeft /> : a === "right" ? <AlignRight /> : <AlignCenter />}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <label className="flex items-center justify-between">
            <span className="text-sm">{t("labelDesigner.bold")}</span>
            <Switch checked={el.bold} onCheckedChange={(v) => set({ bold: v })} />
          </label>
        </>
      )}

      {el.kind === "characteristics" && (
        <div className="grid gap-2">
          <label className="flex items-center justify-between">
            <span className="text-sm">{t("labelDesigner.showSize")}</span>
            <Switch checked={el.showSize !== false} onCheckedChange={(v) => set({ showSize: v })} />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-sm">{t("labelDesigner.showColor")}</span>
            <Switch checked={el.showColor !== false} onCheckedChange={(v) => set({ showColor: v })} />
          </label>
        </div>
      )}

      {el.kind === "barcode" && (
        <>
          <div className="grid gap-1.5">
            <Label className="text-muted-foreground text-[11px]">
              {t("labelDesigner.barThickness")} ({(el.barWidth ?? 1.6).toFixed(1)})
            </Label>
            <Slider
              min={0.8}
              max={4}
              step={0.1}
              value={[el.barWidth ?? 1.6]}
              onValueChange={([v]) => set({ barWidth: v })}
            />
          </div>
          <label className="flex items-center justify-between">
            <span className="text-sm">{t("labelDesigner.showValue")}</span>
            <Switch checked={el.showValue !== false} onCheckedChange={(v) => set({ showValue: v })} />
          </label>
        </>
      )}

      {el.kind === "line" && (
        <NumberField
          label={t("labelDesigner.thicknessMm")}
          value={el.thickness ?? 0.3}
          onChange={(v) => set({ thickness: Math.max(0.1, v) })}
        />
      )}

      {el.kind === "frame" && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={t("labelDesigner.thicknessMm")}
            value={el.thickness ?? 0.4}
            onChange={(v) => set({ thickness: Math.max(0.1, v) })}
          />
          <NumberField
            label={t("labelDesigner.radiusMm")}
            value={el.radius ?? 0}
            onChange={(v) => set({ radius: Math.max(0, v) })}
          />
        </div>
      )}

      {!isTextKind(el.kind) ? null : (
        <div className="grid gap-1.5">
          <Label className="text-muted-foreground text-[11px]">{t("labelDesigner.color")}</Label>
          <input
            type="color"
            value={el.color}
            onChange={(e) => set({ color: e.target.value })}
            className="h-8 w-full cursor-pointer rounded-md border"
          />
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1", className)}>
      <Label className="text-muted-foreground text-[11px]">{label}</Label>
      <Input
        className="h-8"
        inputMode="decimal"
        value={String(value)}
        onChange={(e) => {
          if (e.target.value === "") return;
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
    </div>
  );
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}

function kindLabel(kind: LabelElementKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
