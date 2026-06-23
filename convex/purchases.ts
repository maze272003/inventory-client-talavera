import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { Doc } from "./_generated/dataModel";
import { requireRole } from "./lib/auth";
import { recordAudit } from "./lib/audit";

const lineValidator = v.object({
  existingProductId: v.optional(v.id("products")),
  newProduct: v.optional(
    v.object({
      name: v.string(),
      model: v.optional(v.string()),
      category: v.string(),
      sellPrice: v.number(),
    }),
  ),
  quantity: v.number(),
  unitCost: v.number(),
});

export const createPurchase = mutation({
  args: {
    fileId: v.id("_storage"),
    supplierName: v.string(),
    supplierAddress: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    purchaseDate: v.number(),
    lines: v.array(lineValidator),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, "admin");
    if (args.lines.length === 0) throw new Error("No line items");

    let total = 0;
    let itemCount = 0;
    let productsCreated = 0;

    // First insert the purchase header so ledger rows can reference it.
    const purchaseId = await ctx.db.insert("purchases", {
      supplierName: args.supplierName,
      supplierAddress: args.supplierAddress,
      referenceNumber: args.referenceNumber,
      purchaseDate: args.purchaseDate,
      fileId: args.fileId,
      total: 0,
      itemCount: 0,
      userId,
      isArchived: false,
    });

    for (const line of args.lines) {
      if (line.quantity <= 0) throw new Error("Quantity must be positive");
      if (!line.existingProductId === !line.newProduct) {
        throw new Error("Each line needs exactly one of existingProductId or newProduct");
      }

      let productId = line.existingProductId ?? null;
      if (line.newProduct) {
        const np = line.newProduct;
        productId = await ctx.db.insert("products", {
          name: np.name,
          sku: "",
          category: np.category,
          model: np.model,
          costPrice: line.unitCost,
          sellPrice: np.sellPrice,
          stockQty: 0,
          reorderThreshold: 0,
          isActive: true,
        });
        productsCreated++;
      }

      const product = await ctx.db.get("products", productId!);
      if (!product) throw new Error("Product not found");
      const balanceAfter = product.stockQty + line.quantity;
      await ctx.db.patch("products", product._id, { stockQty: balanceAfter });
      await ctx.db.insert("inventoryLedger", {
        productId: product._id,
        type: "stock_in",
        quantityDelta: line.quantity,
        balanceAfter,
        unitCost: line.unitCost,
        purchaseId,
        userId,
      });
      total += line.unitCost * line.quantity;
      itemCount += line.quantity;
    }

    await ctx.db.patch("purchases", purchaseId, { total, itemCount });
    await recordAudit(ctx, {
      entityTable: "purchases",
      entityId: purchaseId,
      action: "create",
      summary: `Recorded purchase from ${args.supplierName}`,
      after: { total, itemCount, supplierName: args.supplierName },
      undoable: false,
      userId,
    });
    return { purchaseId, productsCreated, linesImported: args.lines.length, total };
  },
});

export const archive = mutation({
  args: { id: v.id("purchases") },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, "admin");
    const purchase = await ctx.db.get("purchases", args.id);
    if (!purchase) throw new Error("Purchase not found");
    await ctx.db.patch("purchases", args.id, { isArchived: true });
    await recordAudit(ctx, {
      entityTable: "purchases",
      entityId: args.id,
      action: "archive",
      summary: `Archived purchase from ${purchase.supplierName}`,
      before: { isArchived: purchase.isArchived ?? false },
      after: { isArchived: true },
      undoable: true,
      userId,
    });
  },
});

export const restore = mutation({
  args: { id: v.id("purchases") },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, "admin");
    const purchase = await ctx.db.get("purchases", args.id);
    if (!purchase) throw new Error("Purchase not found");
    await ctx.db.patch("purchases", args.id, { isArchived: false });
    await recordAudit(ctx, {
      entityTable: "purchases",
      entityId: args.id,
      action: "restore",
      summary: `Restored purchase from ${purchase.supplierName}`,
      before: { isArchived: purchase.isArchived ?? false },
      after: { isArchived: false },
      undoable: true,
      userId,
    });
  },
});

async function withFileUrl(ctx: QueryCtx, purchase: Doc<"purchases">) {
  const fileUrl = await ctx.storage.getUrl(purchase.fileId);
  return { ...purchase, fileUrl };
}

export const getPurchase = query({
  args: { purchaseId: v.id("purchases") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const purchase = await ctx.db.get("purchases", args.purchaseId);
    if (!purchase) return null;
    const ledgerRows = await ctx.db
      .query("inventoryLedger")
      .withIndex("by_purchase", (q) => q.eq("purchaseId", args.purchaseId))
      .take(1000);
    return {
      purchase,
      fileUrl: await ctx.storage.getUrl(purchase.fileId),
      ledgerRows,
    };
  },
});

export const listPurchases = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const result = await ctx.db
      .query("purchases")
      .withIndex("by_archived", (q) => q.eq("isArchived", false))
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...result, page: await Promise.all(result.page.map((p) => withFileUrl(ctx, p))) };
  },
});

export const listArchivedPurchases = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const result = await ctx.db
      .query("purchases")
      .withIndex("by_archived", (q) => q.eq("isArchived", true))
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...result, page: await Promise.all(result.page.map((p) => withFileUrl(ctx, p))) };
  },
});
