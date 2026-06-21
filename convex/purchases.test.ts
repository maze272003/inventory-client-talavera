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
  return { t: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

async function fakeFileId(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => await ctx.storage.store(new Blob(["pdf"], { type: "application/pdf" })));
}

test("createPurchase creates new products and stocks in", async () => {
  const t = convexTest(schema, modules);
  const { t: admin } = await asAdmin(t);
  const fileId = await fakeFileId(t);
  const res = await admin.mutation(api.purchases.createPurchase, {
    fileId, supplierName: "Supplier A", referenceNumber: "508238", purchaseDate: 1,
    lines: [
      { newProduct: { name: "Mag Wheels Cruiser", model: "CRUISER", category: "Wheels", sellPrice: 1800 }, quantity: 1, unitCost: 1650 },
      { newProduct: { name: "Honda Oil 4T", model: "Scooter", category: "Oil", sellPrice: 380 }, quantity: 24, unitCost: 305 },
    ],
  });
  expect(res.productsCreated).toEqual(2);
  expect(res.linesImported).toEqual(2);
  expect(res.total).toEqual(1650 * 1 + 305 * 24);
});

test("createPurchase stocks into an existing product and writes a stock_in ledger row", async () => {
  const t = convexTest(schema, modules);
  const { t: admin } = await asAdmin(t);
  const fileId = await fakeFileId(t);
  const pid = await admin.mutation(api.products.create, {
    name: "Tire Sealant", sku: "TS1", category: "Tires", costPrice: 50, sellPrice: 70, stockQty: 5, reorderThreshold: 2,
  });
  await admin.mutation(api.purchases.createPurchase, {
    fileId, supplierName: "Supplier A", purchaseDate: 1,
    lines: [{ existingProductId: pid, quantity: 10, unitCost: 54 }],
  });
  const product = await admin.query(api.products.getBySku, { sku: "TS1" });
  expect(product?.stockQty).toEqual(15);
  const rows = await t.run(async (ctx) =>
    ctx.db.query("inventoryLedger").withIndex("by_product", (q) => q.eq("productId", pid)).take(10));
  const stockIn = rows.find((r) => r.type === "stock_in" && r.balanceAfter === 15);
  expect(stockIn?.quantityDelta).toEqual(10);
  expect(stockIn?.unitCost).toEqual(54);
  expect(stockIn?.purchaseId).toBeDefined();
});

test("createPurchase rejects a line with neither existing nor new product", async () => {
  const t = convexTest(schema, modules);
  const { t: admin } = await asAdmin(t);
  const fileId = await fakeFileId(t);
  await expect(
    admin.mutation(api.purchases.createPurchase, {
      fileId, supplierName: "X", purchaseDate: 1,
      lines: [{ quantity: 1, unitCost: 1 }],
    }),
  ).rejects.toThrow();
});

test("createPurchase atomic rollback: invalid 2nd line leaves 1st product unchanged", async () => {
  const t = convexTest(schema, modules);
  const { t: admin } = await asAdmin(t);
  const fileId = await fakeFileId(t);
  const pid = await admin.mutation(api.products.create, {
    name: "Chain Lube", sku: "CL1", category: "Lubricants", costPrice: 80, sellPrice: 120, stockQty: 10, reorderThreshold: 3,
  });
  // Second line has both existingProductId and newProduct — invalid (both set = !a===!b fails)
  await expect(
    admin.mutation(api.purchases.createPurchase, {
      fileId, supplierName: "Supplier B", purchaseDate: 1,
      lines: [
        { existingProductId: pid, quantity: 5, unitCost: 80 },
        { existingProductId: pid, newProduct: { name: "Duplicate", category: "X", sellPrice: 10 }, quantity: 1, unitCost: 1 },
      ],
    }),
  ).rejects.toThrow();
  // stockQty must remain 10 (rollback)
  const product = await admin.query(api.products.getBySku, { sku: "CL1" });
  expect(product?.stockQty).toEqual(10);
});
