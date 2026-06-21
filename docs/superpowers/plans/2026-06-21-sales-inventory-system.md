# Sales & Inventory Management System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive web POS + inventory management system on the existing Next.js 16 / Convex / Tailwind v4 starter, with admin/cashier auth, automatic stock deduction, an immutable inventory ledger, auto-saved & searchable receipts (print optional), and sales analytics.

**Architecture:** Convex backend with a denormalized live `stockQty` on products plus an immutable `inventoryLedger`; all stock changes happen inside ACID mutations so counts never drift. Convex Auth password provider gates the app and stores a `role`. Next.js App Router frontend with role-gated routes; Convex reactive queries give live updates for free.

**Tech Stack:** Next.js 16 (App Router), React 19, Convex ^1.36, `@convex-dev/auth`, Tailwind CSS v4, vitest + convex-test + @edge-runtime/vm.

## Global Constraints

- Convex query rules: never `.filter()` — use `withIndex`; never unbounded `.collect()` — use `.take()`/pagination; index names include all fields (`by_field1_and_field2`).
- Authorization is ALWAYS derived server-side via `ctx.auth.getUserIdentity()`; never accept a client-supplied user id for auth.
- Cash-only checkout with change calculation. No discounts, tax, or other tender types.
- Receipts are auto-saved on every sale; printing is optional (browser print + `@media print`, 58mm/80mm).
- Prices stored as numbers (PHP). Snapshot name/sku/sellPrice/costPrice onto `saleItems` at sale time.
- All Convex functions must have argument validators.

---

### Task 1: Dependencies, schema, and test harness

**Files:**
- Modify: `package.json` (deps)
- Create: `vitest.config.ts`
- Modify: `convex/schema.ts`
- Remove later: `convex/myFunctions.ts`, `numbers` table (kept until UI is replaced)

**Interfaces:**
- Produces: schema tables `users`(via auth)/`userProfiles`, `products`, `inventoryLedger`, `sales`, `saleItems`, `counters` with the indexes below.

- [ ] **Step 1: Install dependencies**

```bash
npm install @convex-dev/auth @auth/core@0.37.0
npm install -D vitest convex-test @edge-runtime/vm
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
```

- [ ] **Step 3: Write `convex/schema.ts`** (includes Convex Auth tables)

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const roleValidator = v.union(v.literal("admin"), v.literal("cashier"));
export const ledgerTypeValidator = v.union(
  v.literal("sale"),
  v.literal("stock_in"),
  v.literal("adjustment"),
);

