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
import * as purchases from "./purchases";
import * as supplierPayments from "./supplier-payments";
import * as customerPayments from "./customer-payments";
import * as productForm from "./product-form";
import * as activity from "./activity";
import * as bulk from "./bulk";
import * as catalogIo from "./catalog-io";
import * as customers from "./customers";
import * as promotions from "./promotions";
import * as held from "./held";
import * as expenses from "./expenses";
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
import {
  listLabelTemplates,
  saveLabelTemplate,
  deleteLabelTemplate,
  type LabelTemplate,
} from "./label-template";
import type { ShopSettings } from "./types";
import type { CurrencyConfig } from "@/lib/money";
import type { DateRange } from "@/lib/date-ranges";
import type { Granularity } from "./reports";

export const qk = {
  settings: ["settings"] as const,
  hardware: ["hardware"] as const,
  sizes: ["sizes"] as const,
  colors: ["colors"] as const,
  categories: ["categories"] as const,
  suppliers: ["suppliers"] as const,
  supplierBalance: (id: number) => ["supplier-balance", id] as const,
  supplierPayments: (id: number) => ["supplier-payments", id] as const,
  purchases: ["purchases"] as const,
  purchase: (id: number) => ["purchase", id] as const,
  purchaseItems: (id: number) => ["purchase-items", id] as const,
  purchasesBySupplier: (id: number) => ["purchases-by-supplier", id] as const,
  products: ["products"] as const,
  product: (id: number) => ["product", id] as const,
  productImages: (productId: number) => ["product-images", productId] as const,
  activity: (type: string, id: number) => ["activity", type, id] as const,
  variants: (productId: number) => ["variants", productId] as const,
  movements: (variantId: number) => ["movements", variantId] as const,
  sales: ["sales"] as const,
  returns: ["returns"] as const,
  cashSession: ["cash-session"] as const,
  cashBreakdown: ["cash-breakdown"] as const,
  cashSessions: ["cash-sessions"] as const,
  brands: ["brands"] as const,
  customers: ["customers"] as const,
  customerHistory: (id: number) => ["customer-history", id] as const,
  customerBalance: (id: number) => ["customer-balance", id] as const,
  customerPayments: (id: number) => ["customer-payments", id] as const,
  customerLedger: (id: number) => ["customer-ledger", id] as const,
  promotions: ["promotions"] as const,
  activePromotions: ["active-promotions"] as const,
  held: ["held"] as const,
  labelTemplates: ["label-templates"] as const,
  expenseCategories: ["expense-categories"] as const,
  expenseMethods: ["expense-methods"] as const,
  expenseRecurring: ["expense-recurring"] as const,
  expenses: (filters: expenses.ExpenseFilters) =>
    ["expenses", filters] as const,
  expenseAttachments: (id: number) => ["expense-attachments", id] as const,
  expenseKpis: (filters: expenses.ExpenseFilters) =>
    ["expense-kpis", filters] as const,
  expenseByCategory: (filters: expenses.ExpenseFilters) =>
    ["expense-by-category", filters] as const,
  expenseByMethod: (filters: expenses.ExpenseFilters) =>
    ["expense-by-method", filters] as const,
  expenseByMonth: (months: number) => ["expense-by-month", months] as const,
  expenseTopVendors: (filters: expenses.ExpenseFilters) =>
    ["expense-top-vendors", filters] as const,
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

// --- Label templates -------------------------------------------------------

export function useLabelTemplates() {
  return useQuery({ queryKey: qk.labelTemplates, queryFn: listLabelTemplates });
}

export function useSaveLabelTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (t: LabelTemplate) => saveLabelTemplate(t),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.labelTemplates }),
  });
}

export function useDeleteLabelTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLabelTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.labelTemplates }),
  });
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

/** Sales/returns headline over `range`. Pass `null` (e.g. an unbounded previous
 *  period) to skip the fetch — used by the period-over-period comparison. */
export function useSalesSummary(range: DateRange | null) {
  return useQuery({
    queryKey: ["report-sales-summary", range?.from ?? null, range?.to ?? null],
    queryFn: () => reports.getSalesSummary(range as DateRange),
    enabled: range != null,
  });
}

export function useSalesByDay(range: DateRange, granularity: Granularity) {
  return useQuery({
    queryKey: ["report-sales-by-day", range.from, range.to, granularity],
    queryFn: () => reports.getSalesByDay(range, granularity),
  });
}

export function useTopSellers(range: DateRange, limit = 10) {
  return useQuery({
    queryKey: ["report-top-sellers", range.from, range.to, limit],
    queryFn: () => reports.getTopSellers(range, limit),
  });
}

