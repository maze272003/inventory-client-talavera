# POS FIFO Multi-Batch Inventory + UX Overhaul — Design

**Date:** 2026-06-24
**Status:** Approved direction; spec under review
**Author:** brainstorming session (Claude + ferdinan@kodexa.com)

## 1. Summary

Two things ship together:

1. **A real multi-batch FIFO inventory backend.** Today every product carries a single `batchNumber` label and a single `stockQty`; stock-in and PDF import just increment that number. We introduce a `batches` table so each receipt of stock is its own dated batch with its own remaining quantity and cost. Sales allocate stock across batches **oldest-first (FIFO)**, automatically draining the oldest batch before touching newer ones.

2. **A POS UI overhaul.** A compact, touch-friendly retail two-panel layout that shows batch numbers, lazy-loads product images, loads products via infinite scroll (no "load all"), supports camera barcode scanning on phones/tablets, and adds category / stock / batch search and filtering.

### Decisions locked during brainstorming

| Decision | Choice |
|---|---|
| Batch depth | **Full multi-batch FIFO** with a real `batches` table + data migration |
| Expiry tracking | **None.** No expiry fields, no near-expiry highlighting. FIFO orders by batch creation time only |
| Stock-in batching | User **chooses** "new batch" vs "add to an existing batch" in the stock-in dialog |
| PDF import batching | Each imported line creates a **new batch** (no per-line choice during bulk import) |
| Camera scanning | **JS barcode library** (works on iOS Safari, Android, desktop). USB/Bluetooth keyboard scanners keep working through the text input |
| Large-list rendering | **Infinite scroll + lazy thumbnails only** (no windowing/virtualization library) |
| Barcode field | SKU **is** the barcode. No separate barcode column is added |

## 2. Goals & Non-Goals

### Goals
- Strict FIFO allocation across batches at checkout, server-side, with overselling impossible.
- Every product receipt (manual stock-in, PDF import, opening balance, adjustment increase) is a distinct batch with its own remaining quantity and unit cost.
- POS displays batch information: which batch FIFO will sell next, remaining quantity per batch, low-stock highlighting.
- POS loads in small paginated chunks via infinite scroll, lazy images, fast at 50,000+ products.
- Fully responsive (phone / tablet / desktop), touch-friendly, portrait + landscape.
- Camera barcode scanning plus existing keyboard-scanner / SKU text entry.
- Sales records and receipts capture the exact batch breakdown for audit.

### Non-Goals (explicitly out of scope)
- Expiration dates / near-expiry warnings (dropped per decision).
- Windowing/virtualization libraries (`react-window`, etc.).
- Editing or merging batches after creation, or manual batch re-ordering.
- Customer accounts, discounts, and tax engines (the original spec mentioned "Customer Information / Discounts / Taxes" — **not** in this iteration; see §13 Future Work). The cart stays product + cash like today.
- Warehouse/multi-location inventory.

## 3. Data Model Changes

### 3.1 New table: `batches`

The source of truth for on-hand quantity.

```ts
batches: defineTable({
  productId: v.id("products"),
  batchNumber: v.string(),        // e.g. "BN-20260624-0007" (existing format)
  qtyReceived: v.number(),        // immutable, what arrived
  qtyRemaining: v.number(),       // decremented by FIFO sales / adjustments
  unitCost: v.number(),           // cost for this specific batch
  source: v.union(                // provenance for audit/reporting
    v.literal("opening"),
    v.literal("stock_in"),
    v.literal("purchase"),
    v.literal("adjustment"),
    v.literal("migration"),
  ),
  purchaseId: v.optional(v.id("purchases")),
  isActive: v.boolean(),          // depleted/voided batches set false (kept for history)
})
  .index("by_product", ["productId"])
  // FIFO: query a product's batches with remaining stock, ascending creation order.
  .index("by_product_active", ["productId", "isActive"])
  .index("by_batchNumber", ["batchNumber"]),
```

