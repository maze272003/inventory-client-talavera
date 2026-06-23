/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function asAdmin(t: ReturnType<typeof convexTest>, name = "Admin") {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email: `${name}@a.com` });
    await ctx.db.insert("userProfiles", { userId: id, name, role: "admin" });
    return id;
  });
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

async function asCashier(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email: "c@c.com" });
    await ctx.db.insert("userProfiles", { userId: id, name: "Cash", role: "cashier" });
    return id;
  });
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

async function fakeFileId(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) =>
    ctx.storage.store(new Blob(["pdf"], { type: "application/pdf" })),
  );
}

const NOPAGE = { numItems: 50, cursor: null };

test("creating a product writes a create audit entry, enriched with userName", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t, "Boss");
  await admin.mutation(api.products.create, {
    name: "Helmet", sku: "H1", category: "Gear",
    costPrice: 100, sellPrice: 150, stockQty: 0, reorderThreshold: 2,
  });
  const latest = await admin.query(api.audit.latest, {});
  expect(latest).not.toBeNull();
  expect(latest!.entityTable).toBe("products");
  expect(latest!.action).toBe("create");
  expect(latest!.undoable).toBe(true);
  expect(latest!.reverted).toBe(false);
  expect(latest!.userName).toBe("Boss");
});

test("product archive/restore round-trip writes archive then restore audit entries", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const id = await admin.mutation(api.products.create, {
    name: "Glove", sku: "G1", category: "Gear",
    costPrice: 10, sellPrice: 20, stockQty: 0, reorderThreshold: 1,
  });

  await admin.mutation(api.products.setActive, { id, isActive: false });
  let after = await admin.query(api.products.get, { id });
  expect(after!.isActive).toBe(false);
  let latest = await admin.query(api.audit.latest, {});
  expect(latest!.action).toBe("archive");

  // Archived product appears in listArchived
  const archived = await admin.query(api.products.listArchived, { paginationOpts: NOPAGE });
  expect(archived.page.some((p) => p._id === id)).toBe(true);
  // ...and NOT in the active list (activeOnly:true)
  const active = await admin.query(api.products.list, {
    paginationOpts: NOPAGE, activeOnly: true,
  });
  expect(active.page.some((p) => p._id === id)).toBe(false);

  await admin.mutation(api.products.setActive, { id, isActive: true });
  after = await admin.query(api.products.get, { id });
  expect(after!.isActive).toBe(true);
  latest = await admin.query(api.audit.latest, {});
  expect(latest!.action).toBe("restore");
});

test("revertLatest undoes the latest update by restoring the prior field values", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const id = await admin.mutation(api.products.create, {
    name: "Original", sku: "O1", category: "Cat",
    costPrice: 5, sellPrice: 9, stockQty: 0, reorderThreshold: 1,
  });
  await admin.mutation(api.products.update, {
    id, name: "Renamed", sku: "O1", category: "Cat2",
    costPrice: 6, sellPrice: 12, reorderThreshold: 3,
  });
  let p = await admin.query(api.products.get, { id });
  expect(p!.name).toBe("Renamed");
  expect(p!.sellPrice).toBe(12);

  const latest = await admin.query(api.audit.latest, {});
  expect(latest!.action).toBe("update");
  await admin.mutation(api.audit.revertLatest, { entryId: latest!._id });

  p = await admin.query(api.products.get, { id });
  expect(p!.name).toBe("Original");
  expect(p!.category).toBe("Cat");
  expect(p!.sellPrice).toBe(9);
  expect(p!.reorderThreshold).toBe(1);

  // No new audit entry was created for the undo; entry is now marked reverted,
  // so latest falls back to the create entry.
  const newLatest = await admin.query(api.audit.latest, {});
  expect(newLatest!.action).toBe("create");
});

test("revertLatest on an archive restores the product (archive -> active)", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const id = await admin.mutation(api.products.create, {
    name: "Boot", sku: "B1", category: "Gear",
    costPrice: 10, sellPrice: 20, stockQty: 0, reorderThreshold: 1,
  });
  await admin.mutation(api.products.setActive, { id, isActive: false });
  const latest = await admin.query(api.audit.latest, {});
  expect(latest!.action).toBe("archive");
  await admin.mutation(api.audit.revertLatest, { entryId: latest!._id });
  const p = await admin.query(api.products.get, { id });
  expect(p!.isActive).toBe(true);
});

