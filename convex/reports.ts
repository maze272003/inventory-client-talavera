import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { requireRole } from "./lib/auth";
import { Id } from "./_generated/dataModel";
import {
  bucketStartForTs,
  enumerateBuckets,
  bucketLabel,
  type Granularity,
} from "./lib/buckets";

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

const MAX_SALES = 5000;

const granularityValidator = v.union(
  v.literal("hour"),
  v.literal("day"),
  v.literal("week"),
  v.literal("month"),
);

type RangeTotals = { revenue: number; profit: number; units: number; transactions: number };

// Totals only (used for the previous-period growth deltas).
async function rangeTotals(
  ctx: QueryCtx,
  startMs: number,
  endMs: number,
): Promise<RangeTotals> {
  const sales = await ctx.db
    .query("sales")
    .withIndex("by_creation_time", (q) =>
      q.gte("_creationTime", startMs).lte("_creationTime", endMs),
    )
    .take(MAX_SALES);
  let revenue = 0, profit = 0, units = 0, transactions = 0;
  for (const sale of sales) {
    if (sale.isArchived === true) continue;
    revenue += sale.total;
    transactions += 1;
    const items = await ctx.db
      .query("saleItems")
      .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
      .take(200);
    for (const it of items) {
      profit += (it.unitSellPrice - it.unitCostPrice) * it.quantity;
      units += it.quantity;
    }
  }
  return { revenue, profit, units, transactions };
}

export const dashboardAnalytics = query({
  args: {
    startMs: v.number(),
    endMs: v.number(),
    granularity: granularityValidator,
    tzOffsetMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const tz = args.tzOffsetMinutes;
    const gran = args.granularity as Granularity;

    const raw = await ctx.db
      .query("sales")
      .withIndex("by_creation_time", (q) =>
        q.gte("_creationTime", args.startMs).lte("_creationTime", args.endMs),
      )
      .take(MAX_SALES + 1);
    const truncated = raw.length > MAX_SALES;
    const sales = truncated ? raw.slice(0, MAX_SALES) : raw;

    type Bucket = {
      bucketStart: number; label: string;
      revenue: number; profit: number; units: number; transactions: number; marginPct: number;
    };
    const buckets = new Map<number, Bucket>();
    for (const bs of enumerateBuckets(args.startMs, args.endMs, gran, tz)) {
      buckets.set(bs, {
        bucketStart: bs, label: bucketLabel(bs, gran, tz),
        revenue: 0, profit: 0, units: 0, transactions: 0, marginPct: 0,
      });
    }

    const productAgg = new Map<string, { productId: string; name: string; units: number; revenue: number }>();
    const categoryAgg = new Map<string, { category: string; revenue: number; units: number }>();
    const categoryCache = new Map<string, string>();

    let revenue = 0, profit = 0, units = 0, transactions = 0;
    for (const sale of sales) {
      if (sale.isArchived === true) continue;
      transactions += 1;
      revenue += sale.total;
      const bucket = buckets.get(bucketStartForTs(sale._creationTime, gran, tz));
      if (bucket) { bucket.revenue += sale.total; bucket.transactions += 1; }

      const items = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .take(200);
      for (const it of items) {
        const lineProfit = (it.unitSellPrice - it.unitCostPrice) * it.quantity;
        profit += lineProfit;
        units += it.quantity;
        if (bucket) { bucket.profit += lineProfit; bucket.units += it.quantity; }

        const prod = productAgg.get(it.productId) ?? { productId: it.productId, name: it.nameSnapshot, units: 0, revenue: 0 };
        prod.units += it.quantity;
        prod.revenue += it.lineTotal;
        productAgg.set(it.productId, prod);

        let cat = categoryCache.get(it.productId);
        if (cat === undefined) {
          const p = await ctx.db.get("products", it.productId as Id<"products">);
          cat = p?.category ?? "Uncategorized";
          categoryCache.set(it.productId, cat);
        }
        const c = categoryAgg.get(cat) ?? { category: cat, revenue: 0, units: 0 };
        c.revenue += it.lineTotal;
        c.units += it.quantity;
        categoryAgg.set(cat, c);
      }
    }

    for (const b of buckets.values()) b.marginPct = b.revenue > 0 ? b.profit / b.revenue : 0;

    const span = args.endMs - args.startMs;
    const prev = await rangeTotals(ctx, args.startMs - span, args.startMs);
    const kpi = (value: number, previous: number) => ({
      value, previous, deltaPct: previous === 0 ? null : (value - previous) / previous,
    });

    return {
      kpis: {
        revenue: kpi(revenue, prev.revenue),
        profit: kpi(profit, prev.profit),
        units: kpi(units, prev.units),
        transactions: kpi(transactions, prev.transactions),
      },
      timeseries: [...buckets.values()].sort((a, b) => a.bucketStart - b.bucketStart),
      topProducts: [...productAgg.values()].sort((a, b) => b.units - a.units).slice(0, 10),
      categoryBreakdown: [...categoryAgg.values()].sort((a, b) => b.revenue - a.revenue),
      granularity: gran,
      truncated,
    };
  },
});

export const cashFlow = query({
  args: {
    startMs: v.number(),
    endMs: v.number(),
    granularity: granularityValidator,
    tzOffsetMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const tz = args.tzOffsetMinutes;
    const gran = args.granularity as Granularity;

    const rawSales = await ctx.db
      .query("sales")
      .withIndex("by_creation_time", (q) =>
        q.gte("_creationTime", args.startMs).lte("_creationTime", args.endMs),
      )
      .take(MAX_SALES + 1);
    const truncated = rawSales.length > MAX_SALES;
    const sales = truncated ? rawSales.slice(0, MAX_SALES) : rawSales;

    // purchases have no purchaseDate index; scan (low volume) and narrow in memory.
    const allPurchases = await ctx.db.query("purchases").take(MAX_SALES + 1);
    const purchases = allPurchases.filter(
      (p) => p.isArchived !== true && p.purchaseDate >= args.startMs && p.purchaseDate <= args.endMs,
    );

    type Bucket = { bucketStart: number; label: string; revenue: number; spend: number };
    const buckets = new Map<number, Bucket>();
    for (const bs of enumerateBuckets(args.startMs, args.endMs, gran, tz)) {
      buckets.set(bs, { bucketStart: bs, label: bucketLabel(bs, gran, tz), revenue: 0, spend: 0 });
    }

    let totalRevenue = 0, totalSpend = 0;
    for (const sale of sales) {
      if (sale.isArchived === true) continue;
      totalRevenue += sale.total;
      const b = buckets.get(bucketStartForTs(sale._creationTime, gran, tz));
      if (b) b.revenue += sale.total;
    }
    for (const p of purchases) {
      totalSpend += p.total;
      const b = buckets.get(bucketStartForTs(p.purchaseDate, gran, tz));
      if (b) b.spend += p.total;
    }

    return {
      buckets: [...buckets.values()].sort((a, b) => a.bucketStart - b.bucketStart),
      totals: { revenue: totalRevenue, spend: totalSpend },
      truncated,
    };
  },
});
