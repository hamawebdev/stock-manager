/**
 * Reporting queries. Day boundaries use SQLite's 'localtime' modifier so
 * "today" matches the shop's wall clock (created_at is stored UTC). Date-scoped
 * reports take an inclusive `DateRange` of local 'YYYY-MM-DD' strings (null
 * bound = unbounded), mirroring the expenses/best-sellers filters.
 */
import { getDb } from "./db";
import type { DateRange } from "@/lib/date-ranges";

export type Granularity = "day" | "month";

/**
 * Chart bucket size for a range: daily for short windows, monthly for long or
 * unbounded ones so a year-long trend renders ~12 bars instead of 365.
 */
export function pickGranularity(range: DateRange): Granularity {
  if (!range.from || !range.to) return "month";
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  const spanDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  return spanDays <= 92 ? "day" : "month";
}

/**
 * Build a range predicate over one or more table aliases that share the same
 * window. Pushes the from/to bounds onto `args` once and returns a factory that
 * emits a `date(<expr>,'localtime')` clause reusing those positional params, so
 * a statement can filter the same window on several aliases (e.g. a subquery).
 * Emits "1=1" when a bound is absent, keeping the SQL valid for open ranges.
 */
function rangeClauses(range: DateRange, args: unknown[]) {
  let fromPh = 0;
  let toPh = 0;
  if (range.from) {
    args.push(range.from);
    fromPh = args.length;
  }
  if (range.to) {
    args.push(range.to);
    toPh = args.length;
  }
  return (expr: string): string => {
    const parts: string[] = [];
    if (fromPh) parts.push(`date(${expr},'localtime') >= $${fromPh}`);
    if (toPh) parts.push(`date(${expr},'localtime') <= $${toPh}`);
    return parts.length ? parts.join(" AND ") : "1=1";
  };
}

/** SQL expression that buckets `col` by day or month, in the shop's local time. */
function bucketExpr(col: string, granularity: Granularity): string {
  return granularity === "month"
    ? `strftime('%Y-%m', ${col}, 'localtime')`
    : `date(${col},'localtime')`;
}

export interface TodaySummary {
  sale_count: number;
  items_sold: number;
  net_cents: number;
  discount_cents: number;
  return_count: number;
  refund_cents: number;
}

export async function getTodaySummary(): Promise<TodaySummary> {
  const db = await getDb();
  const [sales] = await db.select<
    { sale_count: number; net_cents: number; discount_cents: number }[]
  >(
    `SELECT COUNT(*) AS sale_count,
            COALESCE(SUM(total_cents),0) AS net_cents,
            COALESCE(SUM(cart_discount_cents),0) AS discount_cents
       FROM sales
      WHERE status='completed'
        AND date(created_at,'localtime') = date('now','localtime')`,
  );
  const [items] = await db.select<{ items_sold: number }[]>(
    `SELECT COALESCE(SUM(si.qty),0) AS items_sold
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.status='completed'
        AND date(s.created_at,'localtime') = date('now','localtime')`,
  );
  const [rets] = await db.select<{ return_count: number; refund_cents: number }[]>(
    `SELECT COUNT(*) AS return_count,
            COALESCE(SUM(CASE WHEN net_cash_cents>0 THEN net_cash_cents ELSE 0 END),0) AS refund_cents
       FROM returns
      WHERE date(created_at,'localtime') = date('now','localtime')`,
  );
  return {
    sale_count: sales.sale_count,
    items_sold: items.items_sold,
    net_cents: sales.net_cents,
    discount_cents: sales.discount_cents,
    return_count: rets.return_count,
    refund_cents: rets.refund_cents,
  };
}

/**
 * Sales/returns headline summary over an arbitrary `range` (the range-scoped
 * generalisation of {@link getTodaySummary}, which stays as-is for the payments
 * insights strip). Sales and returns are aggregated in separate queries.
 */