**FIFO ordering key:** `_creationTime` ascending. Convex returns index results in index order, then `_creationTime`; querying `by_product_active` and reading ascending gives oldest-first. Since expiry is not tracked, creation time is the sole FIFO key.

### 3.2 `products` table — adjusted semantics (no field removed)

- `stockQty` becomes a **denormalized cached sum** of `qtyRemaining` across the product's active batches. It is never the source of truth, but it lets the product list paginate/sort and lets the grid show total stock without aggregating batches. Every code path that changes a batch's `qtyRemaining` must update `stockQty` in the same transaction.
- `batchNumber` (existing field) is **retained but demoted to a legacy/display hint** (the product's first/original batch label). Canonical batch numbers live on `batches`. We keep the field to avoid a destructive migration and to preserve existing UI that reads it; new code reads batch numbers from `batches`.
- `costPrice` stays as the product's default/reference cost (used to seed a batch's `unitCost` when no explicit cost is given). Per-batch cost lives on `batches.unitCost`.

No index changes required on `products`.

### 3.3 New table: `saleItemBatches`

Records the FIFO split for each sale line (one row per batch consumed). Keeps `saleItems` shape unchanged so existing reports/receipts keep working.

```ts
saleItemBatches: defineTable({
  saleItemId: v.id("saleItems"),
  saleId: v.id("sales"),             // denormalized for direct receipt lookup
  batchId: v.id("batches"),
  batchNumberSnapshot: v.string(),   // frozen label for the receipt
  quantity: v.number(),
  unitCost: v.number(),              // cost at time of sale (margin reporting)
})
  .index("by_saleItem", ["saleItemId"])
  .index("by_sale", ["saleId"]),
```

### 3.4 `inventoryLedger` — add optional batch link

Add `batchId: v.optional(v.id("batches"))` and index `by_batch` (`["batchId"]`). Existing rows stay valid (field optional). New stock movements record which batch they touched. `balanceAfter` continues to mean the **product** balance after the movement (unchanged meaning), so existing ledger UI is unaffected.

### 3.5 Counters

Reuse the existing `batchNumber` counter and `convex/lib/batch.ts` `nextBatchNumber()` for every new batch (manual stock-in, purchase line, adjustment increase, migration). Batch numbers stay globally unique and chronologically sortable.

## 4. FIFO Allocation Algorithm

A shared helper `allocateFifo(ctx, productId, quantity)` used by `createSale` (and adjustment decreases):

```
1. Load active batches: query batches by_product_active (productId, isActive=true), order asc (oldest first).
2. Walk batches accumulating qtyRemaining until `quantity` is covered.
   - If total available < quantity → throw "Insufficient stock for <name>" (oversell prevented).
3. For each batch touched (oldest→newest), compute take = min(qtyRemaining, needed):
   - patch batch.qtyRemaining -= take
   - if qtyRemaining reaches 0 → set isActive=false
   - record an allocation { batchId, batchNumber, take, unitCost }
4. Return the allocation list (drives saleItemBatches + ledger rows).
```

All reads/writes happen inside the single `createSale` mutation transaction, so concurrent sales of the same product serialize via Convex OCC — no partial allocation, no double-spend.

### 4.1 `createSale` rewrite (convex/sales.ts)

For each merged product line:
1. Load product; verify active.
2. `allocateFifo(ctx, productId, quantity)` → allocations (throws if short).
3. Insert one `saleItems` row (unchanged shape: name/sku snapshot, unitSellPrice, unitCostPrice, quantity, lineTotal). `unitCostPrice` = weighted average of allocated batch costs (so existing margin reports stay sensible), or the single batch's cost when one batch covers the line.
4. Insert one `saleItemBatches` row per allocation.
5. Insert one `inventoryLedger` row per allocation (`type:"sale"`, `quantityDelta: -take`, `batchId`, `saleId`, `balanceAfter` = product stock after this line).
6. Update `product.stockQty` to the new cached sum.

