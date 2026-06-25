/**
 * Customer panel (side sheet). Search or create a customer, view their purchase
 * history + account balance, attach/detach them to the current transaction, and
 * open the full account dialog (fiscal details + A/R ledger) — all from the till.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserPlus, Check, Search, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  useCustomerSearch,
  useCustomerHistory,
  useCustomerBalance,
  useCurrency,
} from "@/lib/pos/queries";
import { useCartStore } from "@/store/use-cart-store";
import { formatMoney } from "@/lib/money";
import { CustomerForm } from "./customer-form";
import { CustomerAccountDialog } from "./customer-account-dialog";

export function CustomerSheet({
  open,
  onOpenChange,
  onReturnSale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Start a return pre-loaded with one of the customer's past sales. */
  onReturnSale: (saleId: number) => void;
}) {
  const { t } = useTranslation();
  const attachedId = useCartStore((s) => s.customerId);
  const setCustomer = useCartStore((s) => s.setCustomer);

  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const search = useCustomerSearch(query);

  function attach(id: number, name: string) {
    setCustomer(id);
    toast.success(t("payments.customer.attached", { name }));
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-hidden sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("payments.customer.title")}</SheetTitle>
          <SheetDescription>{t("payments.customer.description")}</SheetDescription>
        </SheetHeader>

        {creating ? (
          <CustomerForm
            onCancel={() => setCreating(false)}
            onSaved={(id, name) => {
              setCreating(false);
              attach(id, name);
            }}
          />
        ) : (
          <>
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 start-3 size-4 -translate-y-1/2" />
              <Input
                className="ps-9"
                placeholder={t("payments.customer.searchPlaceholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            <Button variant="outline" onClick={() => setCreating(true)}>
              <UserPlus /> {t("payments.customer.newCustomer")}
            </Button>

            <ScrollArea className="min-h-0 flex-1">
              <ul className="divide-y">
                {(search.data ?? []).map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    {attachedId === c.id ? (
                      <Badge variant="secondary">
                        <Check className="me-1 size-3" /> {t("payments.customer.attachedBadge")}
                      </Badge>
                    ) : (
                      <Button size="sm" onClick={() => attach(c.id, c.name)}>
                        {t("payments.customer.attach")}
                      </Button>
                    )}
                  </li>
                ))}
                {search.data?.length === 0 && (
                  <li className="text-muted-foreground py-6 text-center text-sm">
                    {t("payments.customer.noCustomers")}
                  </li>
                )}
              </ul>
            </ScrollArea>

            {attachedId != null && (
              <AttachedCustomer
                customerId={attachedId}
                onReturnSale={onReturnSale}
              />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AttachedCustomer({
  customerId,
  onReturnSale,
}: {
  customerId: number;
  onReturnSale: (saleId: number) => void;
}) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const history = useCustomerHistory(customerId);
  const balance = useCustomerBalance(customerId);
  const setCustomer = useCartStore((s) => s.setCustomer);
  const [accountOpen, setAccountOpen] = useState(false);
  const rows = history.data ?? [];
  const owed = balance.data?.balance_cents ?? 0;

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{t("payments.customer.purchaseHistory")}</p>
        <Button variant="ghost" size="sm" onClick={() => setCustomer(null)}>
          {t("payments.customer.detach")}
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("payments.customer.noPurchases")}</p>
      ) : (
        <ul className="max-h-40 divide-y overflow-auto text-sm">
          {rows.slice(0, 8).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-1">
              <span className="text-muted-foreground">{s.code}</span>
              <div className="flex items-center gap-1">
                <span>{formatMoney(s.total_ttc_cents, currency)}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={t("payments.customer.returnFromSale")}
                  onClick={() => onReturnSale(s.id)}
                >
                  <Undo2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between border-t pt-2 text-sm">
        <span className="text-muted-foreground">{t("payments.account.balance")}</span>
        <span className={owed > 0 ? "text-destructive font-semibold" : "font-medium"}>
          {formatMoney(owed, currency)}
        </span>
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={() => setAccountOpen(true)}>
        <Wallet className="size-4" /> {t("payments.account.manage")}
      </Button>
      <CustomerAccountDialog
        customerId={customerId}
        open={accountOpen}
        onOpenChange={setAccountOpen}
      />
    </div>
  );
}
