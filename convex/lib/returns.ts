import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

const MAX_RETURNS = 5000;

/** Round to 2 decimal places, fixing float drift (e.g. 0.1 + 0.2). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Restorable quantity for a sale item given its original sold quantity and the
 * quantities already returned across all prior returns. Clamped at 0 (never
 * negative). Pure — no ctx, no IO.
 */
export function computeRestorable(
  originalQty: number,
  priorReturnQtys: number[],
): number {
  if (originalQty <= 0) return 0;
  const priorSum = priorReturnQtys.reduce((s, q) => s + Math.max(0, q), 0);
  return Math.max(0, Math.floor(originalQty) - Math.floor(priorSum));
}

export type SaleItemBatchRow = {
  batchId: Id<"batches">;
  batchNumber: string;
  unitCost: number;
  /** Units of this batch consumed by the original sale item. */
  quantity: number;
};

export type BatchIncrement = {
  batchId: Id<"batches">;
  batchNumber: string;
  unitCost: number;
  /** Whole units to restore to this batch. */
  quantity: number;
};

/**
 * Distribute `returnQty` whole units across the batches that originally
 * supplied a sale item, in proportion to each batch's contribution. Uses
 * largest-remainder rounding so the per-batch quantities are whole numbers
 * that sum to exactly `returnQty`.
 *
 * Pure — no ctx, no IO.
 */
export function distributeProportionally(
  saleItemBatchRows: SaleItemBatchRow[],
  returnQty: number,
): BatchIncrement[] {
  if (returnQty <= 0) return [];
  if (saleItemBatchRows.length === 0) return [];

  const totalOriginal = saleItemBatchRows.reduce(
    (s, r) => s + r.quantity,
    0,
  );
  if (totalOriginal <= 0) return [];

  // Trivial fast path: a single batch absorbs everything.
  if (saleItemBatchRows.length === 1) {
    return [{ ...saleItemBatchRows[0], quantity: returnQty }];
  }

  // Largest-remainder apportionment.
  // 1. Compute the exact (float) share per batch.
  // 2. Take the floor of each.
  // 3. Distribute the leftover whole units to the batches with the largest
  //    fractional remainder, breaking ties by larger original contribution.
  const shares = saleItemBatchRows.map((r) => {
    const exact = (r.quantity / totalOriginal) * returnQty;
    return { row: r, exact, floor: Math.floor(exact), rem: exact - Math.floor(exact) };
  });

  const allocated = shares.reduce((s, x) => s + x.floor, 0);
  let leftover = returnQty - allocated;

  // Sort: largest remainder first; tie-break: larger original contribution.
  const order = [...shares].sort((a, b) => {
    if (b.rem !== a.rem) return b.rem - a.rem;
    return b.row.quantity - a.row.quantity;
  });
  for (const s of order) {
    if (leftover <= 0) break;
    s.floor += 1;
    leftover -= 1;
  }

  return shares
    .map((s) => ({
      batchId: s.row.batchId,
      batchNumber: s.row.batchNumber,
      unitCost: s.row.unitCost,
      quantity: s.floor,
    }))
    .filter((x) => x.quantity > 0);
}

/**
 * Refund amount for a single return line. Uses the *sale-time* sell price
 * snapshot (not the current product price) and rounds to 2dp to kill float
 * drift. Pure.
 */
export function lineRefundFor(
  saleItemUnitSellPrice: number,
  returnQty: number,
): number {
  return round2(saleItemUnitSellPrice * returnQty);
}

// ---------------------------------------------------------------------------
// Report helper — net-of-returns pre-pass for sales reports
// ---------------------------------------------------------------------------

export type ReturnsInPeriod = {
  /** returnId → aggregate */
  bySale: Map<
    Id<"sales">,
    {
      refundTotal: number;
      costTotal: number;
      itemCount: number;
      cashierId: Id<"users">;
      bySaleItem: Map<Id<"saleItems">, { qty: number; refund: number }>;
      byProduct: Map<Id<"products">, { qty: number; refund: number; cost: number }>;
    }
  >;
  /** Flat totals across the whole period. */
  totals: {
    refundTotal: number;
    costTotal: number;
    itemCount: number;
    byProduct: Map<Id<"products">, { qty: number; refund: number; cost: number }>;
    byCashier: Map<Id<"users">, { qty: number; refund: number; cost: number }>;
  };
  truncated: boolean;
};

