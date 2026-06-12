import { useEffect, useState } from "react";
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
import { useSettings, useSaveSettings } from "@/lib/pos/queries";
import type { ShopSettings } from "@/lib/pos/types";

export function ShopSettingsCard() {
  const { data } = useSettings();
  const save = useSaveSettings();
  const [form, setForm] = useState<ShopSettings | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (!form) return null;

  const set = <K extends keyof ShopSettings>(k: K, v: ShopSettings[K]) =>
    setForm({ ...form, [k]: v });

  async function handleSave() {
    try {
      await save.mutateAsync(form!);
      toast.success("Shop settings saved");
    } catch (err) {
      toast.error(`Could not save: ${String(err)}`);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shop profile</CardTitle>
        <CardDescription>
          Appears on receipts and labels. Currency formats all prices.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="s-name">Shop name</Label>
          <Input
            id="s-name"
            value={form.shop_name}
            onChange={(e) => set("shop_name", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="s-cur">Currency symbol</Label>
            <Input
              id="s-cur"
              value={form.currency_symbol}
              onChange={(e) => set("currency_symbol", e.target.value)}
              placeholder="e.g. DA, €, $"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-dec">Decimal places</Label>
            <Input
              id="s-dec"
              inputMode="numeric"
              value={String(form.currency_decimals)}
              onChange={(e) =>
                set("currency_decimals", Number(e.target.value) || 0)
              }
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="s-head">Receipt header</Label>
          <Textarea
            id="s-head"
            rows={2}
            value={form.receipt_header}
            onChange={(e) => set("receipt_header", e.target.value)}
            placeholder="Address, phone, etc."
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="s-foot">Receipt footer</Label>
          <Input
            id="s-foot"
            value={form.receipt_footer}
            onChange={(e) => set("receipt_footer", e.target.value)}
          />
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={save.isPending}>
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}
