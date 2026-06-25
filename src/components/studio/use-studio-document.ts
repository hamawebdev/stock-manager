/**
 * Resolves the live DocumentModel for the Studio: fetches the selected entity's
 * data bundle once (keyed by template + id), the shop header + logo data URL, and
 * rebuilds the model on any settings change (cheap, synchronous).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrency, useSettings } from "@/lib/pos/queries";
import { shopLogoDataUrl } from "@/lib/pos/shop";
import { loadDocData } from "@/lib/pos/studio/data";
import { buildDocumentModel } from "@/lib/pos/studio/document-model";
import type { DocShop, StudioSettings } from "@/lib/pos/studio/types";

export function useStudioDocument(settings: StudioSettings, entityId: number | null) {
  const shopSettings = useSettings();
  const currency = useCurrency();

  const logoPath = shopSettings.data?.shop_logo ?? "";
  const logo = useQuery({
    queryKey: ["shop-logo-data", logoPath],
    queryFn: () => shopLogoDataUrl(logoPath),
    enabled: logoPath.length > 0,
  });

  const docData = useQuery({
    queryKey: ["studio-doc", settings.template, entityId],
    queryFn: () => loadDocData(settings.template, entityId as number),
    enabled: entityId != null,
  });

  const model = useMemo(() => {
    const ss = shopSettings.data;
    if (!docData.data || !ss) return null;
    const shop: DocShop = {
      name: ss.shop_name,
      address: ss.shop_address,
      phone: ss.shop_phone,
      email: ss.shop_email,
      logoDataUrl: logo.data ?? null,
      nif: ss.shop_nif,
      nis: ss.shop_nis,
      rc: ss.shop_rc,
      art: ss.shop_art,
    };
    return buildDocumentModel(docData.data, shop, currency, settings);
  }, [docData.data, shopSettings.data, logo.data, currency, settings]);

  return { model, isLoading: docData.isFetching, hasSelection: entityId != null };
}
