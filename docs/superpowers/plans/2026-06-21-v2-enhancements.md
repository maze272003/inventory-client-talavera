# v2 Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add supplier-invoice import (manual entry beside the uploaded PDF), product photos, a POS product grid, a receipt-cards UI, and CSV/print-PDF export to the shipped motorcycle-parts POS & inventory system.

**Architecture:** Extend the existing Convex schema (no new parallel systems): products gain `model`/`imageId`; the inventory ledger gains an optional `purchaseId`; a new `purchases` table records supplier invoices. The supplier import is one atomic `createPurchase` mutation that creates/matches products and writes `stock_in` ledger rows. Photos and the PDF use Convex file storage. Export is client-side CSV + browser print (no new deps).

**Tech Stack:** Next.js 16 (App Router, `proxy.ts` middleware), React 19, Convex ^1.36 + `@convex-dev/auth`, Tailwind v4, vitest + convex-test.

## Global Constraints

- Convex query rules: never `.filter()` — use `withIndex`/`withSearchIndex`; never unbounded `.collect()` — use `.take()`/pagination/`.unique()`; index names include all fields (`by_field1_and_field2`).
- Authorization is ALWAYS derived server-side via `ctx.auth.getUserIdentity()` / `requireUser`/`requireRole`; never accept a client-supplied user id for auth. `requireRole` is hierarchical (admin outranks cashier).
- **This project uses the table-name-first Convex API**: `ctx.db.get("table", id)`, `ctx.db.patch("table", id, {...})`, `ctx.db.insert("table", {...})`, `ctx.db.delete("table", id)`. This is correct for this Convex version (see `convex/_generated/ai/guidelines.md`) — do not "fix" it to a 2-arg form.
- All Convex functions must have argument validators.
- Next.js middleware file is `proxy.ts` (Next 16.2.4), not `middleware.ts`.
- Currency is PHP; reuse `formatPeso` from `lib/format.ts`. Quantities are integers.
- No new npm dependencies. Excel export = CSV download; PDF export = browser print (`window.print()` + `@media print`).
- One photo per product. Printed receipts stay text-only (no images).
- Tests: `convex-test` + vitest; identity injected via `t.withIdentity({ subject: userId, tokenIdentifier: "test|"+userId })` (subject = raw `Id<"users">`). Run one file: `npx vitest run convex/<file>.test.ts`.
- Verify each task with: `npx convex dev --once` (clean push), `npm run typecheck`, `npm run lint` (0 new errors), and `npm run test` for backend tasks.

---

### Task 1: Schema changes + file storage + product fields

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/files.ts`
- Modify: `convex/products.ts`

**Interfaces:**
- Produces:
  - `products` docs gain optional `model: string`, `imageId: Id<"_storage">`.
  - `inventoryLedger` gains optional `purchaseId: Id<"purchases">`.
  - New `purchases` table: `{ supplierName, referenceNumber?, purchaseDate, fileId, total, itemCount, userId }`, index `by_supplier`.
  - `api.files.generateUploadUrl()` (admin) → `string`.
  - `api.products.create` / `update` accept optional `model`, `imageId`.
  - Product reads (`list`, `getBySku`, new `get`) return each product **plus** `imageUrl: string | null`.

- [ ] **Step 1: Extend `convex/schema.ts`**

Add to the `products` table definition (keep existing fields + indexes):

```ts
  products: defineTable({
    name: v.string(),
    sku: v.string(),
    category: v.string(),
    model: v.optional(v.string()),
    imageId: v.optional(v.id("_storage")),
    costPrice: v.number(),
    sellPrice: v.number(),
    stockQty: v.number(),
    reorderThreshold: v.number(),
    isActive: v.boolean(),
  })
    .index("by_sku", ["sku"])
    .index("by_category", ["category"])
    .index("by_active", ["isActive"])
    .searchIndex("search_name", { searchField: "name", filterFields: ["isActive"] }),
```

Add `purchaseId` to `inventoryLedger` (keep existing fields + indexes):

```ts
    saleId: v.optional(v.id("sales")),
    purchaseId: v.optional(v.id("purchases")),
    userId: v.id("users"),
```

Add the new `purchases` table:

```ts
  purchases: defineTable({
    supplierName: v.string(),
    referenceNumber: v.optional(v.string()),
    purchaseDate: v.number(),
    fileId: v.id("_storage"),
    total: v.number(),
    itemCount: v.number(),
    userId: v.id("users"),
  }).index("by_supplier", ["supplierName"]),
