import { MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

export type Allocation = {
  batchId: Id<"batches">;
  batchNumber: string;
  quantity: number;
  unitCost: number;
};

/** Active batches for a product, oldest first (FIFO order). Bounded read. */
export async function activeBatchesOldestFirst(
  ctx: MutationCtx,
  productId: Id<"products">,
): Promise<Doc<"batches">[]> {
  return await ctx.db
    .query("batches")
    .withIndex("by_product_active", (q) =>
      q.eq("productId", productId).eq("isActive", true),
    )
    .order("asc")
    // Safety cap: a single product is not expected to exceed 500 concurrently-active
    // batches. If that assumption ever changes (e.g. very high-frequency small receipts),
    // this must be replaced with a paginated loop to avoid silently truncating FIFO order.
    .take(500);
}

/** Recompute and persist products.stockQty as the sum of active batch remainders. */
export async function recomputeStockQty(
  ctx: MutationCtx,
  productId: Id<"products">,
): Promise<number> {
  const batches = await activeBatchesOldestFirst(ctx, productId);
  const total = batches.reduce((n, b) => n + b.qtyRemaining, 0);
  await ctx.db.patch("products", productId, { stockQty: total });
  return total;
}

/**
 * Allocate `quantity` from a product's batches oldest-first. Patches batch
 * remainders, deactivates depleted batches, writes one ledger row per batch
 * touched, and updates products.stockQty. Throws (writing nothing the caller
 * cannot roll back) when active stock is insufficient.
 */
export async function allocateFifo(
  ctx: MutationCtx,
  productId: Id<"products">,
  quantity: number,
  ledgerType: "sale" | "adjustment",
  refs: { saleId?: Id<"sales">; userId: Id<"users">; reason?: string },
): Promise<Allocation[]> {
  if (quantity <= 0) throw new Error("Quantity must be positive");
  const product = await ctx.db.get("products", productId);
  if (!product) throw new Error("Product not found");

  const batches = await activeBatchesOldestFirst(ctx, productId);
  const available = batches.reduce((n, b) => n + b.qtyRemaining, 0);
  if (available < quantity) {
    throw new Error(`Insufficient stock for ${product.name}`);
  }

  const allocations: Allocation[] = [];
  let needed = quantity;
  let runningStock = available;

  for (const batch of batches) {
    if (needed <= 0) break;
    const take = Math.min(batch.qtyRemaining, needed);
    if (take <= 0) continue;
    const newRemaining = batch.qtyRemaining - take;
    await ctx.db.patch("batches", batch._id, {
      qtyRemaining: newRemaining,
      isActive: newRemaining > 0,
    });
    needed -= take;
    runningStock -= take;
    await ctx.db.insert("inventoryLedger", {
      productId,
      type: ledgerType,
      quantityDelta: -take,
      balanceAfter: runningStock,
      batchId: batch._id,
      saleId: refs.saleId,
      reason: refs.reason,
      userId: refs.userId,
    });
    allocations.push({
      batchId: batch._id,
      batchNumber: batch.batchNumber,
      quantity: take,
      unitCost: batch.unitCost,
    });
  }

  await ctx.db.patch("products", productId, { stockQty: runningStock });
  return allocations;
}

/** Weighted-average unit cost across an allocation set. */
export function weightedAvgCost(allocations: Allocation[]): number {
  const qty = allocations.reduce((n, a) => n + a.quantity, 0);
  if (qty === 0) return 0;
  const cost = allocations.reduce((n, a) => n + a.unitCost * a.quantity, 0);
  return cost / qty;
}
