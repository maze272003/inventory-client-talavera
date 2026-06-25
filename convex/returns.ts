import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { requireRole } from "./lib/auth";
import { recordAudit } from "./lib/audit";
import { recomputeStockQty } from "./lib/fifo";
import {
  computeRestorable,
  distributeProportionally,
  lineRefundFor,
  round2,
  type SaleItemBatchRow,
  type BatchIncrement,
} from "./lib/returns";

/**
 * Process a return (refund) against a single non-archived sale. Admin-only.
 * Restocks the original batches proportionally, writes immutable `returns` +
 * `returnItems` rows, one positive `inventoryLedger` row per restocked batch
 * (with `returnId` set and `saleId` unset), recomputes `products.stockQty`
 * once per affected product, and records a single audit entry. No update or
 * delete API exists for returns — they are immutable once written.
 */
export const createReturn = mutation({
  args: {
    saleId: v.id("sales"),
    lines: v.array(
      v.object({ saleItemId: v.id("saleItems"), quantity: v.number() }),
    ),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, "admin");
    if (args.lines.length === 0) {
      throw new Error("Return must contain at least one line");
    }

    const sale = await ctx.db.get("sales", args.saleId);
    if (!sale) throw new Error("Sale not found");
    if (sale.isArchived === true) {
      throw new Error("Cannot return against an archived sale");
    }

    // Build a saleItemId → saleItem map for membership + lookup.
    const saleItemRows = await ctx.db
      .query("saleItems")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .take(500);
    const saleItemsMap = new Map<Id<"saleItems">, Doc<"saleItems">>();
    for (const si of saleItemRows) saleItemsMap.set(si._id, si);

    // Capture prior return count for this sale BEFORE inserting the new one
    // (used in the audit `before` snapshot).
    const priorReturnsRows = await ctx.db
      .query("returns")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .take(500);
    const priorReturnCount = priorReturnsRows.length;

    // Validate every line and gather per-batch increments.
    const work: Array<{ saleItem: Doc<"saleItems">; inc: BatchIncrement }> = [];
    for (const line of args.lines) {
      if (line.quantity < 1) {
        throw new Error("Quantity must be positive");
      }
      const saleItem = saleItemsMap.get(line.saleItemId);
      if (!saleItem) {
        throw new Error("Sale item does not belong to this sale");
      }

      const priorReturnItemRows = await ctx.db
        .query("returnItems")
        .withIndex("by_saleItem", (q) => q.eq("saleItemId", line.saleItemId))
        .take(500);
      const priorReturned = priorReturnItemRows.reduce(
        (s, r) => s + r.quantity,
        0,
      );
      const restorable = computeRestorable(saleItem.quantity, [priorReturned]);
      if (line.quantity > restorable) {
        throw new Error(
          `Maximum restorable quantity for this line is ${restorable}`,
        );
      }

      const batchLinkRows = await ctx.db
        .query("saleItemBatches")
        .withIndex("by_saleItem", (q) => q.eq("saleItemId", line.saleItemId))
        .take(500);
      const rows: SaleItemBatchRow[] = batchLinkRows.map((r) => ({
        batchId: r.batchId,
        batchNumber: r.batchNumberSnapshot,
        unitCost: r.unitCost,
        quantity: r.quantity,
      }));
      const increments = distributeProportionally(rows, line.quantity);
      for (const inc of increments) {
        work.push({ saleItem, inc });
      }
    }

    // Aggregate totals computed from input LINES (not per-batch increments)
    // so the per-line rounding matches the documented refund formula.
    let totalRefund = 0;
    let itemCount = 0;
    for (const line of args.lines) {
      const saleItem = saleItemsMap.get(line.saleItemId)!;
      totalRefund += lineRefundFor(saleItem.unitSellPrice, line.quantity);
      itemCount += line.quantity;
    }
    totalRefund = round2(totalRefund);
    const cashRefunded = totalRefund;

    // Insert the returns header first so its _id is available as a FK.
    const returnId = await ctx.db.insert("returns", {
      saleId: args.saleId,
      receiptNumber: sale.receiptNumber,
      totalRefund,
      itemCount,
      cashRefunded,
      processedBy: userId,
      reason: args.reason,
    });

    // Restock batches and write returnItems rows.
    const touchedProducts = new Set<Id<"products">>();
    for (const { saleItem, inc } of work) {
      const batch = await ctx.db.get("batches", inc.batchId);
      if (!batch) throw new Error("Batch not found");
      const newRemaining = batch.qtyRemaining + inc.quantity;
      await ctx.db.patch("batches", batch._id, {
        qtyRemaining: newRemaining,
        isActive: newRemaining > 0,
      });
      await ctx.db.insert("returnItems", {
        returnId,
        saleId: args.saleId,
        saleItemId: saleItem._id,
        productId: saleItem.productId,
        batchId: inc.batchId,
        batchNumberSnapshot: inc.batchNumber,
        nameSnapshot: saleItem.nameSnapshot,
        skuSnapshot: saleItem.skuSnapshot,
        unitSellPrice: saleItem.unitSellPrice,
        unitCostPrice: inc.unitCost,
        quantity: inc.quantity,
        lineRefund: lineRefundFor(saleItem.unitSellPrice, inc.quantity),
      });
      touchedProducts.add(saleItem.productId);
    }

    // Recompute products.stockQty once per affected product, then write one
    // ledger row per restocked batch carrying the product's post-return balance.
    const balanceByProduct = new Map<Id<"products">, number>();
    for (const productId of touchedProducts) {
      balanceByProduct.set(productId, await recomputeStockQty(ctx, productId));
    }
    for (const { saleItem, inc } of work) {
      await ctx.db.insert("inventoryLedger", {
        productId: saleItem.productId,
        type: "return",
        quantityDelta: inc.quantity,
        balanceAfter: balanceByProduct.get(saleItem.productId)!,
        unitCost: inc.unitCost,
        batchId: inc.batchId,
        returnId,
        userId,
      });
    }

    await recordAudit(ctx, {
      entityTable: "sales",
      entityId: args.saleId,
      action: "return",
      summary: `Return for receipt #${sale.receiptNumber} (refund ${totalRefund})`,
      before: { priorReturnCount },
      after: { returnId, totalRefund, itemCount },
      undoable: false,
      userId,
    });

    return { returnId, totalRefund, cashRefunded, itemCount };
  },
});