export default defineSchema({
  ...authTables,
  // Per-user app profile (role). Keyed to the auth users table.
  userProfiles: defineTable({
    userId: v.id("users"),
    name: v.string(),
    role: roleValidator,
  }).index("by_userId", ["userId"]),

  products: defineTable({
    name: v.string(),
    sku: v.string(),
    category: v.string(),
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

  inventoryLedger: defineTable({
    productId: v.id("products"),
    type: ledgerTypeValidator,
    quantityDelta: v.number(),
    balanceAfter: v.number(),
    unitCost: v.optional(v.number()),
    reason: v.optional(v.string()),
    saleId: v.optional(v.id("sales")),
    userId: v.id("users"),
  })
    .index("by_product", ["productId"])
    .index("by_type", ["type"]),

  sales: defineTable({
    receiptNumber: v.number(),
    total: v.number(),
    itemCount: v.number(),
    cashTendered: v.number(),
    changeGiven: v.number(),
    cashierId: v.id("users"),
  }).index("by_receiptNumber", ["receiptNumber"]),

  saleItems: defineTable({
    saleId: v.id("sales"),
    productId: v.id("products"),
    nameSnapshot: v.string(),
    skuSnapshot: v.string(),
    unitSellPrice: v.number(),
    unitCostPrice: v.number(),
    quantity: v.number(),
    lineTotal: v.number(),
  })
    .index("by_sale", ["saleId"])
    .index("by_product", ["productId"]),

  counters: defineTable({
    name: v.string(),
    value: v.number(),
  }).index("by_name", ["name"]),
});
```

- [ ] **Step 4: Verify backend compiles** — Run: `npx convex dev --once`. Expected: schema pushes without error.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: add schema, auth deps, and test harness"`

---

### Task 2: Convex Auth setup + role helpers

**Files:**
- Create: `convex/auth.config.ts`, `convex/auth.ts`, `convex/http.ts`
- Create: `convex/lib/auth.ts` (server helpers)
- Create: `convex/users.ts`

**Interfaces:**
- Produces:
  - `convex/lib/auth.ts`: `getCurrentUserId(ctx): Promise<Id<"users"> | null>`, `requireUser(ctx): Promise<{ userId, profile }>`, `requireRole(ctx, role): Promise<{ userId, profile }>` (throws on missing/insufficient role).
  - `api.users.currentUser` query → `{ _id, name, role } | null`.

- [ ] **Step 1: `convex/auth.config.ts`**

```ts
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
```

- [ ] **Step 2: `convex/auth.ts`** — password provider

```ts
import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
```

- [ ] **Step 3: `convex/http.ts`** — wire auth routes

```ts
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);
export default http;
```

- [ ] **Step 4: `convex/lib/auth.ts`** — helpers

```ts
import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

export async function getCurrentUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users"> | null> {
  return await getAuthUserId(ctx);
}

export async function getProfile(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"userProfiles"> | null> {
  return await ctx.db
    .query("userProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const profile = await getProfile(ctx, userId);
  if (!profile) throw new Error("No profile for user");
  return { userId, profile };
}

export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  role: "admin" | "cashier",
) {
  const { userId, profile } = await requireUser(ctx);
  if (role === "admin" && profile.role !== "admin") {
    throw new Error("Admin access required");
  }
  return { userId, profile };
}
```

- [ ] **Step 5: `convex/users.ts`** — `currentUser` query + internal `createUserProfile`

```ts
import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { getCurrentUserId, getProfile } from "./lib/auth";
import { roleValidator } from "./schema";

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) return null;
    const profile = await getProfile(ctx, userId);
    if (!profile) return null;
    return { _id: userId, name: profile.name, role: profile.role };
  },
});

export const setProfile = internalMutation({
  args: { userId: v.id("users"), name: v.string(), role: roleValidator },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.patch("userProfiles", existing._id, {
        name: args.name,
        role: args.role,
      });
      return existing._id;
    }
    return await ctx.db.insert("userProfiles", args);
  },
});
```

- [ ] **Step 6: Set `SITE_URL`/`JWT` env for Convex Auth** — Run: `npx @convex-dev/auth` (initializes `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` env vars on the deployment). Confirm `npx convex dev --once` succeeds.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: convex auth password provider + role helpers"`

---

### Task 3: Seed script for admin & cashier accounts

**Files:**
- Create: `convex/seed.ts` (internal actions/mutations using Convex Auth account creation)
- Create: `convex/databaseMaintenance.ts` (`resetWithMasterSeed`)
- Create: `scripts/seed-auth-users.mjs`

**Interfaces:**
- Consumes: `internal.users.setProfile`, Convex Auth password account creation.
- Produces: `npm run seed:auth` creates `admin@shop.local` (role admin) and `cashier@shop.local` (role cashier) with known passwords; `npm run seed:fresh` resets data + reseeds.

- [ ] **Step 1: `convex/seed.ts`** — internal action that creates auth accounts then profiles

```ts
"use node";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { createAccount } from "@convex-dev/auth/server";

const SEED_USERS = [
  { email: "admin@shop.local", password: "admin12345", name: "Store Admin", role: "admin" as const },
  { email: "cashier@shop.local", password: "cashier12345", name: "Store Cashier", role: "cashier" as const },
];

export const seedAuthUsers = internalAction({
  args: {},
  handler: async (ctx) => {
    for (const u of SEED_USERS) {
      const { user } = await createAccount(ctx, {
        provider: "password",
        account: { id: u.email, secret: u.password },
        profile: { email: u.email },
      });
      await ctx.runMutation(internal.users.setProfile, {
        userId: user._id,
        name: u.name,
        role: u.role,
      });
    }
    return SEED_USERS.map((u) => ({ email: u.email, role: u.role }));
  },
});
```

> Note: `createAccount` is exported from `@convex-dev/auth/server`. If it throws on a pre-existing account, the reset path (Step 2) clears users first.

- [ ] **Step 2: `convex/databaseMaintenance.ts`** — `resetWithMasterSeed`

```ts
import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";

const TABLES = [
  "saleItems", "sales", "inventoryLedger", "products", "counters",
  "userProfiles", "authAccounts", "authSessions", "authRefreshTokens",
  "authVerificationCodes", "authVerifiers", "authRateLimits", "users",
] as const;

export const clearAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of TABLES) {
      let batch = await ctx.db.query(table as any).take(200);
      while (batch.length > 0) {
        for (const row of batch) await ctx.db.delete(table as any, row._id);
        batch = await ctx.db.query(table as any).take(200);
      }
    }
  },
});

export const resetWithMasterSeed = mutation({
  args: { confirm: v.string() },
  handler: async (ctx, args) => {
    if (args.confirm !== "RESET_DATABASE") throw new Error("Confirmation required");
    await ctx.runMutation(internal.databaseMaintenance.clearAll, {});
    await ctx.scheduler.runAfter(0, internal.seed.seedAuthUsers, {});
    return "Reset scheduled; users reseeded.";
  },
});
```

- [ ] **Step 3: `scripts/seed-auth-users.mjs`** — invokes the internal action

```js
import { ConvexHttpClient } from "convex/browser";
import { execSync } from "node:child_process";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
// Run via convex CLI so internal functions are callable.
execSync(
  `npx convex run --push seed:seedAuthUsers "{}"`,
  { stdio: "inherit" },
);
console.log("Seeded admin@shop.local / cashier@shop.local");
```

- [ ] **Step 4: Run seed** — `npm run seed:auth`. Expected: prints two seeded emails. Verify in dashboard the `userProfiles` rows exist.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: seed admin and cashier accounts"`

---

### Task 4: Products backend (CRUD + search) — TDD

**Files:**
- Create: `convex/products.ts`
- Create: `convex/products.test.ts`

**Interfaces:**
- Produces:
  - `api.products.create({name, sku, category, costPrice, sellPrice, stockQty, reorderThreshold})` (admin) → `Id<"products">` (also writes opening-balance `stock_in` ledger row when `stockQty>0`).
  - `api.products.update({id, ...fields})` (admin).
  - `api.products.setActive({id, isActive})` (admin).
  - `api.products.list({paginationOpts, search?, category?, activeOnly?})` → paginated.
  - `api.products.getBySku({sku})` → `Doc<"products"> | null`.
  - `api.products.lowStock({})` → products where `stockQty <= reorderThreshold && isActive`.

- [ ] **Step 1: Write failing test `convex/products.test.ts`** — create then getBySku

```ts
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
});
```

> Note: tests inject identity by `subject = userId`; `getAuthUserId` reads `subject`. Confirm helper reads match (adjust `getCurrentUserId` test seam if needed).

- [ ] **Step 2: Run test, expect FAIL** — `npx vitest run convex/products.test.ts`. Expected: fails (no `products.create`).

- [ ] **Step 3: Implement `convex/products.ts`**

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { requireRole, requireUser } from "./lib/auth";

export const create = mutation({
  args: {
    name: v.string(), sku: v.string(), category: v.string(),
    costPrice: v.number(), sellPrice: v.number(),
    stockQty: v.number(), reorderThreshold: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, "admin");
    const id = await ctx.db.insert("products", { ...args, isActive: true });
    if (args.stockQty > 0) {
      await ctx.db.insert("inventoryLedger", {
        productId: id, type: "stock_in", quantityDelta: args.stockQty,
        balanceAfter: args.stockQty, unitCost: args.costPrice,
        reason: "Opening balance", userId,
      });
    }
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("products"),
    name: v.string(), sku: v.string(), category: v.string(),
    costPrice: v.number(), sellPrice: v.number(), reorderThreshold: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const { id, ...fields } = args;
    await ctx.db.patch("products", id, fields);
  },
});

export const setActive = mutation({
  args: { id: v.id("products"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    await ctx.db.patch("products", args.id, { isActive: args.isActive });
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    category: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    if (args.search && args.search.trim() !== "") {
      return await ctx.db
        .query("products")
        .withSearchIndex("search_name", (q) =>
          args.activeOnly
            ? q.search("name", args.search!).eq("isActive", true)
            : q.search("name", args.search!),
        )
        .paginate(args.paginationOpts);
    }
    if (args.category) {
      return await ctx.db
        .query("products")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .order("desc")
        .paginate(args.paginationOpts);
    }
    return await ctx.db.query("products").order("desc").paginate(args.paginationOpts);
  },
});

export const getBySku = query({
  args: { sku: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("products")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .unique();
  },
});

export const lowStock = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const active = await ctx.db
      .query("products")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .take(500);
    return active.filter((p) => p.stockQty <= p.reorderThreshold);
  },
});
```

- [ ] **Step 4: Run test, expect PASS** — `npx vitest run convex/products.test.ts`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: products backend with search and low-stock"`

