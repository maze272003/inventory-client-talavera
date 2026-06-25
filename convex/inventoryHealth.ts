import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { requireRole } from "./lib/auth";
import {
  classifyAging,
  computeValuation,
  computeVelocity,
  daysToStockout,
  suggestReorder,
  DEFAULT_TARGET_STOCK_DAYS,
  DEFAULT_VELOCITY_WINDOW_DAYS,
  STOCKOUT_WARNING_HORIZON_DAYS,
  type AgingBandKey,
} from "./lib/inventoryHealth";

const DAY_MS = 24 * 60 * 60 * 1000;

// Bounding caps consistent with the rest of the codebase (5000 sales, 500
// batches per product in lib/fifo.ts). If any is hit, `truncated` flips true.
const MAX_PRODUCTS = 2000;
const MAX_SALES = 5000;
const MAX_LEDGER_LOOKBACK = 5000;

/** Active batches for a product, oldest first. Read-only QueryCtx equivalent
 *  of lib/fifo.ts:activeBatchesOldestFirst (which is typed MutationCtx because
 *  it lives beside write helpers). Same 500-cap safety bound. */
async function activeBatchesForProduct(
  ctx: QueryCtx,
  productId: Id<"products">,
): Promise<Doc<"batches">[]> {
  return await ctx.db
    .query("batches")
    .withIndex("by_product_active", (q) => q.eq("productId", productId).eq("isActive", true))
    .order("asc")
    .take(500);
}

export type StockoutRiskRow = {
  productId: Id<"products">;
  name: string;
  sku: string;
  category: string;
  stockQty: number;
  reorderThreshold: number;
  velocityPerDay: number;
  daysToStockout: number | null;
};

export type DeadStockRow = {
  batchId: Id<"batches">;
  productId: Id<"products">;
  productName: string;
  batchNumber: string;
  qtyRemaining: number;
  unitCost: number;
  cashValue: number;
  lastMovementMs: number;
  daysSinceMovement: number;
  band: AgingBandKey;
};

export type ValuationByCategory = { category: string; costValue: number };

export type ReorderSuggestionRow = {
  productId: Id<"products">;
  name: string;
  sku: string;
  suggestedReorderQty: number;
  currentStockQty: number;
  lastSupplierName: string | null;
  lastUnitCost: number | null;
};

export type SnapshotResult = {
  stockoutRisk: StockoutRiskRow[];
  deadStock: DeadStockRow[];
  valuation: {
    totalCostValue: number;
    totalRetailValue: number;
    byCategory: ValuationByCategory[];
  };
  reorderSuggestions: ReorderSuggestionRow[];
  truncated: boolean;
};

export type SummaryResult = {
  stockoutCount: number;
  deadStockValue: number;
  truncated: boolean;
};

/**
 * Lightweight headline-only projection for the dashboard card. Cheaper than
 * `snapshot`: skips the sales-velocity scan, reorder/purchase lookups, and
 * per-category valuation breakdown. Dead-stock value still requires the
 * per-batch last-movement lookup (the irreducible cost of aging).
 */
export const summary = query({
  args: { nowMs: v.number() },
  handler: async (ctx, args): Promise<SummaryResult> => {
    await requireRole(ctx, "admin");
    const nowMs = args.nowMs;

    const productsRaw = await ctx.db
      .query("products")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .take(MAX_PRODUCTS + 1);
    let truncated = productsRaw.length > MAX_PRODUCTS;
    const products = truncated ? productsRaw.slice(0, MAX_PRODUCTS) : productsRaw;

    let stockoutCount = 0;
    for (const p of products) {
      if (p.stockQty <= p.reorderThreshold) stockoutCount += 1;
    }

    const perProductBatches = await Promise.all(
      products.map((p) => activeBatchesForProduct(ctx, p._id)),
    );
    if (perProductBatches.some((bs) => bs.length >= 500)) truncated = true;

    const agingInput = [];
    let ledgerLookback = 0;
    for (let i = 0; i < products.length; i++) {
      for (const batch of perProductBatches[i]) {
        const last = await ctx.db
          .query("inventoryLedger")
          .withIndex("by_batch", (q) => q.eq("batchId", batch._id))
          .order("desc")
          .take(1);
        ledgerLookback += 1;
        agingInput.push({
          batchId: batch._id,
          productId: batch.productId,
          batchNumber: batch.batchNumber,
          qtyRemaining: batch.qtyRemaining,
          unitCost: batch.unitCost,
          lastMovementMs: last.length > 0 ? last[0]._creationTime : batch._creationTime,
        });
      }
    }
    if (ledgerLookback >= MAX_LEDGER_LOOKBACK) truncated = true;

    const dead = classifyAging(agingInput, nowMs);
    const deadStockValue = dead.reduce((s, d) => s + d.cashValue, 0);

    return { stockoutCount, deadStockValue, truncated };
  },
});

