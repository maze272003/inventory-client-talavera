import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { paginationOptsValidator, PaginationResult } from "convex/server";
import { requireUser, requireRole } from "./lib/auth";
import { recordAudit } from "./lib/audit";
import { allocateFifo, weightedAvgCost } from "./lib/fifo";

async function nextReceiptNumber(ctx: MutationCtx): Promise<number> {
  const counter = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", "receiptNumber"))
    .unique();
  if (!counter) {
    await ctx.db.insert("counters", { name: "receiptNumber", value: 1 });
    return 1;
  }
  const next = counter.value + 1;
  await ctx.db.patch("counters", counter._id, { value: next });
  return next;
}

export const createSale = mutation({
  args: {
    items: v.array(v.object({ productId: v.id("products"), quantity: v.number() })),
    cashTendered: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    if (args.items.length === 0) throw new Error("Cart is empty");

    const merged = new Map<Id<"products">, number>();
    for (const item of args.items) {
      if (item.quantity <= 0) throw new Error("Quantity must be positive");
      merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
    }

    // Validate availability and price up front (FIFO walk happens after the
    // sale header exists so ledger rows can carry saleId).
    const lines: Array<{ product: Doc<"products">; quantity: number; lineTotal: number }> = [];
    let total = 0;
    for (const [productId, quantity] of merged.entries()) {
      const product = await ctx.db.get("products", productId);
      if (!product || !product.isActive) throw new Error("Product unavailable");
      if (product.stockQty < quantity) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }
      const lineTotal = product.sellPrice * quantity;
      total += lineTotal;
      lines.push({ product, quantity, lineTotal });
    }

    if (args.cashTendered < total) throw new Error("Insufficient cash tendered");
    const changeGiven = args.cashTendered - total;
    const receiptNumber = await nextReceiptNumber(ctx);

    const saleId = await ctx.db.insert("sales", {
      receiptNumber,
      total,
      itemCount: lines.reduce((n, l) => n + l.quantity, 0),
      cashTendered: args.cashTendered,
      changeGiven,
      cashierId: userId,
      isArchived: false,
    });

    for (const l of lines) {
      // FIFO allocation: patches batches, writes ledger rows, updates stockQty.
      const allocations = await allocateFifo(ctx, l.product._id, l.quantity, "sale", {
        saleId,
        userId,
      });
      const unitCostPrice = weightedAvgCost(allocations);
      const saleItemId = await ctx.db.insert("saleItems", {
        saleId,
        productId: l.product._id,
        nameSnapshot: l.product.name,
        skuSnapshot: l.product.sku,
        unitSellPrice: l.product.sellPrice,
        unitCostPrice,
        quantity: l.quantity,
        lineTotal: l.lineTotal,
      });
      for (const a of allocations) {
        await ctx.db.insert("saleItemBatches", {
          saleItemId,
          saleId,
          batchId: a.batchId,
          batchNumberSnapshot: a.batchNumber,
          quantity: a.quantity,
          unitCost: a.unitCost,
        });
      }
    }

    await recordAudit(ctx, {
      entityTable: "sales",
      entityId: saleId,
      action: "sale",
      summary: `Sale receipt #${receiptNumber} (total ${total})`,
      after: { receiptNumber, total },
      undoable: false,
      userId,
    });

    return { saleId, receiptNumber, total, changeGiven };
  },
});

export const archive = mutation({
  args: { saleId: v.id("sales") },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, "admin");
    const sale = await ctx.db.get("sales", args.saleId);
    if (!sale) throw new Error("Sale not found");
    await ctx.db.patch("sales", args.saleId, { isArchived: true });
    await recordAudit(ctx, {
      entityTable: "sales",
      entityId: args.saleId,
      action: "archive",
      summary: `Archived sale receipt #${sale.receiptNumber}`,
      before: { isArchived: sale.isArchived ?? false },
      after: { isArchived: true },
      undoable: false,
      userId,
    });
  },
});

export const restore = mutation({
  args: { saleId: v.id("sales") },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, "admin");
    const sale = await ctx.db.get("sales", args.saleId);
    if (!sale) throw new Error("Sale not found");
    await ctx.db.patch("sales", args.saleId, { isArchived: false });
    await recordAudit(ctx, {
      entityTable: "sales",
      entityId: args.saleId,
      action: "restore",
      summary: `Restored sale receipt #${sale.receiptNumber}`,
      before: { isArchived: sale.isArchived ?? false },
      after: { isArchived: false },
      undoable: false,
      userId,
    });
  },
});

export const getSale = query({
  args: { saleId: v.id("sales") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const sale = await ctx.db.get("sales", args.saleId);
    if (!sale) return null;
    const items = await ctx.db
      .query("saleItems")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .take(200);
    const itemsWithImages = await Promise.all(
      items.map(async (it) => {
        const product = await ctx.db.get("products", it.productId);
        const imageUrl =
          product?.imageId ? await ctx.storage.getUrl(product.imageId) : null;
        return { ...it, imageUrl };
      })
    );
    const cashierProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", sale.cashierId))
      .unique();
    const cashierUser = await ctx.db.get("users", sale.cashierId);
    const cashier = {
      name: cashierProfile?.name ?? "Unknown",
      email: cashierProfile?.email ?? cashierUser?.email ?? null,
    };
    const breakdownRows = await ctx.db
      .query("saleItemBatches")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .take(1000);
    const batchBreakdown: Record<string, { batchNumber: string; quantity: number }[]> = {};
    for (const r of breakdownRows) {
      (batchBreakdown[r.saleItemId] ??= []).push({
        batchNumber: r.batchNumberSnapshot,
        quantity: r.quantity,
      });
    }
    return { sale, items: itemsWithImages, cashier, batchBreakdown };
  },
});

export const listReceipts = query({
  args: {
    paginationOpts: paginationOptsValidator,
    receiptNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);

    async function enrichPage(result: PaginationResult<Doc<"sales">>) {
      const page = await Promise.all(
        result.page.map(async (sale) => {
          const profile = await ctx.db
            .query("userProfiles")
            .withIndex("by_userId", (q) => q.eq("userId", sale.cashierId))
            .unique();
          return { ...sale, cashierName: profile?.name ?? "Unknown" };
        })
      );
      return { ...result, page };
    }

    if (args.receiptNumber !== undefined) {
      // receiptNumber is unique; there is no compound index with isArchived,
      // so read the matching page and drop any archived row in memory.
      const result = await ctx.db
        .query("sales")
        .withIndex("by_receiptNumber", (q) => q.eq("receiptNumber", args.receiptNumber!))
        .paginate(args.paginationOpts);
      const filtered = {
        ...result,
        page: result.page.filter((s) => s.isArchived !== true),
      };
      return enrichPage(filtered);
    }
    const result = await ctx.db
      .query("sales")
      .withIndex("by_archived", (q) => q.eq("isArchived", false))
      .order("desc")
      .paginate(args.paginationOpts);
    return enrichPage(result);
  },
});

export const listArchivedReceipts = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireUser(ctx);

    const result = await ctx.db
      .query("sales")
      .withIndex("by_archived", (q) => q.eq("isArchived", true))
      .order("desc")
      .paginate(args.paginationOpts);

    const page = await Promise.all(
      result.page.map(async (sale) => {
        const profile = await ctx.db
          .query("userProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", sale.cashierId))
          .unique();
        return { ...sale, cashierName: profile?.name ?? "Unknown" };
      }),
    );
    return { ...result, page };
  },
});
