import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Copy,
  Archive,
  Printer,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCategories,
  useSuppliers,
  useCurrency,
  useInventorySettings,
  useCreateProductFull,
  useUpdateProductFull,
  useDuplicateProduct,
  useArchiveProduct,
  qk,
} from "@/lib/pos/queries";
import type { ProductFull } from "@/lib/pos/catalog";
import { generateUniqueReference } from "@/lib/pos/catalog";
import { generateBarcode } from "@/lib/pos/barcode";
import type { ProductFormInput } from "@/lib/pos/product-form";
import {
  saveProductImage,
  deleteProductImage,
  setPrimaryImage,
  productImageSrc,
  fileToBytes,
} from "@/lib/images";
import { printLabel } from "@/lib/pos/hardware";
import { formatMoney, parseMoney } from "@/lib/money";
import { EntityCombobox } from "./entity-combobox";
import { SupplierCreateDialog } from "./supplier-create-dialog";
import { CategoryCreateDialog } from "./category-create-dialog";
import { BarcodePreview } from "./barcode-preview";
import { ImageUploader, type UploaderImage } from "./image-uploader";
import { VariantEditor, type VariantRow } from "./variant-editor";
import { ProductActivityTimeline } from "./product-activity-timeline";

const DRAFT_KEY = "atelier:product-draft:v1";

interface FormData {
  name: string;
  reference: string;
  categoryId: number | null;
  supplierId: number | null;
  brand: string;
  purchase: string;
  selling: string;
  lowStock: string;
  reorder: string;
  outOfStockAlert: boolean;
  description: string;
  notes: string;
  barcode: string; // identification barcode (simple-mode default variant)
  hasVariants: boolean;
  simpleStock: string;
  rows: VariantRow[];
}

function blankForm(): FormData {
  return {
    name: "",
    reference: "",
    categoryId: null,
    supplierId: null,
    brand: "",
    purchase: "",
    selling: "",
    lowStock: "",
    reorder: "",
    outOfStockAlert: true,
    description: "",
    notes: "",
    barcode: "",
    hasVariants: false,
    simpleStock: "0",
    rows: [],
  };
}

interface Props {
  mode: "create" | "edit";
  initial?: ProductFull | null;
}

