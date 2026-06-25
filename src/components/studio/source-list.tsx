/**
 * Left pane: the searchable source list for the active Studio tab. Each row shows
 * a name, a ref/date line, an amount, and a status badge; clicking selects the
 * entity the document renders for.
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { useCurrency, useSales, usePurchases, useCustomerSearch, useSuppliers } from "@/lib/pos/queries";
import { paymentMethodLabel } from "@/lib/pos/payment-methods";
import { formatDocDate } from "@/lib/pos/studio/document-model";
import type { SourceKind } from "@/lib/pos/studio/types";

interface Row {
  id: number;
  title: string;
  subtitle: string;
  amount: string | null;
  badge: string;
  badgeClass: string;
}

const VIOLET_BADGE = "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300";
const GREEN_BADGE = "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
const AMBER_BADGE = "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
const GRAY_BADGE = "bg-muted text-muted-foreground";
const RED_BADGE = "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";

export function SourceList({
  sourceKind,
  query,
  selectedId,
  onSelect,
}: {
  sourceKind: SourceKind;
  query: string;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const currency = useCurrency();

  const sales = useSales();
  const purchases = usePurchases();
  const customers = useCustomerSearch(sourceKind === "clients" ? query : "");
  const suppliers = useSuppliers();

  const rows = useMemo<Row[]>(() => {
    const m = (c: number) => formatMoney(c, currency);
    const q = query.trim().toLowerCase();
    const match = (...vals: (string | null | undefined)[]) =>
      !q || vals.some((v) => v?.toLowerCase().includes(q));

    if (sourceKind === "ventes") {
      return (sales.data ?? [])
        .filter((s) => match(s.customer_name, s.code))
        .map((s) => {
          const reste = s.total_ttc_cents - s.paid_cents;
          return {
            id: s.id,
            title: s.customer_name ?? "Client Comptoir",
            subtitle: `${s.code} • ${formatDocDate(s.created_at)}`,
            amount: m(s.total_ttc_cents),
            badge: reste > 0 ? "CRÉDIT" : paymentMethodLabel(s.payment_method).toUpperCase(),
            badgeClass: reste > 0 ? AMBER_BADGE : GREEN_BADGE,
          };
        });
    }
    if (sourceKind === "achats") {
      return (purchases.data ?? [])
        .filter((p) => match(p.supplier_name, p.code))
        .map((p) => ({
          id: p.id,
          title: p.supplier_name ?? "—",
          subtitle: `${p.code ?? "Brouillon"} • ${formatDocDate(p.purchase_date ?? p.created_at)}`,
          amount: m(p.total_ttc_cents),
          badge: p.status.toUpperCase(),
          badgeClass:
            p.status === "confirmed" ? GREEN_BADGE : p.status === "cancelled" ? RED_BADGE : GRAY_BADGE,
        }));
    }
    if (sourceKind === "clients") {
      return (customers.data ?? []).map((c) => ({
        id: c.id,
        title: c.name,
        subtitle: c.phone ?? "—",
        amount: null,
        badge: "CLIENT",
        badgeClass: VIOLET_BADGE,
      }));
    }
    return (suppliers.data ?? [])
      .filter((s) => match(s.name, s.phone))
      .map((s) => ({
        id: s.id,
        title: s.name,
        subtitle: s.phone ?? "—",
        amount: null,
        badge: "FOURN.",
        badgeClass: VIOLET_BADGE,
      }));
  }, [sourceKind, query, sales.data, purchases.data, customers.data, suppliers.data, currency]);

  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm">
        Aucun élément
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.id}>
          <button
            onClick={() => onSelect(r.id)}
            className={cn(
              "hover:bg-accent flex w-full items-start justify-between gap-2 px-3 py-2.5 text-start transition",
              selectedId === r.id && "bg-accent",
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.title}</p>
              <p className="text-muted-foreground truncate text-xs">{r.subtitle}</p>
              {r.amount && <p className="mt-0.5 text-xs font-medium">{r.amount}</p>}
            </div>
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", r.badgeClass)}>
              {r.badge}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