export function useReturnsReport(range: DateRange) {
  return useQuery({
    queryKey: ["report-returns", range.from, range.to],
    queryFn: () => reports.getReturnsReport(range),
  });
}

/** Net profit over `range`. Pass `null` to skip (previous-period comparison). */
export function useProfitSummary(range: DateRange | null) {
  return useQuery({
    queryKey: ["report-profit", range?.from ?? null, range?.to ?? null],
    queryFn: () => reports.getProfitSummary(range as DateRange),
    enabled: range != null,
  });
}

export function useProfitByDay(range: DateRange, granularity: Granularity) {
  return useQuery({
    queryKey: ["report-profit-by-day", range.from, range.to, granularity],
    queryFn: () => reports.getProfitByDay(range, granularity),
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

/** All variants matching a free-text query (empty => recent catalog). Used by
 *  the purchasing product grid, which operates on variants like checkout does. */
export function useVariantSearch(query: string) {
  return useQuery({
    queryKey: ["variant-search", query] as const,
    queryFn: () => catalog.searchVariants(query, 100),
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

export function useImportCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      rows,
      policy,
    }: {
      rows: catalogIo.CatalogImportRow[];
      policy: catalogIo.StockPolicy;
    }) => catalogIo.importCatalog(rows, policy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.products });
      qc.invalidateQueries({ queryKey: qk.categories });
      qc.invalidateQueries({ queryKey: qk.suppliers });
      qc.invalidateQueries({ queryKey: qk.sizes });
      qc.invalidateQueries({ queryKey: qk.colors });
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

export function useArchiveSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => suppliers.archiveSupplier(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.suppliers }),
  });
}

export function useSupplierBalance(supplierId: number | null) {
  return useQuery({
    queryKey: supplierId
      ? qk.supplierBalance(supplierId)
      : ["supplier-balance", "none"],
    queryFn: () => suppliers.getSupplierBalance(supplierId as number),
    enabled: supplierId != null,
  });
}

// --- Purchases -------------------------------------------------------------

export function usePurchases() {
  return useQuery({ queryKey: qk.purchases, queryFn: purchases.listPurchases });
}

export function usePurchasesBySupplier(supplierId: number | null) {
  return useQuery({
    queryKey: supplierId
      ? qk.purchasesBySupplier(supplierId)
      : ["purchases-by-supplier", "none"],
    queryFn: () => purchases.listPurchasesBySupplier(supplierId as number),
    enabled: supplierId != null,
  });
}

export function usePurchase(id: number | null) {
  return useQuery({
    queryKey: id ? qk.purchase(id) : ["purchase", "none"],
    queryFn: () => purchases.getPurchase(id as number),
    enabled: id != null,
  });
}

export function usePurchaseItems(id: number | null) {
  return useQuery({
    queryKey: id ? qk.purchaseItems(id) : ["purchase-items", "none"],
    queryFn: () => purchases.getPurchaseItems(id as number),
    enabled: id != null,
  });
}

/** Invalidate every cache a purchase mutation can touch (lists + stock/cost). */
function invalidatePurchaseCaches(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.purchases });
  qc.invalidateQueries({ queryKey: ["purchases-by-supplier"] });
  qc.invalidateQueries({ queryKey: ["supplier-balance"] });
  qc.invalidateQueries({ queryKey: qk.products });
}

export function useSaveDraftPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: purchases.PurchaseInput) =>
      purchases.saveDraftPurchase(input),
    onSuccess: () => invalidatePurchaseCaches(qc),
  });
}

export function useUpdateDraftPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: purchases.PurchaseInput }) =>
      purchases.updateDraftPurchase(id, input),
    onSuccess: (_d, { id }) => {
      invalidatePurchaseCaches(qc);
      qc.invalidateQueries({ queryKey: qk.purchase(id) });
      qc.invalidateQueries({ queryKey: qk.purchaseItems(id) });
    },
  });
}

export function useConfirmPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => purchases.confirmPurchase(id),
    onSuccess: (_d, id) => {
      invalidatePurchaseCaches(qc);
      qc.invalidateQueries({ queryKey: qk.purchase(id) });
    },
  });
}

export function useDeletePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => purchases.deletePurchase(id),
    onSuccess: () => invalidatePurchaseCaches(qc),
  });
}

// --- Supplier payments -----------------------------------------------------

export function useSupplierPayments(supplierId: number | null) {
  return useQuery({
    queryKey: supplierId
      ? qk.supplierPayments(supplierId)
      : ["supplier-payments", "none"],
    queryFn: () => supplierPayments.listPaymentsBySupplier(supplierId as number),
    enabled: supplierId != null,
  });
}