export async function getSalesSummary(range: DateRange): Promise<TodaySummary> {
  const db = await getDb();

  const salesArgs: unknown[] = [];
  const salesWhere = rangeClauses(range, salesArgs)("created_at");
  const [sales] = await db.select<
    { sale_count: number; net_cents: number; discount_cents: number }[]
  >(
    `SELECT COUNT(*) AS sale_count,
            COALESCE(SUM(total_cents),0) AS net_cents,
            COALESCE(SUM(cart_discount_cents),0) AS discount_cents
       FROM sales
      WHERE status='completed' AND ${salesWhere}`,
    salesArgs,
  );

  const itemArgs: unknown[] = [];
  const itemWhere = rangeClauses(range, itemArgs)("s.created_at");
  const [items] = await db.select<{ items_sold: number }[]>(
    `SELECT COALESCE(SUM(si.qty),0) AS items_sold
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.status='completed' AND ${itemWhere}`,
    itemArgs,
  );

  const retArgs: unknown[] = [];
  const retWhere = rangeClauses(range, retArgs)("created_at");
  const [rets] = await db.select<{ return_count: number; refund_cents: number }[]>(
    `SELECT COUNT(*) AS return_count,
            COALESCE(SUM(CASE WHEN net_cash_cents>0 THEN net_cash_cents ELSE 0 END),0) AS refund_cents
       FROM returns
      WHERE ${retWhere}`,
    retArgs,
  );

  return {
    sale_count: sales.sale_count,
    items_sold: items.items_sold,
    net_cents: sales.net_cents,
    discount_cents: sales.discount_cents,
    return_count: rets.return_count,
    refund_cents: rets.refund_cents,
  };
}

export interface ReturnsReportRow {
  id: number;
  code: string;
  created_at: string;
  original_sale_code: string | null;
  customer_name: string | null;
  kind: "refund" | "exchange";
  return_value_cents: number;
  net_cash_cents: number;
}

export interface ReturnsReport {
  rows: ReturnsReportRow[];
  return_count: number;
  /** Cash paid back to customers (net_cash_cents where positive). */
  refund_total_cents: number;
  /** Total value of goods brought back. */
  returned_value_cents: number;
}

/** Returns & refunds over `range`, newest first, with totals. */
export async function getReturnsReport(range: DateRange): Promise<ReturnsReport> {
  const db = await getDb();
  const args: unknown[] = [];
  const where = rangeClauses(range, args)("r.created_at");
  const rows = await db.select<ReturnsReportRow[]>(
    `SELECT r.id, r.code, r.created_at,
            s.code AS original_sale_code,
            c.name AS customer_name,
            r.kind, r.return_value_cents, r.net_cash_cents
       FROM returns r
       LEFT JOIN sales s     ON s.id = r.original_sale_id
       LEFT JOIN customers c ON c.id = s.customer_id
      WHERE ${where}
      ORDER BY r.id DESC`,
    args,
  );
  const refund_total_cents = rows.reduce(
    (sum, r) => sum + (r.net_cash_cents > 0 ? r.net_cash_cents : 0),
    0,
  );
  const returned_value_cents = rows.reduce(
    (sum, r) => sum + r.return_value_cents,
    0,
  );
  return {
    rows,
    return_count: rows.length,
    refund_total_cents,
    returned_value_cents,
  };
}

export interface DayPoint {
  day: string; // YYYY-MM-DD (day bucket) or YYYY-MM (month bucket), local
  total_cents: number;
  count: number;
}

/** Net sales bucketed over `range`, oldest first. */
export async function getSalesByDay(
  range: DateRange,
  granularity: Granularity = "day",
): Promise<DayPoint[]> {
  const db = await getDb();
  const args: unknown[] = [];
  const where = rangeClauses(range, args)("created_at");
  const rows = await db.select<DayPoint[]>(
    `SELECT ${bucketExpr("created_at", granularity)} AS day,
            COALESCE(SUM(total_cents),0) AS total_cents,
            COUNT(*) AS count
       FROM sales
      WHERE status='completed' AND ${where}
      GROUP BY day
      ORDER BY day`,
    args,
  );
  return rows;
}

export interface TopSeller {
  product_name: string;
  size_name: string | null;
  color_name: string | null;
  qty_sold: number;
  revenue_cents: number;
}

