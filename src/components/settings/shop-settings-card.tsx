import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useSettings, useSaveSettings, qk } from "@/lib/pos/queries";
import { saveShopLogo, shopLogoSrc, removeShopLogo } from "@/lib/pos/shop";
import { fileToBytes } from "@/lib/images";
import type { ShopSettings } from "@/lib/pos/types";

export function ShopSettingsCard() {
  const { t } = useTranslation();
  const { data } = useSettings();
  const save = useSaveSettings();
  const qc = useQueryClient();
  const [form, setForm] = useState<ShopSettings | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const logoSrc = useQuery({
    queryKey: ["shop-logo-src", form?.shop_logo],
    queryFn: () => shopLogoSrc(form!.shop_logo),
    enabled: !!form?.shop_logo,
  });

  if (!form) return null;

  const set = <K extends keyof ShopSettings>(k: K, v: ShopSettings[K]) =>
    setForm({ ...form, [k]: v });

  async function handleSave() {
    try {
      await save.mutateAsync(form!);
      toast.success(t("settings.shop.saved"));
    } catch (err) {
      toast.error(t("common.couldNotSave", { error: String(err) }));
    }
  }

  async function onLogoFile(file: File) {
    try {
      const rel = await saveShopLogo(await fileToBytes(file), file.name);
      set("shop_logo", rel);
      qc.invalidateQueries({ queryKey: qk.settings });
      toast.success(t("settings.shop.logoSaved"));
    } catch (err) {
      toast.error(t("common.couldNotSave", { error: String(err) }));
    }
  }

  async function onLogoRemove() {
    await removeShopLogo();
    set("shop_logo", "");
    qc.invalidateQueries({ queryKey: qk.settings });
  }

  const fiscal: { key: keyof ShopSettings; label: string }[] = [
    { key: "shop_nif", label: "NIF" },
    { key: "shop_nis", label: "NIS" },
    { key: "shop_rc", label: "RC" },
    { key: "shop_art", label: "ART" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.shop.title")}</CardTitle>
        <CardDescription>{t("settings.shop.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {/* Logo */}
        <div className="grid gap-2">
          <Label>{t("settings.shop.logo")}</Label>
          <div className="flex items-center gap-3">
            <div className="bg-muted flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border">
              {form.shop_logo && logoSrc.data ? (
                <img src={logoSrc.data} alt="" className="h-full w-full object-contain" />
              ) : (
                <ImagePlus className="text-muted-foreground size-6" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                {t("settings.shop.uploadLogo")}
              </Button>
              {form.shop_logo && (
                <Button type="button" variant="ghost" size="sm" onClick={onLogoRemove}>
                  <X className="size-4" /> {t("common.remove")}
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onLogoFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="s-name">{t("settings.shop.shopName")}</Label>
          <Input
            id="s-name"
            value={form.shop_name}
            onChange={(e) => set("shop_name", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="s-cur">{t("settings.shop.currencySymbol")}</Label>
            <Input
              id="s-cur"
              value={form.currency_symbol}
              onChange={(e) => set("currency_symbol", e.target.value)}
              placeholder={t("settings.shop.currencyPlaceholder")}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-dec">{t("settings.shop.decimals")}</Label>
            <Input
              id="s-dec"
              inputMode="numeric"
              value={String(form.currency_decimals)}
              onChange={(e) => set("currency_decimals", Number(e.target.value) || 0)}
            />
          </div>
        </div>

        {/* Contact for documents */}
        <div className="grid gap-2">
          <Label htmlFor="s-addr">{t("settings.shop.address")}</Label>
          <Input id="s-addr" value={form.shop_address} onChange={(e) => set("shop_address", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="s-phone">{t("settings.shop.phone")}</Label>
            <Input id="s-phone" value={form.shop_phone} onChange={(e) => set("shop_phone", e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-email">{t("settings.shop.email")}</Label>
            <Input id="s-email" value={form.shop_email} onChange={(e) => set("shop_email", e.target.value)} />
          </div>
        </div>

        {/* Fiscal identifiers */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {fiscal.map((f) => (
            <div key={f.key} className="grid gap-2">
              <Label>{f.label}</Label>
              <Input
                value={String(form[f.key] ?? "")}
                onChange={(e) => set(f.key, e.target.value)}
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="s-tva">{t("settings.shop.defaultTva")}</Label>
            <Input
              id="s-tva"
              inputMode="numeric"
              value={String(form.default_tva_rate)}
              onChange={(e) => set("default_tva_rate", Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="s-head">{t("settings.shop.receiptHeader")}</Label>
          <Textarea
            id="s-head"
            rows={2}
            value={form.receipt_header}
            onChange={(e) => set("receipt_header", e.target.value)}
            placeholder={t("settings.shop.receiptHeaderPlaceholder")}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="s-foot">{t("settings.shop.receiptFooter")}</Label>
          <Input
            id="s-foot"
            value={form.receipt_footer}
            onChange={(e) => set("receipt_footer", e.target.value)}
          />
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={save.isPending}>
          {t("common.save")}
        </Button>
      </CardFooter>
    </Card>
  );
}