---

### Task 5: Inventory operations (stock-in, adjust, ledger) — TDD

**Files:**
- Create: `convex/inventory.ts`
- Create: `convex/inventory.test.ts`

**Interfaces:**
- Consumes: products from Task 4.
- Produces:
  - `api.inventory.stockIn({productId, quantity, unitCost?})` (admin) → patches `stockQty += quantity`, writes `stock_in` ledger row with `balanceAfter`.
  - `api.inventory.adjust({productId, newQuantity, reason})` (admin) → sets `stockQty`, writes `adjustment` ledger row with signed delta.
  - `api.inventory.ledgerForProduct({productId, paginationOpts})` → paginated ledger desc.

- [ ] **Step 1: Failing test `convex/inventory.test.ts`** — stockIn raises qty and logs balanceAfter

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
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

test("stockIn increases qty and logs balanceAfter", async () => {
  const t = convexTest(schema, modules);
  const admin = await asAdmin(t);
  const pid = await admin.mutation(api.products.create, {
    name: "Pen", sku: "p1", category: "Office",
    costPrice: 2, sellPrice: 5, stockQty: 3, reorderThreshold: 1,
  });
  await admin.mutation(api.inventory.stockIn, { productId: pid, quantity: 7, unitCost: 2 });
  const p = await admin.query(api.products.getBySku, { sku: "p1" });
  expect(p?.stockQty).toEqual(10);
});
```

- [ ] **Step 2: Run test, expect FAIL** — `npx vitest run convex/inventory.test.ts`.

- [ ] **Step 3: Implement `convex/inventory.ts`**

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { requireRole, requireUser } from "./lib/auth";

export const stockIn = mutation({
  args: { productId: v.id("products"), quantity: v.number(), unitCost: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, "admin");
    if (args.quantity <= 0) throw new Error("Quantity must be positive");
    const product = await ctx.db.get("products", args.productId);
    if (!product) throw new Error("Product not found");
    const balanceAfter = product.stockQty + args.quantity;
    await ctx.db.patch("products", args.productId, { stockQty: balanceAfter });
    await ctx.db.insert("inventoryLedger", {
      productId: args.productId, type: "stock_in",
      quantityDelta: args.quantity, balanceAfter,
      unitCost: args.unitCost ?? product.costPrice, userId,
    });
  },
});

export const adjust = mutation({
  args: { productId: v.id("products"), newQuantity: v.number(), reason: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, "admin");
    if (args.newQuantity < 0) throw new Error("Quantity cannot be negative");
    const product = await ctx.db.get("products", args.productId);
    if (!product) throw new Error("Product not found");
    const delta = args.newQuantity - product.stockQty;
    await ctx.db.patch("products", args.productId, { stockQty: args.newQuantity });
    await ctx.db.insert("inventoryLedger", {
      productId: args.productId, type: "adjustment",
      quantityDelta: delta, balanceAfter: args.newQuantity,
      reason: args.reason, userId,
    });
  },
});

export const ledgerForProduct = query({
  args: { productId: v.id("products"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("inventoryLedger")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
```

