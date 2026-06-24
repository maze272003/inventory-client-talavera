/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function asAdmin(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email: "a@a.com" });
    await ctx.db.insert("userProfiles", { userId: id, name: "A", role: "admin" });
    return id;
  });
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

async function seedAdminAndProduct(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email: "seed@a.com" });
    await ctx.db.insert("userProfiles", { userId: id, name: "Seed", role: "admin" });
    return id;
  });
  const admin = t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
  const pid = await admin.mutation(api.products.create, {
    name: "Widget", sku: "w1", category: "Test",
    costPrice: 3, sellPrice: 6, stockQty: 0, reorderThreshold: 1,
  });
  return { admin, pid };
}

// Brief's primary test: stockIn increases qty and logs balanceAfter
test("stockIn increases qty and logs balanceAfter", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const pid = await admin.mutation(api.products.create, {
    name: "Pen", sku: "p1", category: "Office",
    costPrice: 2, sellPrice: 5, stockQty: 3, reorderThreshold: 1,
  });
  await admin.mutation(api.inventory.stockIn, { productId: pid, quantity: 7, unitCost: 2 });
  const p = await admin.query(api.products.getBySku, { sku: "p1" });
  expect(p?.stockQty).toEqual(10);
});

// Extra test (a): adjust to lower quantity writes correct negative quantityDelta and updates stockQty
test("adjust to lower quantity writes negative quantityDelta and updates stockQty", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const pid = await admin.mutation(api.products.create, {
    name: "Stapler", sku: "s1", category: "Office",
    costPrice: 5, sellPrice: 10, stockQty: 20, reorderThreshold: 5,
  });
  await admin.mutation(api.inventory.adjust, {
    productId: pid,
    newQuantity: 12,
    reason: "damaged goods removed",
  });
  const p = await admin.query(api.products.getBySku, { sku: "s1" });
  expect(p?.stockQty).toEqual(12);

  const ledgerRows = await t.run(async (ctx) => {
    return await ctx.db
      .query("inventoryLedger")
      .withIndex("by_product", (q) => q.eq("productId", pid))
      .take(10);
  });
  // One opening ledger row from create, one from adjust
  const adjustRow = ledgerRows.find((r) => r.type === "adjustment");
  expect(adjustRow).toBeDefined();
  expect(adjustRow?.quantityDelta).toBe(-8); // 12 - 20
  expect(adjustRow?.balanceAfter).toBe(12);
  expect(adjustRow?.reason).toBe("damaged goods removed");
});

// Extra test (b): stockIn with quantity <= 0 is rejected
test("stockIn rejects quantity <= 0", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const pid = await admin.mutation(api.products.create, {
    name: "Eraser", sku: "e1", category: "Office",
    costPrice: 1, sellPrice: 2, stockQty: 5, reorderThreshold: 2,
  });
  await expect(
    admin.mutation(api.inventory.stockIn, { productId: pid, quantity: 0 }),
  ).rejects.toThrow("Quantity must be positive");
  await expect(
    admin.mutation(api.inventory.stockIn, { productId: pid, quantity: -3 }),
  ).rejects.toThrow("Quantity must be positive");
});

test("stockIn without targetBatchId creates a new batch", async () => {
  const t = convexTest(schema, modules);
  const { admin, pid } = await seedAdminAndProduct(t);
  await admin.mutation(api.inventory.stockIn, { productId: pid, quantity: 7, unitCost: 3 });
  const { batchCount, stockQty } = await t.run(async (ctx) => {
    const bs = await ctx.db.query("batches").withIndex("by_product", (q) => q.eq("productId", pid)).collect();
    const p = await ctx.db.get("products", pid);
    return { batchCount: bs.length, stockQty: p!.stockQty };
  });
  expect(batchCount).toBe(1);
  expect(stockQty).toBe(7);
});

test("stockIn with targetBatchId adds to that batch", async () => {
  const t = convexTest(schema, modules);
  const { admin, pid } = await seedAdminAndProduct(t);
  await admin.mutation(api.inventory.stockIn, { productId: pid, quantity: 4, unitCost: 3 });
  const batchId = await t.run(async (ctx) =>
    (await ctx.db.query("batches").withIndex("by_product", (q) => q.eq("productId", pid)).first())!._id);
  await admin.mutation(api.inventory.stockIn, { productId: pid, quantity: 6, targetBatchId: batchId });
  const { batchCount, remaining, stockQty } = await t.run(async (ctx) => {
    const bs = await ctx.db.query("batches").withIndex("by_product", (q) => q.eq("productId", pid)).collect();
    const p = await ctx.db.get("products", pid);
    return { batchCount: bs.length, remaining: bs[0].qtyRemaining, stockQty: p!.stockQty };
  });
  expect(batchCount).toBe(1);
  expect(remaining).toBe(10);
  expect(stockQty).toBe(10);
});
