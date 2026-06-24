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
 * Create a product via the API (admin-only mutation) and immediately insert a
 * single matching batch so allocateFifo can drain it.  Returns the product id.
 */
async function seedProduct(
  t: ReturnType<typeof convexTest>,
  admin: Awaited<ReturnType<typeof seed>>,
  args: {
    name: string; sku: string; category: string;
    costPrice: number; sellPrice: number; stockQty: number; reorderThreshold: number;
  },
): Promise<Id<"products">> {
  // Create product with stockQty:0 so products.create does NOT generate an opening batch.
  // Then manually patch the stockQty and insert the intended batch(es) so allocateFifo
  // sees exactly one batch matching the original stockQty.
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

// Brief's primary test: stock deduction and change computation
test("createSale deducts stock and computes change", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Soap", sku: "s1", category: "Home",
    costPrice: 8, sellPrice: 12, stockQty: 10, reorderThreshold: 2,
  });
  const cashier = await seed(t, "cashier");
  const res = await cashier.mutation(api.sales.createSale, {
    items: [{ productId: pid, quantity: 3 }], cashTendered: 50,
  });
  expect(res.total).toEqual(36);
  expect(res.changeGiven).toEqual(14);
  const p = await cashier.query(api.products.getBySku, { sku: "s1" });
  expect(p?.stockQty).toEqual(7);
});

// Brief's second test: insufficient stock rejection
test("createSale rejects insufficient stock", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Soap", sku: "s2", category: "Home",
    costPrice: 8, sellPrice: 12, stockQty: 1, reorderThreshold: 2,
  });
  await expect(
    admin.mutation(api.sales.createSale, {
      items: [{ productId: pid, quantity: 5 }], cashTendered: 100,
    }),
  ).rejects.toThrow();
});

// Extra (a): receiptNumber increments across two sales
test("receiptNumber increments: first sale gets 1, second gets 2", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Widget", sku: "w1", category: "Tools",
    costPrice: 5, sellPrice: 10, stockQty: 20, reorderThreshold: 2,
  });
  const res1 = await admin.mutation(api.sales.createSale, {
    items: [{ productId: pid, quantity: 1 }], cashTendered: 10,
  });
  const res2 = await admin.mutation(api.sales.createSale, {
    items: [{ productId: pid, quantity: 1 }], cashTendered: 10,
  });
  expect(res1.receiptNumber).toEqual(1);
  expect(res2.receiptNumber).toEqual(2);
});

// Extra (b): getSale returns sale with snapshotted line items
test("getSale returns sale with correct nameSnapshot, quantity, and lineTotal", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Coffee", sku: "c1", category: "Drinks",
    costPrice: 3, sellPrice: 7, stockQty: 50, reorderThreshold: 5,
  });
  const res = await admin.mutation(api.sales.createSale, {
    items: [{ productId: pid, quantity: 4 }], cashTendered: 30,
  });
  const detail = await admin.query(api.sales.getSale, { saleId: res.saleId });
  expect(detail).not.toBeNull();
  expect(detail!.sale.total).toEqual(28);
  expect(detail!.items).toHaveLength(1);
  const item = detail!.items[0];
  expect(item.nameSnapshot).toEqual("Coffee");
  expect(item.quantity).toEqual(4);
  expect(item.lineTotal).toEqual(28);
});

// Duplicate-product aggregation: combined demand exceeds stock → reject
test("rejects oversell when same product appears twice in cart", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Widget", sku: "ov1", category: "Tools",
    costPrice: 5, sellPrice: 10, stockQty: 5, reorderThreshold: 1,
  });
  await expect(
    admin.mutation(api.sales.createSale, {
      items: [
        { productId: pid, quantity: 3 },
        { productId: pid, quantity: 4 },
      ],
      cashTendered: 100,
    }),
  ).rejects.toThrow();
});

// Duplicate-product aggregation: combined lines merge into one saleItem with correct totals
test("merges duplicate cart lines correctly", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Widget", sku: "mg1", category: "Tools",
    costPrice: 5, sellPrice: 10, stockQty: 10, reorderThreshold: 1,
  });
  const res = await admin.mutation(api.sales.createSale, {
    items: [
      { productId: pid, quantity: 2 },
      { productId: pid, quantity: 3 },
    ],
    cashTendered: 100,
  });
  // itemCount should be total units = 5
  const detail = await admin.query(api.sales.getSale, { saleId: res.saleId });
  expect(detail).not.toBeNull();
  expect(detail!.sale.itemCount).toEqual(5);
  // Exactly one saleItem for this product with merged quantity
  const items = detail!.items.filter((i) => i.productId === pid);
  expect(items).toHaveLength(1);
  expect(items[0].quantity).toEqual(5);
  // Stock deducted by 5 (10 - 5 = 5)
  const p = await admin.query(api.products.getBySku, { sku: "mg1" });
  expect(p?.stockQty).toEqual(5);
});

// Task 15: getSale returns cashier name and email
test("getSale returns the cashier name and email", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Tea", sku: "te1", category: "Drinks", costPrice: 1, sellPrice: 3, stockQty: 10, reorderThreshold: 1,
  });
  const res = await admin.mutation(api.sales.createSale, { items: [{ productId: pid, quantity: 1 }], cashTendered: 5 });
  const detail = await admin.query(api.sales.getSale, { saleId: res.saleId });
  expect(detail!.cashier.name).toBe("admin");
  expect(detail!.cashier.email).toBe("admin@a.com");
});

