/**
 * Named date-range presets shared by the expenses and reports pages. Ranges are
 * inclusive ISO 'YYYY-MM-DD' strings in the shop's local wall-clock, matching
 * how dates are stored (expense_date directly; sales via SQLite 'localtime').
 */
export type RangePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_7"
  | "this_month"
  | "last_month"
  | "last_30"
  | "this_year"
  | "all"
  | "custom";

/** Format `d` as a local 'YYYY-MM-DD' (wall-clock, not UTC — avoids the
 *  off-by-one `toISOString` gives for timezones east of UTC). */
function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** First day of `d`'s month (local). */
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Monday of `d`'s week (local). Week starts Monday. */
function startOfWeek(d: Date): Date {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (start.getDay() + 6) % 7; // 0 = Monday
  start.setDate(start.getDate() - diff);
  return start;
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
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: iso(y), to: iso(y) };
    }
    case "this_week":
      return { from: iso(startOfWeek(now)), to: today };
    case "last_7": {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { from: iso(start), to: today };
    }
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

/** Presets offered by the Expenses filter (unchanged, stable order). */
export const RANGE_PRESETS: RangePreset[] = [
  "this_month",
  "last_month",
  "last_30",
  "this_year",
  "all",
  "custom",
];

/** Presets offered by the Reports filter — a POS owner also checks by day/week. */
export const REPORT_RANGE_PRESETS: RangePreset[] = [
  "today",
  "yesterday",
  "this_week",
  "last_7",
  "this_month",
  "last_month",
  "last_30",
  "this_year",
  "all",
  "custom",
];

/**
 * The equal-length window immediately preceding `range`, for period-over-period
 * comparison. Returns null when either bound is open (All time / unbounded
 * custom), where a comparison is meaningless.
 */
export function previousRange(range: DateRange): DateRange | null {
  if (!range.from || !range.to) return null;
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  const dayMs = 86_400_000;
  const lengthDays = Math.round((to.getTime() - from.getTime()) / dayMs) + 1;
  const prevTo = new Date(from.getTime() - dayMs);
  const prevFrom = new Date(prevTo.getTime() - (lengthDays - 1) * dayMs);
  return { from: iso(prevFrom), to: iso(prevTo) };
}