test("revertLatest throws when entryId is not the latest entry", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const id = await admin.mutation(api.products.create, {
    name: "First", sku: "F1", category: "Cat",
    costPrice: 1, sellPrice: 2, stockQty: 0, reorderThreshold: 1,
  });
  // The create entry for this product is now NOT the latest after another change.
  const createEntry = await admin.query(api.audit.latest, {});
  await admin.mutation(api.products.setActive, { id, isActive: false });
  await expect(
    admin.mutation(api.audit.revertLatest, { entryId: createEntry!._id }),
  ).rejects.toThrow("Only the latest change can be undone");
});

test("revertLatest throws when the latest entry is non-undoable (a sale)", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const pid = await admin.mutation(api.products.create, {
    name: "Candy", sku: "C9", category: "Food",
    costPrice: 1, sellPrice: 3, stockQty: 10, reorderThreshold: 1,
  });
  await admin.mutation(api.sales.createSale, {
    items: [{ productId: pid, quantity: 1 }], cashTendered: 5,
  });
  const latest = await admin.query(api.audit.latest, {});
  expect(latest!.action).toBe("sale");
  expect(latest!.undoable).toBe(false);
  await expect(
    admin.mutation(api.audit.revertLatest, { entryId: latest!._id }),
  ).rejects.toThrow("This change cannot be undone");
});

test("purchase archive/restore round-trip + revert via audit", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const fileId = await fakeFileId(t);
  const { purchaseId } = await admin.mutation(api.purchases.createPurchase, {
    fileId, supplierName: "Acme", purchaseDate: 1,
    lines: [{ newProduct: { name: "Widget", category: "X", sellPrice: 10 }, quantity: 2, unitCost: 5 }],
  });

  // Active list shows it; archived list does not.
  let active = await admin.query(api.purchases.listPurchases, { paginationOpts: NOPAGE });
  expect(active.page.some((p) => p._id === purchaseId)).toBe(true);

  await admin.mutation(api.purchases.archive, { id: purchaseId });
  active = await admin.query(api.purchases.listPurchases, { paginationOpts: NOPAGE });
  expect(active.page.some((p) => p._id === purchaseId)).toBe(false);
  const archivedList = await admin.query(api.purchases.listArchivedPurchases, {
    paginationOpts: NOPAGE,
  });
  expect(archivedList.page.some((p) => p._id === purchaseId)).toBe(true);

  // Undo the archive via revertLatest -> back to non-archived.
  const latest = await admin.query(api.audit.latest, {});
  expect(latest!.action).toBe("archive");
  expect(latest!.entityTable).toBe("purchases");
  await admin.mutation(api.audit.revertLatest, { entryId: latest!._id });
  active = await admin.query(api.purchases.listPurchases, { paginationOpts: NOPAGE });
  expect(active.page.some((p) => p._id === purchaseId)).toBe(true);
});

test("sale archive/restore excludes/includes from listReceipts; entries non-undoable", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const pid = await admin.mutation(api.products.create, {
    name: "Bar", sku: "BR1", category: "Food",
    costPrice: 1, sellPrice: 4, stockQty: 10, reorderThreshold: 1,
  });
  const { saleId, receiptNumber } = await admin.mutation(api.sales.createSale, {
    items: [{ productId: pid, quantity: 1 }], cashTendered: 10,
  });

  let receipts = await admin.query(api.sales.listReceipts, { paginationOpts: NOPAGE });
  expect(receipts.page.some((s) => s._id === saleId)).toBe(true);
  // cashierName enrichment preserved
  expect(receipts.page[0].cashierName).toBeDefined();

  await admin.mutation(api.sales.archive, { saleId });
  receipts = await admin.query(api.sales.listReceipts, { paginationOpts: NOPAGE });
  expect(receipts.page.some((s) => s._id === saleId)).toBe(false);
  // receiptNumber search branch also excludes archived
  const byNumber = await admin.query(api.sales.listReceipts, {
    paginationOpts: NOPAGE, receiptNumber,
  });
  expect(byNumber.page.some((s) => s._id === saleId)).toBe(false);

  const archived = await admin.query(api.sales.listArchivedReceipts, { paginationOpts: NOPAGE });
  expect(archived.page.some((s) => s._id === saleId)).toBe(true);
  expect(archived.page[0].cashierName).toBeDefined();

  // sale archive audit entry is non-undoable
  const latest = await admin.query(api.audit.latest, {});
  expect(latest!.entityTable).toBe("sales");
  expect(latest!.action).toBe("archive");
  expect(latest!.undoable).toBe(false);

  await admin.mutation(api.sales.restore, { saleId });
  receipts = await admin.query(api.sales.listReceipts, { paginationOpts: NOPAGE });
  expect(receipts.page.some((s) => s._id === saleId)).toBe(true);
});

