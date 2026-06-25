/**
 * "Compte client" dialog — full customer management away from the till: edit the
 * contact + fiscal details and manage the accounts-receivable ledger
 * (versements). Opened from the customer sheet's attached-customer card.
 */
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { getCustomer } from "@/lib/pos/customers";
import { CustomerForm } from "./customer-form";
import { CustomerPaymentsTab } from "./customer-payments-tab";

export function CustomerAccountDialog({
  customerId,
  open,
  onOpenChange,
}: {
  customerId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const customer = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => getCustomer(customerId as number),
    enabled: customerId != null && open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>
            {t("payments.account.title")}
            {customer.data ? ` — ${customer.data.name}` : ""}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("payments.account.description")}
          </DialogDescription>
        </DialogHeader>

        {customer.data ? (
          <Tabs defaultValue="account" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-5 mt-4 grid grid-cols-2">
              <TabsTrigger value="account">{t("payments.account.ledgerTab")}</TabsTrigger>
              <TabsTrigger value="details">{t("payments.account.detailsTab")}</TabsTrigger>
            </TabsList>
            <TabsContent value="account" className="min-h-0 flex-1 overflow-y-auto p-5">
              <CustomerPaymentsTab customer={customer.data} />
            </TabsContent>
            <TabsContent value="details" className="min-h-0 flex-1 overflow-y-auto p-5">
              <CustomerForm
                existing={customer.data}
                onSaved={() => onOpenChange(false)}
                onCancel={() => onOpenChange(false)}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