/** Admin-only fetch of a single return with its line items. */
export const getReturn = query({
  args: { returnId: v.id("returns") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const ret = await ctx.db.get("returns", args.returnId);
    if (!ret) return null;
    const items = await ctx.db
      .query("returnItems")
      .withIndex("by_return", (q) => q.eq("returnId", args.returnId))
      .take(500);
    return { return: ret, items };
  },
});

/** Admin-only list of all returns for a sale, oldest-first, each with items. */
export const listForSale = query({
  args: { saleId: v.id("sales") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const returns = await ctx.db
      .query("returns")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .order("asc")
      .collect();
    return await Promise.all(
      returns.map(async (ret) => {
        const items = await ctx.db
          .query("returnItems")
          .withIndex("by_return", (q) => q.eq("returnId", ret._id))
          .take(500);
        return { ...ret, items };
      }),
    );
  },
});

/** Admin-only bounded scan of returns in a period, enriched with items + processor name. */
export const byPeriod = query({
  args: { startMs: v.number(), endMs: v.number() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const returns = await ctx.db
      .query("returns")
      .withIndex("by_creation_time", (q) =>
        q.gte("_creationTime", args.startMs).lte("_creationTime", args.endMs),
      )
      .take(5000);
    return await Promise.all(
      returns.map(async (ret) => {
        const items = await ctx.db
          .query("returnItems")
          .withIndex("by_return", (q) => q.eq("returnId", ret._id))
          .take(500);
        const profile = await ctx.db
          .query("userProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", ret.processedBy))
          .unique();
        return { ...ret, items, processedByName: profile?.name ?? "Unknown" };
      }),
    );
  },
});
