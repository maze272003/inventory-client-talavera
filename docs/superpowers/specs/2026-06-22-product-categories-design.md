# Product Categories (Normalized) Design Spec

**Date:** 2026-06-22
**Status:** Approved design, ready for implementation planning
**Builds on:** the shipped products / supplier-import / OCR features on `feature/v2-enhancements`.

## 1. Overview

Replace the free-text product `category` string with a normalized **categories**
table, managed through a modal on the Products page (create / read / rename /
archive), and selected everywhere via a reusable **dropdown** (with inline
create) — in the Products create/edit form and the supplier-import line rows.

### Goals

- A `categories` table products reference by id, so renaming a category
  propagates everywhere automatically and archiving cleanly removes it from
  pickers.
- Full management UI: a modal on the Products page to create, list, rename, and
  archive/unarchive categories. No hard delete — **archive only**.
- A category **dropdown** (active categories + an "Add new category…" inline
  create) used in the Products form and the import "New product" line rows.

### Non-goals (YAGNI)

- No data migration. Per decision, existing test products are wiped via
  `npm run seed:fresh`; the system starts clean on the new schema.
- No category hierarchy / sub-categories — a flat list.
- No hard delete — archive only.
- No per-category colors/icons/ordering.

## 2. Deploy / reset sequence (no migration)

Existing product rows store `category` (string) and have no `categoryId`, so
pushing the new required `categoryId` would fail schema validation against them.
Therefore the order is:

1. **Reset under the current schema:** run
   `npm run seed:fresh` (→ `databaseMaintenance:resetWithMasterSeed`) to clear
   all data (products, purchases, ledger, sales, …) and reseed the admin/cashier
   accounts.
2. **Then push the new schema** (with `categoryId` required and the `categories`
   table). No backfill code is needed because there is no data to migrate.

The implementation plan must order the schema/reset task accordingly.

## 3. Schema changes (`convex/schema.ts`)

- **New `categories` table:**
  - `name: v.string()`
  - `isArchived: v.boolean()`
  - Index: `by_name` on `["name"]` (lookup + duplicate check); `by_archived`
    on `["isArchived"]` (list active vs all).
- **`products`:** replace `category: v.string()` with
  `categoryId: v.id("categories")`. Replace index `by_category` (`["category"]`)
  with `by_categoryId` (`["categoryId"]`). All other product fields/indexes
  unchanged.

## 4. Categories backend (`convex/categories.ts`)

All admin-gated (`requireRole(ctx, "admin")`); reads require auth
(`requireUser`) since dropdowns are used by both roles in their forms — but
category management mutations are admin-only.

- `list({ includeArchived?: boolean })` (requireUser) → categories ordered by
  name; active only unless `includeArchived` is true (for the management modal).
- `create({ name })` (admin) → trims `name`, rejects empty and rejects a
  duplicate **active** name (case-insensitive compare via `by_name`); inserts
  `{ name, isArchived: false }`; returns the new `Id<"categories">`.
- `rename({ id, name })` (admin) → trims, rejects empty/duplicate-active;
  patches `name`. (Because products reference by id, the new name shows
  everywhere automatically.)
- `setArchived({ id, isArchived })` (admin) → patches `isArchived`.

## 5. Reusable `CategorySelect` component (`components/CategorySelect.tsx`)

A client component: `{ value: Id<"categories"> | null; onChange: (id) => void }`.
- Loads active categories via `api.categories.list`.
- Renders a `<select>` of active categories plus an **"+ Add new category…"**
  entry; choosing it reveals a small inline input + Add button that calls
  `api.categories.create` and selects the returned id on success (errors shown
  inline, e.g. duplicate name).
- Used in `ProductForm` and `PurchaseLineRow`.

## 6. Manage Categories modal (Products page)

A "Manage categories" button on `app/(app)/products/page.tsx` opens a modal
(`components/CategoryManagerModal.tsx`, admin-only):
- Lists all categories via `api.categories.list({ includeArchived: true })`,
  archived ones visually muted.
- Create: a name input + Add (`categories.create`).
- Rename: inline edit per row (`categories.rename`).
- Archive/unarchive: a toggle per row (`categories.setArchived`).
- Inline error messages; live updates via Convex reactivity.

## 7. Wire-through (replace the `category` string everywhere)

- **`products.ts`:** `create`/`update` take `categoryId: v.id("categories")`
  (drop `category`). `list` category filter uses `by_categoryId`
  (`category?: Id<"categories">` arg). Product read queries (`list`, `getBySku`,
  `get`) **join the category and return `categoryName: string`** (and keep
  `categoryId`) so tables, the POS grid, and CSV export display the name.
- **`purchases.ts`:** `lineValidator.newProduct.category` → `categoryId:
  v.id("categories")`; `createPurchase` inserts products with `categoryId`.
- **`ProductForm.tsx`:** category text input → `CategorySelect` (stores
  `categoryId`); submit passes `categoryId`.
- **`PurchaseLineRow.tsx`:** the draft's `newCategory: string` →
  `newCategoryId: Id<"categories"> | null`; the New-product category field →
  `CategorySelect`; `isDraftValid` requires `newCategoryId !== null`;
  `emptyDraft()` initializes it null.
- **Import page (`import/page.tsx`):** `draftToLine` sends `categoryId`;
  `applyParsed` leaves `newCategoryId` null (OCR has no category for this
  supplier — the user picks from the dropdown). The "needs Category" hint
  remains.
- **Products page:** table/grid show `categoryName`; CSV export uses
  `categoryName`; any category filter uses `categoryId`.
- **Tests:** fixtures that create products with a `category` string switch to
  creating a category row and passing `categoryId` (a small shared test helper
  to create-or-get a category keeps this DRY).

## 8. Testing (`convex-test` + vitest)

- `categories`: `create` (trims, rejects empty + duplicate-active), `rename`
  (rejects duplicate-active), `setArchived` round-trip, `list` active-only vs
  `includeArchived`.
- `products.create` with a real `categoryId` resolves `categoryName` in reads;
  list filter by `categoryId` returns only that category's products.
- `createPurchase` with `newProduct.categoryId` creates products under that
  category.
- Update existing product/purchase/sales/inventory/reports test fixtures to the
  `categoryId` shape (via the shared helper).

## 9. Build order (drives the implementation plan)

1. **Schema + reset:** reset DB under the current schema (`seed:fresh`), then
   add the `categories` table and switch `products` to `categoryId`
   (+ `by_categoryId` index); push. (No backfill.)
2. **Categories backend** `convex/categories.ts` (CRUD + archive) + tests.
3. **products/purchases wire-through** (`categoryId` in/out, `categoryName`
   joins) + update all affected test fixtures.
4. **`CategorySelect`** component (dropdown + inline create).
5. **ProductForm + PurchaseLineRow + import page** use `CategorySelect`
   (`categoryId`).
6. **Manage Categories modal** on the Products page + table/CSV show
   `categoryName`.