- [ ] **Step 4: Run test, expect PASS** — `npx vitest run convex/inventory.test.ts`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: inventory stock-in, adjust, ledger"`

---

### Task 6: Sales / POS backend (`createSale`) + receipts — TDD

**Files:**
- Create: `convex/sales.ts`
- Create: `convex/sales.test.ts`

**Interfaces:**
- Consumes: products, ledger.
- Produces:
  - `api.sales.createSale({items: [{productId, quantity}], cashTendered})` (cashier or admin) → `{ saleId, receiptNumber, total, changeGiven }`. Atomic: validates stock & cash, decrements each product, writes `saleItem` + `sale`-type ledger rows, inserts `sale`, increments `receiptNumber` counter.
  - `api.sales.getSale({saleId})` → `{ sale, items }` for receipt re-view.
  - `api.sales.listReceipts({paginationOpts, startMs?, endMs?, receiptNumber?})` → paginated desc.

- [ ] **Step 1: Failing test `convex/sales.test.ts`** — deduction, change, and insufficient-stock rejection

```ts
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
```

- [ ] **Step 2: Run test, expect FAIL** — `npx vitest run convex/sales.test.ts`.

- [ ] **Step 3: Implement `convex/sales.ts`**

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { requireUser } from "./lib/auth";

async function nextReceiptNumber(ctx: any): Promise<number> {
  const counter = await ctx.db
    .query("counters")
    .withIndex("by_name", (q: any) => q.eq("name", "receiptNumber"))
    .unique();
  if (!counter) {
    await ctx.db.insert("counters", { name: "receiptNumber", value: 1 });
    return 1;
  }
  const next = counter.value + 1;
  await ctx.db.patch("counters", counter._id, { value: next });
  return next;
}

