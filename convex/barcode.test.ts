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
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

const base = {
  name: "Shell Advance AX7",
  category: "Oil",
  costPrice: 100,
  sellPrice: 180,
  stockQty: 0,
  reorderThreshold: 5,
};

test("getByIdentity resolves by barcode then sku", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const pid = await admin.mutation(api.products.create, {
    ...base,
    sku: "OIL-001",
    barcode: "4801234567890",
  });

  const byBarcode = await admin.query(api.products.getByIdentity, {
    code: "4801234567890",
  });
  expect(byBarcode?._id).toEqual(pid);

  const bySku = await admin.query(api.products.getByIdentity, { code: "OIL-001" });
  expect(bySku?._id).toEqual(pid);

  // Barcode takes precedence: a product whose sku equals another's barcode still
  // resolves to the barcode owner.
  await admin.mutation(api.products.create, {
    ...base,
    name: "Other",
    sku: "4801234567890",
    stockQty: 0,
  });
  const precedence = await admin.query(api.products.getByIdentity, {
    code: "4801234567890",
  });
  expect(precedence?._id).toEqual(pid);
});

test("getByBarcode returns null for empty/unknown codes", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  await admin.mutation(api.products.create, {
    ...base,
    sku: "OIL-002",
    barcode: "4801111222233",
  });
  expect(await admin.query(api.products.getByBarcode, { barcode: "4801111222233" }))
    .not.toBeNull();
  expect(await admin.query(api.products.getByBarcode, { barcode: "NOPE" })).toBeNull();
  expect(await admin.query(api.products.getByBarcode, { barcode: "  " })).toBeNull();
});

test("create rejects duplicate sku and duplicate non-empty barcode", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  await admin.mutation(api.products.create, {
    ...base,
    sku: "DUP-SKU",
    barcode: "4809999999999",
  });

  // Duplicate SKU (even with a different barcode) is rejected.
  await expect(
    admin.mutation(api.products.create, {
      ...base,
      name: "Dup SKU",
      sku: "DUP-SKU",
      barcode: "4808888888888",
    }),
  ).rejects.toThrow(/SKU.*already exists/);

  // Duplicate barcode (different SKU) is rejected.
  await expect(
    admin.mutation(api.products.create, {
      ...base,
      name: "Dup Barcode",
      sku: "UNIQ-SKU",
      barcode: "4809999999999",
    }),
  ).rejects.toThrow(/barcode.*already exists/);

  // Two products with empty barcodes are allowed (empty == "no barcode").
  const empty2 = await admin.mutation(api.products.create, {
    ...base,
    name: "Empty BC",
    sku: "EMPTY-BC-2",
    barcode: "",
  });
  expect(empty2).toBeDefined();
});

test("update rejects duplicate identity on a different product and can clear barcode", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const pidA = await admin.mutation(api.products.create, {
    ...base,
    name: "A",
    sku: "A1",
    barcode: "4807777777777",
  });
  const pidB = await admin.mutation(api.products.create, {
    ...base,
    name: "B",
    sku: "B1",
    barcode: "4806666666666",
  });

  // update fields minus stockQty (immutable on update).
  const upd = (id: string, overrides: Partial<Record<string, unknown>>) => ({
    id: id as never,
    name: "X",
    sku: "X",
    category: "Oil",
    costPrice: 100,
    sellPrice: 180,
    reorderThreshold: 5,
    ...overrides,
  });

  // Giving B the same barcode as A is rejected.
  await expect(
    admin.mutation(api.products.update, upd(pidB, { name: "B", sku: "B1", barcode: "4807777777777" })),
  ).rejects.toThrow(/barcode.*already exists/);

  // Same SKU as A is rejected.
  await expect(
    admin.mutation(api.products.update, upd(pidB, { name: "B", sku: "A1", barcode: "4806666666666" })),
  ).rejects.toThrow(/SKU.*already exists/);

  // B keeping its own barcode/sku is fine (exceptId excludes itself).
  await admin.mutation(
    api.products.update,
    upd(pidB, { name: "B2", sku: "B1", barcode: "4806666666666" }),
  );

  // Clearing A's barcode (whitespace) is allowed, normalized away to absent.
  await admin.mutation(
    api.products.update,
    upd(pidA, { name: "A", sku: "A1", barcode: "   " }),
  );
  const cleared = await admin.query(api.products.getBySku, { sku: "A1" });
  expect(cleared?.barcode ?? null).toBeNull();

  // Now B can take the freed barcode.
  await admin.mutation(
    api.products.update,
    upd(pidB, { name: "B3", sku: "B1", barcode: "4807777777777" }),
  );
});
