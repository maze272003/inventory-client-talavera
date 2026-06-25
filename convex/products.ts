import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { requireRole, requireUser } from "./lib/auth";
import { Doc, Id } from "./_generated/dataModel";
import { recordAudit } from "./lib/audit";
import { nextBatchNumber } from "./lib/batch";

async function withImageUrl(ctx: QueryCtx, product: Doc<"products">) {
  const imageUrl = product.imageId ? await ctx.storage.getUrl(product.imageId) : null;
  return { ...product, imageUrl };
}

async function withBatchSummary(ctx: QueryCtx, product: Doc<"products">) {
  const active = await ctx.db
    .query("batches")
    .withIndex("by_product_active", (q) => q.eq("productId", product._id).eq("isActive", true))
    .order("asc")
    .take(500);
  const imageUrl = product.imageId ? await ctx.storage.getUrl(product.imageId) : null;
  return {
    ...product,
    imageUrl,
    activeBatchCount: active.length,
    nextBatchNumber: active[0]?.batchNumber ?? null,
  };
}

function passesStockFilter(p: Doc<"products">, f: string | undefined): boolean {
  switch (f) {
    case "inStock": return p.stockQty > 0;
    case "out": return p.stockQty <= 0;
    case "low": return p.stockQty > 0 && p.stockQty <= p.reorderThreshold;
    default: return true; // "all" / undefined
  }
}

/** Normalize a barcode: trimmed, empty → undefined (treated as "no barcode"). */
function normalizeBarcode(barcode: string | undefined): string | undefined {
  const v = barcode?.trim();
  return v ? v : undefined;
}

/**
 * Enforce product identity uniqueness (SKU always; barcode when non-empty).
 * Guarantees the "one product = one SKU = one barcode" invariant at the source,
 * which is what prevents duplicate product records. `exceptId` excludes the
 * product being edited during an update.
 */
async function assertIdentityAvailable(
  ctx: QueryCtx,
  args: { sku: string; barcode?: string; exceptId?: Id<"products"> },
): Promise<void> {
  const sku = args.sku.trim();
  if (sku) {
    const skuConflict = await ctx.db
      .query("products")
      .withIndex("by_sku", (q) => q.eq("sku", sku))
      .first();
    if (skuConflict && skuConflict._id !== args.exceptId) {
      throw new Error(`A product with SKU "${sku}" already exists`);
    }
  }
  const barcode = normalizeBarcode(args.barcode);
  if (barcode) {
    const bcConflict = await ctx.db
      .query("products")
      .withIndex("by_barcode", (q) => q.eq("barcode", barcode))
      .first();
    if (bcConflict && bcConflict._id !== args.exceptId) {
      throw new Error(`A product with barcode "${barcode}" already exists`);
    }
  }
}

