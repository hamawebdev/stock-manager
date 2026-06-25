/**
 * Security settings: the manager-PIN gate for sensitive POS actions (price
 * override, refunds, pay-out, open drawer, close register). This is a deterrent
 * for a single trusted register, not authentication.
 */
import { useEffect, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { getPinConfig, setManagerPin, setPinRequired } from "@/lib/pos/auth";

export function SecurityCard() {
  const { t } = useTranslation();
  const [required, setRequired] = useState(false);
  const [isSet, setIsSet] = useState(false);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(true);

  async function reload() {
    const cfg = await getPinConfig();
    setRequired(cfg.required);
    setIsSet(cfg.isSet);
    setLoading(false);
  }

  useEffect(() => {
    // setState happens after the awaited read, not synchronously in the effect.
    void (async () => {
      const cfg = await getPinConfig();
      setRequired(cfg.required);
      setIsSet(cfg.isSet);
      setLoading(false);
    })();
  }, []);

  async function toggleRequired(v: boolean) {
    setRequired(v);
    await setPinRequired(v);
  }

  async function savePin() {
    await setManagerPin(pin);
    setPin("");
    await reload();
    toast.success(pin.trim() ? t("settings.security.pinUpdated") : t("settings.security.pinCleared"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.security.title")}</CardTitle>
        <CardDescription>{t("settings.security.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="require-pin">{t("settings.security.requirePin")}</Label>
          <Switch
            id="require-pin"
            checked={required}
            disabled={loading}
            onCheckedChange={toggleRequired}
          />
        </div>
        {required && !isSet && (
          <p className="text-destructive text-xs">{t("settings.security.noPinWarning")}</p>
        )}
        <div className="grid max-w-xs gap-2">
          <Label htmlFor="pin">{isSet ? t("settings.security.changePin") : t("settings.security.setPin")}</Label>
          <div className="flex gap-2">
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder={isSet ? t("settings.security.pinPlaceholderSet") : t("settings.security.pinPlaceholderNew")}
            />
            <Button onClick={savePin} disabled={loading}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