Receipt/audit summary unchanged at the header level; batch breakdown available via `saleItemBatches`.

## 5. Stock-In, Purchase Import, Adjustments

### 5.1 `inventory.stockIn` (user chooses new vs existing batch)
New optional arg `targetBatchId: v.optional(v.id("batches"))`:
- **No `targetBatchId`** → create a **new batch** (`nextBatchNumber`, `qtyReceived = qtyRemaining = quantity`, `unitCost = unitCost ?? product.costPrice`, `source:"stock_in"`).
- **`targetBatchId` given** → add to that batch: `qtyReceived += quantity`, `qtyRemaining += quantity` (re-activate if it had been depleted).
Then update `product.stockQty`, write a ledger row with `batchId`, and audit.

### 5.2 Opening balance (products.create)
When a product is created with `stockQty > 0`, create one batch (`source:"opening"`, `unitCost = costPrice`) instead of only writing a ledger row. The product's `batchNumber` field is set to this first batch's number (preserves current behavior). The grid's "batch" display reads from `batches`.

### 5.3 PDF purchase import (purchases.createPurchase)
Each line creates a **new batch** (`source:"purchase"`, `purchaseId` set, `unitCost = line.unitCost`). New-product lines: create product, then its first batch. Existing-product lines: add a new batch (do **not** fold into an existing one). Update `stockQty`, ledger row carries `batchId` + `purchaseId`.

### 5.4 `inventory.adjust` (absolute set, reconciled to batches)
`adjust` sets an absolute `newQuantity`. Reconcile batches so their `qtyRemaining` sum equals `newQuantity`:
- **Decrease** (`delta < 0`) → drain `|delta|` via FIFO (oldest first), same helper as sales, ledger `type:"adjustment"`.
- **Increase** (`delta > 0`) → create one new batch (`source:"adjustment"`, `unitCost = product.costPrice`) holding the surplus.
Update `stockQty`, audit as today.

## 6. Backend Queries (reads for the POS)

### 6.1 `products.list` — enrich page with batch summary
For each product in the page (page size ~24, bounded N+1 is fine), attach:
- `activeBatchCount: number`
- `nextBatchNumber: string | null` — the oldest active batch's number (what FIFO sells next; shown on the card)
- (`stockQty` already on the product = cached total)
Plus `imageUrl` as today. Add `category` and a `stockFilter` arg (see §8).

### 6.2 `batches.listForProduct(productId)`
Returns active batches oldest-first with `batchNumber`, `qtyRemaining`, `unitCost`, `_creationTime` — drives the "remaining quantity per batch" product-detail view and the cart's FIFO preview.

### 6.3 `products.categories()`
Distinct category list for filter chips. Pragmatic bound: read `by_active` up to a cap (e.g. `take(1000)`) and dedupe; documented limitation, revisited if categories explode. (Alternative noted in Future Work: maintain a `categories` table.)

### 6.4 Search by batch number
`products.list` `search` already matches name (search index) and SKU exact (via `getBySku` in the search box). Add batch-number lookup: if the term matches the `BN-...` pattern, resolve via `batches.by_batchNumber` → product. The scan box (`ProductSearch`) tries SKU, then batch number, then name search.

## 7. POS UI Overhaul (app/(app)/pos + components)

### 7.1 Layout
Retail two-panel:
- **Left / main panel:** scan box, category filter chips, search + filter controls, product **grid** (infinite scroll).
- **Right panel (desktop ≥ xl):** cart items (each showing FIFO batch), order total, cash tendered, change, complete-sale.
- **Mobile / tablet (< xl):** single column; cart + payment collapse into the existing sticky bottom sheet pattern (already present in `pos/page.tsx`), enlarged for touch.

