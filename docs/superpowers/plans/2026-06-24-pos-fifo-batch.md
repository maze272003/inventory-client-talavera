# POS FIFO Multi-Batch Inventory + UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All UI tasks (Phase F–I) MUST invoke the `frontend-design` skill before writing component markup.**

**Goal:** Add real multi-batch FIFO inventory (oldest-batch-first allocation at checkout) and overhaul the POS into a fast, touch-friendly, infinite-scrolling interface that displays batch numbers and supports camera barcode scanning.

**Architecture:** A new `batches` table becomes the source of truth for on-hand quantity; `products.stockQty` is a denormalized cached sum kept in sync inside every mutation. A shared `allocateFifo` helper drains oldest batches first inside the `createSale` transaction, so overselling is impossible. The POS UI is a responsive two-panel layout backed by paginated queries, infinite scroll, lazy images, and a JS barcode decoder.

**Tech Stack:** Convex (`^1.36`), Next.js 16 / React 19, Tailwind v4, TypeScript, `convex-test` + `vitest`, `@zxing/browser` (barcode decoding).

**Spec:** `docs/superpowers/specs/2026-06-24-pos-fifo-batch-design.md`

## Global Constraints

- Convex rules in `convex/_generated/ai/guidelines.md` override training data. No `.filter()` in DB queries — use indexes. No unbounded `.collect()` — use `.take(n)` or `.paginate()`.
- Never accept a `userId` as an argument for auth; derive via `requireUser`/`requireRole` (`convex/lib/auth.ts`).
- Every mutation that touches stock writes an `inventoryLedger` row and (where the existing code does) a `recordAudit` row.
- Batch numbers use the existing `nextBatchNumber(ctx, atMs)` / counter in `convex/lib/batch.ts`. Format: `BN-YYYYMMDD-NNNN`.
- `products.stockQty` MUST always equal the sum of `qtyRemaining` over the product's `isActive` batches after any mutation.
- No expiry tracking anywhere. FIFO orders strictly by batch `_creationTime` ascending.
- SKU is the barcode; no separate barcode column.
- Tests: `convex-test` + `vitest`, files in `convex/`, `environment: "edge-runtime"`. Run with `npm test`.
- Run `npm run typecheck` and `npm run lint` clean before each commit that ends a task.
- Commit message footer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

**Backend (new):**
- `convex/lib/fifo.ts` — `allocateFifo`, `recomputeStockQty` helpers (pure DB logic).
- `convex/batches.ts` — `listForProduct` query, `findByBatchNumber` query.
- `convex/migrations.ts` — `backfillBatches` internalMutation (self-scheduling).

**Backend (modified):**
- `convex/schema.ts` — add `batches`, `saleItemBatches`; add `batchId` to `inventoryLedger`.
- `convex/sales.ts` — rewrite `createSale`; enrich `getSale` with batch breakdown.
- `convex/inventory.ts` — `stockIn` (new/existing batch), `adjust` (FIFO reconcile).
- `convex/products.ts` — `create` opening batch; `list` batch summary + `stockFilter`; new `categories` query.
- `convex/purchases.ts` — `createPurchase` one batch per line.

**Frontend (new):**
- `components/CameraScanner.tsx` — camera modal + barcode decoder.
- `components/pos/CategoryChips.tsx` — category filter row.
- `components/pos/PosFilters.tsx` — stock-availability filter control.

**Frontend (modified):**
- `app/(app)/pos/page.tsx` — two-panel layout, filters, scan button.
- `components/ProductGrid.tsx` — infinite scroll, batch display, lazy images, filters.
- `components/ProductSearch.tsx` — SKU→batch→name lookup chain + camera result intake.
- `components/Cart.tsx` — per-line FIFO batch preview.
- `components/Receipt.tsx` — batch breakdown per line.
- `components/StockInDialog.tsx` — new-batch vs existing-batch choice.
- `package.json` — add `@zxing/browser`.

---

## PHASE A — Schema & FIFO foundation

### Task 1: Add `batches`, `saleItemBatches` tables and ledger `batchId`

**Files:**
- Modify: `convex/schema.ts`

**Interfaces:**
- Produces: `batches` table (`productId`, `batchNumber`, `qtyReceived`, `qtyRemaining`, `unitCost`, `source`, `purchaseId?`, `isActive`) with indexes `by_product`, `by_product_active` (`["productId","isActive"]`), `by_batchNumber`. `saleItemBatches` table (`saleItemId`, `saleId`, `batchId`, `batchNumberSnapshot`, `quantity`, `unitCost`) with indexes `by_saleItem`, `by_sale`. `inventoryLedger.batchId?` + index `by_batch`.

- [ ] **Step 1: Add the tables to the schema**

In `convex/schema.ts`, add a shared validator near the top (after `ledgerTypeValidator`):

```ts
export const batchSourceValidator = v.union(
  v.literal("opening"),
  v.literal("stock_in"),
  v.literal("purchase"),
  v.literal("adjustment"),
  v.literal("migration"),
);
```

Add these tables inside `defineSchema({ ... })`:

```ts
  batches: defineTable({
    productId: v.id("products"),
    batchNumber: v.string(),
    qtyReceived: v.number(),
    qtyRemaining: v.number(),
    unitCost: v.number(),
    source: batchSourceValidator,
    purchaseId: v.optional(v.id("purchases")),
    isActive: v.boolean(),
  })
    .index("by_product", ["productId"])
    .index("by_product_active", ["productId", "isActive"])
    .index("by_batchNumber", ["batchNumber"]),

  saleItemBatches: defineTable({
    saleItemId: v.id("saleItems"),
    saleId: v.id("sales"),
    batchId: v.id("batches"),
    batchNumberSnapshot: v.string(),
    quantity: v.number(),
    unitCost: v.number(),
  })
    .index("by_saleItem", ["saleItemId"])
    .index("by_sale", ["saleId"]),
```

- [ ] **Step 2: Add `batchId` to `inventoryLedger`**

In the `inventoryLedger` table definition, add the field after `purchaseId`:

```ts
    batchId: v.optional(v.id("batches")),
```

and add an index in its index chain:

```ts
    .index("by_batch", ["batchId"])
```

- [ ] **Step 3: Push schema and verify it compiles**

