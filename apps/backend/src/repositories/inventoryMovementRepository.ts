import type { InventoryMovementRow, MovementType } from '@swoonrush/shared';
import type { Queryable } from '../config/db.js';
import { offsetFor } from '../utils/pagination.js';

export interface MovementListRow extends InventoryMovementRow {
  product_name: string;
  sku: string;
  created_by_name: string | null;
}

export interface MovementFilters {
  page: number;
  limit: number;
  productId?: string;
  type?: MovementType;
  from?: string;
  to?: string;
}

export const inventoryMovementRepository = {
  async create(
    db: Queryable,
    input: {
      productId: string;
      type: MovementType;
      quantity: number;
      referenceType?: string | null;
      referenceId?: string | null;
      reason?: string | null;
      createdBy?: string | null;
    },
  ): Promise<InventoryMovementRow> {
    const { rows } = await db.query<InventoryMovementRow>(
      `INSERT INTO inventory_movements
        (product_id, type, quantity, reference_type, reference_id, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.productId,
        input.type,
        input.quantity,
        input.referenceType ?? null,
        input.referenceId ?? null,
        input.reason ?? null,
        input.createdBy ?? null,
      ],
    );
    return rows[0]!;
  },

  /** Lifetime "stock in" (OPENING_STOCK + STOCK_IN) and "damaged" (DAMAGE) unit
   *  totals per product, in one grouped scan of inventory_movements rather than
   *  two — both are always fetched together by every caller. Neither nets
   *  against other movement types (sales/adjustments/etc); DAMAGE quantities
   *  are stored negative (see reportDamage) and reported here as positive counts. */
  async movementTotalsByProduct(
    db: Queryable,
    productIds: string[],
  ): Promise<Map<string, { stockIn: number; damaged: number }>> {
    if (productIds.length === 0) return new Map();

    const { rows } = await db.query<{ product_id: string; stock_in: string; damaged: string }>(
      `SELECT
         product_id,
         COALESCE(SUM(quantity) FILTER (WHERE type IN ('OPENING_STOCK', 'STOCK_IN')), 0) AS stock_in,
         COALESCE(SUM(-quantity) FILTER (WHERE type = 'DAMAGE'), 0) AS damaged
       FROM inventory_movements
       WHERE product_id = ANY($1)
       GROUP BY product_id`,
      [productIds],
    );
    return new Map(
      rows.map((row) => [row.product_id, { stockIn: Number(row.stock_in), damaged: Number(row.damaged) }]),
    );
  },

  async existsForProduct(db: Queryable, productId: string): Promise<boolean> {
    const { rows } = await db.query('SELECT 1 FROM inventory_movements WHERE product_id = $1 LIMIT 1', [
      productId,
    ]);
    return rows.length > 0;
  },

  async findByReference(
    db: Queryable,
    referenceType: string,
    referenceId: string,
  ): Promise<InventoryMovementRow[]> {
    const { rows } = await db.query<InventoryMovementRow>(
      'SELECT * FROM inventory_movements WHERE reference_type = $1 AND reference_id = $2',
      [referenceType, referenceId],
    );
    return rows;
  },

  async list(
    db: Queryable,
    filters: MovementFilters,
  ): Promise<{ items: MovementListRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.productId) {
      params.push(filters.productId);
      conditions.push(`im.product_id = $${params.length}`);
    }
    if (filters.type) {
      params.push(filters.type);
      conditions.push(`im.type = $${params.length}`);
    }
    if (filters.from) {
      params.push(filters.from);
      conditions.push(`im.created_at >= $${params.length}`);
    }
    if (filters.to) {
      params.push(filters.to);
      conditions.push(`im.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: countRows } = await db.query<{ count: string }>(
      `SELECT COUNT(*) FROM inventory_movements im ${where}`,
      params,
    );
    const total = Number(countRows[0]?.count ?? 0);

    const limitIndex = params.length + 1;
    const offsetIndex = params.length + 2;
    const { rows } = await db.query<MovementListRow>(
      `SELECT im.*, p.name AS product_name, p.sku, u.name AS created_by_name
       FROM inventory_movements im
       JOIN products p ON p.id = im.product_id
       LEFT JOIN users u ON u.id = im.created_by
       ${where}
       ORDER BY im.created_at DESC
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      [...params, filters.limit, offsetFor(filters.page, filters.limit)],
    );

    return { items: rows, total };
  },
};