function invalidatePaymentCaches(
  qc: ReturnType<typeof useQueryClient>,
  supplierId: number,
) {
  qc.invalidateQueries({ queryKey: qk.supplierPayments(supplierId) });
  qc.invalidateQueries({ queryKey: qk.supplierBalance(supplierId) });
  qc.invalidateQueries({ queryKey: qk.purchases });
  qc.invalidateQueries({ queryKey: qk.purchasesBySupplier(supplierId) });
  qc.invalidateQueries({ queryKey: qk.cashBreakdown });
}

export function useAddSupplierPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: supplierPayments.SupplierPaymentInput) =>
      supplierPayments.addPayment(input),
    onSuccess: (_d, input) => invalidatePaymentCaches(qc, input.supplier_id),
  });
}

export function useDeleteSupplierPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; supplierId: number }) =>
      supplierPayments.deletePayment(id),
    onSuccess: (_d, { supplierId }) => invalidatePaymentCaches(qc, supplierId),
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

/**
 * Invalidate every cache that displays on-hand stock, so a sale/return/restock
 * is reflected immediately. `qk.products` alone is not enough: the Payments page
 * reads stock from the products-page grid, the POS/purchasing variant searches
 * and the per-product variant list, none of which share that key.
 */
function invalidateInventoryViews(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.products });
  qc.invalidateQueries({ queryKey: ["products-page"] });
  qc.invalidateQueries({ queryKey: ["pos-variant-search"] });
  qc.invalidateQueries({ queryKey: ["variant-search"] });
  qc.invalidateQueries({ queryKey: ["variants"] });
}

/** All completed sales with customer names — the Studio "Ventes" source list. */
export function useSales() {
  return useQuery({ queryKey: qk.sales, queryFn: () => sales.listSales() });
}

export function useCompleteSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: sales.CompleteSaleInput) => sales.completeSale(input),
    onSuccess: (_d, input) => {
      invalidateInventoryViews(qc);
      qc.invalidateQueries({ queryKey: qk.sales });
      qc.invalidateQueries({ queryKey: qk.cashBreakdown });
      qc.invalidateQueries({ queryKey: ["report-today"] });
      qc.invalidateQueries({ queryKey: ["report-sales-summary"] });
      qc.invalidateQueries({ queryKey: ["report-sales-by-day"] });
      qc.invalidateQueries({ queryKey: ["report-top-sellers"] });
      qc.invalidateQueries({ queryKey: ["report-profit"] });
      qc.invalidateQueries({ queryKey: ["report-profit-by-day"] });
      if (input.customer_id != null) {
        qc.invalidateQueries({ queryKey: qk.customerBalance(input.customer_id) });
        qc.invalidateQueries({ queryKey: qk.customerPayments(input.customer_id) });
        qc.invalidateQueries({ queryKey: qk.customerLedger(input.customer_id) });
        qc.invalidateQueries({ queryKey: qk.customerHistory(input.customer_id) });
      }
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

export function useCashSessions(limit = 30) {
  return useQuery({
    queryKey: [...qk.cashSessions, limit],
    queryFn: () => cash.listSessions(limit),
  });
}

export function useOpenCashSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      floatCents: number;
      cashierName?: string | null;
      openingNote?: string | null;
    }) => cash.openSession(v.floatCents, v.cashierName ?? null, v.openingNote ?? null),
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
    mutationFn: (v: {
      sessionId: number;
      countedCents: number;
      closingNote?: string | null;
      breakdownJson?: string | null;
    }) =>
      cash.closeSession(
        v.sessionId,
        v.countedCents,
        v.closingNote ?? null,
        v.breakdownJson ?? null,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.cashSession });
      qc.invalidateQueries({ queryKey: qk.cashBreakdown });
      qc.invalidateQueries({ queryKey: qk.cashSessions });
    },
  });
}

