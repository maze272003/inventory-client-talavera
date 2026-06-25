/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const DAY = 24 * 60 * 60 * 1000;

async function seed(t: ReturnType<typeof convexTest>, role: "admin" | "cashier") {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email: `${role}@a.com` });
    await ctx.db.insert("userProfiles", { userId: id, name: role, role });
    return id;
  });
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

async function countAll(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const [sales, saleItems, batches, ledger, purchases, products] = await Promise.all([
      ctx.db.query("sales").take(10000),
      ctx.db.query("saleItems").take(10000),
      ctx.db.query("batches").take(10000),
      ctx.db.query("inventoryLedger").take(10000),
      ctx.db.query("purchases").take(10000),
      ctx.db.query("products").take(10000),
    ]);
    return {
      sales: sales.length,
      saleItems: saleItems.length,
      batches: batches.length,
      ledger: ledger.length,
      purchases: purchases.length,
      products: products.length,
    };
  });
}

test("snapshot returns all four datasets for admin with the required shape", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");

  // Product sitting at/below threshold → should surface as stockout risk.
  await admin.mutation(api.products.create, {
    name: "Brake Pad", sku: "bp1", category: "Brakes",
    costPrice: 30, sellPrice: 50, stockQty: 3, reorderThreshold: 5,
  });

  const res = await admin.query(api.inventoryHealth.snapshot, {
    nowMs: Date.now(),
    velocityWindowDays: 30,
  });

  expect(res).toHaveProperty("stockoutRisk");
  expect(res).toHaveProperty("deadStock");
  expect(res).toHaveProperty("valuation");
  expect(res).toHaveProperty("reorderSuggestions");
  expect(res).toHaveProperty("truncated");
  expect(Array.isArray(res.stockoutRisk)).toBe(true);

  // The at-threshold product appears in stockout risk.
  expect(res.stockoutRisk.some((r) => r.sku === "bp1")).toBe(true);

  // Valuation has separate cost and retail figures.
  expect(res.valuation.totalCostValue).toBeGreaterThan(0);
  expect(res.valuation.totalRetailValue).toBeGreaterThanOrEqual(res.valuation.totalCostValue);
  // Category breakdown reconciles to total cost value.
  const catSum = res.valuation.byCategory.reduce((s, c) => s + c.costValue, 0);
  expect(catSum).toBeCloseTo(res.valuation.totalCostValue, 5);

  // Reorder suggestion exists for the at-threshold product and is non-negative.
  const sug = res.reorderSuggestions.find((s) => s.sku === "bp1");
  expect(sug).toBeDefined();
  expect(sug!.suggestedReorderQty).toBeGreaterThanOrEqual(0);
});

test("snapshot rejects a cashier", async () => {
  const t = convexTest(schema, modules);
  const cashier = await seed(t, "cashier");
  await expect(
    cashier.query(api.inventoryHealth.snapshot, { nowMs: Date.now() }),
  ).rejects.toThrow();
});

test("snapshot rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.query(api.inventoryHealth.snapshot, { nowMs: Date.now() }),
  ).rejects.toThrow();
});

test("snapshot performs no writes on read", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await admin.mutation(api.products.create, {
    name: "Filter", sku: "f1", category: "Filters",
    costPrice: 5, sellPrice: 12, stockQty: 10, reorderThreshold: 3,
  });
  await admin.mutation(api.sales.createSale, {
    items: [{ productId: pid, quantity: 2 }],
    cashTendered: 1000,
  });

  const before = await countAll(t);
  await admin.query(api.inventoryHealth.snapshot, { nowMs: Date.now() });
  const after = await countAll(t);
  expect(after).toEqual(before);
});

test("dead stock is classified when nowMs is far in the future", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  // Freshly created product: its opening batch's last movement is "now".
  await admin.mutation(api.products.create, {
    name: "Old Gasket", sku: "og1", category: "Gaskets",
    costPrice: 2, sellPrice: 5, stockQty: 8, reorderThreshold: 2,
  });

  // Asking 200 days later → that batch hasn't moved in 200d → band 180.
  const res = await admin.query(api.inventoryHealth.snapshot, {
    nowMs: Date.now() + 200 * DAY,
    velocityWindowDays: 30,
  });
  const dead = res.deadStock.find((d) => d.batchNumber.includes("OG") || d.productName === "Old Gasket") ?? res.deadStock[0];
  expect(dead).toBeDefined();
  expect(dead.band).toBe("180");
  expect(dead.cashValue).toBe(dead.qtyRemaining * dead.unitCost);
});

test("velocity reflects a recent sale and appears in stockout risk", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await admin.mutation(api.products.create, {
    name: "Fast Spark Plug", sku: "fsp1", category: "Ignition",
    costPrice: 1, sellPrice: 4, stockQty: 5, reorderThreshold: 2,
  });
  await admin.mutation(api.sales.createSale, {
    items: [{ productId: pid, quantity: 3 }],
    cashTendered: 1000,
  });

  const res = await admin.query(api.inventoryHealth.snapshot, {
    nowMs: Date.now(),
    velocityWindowDays: 30,
  });
  const row = res.stockoutRisk.find((r) => r.productId === pid);
  // After selling 3 of 5, stock=2 which is <= threshold 2 → flagged.
  expect(row).toBeDefined();
  expect(row!.velocityPerDay).toBeGreaterThan(0);
  expect(row!.daysToStockout).not.toBeNull();
});
