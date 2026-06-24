/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Helper: seed an admin and a product with N batches via stockIn.
async function seedProductWithBatches(
  t: ReturnType<typeof convexTest>,
  batches: number[],
) {
  // Insert admin identity + product directly through a test mutation surface.
  const productId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "a@b.c" } as any);
    await ctx.db.insert("userProfiles", {
      userId, name: "Admin", role: "admin",
    });
    const pid = await ctx.db.insert("products", {
      name: "Widget", sku: "W1", category: "C", costPrice: 5, sellPrice: 10,
      stockQty: 0, reorderThreshold: 0, isActive: true,
    });
    let seq = 0;
    let total = 0;
    for (const q of batches) {
      seq++;
      total += q;
      await ctx.db.insert("batches", {
        productId: pid, batchNumber: `BN-2026-${String(seq).padStart(4, "0")}`,
        qtyReceived: q, qtyRemaining: q, unitCost: 5, source: "stock_in",
        isActive: true,
      });
    }
    await ctx.db.patch("products", pid, { stockQty: total });
    return pid;
  });
  return productId;
}

test("FIFO drains the oldest batch first", async () => {
  const t = convexTest(schema, modules);
  const pid = await seedProductWithBatches(t, [3, 5]); // batch1=3, batch2=5

  const allocations = await t.run(async (ctx) => {
    const { allocateFifo } = await import("./lib/fifo");
    const userId = (await ctx.db.query("users").first())!._id;
    return await allocateFifo(ctx, pid, 4, "sale", { userId });
  });

  // 3 from batch1 (depleted), 1 from batch2.
  expect(allocations.map((a) => a.quantity)).toEqual([3, 1]);

  const state = await t.run(async (ctx) => {
    const batches = await ctx.db
      .query("batches").withIndex("by_product", (q) => q.eq("productId", pid))
      .collect();
    const product = await ctx.db.get("products", pid);
    return {
      remaining: batches.sort((a, b) => a._creationTime - b._creationTime)
        .map((b) => b.qtyRemaining),
      active: batches.sort((a, b) => a._creationTime - b._creationTime)
        .map((b) => b.isActive),
      stockQty: product!.stockQty,
    };
  });
  expect(state.remaining).toEqual([0, 4]);
  expect(state.active).toEqual([false, true]);
  expect(state.stockQty).toEqual(4);
});

test("FIFO throws and writes nothing when stock is insufficient", async () => {
  const t = convexTest(schema, modules);
  const pid = await seedProductWithBatches(t, [2]);
  await expect(
    t.run(async (ctx) => {
      const { allocateFifo } = await import("./lib/fifo");
      const userId = (await ctx.db.query("users").first())!._id;
      return await allocateFifo(ctx, pid, 5, "sale", { userId });
    }),
  ).rejects.toThrow(/Insufficient stock/);
});
