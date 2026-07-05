import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { X, Plus, Eraser, Users, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityCombobox } from "@/components/inventory/entity-combobox";
import { PurchaseProductGrid } from "@/components/purchasing/purchase-product-grid";
import { SuppliersDialog } from "@/components/purchasing/suppliers-dialog";
import { PurchasesDialog } from "@/components/purchasing/purchases-dialog";
import { PurchasePaymentDialog } from "@/components/purchasing/purchase-payment-dialog";
import {
  useConfirmPurchase,
  useCreateSupplier,
  useCurrency,
  useSaveDraftPurchase,
  useSuppliers,
  useUpdateDraftPurchase,
} from "@/lib/pos/queries";
import { getPurchase, getPurchaseItems } from "@/lib/pos/purchases";
import type { PurchaseLineInput } from "@/lib/pos/purchases";
import { computePurchaseTotals } from "@/lib/pos/purchases";
import { formatMoney, parseMoney } from "@/lib/money";
import type { PaymentTerms, VariantDetail } from "@/lib/pos/types";

interface CartLine {
  key: string;
  variant_id: number | null;
  description: string;
  qty: string;
  unit: string;
  unitCost: string; // decimal string in major units
}

let lineSeq = 0;
function newKey() {
  return `l-${++lineSeq}`;
}

function variantLabel(v: VariantDetail): string {
  const parts = [v.product_name, v.size_name, v.color_name].filter(Boolean);
  return parts.join(" · ");
}