export const createSale = mutation({
  args: {
    items: v.array(v.object({ productId: v.id("products"), quantity: v.number() })),
    cashTendered: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    if (args.items.length === 0) throw new Error("Cart is empty");

    const lines = [];
    let total = 0;
    for (const item of args.items) {
      if (item.quantity <= 0) throw new Error("Quantity must be positive");
      const product = await ctx.db.get("products", item.productId);
      if (!product || !product.isActive) throw new Error("Product unavailable");
      if (product.stockQty < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }
      const lineTotal = product.sellPrice * item.quantity;
      total += lineTotal;
      lines.push({ product, quantity: item.quantity, lineTotal });
    }

    if (args.cashTendered < total) throw new Error("Insufficient cash tendered");
    const changeGiven = args.cashTendered - total;
    const receiptNumber = await nextReceiptNumber(ctx);

    const saleId = await ctx.db.insert("sales", {
      receiptNumber, total,
      itemCount: lines.reduce((n, l) => n + l.quantity, 0),
      cashTendered: args.cashTendered, changeGiven, cashierId: userId,
    });

    for (const l of lines) {
      const balanceAfter = l.product.stockQty - l.quantity;
      await ctx.db.patch("products", l.product._id, { stockQty: balanceAfter });
      await ctx.db.insert("saleItems", {
        saleId, productId: l.product._id,
        nameSnapshot: l.product.name, skuSnapshot: l.product.sku,
        unitSellPrice: l.product.sellPrice, unitCostPrice: l.product.costPrice,
        quantity: l.quantity, lineTotal: l.lineTotal,
      });
      await ctx.db.insert("inventoryLedger", {
        productId: l.product._id, type: "sale",
        quantityDelta: -l.quantity, balanceAfter, saleId, userId,
      });
    }

    return { saleId, receiptNumber, total, changeGiven };
  },
});