Run: `npx convex dev --once`
Expected: schema deploys with no validation error; `convex/_generated` regenerates including `batches`/`saleItemBatches`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(schema): add batches, saleItemBatches, ledger batchId"
```

---

### Task 2: FIFO allocation + cached-sum helpers

**Files:**
- Create: `convex/lib/fifo.ts`
- Test: `convex/fifo.test.ts`

**Interfaces:**
- Produces:
  - `type Allocation = { batchId: Id<"batches">; batchNumber: string; quantity: number; unitCost: number }`
  - `async function allocateFifo(ctx: MutationCtx, productId: Id<"products">, quantity: number, ledgerType: "sale" | "adjustment", refs: { saleId?: Id<"sales">; userId: Id<"users"> }): Promise<Allocation[]>` — drains oldest active batches first, patches `qtyRemaining`, deactivates depleted batches, writes one `inventoryLedger` row per batch touched, updates `products.stockQty`. Throws `Insufficient stock for <name>` if total active remaining < quantity (writing nothing — caller's transaction rolls back).
  - `async function recomputeStockQty(ctx: MutationCtx, productId: Id<"products">): Promise<number>` — sums `qtyRemaining` over active batches, patches `products.stockQty`, returns it.
  - `async function activeBatchesOldestFirst(ctx, productId): Promise<Doc<"batches">[]>` — bounded read (`.take(500)`) of active batches in ascending creation order.

- [ ] **Step 1: Write the failing test**

Create `convex/fifo.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fifo`
Expected: FAIL — `./lib/fifo` not found / `allocateFifo is not a function`.

- [ ] **Step 3: Implement `convex/lib/fifo.ts`**

```ts
import { MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

export type Allocation = {
  batchId: Id<"batches">;
  batchNumber: string;
  quantity: number;
  unitCost: number;
};

/** Active batches for a product, oldest first (FIFO order). Bounded read. */
export async function activeBatchesOldestFirst(
  ctx: MutationCtx,
  productId: Id<"products">,
): Promise<Doc<"batches">[]> {
  return await ctx.db
    .query("batches")
    .withIndex("by_product_active", (q) =>
      q.eq("productId", productId).eq("isActive", true),
    )
    .order("asc")
    .take(500);
}

/** Recompute and persist products.stockQty as the sum of active batch remainders. */
export async function recomputeStockQty(
  ctx: MutationCtx,
  productId: Id<"products">,
): Promise<number> {
  const batches = await activeBatchesOldestFirst(ctx, productId);
  const total = batches.reduce((n, b) => n + b.qtyRemaining, 0);
  await ctx.db.patch("products", productId, { stockQty: total });
  return total;
}

/**
 * Allocate `quantity` from a product's batches oldest-first. Patches batch
 * remainders, deactivates depleted batches, writes one ledger row per batch
 * touched, and updates products.stockQty. Throws (writing nothing the caller
 * cannot roll back) when active stock is insufficient.
 */
export async function allocateFifo(
  ctx: MutationCtx,
  productId: Id<"products">,
  quantity: number,
  ledgerType: "sale" | "adjustment",
  refs: { saleId?: Id<"sales">; userId: Id<"users"> },
): Promise<Allocation[]> {
  if (quantity <= 0) throw new Error("Quantity must be positive");
  const product = await ctx.db.get("products", productId);
  if (!product) throw new Error("Product not found");

  const batches = await activeBatchesOldestFirst(ctx, productId);
  const available = batches.reduce((n, b) => n + b.qtyRemaining, 0);
  if (available < quantity) {
    throw new Error(`Insufficient stock for ${product.name}`);
  }

  const allocations: Allocation[] = [];
  let needed = quantity;
  let runningStock = available;

  for (const batch of batches) {
    if (needed <= 0) break;
    const take = Math.min(batch.qtyRemaining, needed);
    if (take <= 0) continue;
    const newRemaining = batch.qtyRemaining - take;
    await ctx.db.patch("batches", batch._id, {
      qtyRemaining: newRemaining,
      isActive: newRemaining > 0,
    });
    needed -= take;
    runningStock -= take;
    await ctx.db.insert("inventoryLedger", {
      productId,
      type: ledgerType,
      quantityDelta: -take,
      balanceAfter: runningStock,
      batchId: batch._id,
      saleId: refs.saleId,
      userId: refs.userId,
    });
    allocations.push({
      batchId: batch._id,
      batchNumber: batch.batchNumber,
      quantity: take,
      unitCost: batch.unitCost,
    });
  }

  await ctx.db.patch("products", productId, { stockQty: runningStock });
  return allocations;
}

/** Weighted-average unit cost across an allocation set. */
export function weightedAvgCost(allocations: Allocation[]): number {
  const qty = allocations.reduce((n, a) => n + a.quantity, 0);
  if (qty === 0) return 0;
  const cost = allocations.reduce((n, a) => n + a.unitCost * a.quantity, 0);
  return cost / qty;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fifo`
Expected: PASS (both tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
```bash
git add convex/lib/fifo.ts convex/fifo.test.ts
git commit -m "feat(fifo): oldest-first batch allocation helper"
```

---

## PHASE B — Sales use FIFO

### Task 3: Rewrite `createSale` to allocate across batches

**Files:**
- Modify: `convex/sales.ts:22-101` (the `createSale` mutation)
- Test: `convex/sales.test.ts` (add cases)

**Interfaces:**
- Consumes: `allocateFifo`, `weightedAvgCost` from `./lib/fifo`.
- Produces: `createSale` writes one `saleItems` row per product (unchanged shape; `unitCostPrice` = weighted-avg of allocated batch costs) and one `saleItemBatches` row per batch consumed. Ledger rows are written by `allocateFifo`. Return value unchanged: `{ saleId, receiptNumber, total, changeGiven }`.

- [ ] **Step 1: Write the failing test**

Add to `convex/sales.test.ts` (follow existing helpers in that file for auth/seed; if it seeds a product with `stockQty` directly, add a sibling helper that also inserts batches). New test:

```ts
test("sale spanning two batches records FIFO breakdown", async () => {
  const t = convexTest(schema, modules);
  // Arrange: admin + product with batches [3 @cost4, 5 @cost6]; sellPrice 10.
  const { pid } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "c@d.e" } as any);
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
    return { pid };
  });

  const asCashier = t.withIdentity({ name: "Cashier" });
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

test("sale rejected when total stock across batches is insufficient", async () => {
  const t = convexTest(schema, modules);
  const { pid } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "x@y.z" } as any);
    await ctx.db.insert("userProfiles", { userId, name: "Cashier", role: "cashier" });
    const pid = await ctx.db.insert("products", {
      name: "Widget", sku: "W1", category: "C", costPrice: 5, sellPrice: 10,
      stockQty: 2, reorderThreshold: 0, isActive: true,
    });
    await ctx.db.insert("batches", {
      productId: pid, batchNumber: "BN-1", qtyReceived: 2, qtyRemaining: 2,
      unitCost: 5, source: "stock_in", isActive: true,
    });
    return { pid };
  });
  const asCashier = t.withIdentity({ name: "Cashier" });
  await expect(
    asCashier.mutation(api.sales.createSale, {
      items: [{ productId: pid, quantity: 5 }], cashTendered: 100,
    }),
  ).rejects.toThrow(/Insufficient stock/);
});
```

> NOTE for implementer: `t.withIdentity` must resolve to the seeded cashier the way the existing `sales.test.ts` does it. Reuse that file's established auth helper rather than the sketch above if it differs.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- sales`
Expected: FAIL — no `saleItemBatches` rows / `createSale` still deducts `stockQty` directly.

- [ ] **Step 3: Rewrite the `createSale` handler body**

Replace the per-line loop and validation in `convex/sales.ts`. Imports at top:

```ts
import { allocateFifo, weightedAvgCost } from "./lib/fifo";
```

New handler (keep `nextReceiptNumber`, merge logic, cash/total validation skeleton):

```ts
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    if (args.items.length === 0) throw new Error("Cart is empty");

    const merged = new Map<Id<"products">, number>();
    for (const item of args.items) {
      if (item.quantity <= 0) throw new Error("Quantity must be positive");
      merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
    }

    // Validate availability and price up front (FIFO walk happens after the
    // sale header exists so ledger rows can carry saleId).
    const lines: Array<{ product: Doc<"products">; quantity: number; lineTotal: number }> = [];
    let total = 0;
    for (const [productId, quantity] of merged.entries()) {
      const product = await ctx.db.get("products", productId);
      if (!product || !product.isActive) throw new Error("Product unavailable");
      if (product.stockQty < quantity) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }
      const lineTotal = product.sellPrice * quantity;
      total += lineTotal;
      lines.push({ product, quantity, lineTotal });
    }

    if (args.cashTendered < total) throw new Error("Insufficient cash tendered");
    const changeGiven = args.cashTendered - total;
    const receiptNumber = await nextReceiptNumber(ctx);

    const saleId = await ctx.db.insert("sales", {
      receiptNumber,
      total,
      itemCount: lines.reduce((n, l) => n + l.quantity, 0),
      cashTendered: args.cashTendered,
      changeGiven,
      cashierId: userId,
      isArchived: false,
    });

    for (const l of lines) {
      // FIFO allocation: patches batches, writes ledger rows, updates stockQty.
      const allocations = await allocateFifo(ctx, l.product._id, l.quantity, "sale", {
        saleId,
        userId,
      });
      const unitCostPrice = weightedAvgCost(allocations);
      const saleItemId = await ctx.db.insert("saleItems", {
        saleId,
        productId: l.product._id,
        nameSnapshot: l.product.name,
        skuSnapshot: l.product.sku,
        unitSellPrice: l.product.sellPrice,
        unitCostPrice,
        quantity: l.quantity,
        lineTotal: l.lineTotal,
      });
      for (const a of allocations) {
        await ctx.db.insert("saleItemBatches", {
          saleItemId,
          saleId,
          batchId: a.batchId,
          batchNumberSnapshot: a.batchNumber,
          quantity: a.quantity,
          unitCost: a.unitCost,
        });
      }
    }

    await recordAudit(ctx, {
      entityTable: "sales",
      entityId: saleId,
      action: "sale",
      summary: `Sale receipt #${receiptNumber} (total ${total})`,
      after: { receiptNumber, total },
      undoable: false,
      userId,
    });

    return { saleId, receiptNumber, total, changeGiven };
  },
