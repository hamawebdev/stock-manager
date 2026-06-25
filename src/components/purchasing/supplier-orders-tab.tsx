import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrency, usePurchasesBySupplier, useSupplierBalance } from "@/lib/pos/queries";
import { formatMoney } from "@/lib/money";
import type { PurchaseRow } from "@/lib/pos/types";
import { SummaryCards } from "./summary-cards";
import { statusBadgeVariant } from "./status";

interface Props {
  supplierId: number;
  onPrint?: (purchase: PurchaseRow) => void;
}

/** "Commandes & Factures": per-supplier purchase list + headline KPIs. */
export function SupplierOrdersTab({ supplierId, onPrint }: Props) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const balance = useSupplierBalance(supplierId);
  const purchases = usePurchasesBySupplier(supplierId);
  const money = (c: number) => formatMoney(c, currency);

  const b = balance.data;
  const rows = (purchases.data ?? []).filter((p) => p.status !== "cancelled");

  return (
    <div className="space-y-5">
      <SummaryCards
        cards={[
          {
            label: t("purchasing.cards.validatedOrders"),
            value: String(b?.confirmed_count ?? 0),
            tone: "primary",
          },
          {
            label: t("purchasing.cards.totalPurchase"),
            value: money(b?.total_purchases_cents ?? 0),
            tone: "primary",
          },
          {
            label: t("purchasing.cards.remainingToPay"),
            value: money(b?.balance_cents ?? 0),
            tone: "danger",
          },
        ]}
      />

      {purchases.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {t("purchasing.empty.noOrders")}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("purchasing.table.orderNo")}</TableHead>
              <TableHead>{t("purchasing.table.date")}</TableHead>
              <TableHead>{t("purchasing.table.status")}</TableHead>
              <TableHead className="text-end">{t("purchasing.table.total")}</TableHead>
              <TableHead className="text-end">{t("purchasing.table.paid")}</TableHead>
              <TableHead className="text-end">{t("purchasing.table.pdf")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.code ?? "—"}</TableCell>
                <TableCell>{p.purchase_date ?? p.created_at.slice(0, 10)}</TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(p.status)}>
                    {t(`purchasing.status.${p.status}`)}
                  </Badge>
                </TableCell>
                <TableCell className="text-end">{money(p.total_ttc_cents)}</TableCell>
                <TableCell className="text-end">{money(p.paid_cents)}</TableCell>
                <TableCell className="text-end">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onPrint?.(p)}
                    aria-label={t("purchasing.print")}
                  >
                    <FileText className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
