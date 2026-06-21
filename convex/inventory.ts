import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { requireRole } from "./lib/auth";

export const stockIn = mutation({
  args: {
    productId: v.id("products"),
    quantity: v.number(),
    unitCost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, "admin");
    if (args.quantity <= 0) throw new Error("Quantity must be positive");
    const product = await ctx.db.get("products", args.productId);
    if (!product) throw new Error("Product not found");
    const balanceAfter = product.stockQty + args.quantity;
    await ctx.db.patch("products", args.productId, { stockQty: balanceAfter });
    await ctx.db.insert("inventoryLedger", {
      productId: args.productId,
      type: "stock_in",
      quantityDelta: args.quantity,
      balanceAfter,
      unitCost: args.unitCost ?? product.costPrice,
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
    await ctx.db.patch("products", args.productId, { stockQty: args.newQuantity });
    await ctx.db.insert("inventoryLedger", {
      productId: args.productId,
      type: "adjustment",
      quantityDelta: delta,
      balanceAfter: args.newQuantity,
      reason: args.reason,
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
