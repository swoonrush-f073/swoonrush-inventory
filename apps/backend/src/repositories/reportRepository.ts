import type { Queryable } from '../config/db.js';

export interface DateRange {
  from?: string;
  to?: string;
}

const ACTIVE_ORDER_STATUSES_SQL = `order_status NOT IN ('CANCELLED', 'RETURNED')`;
const DATE_RANGE_SQL = `($1::date IS NULL OR order_date >= $1::date) AND ($2::date IS NULL OR order_date < ($2::date + INTERVAL '1 day'))`;

function rangeParams(range: DateRange): [string | null, string | null] {
  return [range.from ?? null, range.to ?? null];
}

export interface SalesSummary {
  revenue: number;
  orders: number;
  unitsSold: number;
  stitchingRevenue: number;
}

export interface ProfitSummary {
  productRevenue: number;
  productCost: number;
  grossProfit: number;
}

export interface SalesByDayPoint {
  date: string;
  orders: number;
  units: number;
  revenue: number;
}

export interface TopProductPoint {
  productId: string;
  sku: string;
  name: string;
  unitsSold: number;
  revenue: number;
}

export interface StatusCount {
  status: string;
  count: number;
}

export const reportRepository = {
  async salesSummary(db: Queryable, range: DateRange): Promise<SalesSummary> {
    const { rows } = await db.query<{
      revenue: string;
      orders: string;
      units_sold: string;
      stitching_revenue: string;
    }>(
      `SELECT
         COALESCE((SELECT SUM(total) FROM orders WHERE ${ACTIVE_ORDER_STATUSES_SQL} AND ${DATE_RANGE_SQL}), 0) AS revenue,
         COALESCE((SELECT COUNT(*) FROM orders WHERE ${ACTIVE_ORDER_STATUSES_SQL} AND ${DATE_RANGE_SQL}), 0) AS orders,
         COALESCE((SELECT SUM(stitching_charge) FROM orders WHERE ${ACTIVE_ORDER_STATUSES_SQL} AND ${DATE_RANGE_SQL}), 0) AS stitching_revenue,
         COALESCE((
           SELECT SUM(oi.quantity) FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.${ACTIVE_ORDER_STATUSES_SQL} AND
             ($1::date IS NULL OR o.order_date >= $1::date) AND
             ($2::date IS NULL OR o.order_date < ($2::date + INTERVAL '1 day'))
         ), 0) AS units_sold`,
      rangeParams(range),
    );
    const row = rows[0]!;
    return {
      revenue: Number(row.revenue),
      orders: Number(row.orders),
      unitsSold: Number(row.units_sold),
      stitchingRevenue: Number(row.stitching_revenue),
    };
  },

  async profitSummary(db: Queryable, range: DateRange): Promise<ProfitSummary> {
    const { rows } = await db.query<{ product_revenue: string; product_cost: string }>(
      `SELECT
         COALESCE(SUM(oi.total), 0) AS product_revenue,
         COALESCE(SUM(oi.quantity * oi.cost_price), 0) AS product_cost
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.${ACTIVE_ORDER_STATUSES_SQL} AND
         ($1::date IS NULL OR o.order_date >= $1::date) AND
         ($2::date IS NULL OR o.order_date < ($2::date + INTERVAL '1 day'))`,
      rangeParams(range),
    );
    const row = rows[0]!;
    const productRevenue = Number(row.product_revenue);
    const productCost = Number(row.product_cost);
    return { productRevenue, productCost, grossProfit: productRevenue - productCost };
  },

  /**
   * One row per calendar day across the range (or, when the range is open-
   * ended, across the earliest-to-latest matching order), zero-filling days
   * with no orders. Without this, days with no sales are simply absent from
   * the result — a line chart plotted against a categorical axis then spaces
   * every returned point equally regardless of the actual gap between their
   * dates, visually implying an even cadence that isn't real.
   */
  async salesByDay(db: Queryable, range: DateRange): Promise<SalesByDayPoint[]> {
    const { rows } = await db.query<{
      date: string;
      orders: string;
      units: string | null;
      revenue: string;
    }>(
      `WITH bounds AS (
         SELECT
           COALESCE($1::date, MIN(DATE(order_date))) AS start_date,
           COALESCE($2::date, MAX(DATE(order_date))) AS end_date
         FROM orders
         WHERE ${ACTIVE_ORDER_STATUSES_SQL} AND ${DATE_RANGE_SQL}
       ),
       days AS (
         SELECT generate_series(bounds.start_date, bounds.end_date, INTERVAL '1 day')::date AS date
         FROM bounds
         WHERE bounds.start_date IS NOT NULL
       ),
       daily AS (
         SELECT DATE(order_date) AS date, COUNT(*) AS orders, SUM(total) AS revenue
         FROM orders
         WHERE ${ACTIVE_ORDER_STATUSES_SQL} AND ${DATE_RANGE_SQL}
         GROUP BY DATE(order_date)
       ),
       item_daily AS (
         SELECT DATE(o2.order_date) AS date, SUM(oi.quantity) AS units
         FROM order_items oi
         JOIN orders o2 ON o2.id = oi.order_id
         WHERE o2.${ACTIVE_ORDER_STATUSES_SQL} AND
           ($1::date IS NULL OR o2.order_date >= $1::date) AND
           ($2::date IS NULL OR o2.order_date < ($2::date + INTERVAL '1 day'))
         GROUP BY DATE(o2.order_date)
       )
       SELECT
         days.date::text AS date,
         COALESCE(daily.orders, 0) AS orders,
         COALESCE(daily.revenue, 0) AS revenue,
         COALESCE(item_daily.units, 0) AS units
       FROM days
       LEFT JOIN daily ON daily.date = days.date
       LEFT JOIN item_daily ON item_daily.date = days.date
       ORDER BY days.date ASC`,
      rangeParams(range),
    );
    return rows.map((r) => ({
      date: r.date,
      orders: Number(r.orders),
      units: Number(r.units ?? 0),
      revenue: Number(r.revenue),
    }));
  },

  async topProducts(db: Queryable, range: DateRange, limit: number): Promise<TopProductPoint[]> {
    const { rows } = await db.query<{
      product_id: string;
      sku: string;
      name: string;
      units_sold: string;
      revenue: string;
    }>(
      `SELECT
         oi.product_id,
         oi.sku,
         oi.product_name AS name,
         SUM(oi.quantity) AS units_sold,
         SUM(oi.total) AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.${ACTIVE_ORDER_STATUSES_SQL} AND
         ($1::date IS NULL OR o.order_date >= $1::date) AND
         ($2::date IS NULL OR o.order_date < ($2::date + INTERVAL '1 day'))
       GROUP BY oi.product_id, oi.sku, oi.product_name
       ORDER BY units_sold DESC
       LIMIT $3`,
      [...rangeParams(range), limit],
    );
    return rows.map((r) => ({
      productId: r.product_id,
      sku: r.sku,
      name: r.name,
      unitsSold: Number(r.units_sold),
      revenue: Number(r.revenue),
    }));
  },

  async orderStatusDistribution(db: Queryable, range: DateRange): Promise<StatusCount[]> {
    const { rows } = await db.query<{ status: string; count: string }>(
      `SELECT order_status AS status, COUNT(*) AS count
       FROM orders
       WHERE ${DATE_RANGE_SQL}
       GROUP BY order_status`,
      rangeParams(range),
    );
    return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
  },

  async paymentStatusDistribution(db: Queryable, range: DateRange): Promise<StatusCount[]> {
    const { rows } = await db.query<{ status: string; count: string }>(
      `SELECT payment_status AS status, COUNT(*) AS count
       FROM orders
       WHERE ${DATE_RANGE_SQL}
       GROUP BY payment_status`,
      rangeParams(range),
    );
    return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
  },

  async inventorySummary(
    db: Queryable,
  ): Promise<{ totalProducts: number; totalUnits: number; inventoryValue: number; damagedStockValue: number }> {
    const { rows } = await db.query<{
      total_products: string;
      total_units: string | null;
      inventory_value: string | null;
      damaged_stock_value: string | null;
    }>(
      `SELECT
         COUNT(*) AS total_products,
         COALESCE(SUM(stock_quantity), 0) AS total_units,
         COALESCE(SUM(stock_quantity * purchase_price), 0) AS inventory_value,
         -- Deliberately NOT scoped to status = 'ACTIVE' like the columns above:
         -- damage already happened and is a sunk cost, so a product being
         -- archived/discontinued later (possibly because it kept getting
         -- damaged) shouldn't make that historical loss disappear from the total.
         (
           SELECT COALESCE(SUM(-im.quantity * p.purchase_price), 0)
           FROM inventory_movements im
           JOIN products p ON p.id = im.product_id
           WHERE im.type = 'DAMAGE'
         ) AS damaged_stock_value
       FROM products
       WHERE status = 'ACTIVE'`,
    );
    const row = rows[0]!;
    return {
      totalProducts: Number(row.total_products),
      totalUnits: Number(row.total_units ?? 0),
      inventoryValue: Number(row.inventory_value ?? 0),
      damagedStockValue: Number(row.damaged_stock_value ?? 0),
    };
  },
};
