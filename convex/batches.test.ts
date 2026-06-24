/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("listForProduct returns active batches oldest-first", async () => {
  const t = convexTest(schema, modules);
  const { pid, userId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "a@t.co" });
    await ctx.db.insert("userProfiles", { userId, name: "U", role: "cashier" });
    const pid = await ctx.db.insert("products", {
      name: "P", sku: "S", category: "C", costPrice: 1, sellPrice: 2,
      stockQty: 8, reorderThreshold: 0, isActive: true,
    });
    await ctx.db.insert("batches", { productId: pid, batchNumber: "BN-1", qtyReceived: 3, qtyRemaining: 3, unitCost: 1, source: "stock_in", isActive: true });
    await ctx.db.insert("batches", { productId: pid, batchNumber: "BN-2", qtyReceived: 5, qtyRemaining: 5, unitCost: 1, source: "stock_in", isActive: true });
    await ctx.db.insert("batches", { productId: pid, batchNumber: "BN-0", qtyReceived: 4, qtyRemaining: 0, unitCost: 1, source: "stock_in", isActive: false });
    return { pid, userId };
  });
  const u = t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
  const rows = await u.query(api.batches.listForProduct, { productId: pid });
  expect(rows.map((r) => r.batchNumber)).toEqual(["BN-1", "BN-2"]);
});

test("findByBatchNumber returns product and batch or null", async () => {
  const t = convexTest(schema, modules);
  const { batchNumber, userId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "b@t.co" });
    await ctx.db.insert("userProfiles", { userId, name: "V", role: "cashier" });
    const pid = await ctx.db.insert("products", {
      name: "Widget", sku: "W1", category: "C", costPrice: 5, sellPrice: 10,
      stockQty: 3, reorderThreshold: 0, isActive: true,
    });
    await ctx.db.insert("batches", { productId: pid, batchNumber: "BN-FIND", qtyReceived: 3, qtyRemaining: 3, unitCost: 5, source: "stock_in", isActive: true });
    return { batchNumber: "BN-FIND", userId };
  });
  const u = t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
  const result = await u.query(api.batches.findByBatchNumber, { batchNumber });
  expect(result).not.toBeNull();
  expect(result!.batch.batchNumber).toBe("BN-FIND");
  expect(result!.product.name).toBe("Widget");
  expect(result!.product.imageUrl).toBeNull();

  const missing = await u.query(api.batches.findByBatchNumber, { batchNumber: "NOPE" });
  expect(missing).toBeNull();
});