```

Remove the old block that patched `product.stockQty` and inserted the single ledger row — `allocateFifo` now owns both.

- [ ] **Step 4: Run tests**

Run: `npm test -- sales`
Expected: PASS, including the existing single-batch cases (a product with one batch still deducts correctly).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
```bash
git add convex/sales.ts convex/sales.test.ts
git commit -m "feat(sales): FIFO batch allocation at checkout"
```

---

## PHASE C — Stock-creating paths make batches

### Task 4: Opening-balance batch in `products.create`

**Files:**
- Modify: `convex/products.ts:14-53` (`create`)
- Test: `convex/products.test.ts` (create if absent)

**Interfaces:**
- Consumes: `nextBatchNumber` (already imported), `recomputeStockQty` is NOT needed here (qty is known).
- Produces: a product created with `stockQty > 0` also has exactly one `batches` row (`source:"opening"`, `qtyReceived = qtyRemaining = stockQty`, `unitCost = costPrice`, `batchNumber` = the product's `batchNumber`).

- [ ] **Step 1: Write the failing test**

Create `convex/products.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedAdmin(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "admin@t.co" } as any);
    await ctx.db.insert("userProfiles", { userId, name: "Admin", role: "admin" });
  });
  return t.withIdentity({ name: "Admin" });
}

