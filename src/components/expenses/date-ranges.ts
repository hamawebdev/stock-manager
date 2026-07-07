/**
 * Named date-range presets shared by the expenses dashboard, list and
 * analytics. Ranges are inclusive ISO 'YYYY-MM-DD' strings in the shop's local
 * wall-clock, matching how `expense_date` is stored.
 */
export type RangePreset =
  | "this_month"
  | "last_month"
  | "last_30"
  | "this_year"
  | "all"
  | "custom";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** First day of `d`'s month (local). */
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export interface DateRange {
  from: string | null;
  to: string | null;
}

/** Resolve a preset to concrete from/to dates (null = unbounded). */
export function resolveRange(preset: RangePreset): DateRange {
  const now = new Date();
  const today = iso(now);
  switch (preset) {
    case "this_month":
      return { from: iso(startOfMonth(now)), to: today };
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: iso(start), to: iso(end) };
    }
    case "last_30": {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { from: iso(start), to: today };
    }
    case "this_year":
      return { from: `${now.getFullYear()}-01-01`, to: today };
    case "all":
    case "custom":
      return { from: null, to: null };
  }
}

export const RANGE_PRESETS: RangePreset[] = [
  "this_month",
  "last_month",
  "last_30",
  "this_year",
  "all",
  "custom",
];