export async function getTopSellers(
  range: DateRange,
  limit = 10,
): Promise<TopSeller[]> {
  const db = await getDb();
  const args: unknown[] = [];
  const where = rangeClauses(range, args)("s.created_at");
  args.push(limit);
  const limitPh = args.length;
  return db.select<TopSeller[]>(
    `SELECT p.name AS product_name, sz.name AS size_name, c.name AS color_name,
            SUM(si.qty) AS qty_sold,
            SUM(si.line_total_cents) AS revenue_cents
       FROM sale_items si
       JOIN sales s   ON s.id = si.sale_id AND s.status='completed'
       JOIN variants v ON v.id = si.variant_id
       JOIN products p ON p.id = v.product_id
       LEFT JOIN sizes sz ON sz.id = v.size_id
       LEFT JOIN colors c ON c.id = v.color_id
      WHERE ${where}
      GROUP BY si.variant_id
      ORDER BY qty_sold DESC
      LIMIT $${limitPh}`,
    args,
  );
}

export interface BestSellerProduct {
  product_id: number;
  product_name: string;
  reference: string | null;
  category_name: string | null;
  units_sold: number;
  revenue_cents: number;
  current_stock: number;
  low_stock_threshold: number | null;
  last_sale_date: string | null;
}

/**
 * Best-selling products aggregated at the product level over an optional date
 * range (YYYY-MM-DD, local). Includes current on-hand stock and last-sale date
 * for the Best Sellers page. Stock status is derived client-side.
 */
export async function getBestSellers(opts: {
  from?: string | null;
  to?: string | null;
} = {}): Promise<BestSellerProduct[]> {
  const db = await getDb();
  const where: string[] = ["s.status = 'completed'"];
  const args: unknown[] = [];
  let i = 1;
  if (opts.from) {
    where.push(`date(s.created_at,'localtime') >= $${i++}`);
    args.push(opts.from);
  }
  if (opts.to) {
    where.push(`date(s.created_at,'localtime') <= $${i}`);
    args.push(opts.to);
  }
  return db.select<BestSellerProduct[]>(
    `SELECT p.id AS product_id, p.name AS product_name, p.reference AS reference,
            c.name AS category_name,
            SUM(si.qty) AS units_sold,
            SUM(si.line_total_cents) AS revenue_cents,
            MAX(s.created_at) AS last_sale_date,
            p.low_stock_threshold AS low_stock_threshold,
            COALESCE((SELECT SUM(v2.stock) FROM variants v2
                       WHERE v2.product_id = p.id AND v2.archived = 0), 0) AS current_stock
       FROM sale_items si
       JOIN sales s    ON s.id = si.sale_id
       JOIN variants v ON v.id = si.variant_id
       JOIN products p ON p.id = v.product_id
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${where.join(" AND ")}
      GROUP BY p.id
      ORDER BY units_sold DESC`,
    args,
  );
}

export interface InventoryKpis {
  total_products: number;
  low_stock: number;
  out_of_stock: number;
}

/** Headline inventory counts for the dashboard widgets. */
export async function getInventoryKpis(defaultLowStock = 5): Promise<InventoryKpis> {
  const db = await getDb();
  const [row] = await db.select<InventoryKpis[]>(
    `SELECT COUNT(*) AS total_products,
            COALESCE(SUM(CASE WHEN total_stock > 0
                          AND total_stock <= COALESCE(low_stock_threshold, $1)
                          THEN 1 ELSE 0 END), 0) AS low_stock,
            COALESCE(SUM(CASE WHEN total_stock <= 0 THEN 1 ELSE 0 END), 0) AS out_of_stock
       FROM (
         SELECT p.id, p.low_stock_threshold,
                COALESCE(SUM(v.stock), 0) AS total_stock
           FROM products p
           LEFT JOIN variants v ON v.product_id = p.id AND v.archived = 0
          WHERE p.archived = 0
          GROUP BY p.id
       )`,
    [defaultLowStock],
  );
  return row ?? { total_products: 0, low_stock: 0, out_of_stock: 0 };
}

export interface MovementAnalyticsRow {
  product_id: number;
  product_name: string;
  reference: string | null;
  category_name: string | null;
  current_stock: number;
  low_stock_threshold: number | null;
  reorder_quantity: number | null;
  units_sold: number; // over the analysis window
  last_sale_date: string | null;
}

