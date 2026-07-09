import { useEffect, useState } from "react";
import { platform, version } from "@tauri-apps/api/os";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/use-app-store";
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ShopSettingsCard } from "@/components/settings/shop-settings-card";
import { LookupsCard } from "@/components/settings/lookups-card";
import { HardwareSettingsCard } from "@/components/settings/hardware-settings-card";
import { DataSettingsCard } from "@/components/settings/data-settings-card";
import { PromotionsCard } from "@/components/settings/promotions-card";
import { SecurityCard } from "@/components/settings/security-card";

const themes = ["light", "dark", "system"] as const;

export default function SettingsPage() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  // Tauri v1's os API is async (v2's plugin-os was sync), so resolve
  // platform/version after mount instead of inline during render.
  const [osInfo, setOsInfo] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([platform(), version()])
      .then(([p, v]) => {
        if (active) setOsInfo(`${p} ${v}`);
      })
      .catch(() => {
        if (active) setOsInfo("");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("settings.title")}</h2>
        <p className="text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <ShopSettingsCard />
      <LookupsCard />
      <PromotionsCard />
      <SecurityCard />
      <HardwareSettingsCard />
      <DataSettingsCard />

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.language.title")}</CardTitle>
          <CardDescription>{t("settings.language.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {SUPPORTED_LANGUAGES.map((lng) => (
            <Button
              key={lng}
              variant={language === lng ? "default" : "outline"}
              onClick={() => setLanguage(lng)}
            >
              {LANGUAGE_NAMES[lng]}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.appearance.title")}</CardTitle>
          <CardDescription>{t("settings.appearance.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          {themes.map((th) => (
            <Button
              key={th}
              variant={theme === th ? "default" : "outline"}
              onClick={() => setTheme(th)}
            >
              {t(`settings.appearance.${th}`)}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.system.title")}</CardTitle>
          <CardDescription>{t("settings.system.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{osInfo || "…"}</p>
        </CardContent>
      </Card>
    </div>
  );
}
