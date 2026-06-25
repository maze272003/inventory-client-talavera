# sales-returns Specification

## Purpose
TBD - created by archiving change add-sales-returns. Update Purpose after archive.
## Requirements
### Requirement: Return processing is admin-only
The `returns.createReturn` mutation SHALL require the `admin` role via `requireRole(ctx, "admin")`. Non-admin callers SHALL be rejected before any read or write. The read queries `returns.listForSale` and `returns.byPeriod` SHALL likewise require the admin role. This matches the access posture of every other money-or-stock mutation in the codebase (`sales.archive`, `sales.restore`, `inventory.adjust`, `inventory.stockIn`) and reflects that cash refunds are the highest-fraud-risk retail operation.

#### Scenario: Admin processes a return
- **WHEN** an admin calls `returns.createReturn` with valid inputs against a non-archived sale
- **THEN** the mutation succeeds and returns the new `{ returnId, totalRefund, cashRefunded }`

#### Scenario: Cashier is denied
- **WHEN** a cashier calls `returns.createReturn`
- **THEN** the mutation throws an authorization error before any database write and no documents are created or modified

#### Scenario: Unauthenticated caller is denied
- **WHEN** a caller with no identity calls `returns.createReturn`, `returns.listForSale`, or `returns.byPeriod`
- **THEN** the call throws an authentication error

### Requirement: Return targets exactly one non-archived sale
`createReturn` SHALL accept a single `saleId` and a non-empty array of `{ saleItemId, quantity }` lines. It SHALL reject the call when the `saleId` does not resolve to a `sales` document, when that sale has `isArchived === true`, or when any `saleItemId` in the input does not belong to the given `saleId`.

#### Scenario: Archived sale cannot be returned against
- **WHEN** `createReturn` is called with a `saleId` whose sale has `isArchived === true`
- **THEN** the mutation throws a descriptive error and performs no writes

#### Scenario: SaleItem from a different sale is rejected
- **WHEN** the input contains a `saleItemId` whose `saleItems.saleId` does not match the request's `saleId`
- **THEN** the mutation throws a descriptive error and performs no writes

#### Scenario: Empty line array is rejected
- **WHEN** the input `lines` array is empty
- **THEN** the mutation throws a descriptive error and performs no writes

### Requirement: Return quantity cannot exceed restorable quantity per line
For each input line, the mutation SHALL compute `restorableQty = originalSaleItem.quantity − Σ(quantity of existing returnItems rows for that saleItemId)`. It SHALL reject the call with a descriptive error when the input `quantity` is less than 1, or when `quantity > restorableQty`. This enforces that no sale line can be returned more than once in aggregate across all returns against the sale, while permitting multiple partial returns that sum to at most the original quantity.

#### Scenario: Full return of a line succeeds
- **WHEN** a saleItem has original `quantity = 3` and no prior returns, and the input requests `quantity = 3`
- **THEN** the mutation succeeds

#### Scenario: Partial return then second partial succeeds
- **WHEN** a saleItem has original `quantity = 3`, a prior return consumed 1, and the input requests `quantity = 2`
- **THEN** the mutation succeeds and the line is now fully returned

#### Scenario: Over-return is rejected
- **WHEN** a saleItem has original `quantity = 3`, a prior return consumed 1, and the input requests `quantity = 3`
- **THEN** the mutation throws an error stating the maximum restorable quantity is 2 and performs no writes

#### Scenario: Zero or negative quantity is rejected
- **WHEN** any input line has `quantity < 1`
- **THEN** the mutation throws an error and performs no writes

### Requirement: Restorable-quantity math is a pure unit-testable helper
The function `computeRestorable(originalQty, priorReturnQtys)` SHALL be exported from `convex/lib/returns.ts` as a pure function taking plain numbers/arrays and returning a non-negative integer, with no dependency on `ctx`. The Convex mutation layer SHALL delegate to this helper and SHALL NOT re-implement the arithmetic. This matches the established `lib/fifo.ts` and `lib/inventoryHealth.ts` pattern.

#### Scenario: Restorable computed without a database
- **WHEN** `computeRestorable(5, [2, 1])` is called in a vitest unit test
- **THEN** it returns `2` with no Convex context

#### Scenario: Fully-returned line yields zero
- **WHEN** `computeRestorable(3, [1, 2])` is called
- **THEN** it returns `0`

