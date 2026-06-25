import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Save, Trash2, Link2, Phone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import {
  useArchiveSupplier,
  useCreateSupplier,
  useCurrency,
  useSuppliers,
  useUpdateSupplier,
} from "@/lib/pos/queries";
import { getPurchaseItems } from "@/lib/pos/purchases";
import type { SupplierInput } from "@/lib/pos/suppliers";
import type { PurchaseRow, Supplier } from "@/lib/pos/types";
import { SupplierForm } from "./supplier-form";
import { SupplierOrdersTab } from "./supplier-orders-tab";
import { SupplierPaymentsTab } from "./supplier-payments-tab";
import { exportPurchasePdf } from "./purchase-export";

const EMPTY_FORM: SupplierInput = {
  name: "",
  contact_name: null,
  phone: null,
  email: null,
  address: null,
  notes: null,
  activity: null,
  phone_fixe: null,
  fax: null,
  nif: null,
  nis: null,
  rc: null,
  art_imposition: null,
  rib: null,
};

function toInput(s: Supplier): SupplierInput {
  return {
    name: s.name,
    contact_name: s.contact_name,
    phone: s.phone,
    email: s.email,
    address: s.address,
    notes: s.notes,
    activity: s.activity,
    phone_fixe: s.phone_fixe,
    fax: s.fax,
    nif: s.nif,
    nis: s.nis,
    rc: s.rc,
    art_imposition: s.art_imposition,
    rib: s.rib,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Associer à l'Achat": attach the selected supplier to the current purchase. */
  onAssociate?: (supplier: Supplier) => void;
}

/** "Gestion des Fournisseurs": searchable supplier list + 3-tab detail panel. */
export function SuppliersDialog({ open, onOpenChange, onAssociate }: Props) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const suppliers = useSuppliers();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const archiveSupplier = useArchiveSupplier();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<SupplierInput>(EMPTY_FORM);
  const [search, setSearch] = useState("");

  const list = suppliers.data;
  const selected = useMemo(
    () => list?.find((s) => s.id === selectedId) ?? null,
    [list, selectedId],
  );

  const filtered = useMemo(() => {
    const all = list ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.phone ?? "").toLowerCase().includes(q),
    );
  }, [list, search]);

  // Load the selected supplier into the editable form when the selection
  // changes (render-phase adjustment — no effect, no cascading render).
  const [prevSelectedId, setPrevSelectedId] = useState<number | null>(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    if (selectedId == null) setForm(EMPTY_FORM);
    else if (selected) setForm(toInput(selected));
  }

  function startNew() {
    setSelectedId(null);
    setForm(EMPTY_FORM);
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error(t("purchasing.toast.nameRequired"));
      return;
    }
    try {
      if (selectedId) {
        await updateSupplier.mutateAsync({ id: selectedId, input: form });
      } else {
        const id = await createSupplier.mutateAsync(form);
        setSelectedId(id);
      }
      toast.success(t("purchasing.toast.supplierSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("purchasing.toast.error"));
    }
  }

  async function remove() {
    if (!selectedId) return;
    try {
      await archiveSupplier.mutateAsync(selectedId);
      toast.success(t("purchasing.toast.supplierDeleted"));
      startNew();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("purchasing.toast.error"));
    }
  }

  async function printPurchase(p: PurchaseRow) {
    const items = await getPurchaseItems(p.id);
    await exportPurchasePdf(p, items, currency, t);
  }

  const saving = createSupplier.isPending || updateSupplier.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle>{t("purchasing.manageSuppliers")}</DialogTitle>
        </DialogHeader>

        <div className="grid h-[70vh] grid-cols-[260px_1fr]">
          {/* Left: searchable list */}
          <aside className="flex flex-col border-e">
            <div className="p-3">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("purchasing.suppliers.search")}
              />
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {suppliers.isLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  {t("purchasing.empty.noSuppliers")}
                </p>
              ) : (
                filtered.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      "mb-1 w-full rounded-lg px-3 py-2 text-start transition",
                      selectedId === s.id
                        ? "bg-primary/10 ring-primary/30 ring-1"
                        : "hover:bg-accent",
                    )}
                  >
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    {s.phone && (
                      <p className="text-muted-foreground flex items-center gap-1 text-xs">
                        <Phone className="size-3" />
                        {s.phone}
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          </aside>

          {/* Right: actions + detail tabs */}
          <section className="flex flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              <Button size="sm" onClick={startNew}>
                <Plus className="size-4" />
                {t("purchasing.suppliers.new")}
              </Button>
              <Button size="sm" variant="outline" onClick={save} disabled={saving}>
                <Save className="size-4" />
                {t("purchasing.suppliers.save")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={remove}
                disabled={!selectedId}
              >
                <Trash2 className="size-4" />
                {t("purchasing.suppliers.delete")}
              </Button>
              {onAssociate && (
                <Button
                  size="sm"
                  variant="default"
                  className="ms-auto"
                  onClick={() => selected && onAssociate(selected)}
                  disabled={!selected}
                >
                  <Link2 className="size-4" />
                  {t("purchasing.suppliers.associate")}
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <Tabs defaultValue="info" className="w-full">
                <TabsList>
                  <TabsTrigger value="info">
                    {t("purchasing.suppliers.tabs.info")}
                  </TabsTrigger>
                  <TabsTrigger value="orders" disabled={!selectedId}>
                    {t("purchasing.suppliers.tabs.orders")}
                  </TabsTrigger>
                  <TabsTrigger value="payments" disabled={!selectedId}>
                    {t("purchasing.suppliers.tabs.payments")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="pt-4">
                  <SupplierForm
                    value={form}
                    onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                  />
                </TabsContent>

                <TabsContent value="orders" className="pt-4">
                  {selectedId ? (
                    <SupplierOrdersTab
                      supplierId={selectedId}
                      onPrint={printPurchase}
                    />
                  ) : (
                    <SelectPrompt />
                  )}
                </TabsContent>

                <TabsContent value="payments" className="pt-4">
                  {selected ? (
                    <SupplierPaymentsTab supplier={selected} />
                  ) : (
                    <SelectPrompt />
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SelectPrompt() {
  const { t } = useTranslation();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Link2 />
        </EmptyMedia>
        <EmptyTitle>{t("purchasing.empty.selectSupplier")}</EmptyTitle>
        <EmptyDescription>{t("purchasing.empty.noSuppliersDesc")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