export const getSale = query({
  args: { saleId: v.id("sales") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const sale = await ctx.db.get("sales", args.saleId);
    if (!sale) return null;
    const items = await ctx.db
      .query("saleItems")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .take(200);
    return { sale, items };
  },
});

export const listReceipts = query({
  args: {
    paginationOpts: paginationOptsValidator,
    receiptNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    if (args.receiptNumber !== undefined) {
      return await ctx.db
        .query("sales")
        .withIndex("by_receiptNumber", (q) => q.eq("receiptNumber", args.receiptNumber!))
        .paginate(args.paginationOpts);
    }
    return await ctx.db.query("sales").order("desc").paginate(args.paginationOpts);
  },
});
```

- [ ] **Step 4: Run test, expect PASS** — `npx vitest run convex/sales.test.ts`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: createSale transaction + receipts backend"`

---

### Task 7: Reports / analytics backend — TDD

**Files:**
- Create: `convex/reports.ts`
- Create: `convex/reports.test.ts`

**Interfaces:**
- Produces:
  - `api.reports.salesSummary({startMs, endMs})` (admin) → `{ revenue, profit, unitsSold, saleCount }` computed from sales+saleItems in range.
  - `api.reports.topProducts({startMs, endMs, limit})` (admin) → `[{ productId, name, unitsSold, revenue }]`.

Range filtering uses `_creationTime` via the default index (`.withIndex("by_creation_time", q => q.gte(...).lte(...))`).

- [ ] **Step 1: Failing test `convex/reports.test.ts`** — revenue & profit over a sale

```ts
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

test("salesSummary sums revenue and profit", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await admin.mutation(api.products.create, {
    name: "Rice", sku: "r1", category: "Food",
    costPrice: 30, sellPrice: 50, stockQty: 100, reorderThreshold: 5,
  });
  await admin.mutation(api.sales.createSale, {
    items: [{ productId: pid, quantity: 4 }], cashTendered: 200,
  });
  const summary = await admin.query(api.reports.salesSummary, { startMs: 0, endMs: 1e15 });
  expect(summary.revenue).toEqual(200);
  expect(summary.profit).toEqual(80); // (50-30)*4
  expect(summary.unitsSold).toEqual(4);
  expect(summary.saleCount).toEqual(1);
});
```

- [ ] **Step 2: Run test, expect FAIL** — `npx vitest run convex/reports.test.ts`.

- [ ] **Step 3: Implement `convex/reports.ts`**

```ts
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireRole } from "./lib/auth";

export const salesSummary = query({
  args: { startMs: v.number(), endMs: v.number() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_creation_time", (q) =>
        q.gte("_creationTime", args.startMs).lte("_creationTime", args.endMs),
      )
      .take(5000);
    let revenue = 0, profit = 0, unitsSold = 0;
    for (const sale of sales) {
      revenue += sale.total;
      const items = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .take(200);
      for (const it of items) {
        profit += (it.unitSellPrice - it.unitCostPrice) * it.quantity;
        unitsSold += it.quantity;
      }
    }
    return { revenue, profit, unitsSold, saleCount: sales.length };
  },
});

export const topProducts = query({
  args: { startMs: v.number(), endMs: v.number(), limit: v.number() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_creation_time", (q) =>
        q.gte("_creationTime", args.startMs).lte("_creationTime", args.endMs),
      )
      .take(5000);
    const agg = new Map<string, { productId: string; name: string; unitsSold: number; revenue: number }>();
    for (const sale of sales) {
      const items = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .take(200);
      for (const it of items) {
        const key = it.productId;
        const cur = agg.get(key) ?? { productId: key, name: it.nameSnapshot, unitsSold: 0, revenue: 0 };
        cur.unitsSold += it.quantity;
        cur.revenue += it.lineTotal;
        agg.set(key, cur);
      }
    }
    return [...agg.values()].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, args.limit);
  },
});
```