test("audit.list returns all entries newest-first with userName", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t, "Zed");
  await admin.mutation(api.products.create, {
    name: "P1", sku: "P1", category: "C", costPrice: 1, sellPrice: 2, stockQty: 0, reorderThreshold: 1,
  });
  const id2 = await admin.mutation(api.products.create, {
    name: "P2", sku: "P2", category: "C", costPrice: 1, sellPrice: 2, stockQty: 0, reorderThreshold: 1,
  });
  await admin.mutation(api.products.setActive, { id: id2, isActive: false });

  const result = await admin.query(api.audit.list, { paginationOpts: NOPAGE });
  expect(result.page.length).toBe(3);
  // newest-first
  expect(result.page[0].action).toBe("archive");
  expect(result.page[0].userName).toBe("Zed");
});

test("audit.latest returns null when there are no entries", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const latest = await admin.query(api.audit.latest, {});
  expect(latest).toBeNull();
});

test("revertLatest requires admin", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const id = await admin.mutation(api.products.create, {
    name: "X", sku: "X1", category: "C", costPrice: 1, sellPrice: 2, stockQty: 0, reorderThreshold: 1,
  });
  void id;
  const latest = await admin.query(api.audit.latest, {});
  const cashier = await asCashier(t);
  await expect(
    cashier.mutation(api.audit.revertLatest, { entryId: latest!._id }),
  ).rejects.toThrow("Requires admin access");
});

test("backfillArchiveFlags sets isArchived:false on legacy rows (idempotent)", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const fileId = await fakeFileId(t);

  // Insert a legacy purchase + sale directly with no isArchived field.
  const { legacyPurchase, legacySale } = await t.run(async (ctx) => {
    const userId = (await ctx.db.query("users").take(1))[0]._id;
    const legacyPurchase = await ctx.db.insert("purchases", {
      supplierName: "Legacy", purchaseDate: 1, fileId, total: 0, itemCount: 0, userId,
    });
    const legacySale = await ctx.db.insert("sales", {
      receiptNumber: 999, total: 0, itemCount: 0, cashTendered: 0, changeGiven: 0, cashierId: userId,
    });
    return { legacyPurchase, legacySale };
  });

  // Before backfill, the legacy rows are invisible to active lists (undefined != false).
  let purchases = await admin.query(api.purchases.listPurchases, { paginationOpts: NOPAGE });
  expect(purchases.page.some((p) => p._id === legacyPurchase)).toBe(false);

  const res = await admin.mutation(api.databaseMaintenance.backfillArchiveFlags, {});
  expect(res.purchasesPatched).toBe(1);
  expect(res.salesPatched).toBe(1);

  // Now they are visible.
  purchases = await admin.query(api.purchases.listPurchases, { paginationOpts: NOPAGE });
  expect(purchases.page.some((p) => p._id === legacyPurchase)).toBe(true);
  const receipts = await admin.query(api.sales.listReceipts, { paginationOpts: NOPAGE });
  expect(receipts.page.some((s) => s._id === legacySale)).toBe(true);

  // Idempotent: a second run patches nothing.
  const res2 = await admin.mutation(api.databaseMaintenance.backfillArchiveFlags, {});
  expect(res2.purchasesPatched).toBe(0);
  expect(res2.salesPatched).toBe(0);
});

test("recordAudit snapshots actorName and actorEmail on the entry", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t, "Snapshotter");
  await admin.mutation(api.products.create, {
    name: "Tin", sku: "T1", category: "C",
    costPrice: 1, sellPrice: 2, stockQty: 0, reorderThreshold: 1,
  });
  const entry = await t.run(async (ctx) =>
    (await ctx.db.query("auditLog").order("desc").take(1))[0],
  );
  expect(entry.actorName).toBe("Snapshotter");
  expect(entry.actorEmail).toBe("Snapshotter@a.com");
});
