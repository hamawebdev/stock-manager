import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Printer, Minus, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrency, qk } from "@/lib/pos/queries";
import * as catalog from "@/lib/pos/catalog";
import { generateBarcode } from "@/lib/pos/barcode";
import { getInventorySettings } from "@/lib/pos/settings";
import { printLabelDesign } from "@/lib/pos/hardware";
import type { LabelPrintItem } from "@/lib/pos/label-render";
import { useLabelDesignerStore } from "@/store/use-label-designer-store";
import { DesignCanvas } from "./design-canvas";
import { DesignTab } from "./design-tab";
import { ArticlesTab } from "./articles-tab";
import { SavesTab } from "./saves-tab";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Products whose variants seed the basket when the designer opens. */
  initialProductIds?: number[];
}

export function LabelDesignerDialog({ open, onOpenChange, initialProductIds }: Props) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const qc = useQueryClient();

  const template = useLabelDesignerStore((s) => s.template);
  const basket = useLabelDesignerStore((s) => s.basket);
  const zoom = useLabelDesignerStore((s) => s.zoom);
  const setZoom = useLabelDesignerStore((s) => s.setZoom);
  const reset = useLabelDesignerStore((s) => s.reset);
  const setBasket = useLabelDesignerStore((s) => s.setBasket);

  // Seed the editor each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    reset();
    const ids = initialProductIds ?? [];
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      // Variants without a barcode get one auto-generated (using the shop's
      // configured symbology/prefix) and persisted, so the printed label can
      // actually be scanned back at checkout.
      const settings = await getInventorySettings().catch(() => null);
      const symbology = settings?.barcode_symbology ?? "ean13";
      const prefix = settings?.barcode_prefix ?? "20";

      const items: LabelPrintItem[] = [];
      let generated = 0;
      for (const id of ids) {
        const full = await catalog.getProductFull(id).catch(() => null);
        if (!full) continue;
        for (const v of full.variants) {
          if (v.archived) continue;
          let variant = v;
          if (!variant.barcode) {
            try {
              const code = await generateBarcode(symbology, { prefix });
              await catalog.updateVariant(variant.id, { barcode: code });
              variant = { ...variant, barcode: code };
              generated++;
            } catch {
              // Couldn't allocate a code — fall through and print without one.
            }
          }
          items.push({ variant, reference: full.product.reference, qty: 1 });
        }
      }
      if (cancelled) return;
      setBasket(items);
      if (generated > 0) {
        qc.invalidateQueries({ queryKey: qk.products });
        toast.info(t("labelDesigner.barcodesGenerated", { count: generated }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handlePrint() {
    try {
      await printLabelDesign(template, basket, currency);
      toast.success(t("labelDesigner.printSent"));
    } catch (e) {
      toast.error(t("labelDesigner.printFailed", { error: String(e) }));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] w-[97vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1180px]">
        <DialogDescription className="sr-only">
          {t("labelDesigner.description")}
        </DialogDescription>

        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2">
            <Printer className="text-primary size-5" />
            {t("labelDesigner.title")}
          </DialogTitle>
          <div className="me-8 flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => setZoom(zoom - 0.2)}>
              <Minus />
            </Button>
            <span className="w-12 text-center text-sm tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <Button variant="outline" size="icon-sm" onClick={() => setZoom(zoom + 0.2)}>
              <Plus />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1">
          <div className="flex w-[380px] shrink-0 flex-col border-e">
            <Tabs defaultValue="design" className="flex min-h-0 flex-1 flex-col gap-0">
              <TabsList className="m-3 grid grid-cols-3">
                <TabsTrigger value="design">{t("labelDesigner.tabDesign")}</TabsTrigger>
                <TabsTrigger value="articles">{t("labelDesigner.tabArticles")}</TabsTrigger>
                <TabsTrigger value="saves">{t("labelDesigner.tabSaves")}</TabsTrigger>
              </TabsList>
              <TabsContent value="design" className="min-h-0 flex-1 overflow-auto">
                <DesignTab />
              </TabsContent>
              <TabsContent value="articles" className="min-h-0 flex-1 overflow-hidden">
                <ArticlesTab />
              </TabsContent>
              <TabsContent value="saves" className="min-h-0 flex-1 overflow-hidden">
                <SavesTab />
              </TabsContent>
            </Tabs>
          </div>

          <div className="min-w-0 flex-1">
            <DesignCanvas />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-3">
          <Button className="w-full" size="lg" onClick={handlePrint} disabled={basket.length === 0}>
            <Printer /> {t("labelDesigner.print")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
