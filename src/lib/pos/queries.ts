/**
 * React Query hooks over the POS repositories. Components use these instead of
 * calling the repos directly, so caching and invalidation live in one place.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as catalog from "./catalog";
import * as inventory from "./inventory";
import * as sales from "./sales";
import * as returns from "./returns";
import * as cash from "./cash";
import * as reports from "./reports";
import * as suppliers from "./suppliers";
import * as productForm from "./product-form";
import * as activity from "./activity";
import * as bulk from "./bulk";
import * as images from "@/lib/images";
import {
  getSettings,
  setSetting,
  currencyFromSettings,
  getInventorySettings,
} from "./settings";
import {
  getHardwareConfig,
  saveHardwareConfig,
  type HardwareConfig,
} from "./hardware";
import type { ShopSettings } from "./types";
import type { CurrencyConfig } from "@/lib/money";

export const qk = {
  settings: ["settings"] as const,
  hardware: ["hardware"] as const,
  sizes: ["sizes"] as const,
  colors: ["colors"] as const,
  categories: ["categories"] as const,
  suppliers: ["suppliers"] as const,
  products: ["products"] as const,
  product: (id: number) => ["product", id] as const,
  productImages: (productId: number) => ["product-images", productId] as const,
  activity: (type: string, id: number) => ["activity", type, id] as const,
  variants: (productId: number) => ["variants", productId] as const,
  movements: (variantId: number) => ["movements", variantId] as const,
  sales: ["sales"] as const,
  cashSession: ["cash-session"] as const,
  cashBreakdown: ["cash-breakdown"] as const,
};

// --- Settings / currency ---------------------------------------------------

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: getSettings });
}

/** Currency config for formatting money; falls back to a sane default. */
export function useCurrency(): CurrencyConfig {
  const { data } = useSettings();
  return data
    ? currencyFromSettings(data)
    : { symbol: "", decimals: 2 };
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<ShopSettings>) => {
      for (const [key, value] of Object.entries(patch)) {
        await setSetting(key, String(value));
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.settings }),
  });
}

export function useHardwareConfig() {
  return useQuery({ queryKey: qk.hardware, queryFn: getHardwareConfig });
}

export function useSaveHardwareConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cfg: HardwareConfig) => saveHardwareConfig(cfg),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.hardware }),
  });
}

// --- Lookups ---------------------------------------------------------------

export function useSizes() {
  return useQuery({ queryKey: qk.sizes, queryFn: catalog.listSizes });
}

export function useColors() {
  return useQuery({ queryKey: qk.colors, queryFn: catalog.listColors });
}

export function useCategories() {
  return useQuery({ queryKey: qk.categories, queryFn: catalog.listCategories });
}

/** Returns the new category id so the caller can auto-select it. */
export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => catalog.createCategory(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.categories }),
  });
}

export function useCreateSize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name: string; sortOrder: number }) =>
      catalog.createSize(v.name, v.sortOrder),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.sizes }),
  });
}

export function useCreateColor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name: string; hex: string | null }) =>
      catalog.createColor(v.name, v.hex),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.colors }),
  });
}

// --- Reports ---------------------------------------------------------------

export function useTodaySummary() {
  return useQuery({ queryKey: ["report-today"], queryFn: reports.getTodaySummary });
}

export function useSalesByDay(days = 14) {
  return useQuery({
    queryKey: ["report-sales-by-day", days],
    queryFn: () => reports.getSalesByDay(days),
  });
}

export function useTopSellers(days = 30, limit = 10) {
  return useQuery({
    queryKey: ["report-top-sellers", days, limit],
    queryFn: () => reports.getTopSellers(days, limit),
  });
}

export function useInventoryValuation() {
  return useQuery({
    queryKey: ["report-valuation"],
    queryFn: reports.getInventoryValuation,
  });
}

export function useBestSellers(range: { from?: string | null; to?: string | null }) {
  return useQuery({
    queryKey: ["report-best-sellers", range.from ?? null, range.to ?? null],
    queryFn: () => reports.getBestSellers(range),
  });
}

export function useInventoryKpis(defaultLowStock = 5) {
  return useQuery({
    queryKey: ["report-inventory-kpis", defaultLowStock],
    queryFn: () => reports.getInventoryKpis(defaultLowStock),
  });
}

export function useMovementAnalytics(days = 30) {
  return useQuery({
    queryKey: ["report-movement-analytics", days],
    queryFn: () => reports.getMovementAnalytics(days),
  });
}

// --- Products --------------------------------------------------------------

export function useProducts() {
  return useQuery({
    queryKey: qk.products,
    queryFn: catalog.listProductSummaries,
  });
}

export function useProductVariants(productId: number | null) {
  return useQuery({
    queryKey: productId ? qk.variants(productId) : ["variants", "none"],
    queryFn: () => catalog.listVariantsForProduct(productId as number),
    enabled: productId != null,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: catalog.ProductInput) => catalog.createProduct(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.products }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: catalog.ProductInput }) =>
      catalog.updateProduct(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.products }),
  });
}

export function useArchiveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => catalog.archiveProduct(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.products }),
  });
}

export function useProductsPage(query: catalog.ProductPageQuery) {
  return useQuery({
    queryKey: ["products-page", query],
    queryFn: () => catalog.listProductsPage(query),
  });
}