test("creating a product with opening stock creates one opening batch", async () => {
  const t = convexTest(schema, modules);
  const admin = await seedAdmin(t);
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
```

> NOTE: `seedAdmin` must match how `requireRole(ctx,"admin")` resolves identity in this codebase (see `convex/lib/auth.ts`); reuse the pattern from `convex/users.test.ts` if it differs.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- products`
Expected: FAIL — zero batches found.

- [ ] **Step 3: Implement**

In `convex/products.ts` `create`, after inserting the product and before/instead of the opening ledger row, create the opening batch:

```ts
    const id = await ctx.db.insert("products", { ...args, isActive: true, batchNumber });
    if (args.stockQty > 0) {
      const batchId = await ctx.db.insert("batches", {
        productId: id,
        batchNumber,
        qtyReceived: args.stockQty,
        qtyRemaining: args.stockQty,
        unitCost: args.costPrice,
        source: "opening",
        isActive: true,
      });
      await ctx.db.insert("inventoryLedger", {
        productId: id,
        type: "stock_in",
        quantityDelta: args.stockQty,
        balanceAfter: args.stockQty,
        unitCost: args.costPrice,
        reason: "Opening balance",
        batchId,
        userId,
      });
    }
```

- [ ] **Step 4: Run test, typecheck, commit**

Run: `npm test -- products` → PASS. `npm run typecheck`.
```bash
git add convex/products.ts convex/products.test.ts
git commit -m "feat(products): opening balance creates a batch"
```

---

### Task 5: `stockIn` — new batch or add to existing

**Files:**
- Modify: `convex/inventory.ts:7-39` (`stockIn`)
- Test: `convex/inventory.test.ts` (add cases)

**Interfaces:**
- Consumes: `recomputeStockQty` from `./lib/fifo`, `nextBatchNumber` from `./lib/batch`.
- Produces: `stockIn` args gain `targetBatchId: v.optional(v.id("batches"))`. No `targetBatchId` → new batch (`source:"stock_in"`). With `targetBatchId` → that batch's `qtyReceived`/`qtyRemaining` increase and `isActive` set true. `stockQty` recomputed either way; ledger row carries `batchId`.

- [ ] **Step 1: Write the failing tests**

Add to `convex/inventory.test.ts`:

```ts
test("stockIn without targetBatchId creates a new batch", async () => {
  const t = convexTest(schema, modules);
  const { admin, pid } = await /* seed admin + product (stockQty 0) */ seedAdminAndProduct(t);
  await admin.mutation(api.inventory.stockIn, { productId: pid, quantity: 7, unitCost: 3 });
  const { batchCount, stockQty } = await t.run(async (ctx) => {
    const bs = await ctx.db.query("batches").withIndex("by_product", (q) => q.eq("productId", pid)).collect();
    const p = await ctx.db.get("products", pid);
    return { batchCount: bs.length, stockQty: p!.stockQty };
  });
  expect(batchCount).toBe(1);
  expect(stockQty).toBe(7);
});

test("stockIn with targetBatchId adds to that batch", async () => {
  const t = convexTest(schema, modules);
  const { admin, pid } = await seedAdminAndProduct(t);
  await admin.mutation(api.inventory.stockIn, { productId: pid, quantity: 4, unitCost: 3 });
  const batchId = await t.run(async (ctx) =>
    (await ctx.db.query("batches").withIndex("by_product", (q) => q.eq("productId", pid)).first())!._id);
  await admin.mutation(api.inventory.stockIn, { productId: pid, quantity: 6, targetBatchId: batchId });
  const { batchCount, remaining, stockQty } = await t.run(async (ctx) => {
    const bs = await ctx.db.query("batches").withIndex("by_product", (q) => q.eq("productId", pid)).collect();
    const p = await ctx.db.get("products", pid);
    return { batchCount: bs.length, remaining: bs[0].qtyRemaining, stockQty: p!.stockQty };
  });
  expect(batchCount).toBe(1);
  expect(remaining).toBe(10);
  expect(stockQty).toBe(10);
});
```

Add a `seedAdminAndProduct` helper at the top of the test file (admin profile + product with `stockQty: 0`), mirroring the auth pattern already used in that file.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- inventory`
Expected: FAIL — `targetBatchId` not a valid arg / no batches created.

- [ ] **Step 3: Implement**

Replace `stockIn` in `convex/inventory.ts`:

```ts
import { recomputeStockQty } from "./lib/fifo";
import { nextBatchNumber } from "./lib/batch";

export const stockIn = mutation({
  args: {
    productId: v.id("products"),
    quantity: v.number(),
    unitCost: v.optional(v.number()),
    targetBatchId: v.optional(v.id("batches")),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, "admin");
    if (args.quantity <= 0) throw new Error("Quantity must be positive");
    const product = await ctx.db.get("products", args.productId);
    if (!product) throw new Error("Product not found");
    const unitCost = args.unitCost ?? product.costPrice;

    let batchId: Id<"batches">;
    if (args.targetBatchId) {
      const batch = await ctx.db.get("batches", args.targetBatchId);
      if (!batch || batch.productId !== args.productId) {
        throw new Error("Batch not found for this product");
      }
      await ctx.db.patch("batches", batch._id, {
        qtyReceived: batch.qtyReceived + args.quantity,
        qtyRemaining: batch.qtyRemaining + args.quantity,
        isActive: true,
      });
      batchId = batch._id;
    } else {
      batchId = await ctx.db.insert("batches", {
        productId: args.productId,
        batchNumber: await nextBatchNumber(ctx, Date.now()),
        qtyReceived: args.quantity,
        qtyRemaining: args.quantity,
        unitCost,
        source: "stock_in",
        isActive: true,
      });
    }

    const balanceAfter = await recomputeStockQty(ctx, args.productId);
    await ctx.db.insert("inventoryLedger", {
      productId: args.productId,
      type: "stock_in",
      quantityDelta: args.quantity,
      balanceAfter,
      unitCost,
      batchId,
      userId,
    });
    await recordAudit(ctx, {
      entityTable: "products",
      entityId: args.productId,
      action: "stock_in",
      summary: `Stocked in ${args.quantity} of ${product.name}`,
      before: { stockQty: product.stockQty },
      after: { stockQty: balanceAfter },
      undoable: false,
      userId,
    });
  },
});
```

Add `import { Id } from "./_generated/dataModel";` if not present.

- [ ] **Step 4: Run tests, typecheck, commit**

Run: `npm test -- inventory` → PASS. `npm run typecheck`.
```bash
git add convex/inventory.ts convex/inventory.test.ts
git commit -m "feat(inventory): stockIn creates or extends a batch"
```

---

### Task 6: `adjust` — reconcile to batches via FIFO

**Files:**
- Modify: `convex/inventory.ts:41-73` (`adjust`)
- Test: `convex/inventory.test.ts` (add cases)

**Interfaces:**
- Consumes: `allocateFifo`, `recomputeStockQty`, `nextBatchNumber`.
- Produces: `adjust` keeps args (`productId`, `newQuantity`, `reason`). Decrease drains FIFO (`type:"adjustment"`); increase creates one `source:"adjustment"` batch; `stockQty` ends equal to `newQuantity`.

- [ ] **Step 1: Write failing tests**

```ts
test("adjust down drains oldest batch first", async () => {
  const t = convexTest(schema, modules);
  const { admin, pid } = await seedAdminAndProduct(t);
  await admin.mutation(api.inventory.stockIn, { productId: pid, quantity: 3, unitCost: 2 });
  await admin.mutation(api.inventory.stockIn, { productId: pid, quantity: 5, unitCost: 2 }); // total 8
  await admin.mutation(api.inventory.adjust, { productId: pid, newQuantity: 4, reason: "count" });
  const { remaining, stockQty } = await t.run(async (ctx) => {
    const bs = (await ctx.db.query("batches").withIndex("by_product", (q) => q.eq("productId", pid)).collect())
      .sort((a, b) => a._creationTime - b._creationTime);
    const p = await ctx.db.get("products", pid);
    return { remaining: bs.map((b) => b.qtyRemaining), stockQty: p!.stockQty };
  });
  expect(remaining).toEqual([0, 4]); // drained the first batch, then 1 from second
  expect(stockQty).toBe(4);
});

test("adjust up creates an adjustment batch", async () => {
  const t = convexTest(schema, modules);
  const { admin, pid } = await seedAdminAndProduct(t);
  await admin.mutation(api.inventory.stockIn, { productId: pid, quantity: 2, unitCost: 2 });
  await admin.mutation(api.inventory.adjust, { productId: pid, newQuantity: 9, reason: "found" });
  const { sources, stockQty } = await t.run(async (ctx) => {
    const bs = await ctx.db.query("batches").withIndex("by_product", (q) => q.eq("productId", pid)).collect();
    const p = await ctx.db.get("products", pid);
    return { sources: bs.map((b) => b.source).sort(), stockQty: p!.stockQty };
  });
  expect(sources).toEqual(["adjustment", "stock_in"]);
  expect(stockQty).toBe(9);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- inventory`
Expected: FAIL — batches not reconciled.

- [ ] **Step 3: Implement**

Replace `adjust`'s body in `convex/inventory.ts`:

```ts
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, "admin");
    if (args.newQuantity < 0) throw new Error("Quantity cannot be negative");
    const product = await ctx.db.get("products", args.productId);
    if (!product) throw new Error("Product not found");
    const delta = args.newQuantity - product.stockQty;

    if (delta < 0) {
      await allocateFifo(ctx, args.productId, -delta, "adjustment", { userId });
    } else if (delta > 0) {
      const batchId = await ctx.db.insert("batches", {
        productId: args.productId,
        batchNumber: await nextBatchNumber(ctx, Date.now()),
        qtyReceived: delta,
        qtyRemaining: delta,
        unitCost: product.costPrice,
        source: "adjustment",
        isActive: true,
      });
      const balanceAfter = await recomputeStockQty(ctx, args.productId);
      await ctx.db.insert("inventoryLedger", {
        productId: args.productId,
        type: "adjustment",
        quantityDelta: delta,
        balanceAfter,
        reason: args.reason,
        batchId,
        userId,
      });
    }
    // delta === 0 → no-op stock change.

    await recordAudit(ctx, {
      entityTable: "products",
      entityId: args.productId,
      action: "adjustment",
      summary: `Adjusted ${product.name} to ${args.newQuantity} (${args.reason})`,
      before: { stockQty: product.stockQty },
      after: { stockQty: args.newQuantity },
      undoable: false,
      userId,
    });
  },
```

Add imports `allocateFifo` (and ensure `recomputeStockQty`, `nextBatchNumber` imported). Note: when `delta < 0`, `allocateFifo` already writes the ledger row(s); the explicit ledger insert is only for the increase branch.

- [ ] **Step 4: Run tests, typecheck, commit**

Run: `npm test -- inventory` → PASS. `npm run typecheck`.
```bash
git add convex/inventory.ts convex/inventory.test.ts
git commit -m "feat(inventory): adjust reconciles batches via FIFO"
```

---

### Task 7: PDF purchase import creates a batch per line

**Files:**
- Modify: `convex/purchases.ts:53-95` (line loop in `createPurchase`)
- Test: `convex/purchases.test.ts` (create if absent)

**Interfaces:**
- Consumes: `nextBatchNumber`, `recomputeStockQty`.
- Produces: each imported line creates a `batches` row (`source:"purchase"`, `purchaseId` set, `unitCost = line.unitCost`). New-product lines create product then its first batch. `stockQty` recomputed; ledger row carries `batchId` + `purchaseId`.

- [ ] **Step 1: Write the failing test**

Create `convex/purchases.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("each purchase line creates a batch", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "a@t.co" } as any);
    await ctx.db.insert("userProfiles", { userId, name: "Admin", role: "admin" });
  });
  const admin = t.withIdentity({ name: "Admin" });
  const fileId = await t.run(async (ctx) =>
    ctx.storage.store(new Blob(["x"], { type: "application/pdf" })));

  const existingPid = await admin.mutation(api.products.create, {
    name: "Existing", sku: "E1", category: "C", costPrice: 1, sellPrice: 2,
    stockQty: 0, reorderThreshold: 0,
  });

  await admin.mutation(api.purchases.createPurchase, {
    fileId, supplierName: "Acme", purchaseDate: 1700000000000,
    lines: [
      { existingProductId: existingPid, quantity: 5, unitCost: 3 },
      { newProduct: { name: "Fresh", category: "C", sellPrice: 9 }, quantity: 2, unitCost: 4 },
    ],
  });

  const counts = await t.run(async (ctx) => {
    const all = await ctx.db.query("batches").collect();
    return all.filter((b) => b.source === "purchase").length;
  });
  expect(counts).toBe(2);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- purchases`
Expected: FAIL — no purchase-sourced batches.

- [ ] **Step 3: Implement**

In `convex/purchases.ts`, add imports:

```ts
import { recomputeStockQty } from "./lib/fifo";
```

Inside the `for (const line of args.lines)` loop, replace the stock bump + ledger insert with batch creation:

```ts
      const product = await ctx.db.get("products", productId!);
      if (!product) throw new Error("Product not found");
      const batchId = await ctx.db.insert("batches", {
        productId: product._id,
        batchNumber: await nextBatchNumber(ctx, Date.now()),
        qtyReceived: line.quantity,
        qtyRemaining: line.quantity,
        unitCost: line.unitCost,
        source: "purchase",
        purchaseId,
        isActive: true,
      });
      const balanceAfter = await recomputeStockQty(ctx, product._id);
      await ctx.db.insert("inventoryLedger", {
        productId: product._id,
        type: "stock_in",
        quantityDelta: line.quantity,
        balanceAfter,
        unitCost: line.unitCost,
        purchaseId,
        batchId,
        userId,
      });
      total += line.unitCost * line.quantity;
      itemCount += line.quantity;
