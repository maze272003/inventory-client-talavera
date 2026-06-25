# inventory-health Specification

## Purpose
TBD - created by archiving change add-inventory-health. Update Purpose after archive.
## Requirements
### Requirement: Inventory Health snapshot is admin-only
The `inventoryHealth.snapshot` query SHALL require the `admin` role via the existing `requireRole(ctx, "admin")` guard. Non-admin callers SHALL be rejected. This matches the access posture of every query in `reports.*`.

#### Scenario: Admin retrieves the snapshot
- **WHEN** an admin calls `inventoryHealth.snapshot` with `{ nowMs, velocityWindowDays }`
- **THEN** the query returns an object containing `stockoutRisk`, `deadStock`, `valuation`, and `reorderSuggestions` datasets

#### Scenario: Cashier is denied
- **WHEN** a cashier calls `inventoryHealth.snapshot`
- **THEN** the query throws an authorization error and returns no data

#### Scenario: Unauthenticated caller is denied
- **WHEN** a caller with no identity calls `inventoryHealth.snapshot`
- **THEN** the query throws an authentication error

### Requirement: Snapshot returns all four datasets in one round-trip
A single call to `inventoryHealth.snapshot` SHALL return exactly the keys `stockoutRisk`, `deadStock`, `valuation`, and `reorderSuggestions`, so the page subscribes once and renders an atomic view of the catalog. No client SHALL need to issue multiple queries to populate the Inventory Health page.

#### Scenario: Single subscription populates the page
- **WHEN** the Inventory Health page mounts and subscribes to `inventoryHealth.snapshot`
- **THEN** all four sections of the page (Stockout Risk, Dead Stock, Valuation, Reorder Suggestions) are populated from that one subscription's result

### Requirement: Stockout Risk surfaces at-risk active products
For every active product (`isActive === true`), the query SHALL compute current `stockQty`, daily sales velocity over the supplied lookback window (default 30 days), and days-to-stockout. It SHALL include in `stockoutRisk` any product whose `stockQty` is at or below its `reorderThreshold`, OR whose computed days-to-stockout is finite and at or below a 14-day warning horizon. Results SHALL be sorted so the most urgent (lowest days-to-stockout, stocked-out first) appear first.

#### Scenario: Product at or below reorder threshold appears
- **WHEN** a product has `stockQty = 4` and `reorderThreshold = 5`
- **THEN** it is included in `stockoutRisk` regardless of sales velocity

#### Scenario: Stocked-out product sorts first
- **WHEN** product A has `stockQty = 0` and product B has `stockQty = 2` with `threshold = 5`
- **THEN** product A appears before product B in `stockoutRisk`

#### Scenario: Fast seller below warning horizon appears
- **WHEN** a product has `stockQty = 10`, `reorderThreshold = 20` (so not threshold-flagged), but velocity implies it stocks out in 7 days
- **THEN** the product is included in `stockoutRisk` due to the 14-day warning horizon

#### Scenario: Healthy product is excluded
- **WHEN** a product has `stockQty` well above threshold and projected days-to-stockout beyond the warning horizon
- **THEN** it is not included in `stockoutRisk`

### Requirement: Dead Stock classified by last ledger movement, not batch creation
For each active batch, the query SHALL determine "last movement" as the timestamp of the most recent `inventoryLedger` row for that product (fetched via `by_product` index ordered descending, take 1 per batch). A batch whose last movement exceeds an aging band threshold SHALL appear in `deadStock` under that band. Bands SHALL be 30, 90, and 180 days. A batch that is still moving SHALL NOT appear.

#### Scenario: Old batch with recent movement is not dead
- **WHEN** a batch was created 200 days ago but has a ledger entry within the last 10 days
- **THEN** it does not appear in `deadStock`

#### Scenario: Stale batch lands in the correct band
- **WHEN** a batch's most recent ledger entry was 45 days ago
- **THEN** it appears under the 30-day band (and not the 90-day or 180-day bands)

#### Scenario: Never-sold received stock surfaces as dead
- **WHEN** a batch has only `stock_in` ledger entries, the most recent 95 days ago, and still has `qtyRemaining > 0`
- **THEN** it appears under the 90-day band

#### Scenario: Each dead-stock row carries tied-up cash value
- **WHEN** a batch appears in `deadStock`
- **THEN** the row includes `qtyRemaining`, `unitCost`, and `cashValue` equal to `qtyRemaining × unitCost`

### Requirement: Inventory Valuation reported at batch cost
The query SHALL compute `valuation.totalCostValue` as the sum of `qtyRemaining × unitCost` across all active batches. It SHALL also compute `valuation.totalRetailValue` as the sum of `qtyRemaining × product.sellPrice`. It SHALL additionally return a `byCategory` breakdown of cost value. The two figures SHALL be reported separately and never conflated into a single number.

