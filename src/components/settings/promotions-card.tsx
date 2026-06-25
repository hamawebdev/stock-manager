/**
 * Promotions admin (Settings). Create simple auto-applied discount rules
 * (percent / fixed) scoped to all items, a category, or a product. The POS
 * applies active, in-date rules automatically at checkout.
 *
 * BOGO / bundle kinds are reserved in the schema for a later build.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  usePromotions,
  useCreatePromotion,
  useSetPromotionActive,
  useArchivePromotion,
  useCategories,
  useProducts,
  useCurrency,
} from "@/lib/pos/queries";
import { parseMoney, formatMoney } from "@/lib/money";
import type { PromotionScope } from "@/lib/pos/promotions";

export function PromotionsCard() {
  const { t } = useTranslation();
  const currency = useCurrency();
  const promos = usePromotions();
  const create = useCreatePromotion();
  const setActive = useSetPromotionActive();
  const archive = useArchivePromotion();
  const categories = useCategories();
  const products = useProducts();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("");
  const [scopeType, setScopeType] = useState<PromotionScope>("all");
  const [scopeId, setScopeId] = useState<string>("");
  const [minQty, setMinQty] = useState("1");

  function describe(p: NonNullable<typeof promos.data>[number]): string {
    const amount =
      p.kind === "percent"
        ? t("settings.promotions.percentOff", { percent: p.percent ?? 0 })
        : t("settings.promotions.amountOff", { amount: formatMoney(p.amount_cents ?? 0, currency) });
    const where =
      p.scope_type === "all"
        ? t("settings.promotions.everything")
        : p.scope_type === "category"
          ? categories.data?.find((c) => c.id === p.scope_id)?.name ?? t("settings.promotions.aCategory")
          : products.data?.find((pr) => pr.id === p.scope_id)?.name ?? t("settings.promotions.aProduct");
    const suffix = p.min_qty > 1 ? ` · ${t("settings.promotions.minQtyValue", { count: p.min_qty })}` : "";
    return `${amount} · ${where}${suffix}`;
  }

  async function submit() {
    if (!name.trim()) {
      toast.error(t("settings.promotions.nameRequired"));
      return;
    }
    let percent: number | null = null;
    let amount_cents: number | null = null;
    if (kind === "percent") {
      const pct = Number(value);
      if (!Number.isFinite(pct) || pct <= 0) {
        toast.error(t("settings.promotions.invalidPercent"));
        return;
      }
      percent = Math.min(100, pct);
    } else {
      const cents = parseMoney(value, currency.decimals);
      if (cents == null || cents <= 0) {
        toast.error(t("settings.promotions.invalidAmount"));
        return;
      }
      amount_cents = cents;
    }
    if (scopeType !== "all" && !scopeId) {
      toast.error(t("settings.promotions.chooseScope"));
      return;
    }
    try {
      await create.mutateAsync({
        name,
        kind,
        percent,
        amount_cents,
        scope_type: scopeType,
        scope_id: scopeType === "all" ? null : Number(scopeId),
        min_qty: Math.max(1, Number(minQty) || 1),
      });
      toast.success(t("settings.promotions.created"));
      setName("");
      setValue("");
      setScopeId("");
      setMinQty("1");
      setOpen(false);
    } catch (err) {
      toast.error(String(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.promotions.title")}</CardTitle>
        <CardDescription>{t("settings.promotions.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {promos.data?.length === 0 && !open && (
          <p className="text-muted-foreground text-sm">{t("settings.promotions.empty")}</p>
        )}
        <ul className="divide-y">
          {promos.data?.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {p.name}
                  {!p.active && <Badge variant="outline">{t("settings.promotions.paused")}</Badge>}
                </p>
                <p className="text-muted-foreground truncate text-xs">{describe(p)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={p.active === 1}
                  onCheckedChange={(c) => setActive.mutate({ id: p.id, active: c })}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => archive.mutate(p.id)}
                  title={t("common.delete")}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>

        {open ? (
          <div className="grid gap-3 rounded-md border p-3">
            <div className="grid gap-2">
              <Label>{t("common.name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>{t("settings.promotions.type")}</Label>
                <NativeSelect
                  value={kind}
                  onChange={(e) => setKind(e.target.value as "percent" | "fixed")}
                >
                  <NativeSelectOption value="percent">{t("settings.promotions.percentType")}</NativeSelectOption>
                  <NativeSelectOption value="fixed">{t("settings.promotions.amountType")}</NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label>{kind === "percent" ? t("settings.promotions.percent") : t("settings.promotions.amount")}</Label>
                <Input
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={kind === "percent" ? "10" : "0.00"}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>{t("settings.promotions.appliesTo")}</Label>
                <NativeSelect
                  value={scopeType}
                  onChange={(e) => {
                    setScopeType(e.target.value as PromotionScope);
                    setScopeId("");
                  }}
                >
                  <NativeSelectOption value="all">{t("settings.promotions.scopeEverything")}</NativeSelectOption>
                  <NativeSelectOption value="category">{t("settings.promotions.scopeCategory")}</NativeSelectOption>
                  <NativeSelectOption value="product">{t("settings.promotions.scopeProduct")}</NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label>{t("settings.promotions.minQty")}</Label>
                <Input
                  inputMode="numeric"
                  value={minQty}
                  onChange={(e) => setMinQty(e.target.value)}
                />
              </div>
            </div>
            {scopeType === "category" && (
              <NativeSelect value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
                <NativeSelectOption value="">{t("settings.promotions.chooseCategory")}</NativeSelectOption>
                {categories.data?.map((c) => (
                  <NativeSelectOption key={c.id} value={String(c.id)}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
            {scopeType === "product" && (
              <NativeSelect value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
                <NativeSelectOption value="">{t("settings.promotions.chooseProduct")}</NativeSelectOption>
                {products.data?.map((p) => (
                  <NativeSelectOption key={p.id} value={String(p.id)}>
                    {p.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={submit} disabled={create.isPending}>
                {t("common.create")}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Plus /> {t("settings.promotions.newPromotion")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