export default function PurchasingPage() {
  const { t } = useTranslation();
  const currency = useCurrency();
  const suppliers = useSuppliers();
  const createSupplier = useCreateSupplier();
  const saveDraft = useSaveDraftPurchase();
  const updateDraft = useUpdateDraftPurchase();
  const confirmPurchase = useConfirmPurchase();

  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [invoiceRef, setInvoiceRef] = useState("");
  const [tvaEnabled, setTvaEnabled] = useState(false);
  const [tvaRate, setTvaRate] = useState(19);
  const [terms, setTerms] = useState<PaymentTerms>("credit");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [purchasesOpen, setPurchasesOpen] = useState(false);
  const [payment, setPayment] = useState<{
    purchaseId: number;
    supplierId: number;
    totalCents: number;
    prefillFull: boolean;
  } | null>(null);

  // Build the repo line inputs from the editable cart (parsing money/qty).
  const lineInputs = useMemo<PurchaseLineInput[]>(
    () =>
      lines.map((l) => ({
        variant_id: l.variant_id,
        description: l.description,
        qty: Number(l.qty) || 0,
        unit: l.unit || null,
        unit_cost_ht_cents: parseMoney(l.unitCost || "0", currency.decimals) ?? 0,
      })),
    [lines, currency.decimals],
  );

  const totals = useMemo(
    () => computePurchaseTotals(lineInputs, tvaEnabled, tvaRate),
    [lineInputs, tvaEnabled, tvaRate],
  );

  function addVariant(v: VariantDetail) {
    setLines((prev) => {
      // Bump qty if the same variant is already in the cart.
      const idx = prev.findIndex((l) => l.variant_id === v.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: String((Number(copy[idx].qty) || 0) + 1) };
        return copy;
      }
      return [
        ...prev,
        {
          key: newKey(),
          variant_id: v.id,
          description: variantLabel(v),
          qty: "1",
          unit: "u",
          unitCost: ((v.cost_cents ?? 0) / 10 ** currency.decimals).toFixed(
            currency.decimals,
          ),
        },
      ];
    });
  }

  function addFreeLine() {
    setLines((prev) => [
      ...prev,
      { key: newKey(), variant_id: null, description: "", qty: "1", unit: "u", unitCost: "0" },
    ]);
  }

  function patchLine(key: string, patch: Partial<CartLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function clearCart() {
    setLines([]);
  }

  function clearAll() {
    setSupplierId(null);
    setInvoiceRef("");
    setTerms("credit");
    setTvaEnabled(false);
    setLines([]);
    setEditingId(null);
  }

  function buildInput() {
    return {
      supplier_id: supplierId,
      purchase_date: date,
      invoice_ref: invoiceRef.trim() || null,
      note: null,
      tva_enabled: tvaEnabled,
      tva_rate: tvaRate,
      payment_terms: terms,
      lines: lineInputs,
    };
  }

  /** Persist as draft, returning the purchase id (creates or updates). */
  async function persist(): Promise<number> {
    const input = buildInput();
    if (editingId) {
      await updateDraft.mutateAsync({ id: editingId, input });
      return editingId;
    }
    const id = await saveDraft.mutateAsync(input);
    setEditingId(id);
    return id;
  }

  async function onSaveDraft() {
    if (lineInputs.length === 0) {
      toast.error(t("purchasing.toast.cartEmpty"));
      return;
    }
    try {
      await persist();
      toast.success(t("purchasing.toast.saved"));
      clearAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("purchasing.toast.error"));
    }
  }

  async function onValidate() {
    if (lineInputs.length === 0) {
      toast.error(t("purchasing.toast.cartEmpty"));
      return;
    }
    try {
      const id = await persist();
      const confirmed = await confirmPurchase.mutateAsync(id);
      toast.success(t("purchasing.toast.confirmed"));

      // Capture a payment when the terms imply money changes hands now.
      if (supplierId && terms !== "credit") {
        setPayment({
          purchaseId: id,
          supplierId,
          totalCents: confirmed.total_ttc_cents,
          prefillFull: terms === "cash",
        });
      } else {
        clearAll();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("purchasing.toast.error"));
    }
  }

  // Load a draft back into the editor from the "Gestion des Achats" dialog.
  async function loadDraft(id: number) {
    const [p, items] = await Promise.all([getPurchase(id), getPurchaseItems(id)]);
    if (!p) return;
    setEditingId(id);
    setSupplierId(p.supplier_id);
    setDate(p.purchase_date ?? new Date().toISOString().slice(0, 10));
    setInvoiceRef(p.invoice_ref ?? "");
    setTvaEnabled(p.tva_enabled === 1);
    setTvaRate(p.tva_rate);
    setTerms((p.payment_terms as PaymentTerms) ?? "credit");
    setLines(
      items.map((it) => ({
        key: newKey(),
        variant_id: it.variant_id,
        description: it.description,
        qty: String(it.qty),
        unit: it.unit ?? "u",
        unitCost: (it.unit_cost_ht_cents / 10 ** currency.decimals).toFixed(
          currency.decimals,
        ),
      })),
    );
  }

  const busy = saveDraft.isPending || updateDraft.isPending || confirmPurchase.isPending;

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t("purchasing.newPurchase")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-56">
            <EntityCombobox
              items={(suppliers.data ?? []).map((s) => ({ id: s.id, label: s.name }))}
              value={supplierId}
              onChange={setSupplierId}
              onCreate={(name) => createSupplier.mutateAsync({ name })}
              placeholder={t("purchasing.selectSupplier")}
              noun={t("purchasing.supplier")}
            />
          </div>
          <Button variant="outline" onClick={clearAll}>
            <Eraser className="size-4" />
            {t("purchasing.clear")}
          </Button>
          <Button variant="outline" onClick={() => setSuppliersOpen(true)}>
            <Users className="size-4" />
            {t("purchasing.manageSuppliers")}
          </Button>
          <Button onClick={() => setPurchasesOpen(true)}>
            <ClipboardList className="size-4" />
            {t("purchasing.managePurchases")}
          </Button>
        </div>
      </div>

      {/* Meta bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs">{t("purchasing.date")}</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
          />
        </div>
        <Input
          value={invoiceRef}
          onChange={(e) => setInvoiceRef(e.target.value)}
          placeholder={t("purchasing.invoiceRef")}
          className="w-64 flex-1"
        />
        <div className="flex items-center gap-2">
          <Switch checked={tvaEnabled} onCheckedChange={setTvaEnabled} id="tva" />
          <Label htmlFor="tva" className="text-sm font-medium">
            {t("purchasing.tva")}
          </Label>
          <Input
            type="number"
            value={tvaRate}
            onChange={(e) => setTvaRate(Number(e.target.value) || 0)}
            disabled={!tvaEnabled}
            className="w-20"
          />
          <span className="text-muted-foreground text-sm">%</span>
        </div>
      </div>

      {/* Body: product grid + cart. Bounded to the viewport (grid rows give each
          side a definite height) so both sides scroll internally and the cart's
          footer actions stay pinned. On lg+ it's two columns; below lg it stacks
          into two rows: the product grid takes the free space while the cart row
          is floored at 17rem — enough for its taller footer (totals + terms +
          the two action buttons) so those never get clipped on short/narrow
          windows, while the line-item list keeps scrolling internally. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(17rem,1fr)] gap-4 lg:grid-cols-[1fr_440px] lg:grid-rows-1">
        <div className="min-h-0 overflow-hidden rounded-xl border p-3">
          <PurchaseProductGrid onPick={addVariant} />
        </div>

        {/* Cart */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="font-semibold">
              {t("purchasing.details")}{" "}
              <span className="text-muted-foreground">({lines.length})</span>
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={addFreeLine}>
                <Plus className="size-4" />
                {t("purchasing.freeLine")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={clearCart}
                disabled={lines.length === 0}
              >
                {t("purchasing.emptyCart")}
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {lines.length === 0 ? (
              <p className="text-muted-foreground py-10 text-center text-sm">
                {t("purchasing.empty.noPurchasesDesc")}
              </p>
            ) : (
              <div className="space-y-2">
                {lines.map((l) => (
                  <div key={l.key} className="bg-card rounded-lg border p-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={l.description}
                        onChange={(e) => patchLine(l.key, { description: e.target.value })}
                        placeholder={t("purchasing.product")}
                        className="h-8 flex-1"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => removeLine(l.key)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                    <div className="mt-2 grid grid-cols-[1fr_70px_1fr] gap-2">
                      <LabeledInput
                        label={t("purchasing.qty")}
                        value={l.qty}
                        inputMode="decimal"
                        onChange={(v) => patchLine(l.key, { qty: v })}
                      />
                      <LabeledInput
                        label={t("purchasing.unit")}
                        value={l.unit}
                        onChange={(v) => patchLine(l.key, { unit: v })}
                      />
                      <LabeledInput
                        label={t("purchasing.unitCost")}
                        value={l.unitCost}
                        inputMode="decimal"
                        onChange={(v) => patchLine(l.key, { unitCost: v })}
                      />
                    </div>
                    <p className="text-muted-foreground mt-1 text-end text-xs">
                      {t("purchasing.lineTotal")}:{" "}
                      <span className="text-foreground font-medium">
                        {formatMoney(
                          Math.round(
                            (Number(l.qty) || 0) *
                              (parseMoney(l.unitCost || "0", currency.decimals) ?? 0),
                          ),
                          currency,
                        )}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer totals + actions */}
          <div className="space-y-3 border-t p-4">
            <Row label={t("purchasing.subtotalHt")} value={formatMoney(totals.subtotal_ht_cents, currency)} />
            {tvaEnabled && (
              <Row
                label={`${t("purchasing.tva")} (${tvaRate}%)`}
                value={formatMoney(totals.tva_cents, currency)}
              />
            )}
            <Row
              label={t("purchasing.totalTtc")}
              value={formatMoney(totals.total_ttc_cents, currency)}
              strong
            />

            <Select value={terms} onValueChange={(v) => setTerms(v as PaymentTerms)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">{t("purchasing.paymentTerms.credit")}</SelectItem>
                <SelectItem value="partial">{t("purchasing.paymentTerms.partial")}</SelectItem>
                <SelectItem value="cash">{t("purchasing.paymentTerms.cash")}</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onSaveDraft} disabled={busy}>
                {t("purchasing.saveDraft")}
              </Button>
              <Button className="flex-1" onClick={onValidate} disabled={busy}>
                <Plus className="size-4" />
                {t("purchasing.validate")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <SuppliersDialog
        open={suppliersOpen}
        onOpenChange={setSuppliersOpen}
        onAssociate={(s) => {
          setSupplierId(s.id);
          setSuppliersOpen(false);
        }}
      />
      <PurchasesDialog
        open={purchasesOpen}
        onOpenChange={setPurchasesOpen}
        onEditDraft={loadDraft}
      />
      {payment && (
        <PurchasePaymentDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setPayment(null);
              clearAll();
            }
          }}
          supplierId={payment.supplierId}
          purchaseId={payment.purchaseId}
          totalCents={payment.totalCents}
          prefillFull={payment.prefillFull}
          onDone={() => {
            setPayment(null);
            clearAll();
          }}
        />
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-bold" : "text-muted-foreground text-sm"}>
        {label}
      </span>
      <span className={strong ? "text-lg font-bold" : "text-sm font-medium"}>
        {value}
      </span>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "decimal" | "text";
}) {
  return (
    <label className="block">
      <span className="text-muted-foreground text-[10px] uppercase">{label}</span>
      <Input
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className="h-8"
      />
    </label>
  );
}
