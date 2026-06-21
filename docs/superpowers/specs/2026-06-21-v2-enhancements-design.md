# Sales & Inventory — v2 Enhancements Design Spec

**Date:** 2026-06-21
**Status:** Approved design, ready for implementation planning
**Builds on:** `2026-06-21-sales-inventory-system-design.md` (v1, already shipped on `main`)

## 1. Overview

Six enhancements to the shipped motorcycle-parts POS & inventory system:

1. Supplier invoice import — upload a supplier PDF, view it on-screen, manually
   enter its line items, and import them as products + stock into the existing
   inventory ledger.
2. POS product grid — a tappable product catalog in the POS, alongside the
   existing scan/search.
3. Product photos — one image per product, shown in POS, products table, and
   on-screen receipts.
4. Receipt cards UI — `/receipts` as a card grid; on-screen receipt shows
   product thumbnails.
5. Reports + inventory export — Excel (CSV) and PDF (browser print) export.
6. Inventory alignment — the import writes proper `stock_in` ledger entries and
   creates/updates products in the **existing** schema; no parallel system.

### Non-goals (YAGNI)

- No AI/OCR parsing of the PDF. Line items are entered manually while viewing
  the uploaded document.
- No true `.xlsx` generation or PDF library — Excel export is CSV, PDF export
  uses the browser print dialog.
- No multi-photo galleries — one image per product.
- No supplier master/accounts-payable module — `purchases` records the invoice
  for stock-in only.

## 2. Schema Changes

All changes extend the existing tables in `convex/schema.ts`; the inventory
ledger remains the single source of truth for stock movements.

- **`products`** — add:
  - `model: v.optional(v.string())` — e.g. "XRM", "TMX125".
  - `imageId: v.optional(v.id("_storage"))` — product photo.
- **`inventoryLedger`** — add:
  - `purchaseId: v.optional(v.id("purchases"))` — links a `stock_in` row to its
    supplier invoice.
- **New `purchases` table** — the supplier invoice header:
  - `supplierName: v.string()`
  - `referenceNumber: v.optional(v.string())` — the supplier's quotation/invoice
    number (e.g. "508238").
  - `purchaseDate: v.number()` — ms timestamp.
  - `fileId: v.id("_storage")` — the uploaded PDF.
  - `total: v.number()` — sum of line `unitCost * quantity`.
  - `itemCount: v.number()` — total units received.
  - `userId: v.id("users")` — who imported it.
  - Index: `by_supplier` on `["supplierName"]`. (Date ordering uses the system
    `by_creation_time` index.)

No existing field is removed or renamed. New product fields are optional, so
existing product rows remain valid.

## 3. Supplier Invoice Import

**Page:** `app/(app)/inventory/import/page.tsx` (admin only). Also a Purchases
history list (`app/(app)/inventory/purchases/page.tsx` or a section) showing
past imports with their re-viewable PDF.

**Flow:**

1. Admin picks a PDF. Client calls `api.files.generateUploadUrl` (mutation),
   POSTs the file to the returned URL, and receives a `storageId`.
2. The uploaded PDF is displayed on-screen via an `<iframe>` pointed at the
   storage URL (resolved by a query that calls `ctx.storage.getUrl`).
3. Beside the PDF, an entry table. Each row:
   - **Match existing product** (autocomplete by name / SKU / model), OR
   - **Create new product inline**: name (= ITEM), model (= MODEL), category,
     sell price; cost price defaults from the line's unit cost.
   - **Quantity** (integer > 0) and **unit cost** (= W.SALE).
4. Header fields: supplier name, reference number, purchase date.
5. **Confirm** → `api.purchases.createPurchase` (admin), one atomic mutation:
   - For each line: if new, insert the product (`isActive: true`); then patch
     `product.stockQty += quantity` and insert a `stock_in` `inventoryLedger`
     row with `quantityDelta = +quantity`, `balanceAfter`, `unitCost`, and
     `purchaseId`.
   - Insert the `purchases` header (`fileId`, supplier, ref, date, computed
     `total` and `itemCount`).
   - Returns `{ purchaseId, productsCreated, linesImported, total }`.
   - Any invalid line throws → the whole import rolls back (ACID).

**Backend module `convex/purchases.ts`:**

