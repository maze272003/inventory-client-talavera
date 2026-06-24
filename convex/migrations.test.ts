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