/**
 * Per-product movement analytics over the last `days` days. Includes products
 * with zero sales (needed for dead-stock detection). Classification into
 * fast / slow / dead / reorder is derived client-side from units_sold + stock.
 */
export async function getMovementAnalytics(
  days = 30,
): Promise<MovementAnalyticsRow[]> {
  const db = await getDb();
  return db.select<MovementAnalyticsRow[]>(
    `SELECT p.id AS product_id, p.name AS product_name, p.reference AS reference,
            c.name AS category_name,
            COALESCE((SELECT SUM(v.stock) FROM variants v
                       WHERE v.product_id = p.id AND v.archived = 0), 0) AS current_stock,
            p.low_stock_threshold AS low_stock_threshold,
            p.reorder_quantity AS reorder_quantity,
            COALESCE(sold.units, 0) AS units_sold,
            sold.last_sale_date AS last_sale_date
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN (
         SELECT v.product_id AS pid, SUM(si.qty) AS units,
                MAX(s.created_at) AS last_sale_date
           FROM sale_items si
           JOIN sales s    ON s.id = si.sale_id AND s.status = 'completed'
                          AND date(s.created_at,'localtime') >= date('now','localtime',$1)
           JOIN variants v ON v.id = si.variant_id
          GROUP BY v.product_id
       ) sold ON sold.pid = p.id
      WHERE p.archived = 0
      ORDER BY units_sold DESC`,
    [`-${days - 1} days`],
  );
}

export interface ProfitSummary {
  /** Net sales revenue: completed sales in window, minus returned goods value. */
  revenue_cents: number;
  /** Net COGS: cost of goods sold, minus cost recovered by restocked returns. */
  cogs_cents: number;
  /** Value of goods returned in window (reduces revenue). */
  returns_value_cents: number;
  /** revenue_cents - cogs_cents (restock-aware gross margin after returns). */
  net_profit_cents: number;
}

/**
 * Net Profit over `range` (returns attributed to the day the return was
 * processed, matching the Returns report and today's summary).
 *
 *   Net Profit = (SalesRevenue − ReturnedGoodsValue)
 *              − (COGS_sold − COGS_recovered_by_restock)
 *
 * COGS uses the per-line cost snapshotted at sale time (sale_items.cost_cents).
 * A restocked return recovers its cost (only the margin is reversed); a
 * non-restocked (damaged) return recovers nothing, so its full cost is lost.
 * Partial and repeated returns fall out naturally because each return_in_items
 * row carries its own qty. Sales and returns are aggregated separately to avoid
 * fan-out double counting.
 */
export async function getProfitSummary(range: DateRange): Promise<ProfitSummary> {
  const db = await getDb();

  const salesArgs: unknown[] = [];
  const salesClause = rangeClauses(range, salesArgs);
  const [sales] = await db.select<{ revenue: number; cogs: number }[]>(
    `SELECT COALESCE(SUM(s.total_cents),0) AS revenue,
            COALESCE((
              SELECT SUM(si.qty * si.cost_cents)
                FROM sale_items si
                JOIN sales s2 ON s2.id = si.sale_id
               WHERE s2.status='completed'
                 AND ${salesClause("s2.created_at")}
            ),0) AS cogs
       FROM sales s
      WHERE s.status='completed'
        AND ${salesClause("s.created_at")}`,
    salesArgs,
  );

  const retArgs: unknown[] = [];
  const retWhere = rangeClauses(range, retArgs)("r.created_at");
  const [rets] = await db.select<{ ret_value: number; ret_cogs: number }[]>(
    `SELECT COALESCE(SUM(rii.qty * rii.unit_price_cents),0) AS ret_value,
            COALESCE(SUM(CASE WHEN rii.restock=1
                          THEN rii.qty * COALESCE(si.cost_cents, v.cost_cents, p.cost_cents, 0)
                          ELSE 0 END),0) AS ret_cogs
       FROM return_in_items rii
       JOIN returns r    ON r.id = rii.return_id
       LEFT JOIN sale_items si ON si.id = rii.sale_item_id
       JOIN variants v   ON v.id = rii.variant_id
       JOIN products p   ON p.id = v.product_id
      WHERE ${retWhere}`,
    retArgs,
  );

  const revenue = sales.revenue - rets.ret_value;
  const cogs = sales.cogs - rets.ret_cogs;
  return {
    revenue_cents: revenue,
    cogs_cents: cogs,
    returns_value_cents: rets.ret_value,
    net_profit_cents: revenue - cogs,
  };
}