#### Scenario: Cost and retail are distinct
- **WHEN** the snapshot is computed for a catalog with both cost and sell prices
- **THEN** `valuation.totalCostValue` and `valuation.totalRetailValue` are returned as separate fields, with `totalRetailValue >= totalCostValue` for any product with a positive margin

#### Scenario: Category breakdown sums to the total
- **WHEN** `valuation.byCategory` is summed across all categories
- **THEN** the result equals `valuation.totalCostValue`

#### Scenario: Inactive products excluded
- **WHEN** a product has `isActive === false`
- **THEN** its batches do not contribute to `valuation`

### Requirement: Reorder Suggestions derived from velocity and threshold
For each product in `stockoutRisk`, the query SHALL compute `suggestedReorderQty` using the pure helper: `max(0, velocityPerDay × targetStockDays − currentStockQty)`, where `targetStockDays` defaults to 30. The suggestion SHALL additionally surface the last known supplier name and last known unit cost from the product's most recent archived-or-not `purchases` row. Suggestions SHALL be display-only; no purchase SHALL be created by reading this data.

#### Scenario: Fast seller gets a larger suggestion
- **WHEN** product A sells 2 units/day and product B sells 0.2 units/day, both at `stockQty = 0`
- **THEN** product A's `suggestedReorderQty` is greater than product B's

#### Scenario: Healthy stock yields zero reorder
- **WHEN** a product's `stockQty` already covers `targetStockDays` of velocity
- **THEN** `suggestedReorderQty` is 0

#### Scenario: Unknown velocity falls back to threshold-based floor
- **WHEN** a product has zero sales in the lookback window but is at threshold
- **THEN** `suggestedReorderQty` is at least `reorderThreshold − stockQty` (a positive floor)

#### Scenario: Supplier and last cost are attached
- **WHEN** a product has at least one prior `purchases` entry
- **THEN** the suggestion includes `lastSupplierName` and `lastUnitCost` from that purchase

#### Scenario: No writes occur
- **WHEN** any admin reads the reorder suggestions any number of times
- **THEN** no `purchases`, `batches`, `saleItems`, or `inventoryLedger` documents are created, modified, or archived

### Requirement: Derived metrics are pure and unit-testable
Every derived quantity (sales velocity, aging classification, valuation, reorder quantity) SHALL be implemented as a pure function in `convex/lib/inventoryHealth.ts` taking plain arrays/values and returning plain values, with no dependency on `ctx`. The Convex query layer SHALL delegate to these functions and not perform arithmetic itself. This matches the established `lib/fifo.ts` pattern.

#### Scenario: Velocity computed without a database
- **WHEN** `computeVelocity` is called in a vitest unit test with a hand-built array of sale items and a window
- **THEN** it returns the correct units/day without any Convex context

#### Scenario: Reorder qty computed without a database
- **WHEN** `suggestReorder` is called in a unit test with explicit `{ stockQty, threshold, velocityPerDay, targetDays }`
- **THEN** it returns the expected quantity deterministically

### Requirement: Bounded reads with truncation signaling
The query SHALL bound every scan with `take(N)` consistent with the codebase's existing caps (5000 sales, 500 batches per product). If any bounding cap is hit, the response SHALL include `truncated: true` and the page SHALL display a visible warning. This mirrors the `truncated` field already returned by `reports.dashboardAnalytics`.

#### Scenario: Normal catalog returns not-truncated
- **WHEN** the active catalog is well below all caps
- **THEN** the response includes `truncated: false`

#### Scenario: Cap hit surfaces a warning
- **WHEN** the active-batch scan or sale-items scan reaches its cap
- **THEN** the response includes `truncated: true` and the UI renders a banner warning that figures may be incomplete

### Requirement: Inventory Health page is a read-only decision surface
The Inventory Health route (`/(app)/inventory/health`) SHALL be admin-only and SHALL contain no mutation triggers. It SHALL link from a dashboard "Health Alerts" stat card showing the count of stockout-risk items and total dead-stock cash value. The page SHALL NOT provide any control that creates, edits, archives, or reverts any document.

#### Scenario: Page renders four sections
- **WHEN** an admin navigates to `/inventory/health`
- **THEN** the page renders Stockout Risk, Dead Stock, Valuation, and Reorder Suggestions sections, all populated from the single snapshot subscription

#### Scenario: Non-admin cannot reach the page
- **WHEN** a cashier attempts to navigate to `/inventory/health`
- **THEN** access is denied at the query layer (the snapshot throws) and the page shows no data

#### Scenario: Dashboard surfaces a link with headline numbers
- **WHEN** an admin views the dashboard
- **THEN** a Health Alerts card is visible showing the stockout-risk count and dead-stock cash value, and links to `/inventory/health`

#### Scenario: No mutating controls exist on the page
- **WHEN** an admin interacts with any control on the Inventory Health page
- **THEN** no Convex mutation is invoked; all data is read-only

