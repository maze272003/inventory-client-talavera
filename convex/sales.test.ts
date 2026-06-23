/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seed(t: ReturnType<typeof convexTest>, role: "admin" | "cashier") {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email: `${role}@a.com` });
    await ctx.db.insert("userProfiles", { userId: id, name: role, role });
    return id;
  });
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

// Brief's primary test: stock deduction and change computation
test("createSale deducts stock and computes change", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await admin.mutation(api.products.create, {
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
  const pid = await admin.mutation(api.products.create, {
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
  const pid = await admin.mutation(api.products.create, {
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
  const pid = await admin.mutation(api.products.create, {
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
  const pid = await admin.mutation(api.products.create, {
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
  const pid = await admin.mutation(api.products.create, {
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
  const pid = await admin.mutation(api.products.create, {
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
  const pid = await admin.mutation(api.products.create, {
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
