import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { nextBatchNumber } from "./lib/batch";

const BATCH_SIZE = 100;

export const backfillBatches = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const userId = (await ctx.db.query("users").first())?._id;
    const page = await ctx.db
      .query("products")
      .paginate({ numItems: BATCH_SIZE, cursor: args.cursor });

    for (const product of page.page) {
      if (product.stockQty <= 0) continue;
      const existing = await ctx.db
        .query("batches")
        .withIndex("by_product", (q) => q.eq("productId", product._id))
        .first();
      if (existing) continue; // idempotent
      const batchNumber = product.batchNumber ?? (await nextBatchNumber(ctx, Date.now()));
      const batchId = await ctx.db.insert("batches", {
        productId: product._id,
        batchNumber,
        qtyReceived: product.stockQty,
        qtyRemaining: product.stockQty,
        unitCost: product.costPrice,
        source: "migration",
        isActive: true,
      });
      if (userId) {
        await ctx.db.insert("inventoryLedger", {
          productId: product._id,
          type: "stock_in",
          quantityDelta: product.stockQty,
          balanceAfter: product.stockQty,
          unitCost: product.costPrice,
          reason: "Batch backfill migration",
          batchId,
          userId,
        });
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillBatches, {
        cursor: page.continueCursor,
      });
    }
  },
});

/**
 * Idempotently backfill `receivedDate` on batches that predate the field.
 * Sets receivedDate = _creationTime so the FIFO-by-receivedDate index is
 * deterministic for legacy rows (otherwise missing values cluster first).
 * Batches that already have a receivedDate are left untouched.
 */
export const backfillBatchReceivedDates = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("batches")
      .paginate({ numItems: BATCH_SIZE, cursor: args.cursor });

    for (const batch of page.page) {
      if (batch.receivedDate !== undefined) continue;
      await ctx.db.patch("batches", batch._id, {
        receivedDate: batch._creationTime,
      });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.backfillBatchReceivedDates,
        { cursor: page.continueCursor },
      );
    }
  },
});
