/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
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

async function asCashier(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email: "c@c.com" });
    await ctx.db.insert("userProfiles", { userId: id, name: "C", role: "cashier" });
    return id;
  });
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

// Brief's primary test: create product writes opening ledger, getBySku finds it
test("create product writes opening ledger and is found by sku", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const id = await admin.mutation(api.products.create, {
    name: "Coke", sku: "111", category: "Drinks",
    costPrice: 10, sellPrice: 15, stockQty: 5, reorderThreshold: 2,
  });
  const found = await admin.query(api.products.getBySku, { sku: "111" });
  expect(found?._id).toEqual(id);
  expect(found?.stockQty).toEqual(5);

  // Assert opening ledger row was written correctly
  const ledgerRows = await t.run(async (ctx) => {
    return await ctx.db
      .query("inventoryLedger")
      .withIndex("by_product", (q) => q.eq("productId", id))
      .take(5);
  });
  expect(ledgerRows).toHaveLength(1);
  const row = ledgerRows[0];
  expect(row.type).toBe("stock_in");
  expect(row.quantityDelta).toBe(5);
  expect(row.balanceAfter).toBe(5);
  expect(row.unitCost).toBe(10);
});

// Extra test (a): cashier calling create is rejected
test("cashier cannot create a product", async () => {
  const t = convexTest(schema, modules);
  const cashier = await asCashier(t);
  await expect(
    cashier.mutation(api.products.create, {
      name: "Pepsi", sku: "222", category: "Drinks",
      costPrice: 8, sellPrice: 12, stockQty: 0, reorderThreshold: 5,
    }),
  ).rejects.toThrow("Requires admin access");
});

// Extra test (b): lowStock returns only active products at/below threshold
test("lowStock returns only active products at or below reorder threshold", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);

  // Product 1: active, stockQty (3) <= reorderThreshold (5) — should appear
  const id1 = await admin.mutation(api.products.create, {
    name: "LowItem", sku: "L1", category: "X",
    costPrice: 1, sellPrice: 2, stockQty: 3, reorderThreshold: 5,
  });

  // Product 2: active, stockQty (10) > reorderThreshold (5) — should NOT appear
  await admin.mutation(api.products.create, {
    name: "HighItem", sku: "H1", category: "X",
    costPrice: 1, sellPrice: 2, stockQty: 10, reorderThreshold: 5,
  });

  // Product 3: active, stockQty == reorderThreshold — should appear (edge case)
  const id3 = await admin.mutation(api.products.create, {
    name: "ExactItem", sku: "E1", category: "X",
    costPrice: 1, sellPrice: 2, stockQty: 5, reorderThreshold: 5,
  });

  // Product 4: inactive, stockQty (1) <= reorderThreshold (5) — should NOT appear
  const id4 = await admin.mutation(api.products.create, {
    name: "InactiveItem", sku: "I1", category: "X",
    costPrice: 1, sellPrice: 2, stockQty: 1, reorderThreshold: 5,
  });
  await admin.mutation(api.products.setActive, { id: id4, isActive: false });

  const result = await admin.query(api.products.lowStock, {});
  const resultIds = result.map((p) => p._id);

  expect(resultIds).toContain(id1);
  expect(resultIds).toContain(id3);
  expect(resultIds).not.toContain(id4);
  // HighItem (stockQty 10 > threshold 5) must not appear
  expect(result.some((p) => p.sku === "H1")).toBe(false);
});

// Batch number (1): create yields a well-formed BN-YYYYMMDD-NNNN code
test("create assigns a batchNumber matching the BN format", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const id = await admin.mutation(api.products.create, {
    name: "Batched", sku: "BN1", category: "X",
    costPrice: 1, sellPrice: 2, stockQty: 0, reorderThreshold: 1,
  });
  const found = await admin.query(api.products.getBySku, { sku: "BN1" });
  expect(found?._id).toEqual(id);
  expect(found?.batchNumber).toMatch(/^BN-\d{8}-\d{4,}$/);
});

// Batch number (2): two creates produce incrementing suffixes N then N+1
test("batchNumber suffix increments across two creates", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  await admin.mutation(api.products.create, {
    name: "First", sku: "BN-A", category: "X",
    costPrice: 1, sellPrice: 2, stockQty: 0, reorderThreshold: 1,
  });
  await admin.mutation(api.products.create, {
    name: "Second", sku: "BN-B", category: "X",
    costPrice: 1, sellPrice: 2, stockQty: 0, reorderThreshold: 1,
  });
  const first = await admin.query(api.products.getBySku, { sku: "BN-A" });
  const second = await admin.query(api.products.getBySku, { sku: "BN-B" });
  const suffix = (bn: string | undefined) => Number(bn!.split("-")[2]);
  expect(suffix(second?.batchNumber)).toEqual(suffix(first?.batchNumber) + 1);
});

// Batch number (3): update leaves batchNumber unchanged (immutable)
test("update does not change batchNumber", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const id = await admin.mutation(api.products.create, {
    name: "Immutable", sku: "BN-IMM", category: "X",
    costPrice: 1, sellPrice: 2, stockQty: 0, reorderThreshold: 1,
  });
  const before = await admin.query(api.products.getBySku, { sku: "BN-IMM" });
  await admin.mutation(api.products.update, {
    id, name: "Renamed", sku: "BN-IMM", category: "Y",
    costPrice: 3, sellPrice: 4, reorderThreshold: 9,
  });
  const after = await admin.query(api.products.getBySku, { sku: "BN-IMM" });
  expect(after?.name).toEqual("Renamed");
  expect(after?.batchNumber).toEqual(before?.batchNumber);
});

