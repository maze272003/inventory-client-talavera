/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seed(t: ReturnType<typeof convexTest>, role: "admin" | "cashier") {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email: `${role}@a.com` });
    await ctx.db.insert("userProfiles", { userId: id, name: role, role });
    return id;
  });
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

// Brief's primary test: revenue & profit over a sale
test("salesSummary sums revenue and profit", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await admin.mutation(api.products.create, {
    name: "Rice", sku: "r1", category: "Food",
    costPrice: 30, sellPrice: 50, stockQty: 100, reorderThreshold: 5,
  });
  await admin.mutation(api.sales.createSale, {
    items: [{ productId: pid, quantity: 4 }], cashTendered: 200,
  });
  const summary = await admin.query(api.reports.salesSummary, { startMs: 0, endMs: 1e15 });
  expect(summary.revenue).toEqual(200);
  expect(summary.profit).toEqual(80); // (50-30)*4
  expect(summary.unitsSold).toEqual(4);
  expect(summary.saleCount).toEqual(1);
});

// Extra (a): topProducts orders by unitsSold desc, respects limit, correct revenue per product
test("topProducts returns products ordered by unitsSold desc with correct revenue, respecting limit", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");

  const pidA = await admin.mutation(api.products.create, {
    name: "Apple", sku: "a1", category: "Fruit",
    costPrice: 5, sellPrice: 10, stockQty: 100, reorderThreshold: 5,
  });
  const pidB = await admin.mutation(api.products.create, {
    name: "Banana", sku: "b1", category: "Fruit",
    costPrice: 2, sellPrice: 4, stockQty: 100, reorderThreshold: 5,
  });

  // Apple: 2 units sold (revenue = 20)
  await admin.mutation(api.sales.createSale, {
    items: [{ productId: pidA, quantity: 2 }], cashTendered: 20,
  });
  // Banana: 5 units sold (revenue = 20)
  await admin.mutation(api.sales.createSale, {
    items: [{ productId: pidB, quantity: 5 }], cashTendered: 20,
  });

  const top = await admin.query(api.reports.topProducts, { startMs: 0, endMs: 1e15, limit: 10 });
  // Banana should come first (5 units > 2 units)
  expect(top).toHaveLength(2);
  expect(top[0].name).toEqual("Banana");
  expect(top[0].unitsSold).toEqual(5);
  expect(top[0].revenue).toEqual(20); // 4*5
  expect(top[1].name).toEqual("Apple");
  expect(top[1].unitsSold).toEqual(2);
  expect(top[1].revenue).toEqual(20); // 10*2

  // limit=1 returns only the top 1
  const top1 = await admin.query(api.reports.topProducts, { startMs: 0, endMs: 1e15, limit: 1 });
  expect(top1).toHaveLength(1);
  expect(top1[0].name).toEqual("Banana");
});

async function seedUser(t: ReturnType<typeof convexTest>, name: string, role: "admin" | "cashier") {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email: `${name}@a.com` });
    await ctx.db.insert("userProfiles", { userId: id, name, role, email: `${name}@a.com` });
    return id;
  });
  return { userId, as: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

test("cashierPerformance aggregates revenue, profit, units per cashier", async () => {
  const t = convexTest(schema, modules);
  const { as: admin } = await seedUser(t, "Boss", "admin");
  const { userId: cashierId, as: cashier } = await seedUser(t, "Cash", "cashier");
  const pid = await admin.mutation(api.products.create, {
    name: "Pop", sku: "P1", category: "Food", costPrice: 2, sellPrice: 5, stockQty: 100, reorderThreshold: 1,
  });
  await cashier.mutation(api.sales.createSale, { items: [{ productId: pid, quantity: 4 }], cashTendered: 100 });

  const rows = await admin.query(api.reports.cashierPerformance, { startMs: 0, endMs: Number.MAX_SAFE_INTEGER });
  const row = rows.find((r) => r.cashierId === cashierId)!;
  expect(row.name).toBe("Cash");
  expect(row.saleCount).toBe(1);
  expect(row.revenue).toBe(20); // 4 * 5
  expect(row.profit).toBe(12); // 4 * (5 - 2)
  expect(row.units).toBe(4);
});

// Extra (b): non-admin (cashier) calling salesSummary is rejected
test("salesSummary rejects non-admin cashier", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const cashier = await seed(t, "cashier");

  const pid = await admin.mutation(api.products.create, {
    name: "Widget", sku: "w1", category: "Tools",
    costPrice: 5, sellPrice: 10, stockQty: 50, reorderThreshold: 5,
  });
  await admin.mutation(api.sales.createSale, {
    items: [{ productId: pid, quantity: 1 }], cashTendered: 10,
  });

  await expect(
    cashier.query(api.reports.salesSummary, { startMs: 0, endMs: 1e15 }),
  ).rejects.toThrow();
});

