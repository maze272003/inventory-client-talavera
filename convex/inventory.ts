import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { requireRole } from "./lib/auth";
import { recordAudit } from "./lib/audit";
import { allocateFifo, recomputeStockQty } from "./lib/fifo";
import { nextBatchNumber } from "./lib/batch";
import { Id } from "./_generated/dataModel";

export const stockIn = mutation({
  args: {
    productId: v.id("products"),
    quantity: v.number(),
    unitCost: v.optional(v.number()),
    targetBatchId: v.optional(v.id("batches")),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, "admin");
    if (args.quantity <= 0) throw new Error("Quantity must be positive");
    const product = await ctx.db.get("products", args.productId);
    if (!product) throw new Error("Product not found");
    const unitCost = args.unitCost ?? product.costPrice;

    let batchId: Id<"batches">;
    if (args.targetBatchId) {
      const batch = await ctx.db.get("batches", args.targetBatchId);
      if (!batch || batch.productId !== args.productId) {
        throw new Error("Batch not found for this product");
      }
      await ctx.db.patch("batches", batch._id, {
        qtyReceived: batch.qtyReceived + args.quantity,
        qtyRemaining: batch.qtyRemaining + args.quantity,
        isActive: true,
      });
      batchId = batch._id;
    } else {
      batchId = await ctx.db.insert("batches", {
        productId: args.productId,
        batchNumber: await nextBatchNumber(ctx, Date.now()),
        qtyReceived: args.quantity,
        qtyRemaining: args.quantity,
        unitCost,
        source: "stock_in",
        isActive: true,
      });
    }

    const balanceAfter = await recomputeStockQty(ctx, args.productId);
    await ctx.db.insert("inventoryLedger", {
      productId: args.productId,
      type: "stock_in",
      quantityDelta: args.quantity,
      balanceAfter,
      unitCost,
      batchId,
      userId,
    });
    await recordAudit(ctx, {
      entityTable: "products",
      entityId: args.productId,
      action: "stock_in",
      summary: `Stocked in ${args.quantity} of ${product.name}`,
      before: { stockQty: product.stockQty },
      after: { stockQty: balanceAfter },
      undoable: false,
      userId,
    });
  },
});

export const adjust = mutation({
  args: {
    productId: v.id("products"),
    newQuantity: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, "admin");
    if (args.newQuantity < 0) throw new Error("Quantity cannot be negative");
    const product = await ctx.db.get("products", args.productId);
    if (!product) throw new Error("Product not found");
    const delta = args.newQuantity - product.stockQty;

    let actualStockQty: number = product.stockQty;
    if (delta < 0) {
      await allocateFifo(ctx, args.productId, -delta, "adjustment", { userId, reason: args.reason });
      // allocateFifo patches stockQty; recompute to get the authoritative post-mutation value.
      actualStockQty = await recomputeStockQty(ctx, args.productId);
    } else if (delta > 0) {
      const batchId = await ctx.db.insert("batches", {
        productId: args.productId,
        batchNumber: await nextBatchNumber(ctx, Date.now()),
        qtyReceived: delta,
        qtyRemaining: delta,
        unitCost: product.costPrice,
        source: "adjustment",
        isActive: true,
      });
      actualStockQty = await recomputeStockQty(ctx, args.productId);
      await ctx.db.insert("inventoryLedger", {
        productId: args.productId,
        type: "adjustment",
        quantityDelta: delta,
        balanceAfter: actualStockQty,
        reason: args.reason,
        batchId,
        userId,
      });
    }
    // delta === 0 → no-op stock change; actualStockQty stays as product.stockQty.

    await recordAudit(ctx, {
      entityTable: "products",
      entityId: args.productId,
      action: "adjustment",
      summary: `Adjusted ${product.name} to ${args.newQuantity} (${args.reason})`,
      before: { stockQty: product.stockQty },
      after: { stockQty: actualStockQty },
      undoable: false,
      userId,
    });
  },
});

export const ledgerForProduct = query({
  args: {
    productId: v.id("products"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    return await ctx.db
      .query("inventoryLedger")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
