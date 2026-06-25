/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

async function seed(t: ReturnType<typeof convexTest>, role: "admin" | "cashier") {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email: `${role}@a.com` });
    await ctx.db.insert("userProfiles", { userId: id, name: role, role });
    return id;
  });
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

/**
 * Create a product via the API (admin-only mutation) with stockQty:0, then
 * manually patch the stockQty and insert a single matching batch so allocateFifo
 * sees exactly one batch matching the original stockQty. Returns the product id.
 */
async function seedProduct(
  t: ReturnType<typeof convexTest>,
  admin: Awaited<ReturnType<typeof seed>>,
  args: {
    name: string; sku: string; category: string;
    costPrice: number; sellPrice: number; stockQty: number; reorderThreshold: number;
  },
): Promise<Id<"products">> {
  const pid = await admin.mutation(api.products.create, { ...args, stockQty: 0 });
  if (args.stockQty > 0) {
    await t.run(async (ctx) => {
      await ctx.db.patch("products", pid, { stockQty: args.stockQty });
      await ctx.db.insert("batches", {
        productId: pid,
        batchNumber: `SEED-${args.sku}`,
        qtyReceived: args.stockQty,
        qtyRemaining: args.stockQty,
        unitCost: args.costPrice,
        source: "stock_in",
        isActive: true,
      });
    });
  }
  return pid;
}

/** Helper: run a sale of a single product, return { saleId, saleItemId }. */
async function sellOne(
  admin: Awaited<ReturnType<typeof seed>>,
  pid: Id<"products">,
  qty: number,
): Promise<{ saleId: Id<"sales">; saleItemId: Id<"saleItems"> }> {
  const res = await admin.mutation(api.sales.createSale, {
    items: [{ productId: pid, quantity: qty }],
    cashTendered: 1e9,
  });
  const detail = await admin.query(api.sales.getSale, { saleId: res.saleId });
  return { saleId: res.saleId, saleItemId: detail!.items[0]._id };
}

// ---------------------------------------------------------------------------
// Mutation tests
// ---------------------------------------------------------------------------

// 1. Full return → succeeds with all side effects
test("admin full return succeeds, restocks, writes returnItems + ledger + audit", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Soap", sku: "r1", category: "Home",
    costPrice: 8, sellPrice: 12, stockQty: 10, reorderThreshold: 2,
  });
  const { saleId, saleItemId } = await sellOne(admin, pid, 3);

  const res = await admin.mutation(api.returns.createReturn, {
    saleId,
    lines: [{ saleItemId, quantity: 3 }],
    reason: "defective",
  });
  expect(res.totalRefund).toEqual(36);
  expect(res.cashRefunded).toEqual(36);
  expect(res.itemCount).toEqual(3);
  expect(res.returnId).toBeTruthy();

  // Stock restored to original.
  const p = await admin.query(api.products.getBySku, { sku: "r1" });
  expect(p?.stockQty).toEqual(10);

  // Batch restored.
  const batches = await t.run(async (ctx) =>
    ctx.db
      .query("batches")
      .withIndex("by_product", (q) => q.eq("productId", pid))
      .collect(),
  );
  expect(batches[0].qtyRemaining).toEqual(10);

  // returnItems written: 1 row, quantity 3.
  const returnItems = await t.run(async (ctx) =>
    ctx.db
      .query("returnItems")
      .withIndex("by_return", (q) => q.eq("returnId", res.returnId))
      .collect(),
  );
  expect(returnItems).toHaveLength(1);
  expect(returnItems[0].quantity).toEqual(3);
  expect(returnItems[0].lineRefund).toEqual(36);
  expect(returnItems[0].unitCostPrice).toEqual(8);

  // Ledger row: type "return", returnId set, saleId unset, positive delta.
  const ledgerRows = await t.run(async (ctx) =>
    ctx.db
      .query("inventoryLedger")
      .withIndex("by_return", (q) => q.eq("returnId", res.returnId))
      .collect(),
  );
  expect(ledgerRows).toHaveLength(1);
  expect(ledgerRows[0].type).toEqual("return");
  expect(ledgerRows[0].quantityDelta).toEqual(3);
  expect(ledgerRows[0].returnId).toEqual(res.returnId);
  expect(ledgerRows[0].saleId).toBeUndefined();
  expect(ledgerRows[0].balanceAfter).toEqual(10);

  // Audit row written exactly once with action "return" and entityId = saleId.
  const auditRows = await t.run(async (ctx) =>
    ctx.db
      .query("auditLog")
      // eslint-disable-next-line @convex-dev/no-filter-in-query -- test-only: assert return audit action
      .filter((q) => q.eq(q.field("action"), "return"))
      .collect(),
  );
  const forThisSale = auditRows.filter((r) => r.entityId === saleId);
  expect(forThisSale).toHaveLength(1);
  expect(forThisSale[0].entityTable).toEqual("sales");
  expect(forThisSale[0].summary).toContain("#1");
  expect(forThisSale[0].undoable).toBe(false);
});

