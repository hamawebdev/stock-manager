/**
 * The payment modes used by sales and customer versements. French labels are the
 * source of truth for the printed documents ("Mode : ESPÈCE"); the checkout/A-R
 * UI shows the same labels (these are Algerian commercial terms, not translated).
 */
import type { CustomerPaymentMethod, SupplierPaymentMethod } from "./types";

export const CUSTOMER_PAYMENT_METHODS: CustomerPaymentMethod[] = [
  "especes",
  "cheque",
  "virement",
  "cib",
  "ccp",
];

export const PAYMENT_METHOD_LABELS_FR: Record<CustomerPaymentMethod, string> = {
  especes: "Espèce",
  cheque: "Chèque",
  virement: "Virement",
  cib: "CIB",
  ccp: "CCP",
};

export function paymentMethodLabel(method: CustomerPaymentMethod | null): string {
  return method ? PAYMENT_METHOD_LABELS_FR[method] : "—";
}

/** Supplier payments use a different method vocabulary (migration 006). */
export const SUPPLIER_METHOD_LABELS_FR: Record<SupplierPaymentMethod, string> = {
  cash: "Espèce",
  cheque: "Chèque",
  transfer: "Virement",
  card_other: "CIB",
};

export function supplierMethodLabel(method: SupplierPaymentMethod): string {
  return SUPPLIER_METHOD_LABELS_FR[method];
}
