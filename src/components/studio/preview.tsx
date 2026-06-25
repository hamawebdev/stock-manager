/**
 * Right pane: the live A4 preview. Renders the SAME `documentHtml` string the
 * print path uses inside a scaled-to-fit iframe, so it re-renders instantly on
 * any settings change and is guaranteed to match what prints.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { documentHtml } from "@/lib/pos/studio/document-html";
import type { DocumentModel, PaperFormat, StudioSettings } from "@/lib/pos/studio/types";

const MM_PX = 96 / 25.4;
const PAPER: Record<PaperFormat, { w: number; h: number }> = {
  a4: { w: 210, h: 297 },
  a5: { w: 148, h: 210 },
  ticket: { w: 80, h: 600 },
};

export function Preview({
  model,
  settings,
  loading,
  hasSelection,
}: {
  model: DocumentModel | null;
  settings: StudioSettings;
  loading: boolean;
  hasSelection: boolean;
}) {
  const { t } = useTranslation();
  const html = useMemo(() => (model ? documentHtml(model, settings) : ""), [model, settings]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);

  const dims = PAPER[settings.paper];
  const pageWpx = dims.w * MM_PX;
  const pageHpx = dims.h * MM_PX;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, (el.clientWidth - 48) / pageWpx));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageWpx]);

  return (
    <div ref={containerRef} className="bg-muted/40 flex h-full items-start justify-center overflow-auto p-6">
      {!hasSelection ? (
        <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
          <FileText className="size-10 opacity-40" />
          {t("studio.selectPrompt")}
        </div>
      ) : !model ? (
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div style={{ width: pageWpx * scale, height: pageHpx * scale }}>
          {loading && (
            <div className="text-muted-foreground absolute end-8 top-8 z-10">
              <Spinner className="size-4" />
            </div>
          )}
          <iframe
            title={t("studio.preview")}
            srcDoc={html}
            style={{
              width: pageWpx,
              height: pageHpx,
              border: 0,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              background: "#fff",
              boxShadow: "0 4px 24px rgba(0,0,0,.12)",
            }}
          />
        </div>
      )}
    </div>
  );
}