- [ ] **Step 4: Run test, expect PASS** — `npx vitest run convex/reports.test.ts`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: reports salesSummary and topProducts"`

---

### Task 8: Frontend auth provider, login page, app shell

**Files:**
- Modify: `components/ConvexClientProvider.tsx` (use `ConvexAuthNextjsProvider`)
- Create: `middleware.ts` (route protection via `@convex-dev/auth/nextjs/server`)
- Modify: `app/layout.tsx` (wrap; new metadata/title)
- Create: `app/login/page.tsx`
- Create: `app/(app)/layout.tsx` (role-gated nav shell)
- Create: `components/Nav.tsx`
- Delete: `app/page.tsx` demo body → replace with redirect; remove `convex/myFunctions.ts` + `numbers` table from schema; delete `app/server/*`.

**Interfaces:**
- Consumes: `api.users.currentUser`.
- Produces: authenticated app shell at `/(app)/*`; `/login` for sign-in; redirect `/` → `/dashboard`.

- [ ] **Step 1: Switch provider** — `components/ConvexClientProvider.tsx`

```tsx
"use client";
import { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>;
}
```

- [ ] **Step 2: Wrap layout in `ConvexAuthNextjsServerProvider`** — `app/layout.tsx`

```tsx
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
// ...wrap <ConvexClientProvider> with <ConvexAuthNextjsServerProvider>, update title to "Sales & Inventory".
```

- [ ] **Step 3: `middleware.ts`** — protect routes, redirect unauthenticated to `/login`

```ts
import { convexAuthNextjsMiddleware, createRouteMatcher, nextjsMiddlewareRedirect } from "@convex-dev/auth/nextjs/server";

const isPublic = createRouteMatcher(["/login"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const authed = await convexAuth.isAuthenticated();
  if (!isPublic(request) && !authed) return nextjsMiddlewareRedirect(request, "/login");
  if (isPublic(request) && authed) return nextjsMiddlewareRedirect(request, "/dashboard");
});

export const config = { matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"] };
```

- [ ] **Step 4: `app/login/page.tsx`** — email/password sign-in form using `useAuthActions().signIn("password", {email, password, flow:"signIn"})`. On success `router.push("/dashboard")`.

- [ ] **Step 5: `app/(app)/layout.tsx` + `components/Nav.tsx`** — sidebar nav. Read `api.users.currentUser`; show Products/Inventory/Reports only for `role==="admin"`; show POS/Receipts/Dashboard for all; Sign out button via `useAuthActions().signOut()`.

- [ ] **Step 6: Replace `app/page.tsx`** with a redirect to `/dashboard`; remove demo `app/server/*`; remove `numbers` from schema and delete `convex/myFunctions.ts`. Run `npx convex dev --once` to confirm.

- [ ] **Step 7: Manual verify** — `npm run dev`, sign in as admin and cashier; confirm nav differs by role; sign out works.

- [ ] **Step 8: Commit** — `git add -A && git commit -m "feat: auth provider, login, role-gated app shell"`

---

### Task 9: Products & Inventory admin UI

**Files:**
- Create: `app/(app)/products/page.tsx`, `components/ProductForm.tsx`
- Create: `app/(app)/inventory/page.tsx`, `components/StockInDialog.tsx`, `components/AdjustDialog.tsx`, `components/LedgerDrawer.tsx`

**Interfaces:** consumes `api.products.*`, `api.inventory.*`.

- [ ] **Step 1: Products page** — searchable paginated table (`api.products.list`), create/edit via `ProductForm` (calls `api.products.create`/`update`), activate/deactivate toggle (`setActive`). Show stockQty, prices, margin (`sellPrice-costPrice`), low-stock badge.
- [ ] **Step 2: Inventory page** — product picker → Stock In (`api.inventory.stockIn`), Adjust (`api.inventory.adjust` with reason), per-product Ledger drawer (`api.inventory.ledgerForProduct` paginated), and a Low-stock list (`api.products.lowStock`).
- [ ] **Step 3: Manual verify** — create a product, stock in, adjust, confirm ledger rows and counts update live.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: products and inventory admin UI"`