```

- [ ] **Step 2: Create `convex/files.ts`**

```ts
import { mutation } from "./_generated/server";
import { requireRole } from "./lib/auth";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.storage.generateUploadUrl();
  },
});
```

- [ ] **Step 3: Extend `products.create` and `products.update` args**

In `convex/products.ts`, add optional `model` and `imageId` to both `create` and `update` arg validators and persist them. For `create`:

```ts
  args: {
    name: v.string(), sku: v.string(), category: v.string(),
    model: v.optional(v.string()), imageId: v.optional(v.id("_storage")),
    costPrice: v.number(), sellPrice: v.number(),
    stockQty: v.number(), reorderThreshold: v.number(),
  },
```

The existing `ctx.db.insert("products", { ...args, isActive: true })` already spreads the new fields. For `update`, add `model: v.optional(v.string())` and `imageId: v.optional(v.id("_storage"))` to the args and keep the `const { id, ...fields } = args; await ctx.db.patch("products", id, fields);` pattern (patch ignores `undefined`-free spread; only provided fields are set).

- [ ] **Step 4: Add `imageUrl` to product reads + a `get` query**

Add a helper at the top of `products.ts` and use it in `list`, `getBySku`, and a new `get`:

```ts
import { QueryCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

async function withImageUrl(ctx: QueryCtx, product: Doc<"products">) {
  const imageUrl = product.imageId ? await ctx.storage.getUrl(product.imageId) : null;
  return { ...product, imageUrl };
}
```

In `list`, map the paginated page through `withImageUrl` (await each). Because `paginate` returns `{ page, isDone, continueCursor }`, replace `page` with the resolved array:

```ts
const result = await ctx.db.query("products")./* ...existing branch... */.paginate(args.paginationOpts);
return { ...result, page: await Promise.all(result.page.map((p) => withImageUrl(ctx, p))) };
```

Apply the same `withImageUrl` wrap to `getBySku` (when non-null). Add:

```ts
export const get = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const product = await ctx.db.get("products", args.id);
    return product ? await withImageUrl(ctx, product) : null;
  },
});
```

- [ ] **Step 5: Verify** — Run `npx convex dev --once` (clean push), `npm run typecheck`, `npm run lint`. Existing 16 tests must still pass: `npm run test`.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: schema for purchases/photos, file uploads, product model+imageUrl"`

---

### Task 2: Product photo upload UI

**Files:**
- Modify: `components/ProductForm.tsx`
- Modify: `app/(app)/products/page.tsx`

**Interfaces:**
- Consumes: `api.files.generateUploadUrl`, `api.products.create`/`update` (now accept `model`, `imageId`), product `imageUrl` in `list`.

- [ ] **Step 1: Add image picker + model field to `ProductForm.tsx`**

Add a `model` text input (optional) and an image file input. On file select, upload before saving:

```tsx
const generateUploadUrl = useMutation(api.files.generateUploadUrl);

async function uploadImage(file: File): Promise<Id<"_storage">> {
  const url = await generateUploadUrl();
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
  if (!res.ok) throw new Error("Image upload failed");
  const { storageId } = await res.json();
  return storageId as Id<"_storage">;
}
```

On submit: if a new file is selected, `imageId = await uploadImage(file)`; otherwise keep the existing `imageId` (edit mode). Pass `model` and `imageId` to `create`/`update`. Show a small preview (the selected file via `URL.createObjectURL`, or the existing `imageUrl` in edit mode). Disable submit while uploading.

- [ ] **Step 2: Show thumbnails + model in the products table** (`app/(app)/products/page.tsx`)

Add an image column (render `product.imageUrl` in a 40×40 `next/image` or `<img>`, with a neutral placeholder box when null) and show `model` under or beside the name. The list query already returns `imageUrl` and `model`.

- [ ] **Step 3: Verify** — `npm run typecheck`, `npm run lint`, `npx next build` completes. Manually confirm (if dev runs) upload + edit keep the image.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: product photo upload and model field in product UI"`

---

### Task 3: POS product grid

**Files:**
- Create: `components/ProductGrid.tsx`
- Modify: `app/(app)/pos/page.tsx`