/**
 * Bounded scan of all `returns` whose `_creationTime` falls in [startMs, endMs],
 * joined to `returnItems` and the parent `sales` row (for the original
 * cashier). Returns aggregate maps suitable for netting out the sales reports.
 *
 * This is the shared pre-pass every net-of-returns report uses; it must stay
 * non-throwing on truncation (the caller surfaces `truncated`).
 */
export async function loadReturnsInPeriod(
  ctx: QueryCtx,
  startMs: number,
  endMs: number,
): Promise<ReturnsInPeriod> {
  const raw = await ctx.db
    .query("returns")
    .withIndex("by_creation_time", (q) =>
      q.gte("_creationTime", startMs).lte("_creationTime", endMs),
    )
    .take(MAX_RETURNS + 1);
  const truncated = raw.length > MAX_RETURNS;
  const returns = truncated ? raw.slice(0, MAX_RETURNS) : raw;

  const bySale = new Map<
    Id<"sales">,
    {
      refundTotal: number;
      costTotal: number;
      itemCount: number;
      cashierId: Id<"users">;
      bySaleItem: Map<Id<"saleItems">, { qty: number; refund: number }>;
      byProduct: Map<Id<"products">, { qty: number; refund: number; cost: number }>;
    }
  >();

  const totalsByProduct = new Map<
    Id<"products">,
    { qty: number; refund: number; cost: number }
  >();
  const totalsByCashier = new Map<
    Id<"users">,
    { qty: number; refund: number; cost: number }
  >();
  let refundTotal = 0;
  let costTotal = 0;
  let itemCount = 0;

  for (const ret of returns) {
    const sale = await ctx.db.get("sales", ret.saleId);
    // If the parent sale is gone (shouldn't happen, but be defensive), skip.
    const cashierId = sale?.cashierId as Id<"users"> | undefined;
    const items = await ctx.db
      .query("returnItems")
      .withIndex("by_return", (q) => q.eq("returnId", ret._id))
      .take(500);

    let saleRefund = 0;
    let saleCost = 0;
    const saleItemMap = new Map<Id<"saleItems">, { qty: number; refund: number }>();
    const productMap = new Map<
      Id<"products">,
      { qty: number; refund: number; cost: number }
    >();

    for (const it of items) {
      saleRefund += it.lineRefund;
      saleCost += it.unitCostPrice * it.quantity;

      const si = saleItemMap.get(it.saleItemId) ?? { qty: 0, refund: 0 };
      si.qty += it.quantity;
      si.refund += it.lineRefund;
      saleItemMap.set(it.saleItemId, si);

      const pm = productMap.get(it.productId) ?? { qty: 0, refund: 0, cost: 0 };
      pm.qty += it.quantity;
      pm.refund += it.lineRefund;
      pm.cost += it.unitCostPrice * it.quantity;
      productMap.set(it.productId, pm);

      const tp = totalsByProduct.get(it.productId) ?? { qty: 0, refund: 0, cost: 0 };
      tp.qty += it.quantity;
      tp.refund += it.lineRefund;
      tp.cost += it.unitCostPrice * it.quantity;
      totalsByProduct.set(it.productId, tp);

      if (cashierId) {
        const tc = totalsByCashier.get(cashierId) ?? { qty: 0, refund: 0, cost: 0 };
        tc.qty += it.quantity;
        tc.refund += it.lineRefund;
        tc.cost += it.unitCostPrice * it.quantity;
        totalsByCashier.set(cashierId, tc);
      }
    }

    if (cashierId) {
      bySale.set(ret.saleId, {
        refundTotal: saleRefund,
        costTotal: saleCost,
        itemCount: ret.itemCount,
        cashierId,
        bySaleItem: saleItemMap,
        byProduct: productMap,
      });
    }

    refundTotal += saleRefund;
    costTotal += saleCost;
    itemCount += ret.itemCount;
  }

  return {
    bySale,
    totals: {
      refundTotal,
      costTotal,
      itemCount,
      byProduct: totalsByProduct,
      byCashier: totalsByCashier,
    },
    truncated,
  };
}