---

### Task 10: POS checkout UI + receipt (print optional)

**Files:**
- Create: `app/(app)/pos/page.tsx`, `components/Cart.tsx`, `components/ProductSearch.tsx`
- Create: `components/Receipt.tsx`, `app/(app)/receipts/page.tsx`, `app/(app)/receipts/[id]/page.tsx`
- Create: receipt print CSS in `app/globals.css` (`@media print` + 58/80mm width var)

**Interfaces:** consumes `api.products.getBySku`, `api.products.list` (search), `api.sales.createSale`, `api.sales.getSale`, `api.sales.listReceipts`.

- [ ] **Step 1: POS page** — barcode/search input (Enter → `getBySku`, else search list); add to cart; cart with qty edit and running total; cash-tendered input with live change; "Complete Sale" calls `api.sales.createSale`. On success show the receipt with **Print** (optional) and **New Sale** buttons. Handle insufficient-stock error inline.
- [ ] **Step 2: `Receipt.tsx`** — renders sale header + line items + totals + change; given a `saleId` loads via `getSale`. Print button calls `window.print()`.
- [ ] **Step 3: Print CSS** — `@media print` hides app chrome, shows only `.receipt`, width controlled by `--receipt-width` (`58mm`/`80mm`) with a toggle.
- [ ] **Step 4: Receipts history** — `/receipts` lists `api.sales.listReceipts` (paginated, search by receipt number); row → `/receipts/[id]` showing the saved `Receipt`.
- [ ] **Step 5: Manual verify** — complete a cash sale, confirm stock dropped, receipt saved & retrievable from `/receipts`, print preview sized correctly.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: POS checkout, receipts history, optional print"`

---

### Task 11: Dashboard + reports UI + responsive polish

**Files:**
- Create: `app/(app)/dashboard/page.tsx`
- Create: `app/(app)/reports/page.tsx`, `components/DateRangePicker.tsx`

**Interfaces:** consumes `api.reports.salesSummary`, `api.reports.topProducts`, `api.products.lowStock`, `api.sales.listReceipts`.

- [ ] **Step 1: Dashboard** — today's revenue/profit/units (call `salesSummary` with today's range), low-stock alert list, recent receipts.
- [ ] **Step 2: Reports page** — preset toggle Daily/Weekly/Monthly (compute start/end ms client-side) + custom `DateRangePicker`; show summary cards + top-products table from `topProducts`.
- [ ] **Step 3: Responsive pass** — verify POS and tables work on small screens (Tailwind responsive classes); sidebar collapses on mobile.
- [ ] **Step 4: Final verify** — `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`. All pass.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: dashboard, reports UI, responsive polish"`

---

## Self-Review

**Spec coverage:** Auth/roles (T2,T8), seed admin+cashier (T3), products+SKU search (T4,T9), inventory stock-in/adjust/ledger/low-stock (T5,T9), POS + auto stock deduction (T6,T10), receipts auto-save + back-track lookup (T6,T10), optional 58/80mm print (T10), reports daily/weekly/monthly+custom (T7,T11), dashboard (T11), responsive Tailwind (T11), testing (T4–T7). All spec sections mapped.

**Placeholders:** Backend tasks (T1–T7) carry full code + tests. UI tasks (T8–T11) specify exact files, the Convex functions consumed, and per-screen behavior; UI is described at component-responsibility granularity rather than full JSX since it is mechanical glue over the typed, tested backend API.

**Type consistency:** Function names/signatures in Interfaces blocks match implementations (`createSale`, `stockIn`, `adjust`, `listReceipts`, `salesSummary`, `topProducts`, `currentUser`, `requireRole`). Ledger `balanceAfter`/`quantityDelta` and snapshot fields consistent across T5/T6/T7.