```

(Newly created products via this path are inserted with `stockQty: 0`; `recomputeStockQty` then sets the correct total from batches.)

- [ ] **Step 4: Run tests, typecheck, commit**

Run: `npm test -- purchases` → PASS. `npm run typecheck`.
```bash
git add convex/purchases.ts convex/purchases.test.ts
git commit -m "feat(purchases): one batch per imported line"
```

---

## PHASE D — Read queries for the POS

### Task 8: `batches.listForProduct` + `findByBatchNumber`

**Files:**
- Create: `convex/batches.ts`
- Test: `convex/batches.test.ts`

**Interfaces:**
- Produces:
  - `batches.listForProduct({ productId })` → active batches oldest-first: `{ _id, batchNumber, qtyRemaining, unitCost, _creationTime }[]` (bounded `.take(500)`).
  - `batches.findByBatchNumber({ batchNumber })` → `{ product, batch } | null` where `product` includes `imageUrl`.

- [ ] **Step 1: Write the failing test**

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");

test("listForProduct returns active batches oldest-first", async () => {
  const t = convexTest(schema, modules);
  const pid = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "a@t.co" } as any);
    await ctx.db.insert("userProfiles", { userId, name: "U", role: "cashier" });
    const pid = await ctx.db.insert("products", {
      name: "P", sku: "S", category: "C", costPrice: 1, sellPrice: 2,
      stockQty: 8, reorderThreshold: 0, isActive: true,
    });
    await ctx.db.insert("batches", { productId: pid, batchNumber: "BN-1", qtyReceived: 3, qtyRemaining: 3, unitCost: 1, source: "stock_in", isActive: true });
    await ctx.db.insert("batches", { productId: pid, batchNumber: "BN-2", qtyReceived: 5, qtyRemaining: 5, unitCost: 1, source: "stock_in", isActive: true });
    await ctx.db.insert("batches", { productId: pid, batchNumber: "BN-0", qtyReceived: 4, qtyRemaining: 0, unitCost: 1, source: "stock_in", isActive: false });
    return pid;
  });
  const u = t.withIdentity({ name: "U" });
  const rows = await u.query(api.batches.listForProduct, { productId: pid });
  expect(rows.map((r) => r.batchNumber)).toEqual(["BN-1", "BN-2"]);
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- batches` → FAIL (module missing).

- [ ] **Step 3: Implement `convex/batches.ts`**

```ts
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";

export const listForProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const batches = await ctx.db
      .query("batches")
      .withIndex("by_product_active", (q) =>
        q.eq("productId", args.productId).eq("isActive", true),
      )
      .order("asc")
      .take(500);
    return batches.map((b) => ({
      _id: b._id,
      batchNumber: b.batchNumber,
      qtyRemaining: b.qtyRemaining,
      unitCost: b.unitCost,
      _creationTime: b._creationTime,
    }));
  },
});

export const findByBatchNumber = query({
  args: { batchNumber: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const batch = await ctx.db
      .query("batches")
      .withIndex("by_batchNumber", (q) => q.eq("batchNumber", args.batchNumber))
      .first();
    if (!batch) return null;
    const product = await ctx.db.get("products", batch.productId);
    if (!product) return null;
    const imageUrl = product.imageId ? await ctx.storage.getUrl(product.imageId) : null;
    return { product: { ...product, imageUrl }, batch };
  },
});
```

- [ ] **Step 4: Run test, typecheck, commit**

Run: `npm test -- batches` → PASS. `npm run typecheck`.
```bash
git add convex/batches.ts convex/batches.test.ts
git commit -m "feat(batches): listForProduct and findByBatchNumber queries"
```

---

### Task 9: `products.list` batch summary + stock filter; `products.categories`

**Files:**
- Modify: `convex/products.ts:118-160` (`list`), add `categories`
- Test: `convex/products.test.ts` (add cases)

