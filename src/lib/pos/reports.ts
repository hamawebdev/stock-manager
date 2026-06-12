/**
 * Reporting queries. Day boundaries use SQLite's 'localtime' modifier so
 * "today" matches the shop's wall clock (created_at is stored UTC).
 */
import { getDb } from "./db";

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

export interface DayPoint {
  day: string; // YYYY-MM-DD (local)
  total_cents: number;
  count: number;
}

/** Net sales per day for the last `days` days (oldest first). */
export async function getSalesByDay(days = 14): Promise<DayPoint[]> {
  const db = await getDb();
  const rows = await db.select<DayPoint[]>(
    `SELECT date(created_at,'localtime') AS day,
            COALESCE(SUM(total_cents),0) AS total_cents,
            COUNT(*) AS count
       FROM sales
      WHERE status='completed'
        AND date(created_at,'localtime') >= date('now','localtime',$1)
      GROUP BY day
      ORDER BY day`,
    [`-${days - 1} days`],
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

export async function getTopSellers(days = 30, limit = 10): Promise<TopSeller[]> {
  const db = await getDb();
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
      WHERE date(s.created_at,'localtime') >= date('now','localtime',$1)
      GROUP BY si.variant_id
      ORDER BY qty_sold DESC
      LIMIT $2`,
    [`-${days - 1} days`, limit],
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
    where.push(`date(s.created_at,'localtime') <= $${i++}`);
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
