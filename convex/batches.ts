import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";

export const listForProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const batches = await ctx.db
      .query("batches")
      .withIndex("by_product_active", (q) =>
        q.eq("productId", args.productId).eq("isActive", true),
      )
      .order("asc")
      .take(500);
    return batches.map((b) => ({
      _id: b._id,
      batchNumber: b.batchNumber,
      qtyRemaining: b.qtyRemaining,
      unitCost: b.unitCost,
      _creationTime: b._creationTime,
    }));
  },
});

export const findByBatchNumber = query({
  args: { batchNumber: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const batch = await ctx.db
      .query("batches")
      .withIndex("by_batchNumber", (q) => q.eq("batchNumber", args.batchNumber))
      .first();
    if (!batch) return null;
    const product = await ctx.db.get("products", batch.productId);
    if (!product) return null;
    const imageUrl = product.imageId
      ? await ctx.storage.getUrl(product.imageId)
      : null;
    return { product: { ...product, imageUrl }, batch };
  },
});
