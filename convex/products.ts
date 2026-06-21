import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { requireRole, requireUser } from "./lib/auth";

export const create = mutation({
  args: {
    name: v.string(),
    sku: v.string(),
    category: v.string(),
    costPrice: v.number(),
    sellPrice: v.number(),
    stockQty: v.number(),
    reorderThreshold: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, "admin");
    const id = await ctx.db.insert("products", { ...args, isActive: true });
    if (args.stockQty > 0) {
      await ctx.db.insert("inventoryLedger", {
        productId: id,
        type: "stock_in",
        quantityDelta: args.stockQty,
        balanceAfter: args.stockQty,
        unitCost: args.costPrice,
        reason: "Opening balance",
        userId,
      });
    }
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("products"),
    name: v.optional(v.string()),
    sku: v.optional(v.string()),
    category: v.optional(v.string()),
    costPrice: v.optional(v.number()),
    sellPrice: v.optional(v.number()),
    reorderThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const { id, ...fields } = args;
    await ctx.db.patch("products", id, fields);
  },
});

export const setActive = mutation({
  args: { id: v.id("products"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    await ctx.db.patch("products", args.id, { isActive: args.isActive });
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    category: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    if (args.search && args.search.trim() !== "") {
      return await ctx.db
        .query("products")
        .withSearchIndex("search_name", (q) =>
          args.activeOnly
            ? q.search("name", args.search!).eq("isActive", true)
            : q.search("name", args.search!),
        )
        .paginate(args.paginationOpts);
    }
    if (args.category) {
      return await ctx.db
        .query("products")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .order("desc")
        .paginate(args.paginationOpts);
    }
    return await ctx.db.query("products").order("desc").paginate(args.paginationOpts);
  },
});

export const getBySku = query({
  args: { sku: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("products")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .unique();
  },
});

export const lowStock = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const active = await ctx.db
      .query("products")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .take(500);
    return active.filter((p) => p.stockQty <= p.reorderThreshold);
  },
});