**Interfaces:**
- Consumes: `activeBatchesOldestFirst` not needed; use a direct bounded read.
- Produces:
  - `products.list` adds optional arg `stockFilter: v.optional(v.union(v.literal("all"), v.literal("inStock"), v.literal("low"), v.literal("out")))`. Each returned page item gains `activeBatchCount: number` and `nextBatchNumber: string | null` (oldest active batch's number). Stock filter applied in-memory per page.
  - `products.categories()` → `string[]` distinct active-product categories (bounded `.take(1000)`).

- [ ] **Step 1: Write failing tests**

```ts
test("list attaches batch summary and supports stock filter", async () => {
  const t = convexTest(schema, modules);
  const admin = await seedAdmin(t);
  const a = await admin.mutation(api.products.create, { name: "A", sku: "A", category: "X", costPrice: 1, sellPrice: 2, stockQty: 10, reorderThreshold: 2 });
  const b = await admin.mutation(api.products.create, { name: "B", sku: "B", category: "Y", costPrice: 1, sellPrice: 2, stockQty: 0, reorderThreshold: 2 });

  const page = await admin.query(api.products.list, {
    paginationOpts: { numItems: 50, cursor: null }, activeOnly: true, stockFilter: "inStock",
  });
  const names = page.page.map((p: any) => p.name);
  expect(names).toContain("A");
  expect(names).not.toContain("B");
  const itemA = page.page.find((p: any) => p.name === "A");
  expect(itemA.activeBatchCount).toBe(1);
  expect(typeof itemA.nextBatchNumber).toBe("string");
});

test("categories returns distinct active categories", async () => {
  const t = convexTest(schema, modules);
  const admin = await seedAdmin(t);
  await admin.mutation(api.products.create, { name: "A", sku: "A", category: "X", costPrice: 1, sellPrice: 2, stockQty: 1, reorderThreshold: 0 });
  await admin.mutation(api.products.create, { name: "B", sku: "B", category: "X", costPrice: 1, sellPrice: 2, stockQty: 1, reorderThreshold: 0 });
  await admin.mutation(api.products.create, { name: "C", sku: "C", category: "Y", costPrice: 1, sellPrice: 2, stockQty: 1, reorderThreshold: 0 });
  const cats = await admin.query(api.products.categories, {});
  expect([...cats].sort()).toEqual(["X", "Y"]);
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- products` → FAIL.

- [ ] **Step 3: Implement**

In `convex/products.ts`, add a helper and extend `list`. Replace the final `return` of `list` so each page item is enriched with batch summary, then apply the stock filter:

```ts
async function withBatchSummary(ctx: QueryCtx, product: Doc<"products">) {
  const active = await ctx.db
    .query("batches")
    .withIndex("by_product_active", (q) => q.eq("productId", product._id).eq("isActive", true))
    .order("asc")
    .take(500);
  const imageUrl = product.imageId ? await ctx.storage.getUrl(product.imageId) : null;
  return {
    ...product,
    imageUrl,
    activeBatchCount: active.length,
    nextBatchNumber: active[0]?.batchNumber ?? null,
  };
}

function passesStockFilter(p: Doc<"products">, f: string | undefined): boolean {
  switch (f) {
    case "inStock": return p.stockQty > 0;
    case "out": return p.stockQty <= 0;
    case "low": return p.stockQty > 0 && p.stockQty <= p.reorderThreshold;
    default: return true; // "all" / undefined
  }
}
```

Add `stockFilter` to `list` args:

```ts
    stockFilter: v.optional(
      v.union(v.literal("all"), v.literal("inStock"), v.literal("low"), v.literal("out")),
    ),
```

Change `list`'s return to:

```ts
    const enriched = await Promise.all(result.page.map((p) => withBatchSummary(ctx, p)));
    return { ...result, page: enriched.filter((p) => passesStockFilter(p, args.stockFilter)) };
```

(Replace the existing `withImageUrl` map in `list` only — leave `listArchived`/`getBySku`/`get` using `withImageUrl`.)

Add the `categories` query:

```ts
export const categories = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const active = await ctx.db
      .query("products")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .take(1000);
    return [...new Set(active.map((p) => p.category))].sort();
  },
});
```

- [ ] **Step 4: Run tests, typecheck, commit**

Run: `npm test -- products` → PASS. `npm run typecheck`.
```bash
git add convex/products.ts convex/products.test.ts
git commit -m "feat(products): batch summary, stock filter, categories query"
```

---

### Task 10: `getSale` returns the batch breakdown

**Files:**
- Modify: `convex/sales.ts:143-172` (`getSale`)
- Test: `convex/sales.test.ts` (add case)

**Interfaces:**
- Produces: `getSale` return gains `batchBreakdown: Record<Id<"saleItems">, { batchNumber: string; quantity: number }[]>` keyed by sale item id.

- [ ] **Step 1: Write failing test**

```ts
test("getSale returns per-item batch breakdown", async () => {
  const t = convexTest(schema, modules);
  // reuse the two-batch sale setup from the earlier test, then:
  const sale = await someUser.query(api.sales.getSale, { saleId });
  const itemId = sale!.items[0]._id;
  expect(sale!.batchBreakdown[itemId].map((x: any) => x.batchNumber).sort())
    .toEqual(["BN-1", "BN-2"]);
});
```

> Implementer: fold this into the existing "spanning two batches" test or replicate its setup.

- [ ] **Step 2: Run to verify failure** — FAIL (`batchBreakdown` undefined).

- [ ] **Step 3: Implement**

In `getSale`, after loading `items`, add:

```ts
    const breakdownRows = await ctx.db
      .query("saleItemBatches")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .take(1000);
    const batchBreakdown: Record<string, { batchNumber: string; quantity: number }[]> = {};
    for (const r of breakdownRows) {
      (batchBreakdown[r.saleItemId] ??= []).push({
        batchNumber: r.batchNumberSnapshot,
        quantity: r.quantity,
      });
    }
```

and add `batchBreakdown` to the returned object: `return { sale, items: itemsWithImages, cashier, batchBreakdown };`

- [ ] **Step 4: Run tests, typecheck, commit**

Run: `npm test -- sales` → PASS. `npm run typecheck`.
```bash
git add convex/sales.ts convex/sales.test.ts
git commit -m "feat(sales): expose batch breakdown in getSale"
```

---

## PHASE E — Migration

### Task 11: Backfill batches for existing stock

**Files:**
- Create: `convex/migrations.ts`
- Test: `convex/migrations.test.ts`

**Interfaces:**
- Produces: `internal.migrations.backfillBatches({ cursor: string | null })` internalMutation that, per ~100 products, creates one `source:"migration"` batch for products with `stockQty > 0` and **no** existing batch, then reschedules itself until done. Idempotent.

- [ ] **Step 1: Write failing test**

```ts
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
```

- [ ] **Step 2: Run to verify failure** — `npm test -- migrations` → FAIL.

- [ ] **Step 3: Implement `convex/migrations.ts`**

```ts
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { nextBatchNumber } from "./lib/batch";

const BATCH_SIZE = 100;

export const backfillBatches = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const userId = (await ctx.db.query("users").first())?._id;
    const page = await ctx.db
      .query("products")
      .paginate({ numItems: BATCH_SIZE, cursor: args.cursor });

    for (const product of page.page) {
      if (product.stockQty <= 0) continue;
      const existing = await ctx.db
        .query("batches")
        .withIndex("by_product", (q) => q.eq("productId", product._id))
        .first();
      if (existing) continue; // idempotent
      const batchNumber = product.batchNumber ?? (await nextBatchNumber(ctx, Date.now()));
      const batchId = await ctx.db.insert("batches", {
        productId: product._id,
        batchNumber,
        qtyReceived: product.stockQty,
        qtyRemaining: product.stockQty,
        unitCost: product.costPrice,
        source: "migration",
        isActive: true,
      });
      if (userId) {
        await ctx.db.insert("inventoryLedger", {
          productId: product._id,
          type: "stock_in",
          quantityDelta: product.stockQty,
          balanceAfter: product.stockQty,
          unitCost: product.costPrice,
          reason: "Batch backfill migration",
          batchId,
          userId,
        });
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillBatches, {
        cursor: page.continueCursor,
      });
    }
  },
});
```

- [ ] **Step 4: Run test, typecheck, commit**

Run: `npm test -- migrations` → PASS. `npm run typecheck`.
```bash
git add convex/migrations.ts convex/migrations.test.ts
git commit -m "feat(migrations): backfill batches for existing stock"
```

- [ ] **Step 5: Run the migration in dev**

Run: `npx convex run migrations:backfillBatches '{"cursor":null}'`
Expected: completes; spot-check in dashboard that products with stock now have a `migration` batch and `stockQty` matches. (Defer prod run until after UI ships.)

---

## PHASE F — POS UI: grid, infinite scroll, batch display, filters

> **All Phase F–I tasks: invoke the `frontend-design` skill first** to keep styling intentional and consistent with the existing token system (`components/ui`, Tailwind theme tokens like `text-text`, `bg-surface`, `border-border`).

### Task 12: Add `@zxing/browser` dependency

**Files:** Modify `package.json`

- [ ] **Step 1: Install**

Run: `npm install @zxing/browser@latest`
Expected: adds to `dependencies`; lockfile updates.

- [ ] **Step 2: Verify build still typechecks** — `npm run typecheck` → PASS.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add @zxing/browser for camera barcode scanning"
```

---

### Task 13: Infinite scroll + batch display + lazy images in `ProductGrid`

**Files:**
- Modify: `components/ProductGrid.tsx`

**Interfaces:**
- Consumes: `products.list` page items now carry `nextBatchNumber`, `activeBatchCount`, `stockQty`, `reorderThreshold`, `imageUrl`. New props: `category?: string`, `stockFilter?: "all"|"inStock"|"low"|"out"`.
- Produces: grid auto-loads next page when a sentinel scrolls into view; renders batch line per card; images lazy-load.

- [ ] **Step 1: Invoke frontend-design skill, then implement**

Update the query call to pass filters and use an IntersectionObserver sentinel. Key changes:

```tsx
import { useEffect, useRef } from "react";
// ...
type Props = {
  search: string;
  category?: string;
  stockFilter?: "all" | "inStock" | "low" | "out";
  onAdd: (item: CartItem) => void;
};

export default function ProductGrid({ search, category, stockFilter, onAdd }: Props) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.products.list,
    {
      search: search.trim() || undefined,
      category: category || undefined,
      stockFilter: stockFilter ?? "all",
      activeOnly: true,
    },
    { initialNumItems: 24 },
  );

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && status === "CanLoadMore") loadMore(24);
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [status, loadMore]);
```

In each card, add the batch line under the name (using existing tokens), and make the image lazy:

```tsx
                {product.nextBatchNumber && (
                  <p className="truncate text-[11px] font-medium text-text-muted">
                    Batch {product.nextBatchNumber}
                    {product.activeBatchCount > 1 ? ` ·${product.activeBatchCount}` : ""}
                  </p>
                )}
```

```tsx
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
```

Add the SKU line too (spec requires SKU/barcode on the card):

```tsx
                <p className="truncate text-[11px] text-text-muted">SKU {product.sku}</p>
```

Use `reorderThreshold` for the low-stock badge instead of the hardcoded `5`:

```tsx
          const lowStock = product.stockQty > 0 && product.stockQty <= product.reorderThreshold;
```

Replace the manual "Load more" button block with the sentinel + a `LoadingMore` spinner, keeping a fallback button shown only when `status === "CanLoadMore"`:

```tsx
      <div ref={sentinelRef} aria-hidden className="h-1" />
      {status === "LoadingMore" && (
        <div className="flex justify-center py-2">
          <Button variant="secondary" loading disabled>Loading</Button>
        </div>
      )}
      {status === "CanLoadMore" && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => loadMore(24)}>Load more</Button>
        </div>
      )}
```

- [ ] **Step 2: Manual verify in the running app**

Run `npm run dev`, open `/pos`. Expected: scrolling the grid near the bottom auto-loads more; cards show SKU + batch number; images lazy-load; low-stock badge respects each product's threshold.

- [ ] **Step 3: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint`
```bash
git add components/ProductGrid.tsx
git commit -m "feat(pos): infinite scroll, batch + SKU display, lazy images"
```

