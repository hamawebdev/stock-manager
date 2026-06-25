import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Printer, Trash2, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import {
  useCurrency,
  useDeletePurchase,
  usePurchase,
  usePurchaseItems,
  usePurchases,
} from "@/lib/pos/queries";
import type { PurchaseRow } from "@/lib/pos/types";
import { SummaryCards } from "./summary-cards";
import { statusBadgeVariant } from "./status";
import { exportPurchasePdf } from "./purchase-export";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Load a draft back into the purchase editor. */
  onEditDraft?: (purchaseId: number) => void;
}

/** "Gestion des Achats": searchable purchase list + detail with totals + items. */
export function PurchasesDialog({ open, onOpenChange, onEditDraft }: Props) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const money = (c: number) => formatMoney(c, currency);

  const purchases = usePurchases();
  const deletePurchase = useDeletePurchase();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const detail = usePurchase(selectedId);
  const items = usePurchaseItems(selectedId);

  const filtered = useMemo(() => {
    const all = purchases.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (p) =>
        (p.code ?? "").toLowerCase().includes(q) ||
        (p.supplier_name ?? "").toLowerCase().includes(q),
    );
  }, [purchases.data, search]);

  async function print(p: PurchaseRow) {
    const rows = items.data ?? [];
    await exportPurchasePdf(p, rows, currency, t);
  }

  async function remove(id: number) {
    try {
      await deletePurchase.mutateAsync(id);
      toast.success(t("purchasing.toast.deleted"));
      setSelectedId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("purchasing.toast.error"));
    }
  }

  const p = detail.data;
  const balanceDue = p ? p.total_ttc_cents - p.paid_cents : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle>{t("purchasing.managePurchases")}</DialogTitle>
        </DialogHeader>

        <div className="grid h-[70vh] grid-cols-[280px_1fr]">
          {/* Left: searchable list */}
          <aside className="flex flex-col border-e">
            <div className="p-3">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("purchasing.searchPurchase")}
              />
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {purchases.isLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  {t("purchasing.empty.noPurchases")}
                </p>
              ) : (
                filtered.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={cn(
                      "mb-1 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start transition",
                      selectedId === row.id
                        ? "bg-primary/10 ring-primary/30 ring-1"
                        : "hover:bg-accent",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {row.code ?? t("purchasing.status.draft")}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {row.supplier_name ?? "—"} ·{" "}
                        {row.purchase_date ?? row.created_at.slice(0, 10)}
                      </span>
                    </span>
                    <Badge variant={statusBadgeVariant(row.status)}>
                      {t(`purchasing.status.${row.status}`)}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </aside>

          {/* Right: detail */}
          <section className="flex flex-col overflow-y-auto p-5">
            {!p ? (
              <p className="text-muted-foreground m-auto text-sm">
                {t("purchasing.empty.selectPurchase")}
              </p>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {p.code ?? t("purchasing.status.draft")}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {p.supplier_name ?? "—"} ·{" "}
                      {p.purchase_date ?? p.created_at.slice(0, 10)}
                    </p>
                  </div>
                  <Badge variant={statusBadgeVariant(p.status)}>
                    {t(`purchasing.status.${p.status}`)}
                  </Badge>
                </div>

                <SummaryCards
                  cards={[
                    {
                      label: t("purchasing.cards.totalPurchase"),
                      value: money(p.total_ttc_cents),
                      tone: "primary",
                    },
                    {
                      label: t("purchasing.cards.amountPaid"),
                      value: money(p.paid_cents),
                      tone: "success",
                    },
                    {
                      label: t("purchasing.cards.balanceDue"),
                      value: money(balanceDue),
                      tone: "danger",
                    },
                  ]}
                />

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => print(p)}>
                    <Printer className="size-4" />
                    {t("purchasing.print")}
                  </Button>
                  {p.status === "draft" && onEditDraft && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onEditDraft(p.id);
                        onOpenChange(false);
                      }}
                    >
                      <Pencil className="size-4" />
                      {t("common.edit")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => remove(p.id)}
                    disabled={deletePurchase.isPending}
                  >
                    <Trash2 className="size-4" />
                    {t("purchasing.deletePurchase")}
                  </Button>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold">
                    {t("purchasing.includedItems")}
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("purchasing.product")}</TableHead>
                        <TableHead className="text-end">{t("purchasing.qty")}</TableHead>
                        <TableHead className="text-end">{t("purchasing.unitCost")}</TableHead>
                        <TableHead className="text-end">{t("purchasing.lineTotal")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(items.data ?? []).map((it) => (
                        <TableRow key={it.id}>
                          <TableCell>{it.description}</TableCell>
                          <TableCell className="text-end">
                            {it.qty} {it.unit ?? ""}
                          </TableCell>
                          <TableCell className="text-end">
                            {money(it.unit_cost_ht_cents)}
                          </TableCell>
                          <TableCell className="text-end">
                            {money(it.line_total_ht_cents)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
