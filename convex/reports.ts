import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireRole } from "./lib/auth";
import { Id } from "./_generated/dataModel";

export const salesSummary = query({
  args: { startMs: v.number(), endMs: v.number() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_creation_time", (q) =>
        q.gte("_creationTime", args.startMs).lte("_creationTime", args.endMs),
      )
      .take(5000);
    let revenue = 0, profit = 0, unitsSold = 0;
    for (const sale of sales) {
      revenue += sale.total;
      const items = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .take(200);
      for (const it of items) {
        profit += (it.unitSellPrice - it.unitCostPrice) * it.quantity;
        unitsSold += it.quantity;
      }
    }
    return { revenue, profit, unitsSold, saleCount: sales.length };
  },
});

export const topProducts = query({
  args: { startMs: v.number(), endMs: v.number(), limit: v.number() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_creation_time", (q) =>
        q.gte("_creationTime", args.startMs).lte("_creationTime", args.endMs),
      )
      .take(5000);
    const agg = new Map<string, { productId: string; name: string; unitsSold: number; revenue: number }>();
    for (const sale of sales) {
      const items = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .take(200);
      for (const it of items) {
        const key = it.productId;
        const cur = agg.get(key) ?? { productId: key, name: it.nameSnapshot, unitsSold: 0, revenue: 0 };
        cur.unitsSold += it.quantity;
        cur.revenue += it.lineTotal;
        agg.set(key, cur);
      }
    }
    return [...agg.values()].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, args.limit);
  },
});

export const cashierPerformance = query({
  args: { startMs: v.number(), endMs: v.number() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_creation_time", (q) =>
        q.gte("_creationTime", args.startMs).lte("_creationTime", args.endMs),
      )
      .take(5000);

    type Agg = { cashierId: string; saleCount: number; revenue: number; profit: number; units: number };
    const agg = new Map<string, Agg>();
    for (const sale of sales) {
      const cur = agg.get(sale.cashierId) ?? {
        cashierId: sale.cashierId, saleCount: 0, revenue: 0, profit: 0, units: 0,
      };
      cur.saleCount += 1;
      cur.revenue += sale.total;
      const items = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .take(200);
      for (const it of items) {
        cur.profit += (it.unitSellPrice - it.unitCostPrice) * it.quantity;
        cur.units += it.quantity;
      }
      agg.set(sale.cashierId, cur);
    }

    const rows = await Promise.all(
      [...agg.values()].map(async (a) => {
        const profile = await ctx.db
          .query("userProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", a.cashierId as Id<"users">))
          .unique();
        const user = await ctx.db.get("users", a.cashierId as Id<"users">);
        return { ...a, name: profile?.name ?? "Unknown", email: profile?.email ?? user?.email ?? null };
      }),
    );
    return rows.sort((x, y) => y.revenue - x.revenue);
  },
});
