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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useHardwareConfig, useSaveHardwareConfig, useSettings } from "@/lib/pos/queries";
import {
  printReceipt,
  openCashDrawer,
  type HardwareConfig,
} from "@/lib/pos/hardware";
import { currencyFromSettings } from "@/lib/pos/settings";

/** True when the chosen printer mode needs a device address / IP. */
function needsAddress(mode: string) {
  return mode === "escpos_usb" || mode === "escpos_network";
}

export function HardwareSettingsCard() {
  const { data } = useHardwareConfig();
  const settings = useSettings();
  const save = useSaveHardwareConfig();
  const [cfg, setCfg] = useState<HardwareConfig | null>(null);

  useEffect(() => {
    if (data) setCfg(data);
  }, [data]);

  if (!cfg) return null;

  const set = <K extends keyof HardwareConfig>(k: K, v: HardwareConfig[K]) =>
    setCfg({ ...cfg, [k]: v });

  async function handleSave() {
    try {
      await save.mutateAsync(cfg!);
      toast.success("Hardware settings saved");
    } catch (err) {
      toast.error(`Could not save: ${String(err)}`);
    }
  }

  async function handleTestReceipt() {
    const currency = settings.data
      ? currencyFromSettings(settings.data)
      : { symbol: "", decimals: 2 };
    try {
      await printReceipt(
        {
          shop_name: settings.data?.shop_name ?? "My Shop",
          header: settings.data?.receipt_header,
          footer: settings.data?.receipt_footer,
          code: "TEST-0001",
          datetime: new Date().toLocaleString(),
          lines: [
            { description: "Test item", qty: 1, unit_price_cents: 1000, line_total_cents: 1000 },
          ],
          subtotal_cents: 1000,
          discount_cents: 0,
          total_cents: 1000,
          tendered_cents: 1000,
          change_cents: 0,
          currency,
        },
        cfg!,
      );
      toast.success("Test receipt sent");
    } catch (err) {
      toast.error(`Print failed: ${String(err)}`);
    }
  }

  async function handleTestDrawer() {
    try {
      await openCashDrawer(cfg!);
      toast.success("Drawer kick sent");
    } catch (err) {
      toast.error(`Drawer failed: ${String(err)}`);
    }
  }

  const addrPlaceholder =
    cfg.printer_mode === "escpos_network"
      ? "192.168.1.50:9100"
      : "/dev/usb/lp0 or printer queue path";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hardware</CardTitle>
        <CardDescription>
          Receipt printer, cash drawer, and label printer. Leave on “System
          print” to use the OS print dialog with any installed printer.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {/* Receipt printer */}
        <div className="grid gap-3">
          <h4 className="text-sm font-semibold">Receipt printer</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Mode</Label>
              <Select
                value={cfg.printer_mode}
                onValueChange={(v) => set("printer_mode", v as HardwareConfig["printer_mode"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="os">System print (OS)</SelectItem>
                  <SelectItem value="escpos_usb">ESC/POS — USB</SelectItem>
                  <SelectItem value="escpos_network">ESC/POS — Network</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Paper width</Label>
              <Select
                value={cfg.paper_width}
                onValueChange={(v) => set("paper_width", v as HardwareConfig["paper_width"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="80">80mm</SelectItem>
                  <SelectItem value="58">58mm</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {needsAddress(cfg.printer_mode) && (
            <div className="grid gap-2">
              <Label>Printer address</Label>
              <Input
                value={cfg.printer_address}
                onChange={(e) => set("printer_address", e.target.value)}
                placeholder={addrPlaceholder}
              />
            </div>
          )}
        </div>

        {/* Cash drawer */}
        <div className="grid gap-3 border-t pt-4">
          <h4 className="text-sm font-semibold">Cash drawer</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Connection</Label>
              <Select
                value={cfg.drawer_mode}
                onValueChange={(v) => set("drawer_mode", v as HardwareConfig["drawer_mode"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="printer">Via receipt printer</SelectItem>
                  <SelectItem value="usb">Direct USB</SelectItem>
                  <SelectItem value="none">None / manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {cfg.drawer_mode === "usb" && (
              <div className="grid gap-2">
                <Label>Drawer device path</Label>
                <Input
                  value={cfg.drawer_address}
                  onChange={(e) => set("drawer_address", e.target.value)}
                  placeholder="/dev/usb/..."
                />
              </div>
            )}
          </div>
        </div>

        {/* Label printer */}
        <div className="grid gap-3 border-t pt-4">
          <h4 className="text-sm font-semibold">Label printer</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Mode</Label>
              <Select
                value={cfg.label_mode}
                onValueChange={(v) => set("label_mode", v as HardwareConfig["label_mode"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="same_as_receipt">Same as receipt printer</SelectItem>
                  <SelectItem value="os">System print (OS)</SelectItem>
                  <SelectItem value="escpos_usb">ESC/POS — USB</SelectItem>
                  <SelectItem value="escpos_network">ESC/POS — Network</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {needsAddress(cfg.label_mode) && (
              <div className="grid gap-2">
                <Label>Label printer address</Label>
                <Input
                  value={cfg.label_address}
                  onChange={(e) => set("label_address", e.target.value)}
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Label width (mm)</Label>
              <Input
                inputMode="numeric"
                value={String(cfg.label_width_mm)}
                onChange={(e) => set("label_width_mm", Number(e.target.value) || 0)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Label height (mm)</Label>
              <Input
                inputMode="numeric"
                value={String(cfg.label_height_mm)}
                onChange={(e) => set("label_height_mm", Number(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        <Button onClick={handleSave} disabled={save.isPending}>
          Save
        </Button>
        <Button variant="outline" onClick={handleTestReceipt}>
          Test receipt
        </Button>
        <Button variant="outline" onClick={handleTestDrawer}>
          Test drawer
        </Button>
      </CardFooter>
    </Card>
  );
}
