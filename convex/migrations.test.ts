/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");

test("backfill creates one migration batch per stocked product, idempotently", async () => {
  const t = convexTest(schema, modules);
  const pid = await t.run(async (ctx) =>
    ctx.db.insert("products", {
      name: "Legacy", sku: "L1", category: "C", batchNumber: "BN-OLD-0001",
      costPrice: 4, sellPrice: 8, stockQty: 12, reorderThreshold: 0, isActive: true,
    }));
  await t.mutation(internal.migrations.backfillBatches, { cursor: null });
  await t.mutation(internal.migrations.backfillBatches, { cursor: null }); // run twice

  const batches = await t.run(async (ctx) =>
    ctx.db.query("batches").withIndex("by_product", (q) => q.eq("productId", pid)).collect());
  expect(batches).toHaveLength(1);
  expect(batches[0]).toMatchObject({
    qtyReceived: 12, qtyRemaining: 12, unitCost: 4, source: "migration", batchNumber: "BN-OLD-0001",
  });
});

test("backfill skips zero-stock products", async () => {
  const t = convexTest(schema, modules);
  const stockedId = await t.run(async (ctx) =>
    ctx.db.insert("products", {
      name: "Stocked", sku: "S1", category: "C", batchNumber: "BN-S-0001",
      costPrice: 4, sellPrice: 8, stockQty: 12, reorderThreshold: 0, isActive: true,
    }));
  const zeroId = await t.run(async (ctx) =>
    ctx.db.insert("products", {
      name: "Empty", sku: "Z1", category: "C", batchNumber: "BN-Z-0001",
      costPrice: 4, sellPrice: 8, stockQty: 0, reorderThreshold: 0, isActive: true,
    }));
  await t.mutation(internal.migrations.backfillBatches, { cursor: null });

  const stockedBatches = await t.run(async (ctx) =>
    ctx.db.query("batches").withIndex("by_product", (q) => q.eq("productId", stockedId)).collect());
  const zeroBatches = await t.run(async (ctx) =>
    ctx.db.query("batches").withIndex("by_product", (q) => q.eq("productId", zeroId)).collect());
  expect(stockedBatches).toHaveLength(1);
  expect(zeroBatches).toHaveLength(0);
});