### Requirement: Stock restoration returns units to the original batches proportionally
For each returned saleItem, the mutation SHALL read every `saleItemBatches` row for that saleItemId (which together sum to the original saleItem quantity), compute a proportional share of the return quantity per batch, and increment each batch's `batches.qtyRemaining` by that share. Integer rounding SHALL be resolved via largest-remainder allocation so that the per-batch increments sum to exactly the input return quantity. Batches that had `qtyRemaining === 0` SHALL be re-activated (`isActive = true`) by the increment. The restoration SHALL reuse the `unitCost` snapshot from `saleItemBatches` and SHALL NOT re-derive cost via FIFO or current product price.

#### Scenario: Single-batch line restores to that batch
- **WHEN** a saleItem of quantity 2 was allocated from one batch, and 1 unit is returned
- **THEN** exactly that batch's `qtyRemaining` increases by 1 and one `returnItems` row is written for that batch with `quantity = 1`

#### Scenario: Multi-batch line distributes proportionally and sums to the return qty
- **WHEN** a saleItem of quantity 3 was allocated from batch A (2 units) and batch B (1 unit), and 2 units are returned
- **THEN** the per-batch increments sum to exactly 2, batch A's increment is greater than or equal to batch B's, and a `returnItems` row is written for each affected batch

#### Scenario: Depleted batch is re-activated
- **WHEN** a returned batch has `qtyRemaining = 0` and `isActive = false` before the return
- **THEN** after the return its `qtyRemaining > 0` and `isActive = true`

#### Scenario: Original unit cost is preserved
- **WHEN** a return is processed for a saleItem whose `saleItemBatches` recorded `unitCost = 50`
- **THEN** each resulting `returnItems` row carries `unitCostPrice = 50` regardless of the product's current `costPrice`

### Requirement: Proportional distribution is a pure unit-testable helper
The function `distributeProportionally(saleItemBatchRows, returnQty)` SHALL be exported from `convex/lib/returns.ts` as a pure function returning an array of `{ batchId, batchNumber, unitCost, quantity }` whose `quantity` values are non-negative integers that sum to exactly `returnQty`. Largest-remainder rounding SHALL be used so that larger contributing batches absorb the residual. The Convex mutation layer SHALL delegate to this helper.

#### Scenario: One-unit return on a multi-batch line
- **WHEN** `distributeProportionally([{batchId: A, quantity: 2, unitCost: 50, batchNumber: "X"}, {batchId: B, quantity: 1, unitCost: 60, batchNumber: "Y"}], 1)` is called
- **THEN** it returns exactly one row with `quantity = 1` for batch A (the larger contributor) and no row for batch B

#### Scenario: Quantities always sum to the requested total
- **WHEN** `distributeProportionally` is called with any valid input where the original rows sum to at least `returnQty`
- **THEN** the returned rows' `quantity` values sum to exactly `returnQty`

### Requirement: Product stockQty cache is updated to match the ledger
After restocking all batches for a return, the mutation SHALL update `products.stockQty` for each affected product to equal the sum of its active batches' `qtyRemaining`, by calling the existing `recomputeStockQty(ctx, productId)` helper from `lib/fifo.ts`. The new `stockQty` SHALL equal the pre-return `stockQty` plus the total units returned for that product.

#### Scenario: Stock increases by the returned quantity
- **WHEN** a product has `stockQty = 5` before a return of 2 units of that product
- **THEN** after the return the product's `stockQty = 7`

#### Scenario: Stock matches the sum of batch remainders
- **WHEN** a return is processed for a product
- **THEN** the product's `stockQty` equals the sum of `qtyRemaining` across its active batches

### Requirement: One ledger row is written per restocked batch
For each batch restocked by a return, the mutation SHALL insert one `inventoryLedger` row with `type: "return"`, a positive `quantityDelta` equal to the units restored to that batch, a `balanceAfter` equal to the product's `stockQty` after this return is fully applied, the `batchId`, the `returnId`, and the `userId` of the admin who processed the return. No `saleId` SHALL be set on these rows (the ledger records the *return* event, not the original sale).

#### Scenario: Ledger row carries the return type and returnId
- **WHEN** a return restocks batch B with 1 unit
- **THEN** an `inventoryLedger` row is written with `type = "return"`, `quantityDelta = 1`, the batch's id, and the new return's id