test("dashboardAnalytics returns KPIs, growth deltas, timeseries, top products, categories", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await admin.mutation(api.products.create, {
    name: "Soda", sku: "s1", category: "Drinks",
    costPrice: 2, sellPrice: 5, stockQty: 100, reorderThreshold: 5,
  });
  // Two sales "now"
  await admin.mutation(api.sales.createSale, { items: [{ productId: pid, quantity: 4 }], cashTendered: 100 });
  await admin.mutation(api.sales.createSale, { items: [{ productId: pid, quantity: 2 }], cashTendered: 100 });

  const res = await admin.query(api.reports.dashboardAnalytics, {
    startMs: 0, endMs: 1e15, granularity: "day", tzOffsetMinutes: 0,
  });

  expect(res.kpis.revenue.value).toBe(30);  // (4+2)*5
  expect(res.kpis.profit.value).toBe(18);   // (4+2)*(5-2)
  expect(res.kpis.units.value).toBe(6);
  expect(res.kpis.transactions.value).toBe(2);
  expect(res.kpis.revenue.previous).toBe(0);
  expect(res.kpis.revenue.deltaPct).toBeNull(); // previous 0 → null

  // timeseries non-empty, totals reconcile
  const tsRevenue = res.timeseries.reduce((s, b) => s + b.revenue, 0);
  expect(tsRevenue).toBe(30);

  expect(res.topProducts[0].name).toBe("Soda");
  expect(res.topProducts[0].units).toBe(6);
  expect(res.categoryBreakdown[0].category).toBe("Drinks");
  expect(res.categoryBreakdown[0].revenue).toBe(30);
  expect(res.truncated).toBe(false);
});

test("dashboardAnalytics excludes archived sales and is admin-only", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const cashier = await seed(t, "cashier");
  const pid = await admin.mutation(api.products.create, {
    name: "Chip", sku: "c1", category: "Snacks",
    costPrice: 1, sellPrice: 3, stockQty: 50, reorderThreshold: 5,
  });
  const sale = await admin.mutation(api.sales.createSale, { items: [{ productId: pid, quantity: 1 }], cashTendered: 10 });
  // archive the sale directly
  await t.run(async (ctx) => {
    const s = await ctx.db.query("sales").withIndex("by_receiptNumber").first();
    if (s) await ctx.db.patch("sales", s._id, { isArchived: true });
    void sale;
  });

  const res = await admin.query(api.reports.dashboardAnalytics, {
    startMs: 0, endMs: 1e15, granularity: "day", tzOffsetMinutes: 0,
  });
  expect(res.kpis.revenue.value).toBe(0);
  expect(res.kpis.transactions.value).toBe(0);

  await expect(
    cashier.query(api.reports.dashboardAnalytics, { startMs: 0, endMs: 1e15, granularity: "day", tzOffsetMinutes: 0 }),
  ).rejects.toThrow();
});

test("cashFlow buckets sales revenue against purchase spend", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await admin.mutation(api.products.create, {
    name: "Box", sku: "bx1", category: "Supplies",
    costPrice: 5, sellPrice: 12, stockQty: 100, reorderThreshold: 5,
  });
  await admin.mutation(api.sales.createSale, { items: [{ productId: pid, quantity: 2 }], cashTendered: 100 });

  // A purchase whose purchaseDate is "now" (in range)
  await t.run(async (ctx) => {
    const adminId = (await ctx.db.query("userProfiles").first())!.userId;
    const fileId = await ctx.storage.store(new Blob(["x"]));
    await ctx.db.insert("purchases", {
      supplierName: "Acme", purchaseDate: Date.now(), total: 500, itemCount: 1,
      userId: adminId, fileId: fileId,
    });
  });

  const res = await admin.query(api.reports.cashFlow, {
    startMs: 0, endMs: 1e15, granularity: "day", tzOffsetMinutes: 0,
  });
  expect(res.totals.revenue).toBe(24); // 2*12
  expect(res.totals.spend).toBe(500);
  expect(res.truncated).toBe(false);
  const withRevenue = res.buckets.find((b) => b.revenue > 0);
  expect(withRevenue).toBeDefined();
});

test("batchInventory returns a per-batch breakdown with received/expiry dates", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await admin.mutation(api.products.create, {
    name: "Oil", sku: "O1", barcode: "4801234567890", category: "Oil",
    costPrice: 100, sellPrice: 180, stockQty: 50, reorderThreshold: 5,
  });
  // A second batch (stock-in) with its own receive + expiry dates.
  await admin.mutation(api.inventory.stockIn, {
    productId: pid,
    quantity: 30,
    unitCost: 110,
    receivedDate: 5_000_000,
    expiryDate: 99_000_000,
  });

  const res = await admin.query(api.reports.batchInventory, { includeEmpty: false });
  expect(res.truncated).toBe(false);
  const rows = res.rows.filter((r) => r.productId === pid);
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => r.barcode === "4801234567890")).toBe(true);
  const totals = rows.reduce((s, r) => s + r.qtyRemaining, 0);
  expect(totals).toBe(80); // 50 + 30
  // Sorted oldest-received first; the backdated (5_000_000) batch should lead
  // among the two once product/creation tie-break resolves — assert presence of expiry.
  const withExpiry = rows.find((r) => r.expiryDate === 99_000_000);
  expect(withExpiry?.qtyRemaining).toBe(30);
});

test("batchInventory hides empty batches unless includeEmpty is set", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await admin.mutation(api.products.create, {
    name: "Gone", sku: "G1", category: "X",
    costPrice: 1, sellPrice: 2, stockQty: 5, reorderThreshold: 0,
  });
  // Drain all stock so the only batch is empty.
  await admin.mutation(api.sales.createSale, {
    items: [{ productId: pid, quantity: 5 }],
    cashTendered: 100,
  });

  const live = await admin.query(api.reports.batchInventory, { includeEmpty: false });
  expect(live.rows.filter((r) => r.productId === pid)).toHaveLength(0);

  const all = await admin.query(api.reports.batchInventory, { includeEmpty: true });
  expect(all.rows.filter((r) => r.productId === pid)).toHaveLength(1);
});
