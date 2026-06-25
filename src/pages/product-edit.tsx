import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, PackageX } from "lucide-react";
import {
  useProductFull,
  useInventorySettings,
  useSettings,
} from "@/lib/pos/queries";
import { ProductForm } from "@/components/inventory/product-form";

/**
 * Dedicated full-page Create / Edit Product experience (replaces the old modal).
 * Route `/inventory/new` creates; `/inventory/:id/edit` edits. Rendering is
 * gated until currency + inventory settings (and, in edit mode, the product)
 * are loaded, so the form initializes with correct money formatting.
 */
export default function ProductEditPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const productId = id ? Number(id) : null;
  const isEdit = productId != null;

  const productQ = useProductFull(productId);
  const inv = useInventorySettings();
  const settings = useSettings();

  const loading =
    inv.isLoading || settings.isLoading || (isEdit && productQ.isLoading);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  if (isEdit && !productQ.data) {
    return (
      <div className="text-muted-foreground flex h-64 flex-col items-center justify-center gap-2">
        <PackageX className="size-8" />
        <p className="text-sm">{t("inventory.productNotFound")}</p>
      </div>
    );
  }

  return (
    <ProductForm
      key={isEdit ? `edit-${productId}` : "create"}
      mode={isEdit ? "edit" : "create"}
      initial={productQ.data ?? null}
    />
  );
}
