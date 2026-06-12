import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { Percent, Tag } from "lucide-react";
import type { Discount } from "@/store/use-cart-store";
import { parseMoney } from "@/lib/money";
import { useCurrency } from "@/lib/pos/queries";

interface Props {
  value: Discount | null;
  onChange: (discount: Discount | null) => void;
  label?: string;
}

/** Compact percent/fixed discount editor in a popover. */
export function DiscountPopover({ value, onChange, label = "Discount" }: Props) {
  const currency = useCurrency();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<Discount["type"]>(value?.type ?? "percent");
  const [raw, setRaw] = useState(
    value ? (value.type === "percent" ? String(value.value) : "") : "",
  );

  function apply() {
    const v = raw.trim();
    if (v === "") {
      onChange(null);
      setOpen(false);
      return;
    }
    if (type === "percent") {
      const pct = Number(v);
      if (!Number.isFinite(pct) || pct < 0) return;
      onChange({ type: "percent", value: Math.min(100, pct) });
    } else {
      const cents = parseMoney(v, currency.decimals);
      if (cents == null) return;
      onChange({ type: "fixed", value: cents });
    }
    setOpen(false);
  }

  const active = !!value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={active ? "secondary" : "ghost"} size="sm">
          {active && value!.type === "percent" ? <Percent /> : <Tag />}
          {active
            ? value!.type === "percent"
              ? `${value!.value}%`
              : label
            : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="grid gap-3">
          <Label>{label}</Label>
          <ToggleGroup
            type="single"
            value={type}
            onValueChange={(v) => v && setType(v as Discount["type"])}
            className="justify-start"
          >
            <ToggleGroupItem value="percent">%</ToggleGroupItem>
            <ToggleGroupItem value="fixed">
              {currency.symbol || "amount"}
            </ToggleGroupItem>
          </ToggleGroup>
          <Input
            inputMode="decimal"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={type === "percent" ? "10" : "0.00"}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            autoFocus
          />
          <div className="flex justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(null);
                setRaw("");
                setOpen(false);
              }}
            >
              Clear
            </Button>
            <Button size="sm" onClick={apply}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
