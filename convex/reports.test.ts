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