### 7.2 Product card (`ProductGrid`)
Shows: lazy-loaded image (`loading="lazy"`, `decoding="async"`, aspect-square), name, **SKU/barcode**, **next FIFO batch number** (+ "·N batches" when `activeBatchCount > 1`), total stock, sell price. Low-stock (≤ reorderThreshold) → warning badge; out-of-stock → disabled + danger badge. Large touch target (min 44px controls).

### 7.3 Infinite scroll
Replace the "Load more" button with an `IntersectionObserver` sentinel at the grid's end that calls `loadMore(24)` when `status === "CanLoadMore"`. Keep a manual "Load more" fallback button for no-JS/observer-unsupported and accessibility. Grid lives in an overflow-scrollable container so the page body never scrolls horizontally.

### 7.4 Camera barcode scanning
A "Scan" button opens a camera modal using a JS barcode library (candidate: `@zxing/browser`, MIT, supports iOS Safari via `getUserMedia`). On decode → feed the value into the same SKU/batch lookup path as typed input, then close. Requires `getUserMedia` permission UI and a graceful "camera unavailable" fallback to typing. Library choice finalized in the plan (size/maintenance check); keyboard/USB scanners are unaffected.

### 7.5 Cart line FIFO preview (`Cart`)
Each cart line shows the batch(es) FIFO will consume for the current quantity, computed client-side from `batches.listForProduct` (oldest-first). Pure preview — the authoritative split is recomputed server-side at checkout. Shows e.g. "Batch BN-20260601-0002 ×3" and, when a line spans batches, lists each.

### 7.6 Workflow niceties (already partly present)
Auto-focus the scan box after adding an item (exists in `ProductSearch`); keep keyboard shortcuts (`/`, `Ctrl+Enter`, `Ctrl+N`, `?`). Real-time cart via Convex reactivity (no refresh).

## 8. Search & Filtering

- **Search:** name (search index), SKU/barcode (exact), batch number (`BN-` pattern → batch index).
- **Filters:**
  - **Category** — chips driven by `products.categories()`, passed as `category` to `products.list`.
  - **Stock availability** — `stockFilter: "all" | "inStock" | "low" | "out"`. Applied server-side in the page handler against the indexed `by_active` / `by_category` result, dropping non-matching rows per page. Documented caveat: filtered pages may be short; infinite scroll keeps loading until `isDone`, so the user still sees all matches.
  - **Batch** — searching a batch number narrows to that product.

## 9. Checkout & Overselling

- Stock is **revalidated inside `createSale`** at commit time (the FIFO walk *is* the validation). If any line can't be fully allocated → the whole mutation throws and nothing is written (transactional).
- Client shows the server error via the existing toast/error UI. Cart is preserved so the cashier can adjust.
- Concurrency: Convex OCC serializes conflicting writes to the same batches; a losing transaction retries against fresh data, so two terminals can't both drain the last unit.

## 10. Performance

- Server-side pagination (`usePaginatedQuery`, 24/page) — never load all products.
- Lazy image thumbnails (`loading="lazy"`); images served via Convex storage signed URLs (already cached per query result).
- `stockQty` cached sum avoids per-product batch aggregation in the list.
- Batch summary enrichment bounded to one page (~24 products) per request.
- Indexes added: `batches.by_product_active`, `batches.by_batchNumber`, `inventoryLedger.by_batch`.
- No N+1 across the whole catalog; FIFO touches only a product's own (typically few) active batches.

## 11. Responsiveness & Accessibility

- Breakpoints follow existing Tailwind setup; two-panel at `xl`, stacked + bottom sheet below.
- Touch targets ≥ 44px; large primary buttons.
- Portrait + landscape: grid columns scale (2 → 3 → 4+) by width.
- Horizontal overflow contained (`overflow-x-auto`) on the grid/cart; page body never scrolls sideways.
- Keyboard shortcuts and ARIA labels preserved/extended; camera modal is focus-trapped (reuse `useFocusTrap`).

## 12. Migration Plan