export function useProductFull(id: number | null) {
  return useQuery({
    queryKey: id ? qk.product(id) : ["product", "none"],
    queryFn: () => catalog.getProductFull(id as number),
    enabled: id != null,
  });
}

/** Create a product with its variants + opening stock in one transaction. */
export function useCreateProductFull() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: productForm.ProductFormInput) =>
      productForm.createProductWithVariants(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.products }),
  });
}

/** Update a product + reconcile its variants in one transaction. */
export function useUpdateProductFull() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: number;
      input: productForm.ProductFormInput;
    }) => productForm.updateProductWithVariants(id, input),
    onSuccess: (_v, { id }) => {
      qc.invalidateQueries({ queryKey: qk.products });
      qc.invalidateQueries({ queryKey: qk.product(id) });
      qc.invalidateQueries({ queryKey: qk.variants(id) });
    },
  });
}

export function useInventorySettings() {
  return useQuery({
    queryKey: ["inventory-settings"],
    queryFn: getInventorySettings,
  });
}

export function useAddVariantsWithStock(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (drafts: productForm.VariantDraft[]) =>
      productForm.addVariantsWithStock(productId, drafts),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.variants(productId) });
      qc.invalidateQueries({ queryKey: qk.product(productId) });
      qc.invalidateQueries({ queryKey: qk.products });
    },
  });
}

export function useDuplicateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => catalog.duplicateProduct(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.products }),
  });
}

// --- Bulk operations -------------------------------------------------------

export function useBulkImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: bulk.BulkImportRow[]) => bulk.bulkImportProducts(rows),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.products });
      qc.invalidateQueries({ queryKey: qk.categories });
      qc.invalidateQueries({ queryKey: qk.suppliers });
    },
  });
}

export function useBulkAssignCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, categoryId }: { ids: number[]; categoryId: number | null }) =>
      bulk.bulkAssignCategory(ids, categoryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.products }),
  });
}

export function useBulkArchive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => bulk.bulkArchiveProducts(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.products }),
  });
}

// --- Suppliers -------------------------------------------------------------

export function useSuppliers() {
  return useQuery({ queryKey: qk.suppliers, queryFn: suppliers.listSuppliers });
}

/** Returns the new supplier id so the form can auto-select it. */
export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: suppliers.SupplierInput) =>
      suppliers.createSupplier(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.suppliers }),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: suppliers.SupplierInput }) =>
      suppliers.updateSupplier(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.suppliers }),
  });
}

// --- Product images --------------------------------------------------------

export function useProductImages(productId: number | null) {
  return useQuery({
    queryKey: productId ? qk.productImages(productId) : ["product-images", "none"],
    queryFn: () => images.listProductImages(productId as number),
    enabled: productId != null,
  });
}

// --- Activity / history ----------------------------------------------------

export function useActivity(
  entityType: "product" | "variant" | "supplier",
  entityId: number | null,
) {
  return useQuery({
    queryKey: entityId ? qk.activity(entityType, entityId) : ["activity", "none"],
    queryFn: () => activity.listActivity(entityType, entityId as number),
    enabled: entityId != null,
  });
}

export function useGenerateVariants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      productId,
      specs,
    }: {
      productId: number;
      specs: catalog.VariantSpec[];
    }) => catalog.generateVariants(productId, specs),
    onSuccess: (_n, { productId }) => {
      qc.invalidateQueries({ queryKey: qk.variants(productId) });
      qc.invalidateQueries({ queryKey: qk.products });
    },
  });
}

export function useUpdateVariant(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      fields,
    }: {
      id: number;
      fields: Parameters<typeof catalog.updateVariant>[1];
    }) => catalog.updateVariant(id, fields),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: qk.variants(productId) }),
  });
}

// --- Sales -----------------------------------------------------------------

export function useCompleteSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: sales.CompleteSaleInput) => sales.completeSale(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.products });
      qc.invalidateQueries({ queryKey: qk.sales });
    },
  });
}

// --- Cash management -------------------------------------------------------

export function useOpenSession() {
  return useQuery({
    queryKey: qk.cashSession,
    queryFn: cash.getOpenSession,
  });
}

export function useCashBreakdown(session: cash.CashSession | null) {
  return useQuery({
    queryKey: [...qk.cashBreakdown, session?.id ?? null],
    queryFn: () => cash.computeBreakdown(session as cash.CashSession),
    enabled: !!session,
  });
}

export function useOpenCashSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (floatCents: number) => cash.openSession(floatCents),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.cashSession }),
  });
}

export function useAddCashEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      sessionId: number;
      kind: cash.CashEvent["kind"];
      amountCents: number;
      reason: string | null;
    }) => cash.addCashEvent(v.sessionId, v.kind, v.amountCents, v.reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.cashBreakdown }),
  });
}

export function useCloseCashSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { sessionId: number; countedCents: number }) =>
      cash.closeSession(v.sessionId, v.countedCents),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.cashSession });
      qc.invalidateQueries({ queryKey: qk.cashBreakdown });
    },
  });
}

export function useProcessReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: returns.ProcessReturnInput) =>
      returns.processReturn(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.products });
      qc.invalidateQueries({ queryKey: qk.sales });
    },
  });
}

// --- Inventory adjustments -------------------------------------------------

export function useAdjustStock(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (m: inventory.MovementInput) => inventory.adjustStock(m),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.variants(productId) });
      qc.invalidateQueries({ queryKey: qk.products });
    },
  });
}