#### Scenario: No saleId is set on return ledger rows
- **WHEN** any return ledger row is written
- **THEN** its `saleId` field is unset, while its `returnId` field is set to the new return's id

### Requirement: Cash refund equals the sum of line refunds at the original sale price
The mutation SHALL compute each line's refund as `saleItems.unitSellPrice × returnQuantity` (using the *sale-time* price snapshot, never the current product sell price). The return's `totalRefund` SHALL equal the sum of line refunds. The return's `cashRefunded` SHALL equal `totalRefund` exactly (v1 is cash-only; no rounding or partial cash refunds are permitted).

#### Scenario: Refund uses the original sale price
- **WHEN** a saleItem was sold at `unitSellPrice = 100` and the product has since been repriced to `120`, and 1 unit is returned
- **THEN** the line's `lineRefund = 100` and the return's `totalRefund = 100`

#### Scenario: Multi-line refund sums correctly
- **WHEN** a return contains line A (refund 100) and line B (refund 50)
- **THEN** the return's `totalRefund = 150` and `cashRefunded = 150`

### Requirement: A return document and its line items are immutable once written
After `createReturn` returns successfully, no subsequent mutation SHALL modify or delete the `returns` row, any of its `returnItems` rows, or the ledger rows it wrote. Correcting a mistake SHALL require a new sale at the same price, not an edit to the return. The mutation SHALL NOT expose any update or delete API for returns.

#### Scenario: No updateReturn or deleteReturn mutation exists
- **WHEN** the `convex/returns.ts` module is inspected
- **THEN** only `createReturn`, `getReturn`, `listForSale`, and `byPeriod` are exported; no mutation that patches or deletes a `returns` document exists

#### Scenario: Restorable-quantity math reflects all prior returns
- **WHEN** a return has been processed and a second return against the same saleItem is attempted
- **THEN** the second return's restorable quantity is reduced by the first return's quantity, ensuring the original sale quantity is the hard ceiling

### Requirement: Audit log records the return as a distinct action
`createReturn` SHALL call `recordAudit` exactly once with `action: "return"`, a `summary` identifying the receipt number and total refund, `before` set to the sale's pre-return state (no prior return count), `after` set to `{ returnId, totalRefund, itemCount }`, and `undoable: false`. The `entityTable` SHALL be `"sales"` and the `entityId` SHALL be the original `saleId`, so the audit timeline of a receipt shows its returns alongside its creation and any archive/restore.

#### Scenario: Audit entry is written with the return action
- **WHEN** an admin processes a return for receipt #42 with `totalRefund = 150`
- **THEN** an `auditLog` row exists with `action = "return"`, `entityTable = "sales"`, `entityId` referencing receipt #42, `summary` containing both the receipt number and the refund amount, and `undoable = false`

#### Scenario: Exactly one audit row per return
- **WHEN** a return is processed
- **THEN** exactly one `auditLog` row with `action = "return"` is written for that return event

### Requirement: Returns are attributed to the period in which the return was processed
Every report that nets out returns SHALL subtract a return's refund and quantities from the period containing the return's `_creationTime`, not the period of the original sale. This matches cash-till reality (cash leaves on the return date) and matches the existing dashboard's restated-view semantics.

#### Scenario: Late return reduces the return-day period
- **WHEN** a sale occurs on Day 1 and a return for that sale is processed on Day 5, and the day-granular revenue report covers Day 5 only
- **THEN** Day 5's net revenue is reduced by the return's `totalRefund` and Day 1's revenue is unchanged

#### Scenario: Same-period return nets to near-zero
- **WHEN** a sale for 100 and a full return of 100 both occur within the same report period
- **THEN** the period's net revenue contribution from that sale/return pair is 0

### Requirement: Existing sales reports reflect net-of-returns revenue and profit
The queries `reports.salesSummary`, `reports.dashboardAnalytics`, `reports.cashFlow`, `reports.topProducts`, and `reports.cashierPerformance` SHALL each subtract returns processed within their queried period from gross sales when computing revenue, profit, and (where applicable) units sold. For `topProducts`, the per-product units-sold and revenue SHALL be reduced by the corresponding `returnItems` rows. For `cashierPerformance`, the original-selling cashier's totals SHALL be reduced by returns of their sales (regardless of which admin processed the return), because the metric is "cashier sales performance" not "cashier return-processing performance". A shared helper `loadReturnsInPeriod(ctx, startMs, endMs)` SHALL perform the bounded scan once per report invocation.