Self-scheduling `internalMutation` `migrations.backfillBatches` (the `take(n)` + `ctx.scheduler.runAfter(0, ...)` batching pattern from the Convex guidelines; no new dependency):

```
For each product not yet backfilled (track via cursor / a `migratedBatches` flag or "no batches exist for product"):
  if stockQty > 0:
    create one batch:
      batchNumber = product.batchNumber ?? nextBatchNumber(now)
      qtyReceived = qtyRemaining = stockQty
      unitCost = product.costPrice
      source = "migration"
      isActive = true
  process ~100 products per invocation, reschedule until done.
```

- Idempotent: skip products that already have ≥1 batch.
- Run once in dev, then prod, via `npx convex run`.
- After backfill, `stockQty` already equals the batch sum, so no recompute needed.
- Existing `inventoryLedger` rows keep `batchId` undefined (historical); acceptable.

Order of rollout: deploy schema (new tables/indexes, all additive) → deploy new functions → run backfill → deploy new POS UI.

## 13. Testing Plan

Backend (`convex-test` + `vitest`, files in `convex/`):
- FIFO single batch, exact-fit, multi-batch span, oldest-first ordering.
- Oversell rejected (sum across batches < requested) — nothing written.
- Batch depletion sets `isActive=false`; `stockQty` cached sum stays correct.
- Stock-in new batch vs add-to-existing.
- Purchase import creates a batch per line (new + existing product).
- Adjustment decrease drains FIFO; increase creates a batch; `stockQty` reconciles.
- Concurrent sales of the last units (OCC) — exactly one succeeds.
- Migration backfill idempotency and correctness.
- `saleItemBatches` rows match the FIFO split; receipt query returns breakdown.

Frontend:
- Infinite scroll loads next page near bottom; manual fallback works.
- Product card renders batch number / count, low/out-of-stock states.
- Cart FIFO preview matches batch order.
- Responsive layout at phone/tablet/desktop widths; bottom sheet on mobile.
- Camera scan decode → lookup path (mocked decoder).

## 14. File-by-File Change List

**Schema/backend**
- `convex/schema.ts` — add `batches`, `saleItemBatches`; add `batchId` + `by_batch` to `inventoryLedger`.
- `convex/lib/fifo.ts` *(new)* — `allocateFifo` helper + cached-sum updater.
- `convex/sales.ts` — rewrite `createSale` for FIFO; write `saleItemBatches` + per-batch ledger; weighted-avg cost.
- `convex/inventory.ts` — `stockIn` (new/existing batch), `adjust` (FIFO reconcile).
- `convex/products.ts` — `create` opening batch; `list` batch-summary enrichment + `stockFilter`; `categories` query.
- `convex/purchases.ts` — `createPurchase` batch per line.
- `convex/batches.ts` *(new)* — `listForProduct`, batch-number lookup.
- `convex/migrations.ts` *(new)* — `backfillBatches` internalMutation.
- `convex/sales.getSale` / receipt query — include `saleItemBatches` breakdown.

**Frontend**
- `app/(app)/pos/page.tsx` — two-panel layout, filters, category chips, scan button.
- `components/ProductGrid.tsx` — infinite scroll (IntersectionObserver), batch display, lazy images, stock filter.
- `components/ProductSearch.tsx` — SKU → batch → name lookup chain; integrate camera scan result.
- `components/CameraScanner.tsx` *(new)* — camera modal + JS barcode decoder.
- `components/Cart.tsx` — per-line FIFO batch preview.
- `components/Receipt.tsx` — show batch breakdown per line.
- `components/StockInDialog.tsx` — new-batch vs existing-batch choice.
- `components/ui/index.ts` — export any new primitives if needed.
- `package.json` — add barcode-scanning library.

## 15. Future Work (deferred)
- Discounts, taxes, customer accounts on the cart.
- Expiry tracking + near-expiry alerts (if inventory mix changes).
- `categories` table for unbounded category sets.
- Windowing if cashiers routinely scroll thousands of unfiltered items.