// Task 4: opening batch row is created when stockQty > 0
test("creating a product with opening stock creates one opening batch", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const pid = await admin.mutation(api.products.create, {
    name: "Bolt", sku: "B1", category: "Hardware",
    costPrice: 2, sellPrice: 5, stockQty: 10, reorderThreshold: 1,
  });
  const batches = await t.run(async (ctx) =>
    ctx.db.query("batches").withIndex("by_product", (q) => q.eq("productId", pid)).collect(),
  );
  expect(batches).toHaveLength(1);
  expect(batches[0]).toMatchObject({
    qtyReceived: 10, qtyRemaining: 10, unitCost: 2, source: "opening", isActive: true,
  });
});

// Task 4: no opening batch when stockQty is 0
test("creating a product with stockQty 0 creates no batch", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const pid = await admin.mutation(api.products.create, {
    name: "Empty", sku: "E99", category: "Hardware",
    costPrice: 5, sellPrice: 10, stockQty: 0, reorderThreshold: 1,
  });
  const batches = await t.run(async (ctx) =>
    ctx.db.query("batches").withIndex("by_product", (q) => q.eq("productId", pid)).collect(),
  );
  expect(batches).toHaveLength(0);
});

// Task 4: opening ledger row has batchId linking to the opening batch
test("opening ledger row references the opening batch via batchId", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const pid = await admin.mutation(api.products.create, {
    name: "Nut", sku: "N1", category: "Hardware",
    costPrice: 3, sellPrice: 7, stockQty: 5, reorderThreshold: 1,
  });
  const [batch] = await t.run(async (ctx) =>
    ctx.db.query("batches").withIndex("by_product", (q) => q.eq("productId", pid)).collect(),
  );
  const ledger = await t.run(async (ctx) =>
    ctx.db.query("inventoryLedger").withIndex("by_product", (q) => q.eq("productId", pid)).collect(),
  );
  expect(ledger).toHaveLength(1);
  expect(ledger[0].batchId).toEqual(batch._id);
});

// Task 9: list attaches batch summary and supports stock filter
test("list attaches batch summary and supports stock filter", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  await admin.mutation(api.products.create, { name: "A", sku: "A", category: "X", costPrice: 1, sellPrice: 2, stockQty: 10, reorderThreshold: 2 });
  await admin.mutation(api.products.create, { name: "B", sku: "B", category: "Y", costPrice: 1, sellPrice: 2, stockQty: 0, reorderThreshold: 2 });

  const page = await admin.query(api.products.list, {
    paginationOpts: { numItems: 50, cursor: null }, activeOnly: true, stockFilter: "inStock",
  });
  type PageItem = { name: string; activeBatchCount: number; nextBatchNumber: string | null };
  const names = (page.page as PageItem[]).map((p) => p.name);
  expect(names).toContain("A");
  expect(names).not.toContain("B");
  const itemA = (page.page as PageItem[]).find((p) => p.name === "A")!;
  expect(itemA.activeBatchCount).toBe(1);
  expect(typeof itemA.nextBatchNumber).toBe("string");
});

// Task 9: categories returns distinct active categories
test("categories returns distinct active categories", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  await admin.mutation(api.products.create, { name: "A", sku: "A", category: "X", costPrice: 1, sellPrice: 2, stockQty: 1, reorderThreshold: 0 });
  await admin.mutation(api.products.create, { name: "B", sku: "B", category: "X", costPrice: 1, sellPrice: 2, stockQty: 1, reorderThreshold: 0 });
  await admin.mutation(api.products.create, { name: "C", sku: "C", category: "Y", costPrice: 1, sellPrice: 2, stockQty: 1, reorderThreshold: 0 });
  const cats = await admin.query(api.products.categories, {});
  expect([...cats].sort()).toEqual(["X", "Y"]);
});

// Batch number (4): backfill numbers un-numbered rows, leaves numbered rows alone
test("backfillBatchNumbersInternal numbers only un-numbered products", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);

  // Row created through create() already has a batchNumber.
  const numberedId = await admin.mutation(api.products.create, {
    name: "AlreadyNumbered", sku: "BN-NUM", category: "X",
    costPrice: 1, sellPrice: 2, stockQty: 0, reorderThreshold: 1,
  });
  const numberedBefore = await admin.query(api.products.getBySku, { sku: "BN-NUM" });

  // Row inserted directly WITHOUT a batchNumber (simulates a pre-feature doc).
  const unNumberedId = await t.run((ctx) =>
    ctx.db.insert("products", {
      name: "Legacy", sku: "BN-LEGACY", category: "X",
      costPrice: 1, sellPrice: 2, stockQty: 0, reorderThreshold: 1, isActive: true,
    }),
  );

  const result = await t.mutation(internal.databaseMaintenance.backfillBatchNumbersInternal, {});
  expect(result.patched).toEqual(1);

  // The legacy row now has a well-formed batch number.
  const backfilled = await t.run((ctx) => ctx.db.get("products", unNumberedId));
  expect(backfilled?.batchNumber).toMatch(/^BN-\d{8}-\d{4,}$/);

  // The already-numbered row is untouched.
  const numberedAfter = await t.run((ctx) => ctx.db.get("products", numberedId));
  expect(numberedAfter?.batchNumber).toEqual(numberedBefore?.batchNumber);
});