#### Scenario: Sales summary nets out a return
- **WHEN** a period contains a sale of 200 and a return of 50
- **THEN** `reports.salesSummary` returns `revenue = 150` for that period

#### Scenario: Top products reflects returned units
- **WHEN** product P sold 10 units in the period and 2 units of P were returned in the same period
- **THEN** `reports.topProducts` reports P with `unitsSold = 8`

#### Scenario: Cashier performance charges the original seller
- **WHEN** cashier C sold 5 units, an admin later processed a return of 1 of those units, and `cashierPerformance` is run for the period containing the sale
- **THEN** cashier C's units total is 4 and the processing admin's total is unaffected by the return

#### Scenario: Returns before the period do not affect the period
- **WHEN** a return was processed before the report's `startMs`
- **THEN** it is not subtracted from any report total for the period

### Requirement: Returns scan is bounded with truncation signaling
The `loadReturnsInPeriod` helper SHALL bound its scan with `take(N)` consistent with the existing report cap of 5000. Reports that use the helper SHALL surface a `truncated` boolean in their response (set true if any of their internal scans hit a cap, including the returns scan), mirroring the `truncated` field already returned by `reports.dashboardAnalytics`.

#### Scenario: Normal returns volume returns not-truncated
- **WHEN** a period contains fewer than the cap returns
- **THEN** the report response includes `truncated: false`

#### Scenario: Cap hit surfaces a warning
- **WHEN** the returns scan reaches its cap
- **THEN** the report response includes `truncated: true` and the UI renders a banner that figures may be incomplete

### Requirement: Returns can be listed per-sale and per-period
The query `returns.listForSale({ saleId })` SHALL return all `returns` rows for a given sale, oldest-first, each enriched with its `returnItems` rows. The query `returns.byPeriod({ startMs, endMs })` SHALL return all `returns` rows whose `_creationTime` falls in the range, enriched with line items and the processing admin's profile name. Both queries are admin-only.

#### Scenario: Per-sale list returns all returns for a receipt
- **WHEN** an admin calls `returns.listForSale` for a sale that has had two partial returns
- **THEN** the query returns both `returns` rows in creation order, each with its `returnItems`

#### Scenario: Period query enriches with admin name
- **WHEN** an admin calls `returns.byPeriod` for a period containing one return processed by admin Alice
- **THEN** the returned row includes `processedByName = "Alice"`

### Requirement: Return UI is reachable from the receipt view and admin-gated
The receipt detail view at `/(app)/receipts` SHALL render a "Return" action on every non-archived sale, visible only to admins. Activating it SHALL open a `ReturnDialog` component that lists each saleItem with its restorable quantity, lets the admin enter a return quantity per line (defaulting to 0, clamped to restorable), shows the live `totalRefund` as lines are edited, requires a `reason` (free text), and on confirmation calls `returns.createReturn`. After a successful return, the receipt view SHALL show the return inline in a "Returns history" section with date, lines, and refund. Non-admins SHALL NOT see the Return action or the returns-history section.

#### Scenario: Admin sees the Return action
- **WHEN** an admin views a non-archived receipt
- **THEN** a "Return" action is visible on the receipt

#### Scenario: Cashier does not see the Return action
- **WHEN** a cashier views a receipt
- **THEN** no "Return" action is rendered and no return can be initiated from the UI

#### Scenario: Dialog clamps input to restorable quantity
- **WHEN** a saleItem has restorable quantity 2 and the admin enters 5 in the dialog
- **THEN** the input is clamped to 2 (or the confirm action is disabled with an explanatory message)

#### Scenario: Successful return updates the receipt view
- **WHEN** the admin confirms a return in the dialog
- **THEN** the dialog closes, the new return appears in the receipt's Returns history section, and the live subscription reflects the restocked `products.stockQty`

#### Scenario: Archived sale shows no Return action
- **WHEN** an admin views a receipt whose sale has `isArchived === true`
- **THEN** no "Return" action is rendered (consistent with the rejection that would occur server-side)

