import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { requireRole, requireUser } from "./lib/auth";
import { Doc } from "./_generated/dataModel";

async function withImageUrl(ctx: QueryCtx, product: Doc<"products">) {
  const imageUrl = product.imageId ? await ctx.storage.getUrl(product.imageId) : null;
  return { ...product, imageUrl };
}

export const create = mutation({
  args: {
    name: v.string(),
    sku: v.string(),
    category: v.string(),
    model: v.optional(v.string()),
    imageId: v.optional(v.id("_storage")),
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
    name: v.string(),
    sku: v.string(),
    category: v.string(),
    model: v.optional(v.string()),
    imageId: v.optional(v.id("_storage")),
    costPrice: v.number(),
    sellPrice: v.number(),
    reorderThreshold: v.number(),
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
    let result;
    if (args.search && args.search.trim() !== "") {
      result = await ctx.db
        .query("products")
        .withSearchIndex("search_name", (q) =>
          args.activeOnly
            ? q.search("name", args.search!).eq("isActive", true)
            : q.search("name", args.search!),
        )
        .paginate(args.paginationOpts);
    } else if (args.category) {
      result = await ctx.db
        .query("products")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      result = await ctx.db.query("products").order("desc").paginate(args.paginationOpts);
    }
    return { ...result, page: await Promise.all(result.page.map((p) => withImageUrl(ctx, p))) };
  },
});

export const getBySku = query({
  args: { sku: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const product = await ctx.db
      .query("products")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .unique();
    return product ? await withImageUrl(ctx, product) : null;
  },
});

export const get = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const product = await ctx.db.get("products", args.id);
    return product ? await withImageUrl(ctx, product) : null;
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