export interface ProfitDayPoint {
  day: string; // YYYY-MM-DD (local)
  profit_cents: number;
}

/**
 * Net Profit per bucket over `range` (oldest first). Sales profit is
 * booked on the sale day; returns are booked on the day they were processed,
 * so a day can show a negative profit if returns outweigh sales.
 */
export async function getProfitByDay(
  range: DateRange,
  granularity: Granularity = "day",
): Promise<ProfitDayPoint[]> {
  const db = await getDb();

  // Revenue per bucket from the sale header (nets cart-level discount), so the
  // series sums to the same total as getProfitSummary's revenue.
  const revArgs: unknown[] = [];
  const revWhere = rangeClauses(range, revArgs)("created_at");
  const revRows = await db.select<{ day: string; revenue: number }[]>(
    `SELECT ${bucketExpr("created_at", granularity)} AS day,
            COALESCE(SUM(total_cents),0) AS revenue
       FROM sales
      WHERE status='completed' AND ${revWhere}
      GROUP BY day`,
    revArgs,
  );

  const cogsArgs: unknown[] = [];
  const cogsWhere = rangeClauses(range, cogsArgs)("s.created_at");
  const cogsRows = await db.select<{ day: string; cogs: number }[]>(
    `SELECT ${bucketExpr("s.created_at", granularity)} AS day,
            COALESCE(SUM(si.qty * si.cost_cents),0) AS cogs
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id AND s.status='completed'
      WHERE ${cogsWhere}
      GROUP BY day`,
    cogsArgs,
  );

  const retArgs: unknown[] = [];
  const retWhere = rangeClauses(range, retArgs)("r.created_at");
  const retRows = await db.select<{ day: string; reversed: number }[]>(
    `SELECT ${bucketExpr("r.created_at", granularity)} AS day,
            COALESCE(SUM(rii.qty * rii.unit_price_cents
                         - CASE WHEN rii.restock=1
                                THEN rii.qty * COALESCE(si.cost_cents, v.cost_cents, p.cost_cents, 0)
                                ELSE 0 END),0) AS reversed
       FROM return_in_items rii
       JOIN returns r    ON r.id = rii.return_id
       LEFT JOIN sale_items si ON si.id = rii.sale_item_id
       JOIN variants v   ON v.id = rii.variant_id
       JOIN products p   ON p.id = v.product_id
      WHERE ${retWhere}
      GROUP BY day`,
    retArgs,
  );

  const byDay = new Map<string, number>();
  for (const r of revRows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.revenue);
  for (const r of cogsRows) byDay.set(r.day, (byDay.get(r.day) ?? 0) - r.cogs);
  for (const r of retRows) byDay.set(r.day, (byDay.get(r.day) ?? 0) - r.reversed);
  return [...byDay.entries()]
    .map(([day, profit_cents]) => ({ day, profit_cents }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export interface InventoryValuation {
  variant_count: number;
  units: number;
  cost_value_cents: number;
  retail_value_cents: number;
}

export async function getInventoryValuation(): Promise<InventoryValuation> {
  const db = await getDb();
  const [row] = await db.select<InventoryValuation[]>(
    `SELECT COUNT(*) AS variant_count,
            COALESCE(SUM(v.stock),0) AS units,
            COALESCE(SUM(v.stock * COALESCE(v.cost_cents, p.cost_cents)),0) AS cost_value_cents,
            COALESCE(SUM(v.stock * COALESCE(v.price_cents, p.price_cents)),0) AS retail_value_cents
       FROM variants v JOIN products p ON p.id = v.product_id
      WHERE v.archived = 0`,
  );
  return row;
}