export const create = mutation({
  args: {
    name: v.string(),
    sku: v.string(),
    barcode: v.optional(v.string()),
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
    await assertIdentityAvailable(ctx, { sku: args.sku, barcode: args.barcode });
    const batchNumber = await nextBatchNumber(ctx, Date.now());
    const barcode = normalizeBarcode(args.barcode);
    const productDoc = { ...args, barcode, isActive: true, batchNumber };
    const id = await ctx.db.insert("products", productDoc);
    if (args.stockQty > 0) {
      const batchId = await ctx.db.insert("batches", {
        productId: id,
        batchNumber,
        qtyReceived: args.stockQty,
        qtyRemaining: args.stockQty,
        unitCost: args.costPrice,
        source: "opening",
        receivedDate: Date.now(),
        isActive: true,
      });
      await ctx.db.insert("inventoryLedger", {
        productId: id,
        type: "stock_in",
        quantityDelta: args.stockQty,
        balanceAfter: args.stockQty,
        unitCost: args.costPrice,
        reason: "Opening balance",
        batchId,
        userId,
      });
    }
    const after = await ctx.db.get("products", id);
    await recordAudit(ctx, {
      entityTable: "products",
      entityId: id,
      action: "create",
      summary: `Created product ${args.name} (batch ${batchNumber})`,
      after,
      undoable: true,
      userId,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("products"),
    name: v.string(),
    sku: v.string(),
    barcode: v.optional(v.string()),
    category: v.string(),
    model: v.optional(v.string()),
    imageId: v.optional(v.id("_storage")),
    costPrice: v.number(),
    sellPrice: v.number(),
    reorderThreshold: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, "admin");
    const { id, ...fields } = args;
    const existing = await ctx.db.get("products", id);
    if (!existing) throw new Error("Product not found");
    await assertIdentityAvailable(ctx, {
      sku: args.sku,
      barcode: args.barcode,
      exceptId: id,
    });
    // Normalize barcode the same way create does so equality holds.
    const barcode = normalizeBarcode(args.barcode);
    // Snapshot only the mutable fields so an undo can patch them back exactly.
    const before = {
      name: existing.name,
      sku: existing.sku,
      barcode: existing.barcode,
      category: existing.category,
      model: existing.model,
      imageId: existing.imageId,
      costPrice: existing.costPrice,
      sellPrice: existing.sellPrice,
      reorderThreshold: existing.reorderThreshold,
    };
    // batchNumber is immutable: intentionally omitted so it is preserved.
    await ctx.db.patch("products", id, { ...fields, barcode });
    await recordAudit(ctx, {
      entityTable: "products",
      entityId: id,
      action: "update",
      summary: `Updated product ${fields.name}`,
      before,
      after: { ...fields, barcode },
      undoable: true,
      userId,
    });
  },
});

export const setActive = mutation({
  args: { id: v.id("products"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, "admin");
    const existing = await ctx.db.get("products", args.id);
    if (!existing) throw new Error("Product not found");
    await ctx.db.patch("products", args.id, { isActive: args.isActive });
    await recordAudit(ctx, {
      entityTable: "products",
      entityId: args.id,
      action: args.isActive ? "restore" : "archive",
      summary: `${args.isActive ? "Restored" : "Archived"} product ${existing.name}`,
      before: { isActive: existing.isActive },
      after: { isActive: args.isActive },
      undoable: true,
      userId,
    });
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    category: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
    stockFilter: v.optional(
      v.union(v.literal("all"), v.literal("inStock"), v.literal("low"), v.literal("out")),
    ),
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
      // No compound index on (category, isActive); when activeOnly is set the
      // search/by_active branches cover the indexed cases. Here we read the
      // category page and drop inactive rows in memory.
      result = await ctx.db
        .query("products")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .order("desc")
        .paginate(args.paginationOpts);
      if (args.activeOnly) {
        result = { ...result, page: result.page.filter((p) => p.isActive) };
      }
    } else if (args.activeOnly) {
      result = await ctx.db
        .query("products")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      result = await ctx.db.query("products").order("desc").paginate(args.paginationOpts);
    }
    const enriched = await Promise.all(result.page.map((p) => withBatchSummary(ctx, p)));
    return { ...result, page: enriched.filter((p) => passesStockFilter(p, args.stockFilter)) };
  },
});

export const listArchived = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const result = await ctx.db
      .query("products")
      .withIndex("by_active", (q) => q.eq("isActive", false))
      .order("desc")
      .paginate(args.paginationOpts);
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

export const getByBarcode = query({
  args: { barcode: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const code = args.barcode.trim();
    if (!code) return null;
    const product = await ctx.db
      .query("products")
      .withIndex("by_barcode", (q) => q.eq("barcode", code))
      .first();
    return product ? await withImageUrl(ctx, product) : null;
  },
});

/**
 * Primary POS scan lookup. Resolves a scanned/code string to a single product by
 * checking barcode first (the primary scan identifier), then SKU. Returns null
 * when neither matches — the caller then falls back to batch-number / name search.
 * This is what makes barcode scanning work without asking the cashier to pick a batch.
 */
export const getByIdentity = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const code = args.code.trim();
    if (!code) return null;
    const byBarcode = await ctx.db
      .query("products")
      .withIndex("by_barcode", (q) => q.eq("barcode", code))
      .first();
    const product =
      byBarcode ??
      (await ctx.db
        .query("products")
        .withIndex("by_sku", (q) => q.eq("sku", code))
        .first());
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

export const categories = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const active = await ctx.db
      .query("products")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .take(1000);
    return [...new Set(active.map((p) => p.category))].sort();
  },
});