// 2. Partial return
test("admin partial return succeeds with correct itemCount and totalRefund", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Mug", sku: "r2", category: "Home",
    costPrice: 5, sellPrice: 7, stockQty: 10, reorderThreshold: 2,
  });
  const { saleId, saleItemId } = await sellOne(admin, pid, 3);

  const res = await admin.mutation(api.returns.createReturn, {
    saleId,
    lines: [{ saleItemId, quantity: 1 }],
  });
  expect(res.itemCount).toEqual(1);
  expect(res.totalRefund).toEqual(7);

  const p = await admin.query(api.products.getBySku, { sku: "r2" });
  expect(p?.stockQty).toEqual(8);
});

// 3. Cashier denied → throws, no writes
test("cashier createReturn is denied and writes nothing", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const cashier = await seed(t, "cashier");
  const pid = await seedProduct(t, admin, {
    name: "Cup", sku: "r3", category: "Home",
    costPrice: 1, sellPrice: 2, stockQty: 10, reorderThreshold: 1,
  });
  const { saleId, saleItemId } = await sellOne(admin, pid, 2);

  await expect(
    cashier.mutation(api.returns.createReturn, {
      saleId,
      lines: [{ saleItemId, quantity: 1 }],
    }),
  ).rejects.toThrow();

  const returnsCount = await t.run(async (ctx) =>
    ctx.db
      .query("returns")
      .withIndex("by_sale", (q) => q.eq("saleId", saleId))
      .take(10),
  );
  expect(returnsCount).toHaveLength(0);
});

// 4. Unauthenticated denied
test("unauthenticated createReturn throws", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Pen", sku: "r4", category: "Home",
    costPrice: 1, sellPrice: 2, stockQty: 10, reorderThreshold: 1,
  });
  const { saleId, saleItemId } = await sellOne(admin, pid, 1);

  await expect(
    t.mutation(api.returns.createReturn, {
      saleId,
      lines: [{ saleItemId, quantity: 1 }],
    }),
  ).rejects.toThrow();
});

// 5. Archived sale rejected, no writes
test("archived sale cannot be returned against", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Bag", sku: "r5", category: "Home",
    costPrice: 1, sellPrice: 2, stockQty: 10, reorderThreshold: 1,
  });
  const { saleId, saleItemId } = await sellOne(admin, pid, 2);
  await admin.mutation(api.sales.archive, { saleId });

  await expect(
    admin.mutation(api.returns.createReturn, {
      saleId,
      lines: [{ saleItemId, quantity: 1 }],
    }),
  ).rejects.toThrow(/archived/i);

  const returnsCount = await t.run(async (ctx) =>
    ctx.db
      .query("returns")
      .withIndex("by_sale", (q) => q.eq("saleId", saleId))
      .take(10),
  );
  expect(returnsCount).toHaveLength(0);
});

// 6. Wrong-sale saleItemId rejected, no writes
test("saleItem from a different sale is rejected", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Box", sku: "r6", category: "Home",
    costPrice: 1, sellPrice: 2, stockQty: 10, reorderThreshold: 1,
  });
  const a = await sellOne(admin, pid, 2);
  const b = await sellOne(admin, pid, 2);

  await expect(
    admin.mutation(api.returns.createReturn, {
      saleId: a.saleId,
      lines: [{ saleItemId: b.saleItemId, quantity: 1 }],
    }),
  ).rejects.toThrow(/belong/);

  const returnsCount = await t.run(async (ctx) =>
    ctx.db
      .query("returns")
      .withIndex("by_sale", (q) => q.eq("saleId", a.saleId))
      .take(10),
  );
  expect(returnsCount).toHaveLength(0);
});

// 7. Empty lines rejected
test("empty lines array is rejected", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Notebook", sku: "r7", category: "Home",
    costPrice: 1, sellPrice: 2, stockQty: 10, reorderThreshold: 1,
  });
  const { saleId } = await sellOne(admin, pid, 1);

  await expect(
    admin.mutation(api.returns.createReturn, { saleId, lines: [] }),
  ).rejects.toThrow();
});

// 8. quantity < 1 rejected
test("quantity < 1 is rejected", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Lamp", sku: "r8", category: "Home",
    costPrice: 1, sellPrice: 2, stockQty: 10, reorderThreshold: 1,
  });
  const { saleId, saleItemId } = await sellOne(admin, pid, 2);

  await expect(
    admin.mutation(api.returns.createReturn, {
      saleId,
      lines: [{ saleItemId, quantity: 0 }],
    }),
  ).rejects.toThrow(/positive/i);
});

