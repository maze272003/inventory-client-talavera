/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedAdmin(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email: "owner@a.com" });
    await ctx.db.insert("userProfiles", { userId: id, name: "Owner", role: "admin" });
    return id;
  });
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

test("nightly archive archives active out-of-stock products and writes audit", async () => {
  const t = convexTest(schema, modules);
  const admin = await seedAdmin(t);

  // Out of stock → should be archived.
  const zeroId = await admin.mutation(api.products.create, {
    name: "Dead Bulb", sku: "db1", category: "Lights",
    costPrice: 5, sellPrice: 10, stockQty: 0, reorderThreshold: 2,
  });
  // In stock → must stay active.
  const okId = await admin.mutation(api.products.create, {
    name: "Good Bulb", sku: "gb1", category: "Lights",
    costPrice: 5, sellPrice: 10, stockQty: 12, reorderThreshold: 2,
  });
  // Already inactive & out of stock → must NOT be re-archived (no double audit).
  const inactiveId = await admin.mutation(api.products.create, {
    name: "Ghost", sku: "gh1", category: "Lights",
    costPrice: 1, sellPrice: 2, stockQty: 0, reorderThreshold: 1,
  });
  await t.run(async (ctx) => {
    await ctx.db.patch("products", inactiveId, { isActive: false });
  });

  const result = await t.mutation(internal.crons.archiveOutOfStockBatch, {});
  expect(result.hadSystemActor).toBe(true);

  const after = await t.run(async (ctx) => {
    const zero = await ctx.db.get("products", zeroId);
    const ok = await ctx.db.get("products", okId);
    const ghost = await ctx.db.get("products", inactiveId);
    const auditRows = await ctx.db
      .query("auditLog")
      .withIndex("by_reverted", (q) => q.eq("reverted", false))
      .take(50);
    return { zero, ok, ghost, auditCount: auditRows.length };
  });

  expect(after.zero?.isActive).toBe(false); // archived
  expect(after.ok?.isActive).toBe(true); // untouched
  expect(after.ghost?.isActive).toBe(false); // stays inactive
  expect(result.archived).toBe(1); // only the one out-of-stock active product
  expect(after.auditCount).toBeGreaterThanOrEqual(1);
});

test("nightly archive attributes audit to the System actor", async () => {
  const t = convexTest(schema, modules);
  const admin = await seedAdmin(t);
  await admin.mutation(api.products.create, {
    name: "Flat Tire", sku: "ft1", category: "Tires",
    costPrice: 20, sellPrice: 40, stockQty: 0, reorderThreshold: 3,
  });

  await t.mutation(internal.crons.archiveOutOfStockBatch, {});

  const row = await t.run(async (ctx) => {
    const all = await ctx.db.query("auditLog").take(20);
    return all.find((a) => a.action === "archive");
  });
  expect(row).toBeDefined();
  expect(row!.actorName).toBe("System · Nightly archive");
  expect(row!.action).toBe("archive");
  expect(row!.undoable).toBe(true);
  expect(row!.actorEmail).toBe(""); // suppresses audit.enrichEntry lookup
});

test("nightly archive reports not-done and reschedules when over one batch", async () => {
  const t = convexTest(schema, modules);
  const admin = await seedAdmin(t);
  // BATCH_SIZE is 200; create 205 products so the first page is full.
  for (let i = 0; i < 205; i++) {
    await admin.mutation(api.products.create, {
      name: `Part ${i}`,
      sku: `p${i}`,
      category: "Bulk",
      costPrice: 1,
      sellPrice: 2,
      stockQty: i % 10 === 0 ? 0 : 5,
      reorderThreshold: 1,
    });
  }

  const res = await t.mutation(internal.crons.archiveOutOfStockBatch, {});
  expect(res.isDone).toBe(false); // first page was full → continuation queued
  expect(res.archived).toBeGreaterThan(0); // archived some out-of-stock items
});