- `createPurchase({ fileId, supplierName, referenceNumber?, purchaseDate, lines: [{ existingProductId? , newProduct?: { name, model?, category, sellPrice }, quantity, unitCost }] })` (admin).
  Each line must have exactly one of `existingProductId` / `newProduct`.
- `getPurchase({ purchaseId })` → `{ purchase, fileUrl, ledgerRows }`.
- `listPurchases({ paginationOpts })` → paginated desc, each with `fileUrl`.

**Backend module `convex/files.ts`:**

- `generateUploadUrl()` (admin) → upload URL string.
- (URL resolution for display is done inside the purchase/product queries via
  `ctx.storage.getUrl`.)

## 4. POS Product Grid

`app/(app)/pos/page.tsx` + `components/ProductGrid.tsx`.

- A responsive grid of product cards (photo or placeholder, name, model, sell
  price, stock badge). Tap a card → add to cart (qty 1, increments if present;
  same merge behavior as scan). Out-of-stock cards are visibly disabled.
- The existing scan/search input is retained; typing filters the grid (reuses
  `api.products.list` with `search` + `activeOnly: true`, paginated, "Load
  more").

## 5. Product Photos

- `components/ProductForm.tsx` gains an image picker: on file select, call
  `api.files.generateUploadUrl`, upload, store the returned `storageId` as
  `imageId` when calling `api.products.create` / `update`.
- `api.products.create` / `update` accept optional `model` and `imageId`.
- Product read queries (`list`, `getBySku`, and a `get`) return a resolved
  `imageUrl: string | null` (via `ctx.storage.getUrl(imageId)`) so the UI never
  handles storage ids directly.
- Thumbnails shown in: products table, POS grid, on-screen receipt line items.
  Printed receipts remain text-only.

## 6. Receipt Cards UI

- `app/(app)/receipts/page.tsx` becomes a **card grid**: each card shows receipt
  number, date/time, item count, total, cashier name. Cards link to
  `/receipts/[id]`. Search by receipt number retained.
- `components/Receipt.tsx` on-screen view shows a small product **thumbnail**
  per line item (from `imageUrl`), with name, qty × unit price, line total.
- The `@media print` receipt view is unchanged (58/80mm monospace text, no
  images).

## 7. Reports + Inventory Export

No new dependencies. A shared `lib/csv.ts` `toCsv(rows, columns)` builds a CSV
string; a `downloadCsv(filename, csv)` helper triggers a Blob download.
PDF export = a print-optimized view + `window.print()` (Save as PDF).

- **Reports page** (`app/(app)/reports/page.tsx`): an Export control offering
  **Excel (CSV)** and **PDF**. CSV contains the summary (revenue, profit, units,
  sale count) and the top-products rows for the active range. PDF prints a clean
  report layout for the range.
- **Inventory/Products**: Export the product list (name, model, SKU, category,
  cost, sell, stock, stock value = cost × stock, low-stock flag) as CSV, and a
  printable inventory report as PDF.
- Each export reads a bounded full dataset (e.g. `take(5000)`); if truncated,
  the UI shows a notice.

`toCsv` correctly escapes values containing commas, quotes, and newlines
(RFC-4180 quoting).

## 8. Testing (`convex-test` + vitest)

- `createPurchase`: creating new products, matching existing ones, correct
  `stock_in` ledger rows (`quantityDelta`, `balanceAfter`, `unitCost`,
  `purchaseId`), `stockQty` increase, computed `total`/`itemCount`, and atomic
  rollback when a line is invalid.
- Products: `model` + `imageId` round-trip through create/update; `imageUrl`
  resolved in reads.
- `toCsv` unit test: header + row ordering, and escaping of commas/quotes/
  newlines.

## 9. Build Order (drives the implementation plan)

1. Schema + `convex/files.ts` (`generateUploadUrl`) + product `model`/`imageId`
   fields and `imageUrl` in product reads.
2. Product photo upload UI (ProductForm + table thumbnails).
3. POS product grid.
4. Receipt cards UI (list cards + per-line thumbnails).
5. Supplier import backend (`purchases` table, `createPurchase`, `getPurchase`,
   `listPurchases`) + tests.
6. Supplier import UI (upload + PDF viewer + line entry + confirm + purchases
   list).
7. Export (`toCsv` util + print views + buttons) on Reports & Inventory.
