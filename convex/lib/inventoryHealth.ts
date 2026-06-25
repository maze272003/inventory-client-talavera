/**
 * Pure derived-metric helpers for inventory health. No `ctx` dependency —
 * every function takes plain arrays/values and returns plain values, so the
 * math is unit-testable without standing up Convex. Mirrors the `lib/fifo.ts`
 * pattern: the Convex query layer is a thin "fetch + delegate + shape" shell.
 *
 * IDs are typed as `string` (Convex `Id<"...">` brands are assignable to
 * `string` at the call site) to keep these helpers runtime-agnostic.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const DEFAULT_VELOCITY_WINDOW_DAYS = 30;
export const DEFAULT_TARGET_STOCK_DAYS = 30;
export const STOCKOUT_WARNING_HORIZON_DAYS = 14;

export const DEFAULT_AGING_BANDS = { d30: 30, d90: 90, d180: 180 } as const;
export type AgingBands = { d30: number; d90: number; d180: number };
export type AgingBandKey = "30" | "90" | "180";

// ---------------------------------------------------------------------------
// Velocity
// ---------------------------------------------------------------------------

export type VelocityLine = { productId: string; quantity: number; ts: number };

/**
 * Units sold per day for each product, over the supplied lookback window.
 * Computed as `sum(quantity in window) / windowDays` — dividing by the full
 * window (not elapsed time) is intentional: it smooths lumpy, intermittent
 * demand typical of motor parts and yields a conservative days-to-stockout.
 */
export function computeVelocity(
  lines: VelocityLine[],
  windowDays: number,
  nowMs: number,
): Record<string, number> {
  const window = Math.max(1, windowDays);
  const cutoff = nowMs - window * MS_PER_DAY;
  const totals: Record<string, number> = {};
  for (const l of lines) {
    if (l.ts < cutoff) continue;
    if (l.quantity <= 0) continue;
    totals[l.productId] = (totals[l.productId] ?? 0) + l.quantity;
  }
  const out: Record<string, number> = {};
  for (const [pid, units] of Object.entries(totals)) {
    out[pid] = units / window;
  }
  return out;
}

/**
 * Projected days until stock hits zero. Returns `null` when velocity is zero
 * or negative (infinite / non-depleting).
 */
export function daysToStockout(
  stockQty: number,
  velocityPerDay: number,
): number | null {
  if (velocityPerDay <= 0) return null;
  const effective = Math.max(0, stockQty);
  return effective / velocityPerDay;
}

// ---------------------------------------------------------------------------
// Dead stock / aging
// ---------------------------------------------------------------------------

export type BatchAgingInput = {
  batchId: string;
  productId: string;
  batchNumber: string;
  qtyRemaining: number;
  unitCost: number;
  /** Timestamp of the most recent inventoryLedger row touching this batch. */
  lastMovementMs: number;
};

export type DeadStockRow = {
  batchId: string;
  productId: string;
  batchNumber: string;
  qtyRemaining: number;
  unitCost: number;
  cashValue: number;
  lastMovementMs: number;
  daysSinceMovement: number;
  band: AgingBandKey;
};

/**
 * Classify batches into aging bands based on time since last ledger movement
 * (NOT batch creation — a batch received long ago that sold recently is alive).
 * A batch lands in the SMALLEST band whose threshold it exceeds.
 */
export function classifyAging(
  batches: BatchAgingInput[],
  nowMs: number,
  bands: AgingBands = DEFAULT_AGING_BANDS,
): DeadStockRow[] {
  const dead: DeadStockRow[] = [];
  for (const b of batches) {
    if (b.qtyRemaining <= 0) continue;
    const daysSince = Math.max(0, (nowMs - b.lastMovementMs) / MS_PER_DAY);
    let band: AgingBandKey | null = null;
    if (daysSince >= bands.d180) band = "180";
    else if (daysSince >= bands.d90) band = "90";
    else if (daysSince >= bands.d30) band = "30";
    if (band === null) continue;
    dead.push({
      batchId: b.batchId,
      productId: b.productId,
      batchNumber: b.batchNumber,
      qtyRemaining: b.qtyRemaining,
      unitCost: b.unitCost,
      cashValue: b.qtyRemaining * b.unitCost,
      lastMovementMs: b.lastMovementMs,
      daysSinceMovement: daysSince,
      band,
    });
  }
  // Oldest first within each band — biggest cash sink surfaces first.
  dead.sort((a, b) => b.daysSinceMovement - a.daysSinceMovement);
  return dead;
}

// ---------------------------------------------------------------------------
// Valuation
// ---------------------------------------------------------------------------

export type ValuationBatch = {
  productId: string;
  qtyRemaining: number;
  unitCost: number;
};

export type ProductCostLookup = {
  sellPrice: number;
  category: string;
};

export type ValuationResult = {
  totalCostValue: number;
  totalRetailValue: number;
  byCategory: { category: string; costValue: number }[];
};

/**
 * On-hand valuation at recorded batch cost (cash tied up) and at retail
 * (potential revenue). The two are reported separately and never conflated —
 * cost basis answers "how much cash is sunk"; retail overstates recoverable
 * value for slow movers.
 */
export function computeValuation(
  batches: ValuationBatch[],
  productsById: Record<string, ProductCostLookup>,
): ValuationResult {
  let totalCostValue = 0;
  let totalRetailValue = 0;
  const byCat = new Map<string, number>();
  for (const b of batches) {
    if (b.qtyRemaining <= 0) continue;
    const costValue = b.qtyRemaining * b.unitCost;
    totalCostValue += costValue;
    const product = productsById[b.productId];
    if (product) {
      totalRetailValue += b.qtyRemaining * product.sellPrice;
      const cat = product.category ?? "Uncategorized";
      byCat.set(cat, (byCat.get(cat) ?? 0) + costValue);
    } else {
      byCat.set("Uncategorized", (byCat.get("Uncategorized") ?? 0) + costValue);
    }
  }
  const byCategory = [...byCat.entries()]
    .map(([category, costValue]) => ({ category, costValue }))
    .sort((a, b) => b.costValue - a.costValue);
  return { totalCostValue, totalRetailValue, byCategory };
}

// ---------------------------------------------------------------------------
// Reorder suggestion
// ---------------------------------------------------------------------------

export type ReorderInput = {
  stockQty: number;
  threshold: number;
  velocityPerDay: number;
  targetDays: number;
};

/**
 * Suggested reorder quantity. Uses the larger of:
 *   - velocity-based: `velocity × targetDays − stockQty` (forward cover)
 *   - threshold floor: `reorderThreshold − stockQty` (handles zero-velocity
 *     SKUs that are still below the owner-set threshold)
 * Never negative.
 */
export function suggestReorder(args: ReorderInput): number {
  const velocityBased = Math.max(
    0,
    args.velocityPerDay * args.targetDays - Math.max(0, args.stockQty),
  );
  const thresholdFloor = Math.max(0, args.threshold - args.stockQty);
  return Math.max(velocityBased, thresholdFloor);
}
