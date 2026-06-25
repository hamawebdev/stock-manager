import { cn } from "@/lib/utils";

export interface SummaryCard {
  label: string;
  value: string;
  /** Visual emphasis for the value (e.g. red for a debt balance). */
  tone?: "default" | "primary" | "danger" | "success";
}

const toneClass: Record<NonNullable<SummaryCard["tone"]>, string> = {
  default: "text-foreground",
  primary: "text-primary",
  danger: "text-destructive",
  success: "text-emerald-600 dark:text-emerald-500",
};

/** The KPI row shown atop the supplier tabs and the purchase detail. */
export function SummaryCards({ cards }: { cards: SummaryCard[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-card flex flex-col items-center justify-center gap-1 rounded-xl border p-4 text-center"
        >
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {c.label}
          </span>
          <span className={cn("text-2xl font-bold", toneClass[c.tone ?? "default"])}>
            {c.value}
          </span>
        </div>
      ))}
    </div>
  );
}