export function useProcessReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: returns.ProcessReturnInput) =>
      returns.processReturn(input),
    onSuccess: () => {
      invalidateInventoryViews(qc);
      qc.invalidateQueries({ queryKey: qk.sales });
      qc.invalidateQueries({ queryKey: qk.returns });
      // Refresh the transaction-history list, customer purchase history and
      // the reports that count returns/refunds.
      qc.invalidateQueries({ queryKey: ["recent-sales"] });
      qc.invalidateQueries({ queryKey: ["recent-returns"] });
      qc.invalidateQueries({ queryKey: ["customer-history"] });
      qc.invalidateQueries({ queryKey: ["report-today"] });
      qc.invalidateQueries({ queryKey: ["report-sales-summary"] });
      qc.invalidateQueries({ queryKey: ["report-returns"] });
      qc.invalidateQueries({ queryKey: ["report-profit"] });
      qc.invalidateQueries({ queryKey: ["report-profit-by-day"] });
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

// --- POS browse (brands) ---------------------------------------------------

export function useBrands() {
  return useQuery({ queryKey: qk.brands, queryFn: catalog.listBrands });
}

// --- Customers -------------------------------------------------------------

export function useCustomerSearch(query: string) {
  return useQuery({
    queryKey: [...qk.customers, query],
    queryFn: () => customers.searchCustomers(query),
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: customers.CustomerInput) =>
      customers.createCustomer(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.customers }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: customers.CustomerInput }) =>
      customers.updateCustomer(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.customers }),
  });
}

export function useCustomerHistory(customerId: number | null) {
  return useQuery({
    queryKey: customerId ? qk.customerHistory(customerId) : ["customer-history", "none"],
    queryFn: () => customers.getPurchaseHistory(customerId as number),
    enabled: customerId != null,
  });
}

export function useCustomerBalance(customerId: number | null) {
  return useQuery({
    queryKey: customerId ? qk.customerBalance(customerId) : ["customer-balance", "none"],
    queryFn: () => customers.getCustomerBalance(customerId as number),
    enabled: customerId != null,
  });
}

export function useCustomerLedger(customerId: number | null) {
  return useQuery({
    queryKey: customerId ? qk.customerLedger(customerId) : ["customer-ledger", "none"],
    queryFn: () => customers.getCustomerLedger(customerId as number),
    enabled: customerId != null,
  });
}

export function useCustomerPayments(customerId: number | null) {
  return useQuery({
    queryKey: customerId ? qk.customerPayments(customerId) : ["customer-payments", "none"],
    queryFn: () => customerPayments.listPaymentsByCustomer(customerId as number),
    enabled: customerId != null,
  });
}

function invalidateCustomerPaymentCaches(
  qc: ReturnType<typeof useQueryClient>,
  customerId: number,
) {
  qc.invalidateQueries({ queryKey: qk.customerPayments(customerId) });
  qc.invalidateQueries({ queryKey: qk.customerBalance(customerId) });
  qc.invalidateQueries({ queryKey: qk.customerLedger(customerId) });
  qc.invalidateQueries({ queryKey: qk.sales });
  qc.invalidateQueries({ queryKey: qk.cashBreakdown });
}

export function useAddCustomerPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: customerPayments.CustomerPaymentInput) =>
      customerPayments.addPayment(input),
    onSuccess: (_d, input) => invalidateCustomerPaymentCaches(qc, input.customer_id),
  });
}

export function useDeleteCustomerPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; customerId: number }) =>
      customerPayments.deletePayment(id),
    onSuccess: (_d, { customerId }) => invalidateCustomerPaymentCaches(qc, customerId),
  });
}

// --- Promotions ------------------------------------------------------------

export function usePromotions() {
  return useQuery({ queryKey: qk.promotions, queryFn: promotions.listPromotions });
}

/** Active, in-date promotions the checkout engine applies (polled live). */
export function useActivePromotions() {
  return useQuery({
    queryKey: qk.activePromotions,
    queryFn: promotions.listActivePromotions,
  });
}

export function useCreatePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: promotions.PromotionInput) =>
      promotions.createPromotion(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.promotions });
      qc.invalidateQueries({ queryKey: qk.activePromotions });
    },
  });
}

export function useSetPromotionActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; active: boolean }) =>
      promotions.setPromotionActive(v.id, v.active),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.promotions });
      qc.invalidateQueries({ queryKey: qk.activePromotions });
    },
  });
}

export function useArchivePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => promotions.archivePromotion(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.promotions });
      qc.invalidateQueries({ queryKey: qk.activePromotions });
    },
  });
}

// --- Held / suspended sales ------------------------------------------------

export function useHeldSales() {
  return useQuery({ queryKey: qk.held, queryFn: held.listHeld });
}

export function useHoldSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { label: string; payload: held.HeldCartPayload }) =>
      held.holdSale(v.label, v.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.held }),
  });
}

export function useResumeHeld() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => held.resumeHeld(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.held }),
  });
}

export function useDiscardHeld() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => held.discardHeld(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.held }),
  });
}

// --- Expenses --------------------------------------------------------------