// 9. Over-return rejected with restorable message
test("over-return is rejected with restorable message", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Towel", sku: "r9", category: "Home",
    costPrice: 1, sellPrice: 2, stockQty: 10, reorderThreshold: 1,
  });
  const { saleId, saleItemId } = await sellOne(admin, pid, 3);

  await expect(
    admin.mutation(api.returns.createReturn, {
      saleId,
      lines: [{ saleItemId, quantity: 5 }],
    }),
  ).rejects.toThrow(/Maximum restorable quantity for this line is 3/);
});

// 10. Two partial returns enforce the ceiling
test("partial then over-return rejected then full succeeds", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Bottle", sku: "r10", category: "Home",
    costPrice: 1, sellPrice: 2, stockQty: 10, reorderThreshold: 1,
  });
  const { saleId, saleItemId } = await sellOne(admin, pid, 3);

  // First partial return of 1 succeeds.
  const r1 = await admin.mutation(api.returns.createReturn, {
    saleId,
    lines: [{ saleItemId, quantity: 1 }],
  });
  expect(r1.itemCount).toEqual(1);

  // Over-return of 3 now throws — only 2 restorable.
  await expect(
    admin.mutation(api.returns.createReturn, {
      saleId,
      lines: [{ saleItemId, quantity: 3 }],
    }),
  ).rejects.toThrow(/Maximum restorable quantity for this line is 2/);

  // Returning the remaining 2 succeeds — line is now fully returned.
  const r2 = await admin.mutation(api.returns.createReturn, {
    saleId,
    lines: [{ saleItemId, quantity: 2 }],
  });
  expect(r2.itemCount).toEqual(2);

  // No more can be returned.
  await expect(
    admin.mutation(api.returns.createReturn, {
      saleId,
      lines: [{ saleItemId, quantity: 1 }],
    }),
  ).rejects.toThrow(/Maximum restorable quantity for this line is 0/);
});

// 11. Multi-batch saleItem distributes proportionally
test("multi-batch return distributes proportionally and sums to returnQty", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const { pid } = await t.run(async (ctx) => {
    const pid = await ctx.db.insert("products", {
      name: "Multi", sku: "MB1", category: "C", costPrice: 5, sellPrice: 10,
      stockQty: 3, reorderThreshold: 0, isActive: true,
    });
    await ctx.db.insert("batches", {
      productId: pid, batchNumber: "A", qtyReceived: 2, qtyRemaining: 2,
      unitCost: 4, source: "stock_in", isActive: true,
    });
    await ctx.db.insert("batches", {
      productId: pid, batchNumber: "B", qtyReceived: 1, qtyRemaining: 1,
      unitCost: 6, source: "stock_in", isActive: true,
    });
    return { pid };
  });

  const { saleId, saleItemId } = await sellOne(admin, pid, 3);
  const res = await admin.mutation(api.returns.createReturn, {
    saleId,
    lines: [{ saleItemId, quantity: 2 }],
  });
  expect(res.itemCount).toEqual(2);

  const returnItems = await t.run(async (ctx) =>
    ctx.db
      .query("returnItems")
      .withIndex("by_return", (q) => q.eq("returnId", res.returnId))
      .collect(),
  );
  const sum = returnItems.reduce((s, r) => s + r.quantity, 0);
  expect(sum).toEqual(2);

  const byBatch = new Map(returnItems.map((r) => [r.batchNumberSnapshot, r.quantity]));
  const aQty = byBatch.get("A") ?? 0;
  const bQty = byBatch.get("B") ?? 0;
  expect(aQty + bQty).toEqual(2);
  expect(aQty).toBeGreaterThanOrEqual(bQty);

  // Total stock increased by 2 (was 0 after the sale, now 2).
  const p = await admin.query(api.products.getBySku, { sku: "MB1" });
  expect(p?.stockQty).toEqual(2);
});

// 12. Depleted batch re-activates
test("returning to a fully-depleted batch re-activates it", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Solo", sku: "solo1", category: "C",
    costPrice: 3, sellPrice: 5, stockQty: 1, reorderThreshold: 0,
  });
  const { saleId, saleItemId } = await sellOne(admin, pid, 1);

  // After selling the only unit, the batch is depleted.
  const before = await t.run(async (ctx) =>
    ctx.db
      .query("batches")
      .withIndex("by_product", (q) => q.eq("productId", pid))
      .unique(),
  );
  expect(before!.qtyRemaining).toEqual(0);
  expect(before!.isActive).toBe(false);

  // Returning 1 unit re-activates the batch.
  await admin.mutation(api.returns.createReturn, {
    saleId,
    lines: [{ saleItemId, quantity: 1 }],
  });

  const after = await t.run(async (ctx) =>
    ctx.db
      .query("batches")
      .withIndex("by_product", (q) => q.eq("productId", pid))
      .unique(),
  );
  expect(after!.qtyRemaining).toEqual(1);
  expect(after!.isActive).toBe(true);
});

