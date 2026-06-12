import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { useCurrency, useBulkImport } from "@/lib/pos/queries";
import type { BulkImportRow } from "@/lib/pos/bulk";
import type { ExportColumn } from "@/lib/export";
import { parseMoney, formatMoney } from "@/lib/money";

interface PreviewRow extends BulkImportRow {
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

const TEMPLATE_COLUMNS: ExportColumn<Record<string, string | number>>[] = [
  { header: "name", value: (r) => r.name },
  { header: "category", value: (r) => r.category },
  { header: "supplier", value: (r) => r.supplier },
  { header: "reference", value: (r) => r.reference },
  { header: "barcode", value: (r) => r.barcode },
  { header: "purchase_price", value: (r) => r.purchase_price },
  { header: "selling_price", value: (r) => r.selling_price },
  { header: "stock", value: (r) => r.stock },
  { header: "low_stock", value: (r) => r.low_stock },
];

export default function BulkImportPage() {
  const navigate = useNavigate();
  const currency = useCurrency();
  const importer = useBulkImport();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [done, setDone] = useState<{ created: number; failed: number } | null>(null);

  const validCount = rows.filter((r) => !r.error).length;

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
        const purchase = parseMoney(
          field(raw, ["purchase_price", "purchase price", "purchase", "cost"]) || "0",
          currency.decimals,
        );
        const selling = parseMoney(
          field(raw, ["selling_price", "selling price", "selling", "price"]) || "0",
          currency.decimals,
        );
        const stockStr = field(raw, ["stock", "qty", "quantity"]) || "0";
        const lowStr = field(raw, ["low_stock", "low stock", "low stock threshold"]);
        const error = !name
          ? "Missing name"
          : purchase == null || selling == null
            ? "Invalid price"
            : undefined;
        return {
          name,
          category: field(raw, ["category"]) || null,
          supplier: field(raw, ["supplier"]) || null,
          reference: field(raw, ["reference", "sku"]) || null,
          barcode: field(raw, ["barcode"]) || null,
          purchase_cents: purchase ?? 0,
          selling_cents: selling ?? 0,
          stock: parseInt(stockStr, 10) || 0,
          low_stock: lowStr ? parseInt(lowStr, 10) || null : null,
          error,
        };
      });
      setFileName(file.name);
      setRows(parsed);
      if (parsed.length === 0) toast.error("No rows found in the sheet");
    } catch (e) {
      toast.error(`Could not read file: ${String(e)}`);
    }
  }

  async function downloadTemplate() {
    const { exportRowsToExcel } = await import("@/lib/export");
    const example = [
      {
        name: "Classic Crew Tee",
        category: "T-Shirts",
        supplier: "Acme Textiles",
        reference: "SKU-TEE01",
        barcode: "",
        purchase_price: 6.5,
        selling_price: 14.99,
        stock: 25,
        low_stock: 5,
      },
    ];
    await exportRowsToExcel(example, TEMPLATE_COLUMNS, "product-import-template", "Products");
  }

  async function runImport() {
    const importable = rows.filter((r) => !r.error);
    if (importable.length === 0) {
      toast.error("No valid rows to import");
      return;
    }
    try {
      const payload: BulkImportRow[] = importable.map((r) => ({
        name: r.name,
        category: r.category,
        supplier: r.supplier,
        reference: r.reference,
        barcode: r.barcode,
        purchase_cents: r.purchase_cents,
        selling_cents: r.selling_cents,
        stock: r.stock,
        low_stock: r.low_stock,
      }));
      const res = await importer.mutateAsync(payload);
      setDone({ created: res.created, failed: res.failed });
      if (res.failed > 0) {
        toast.warning(`Imported ${res.created}, ${res.failed} failed`);
        res.errors.slice(0, 5).forEach((m) => toast.error(m));
      } else {
        toast.success(`Imported ${res.created} products`);
      }
    } catch (e) {
      toast.error(`Import failed: ${String(e)}`);
    }
  }

  const money = (c: number) => formatMoney(c, currency);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate("/inventory")}>
          <ArrowLeft />
        </Button>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <FileSpreadsheet className="size-6" /> Bulk import
          </h1>
          <p className="text-muted-foreground text-sm">
            Import products from an Excel or CSV file.
          </p>
        </div>
        <Button variant="outline" onClick={downloadTemplate}>
          <Download /> Template
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
        <p className="text-sm font-medium">
          {fileName ?? "Drop a .xlsx / .csv file, or click to browse"}
        </p>
        <p className="text-muted-foreground text-xs">
          Columns: name, category, supplier, reference, barcode, purchase_price,
          selling_price, stock, low_stock
        </p>
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

      {rows.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm">
              <span className="font-medium">{rows.length}</span> rows ·{" "}
              <span className="text-green-600">{validCount} valid</span>
              {rows.length - validCount > 0 && (
                <span className="text-destructive">
                  {" "}
                  · {rows.length - validCount} with errors
                </span>
              )}
            </p>
            <Button onClick={runImport} disabled={importer.isPending || validCount === 0}>
              <Upload /> Import {validCount} products
            </Button>
          </div>

          {done && (
            <div className="flex items-center gap-2 rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm">
              <CheckCircle2 className="size-4 text-green-600" />
              Imported {done.created} products
              {done.failed > 0 ? `, ${done.failed} failed` : ""}.
            </div>
          )}

          <div className="max-h-[28rem] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Purchase</TableHead>
                  <TableHead className="text-right">Selling</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i} className={r.error ? "bg-destructive/5" : ""}>
                    <TableCell className="font-medium">{r.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.category ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.supplier ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">{money(r.purchase_cents)}</TableCell>
                    <TableCell className="text-right">{money(r.selling_cents)}</TableCell>
                    <TableCell className="text-right">{r.stock}</TableCell>
                    <TableCell>
                      {r.error ? (
                        <Badge variant="destructive">{r.error}</Badge>
                      ) : (
                        <Badge variant="secondary">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
