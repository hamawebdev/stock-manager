import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, FileSpreadsheet, Download, Upload, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useCurrency, useImportCatalog } from "@/lib/pos/queries";
import type {
  CatalogImportResult,
  CatalogImportRow,
  StockPolicy,
} from "@/lib/pos/catalog-io";
import { parseMoney, formatMoney } from "@/lib/money";

interface PreviewRow extends CatalogImportRow {
  error?: string;
}

/** Read a candidate field by any of several header spellings (case-insensitive). */
function field(row: Record<string, unknown>, names: string[]): string {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) lower[k.trim().toLowerCase()] = v;
  for (const n of names) {
    const v = lower[n];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/** Parse a 0/1/yes/no/true/false flag; "" => null (leave unchanged on update). */
function parseFlag(s: string): number | null {
  if (!s) return null;
  return /^(1|yes|true|y|on)$/i.test(s) ? 1 : 0;
}

const STOCK_POLICIES: StockPolicy[] = ["create_only", "overwrite", "add"];

export default function BulkImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currency = useCurrency();
  const importer = useImportCatalog();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [done, setDone] = useState<CatalogImportResult | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policy, setPolicy] = useState<StockPolicy>("create_only");

  const validRows = useMemo(() => rows.filter((r) => !r.error), [rows]);
  const productCount = useMemo(() => {
    const keys = new Set<string>();
    for (const r of validRows) {
      keys.add(r.reference ? `ref:${r.reference.toLowerCase()}` : `name:${r.name.toLowerCase()}`);
    }
    return keys.size;
  }, [validRows]);

  /** Parse a money cell: blank => null (inherit/unset), bad value => flagged. */
  function money(str: string): { cents: number | null; bad: boolean } {
    if (!str) return { cents: null, bad: false };
    const cents = parseMoney(str, currency.decimals);
    return cents == null ? { cents: null, bad: true } : { cents, bad: false };
  }

  async function parseFile(file: File) {
    setDone(null);
    try {
      const XLSX = await import("xlsx");
      const buf = new Uint8Array(await file.arrayBuffer());
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: "",
      });
      const parsed: PreviewRow[] = json.map((raw) => {
        const name = field(raw, ["name", "product", "product name"]);
        const cost = money(field(raw, ["purchase_price", "purchase price", "purchase", "cost"]));
        const price = money(field(raw, ["selling_price", "selling price", "selling", "price"]));
        const vCost = money(field(raw, ["variant_purchase_price", "variant purchase price", "variant cost"]));
        const vPrice = money(field(raw, ["variant_selling_price", "variant selling price", "variant price"]));
        const low = field(raw, ["low_stock", "low stock", "low stock threshold"]);
        const reorder = field(raw, ["reorder_qty", "reorder", "reorder quantity"]);
        const error = !name
          ? t("bulkImport.missingName")
          : cost.bad || price.bad || vCost.bad || vPrice.bad
            ? t("inventory.invalidPrice")
            : undefined;
        return {
          name,
          category: field(raw, ["category"]) || null,
          supplier: field(raw, ["supplier"]) || null,
          brand: field(raw, ["brand"]) || null,
          reference: field(raw, ["reference", "ref"]) || null,
          description: field(raw, ["description", "desc"]) || null,
          notes: field(raw, ["notes", "note"]) || null,
          cost_cents: cost.cents,
          price_cents: price.cents,
          low_stock: low ? parseInt(low, 10) || null : null,
          reorder_qty: reorder ? parseInt(reorder, 10) || null : null,
          out_of_stock_alert: parseFlag(field(raw, ["out_of_stock_alert", "out of stock alert", "oos_alert"])),
          size: field(raw, ["size"]) || null,
          color: field(raw, ["color", "colour"]) || null,
          sku: field(raw, ["sku", "variant sku"]) || null,
          barcode: field(raw, ["barcode", "ean", "upc"]) || null,
          stock: parseInt(field(raw, ["stock", "qty", "quantity"]) || "0", 10) || 0,
          variant_cost_cents: vCost.cents,
          variant_price_cents: vPrice.cents,
          error,
        };
      });
      setFileName(file.name);
      setRows(parsed);
      if (parsed.length === 0) toast.error(t("bulkImport.noRows"));
    } catch (e) {
      toast.error(t("bulkImport.couldNotRead", { error: String(e) }));
    }
  }

  async function downloadTemplate() {
    const { exportRowsToExcel } = await import("@/lib/export");
    const { catalogExportColumns } = await import("@/lib/pos/catalog-io");
    const factor = 10 ** currency.decimals;
    const f = (v: number) => Math.round(v * factor);
    const example = [
      {
        name: "Classic Crew Tee", category: "T-Shirts", supplier: "Acme Textiles",
        brand: "Acme", reference: "SKU-TEE01", description: "Soft cotton tee", notes: "",
        cost_cents: f(6.5), price_cents: f(14.99), low_stock_threshold: 5,
        reorder_quantity: 20, out_of_stock_alert: 1, size: "S", color: "Red",
        sku: "", barcode: "", stock: 12, variant_cost_cents: null, variant_price_cents: null,
      },
      {
        name: "Classic Crew Tee", category: "T-Shirts", supplier: "Acme Textiles",
        brand: "Acme", reference: "SKU-TEE01", description: "Soft cotton tee", notes: "",
        cost_cents: f(6.5), price_cents: f(14.99), low_stock_threshold: 5,
        reorder_quantity: 20, out_of_stock_alert: 1, size: "M", color: "Red",
        sku: "", barcode: "", stock: 8, variant_cost_cents: null, variant_price_cents: null,
      },
      {
        name: "Leather Belt", category: "Accessories", supplier: "", brand: "",
        reference: "SKU-BELT", description: "", notes: "", cost_cents: f(8),
        price_cents: f(19.99), low_stock_threshold: 3, reorder_quantity: null,
        out_of_stock_alert: 1, size: "", color: "", sku: "", barcode: "6134000112233",
        stock: 30, variant_cost_cents: null, variant_price_cents: null,
      },
    ];
    await exportRowsToExcel(
      example,
      catalogExportColumns(currency.decimals),
      "product-import-template",
      t("bulkImport.productsSheet"),
    );
  }

  async function runImport() {
    setPolicyOpen(false);
    if (validRows.length === 0) {
      toast.error(t("bulkImport.noValidRows"));
      return;
    }
    try {
      // PreviewRow extends CatalogImportRow; the extra `error` field is ignored.
      const res = await importer.mutateAsync({ rows: validRows, policy });
      setDone(res);
      if (res.failed > 0) {
        toast.warning(
          t("bulkImport.importedWithIssues", {
            created: res.productsCreated,
            updated: res.productsUpdated,
            failed: res.failed,
          }),
        );
        res.errors.slice(0, 5).forEach((m) => toast.error(m));
      } else {
        toast.success(
          t("bulkImport.importedSummary", {
            created: res.productsCreated,
            updated: res.productsUpdated,
          }),
        );
      }
    } catch (e) {
      toast.error(t("bulkImport.importFailed", { error: String(e) }));
    }
  }

  const fmt = (c: number | null) => (c == null ? "—" : formatMoney(c, currency));

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate("/inventory")}>
          <ArrowLeft />
        </Button>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <FileSpreadsheet className="size-6" /> {t("bulkImport.title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("bulkImport.subtitle")}</p>
        </div>
        <Button variant="outline" onClick={downloadTemplate}>
          <Download /> {t("bulkImport.template")}
        </Button>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files[0]) parseFile(e.dataTransfer.files[0]);
        }}
        className="hover:bg-accent/40 flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-10 text-center"
      >
        <Upload className="text-muted-foreground size-6" />
        <p className="text-sm font-medium">{fileName ?? t("bulkImport.dropHint")}</p>
        <p className="text-muted-foreground text-xs">{t("bulkImport.columnsHint")}</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={(e) => {
            if (e.target.files?.[0]) parseFile(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </div>

      <div className="text-muted-foreground bg-muted/40 rounded-md border px-3 py-2 text-xs">
        {t("bulkImport.upsertHint")}
      </div>

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-medium">{t("bulkImport.products", { count: productCount })}</span>
              {" · "}
              <span>{t("bulkImport.variants", { count: validRows.length })}</span>
              {rows.length - validRows.length > 0 && (
                <span className="text-destructive">
                  {" · "}
                  {t("bulkImport.withErrors", { count: rows.length - validRows.length })}
                </span>
              )}
            </p>
            <Button
              onClick={() => setPolicyOpen(true)}
              disabled={importer.isPending || validRows.length === 0}
            >
              <Upload /> {t("bulkImport.importAction", { count: productCount })}
            </Button>
          </div>

          {done && (
            <div className="border-success/30 bg-success/10 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <CheckCircle2 className="text-success size-4" />
              {done.failed > 0
                ? t("bulkImport.doneWithIssues", {
                    created: done.productsCreated,
                    updated: done.productsUpdated,
                    failed: done.failed,
                  })
                : t("bulkImport.doneSummary", {
                    created: done.productsCreated,
                    updated: done.productsUpdated,
                  })}
            </div>
          )}

          <div className="max-h-[28rem] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("bulkImport.reference")}</TableHead>
                  <TableHead>{t("bulkImport.size")}</TableHead>
                  <TableHead>{t("bulkImport.color")}</TableHead>
                  <TableHead className="text-end">{t("bulkImport.purchase")}</TableHead>
                  <TableHead className="text-end">{t("bulkImport.selling")}</TableHead>
                  <TableHead className="text-end">{t("inventory.stock")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i} className={r.error ? "bg-destructive/5" : ""}>
                    <TableCell className="font-medium">{r.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.reference ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.size ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.color ?? "—"}</TableCell>
                    <TableCell className="text-end">{fmt(r.cost_cents)}</TableCell>
                    <TableCell className="text-end">{fmt(r.price_cents)}</TableCell>
                    <TableCell className="text-end">{r.stock}</TableCell>
                    <TableCell>
                      {r.error ? (
                        <Badge variant="soft-destructive">{r.error}</Badge>
                      ) : (
                        <Badge variant="soft-success">{t("common.ok")}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bulkImport.stockTitle")}</DialogTitle>
            <DialogDescription>{t("bulkImport.stockDesc")}</DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={policy}
            onValueChange={(v) => setPolicy(v as StockPolicy)}
            className="py-2"
          >
            {STOCK_POLICIES.map((p) => (
              <Label
                key={p}
                htmlFor={`policy-${p}`}
                className="hover:bg-accent/40 flex cursor-pointer items-start gap-3 rounded-md border p-3"
              >
                <RadioGroupItem id={`policy-${p}`} value={p} className="mt-0.5" />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">{t(`bulkImport.policy.${p}`)}</span>
                  <span className="text-muted-foreground block text-xs">
                    {t(`bulkImport.policy.${p}Desc`)}
                  </span>
                </span>
              </Label>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPolicyOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={runImport} disabled={importer.isPending}>
              <Upload /> {t("bulkImport.runImport")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
