import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Save, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useLabelTemplates,
  useSaveLabelTemplate,
  useDeleteLabelTemplate,
} from "@/lib/pos/queries";
import { newId, type LabelTemplate } from "@/lib/pos/label-template";
import { useLabelDesignerStore } from "@/store/use-label-designer-store";

export function SavesTab() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const templates = useLabelTemplates();
  const saveMut = useSaveLabelTemplate();
  const deleteMut = useDeleteLabelTemplate();

  const template = useLabelDesignerStore((s) => s.template);
  const loadTemplate = useLabelDesignerStore((s) => s.loadTemplate);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const toSave: LabelTemplate = {
      id: newId(),
      name: trimmed,
      widthMm: template.widthMm,
      heightMm: template.heightMm,
      elements: template.elements.map((e) => ({ ...e })),
      createdAt: new Date().toISOString(),
    };
    try {
      await saveMut.mutateAsync(toSave);
      setName("");
      toast.success(t("labelDesigner.templateSaved"));
    } catch (e) {
      toast.error(t("common.couldNotSave", { error: String(e) }));
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMut.mutateAsync(id);
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <section className="grid gap-2">
        <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {t("labelDesigner.saveCurrent")}
        </h4>
        <div className="flex gap-2">
          <Input
            placeholder={t("labelDesigner.templateNamePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <Button onClick={handleSave} disabled={!name.trim() || saveMut.isPending} size="icon">
            <Save />
          </Button>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col gap-2 border-t pt-4">
        <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {t("labelDesigner.myTemplates")}
        </h4>
        <ScrollArea className="min-h-0 flex-1 rounded-md border">
          {(templates.data?.length ?? 0) === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 p-8 text-center text-sm">
              <FileText className="size-7" />
              {t("labelDesigner.noTemplates")}
            </div>
          ) : (
            <ul className="divide-y">
              {templates.data?.map((tpl) => (
                <li
                  key={tpl.id}
                  onDoubleClick={() => {
                    loadTemplate(tpl);
                    toast.success(t("labelDesigner.templateLoaded", { name: tpl.name }));
                  }}
                  className="hover:bg-accent/60 flex cursor-pointer items-center justify-between gap-2 px-3 py-2"
                  title={t("labelDesigner.doubleClickToLoad")}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{tpl.name}</span>
                    <span className="text-muted-foreground block text-xs">
                      {tpl.widthMm} × {tpl.heightMm} mm · {tpl.elements.length}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(tpl.id);
                    }}
                  >
                    <X className="text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </section>
    </div>
  );
}
