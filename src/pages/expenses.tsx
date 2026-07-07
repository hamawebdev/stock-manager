import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Plus,
  Tags,
  Wallet,
  Repeat,
  Download,
  FileSpreadsheet,
  FileText,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExpenseDashboard } from "@/components/expenses/expense-dashboard";
import { ExpenseList } from "@/components/expenses/expense-list";
import { ExpenseAnalytics } from "@/components/expenses/expense-analytics";
import { ExpenseFormDialog } from "@/components/expenses/expense-form-dialog";
import { CategoriesDialog } from "@/components/expenses/categories-dialog";
import { MethodsDialog } from "@/components/expenses/methods-dialog";
import { RecurringDialog } from "@/components/expenses/recurring-dialog";
import {
  resolveRange,
  RANGE_PRESETS,
  type RangePreset,
} from "@/components/expenses/date-ranges";
import {
  useExpenseCategories,
  useExpenseMethods,
  useExpenses,
  useCurrency,
} from "@/lib/pos/queries";
import {
  exportExpensesExcel,
  exportExpensesPdf,
} from "@/lib/pos/expense-export";
import type { ExpenseFilters, ExpenseRow } from "@/lib/pos/expenses";

const ALL = "__all__";

export default function ExpensesPage() {
  const { t } = useTranslation();
  const currency = useCurrency();
  const categories = useExpenseCategories();
  const methods = useExpenseMethods();

  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<RangePreset>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [methodId, setMethodId] = useState<number | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const [methodsOpen, setMethodsOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);

  const filters = useMemo<ExpenseFilters>(() => {
    const range =
      preset === "custom"
        ? { from: customFrom || null, to: customTo || null }
        : resolveRange(preset);
    return {
      search: search.trim() || null,
      category_id: categoryId,
      payment_method_id: methodId,
      from: range.from,
      to: range.to,
    };
  }, [search, preset, customFrom, customTo, categoryId, methodId]);

  const expenses = useExpenses(filters);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(expense: ExpenseRow) {
    setEditing(expense);
    setFormOpen(true);
  }

  async function doExport(kind: "excel" | "pdf") {
    const rows = expenses.data ?? [];
    if (rows.length === 0) {
      toast.error(t("expenses.empty"));
      return;
    }
    try {
      if (kind === "excel") await exportExpensesExcel(rows, currency, t);
      else await exportExpensesPdf(rows, currency, t);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("expenses.title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("expenses.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setCatsOpen(true)}>
            <Tags className="size-4" />
            {t("expenses.categories")}
          </Button>
          <Button variant="outline" onClick={() => setMethodsOpen(true)}>
            <Wallet className="size-4" />
            {t("expenses.paymentMethods")}
          </Button>
          <Button variant="outline" onClick={() => setRecurringOpen(true)}>
            <Repeat className="size-4" />
            {t("expenses.recurring")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="size-4" />
                {t("common.export")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => doExport("excel")}>
                <FileSpreadsheet className="size-4" />
                {t("expenses.exportExcel")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("pdf")}>
                <FileText className="size-4" />
                {t("expenses.exportPdf")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={openNew}>
            <Plus className="size-4" />
            {t("expenses.addExpense")}
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
        <div className="relative min-w-52 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("expenses.searchPlaceholder")}
            className="ps-8"
          />
        </div>

        <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {t(`expenses.range.${p}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {preset === "custom" && (
          <>
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="w-40"
            />
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="w-40"
            />
          </>
        )}

        <Select
          value={categoryId ? String(categoryId) : ALL}
          onValueChange={(v) => setCategoryId(v === ALL ? null : Number(v))}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("expenses.allCategories")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("expenses.allCategories")}</SelectItem>
            {(categories.data ?? []).map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={methodId ? String(methodId) : ALL}
          onValueChange={(v) => setMethodId(v === ALL ? null : Number(v))}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("expenses.allMethods")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("expenses.allMethods")}</SelectItem>
            {(methods.data ?? []).map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="overview">{t("expenses.tab.overview")}</TabsTrigger>
          <TabsTrigger value="list">{t("expenses.tab.list")}</TabsTrigger>
          <TabsTrigger value="analytics">{t("expenses.tab.analytics")}</TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto pt-4">
          <TabsContent value="overview" className="mt-0">
            <ExpenseDashboard filters={filters} />
          </TabsContent>
          <TabsContent value="list" className="mt-0">
            <ExpenseList filters={filters} onEdit={openEdit} />
          </TabsContent>
          <TabsContent value="analytics" className="mt-0">
            <ExpenseAnalytics filters={filters} />
          </TabsContent>
        </div>
      </Tabs>

      {/* Dialogs */}
      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        expense={editing}
        categories={categories.data ?? []}
        methods={methods.data ?? []}
      />
      <CategoriesDialog open={catsOpen} onOpenChange={setCatsOpen} />
      <MethodsDialog open={methodsOpen} onOpenChange={setMethodsOpen} />
      <RecurringDialog open={recurringOpen} onOpenChange={setRecurringOpen} />
    </div>
  );
}
