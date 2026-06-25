## 1. Schema additions (additive, non-breaking)

- [x] 1.1 In `convex/schema.ts`, add `"return"` to `ledgerTypeValidator`
- [x] 1.2 Add `"return"` literal to the `auditLog.action` union
- [x] 1.3 Add optional `returnId: v.id("returns")` to `inventoryLedger` (mirrors optional `saleId`/`purchaseId`)
- [x] 1.4 Add `returns` table with fields per design (`saleId`, `receiptNumber`, `totalRefund`, `itemCount`, `cashRefunded`, `processedBy`, `reason`) and indexes `by_sale`, `by_creation_time` (implicit `_creationTime`), `by_processedBy`
- [x] 1.5 Add `returnItems` table with fields per design (`returnId`, `saleId`, `saleItemId`, `productId`, `batchId`, `batchNumberSnapshot`, `nameSnapshot`, `skuSnapshot`, `unitSellPrice`, `unitCostPrice`, `quantity`, `lineRefund`) and indexes `by_return`, `by_saleItem`, `by_sale`, `by_product`
- [x] 1.6 Run `npm run typecheck:convex` — confirm schema compiles with no narrowing errors elsewhere

## 2. Pure helpers in `convex/lib/returns.ts` (testable in isolation)

- [x] 2.1 Create `convex/lib/returns.ts` exporting `computeRestorable(originalQty, priorReturnQtys)` returning a non-negative integer (clamped at 0)
- [x] 2.2 Export `distributeProportionally(saleItemBatchRows, returnQty)` returning `{ batchId, batchNumber, unitCost, quantity }[]` using largest-remainder rounding; rows sum to exactly `returnQty`
- [x] 2.3 Export `lineRefundFor(saleItemUnitSellPrice, returnQty)` returning `unitSellPrice × returnQty` (rounded to 2dp)
- [x] 2.4 Create `convex/lib/returns.test.ts` (vitest) covering: restorable with no priors, partial priors, fully-returned (0), over-prior clamps to 0; distribute 1-unit-on-3-from-2-batches, ties, sums-to-returnQty invariant across random fuzz inputs; lineRefund rounding
- [x] 2.5 Run `npm test` — helper tests green

## 3. Backend — `createReturn` mutation in `convex/returns.ts`

- [x] 3.1 Create `convex/returns.ts` with `export const createReturn = mutation({ args: { saleId: v.id("sales"), lines: v.array(v.object({ saleItemId: v.id("saleItems"), quantity: v.number() })), reason: v.optional(v.string()) }, ... })`
- [x] 3.2 Open with `const { userId } = await requireRole(ctx, "admin")` (admin-only)
- [x] 3.3 Reject empty `lines` array with descriptive error
- [x] 3.4 Load sale, throw "not found" if missing; throw "archived" if `isArchived === true`
- [x] 3.5 Load all `saleItems` for `saleId` via `by_sale` index; build a `Map<saleItemId, saleItem>`
- [x] 3.6 For each input line: reject if `saleItemId` not in map (belongs to a different sale) or `quantity < 1`
- [x] 3.7 For each input line: load existing `returnItems` by `by_saleItem` index, sum prior `quantity`, delegate to `computeRestorable`; reject if input qty > restorable
- [x] 3.8 For each input line: load `saleItemBatches` rows for that `saleItemId`, delegate to `distributeProportionally(rows, returnQty)` to get per-batch increments
- [x] 3.9 For each per-batch increment: `patch` the batch (increment `qtyRemaining`, set `isActive = qtyRemaining > 0`), insert a `returnItems` row with snapshots from the `saleItemBatches` row + parent `saleItem`
- [x] 3.10 After all lines processed per-product, call `recomputeStockQty(ctx, productId)` from `lib/fifo.ts` and capture the returned `balanceAfter`
- [x] 3.11 Insert one `inventoryLedger` row per restocked batch with `type: "return"`, positive `quantityDelta`, `balanceAfter`, `batchId`, `returnId`, `userId`; do NOT set `saleId`
- [x] 3.12 Compute `totalRefund` = Σ `lineRefundFor(...)`; `itemCount` = Σ return qtys; `cashRefunded = totalRefund`
- [x] 3.13 Insert the `returns` row with `saleId`, snapshot `receiptNumber` from sale, `totalRefund`, `itemCount`, `cashRefunded`, `processedBy: userId`, `reason`
- [x] 3.14 Patch the just-inserted ledger rows to set their `returnId` (or insert them after the returns row exists so `returnId` can be set in one pass — prefer the latter to avoid a second pass)
- [x] 3.15 Call `recordAudit` once with `action: "return"`, `entityTable: "sales"`, `entityId: saleId`, summary naming the receipt number + refund, `before: { priorReturnCount }`, `after: { returnId, totalRefund, itemCount }`, `undoable: false`
- [x] 3.16 Return `{ returnId, totalRefund, cashRefunded, itemCount }`
- [x] 3.17 Create `convex/returns.test.ts` (convex-test): admin success (full + partial), cashier denied, unauth denied, archived sale rejected, wrong-sale saleItem rejected, over-return rejected, batch restoration math, ledger rows have `returnId` set and `saleId` unset, audit row written with `action: "return"`, stock increased by returned qty, second return reduces restorable
- [x] 3.18 Run `npm run typecheck:convex` and `npm test` — green

## 4. Backend — read queries in `convex/returns.ts`