// Extra (c): inventoryLedger gets a "sale" row with negative quantityDelta and correct balanceAfter
test("createSale writes sale-type ledger row with negative quantityDelta and correct balanceAfter", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await seedProduct(t, admin, {
    name: "Pen", sku: "p1", category: "Stationery",
    costPrice: 1, sellPrice: 2, stockQty: 15, reorderThreshold: 3,
  });
  await admin.mutation(api.sales.createSale, {
    items: [{ productId: pid, quantity: 5 }], cashTendered: 20,
  });
  const ledgerRows = await t.run(async (ctx) => {
    return await ctx.db
      .query("inventoryLedger")
      .withIndex("by_product", (q) => q.eq("productId", pid))
      .take(10);
  });
  // There should be the opening stock_in row plus the sale row
  const saleRow = ledgerRows.find((r) => r.type === "sale");
  expect(saleRow).toBeDefined();
  expect(saleRow!.quantityDelta).toEqual(-5);
  expect(saleRow!.balanceAfter).toEqual(10); // 15 - 5
});

// Task 3: FIFO allocation — sale spanning two batches records breakdown
test("sale spanning two batches records FIFO breakdown", async () => {
  const t = convexTest(schema, modules);
  const { pid, userId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "c@d.e" });
    await ctx.db.insert("userProfiles", { userId, name: "Cashier", role: "cashier" });
    const pid = await ctx.db.insert("products", {
      name: "Widget", sku: "W1", category: "C", costPrice: 5, sellPrice: 10,
      stockQty: 8, reorderThreshold: 0, isActive: true,
    });
    await ctx.db.insert("batches", {
      productId: pid, batchNumber: "BN-1", qtyReceived: 3, qtyRemaining: 3,
      unitCost: 4, source: "stock_in", isActive: true,
    });
    await ctx.db.insert("batches", {
      productId: pid, batchNumber: "BN-2", qtyReceived: 5, qtyRemaining: 5,
      unitCost: 6, source: "stock_in", isActive: true,
    });
    return { pid, userId };
  });

  const asCashier = t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });

  const result = await asCashier.mutation(api.sales.createSale, {
    items: [{ productId: pid, quantity: 4 }],
    cashTendered: 100,
  });
  expect(result.total).toBe(40);

  const breakdown = await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("saleItemBatches")
      .withIndex("by_sale", (q) => q.eq("saleId", result.saleId))
      .collect();
    return rows
      .sort((a, b) => a.batchNumberSnapshot.localeCompare(b.batchNumberSnapshot))
      .map((r) => ({ b: r.batchNumberSnapshot, q: r.quantity }));
  });
  expect(breakdown).toEqual([{ b: "BN-1", q: 3 }, { b: "BN-2", q: 1 }]);
});

// Task 3: FIFO allocation — sale rejected when total stock across batches is insufficient
test("sale rejected when total stock across batches is insufficient", async () => {
  const t = convexTest(schema, modules);
  const { pid, userId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "x@y.z" });
    await ctx.db.insert("userProfiles", { userId, name: "Cashier", role: "cashier" });
    const pid = await ctx.db.insert("products", {
      name: "Widget", sku: "W2", category: "C", costPrice: 5, sellPrice: 10,
      stockQty: 2, reorderThreshold: 0, isActive: true,
    });
    await ctx.db.insert("batches", {
      productId: pid, batchNumber: "BN-1", qtyReceived: 2, qtyRemaining: 2,
      unitCost: 5, source: "stock_in", isActive: true,
    });
    return { pid, userId };
  });

  const asCashier = t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });

  await expect(
    asCashier.mutation(api.sales.createSale, {
      items: [{ productId: pid, quantity: 5 }], cashTendered: 100,
    }),
  ).rejects.toThrow(/Insufficient stock/);
});

// Task 10: getSale returns per-item batch breakdown
test("getSale returns per-item batch breakdown", async () => {
  const t = convexTest(schema, modules);
  const { pid, userId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "bd@test.com" });
    await ctx.db.insert("userProfiles", { userId, name: "Cashier", role: "cashier" });
    const pid = await ctx.db.insert("products", {
      name: "Widget", sku: "BD1", category: "C", costPrice: 5, sellPrice: 10,
      stockQty: 8, reorderThreshold: 0, isActive: true,
    });
    await ctx.db.insert("batches", {
      productId: pid, batchNumber: "BN-1", qtyReceived: 3, qtyRemaining: 3,
      unitCost: 4, source: "stock_in", isActive: true,
    });
    await ctx.db.insert("batches", {
      productId: pid, batchNumber: "BN-2", qtyReceived: 5, qtyRemaining: 5,
      unitCost: 6, source: "stock_in", isActive: true,
    });
    return { pid, userId };
  });

  const asCashier = t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });

  const result = await asCashier.mutation(api.sales.createSale, {
    items: [{ productId: pid, quantity: 4 }],
    cashTendered: 100,
  });

  const sale = await asCashier.query(api.sales.getSale, { saleId: result.saleId });
  expect(sale).not.toBeNull();
  const itemId = sale!.items[0]._id;
  expect(
    sale!.batchBreakdown[itemId].map((x: { batchNumber: string; quantity: number }) => x.batchNumber).sort()
  ).toEqual(["BN-1", "BN-2"]);
});