---

### Task 14: Category chips + stock filter controls

**Files:**
- Create: `components/pos/CategoryChips.tsx`, `components/pos/PosFilters.tsx`

**Interfaces:**
- Consumes: `api.products.categories`.
- Produces:
  - `CategoryChips({ value, onChange })` — `value: string | undefined`, renders an "All" chip + one per category; calls `onChange(category | undefined)`.
  - `PosFilters({ value, onChange })` — `value: "all"|"inStock"|"low"|"out"`, a `SegmentedControl` (existing `components/ui`) over the four options.

- [ ] **Step 1: Invoke frontend-design skill, then implement `CategoryChips.tsx`**

```tsx
"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

type Props = { value: string | undefined; onChange: (category: string | undefined) => void };

export default function CategoryChips({ value, onChange }: Props) {
  const categories = useQuery(api.products.categories) ?? [];
  const chip = (active: boolean) =>
    [
      "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "border-primary bg-primary text-on-primary" : "border-border bg-surface text-text hover:bg-surface-2",
    ].join(" ");
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1">
      <button type="button" className={chip(value === undefined)} onClick={() => onChange(undefined)}>
        All
      </button>
      {categories.map((c) => (
        <button key={c} type="button" className={chip(value === c)} onClick={() => onChange(c)}>
          {c}
        </button>
      ))}
    </div>
  );
}
```

(If `text-on-primary` is not a defined token, use the same primary-button foreground token used in `components/ui/Button.tsx`.)

- [ ] **Step 2: Implement `PosFilters.tsx`** using the existing `SegmentedControl`:

```tsx
"use client";
import { SegmentedControl } from "@/components/ui";

type StockFilter = "all" | "inStock" | "low" | "out";
type Props = { value: StockFilter; onChange: (v: StockFilter) => void };

export default function PosFilters({ value, onChange }: Props) {
  return (
    <SegmentedControl
      value={value}
      onChange={(v) => onChange(v as StockFilter)}
      options={[
        { value: "all", label: "All" },
        { value: "inStock", label: "In stock" },
        { value: "low", label: "Low" },
        { value: "out", label: "Out" },
      ]}
    />
  );
}
```

> Implementer: confirm `SegmentedControl`'s prop shape in `components/ui/SegmentedControl.tsx` and adapt the `options`/`value`/`onChange` names to match it exactly.

- [ ] **Step 3: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint`
```bash
git add components/pos/CategoryChips.tsx components/pos/PosFilters.tsx
git commit -m "feat(pos): category chips and stock-availability filter"
```

---

### Task 15: Wire filters + two-panel layout in the POS page

**Files:**
- Modify: `app/(app)/pos/page.tsx`

**Interfaces:**
- Consumes: `CategoryChips`, `PosFilters`, updated `ProductGrid` props.
- Produces: page holds `category` and `stockFilter` state and passes them to grid; layout uses the existing two-panel grid (left grid, right payment) — extended with the filter row above the grid.

- [ ] **Step 1: Invoke frontend-design skill, then implement**

Add state near the other `useState`s:

```tsx
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [stockFilter, setStockFilter] = useState<"all" | "inStock" | "low" | "out">("all");
```

Import the new components and replace the "Browse grid" card body content:

```tsx
import CategoryChips from "@/components/pos/CategoryChips";
import PosFilters from "@/components/pos/PosFilters";
// ...
          <Card>
            <CardBody className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Field label="Browse products" className="flex-1">
                  <Input
                    id="grid-search"
                    type="text"
                    value={gridSearch}
                    onChange={(e) => setGridSearch(e.target.value)}
                    placeholder="Filter by name…"
                  />
                </Field>
                <PosFilters value={stockFilter} onChange={setStockFilter} />
              </div>
              <CategoryChips value={category} onChange={setCategory} />
              <div className="max-h-[60vh] overflow-y-auto sm:max-h-[70vh]">
                <ProductGrid
                  search={gridSearch}
                  category={category}
                  stockFilter={stockFilter}
                  onAdd={handleAddToCart}
                />
              </div>
            </CardBody>
          </Card>
```

(The `max-h` + `overflow-y-auto` wrapper gives the grid its own scroll region so infinite scroll is contained and the page body never scrolls horizontally — spec §10/§11.)

- [ ] **Step 2: Manual verify** — `/pos`: category chips filter the grid, stock filter narrows results, grid scrolls in its own region on phone/tablet/desktop widths.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
git add "app/(app)/pos/page.tsx"
git commit -m "feat(pos): wire category and stock filters into two-panel layout"
```

---

## PHASE G — Camera barcode scanning

### Task 16: `CameraScanner` modal

**Files:**
- Create: `components/CameraScanner.tsx`

**Interfaces:**
- Produces: `CameraScanner({ open, onClose, onDetected })` — `onDetected(text: string)` fires once on first decode then the modal closes. Uses `BrowserMultiFormatReader` from `@zxing/browser`. Focus-trapped via existing `Dialog`.

- [ ] **Step 1: Invoke frontend-design skill, then implement**

```tsx
"use client";
import { useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Dialog } from "@/components/ui";

type Props = { open: boolean; onClose: () => void; onDetected: (text: string) => void };

export default function CameraScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const reader = new BrowserMultiFormatReader();
    let stopped = false;
    let controls: { stop: () => void } | null = null;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result && !stopped) {
          stopped = true;
          onDetected(result.getText());
          onClose();
        }
      })
      .then((c) => { controls = c; if (stopped) c.stop(); })
      .catch(() => {
        if (errorRef.current) {
          errorRef.current.textContent =
            "Camera unavailable. Check permissions or type the SKU instead.";
        }
      });

    return () => { stopped = true; controls?.stop(); };
  }, [open, onClose, onDetected]);

  return (
    <Dialog open={open} onClose={onClose} title="Scan barcode" size="sm">
      <div className="space-y-3">
        <div className="overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
        </div>
        <p ref={errorRef} role="status" className="text-xs text-text-muted">
          Point the camera at a barcode.
        </p>
      </div>
    </Dialog>
  );
}
```

> Implementer: verify `decodeFromVideoDevice`'s callback/return signature against the installed `@zxing/browser` version; adapt `getText()` / controls handling to match its API.

- [ ] **Step 2: Typecheck, lint, commit**

```bash
git add components/CameraScanner.tsx
git commit -m "feat(pos): camera barcode scanner modal"
```

---

### Task 17: Wire camera scan + batch lookup into `ProductSearch`

**Files:**
- Modify: `components/ProductSearch.tsx`

**Interfaces:**
- Consumes: `CameraScanner`, `api.batches.findByBatchNumber`.
- Produces: a "Scan" button opens the camera; a decoded value (or typed Enter) runs the lookup chain SKU → batch number → name search. Batch-number hits (`/^BN-/i`) resolve via `findByBatchNumber`.

- [ ] **Step 1: Invoke frontend-design skill, then implement**

Add a camera button next to the input and an `applyLookup(value)` that the existing Enter handler and the scanner both call. Add batch-number resolution: when the value matches `/^BN-/i`, mount a `BatchLookup` helper (mirroring `SkuLookup`) that calls `useQuery(api.batches.findByBatchNumber, { batchNumber })` and, on a hit, adds the product to the cart; on miss, falls back to name search.

Concretely, add state + button:

```tsx
import CameraScanner from "@/components/CameraScanner";
import { Button } from "@/components/ui";
// ...
  const [scanOpen, setScanOpen] = useState(false);

  const submitValue = useCallback((raw: string) => {
    const val = raw.trim();
    if (!val) return;
    setSkuNotFound(false);
    setSearchTerm(null);
    setLookupSku(val);          // SkuLookup handles SKU; on not-found it sets name search.
    setLookupKey((k) => k + 1);
  }, []);
```