/** Invalidate every cache an expense mutation can affect (lists + analytics). */
function invalidateExpenseCaches(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["expenses"] });
  qc.invalidateQueries({ queryKey: ["expense-kpis"] });
  qc.invalidateQueries({ queryKey: ["expense-by-category"] });
  qc.invalidateQueries({ queryKey: ["expense-by-method"] });
  qc.invalidateQueries({ queryKey: ["expense-by-month"] });
  qc.invalidateQueries({ queryKey: ["expense-top-vendors"] });
}

export function useExpenseCategories(includeArchived = false) {
  return useQuery({
    queryKey: [...qk.expenseCategories, includeArchived],
    queryFn: () => expenses.listCategories(includeArchived),
  });
}

export function useCreateExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name: string; color?: string | null }) =>
      expenses.createCategory(v.name, v.color ?? null),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.expenseCategories }),
  });
}

export function useUpdateExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      id: number;
      name?: string;
      color?: string | null;
    }) => expenses.updateCategory(v.id, { name: v.name, color: v.color }),
    onSuccess: () => invalidateExpenseCaches(qc),
  });
}

export function useArchiveExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; restore?: boolean }) =>
      v.restore
        ? expenses.restoreCategory(v.id)
        : expenses.archiveCategory(v.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.expenseCategories }),
  });
}

export function useExpenseMethods(includeArchived = false) {
  return useQuery({
    queryKey: [...qk.expenseMethods, includeArchived],
    queryFn: () => expenses.listPaymentMethods(includeArchived),
  });
}

export function useCreateExpenseMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => expenses.createPaymentMethod(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.expenseMethods }),
  });
}

export function useUpdateExpenseMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; name: string }) =>
      expenses.updatePaymentMethod(v.id, v.name),
    onSuccess: () => invalidateExpenseCaches(qc),
  });
}

export function useArchiveExpenseMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; restore?: boolean }) =>
      v.restore
        ? expenses.restorePaymentMethod(v.id)
        : expenses.archivePaymentMethod(v.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.expenseMethods }),
  });
}

export function useExpenses(filters: expenses.ExpenseFilters) {
  return useQuery({
    queryKey: qk.expenses(filters),
    queryFn: () => expenses.listExpenses(filters),
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: expenses.ExpenseInput) => expenses.createExpense(input),
    onSuccess: () => invalidateExpenseCaches(qc),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; input: expenses.ExpenseInput }) =>
      expenses.updateExpense(v.id, v.input),
    onSuccess: () => invalidateExpenseCaches(qc),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { deleteAttachmentFiles } = await import("@/lib/expense-attachments");
      await expenses.deleteExpense(id);
      await deleteAttachmentFiles(id);
    },
    onSuccess: () => invalidateExpenseCaches(qc),
  });
}

export function useExpenseAttachments(expenseId: number | null) {
  return useQuery({
    queryKey: expenseId
      ? qk.expenseAttachments(expenseId)
      : ["expense-attachments", "none"],
    queryFn: () => expenses.listAttachments(expenseId as number),
    enabled: expenseId != null,
  });
}

export function useExpenseKpis(filters: expenses.ExpenseFilters) {
  return useQuery({
    queryKey: qk.expenseKpis(filters),
    queryFn: () => expenses.getKpis(filters),
  });
}

export function useExpenseByCategory(filters: expenses.ExpenseFilters) {
  return useQuery({
    queryKey: qk.expenseByCategory(filters),
    queryFn: () => expenses.getByCategory(filters),
  });
}

export function useExpenseByMethod(filters: expenses.ExpenseFilters) {
  return useQuery({
    queryKey: qk.expenseByMethod(filters),
    queryFn: () => expenses.getByMethod(filters),
  });
}

export function useExpenseByMonth(months = 12) {
  return useQuery({
    queryKey: qk.expenseByMonth(months),
    queryFn: () => expenses.getByMonth(months),
  });
}

export function useExpenseTopVendors(
  filters: expenses.ExpenseFilters,
  limit = 10,
) {
  return useQuery({
    queryKey: [...qk.expenseTopVendors(filters), limit],
    queryFn: () => expenses.getTopVendors(limit, filters),
  });
}

export function useRecurringTemplates() {
  return useQuery({
    queryKey: qk.expenseRecurring,
    queryFn: expenses.listRecurring,
  });
}

export function useCreateRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: expenses.RecurringInput) =>
      expenses.createRecurring(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.expenseRecurring }),
  });
}

export function useUpdateRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; input: expenses.RecurringInput }) =>
      expenses.updateRecurring(v.id, v.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.expenseRecurring }),
  });
}

export function useDeleteRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => expenses.deleteRecurring(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.expenseRecurring }),
  });
}

export function usePostRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => expenses.postRecurring(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.expenseRecurring });
      invalidateExpenseCaches(qc);
    },
  });
}