**Interfaces:**
- Consumes: `api.products.list` (paginated, returns `imageUrl`, `model`, `sellPrice`, `stockQty`), `CartItem` type from `components/ProductSearch.tsx`, and the page's `handleAddToCart(item: CartItem)`.
- Produces: a tappable grid that calls `onAdd(item: CartItem)`.

- [ ] **Step 1: Create `components/ProductGrid.tsx`**

A client component that takes `{ search: string; onAdd: (item: CartItem) => void }`. Uses `usePaginatedQuery(api.products.list, { search: search.trim() || undefined, activeOnly: true }, { initialNumItems: 24 })`. Renders a responsive grid (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3`) of cards: product `imageUrl` (or placeholder), `name`, `model`, `formatPeso(sellPrice)`, and a stock badge. Clicking a card calls `onAdd({ productId: p._id, name: p.name, sellPrice: p.sellPrice, quantity: 1 })` (match the exact `CartItem` shape from ProductSearch). Cards with `stockQty <= 0` are disabled (no onClick, dimmed). Include a "Load more" button gated on `status === "CanLoadMore"`.

- [ ] **Step 2: Integrate into POS page** (`app/(app)/pos/page.tsx`)

Add a shared search state. Render the existing `ProductSearch` (scan/Enter + name search) and the new `ProductGrid` together — e.g. the grid is the main browsing surface, the scan box stays on top for barcodes. Both call the existing `handleAddToCart`. Keep the cart/checkout exactly as-is. (If `CartItem` requires more fields, pass them from the grid product so the types match — confirm by reading `ProductSearch.tsx`'s `CartItem` export.)

- [ ] **Step 3: Verify** — `npm run typecheck`, `npm run lint`, `npx next build`.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: POS product grid with photos"`

---

### Task 4: Receipt cards UI

**Files:**
- Modify: `app/(app)/receipts/page.tsx`
- Modify: `components/Receipt.tsx`
- Modify: `convex/sales.ts` (add `imageUrl` to `getSale` items)

**Interfaces:**
- Consumes: `api.sales.listReceipts`, `api.sales.getSale`.
- Produces: `getSale` returns each item with `imageUrl: string | null`.

- [ ] **Step 1: Add product `imageUrl` to `getSale` items** (`convex/sales.ts`)

In `getSale`, after loading the `saleItems`, resolve each item's product image:

```ts
const items = await ctx.db.query("saleItems").withIndex("by_sale", (q) => q.eq("saleId", args.saleId)).take(200);
const itemsWithImages = await Promise.all(items.map(async (it) => {
  const product = await ctx.db.get("products", it.productId);
  const imageUrl = product?.imageId ? await ctx.storage.getUrl(product.imageId) : null;
  return { ...it, imageUrl };
}));
return { sale, items: itemsWithImages };
```

- [ ] **Step 2: Receipts page as a card grid** (`app/(app)/receipts/page.tsx`)

Replace the table/list with a responsive card grid. Each card: receipt `#receiptNumber`, formatted date/time, `itemCount` items, `formatPeso(total)`. Cards link to `/receipts/${sale._id}`. Keep the receipt-number search box and pagination ("Load more").

- [ ] **Step 3: On-screen receipt shows thumbnails** (`components/Receipt.tsx`)

In the on-screen (non-print) line-item list, render each item's `imageUrl` as a small thumbnail (with placeholder when null) beside name, `quantity × unitSellPrice`, and `lineTotal`. **Do not** add images to the `@media print` markup — guard images with a class that the print CSS hides (the existing print CSS hides everything except `.receipt-print`; ensure the thumbnails sit in an element excluded from or hidden in print, e.g. wrap them in a `.screen-only` span with `@media print { .screen-only { display: none } }`).

- [ ] **Step 4: Verify** — `npm run typecheck`, `npm run lint`, `npm run test` (getSale change shouldn't break existing sales tests; if a test asserts the exact items shape, update it to allow the added `imageUrl`), `npx next build`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: receipt cards UI with product thumbnails"`

---

### Task 5: Supplier import backend (`purchases`) — TDD

**Files:**
- Create: `convex/purchases.ts`
- Create: `convex/purchases.test.ts`

**Interfaces:**
- Consumes: `products`, `inventoryLedger`, `purchases` (Task 1), `requireRole`.
- Produces:
  - `api.purchases.createPurchase({ fileId, supplierName, referenceNumber?, purchaseDate, lines: Array<{ existingProductId?: Id<"products">; newProduct?: { name: string; model?: string; category: string; sellPrice: number }; quantity: number; unitCost: number }> })` (admin) → `{ purchaseId, productsCreated, linesImported, total }`.
  - `api.purchases.getPurchase({ purchaseId })` → `{ purchase, fileUrl, ledgerRows } | null`.
  - `api.purchases.listPurchases({ paginationOpts })` → paginated desc, each `{ ...purchase, fileUrl }`.

- [ ] **Step 1: Write `convex/purchases.test.ts` (failing)**

```ts
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
```

- [ ] **Step 2: Run test, expect FAIL** — `npx vitest run convex/purchases.test.ts` (no `purchases` module).

- [ ] **Step 3: Implement `convex/purchases.ts`**

```ts
import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { Doc } from "./_generated/dataModel";
import { requireRole, requireUser } from "./lib/auth";

const lineValidator = v.object({
  existingProductId: v.optional(v.id("products")),
  newProduct: v.optional(
    v.object({
      name: v.string(),
      model: v.optional(v.string()),
      category: v.string(),
      sellPrice: v.number(),
    }),
  ),
  quantity: v.number(),
  unitCost: v.number(),
});

export const createPurchase = mutation({
  args: {
    fileId: v.id("_storage"),
    supplierName: v.string(),
    referenceNumber: v.optional(v.string()),
    purchaseDate: v.number(),
    lines: v.array(lineValidator),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, "admin");
    if (args.lines.length === 0) throw new Error("No line items");

    let total = 0;
    let itemCount = 0;
    let productsCreated = 0;

    // First insert the purchase header so ledger rows can reference it.
    const purchaseId = await ctx.db.insert("purchases", {
      supplierName: args.supplierName,
      referenceNumber: args.referenceNumber,
      purchaseDate: args.purchaseDate,
      fileId: args.fileId,
      total: 0,
      itemCount: 0,
      userId,
    });

    for (const line of args.lines) {
      if (line.quantity <= 0) throw new Error("Quantity must be positive");
      if (!line.existingProductId === !line.newProduct) {
        throw new Error("Each line needs exactly one of existingProductId or newProduct");
      }

      let productId = line.existingProductId ?? null;
      if (line.newProduct) {
        const np = line.newProduct;
        productId = await ctx.db.insert("products", {
          name: np.name,
          sku: "",
          category: np.category,
          model: np.model,
          costPrice: line.unitCost,
          sellPrice: np.sellPrice,
          stockQty: 0,
          reorderThreshold: 0,
          isActive: true,
        });
        productsCreated++;
      }

      const product = await ctx.db.get("products", productId!);
      if (!product) throw new Error("Product not found");
      const balanceAfter = product.stockQty + line.quantity;
      await ctx.db.patch("products", product._id, { stockQty: balanceAfter });
      await ctx.db.insert("inventoryLedger", {
        productId: product._id,
        type: "stock_in",
        quantityDelta: line.quantity,
        balanceAfter,
        unitCost: line.unitCost,
        purchaseId,
        userId,
      });
      total += line.unitCost * line.quantity;
      itemCount += line.quantity;
    }

    await ctx.db.patch("purchases", purchaseId, { total, itemCount });
    return { purchaseId, productsCreated, linesImported: args.lines.length, total };
  },
});

async function withFileUrl(ctx: QueryCtx, purchase: Doc<"purchases">) {
  const fileUrl = await ctx.storage.getUrl(purchase.fileId);
  return { ...purchase, fileUrl };
}

export const getPurchase = query({
  args: { purchaseId: v.id("purchases") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const purchase = await ctx.db.get("purchases", args.purchaseId);
    if (!purchase) return null;
    const ledgerRows = await ctx.db
      .query("inventoryLedger")
      .withIndex("by_type", (q) => q.eq("type", "stock_in"))
      .take(1000);
    return {
      purchase,
      fileUrl: await ctx.storage.getUrl(purchase.fileId),
      ledgerRows: ledgerRows.filter((r) => r.purchaseId === args.purchaseId),
    };
  },
});

export const listPurchases = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const result = await ctx.db.query("purchases").order("desc").paginate(args.paginationOpts);
    return { ...result, page: await Promise.all(result.page.map((p) => withFileUrl(ctx, p))) };
  },
});
```

> Note: new products created via import get an empty `sku` (the supplier sheet has no SKU). Admins can set the SKU later in the Products page. Reorder threshold defaults to 0.

- [ ] **Step 4: Run test, expect PASS** — `npx vitest run convex/purchases.test.ts`.

- [ ] **Step 5: Verify full suite + push** — `npm run test` (all pass), `npx convex dev --once`, `npm run typecheck`, `npm run lint`.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: supplier purchase import backend with stock-in ledger"`

---

### Task 6: Supplier import UI

**Files:**
- Create: `app/(app)/inventory/import/page.tsx`
- Create: `app/(app)/inventory/purchases/page.tsx`
- Create: `components/PurchaseLineRow.tsx`
- Modify: `components/Nav.tsx` (add an admin link to Import / Purchases)

**Interfaces:**
- Consumes: `api.files.generateUploadUrl`, `api.purchases.createPurchase`, `api.purchases.listPurchases`, `api.purchases.getPurchase`, `api.products.list` (for the match autocomplete).

- [ ] **Step 1: Import page — upload + PDF viewer + entry table** (`app/(app)/inventory/import/page.tsx`)

Admin-guarded client page (mirror the existing admin-page guard: `null` while `currentUser===undefined`, "Admins only" if not admin). Layout: two columns on desktop (`grid md:grid-cols-2`), stacked on mobile.
- Left: a file input; on select, upload via `generateUploadUrl` + `fetch` POST (same helper as Task 2), keep `storageId` and a local object URL; show the PDF in an `<iframe src={objectUrl} className="w-full h-[70vh]">`.
- Right: header fields (supplier name, reference number, date `<input type="date">`), then an entry table of `PurchaseLineRow`s with an "Add line" button. A running total (`Σ unitCost*qty`) and total units.
- "Import" button (disabled until a file is uploaded and ≥1 valid line) calls `createPurchase` with `fileId = storageId` and the lines. On success: show a summary (`linesImported`, `productsCreated`, total) and a "New import" / "View purchases" action. On error: inline message; do not clear the form.

- [ ] **Step 2: `components/PurchaseLineRow.tsx`**

A row component with a mode toggle: **Existing** (autocomplete input querying `api.products.list` with `search`; selecting sets `existingProductId` + shows the product name/model) or **New** (inputs: name, model, category, sell price). Plus quantity (integer ≥1) and unit cost (≥0). Calls `onChange(index, lineValue)` and `onRemove(index)`. Validates its own fields and signals validity to the parent.

- [ ] **Step 3: Purchases history page** (`app/(app)/inventory/purchases/page.tsx`)

Admin-guarded. `usePaginatedQuery(api.purchases.listPurchases, {}, { initialNumItems: 20 })`. A list/cards of past imports: supplier, reference, date, `itemCount`, `formatPeso(total)`, and a "View PDF" link (`fileUrl`, opens in new tab). Optionally expand to show the imported ledger rows via `getPurchase`.

- [ ] **Step 4: Nav links** (`components/Nav.tsx`)

Add admin-only links: "Import Invoice" (`/inventory/import`) and "Purchases" (`/inventory/purchases`). Follow the existing `adminOnly` link pattern.

- [ ] **Step 5: Verify** — `npm run typecheck`, `npm run lint`, `npx next build`.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: supplier invoice import UI and purchases history"`

---

### Task 7: CSV + print-PDF export — TDD for the util

**Files:**
- Create: `lib/csv.ts`
- Create: `lib/csv.test.ts`
- Modify: `app/(app)/reports/page.tsx`
- Modify: `app/(app)/products/page.tsx` (or a dedicated inventory export control)
- Modify: `app/globals.css` (print styles for report/inventory)

**Interfaces:**
- Produces: `toCsv(rows: Record<string, unknown>[], columns: { key: string; header: string }[]): string`, `downloadCsv(filename: string, csv: string): void`.

- [ ] **Step 1: Write `lib/csv.test.ts` (failing)**

```ts
import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("emits headers then rows in column order", () => {
    const csv = toCsv(
      [{ name: "Tire", qty: 5 }],
      [{ key: "name", header: "Name" }, { key: "qty", header: "Qty" }],
    );
    expect(csv).toBe("Name,Qty\r\nTire,5");
  });

  it("quotes values containing commas, quotes, or newlines", () => {
    const csv = toCsv(
      [{ a: 'he said "hi"', b: "x,y", c: "line1\nline2" }],
      [{ key: "a", header: "A" }, { key: "b", header: "B" }, { key: "c", header: "C" }],
    );
    expect(csv).toBe('A,B,C\r\n"he said ""hi""","x,y","line1\nline2"');
  });
});
```

> Note: `lib/csv.test.ts` is picked up by the root vitest config (environment edge-runtime is fine for a pure function). Run with `npx vitest run lib/csv.test.ts`.

- [ ] **Step 2: Run test, expect FAIL** — `npx vitest run lib/csv.test.ts`.

- [ ] **Step 3: Implement `lib/csv.ts`**

```ts
export function toCsv(
  rows: Record<string, unknown>[],
  columns: { key: string; header: string }[],
): string {
  const escape = (val: unknown): string => {
    const s = val === null || val === undefined ? "" : String(val);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headerLine = columns.map((c) => escape(c.header)).join(",");
  const lines = rows.map((row) => columns.map((c) => escape(row[c.key])).join(","));
  return [headerLine, ...lines].join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run test, expect PASS** — `npx vitest run lib/csv.test.ts`.

- [ ] **Step 5: Wire export into Reports** (`app/(app)/reports/page.tsx`)

Add an "Export" control with two buttons: **Excel (CSV)** and **PDF**.
- CSV: build rows from the active-range summary (one row: revenue, profit, units, sale count) plus the top-products rows; call `toCsv` + `downloadCsv(\`report-${from}-${to}.csv\`, csv)`.
- PDF: wrap the report content in a `.report-print` container and add a Print button calling `window.print()`. Rely on `@media print` (Step 7) to show only `.report-print`.

- [ ] **Step 6: Wire export into Inventory/Products** (`app/(app)/products/page.tsx`)

Add an "Export inventory" control. Read a bounded full product set (reuse `api.products.list` with a large `initialNumItems`, e.g. 5000, or page through once) and build CSV rows: name, model, sku, category, costPrice, sellPrice, stockQty, stockValue (`costPrice*stockQty`), low-stock flag (`stockQty <= reorderThreshold`). Provide CSV download and a printable inventory view (`.report-print`) + Print button. If the dataset hit the bound, show a "showing first N" notice.

- [ ] **Step 7: Print CSS** (`app/globals.css`)

Add a print rule for the export views that coexists with the existing receipt print rule:

```css
@media print {
  body.printing-report * { visibility: hidden; }
  body.printing-report .report-print, body.printing-report .report-print * { visibility: visible; }
  body.printing-report .report-print { position: absolute; top: 0; left: 0; width: 100%; }
}
```

Toggle `document.body.classList.add("printing-report")` before `window.print()` and remove it after (use the `afterprint` event), so report printing and receipt printing don't conflict.

- [ ] **Step 8: Verify** — `npx vitest run lib/csv.test.ts` (pass), `npm run test` (full suite still green), `npm run typecheck`, `npm run lint`, `npx next build`.

- [ ] **Step 9: Commit** — `git add -A && git commit -m "feat: CSV and print-PDF export for reports and inventory"`

---

## Self-Review

**Spec coverage:** Schema changes (T1) · file storage/upload (T1) · product model+photo fields & imageUrl (T1) · photo upload UI (T2) · POS product grid (T3) · receipt cards + thumbnails (T4) · `getSale` imageUrl (T4) · supplier import backend `createPurchase`/`getPurchase`/`listPurchases` with stock_in ledger + purchaseId (T5) · import UI with PDF viewer + match/create lines (T6) · purchases history (T6) · CSV + print-PDF export on reports & inventory (T7). All eight spec sections mapped.

**Placeholders:** Backend tasks (T1, T5, T7-util) carry full code + tests. UI tasks (T2, T3, T4, T6, T7-wiring) specify exact files, the Convex functions consumed, and per-component behavior at component-responsibility granularity over the typed, tested backend — consistent with the v1 plan that shipped.

**Type consistency:** `createPurchase` line shape (`existingProductId`/`newProduct`/`quantity`/`unitCost`) matches between the test, the `lineValidator`, and T6's `PurchaseLineRow`. `withImageUrl`/`imageUrl` naming consistent across products/sales reads. `toCsv` signature matches test and both call sites. `purchaseId` on `inventoryLedger` consistent T1↔T5. Table-name-first Convex API used throughout.