// 13. Refund uses sale-time price (not the current product price)
test("refund uses the sale-time price snapshot, not the current price", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Reprice", sku: "rp1", category: "C",
    costPrice: 30, sellPrice: 100, stockQty: 10, reorderThreshold: 1,
  });
  const { saleId, saleItemId } = await sellOne(admin, pid, 1);

  // Reprice the product upward after the sale.
  await t.run(async (ctx) => {
    await ctx.db.patch("products", pid, { sellPrice: 120 });
  });

  const res = await admin.mutation(api.returns.createReturn, {
    saleId,
    lines: [{ saleItemId, quantity: 1 }],
  });
  expect(res.totalRefund).toEqual(100);

  const returnItems = await t.run(async (ctx) =>
    ctx.db
      .query("returnItems")
      .withIndex("by_return", (q) => q.eq("returnId", res.returnId))
      .collect(),
  );
  expect(returnItems[0].unitSellPrice).toEqual(100);
  expect(returnItems[0].lineRefund).toEqual(100);
});

// 14. Audit row written exactly once (covered by test 1; this is an explicit assertion on count)
test("exactly one audit row with action return is written per return event", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Audit", sku: "au1", category: "C",
    costPrice: 1, sellPrice: 3, stockQty: 10, reorderThreshold: 1,
  });
  const { saleId, saleItemId } = await sellOne(admin, pid, 1);

  await admin.mutation(api.returns.createReturn, {
    saleId,
    lines: [{ saleItemId, quantity: 1 }],
  });

  const returnAudits = await t.run(async (ctx) =>
    ctx.db
      .query("auditLog")
      // eslint-disable-next-line @convex-dev/no-filter-in-query -- test-only: assert return audit for this sale
      .filter((q) =>
        q.and(
          q.eq(q.field("action"), "return"),
          q.eq(q.field("entityId"), saleId),
        ),
      )
      .collect(),
  );
  expect(returnAudits).toHaveLength(1);
  expect(returnAudits[0].entityTable).toEqual("sales");
});

// ---------------------------------------------------------------------------
// Query tests
// ---------------------------------------------------------------------------

// 15. getReturn admin succeeds; cashier denied
test("getReturn admin succeeds and cashier is denied", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const cashier = await seed(t, "cashier");
  const pid = await seedProduct(t, admin, {
    name: "Q", sku: "q1", category: "C",
    costPrice: 1, sellPrice: 2, stockQty: 10, reorderThreshold: 1,
  });
  const { saleId, saleItemId } = await sellOne(admin, pid, 1);
  const res = await admin.mutation(api.returns.createReturn, {
    saleId,
    lines: [{ saleItemId, quantity: 1 }],
  });

  const got = await admin.query(api.returns.getReturn, { returnId: res.returnId });
  expect(got).not.toBeNull();
  expect(got!.return._id).toEqual(res.returnId);
  expect(got!.items).toHaveLength(1);

  await expect(
    cashier.query(api.returns.getReturn, { returnId: res.returnId }),
  ).rejects.toThrow();
});

// 16. listForSale admin succeeds, oldest-first, each enriched with items
test("listForSale returns oldest-first with items", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "List", sku: "ls1", category: "C",
    costPrice: 1, sellPrice: 2, stockQty: 10, reorderThreshold: 1,
  });
  const { saleId, saleItemId } = await sellOne(admin, pid, 3);

  const r1 = await admin.mutation(api.returns.createReturn, {
    saleId,
    lines: [{ saleItemId, quantity: 1 }],
  });
  const r2 = await admin.mutation(api.returns.createReturn, {
    saleId,
    lines: [{ saleItemId, quantity: 1 }],
  });

  const list = await admin.query(api.returns.listForSale, { saleId });
  expect(list).toHaveLength(2);
  expect(list[0]._id).toEqual(r1.returnId);
  expect(list[1]._id).toEqual(r2.returnId);
  expect(list[0].items).toHaveLength(1);
  expect(list[1].items).toHaveLength(1);
});

// 17. byPeriod admin succeeds, includes processedByName
test("byPeriod returns returns in range enriched with processedByName", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Period", sku: "pd1", category: "C",
    costPrice: 1, sellPrice: 2, stockQty: 10, reorderThreshold: 1,
  });
  const { saleId, saleItemId } = await sellOne(admin, pid, 1);

  const res = await admin.mutation(api.returns.createReturn, {
    saleId,
    lines: [{ saleItemId, quantity: 1 }],
  });

  const list = await admin.query(api.returns.byPeriod, {
    startMs: 0,
    endMs: Date.now() + 60_000,
  });
  const match = list.find((r) => r._id === res.returnId);
  expect(match).toBeDefined();
  expect(match!.processedByName).toEqual("admin");
  expect(match!.items).toHaveLength(1);
});
