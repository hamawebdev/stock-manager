/**
 * Loads the full data bundle a Studio document needs, keyed by template +
 * selected entity. Returns a `DocData` discriminated union that
 * `buildDocumentModel` turns into a renderable model. One async call per
 * selection (settings changes re-render without re-fetching).
 */
import { getDb } from "../db";
import { getSale, getSaleItems } from "../sales";
import {
  getCustomer,
  getCustomerBalance,
  getCustomerLedger,
} from "../customers";
import { getPurchase, getPurchaseItems } from "../purchases";
import {
  getSupplier,
  getSupplierBalance,
  getSupplierLedger,
} from "../suppliers";
import { listPaymentsBySupplier } from "../supplier-payments";
import type { DocData, DocLineItem, DocTemplate } from "./types";

/**
 * Resolve a display "réf" for each variant (the product reference, falling back
 * to the variant SKU). Free lines (variant_id null) get an empty ref.
 */
async function refsFor(variantIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const ids = [...new Set(variantIds)];
  if (ids.length === 0) return map;
  const db = await getDb();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
  const rows = await db.select<{ id: number; ref: string | null }[]>(
    `SELECT v.id AS id, COALESCE(p.reference, v.sku) AS ref
       FROM variants v
       LEFT JOIN products p ON p.id = v.product_id
      WHERE v.id IN (${placeholders})`,
    ids,
  );
  for (const r of rows) map.set(r.id, r.ref ?? "");
  return map;
}

export async function loadDocData(
  template: DocTemplate,
  entityId: number,
): Promise<DocData | null> {
  switch (template) {
    case "facture": {
      const sale = await getSale(entityId);
      if (!sale) return null;
      const items = await getSaleItems(entityId);
      const refs = await refsFor(items.map((i) => i.variant_id));
      const lines: DocLineItem[] = items.map((i) => ({
        ref: refs.get(i.variant_id) ?? "",
        description: i.description,
        qty: i.qty,
        unit: null,
        unit_price_cents: i.unit_price_cents, // P.U TTC
        line_total_cents: i.line_total_cents,
      }));
      let customer = null;
      let ancienneDette = 0;
      let soldeTotal = 0;
      if (sale.customer_id != null) {
        customer = await getCustomer(sale.customer_id);
        const [ledger, balance] = await Promise.all([
          getCustomerLedger(sale.customer_id),
          getCustomerBalance(sale.customer_id),
        ]);
        // Ancienne Dette = the account balance from before this invoice's date.
        ancienneDette = ledger
          .filter((e) => e.date < sale.created_at)
          .reduce((s, e) => s + e.debit_cents - e.credit_cents, 0);
        soldeTotal = balance.balance_cents;
      }
      return { kind: "facture", sale, lines, customer, ancienneDette, soldeTotal };
    }

    case "bon_commande": {
      const purchase = await getPurchase(entityId);
      if (!purchase) return null;
      const items = await getPurchaseItems(entityId);
      const refs = await refsFor(
        items.map((i) => i.variant_id).filter((v): v is number => v != null),
      );
      const lines: DocLineItem[] = items.map((i) => ({
        ref: i.variant_id != null ? (refs.get(i.variant_id) ?? "") : "",
        description: i.description,
        qty: i.qty,
        unit: i.unit,
        unit_price_cents: i.unit_cost_ht_cents, // P.U HT
        line_total_cents: i.line_total_ht_cents,
      }));
      let payments = [] as Awaited<ReturnType<typeof listPaymentsBySupplier>>;
      let supplier = null;
      if (purchase.supplier_id != null) {
        supplier = await getSupplier(purchase.supplier_id);
        const all = await listPaymentsBySupplier(purchase.supplier_id);
        payments = all.filter((p) => p.purchase_id === entityId);
      }
      return { kind: "bon_commande", purchase, lines, payments, supplier };
    }

    case "releve_compte": {
      const customer = await getCustomer(entityId);
      if (!customer) return null;
      const [ledger, balance] = await Promise.all([
        getCustomerLedger(entityId),
        getCustomerBalance(entityId),
      ]);
      return { kind: "releve_compte", customer, ledger, balance: balance.balance_cents };
    }

    case "releve_fournisseur": {
      const supplier = await getSupplier(entityId);
      if (!supplier) return null;
      const [ledger, balance] = await Promise.all([
        getSupplierLedger(entityId),
        getSupplierBalance(entityId),
      ]);
      return { kind: "releve_fournisseur", supplier, ledger, balance: balance.balance_cents };
    }
  }
}