export function ProductForm({ mode, initial }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currency = useCurrency();
  const qc = useQueryClient();
  const categories = useCategories();
  const suppliers = useSuppliers();
  const inv = useInventorySettings();
  const createProduct = useCreateProductFull();
  const updateProduct = useUpdateProductFull();
  const duplicate = useDuplicateProduct();
  const archive = useArchiveProduct();

  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  const symbology = inv.data?.barcode_symbology ?? "ean13";
  const barcodePrefix = inv.data?.barcode_prefix ?? "20";

  const moneyStr = (cents: number) =>
    formatMoney(cents, { ...currency, symbol: "" });

  // The single default variant id (simple products), needed to edit its stock.
  const defaultVariantId = useMemo(() => {
    const v = initial?.variants.find(
      (x) => x.size_id === null && x.color_id === null,
    );
    return v?.id ?? initial?.variants[0]?.id ?? null;
  }, [initial]);

  const [form, setForm] = useState<FormData>(() => {
    if (mode === "edit" && initial) {
      const p = initial.product;
      const simple =
        initial.variants.length <= 1 &&
        (initial.variants[0]?.size_id == null) &&
        (initial.variants[0]?.color_id == null);
      const rows: VariantRow[] = initial.variants.map((v) => ({
        key: `v-${v.id}`,
        variantId: v.id,
        size_id: v.size_id,
        color_id: v.color_id,
        size_name: v.size_name ?? "—",
        color_name: v.color_name ?? "—",
        color_hex: v.color_hex,
        sku: v.sku,
        barcode: v.barcode ?? "",
        stock: String(v.stock),
      }));
      return {
        name: p.name,
        reference: p.reference ?? "",
        categoryId: p.category_id,
        supplierId: p.supplier_id,
        brand: p.brand ?? "",
        purchase: moneyStr(p.cost_cents),
        selling: moneyStr(p.price_cents),
        lowStock: p.low_stock_threshold != null ? String(p.low_stock_threshold) : "",
        reorder: p.reorder_quantity != null ? String(p.reorder_quantity) : "",
        outOfStockAlert: p.out_of_stock_alert !== 0,
        description: p.description ?? "",
        notes: p.notes ?? "",
        barcode: simple ? initial.variants[0]?.barcode ?? "" : "",
        hasVariants: !simple,
        simpleStock: simple ? String(initial.variants[0]?.stock ?? 0) : "0",
        rows: simple ? [] : rows,
      };
    }
    return blankForm();
  });

  const [images, setImages] = useState<UploaderImage[]>([]);
  const pendingFiles = useRef<Map<string, File>>(new Map());
  const [removedSavedIds, setRemovedSavedIds] = useState<number[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  // --- Draft restore (create only) -----------------------------------------
  useEffect(() => {
    if (mode !== "create") return;
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as FormData;
      if (draft.name || draft.rows?.length || draft.reference) {
        setForm({ ...blankForm(), ...draft });
        toast.info(t("inventory.form.draftRestored"), {
          action: {
            label: t("inventory.form.discard"),
            onClick: () => {
              localStorage.removeItem(DRAFT_KEY);
              setForm(blankForm());
              setDirty(false);
            },
          },
        });
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Autosave draft (create only) ----------------------------------------
  useEffect(() => {
    if (mode !== "create" || !dirty) return;
    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    }, 600);
    return () => clearTimeout(timer);
  }, [form, dirty, mode]);

  // --- Load existing images (edit) -----------------------------------------
  useEffect(() => {
    if (mode !== "edit" || !initial) return;
    let cancelled = false;
    (async () => {
      const resolved = await Promise.all(
        initial.images.map(async (im) => ({
          key: `saved-${im.id}`,
          src: await productImageSrc(im.path).catch(() => ""),
          isPrimary: im.is_primary === 1,
          saved: true,
        })),
      );
      if (!cancelled) setImages(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, initial]);

  // --- Unsaved-changes guards ----------------------------------------------
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(t("inventory.form.unsavedConfirm"))) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);

  // --- Keyboard shortcuts ---------------------------------------------------
  const saveRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --- Image handlers -------------------------------------------------------
  function addFiles(files: File[]) {
    const added: UploaderImage[] = files.map((file) => {
      const key = crypto.randomUUID();
      pendingFiles.current.set(key, file);
      return {
        key,
        src: URL.createObjectURL(file),
        isPrimary: false,
        saved: false,
      };
    });
    setImages((cur) => {
      const next = [...cur, ...added];
      if (!next.some((i) => i.isPrimary) && next.length) next[0].isPrimary = true;
      return [...next];
    });
    setDirty(true);
  }

  function removeImage(key: string) {
    setImages((cur) => {
      const target = cur.find((i) => i.key === key);
      if (target?.saved) {
        setRemovedSavedIds((ids) => [...ids, Number(key.replace("saved-", ""))]);
      } else {
        pendingFiles.current.delete(key);
        if (target) URL.revokeObjectURL(target.src);
      }
      const next = cur.filter((i) => i.key !== key);
      if (target?.isPrimary && next.length) next[0].isPrimary = true;
      return [...next];
    });
    setDirty(true);
  }

  function setPrimary(key: string) {
    setImages((cur) =>
      cur.map((i) => ({ ...i, isPrimary: i.key === key })),
    );
    setDirty(true);
  }

  async function persistImages(productId: number) {
    for (const id of removedSavedIds) await deleteProductImage(id);
    for (const img of images.filter((i) => !i.saved)) {
      const file = pendingFiles.current.get(img.key);
      if (!file) continue;
      await saveProductImage(productId, await fileToBytes(file), file.name, {
        isPrimary: img.isPrimary,
      });
    }
    const primary = images.find((i) => i.isPrimary);
    if (primary?.saved) {
      await setPrimaryImage(productId, Number(primary.key.replace("saved-", "")));
    }
    qc.invalidateQueries({ queryKey: qk.productImages(productId) });
  }

  // --- Build + validate -----------------------------------------------------
  function buildInput(): ProductFormInput | null {
    if (!form.name.trim()) {
      toast.error(t("inventory.form.nameRequired"));
      return null;
    }
    const cost = parseMoney(form.purchase || "0", currency.decimals);
    const price = parseMoney(form.selling || "0", currency.decimals);
    if (cost == null || price == null) {
      toast.error(t("inventory.form.invalidPrices"));
      return null;
    }
    const toInt = (s: string) => {
      const n = parseInt(s || "0", 10);
      return Number.isFinite(n) ? n : 0;
    };

    let variants: ProductFormInput["variants"];
    if (!form.hasVariants) {
      variants = [
        {
          variantId: mode === "edit" ? defaultVariantId ?? undefined : undefined,
          size_id: null,
          color_id: null,
          sku: "",
          barcode: form.barcode.trim() || null,
          stock: toInt(form.simpleStock),
        },
      ];
    } else {
      if (form.rows.length === 0) {
        toast.error(t("inventory.form.addOneVariant"));
        return null;
      }
      variants = form.rows.map((r) => ({
        variantId: r.variantId,
        size_id: r.size_id,
        color_id: r.color_id,
        sku: r.sku.trim() || null,
        barcode: r.barcode.trim() || null,
        stock: toInt(r.stock),
      }));
    }

    return {
      name: form.name.trim(),
      category_id: form.categoryId,
      supplier_id: form.supplierId,
      brand: form.brand.trim() || null,
      reference: form.reference.trim() || null,
      description: form.description.trim() || null,
      notes: form.notes.trim() || null,
      cost_cents: cost,
      price_cents: price,
      low_stock_threshold: form.lowStock.trim() === "" ? null : toInt(form.lowStock),
      reorder_quantity: form.reorder.trim() === "" ? null : toInt(form.reorder),
      out_of_stock_alert: form.outOfStockAlert ? 1 : 0,
      variants,
    };
  }

  async function handleSave(thenNew = false) {
    const input = buildInput();
    if (!input) return;
    setSaving(true);
    try {
      let productId: number;
      if (mode === "edit" && initial) {
        productId = initial.product.id;
        await updateProduct.mutateAsync({ id: productId, input });
      } else {
        productId = await createProduct.mutateAsync(input);
      }
      await persistImages(productId).catch((e) =>
        toast.warning(t("inventory.form.imagesFailed", { error: String(e) })),
      );
      localStorage.removeItem(DRAFT_KEY);
      setDirty(false);
      toast.success(mode === "edit" ? t("inventory.form.productUpdated") : t("inventory.form.productCreated"));
      if (thenNew) {
        resetForNew();
      } else {
        navigate("/inventory");
      }
    } catch (e) {
      toast.error(t("common.couldNotSave", { error: String(e) }));
    } finally {
      setSaving(false);
    }
  }

  function resetForNew() {
    for (const img of images) if (!img.saved) URL.revokeObjectURL(img.src);
    pendingFiles.current.clear();
    setImages([]);
    setRemovedSavedIds([]);
    setForm(blankForm());
    setDirty(false);
    document.getElementById("p-name")?.focus();
  }

  // Keep the Ctrl/Cmd+S handler pointing at the latest closure.
  useEffect(() => {
    saveRef.current = () => handleSave(false);
  });

  async function genReference() {
    try {
      set("reference", await generateUniqueReference());
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function genBarcode() {
    try {
      set("barcode", await generateBarcode(symbology, { prefix: barcodePrefix }));
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function printSimpleLabel() {
    if (!form.barcode.trim()) {
      toast.error(t("inventory.form.generateBarcodeFirst"));
      return;
    }
    try {
      await printLabel({
        title: form.name || t("inventory.form.productFallback"),
        variant: "",
        barcode: form.barcode.trim(),
        price_cents: parseMoney(form.selling || "0", currency.decimals) ?? 0,
        currency,
      });
      toast.success(t("inventory.labelSent"));
    } catch (e) {
      toast.error(t("inventory.labelFailed", { error: String(e) }));
    }
  }

  async function handleDuplicate() {
    if (!initial) return;
    try {
      const newId = await duplicate.mutateAsync(initial.product.id);
      setDirty(false);
      toast.success(t("inventory.form.productDuplicated"));
      navigate(`/inventory/${newId}/edit`);
    } catch (e) {
      toast.error(t("inventory.form.couldNotDuplicate", { error: String(e) }));
    }
  }

  async function handleArchive() {
    if (!initial) return;
    if (!window.confirm(t("inventory.form.archiveConfirm")))
      return;
    try {
      await archive.mutateAsync(initial.product.id);
      setDirty(false);
      toast.success(t("inventory.form.productArchived"));
      navigate("/inventory");
    } catch (e) {
      toast.error(t("inventory.couldNotArchive", { error: String(e) }));
    }
  }

  // --- Derived --------------------------------------------------------------
  const margin = useMemo(() => {
    const cost = parseMoney(form.purchase || "0", currency.decimals) ?? 0;
    const price = parseMoney(form.selling || "0", currency.decimals) ?? 0;
    if (price <= 0) return null;
    return ((price - cost) / price) * 100;
  }, [form.purchase, form.selling, currency.decimals]);

  return (
    <div className="mx-auto max-w-6xl p-4 pb-24 sm:p-6">
      {/* Sticky header */}
      <div className="bg-background/80 sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-3 border-b px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate("/inventory")}>
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">
            {mode === "edit" ? t("inventory.form.editTitle") : t("inventory.createProduct")}
          </h1>
          <p className="text-muted-foreground text-xs">
            {dirty ? t("inventory.form.unsavedChanges") : t("inventory.form.allSaved")}
          </p>
        </div>
        {mode === "edit" && (
          <>
            <Button variant="outline" size="sm" onClick={handleDuplicate}>
              <Copy /> {t("inventory.form.duplicate")}
            </Button>
            <Button variant="outline" size="sm" onClick={handleArchive}>
              <Archive /> {t("inventory.archive")}
            </Button>
          </>
        )}
        {mode === "create" && (
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => handleSave(true)}
          >
            {t("inventory.form.saveAndNew")}
          </Button>
        )}
        <Button size="sm" disabled={saving} onClick={() => handleSave(false)}>
          <Save /> {t("common.save")}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-4 lg:col-span-2">
          {/* Basic information */}
          <Card>
            <CardHeader>
              <CardTitle>{t("inventory.form.basicInfo")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="p-name">{t("inventory.form.productName")}</Label>
                <Input
                  id="p-name"
                  autoFocus
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder={t("inventory.form.productNamePlaceholder")}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>{t("inventory.colCategory")}</Label>
                  <EntityCombobox
                    items={(categories.data ?? []).map((c) => ({
                      id: c.id,
                      label: c.name,
                    }))}
                    value={form.categoryId}
                    onChange={(id) => set("categoryId", id)}
                    onAddClick={() => setCategoryDialogOpen(true)}
                    placeholder={t("inventory.uncategorized")}
                    noun={t("inventory.form.nounCategory")}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p-brand">{t("inventory.colBrand")}</Label>
                  <Input
                    id="p-brand"
                    value={form.brand}
                    onChange={(e) => set("brand", e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Identification */}
          <Card>
            <CardHeader>
              <CardTitle>{t("inventory.form.identification")}</CardTitle>
              <CardDescription>{t("inventory.form.identificationHint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="p-ref">{t("inventory.form.reference")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="p-ref"
                    className="font-mono"
                    value={form.reference}
                    onChange={(e) => set("reference", e.target.value)}
                    placeholder={t("inventory.form.referencePlaceholder")}
                  />
                  <Button type="button" variant="outline" onClick={genReference}>
                    <Sparkles /> {t("inventory.form.generate")}
                  </Button>
                </div>
              </div>

              {!form.hasVariants && (
                <div className="grid gap-2">
                  <Label htmlFor="p-barcode">{t("inventory.barcode")}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="p-barcode"
                      className="font-mono"
                      value={form.barcode}
                      onChange={(e) => set("barcode", e.target.value)}
                      placeholder={t("inventory.form.scanOrGenerate")}
                    />
                    <Button type="button" variant="outline" onClick={genBarcode}>
                      <RefreshCw /> {t("inventory.form.generate")}
                    </Button>
                    <Button type="button" variant="outline" onClick={printSimpleLabel}>
                      <Printer /> {t("common.print")}
                    </Button>
                  </div>
                  <BarcodePreview
                    value={form.barcode.trim()}
                    symbology={symbology}
                    className="mt-1"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle>{t("inventory.form.pricing")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="p-cost">
                  {t("inventory.form.purchasePrice")}{currency.symbol ? ` (${currency.symbol})` : ""}
                </Label>
                <Input
                  id="p-cost"
                  inputMode="decimal"
                  value={form.purchase}
                  onChange={(e) => set("purchase", e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-price">
                  {t("inventory.form.sellingPrice")}{currency.symbol ? ` (${currency.symbol})` : ""}
                </Label>
                <Input
                  id="p-price"
                  inputMode="decimal"
                  value={form.selling}
                  onChange={(e) => set("selling", e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("inventory.form.profitMargin")}</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium">
                  {margin == null ? "—" : `${margin.toFixed(1)} %`}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Inventory + variants */}
          <Card>
            <CardHeader>
              <CardTitle>{t("inventory.title")}</CardTitle>
              <CardDescription>{t("inventory.form.inventoryHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <VariantEditor
                hasVariants={form.hasVariants}
                onToggle={(v) => set("hasVariants", v)}
                simpleStock={form.simpleStock}
                onSimpleStock={(v) => set("simpleStock", v)}
                rows={form.rows}
                onRows={(rows) => set("rows", rows)}
                symbology={symbology}
                barcodePrefix={barcodePrefix}
              />
            </CardContent>
          </Card>

          {/* Stock control */}
          <Card>
            <CardHeader>
              <CardTitle>{t("inventory.form.stockControl")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="p-low">{t("inventory.form.lowStockThreshold")}</Label>
                <Input
                  id="p-low"
                  inputMode="numeric"
                  value={form.lowStock}
                  onChange={(e) => set("lowStock", e.target.value)}
                  placeholder={t("inventory.form.defaultValue", { value: inv.data?.default_low_stock_threshold ?? 5 })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-reorder">{t("inventory.form.reorderQuantity")}</Label>
                <Input
                  id="p-reorder"
                  inputMode="numeric"
                  value={form.reorder}
                  onChange={(e) => set("reorder", e.target.value)}
                  placeholder={t("common.optional")}
                />
              </div>
              <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <Label htmlFor="p-oos" className="text-sm">
                  {t("inventory.form.outOfStockAlert")}
                </Label>
                <Switch
                  id="p-oos"
                  checked={form.outOfStockAlert}
                  onCheckedChange={(v) => set("outOfStockAlert", v)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Additional */}
          <Card>
            <CardHeader>
              <CardTitle>{t("inventory.form.additionalInfo")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="p-desc">{t("inventory.form.description")}</Label>
                <Textarea
                  id="p-desc"
                  rows={3}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-notes">{t("inventory.form.internalNotes")}</Label>
                <Textarea
                  id="p-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Side column */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("inventory.form.supplier")}</CardTitle>
            </CardHeader>
            <CardContent>
              <EntityCombobox
                items={(suppliers.data ?? []).map((s) => ({
                  id: s.id,
                  label: s.name,
                }))}
                value={form.supplierId}
                onChange={(id) => set("supplierId", id)}
                onAddClick={() => setSupplierDialogOpen(true)}
                placeholder={t("inventory.form.noSupplier")}
                noun={t("inventory.form.nounSupplier")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("inventory.form.productMedia")}</CardTitle>
              <CardDescription>{t("inventory.form.productMediaHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ImageUploader
                images={images}
                onAddFiles={addFiles}
                onRemove={removeImage}
                onSetPrimary={setPrimary}
                disabled={saving}
              />
            </CardContent>
          </Card>

          {mode === "edit" && initial && (
            <Card>
              <CardHeader>
                <CardTitle>{t("inventory.form.activityTimeline")}</CardTitle>
                <CardDescription>{t("inventory.form.activityHint")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ProductActivityTimeline productId={initial.product.id} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <SupplierCreateDialog
        open={supplierDialogOpen}
        onOpenChange={setSupplierDialogOpen}
        onCreated={(id) => set("supplierId", id)}
      />
      <CategoryCreateDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        onCreated={(id) => set("categoryId", id)}
      />
    </div>
  );
}
