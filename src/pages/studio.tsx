/**
 * Studio — document generation & printing workspace. A 3-pane layout: a
 * searchable source list (left), the appearance/content settings ("Paramètres",
 * middle), and a live A4 preview (right) that re-renders instantly. Documents
 * export via both paths: "Imprimer" (HTML → OS print/Save-as-PDF, pixel-perfect)
 * and "PDF" (a directly-saved jsPDF). Appearance settings are ephemeral.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { printHtml } from "@/lib/pos/hardware";
import { documentHtml } from "@/lib/pos/studio/document-html";
import { exportDocumentPdf } from "@/lib/pos/studio/studio-pdf";
import {
  DEFAULT_STUDIO_SETTINGS,
  SOURCE_TEMPLATE,
  TEMPLATE_SOURCE,
  type SourceKind,
  type StudioSettings,
} from "@/lib/pos/studio/types";
import { SourceList } from "@/components/studio/source-list";
import { SettingsPanel } from "@/components/studio/settings-panel";
import { Preview } from "@/components/studio/preview";
import { useStudioDocument } from "@/components/studio/use-studio-document";

const TABS: SourceKind[] = ["ventes", "achats", "clients", "fournisseurs"];

export default function StudioPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_STUDIO_SETTINGS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const sourceKind = TEMPLATE_SOURCE[settings.template];
  const { model, isLoading, hasSelection } = useStudioDocument(settings, selectedId);

  function update(patch: Partial<StudioSettings>) {
    if (patch.template && patch.template !== settings.template) {
      setSelectedId(null);
      setQuery("");
    }
    setSettings((s) => ({ ...s, ...patch }));
  }

  function selectTab(kind: SourceKind) {
    update({ template: SOURCE_TEMPLATE[kind] });
  }

  function onPrint() {
    if (model) printHtml(documentHtml(model, settings));
  }

  async function onExportPdf() {
    if (!model) return;
    setBusy(true);
    try {
      await exportDocumentPdf(model, settings.paper);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b px-3 py-2">
        {TABS.map((k) => (
          <button
            key={k}
            onClick={() => selectTab(k)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition",
              sourceKind === k
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {t(`studio.tabs.${k}`)}
          </button>
        ))}
      </div>

      {/* 3-pane workspace */}
      <div className="grid min-h-0 flex-1 grid-cols-[18rem_22rem_1fr]">
        {/* Left: source list */}
        <div className="flex min-h-0 flex-col border-e">
          <div className="relative p-3">
            <Search className="text-muted-foreground absolute top-1/2 start-6 size-4 -translate-y-1/2" />
            <Input
              className="ps-9"
              placeholder={t("studio.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SourceList
              sourceKind={sourceKind}
              query={query}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        </div>

        {/* Middle: settings */}
        <div className="min-h-0 border-e">
          <SettingsPanel
            settings={settings}
            onChange={update}
            onPrint={onPrint}
            onExportPdf={onExportPdf}
            canExport={!!model}
            busy={busy}
          />
        </div>

        {/* Right: live preview */}
        <div className="relative min-h-0">
          <Preview
            model={model}
            settings={settings}
            loading={isLoading}
            hasSelection={hasSelection}
          />
        </div>
      </div>
    </div>
  );
}