export const snapshot = query({
  args: {
    nowMs: v.number(),
    velocityWindowDays: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<SnapshotResult> => {
    await requireRole(ctx, "admin");
    const nowMs = args.nowMs;
    const windowDays = args.velocityWindowDays ?? DEFAULT_VELOCITY_WINDOW_DAYS;

    // --- 1. Active products (bounded) ------------------------------------
    const productsRaw = await ctx.db
      .query("products")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .take(MAX_PRODUCTS + 1);
    let truncated = productsRaw.length > MAX_PRODUCTS;
    const products = truncated ? productsRaw.slice(0, MAX_PRODUCTS) : productsRaw;

    // --- 2. Active batches per product + last ledger movement per batch --
    const perProductBatches = await Promise.all(
      products.map((p) => activeBatchesForProduct(ctx, p._id)),
    );
    if (perProductBatches.some((bs) => bs.length >= 500)) truncated = true;

    type BatchRef = {
      batch: Doc<"batches">;
      product: Doc<"products">;
    };
    const allActiveBatches: BatchRef[] = [];
    for (let i = 0; i < products.length; i++) {
      for (const b of perProductBatches[i]) allActiveBatches.push({ batch: b, product: products[i] });
    }

    // Last movement per batch = most recent inventoryLedger row for that batch.
    const lastMovementByBatch = new Map<Id<"batches">, number>();
    let ledgerLookback = 0;
    for (const { batch } of allActiveBatches) {
      const last = await ctx.db
        .query("inventoryLedger")
        .withIndex("by_batch", (q) => q.eq("batchId", batch._id))
        .order("desc")
        .take(1);
      ledgerLookback += 1;
      if (last.length > 0) lastMovementByBatch.set(batch._id, last[0]._creationTime);
    }
    if (ledgerLookback >= MAX_LEDGER_LOOKBACK) truncated = true;

    // --- 3. Velocity: sales in window → saleItems → lines ----------------
    const windowStart = nowMs - windowDays * DAY_MS;
    const salesRaw = await ctx.db
      .query("sales")
      .withIndex("by_creation_time", (q) =>
        q.gte("_creationTime", windowStart).lte("_creationTime", nowMs),
      )
      .take(MAX_SALES + 1);
    if (salesRaw.length > MAX_SALES) truncated = true;
    const windowSales = truncated && salesRaw.length > MAX_SALES
      ? salesRaw.slice(0, MAX_SALES)
      : salesRaw.filter((s) => s.isArchived !== true);

    const velocityLines: { productId: Id<"products">; quantity: number; ts: number }[] = [];
    for (const sale of windowSales) {
      const items = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .take(200);
      for (const it of items) {
        velocityLines.push({ productId: it.productId, quantity: it.quantity, ts: sale._creationTime });
      }
    }
    const velocity = computeVelocity(velocityLines, windowDays, nowMs);

    // --- 4. Valuation (delegated) ----------------------------------------
    const productsById: Record<string, { sellPrice: number; category: string }> = {};
    for (const p of products) productsById[p._id] = { sellPrice: p.sellPrice, category: p.category };
    const valuation = computeValuation(
      allActiveBatches.map(({ batch }) => ({
        productId: batch.productId,
        qtyRemaining: batch.qtyRemaining,
        unitCost: batch.unitCost,
      })),
      productsById,
    );

    // --- 5. Dead stock (delegated) ---------------------------------------
    const agingInput = allActiveBatches.map(({ batch }) => ({
      batchId: batch._id,
      productId: batch.productId,
      batchNumber: batch.batchNumber,
      qtyRemaining: batch.qtyRemaining,
      unitCost: batch.unitCost,
      lastMovementMs: lastMovementByBatch.get(batch._id) ?? batch._creationTime,
    }));
    const deadRaw = classifyAging(agingInput, nowMs);
    const productById = new Map(products.map((p) => [p._id, p]));
    const deadStock: DeadStockRow[] = deadRaw.map((d) => ({
      ...d,
      productId: d.productId as Id<"products">,
      batchId: d.batchId as Id<"batches">,
      productName: productById.get(d.productId as Id<"products">)?.name ?? "—",
    }));

    // --- 6. Stockout risk -------------------------------------------------
    const stockoutRisk: StockoutRiskRow[] = [];
    for (const p of products) {
      const v = velocity[p._id] ?? 0;
      const dts = daysToStockout(p.stockQty, v);
      const atThreshold = p.stockQty <= p.reorderThreshold;
      const horizonRisk = dts !== null && dts <= STOCKOUT_WARNING_HORIZON_DAYS;
      if (!atThreshold && !horizonRisk) continue;
      stockoutRisk.push({
        productId: p._id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        stockQty: p.stockQty,
        reorderThreshold: p.reorderThreshold,
        velocityPerDay: v,
        daysToStockout: dts,
      });
    }
    // Most urgent first: stocked-out (lowest stock) then lowest days-to-stockout.
    stockoutRisk.sort((a, b) => {
      const ad = a.daysToStockout ?? Infinity;
      const bd = b.daysToStockout ?? Infinity;
      if (ad !== bd) return ad - bd;
      return a.stockQty - b.stockQty;
    });

    // --- 7. Reorder suggestions (stockout-risk products only) -----------
    // For each such product, find the most recent purchase-linked batch for
    // supplier + unit cost. Limited to active batches gathered above.
    const riskIds = new Set(stockoutRisk.map((r) => r.productId));
    const suggestions: ReorderSuggestionRow[] = [];
    for (const p of products) {
      if (!riskIds.has(p._id)) continue;
      const v = velocity[p._id] ?? 0;
      const qty = suggestReorder({
        stockQty: p.stockQty,
        threshold: p.reorderThreshold,
        velocityPerDay: v,
        targetDays: DEFAULT_TARGET_STOCK_DAYS,
      });
      // Last supplier/cost from the most recent purchase among active batches.
      let bestDate = -1;
      let lastSupplierName: string | null = null;
      let lastUnitCost: number | null = null;
      const refs = perProductBatches.find((bs, i) => products[i]._id === p._id) ?? [];
      const withPurchase = refs.filter((b) => b.purchaseId);
      for (const b of withPurchase) {
        const purchase = b.purchaseId ? await ctx.db.get("purchases", b.purchaseId) : null;
        if (purchase && purchase.purchaseDate > bestDate) {
          bestDate = purchase.purchaseDate;
          lastSupplierName = purchase.supplierName;
          lastUnitCost = b.unitCost;
        }
      }
      if (lastUnitCost === null && refs.length > 0) {
        // Fall back to the newest active batch's cost when no purchase link.
        lastUnitCost = refs[refs.length - 1].unitCost;
      }
      suggestions.push({
        productId: p._id,
        name: p.name,
        sku: p.sku,
        suggestedReorderQty: qty,
        currentStockQty: p.stockQty,
        lastSupplierName,
        lastUnitCost,
      });
      suggestions.sort((a, b) => b.suggestedReorderQty - a.suggestedReorderQty);
    }

    return {
      stockoutRisk,
      deadStock,
      valuation,
      reorderSuggestions: suggestions,
      truncated,
    };
  },
});
