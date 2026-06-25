## Why

The system captures rich inventory data — per-batch cost, `reorderThreshold`, an immutable stock ledger, per-line realized margins — but nothing turns it into *decisions*. Every existing report (`salesSummary`, `dashboardAnalytics`, `cashFlow`, `topProducts`) is sales-facing. An owner of a motor-parts shop cannot currently answer four cash-critical questions: *What's about to stock out? What's been sitting dead and tying up cash? What is my inventory worth right now? What should I reorder today?* Inventory is this business's largest cash sink; leaving it dark is the highest-leverage gap in the product.

## What Changes

- **New "Inventory Health" module** (admin-only) at `/(app)/inventory/health` that surfaces four decision views in one page:
  - **Stockout risk** — active products at or below `reorderThreshold`, sorted by severity, with days-to-stockout estimate from recent sales velocity.
  - **Dead stock** — active batches whose `qtyRemaining` has not moved for N days (30 / 90 / 180 thresholds), with the cash value tied up per batch.
  - **Inventory valuation** — current total value of on-hand stock at batch cost (sum of `batches.qtyRemaining * batches.unitCost`), with a category breakdown.
  - **Reorder suggestions** — for each at-risk product, a suggested reorder quantity derived from sales velocity and `reorderThreshold`, plus last known supplier and unit cost.
- **New Convex query** `inventoryHealth.snapshot` returning all four datasets in one round-trip, admin-guarded via existing `requireRole`.
- **New derived-metric helpers** in `convex/lib/` for sales-velocity and aging, written to be unit-testable (no `ctx` dependency).
- **Dashboard hook-in** — a compact "Health Alerts" stat card on the admin dashboard linking to the full page (stockout count + dead-stock value).
- No schema changes, no changes to any write path (sales, stock-in, adjustments, FIFO). Purely additive reads + UI.

## Capabilities

### New Capabilities
- `inventory-health`: Read-only decision support for inventory owners — stockout risk, dead-stock aging, inventory valuation, and reorder suggestions, computed from existing batches, ledger, and sale-item history.

### Modified Capabilities
<!-- None. No existing specs; no write paths or existing requirements change. -->

## Impact

- **Convex**: new file `convex/inventoryHealth.ts` (query); new `convex/lib/inventoryHealth.ts` (pure helpers: velocity, aging, valuation, reorder qty). New `inventoryHealth.test.ts` + `lib/inventoryHealth.test.ts`.
- **Frontend**: new route `app/(app)/inventory/health/page.tsx`; new components under `components/inventory/` (HealthSummary, StockoutRiskTable, DeadStockTable, ValuationCard, ReorderSuggestions). Minor edit to the dashboard page to add an alerts card.
- **Permissions**: admin-only, consistent with existing `reports.*` queries.
- **Performance**: bounded reads (existing 5000-sale and 500-batch caps already in the codebase); per-category and per-product aggregation reuse the same patterns as `reports.dashboardAnalytics`. No new indexes required for v1 — the existing `by_product_active`, `by_product`, and `by_sale` indexes suffice.
- **No migrations, no breaking changes.** All existing behavior preserved.