In `handleKeyDown`, replace the inline body with `submitValue(inputValue)`. Render the button + scanner:

```tsx
      <div className="flex gap-2">
        <div className="flex-1">{/* existing Field + Input */}</div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setScanOpen(true)}
          aria-label="Scan with camera"
          className="shrink-0 self-end"
        >
          Scan
        </Button>
      </div>
      <CameraScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={submitValue} />
```

Extend `handleSkuNotFound`: before falling back to name search, if the term matches `/^BN-/i`, attempt a batch lookup. Simplest implementation: mount a `BatchLookup` (like `SkuLookup`) keyed on the term; on found → `handleSkuFound(result.product)`, on not-found → existing name-search fallback.

```tsx
function BatchLookup({ batchNumber, onFound, onNotFound }: {
  batchNumber: string;
  onFound: (p: ProductHit) => void;
  onNotFound: (s: string) => void;
}) {
  const res = useQuery(api.batches.findByBatchNumber, { batchNumber });
  useEffect(() => {
    if (res === undefined) return;
    if (res) onFound(res.product as ProductHit);
    else onNotFound(batchNumber);
  }, [res, batchNumber, onFound, onNotFound]);
  return null;
}
```

Wire it so that when `lookupSku` matches `/^BN-/i` you render `<BatchLookup>` instead of `<SkuLookup>` (or render both — SKU first). Keep it simple: render `SkuLookup`; in `handleSkuNotFound`, if `/^BN-/i.test(sku)`, set a `batchLookup` state to mount `BatchLookup`; only fall to name search when the batch lookup also misses.

- [ ] **Step 2: Manual verify** — typing a known SKU adds the item; typing a known `BN-...` adds its product; the Scan button opens the camera and a decoded code adds the item; auto-focus returns to the box after each add.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
git add components/ProductSearch.tsx
git commit -m "feat(pos): camera scan + batch-number lookup in search"
```

---

## PHASE H — Cart preview + receipt breakdown

### Task 18: Cart shows the FIFO batch preview per line

**Files:**
- Modify: `components/Cart.tsx`

**Interfaces:**
- Consumes: `api.batches.listForProduct`.
- Produces: each cart line renders the batch(es) FIFO will consume for its current quantity (client-side preview, oldest-first), e.g. "BN-1 ×3, BN-2 ×1".

- [ ] **Step 1: Read `components/Cart.tsx` to match its current line markup, then invoke frontend-design skill**

- [ ] **Step 2: Implement a `BatchPreview` subcomponent**

```tsx
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function BatchPreview({ productId, quantity }: { productId: Id<"products">; quantity: number }) {
  const batches = useQuery(api.batches.listForProduct, { productId });
  if (!batches || batches.length === 0) return null;
  const parts: string[] = [];
  let need = quantity;
  for (const b of batches) {
    if (need <= 0) break;
    const take = Math.min(b.qtyRemaining, need);
    parts.push(`${b.batchNumber} ×${take}`);
    need -= take;
  }
  return (
    <p className="truncate text-[11px] text-text-muted" title={parts.join(", ")}>
      FIFO: {parts.join(", ")}{need > 0 ? " (short!)" : ""}
    </p>
  );
}
```

Render `<BatchPreview productId={item.productId} quantity={item.quantity} />` under each cart line's name. Import `Id` from `@/convex/_generated/dataModel`.

- [ ] **Step 3: Manual verify** — add a product whose quantity spans two batches; the cart line lists both with the FIFO split; reducing quantity updates it live.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
git add components/Cart.tsx
git commit -m "feat(pos): per-line FIFO batch preview in cart"
```

---

### Task 19: Receipt shows the batch breakdown

**Files:**
- Modify: `components/Receipt.tsx`

**Interfaces:**
- Consumes: `getSale`'s new `batchBreakdown` keyed by sale item id.
- Produces: each receipt line lists the batch numbers and quantities consumed.

- [ ] **Step 1: Read `components/Receipt.tsx`, invoke frontend-design skill, then implement**

For each rendered sale item, look up `batchBreakdown[item._id]` and render a muted sub-line:

```tsx
              {data.batchBreakdown?.[item._id]?.length ? (
                <p className="text-[11px] text-text-muted">
                  {data.batchBreakdown[item._id]
                    .map((b) => `${b.batchNumber} ×${b.quantity}`)
                    .join(", ")}
                </p>
              ) : null}
```

(Match the actual variable name used for the `getSale` result in `Receipt.tsx`.)

- [ ] **Step 2: Manual verify** — complete a multi-batch sale; the printed receipt lists the batch split under the line.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
git add components/Receipt.tsx
git commit -m "feat(pos): batch breakdown on receipt"
```

---

## PHASE I — Stock-in dialog batch choice

### Task 20: `StockInDialog` new-batch vs existing-batch

**Files:**
- Modify: `components/StockInDialog.tsx`

**Interfaces:**
- Consumes: `api.batches.listForProduct`, updated `inventory.stockIn` (`targetBatchId`).
- Produces: dialog offers "New batch" (default) or "Add to existing batch" → a select of the product's active batches; passes `targetBatchId` accordingly.

- [ ] **Step 1: Read `components/StockInDialog.tsx`, invoke frontend-design skill, then implement**

Add a mode toggle (`SegmentedControl` or radio) and, when "existing" is chosen, a `Select` populated from `useQuery(api.batches.listForProduct, { productId })` showing `batchNumber (qtyRemaining left)`. Pass `targetBatchId` only in existing mode:

```tsx
  await stockIn({
    productId,
    quantity: Number(quantity),
    unitCost: unitCost ? Number(unitCost) : undefined,
    targetBatchId: mode === "existing" ? selectedBatchId : undefined,
  });
```

- [ ] **Step 2: Manual verify** — stock-in with "New batch" creates a new batch; "Add to existing" increases the chosen batch (confirm in the product's batch list / ledger).

- [ ] **Step 3: Typecheck, lint, commit**

```bash
git add components/StockInDialog.tsx
git commit -m "feat(inventory): stock-in dialog batch choice"
```

---

## PHASE J — Verification & rollout

### Task 21: Full test + typecheck + lint sweep

- [ ] **Step 1:** `npm test` → all pass.
- [ ] **Step 2:** `npm run typecheck` → clean.
- [ ] **Step 3:** `npm run lint` → clean.
- [ ] **Step 4:** Manual smoke on `/pos` at phone (375px), tablet (820px), desktop widths: infinite scroll, filters, scan, multi-batch sale end-to-end, receipt breakdown.
- [ ] **Step 5:** Commit any fixes; then run prod migration `npx convex run migrations:backfillBatches '{"cursor":null}'` against the deployed backend after deploy.

---

## Self-Review (completed during planning)

- **Spec coverage:** batch display (T13), FIFO allocation (T2/T3), oldest-first + block-newer (T2), per-batch remaining (T8/T18), product info incl. SKU/batch/stock/price/image (T13), low-stock highlight (T13), infinite scroll + lazy images + server pagination (T13), mobile/tablet/desktop responsive + touch + scroll regions (T13/T15/§11), two-panel UX (T15), real-time cart (existing reactivity), barcode camera + keyboard scanners (T16/T17), search by name/SKU/barcode/batch (T17), filter by category/stock/batch (T14/T15/T17), checkout revalidation + no overselling (T2/T3), receipt batch breakdown (T10/T19), migration (T11). Expiry intentionally excluded per spec §2.
- **Placeholder scan:** no TBD/TODO; every code step shows code. Implementer NOTEs flag where existing helper signatures (`SegmentedControl` props, `t.withIdentity` auth seeding, `@zxing/browser` API, `Receipt`/`Cart` markup) must be matched to the real files — these are verification cues, not missing content.
- **Type consistency:** `allocateFifo(ctx, productId, quantity, ledgerType, refs)` and `Allocation` used identically in T2/T3/T6; `nextBatchNumber`, `recomputeStockQty` signatures consistent; `stockFilter` union identical across T9/T13/T14/T15; `batchBreakdown` shape identical T10/T19.