- [x] 4.1 `getReturn({ returnId })` (admin-only) → `{ return, items: returnItems[] }`
- [x] 4.2 `listForSale({ saleId })` (admin-only) → `returns[]` for the sale, oldest-first, each enriched with its `returnItems[]`
- [x] 4.3 `byPeriod({ startMs, endMs })` (admin-only) → bounded `take(N)` scan of `returns` by `_creationTime`, each row enriched with `returnItems[]` and `processedByName` from `userProfiles.by_userId`
- [x] 4.4 Add tests to `convex/returns.test.ts` for each query: admin succeeds, cashier denied, period enrichment includes admin name
- [x] 4.5 Run `npm run typecheck:convex` and `npm test` — green

## 5. Backend — net-of-returns in reports

- [x] 5.1 Add shared `loadReturnsInPeriod(ctx, startMs, endMs)` to `convex/lib/returns.ts` (or `convex/lib/reports.ts`) returning `Map<saleId, { refundTotal, bySaleItem: Map<saleItemId, {qty, refund}>, byProduct: Map<productId, {qty, refund}>, byCashier: Map<cashierId, {qty, refund}> }>`; bounded `take(5000)`; throws no error on truncation (returns a `truncated` flag alongside)
- [x] 5.2 Update `reports.salesSummary` to subtract `refundTotal` Σ from `revenue`; subtract per-line cost (using `returnItems.unitCostPrice × qty`) from `profit`; subtract returned qty from `unitsSold`; surface `truncated` in the response
- [x] 5.3 Update `reports.topProducts` to subtract per-product `qty` and `refund` from the per-product aggregates before sorting/slicing
- [x] 5.4 Update `reports.cashierPerformance` to subtract from the *original sale's cashier* (look up via `sales.cashierId` per return), not from the processing admin
- [x] 5.5 Update `reports.dashboardAnalytics` and `reports.cashFlow` to subtract `refundTotal` Σ from per-bucket revenue/profit; surface `truncated` if either the sales scan OR the returns scan hits a cap
- [x] 5.6 Augment existing report tests (`convex/reports.test.ts`) with cases: sale + same-period full return nets to 0; sale in prior period + return in current period reduces current period only; multi-line return on multi-batch sale; over-the-cap returns sets `truncated: true`
- [x] 5.7 Run `npm run typecheck:convex` and `npm test` — green

> **Implementation note (profit formula):** the spec text said "subtract per-line cost from profit," but mathematically net profit must reverse both revenue AND COGS. The implementation correctly subtracts the returned **line profit** (`refundTotal − costTotal`) so that a full return nets profit to exactly 0 (matching the spec scenario "sale + same-period full return nets to 0"). This applies to `salesSummary`, `dashboardAnalytics`, `rangeNetTotals`, and `cashierPerformance`.

## 6. Frontend — ReturnDialog and receipt integration

- [x] 6.1 Create `components/returns/ReturnDialog.tsx` — Dialog primitive wrapper that takes `saleId`, fetches sale + saleItems + existing returns via `api.returns.listForSale`, renders one row per saleItem with: name, original qty, already-returned qty, restorable qty, numeric input (clamped 0..restorable), computed line refund
- [x] 6.2 Show a live `totalRefund` summary; disable Confirm when all inputs are 0 or any input is invalid
- [x] 6.3 Include a `reason` text input (optional but encouraged; placeholder "e.g. defective, wrong item")
- [x] 6.4 On Confirm: call `api.returns.createReturn` with `{ saleId, lines, reason }`; show a success toast (`sonner`); close dialog; rely on live subscriptions to refresh receipt view + stock
- [x] 6.5 Surface mutation errors via toast (e.g. "Sale is archived", "Insufficient restorable quantity")
- [x] 6.6 Create `components/returns/ReturnsHistory.tsx` — given a `saleId`, list the sale's returns (date, lines summary, refund total, processed-by name) using `api.returns.listForSale`; render in the receipt detail panel below the sale items
- [x] 6.7 Edit the receipts detail view (`app/(app)/receipts/...`) to render a "Return" button (admin-only — gate by existing role check) on non-archived sales; open `ReturnDialog` on click
- [x] 6.8 Hide the "Return" button when the sale is archived; hide both button and `ReturnsHistory` for cashiers
- [x] 6.9 Use only existing primitives from `@/components/ui` (Dialog, Button, Input, Field, Label, Alert, EmptyState) — no new primitive files
- [x] 6.10 Run `npm run typecheck` and `npm run lint` — green

## 7. End-to-end verification

- [x] 7.1 `npm run typecheck` — green
- [x] 7.2 `npm run typecheck:convex` — green
- [x] 7.3 `npm run lint` — green
- [x] 7.4 `npm test` — all green (returns helpers, returns mutation/queries, augmented report tests)
- [ ] 7.5 Manual (admin): log in, ring up a multi-item sale, open the receipt, click Return, return 1 unit of one line and all of another, confirm the refund total, confirm stock increased for both products in the inventory list, confirm the audit log shows a `return` action, confirm the receipt's Returns history section shows the new return
- [ ] 7.6 Manual (admin): attempt to return more than the remaining restorable qty for a partially-returned line; confirm the dialog clamps/disables and the server rejects if bypassed
- [ ] 7.7 Manual (admin): archive a sale, confirm the Return button disappears; restore it, confirm it reappears
- [ ] 7.8 Manual (cashier): confirm the Return button and Returns history section are not visible
- [ ] 7.9 Manual (admin): on the dashboard / reports page, confirm a same-period full return nets the period revenue to 0 for that sale/return pair, and a late return reduces only the return-day period
- [x] 7.10 Diff check: `git diff convex/schema.ts` shows only additive changes (new tables, new optional field, widened unions) — no existing field changed or removed
