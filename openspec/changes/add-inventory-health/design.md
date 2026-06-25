## Context

MotorShop POS already records everything needed to manage inventory proactively: `products.reorderThreshold`, per-`batches` cost (`unitCost`, `qtyRemaining`, `_creationTime`), an immutable `inventoryLedger` of every movement, and per-`saleItems` cost snapshots for realized margin. The gap is purely in *reads* — no query aggregates this into owner-facing decisions. Existing reports (`reports.ts`) focus exclusively on sales-side analytics. This change adds the missing inventory-side read paths and a single decision page. It touches no write path (sales, stock-in, adjustments, FIFO allocation all stay byte-identical), requires no schema migration, and reuses the codebase's established patterns: a `requireRole(ctx, "admin")`-guarded query (like `reports.dashboardAnalytics`), pure helpers in `convex/lib/` (like `fifo.ts`), and vitest unit tests (like `fifo.test.ts`).

## Goals / Non-Goals

**Goals:**
- Let an admin answer, in one page load, four questions: *what stocks out next, what's dead, what's it all worth, what do I reorder*.
- Compute every metric from data that already exists — zero schema changes, zero migration risk.
- Make every derived metric (velocity, aging, valuation, reorder qty) a pure, unit-tested function so the math is auditable independent of Convex.
- Fit the existing real-time subscription model: one query, one round-trip, live-updating.

**Non-Goals:**
- **No** auto-generating or submitting purchase orders (display-only suggestions in v1; drafts are a follow-up change).
- **No** changes to write paths, FIFO logic, schema, or existing reports.
- **No** notifications/push/email alerts — the dashboard card + page is the surface. (Follow-up.)
- **No** multi-warehouse or per-location views — single-stock assumption holds for now.
- **No** predictive forecasting (seasonality, ARIMA, etc.) — straight velocity extrapolation only.
- **No** cashier-facing view — admin-only, matching `reports.*`.

## Decisions

### Decision 1 — One aggregated `snapshot` query, not four
The Convex query `inventoryHealth.snapshot` returns all four datasets (stockout risk, dead stock, valuation, reorder suggestions) in a single response, subscribed to once by the page.

**Why over the alternative (four queries):** Mirrors the established pattern in `reports.dashboardAnalytics`, which already bundles KPIs + timeseries + top products + category breakdown into one query for exactly the same reason — one round-trip, one real-time subscription, atomic view of the catalog. Four separate subscriptions would re-run overlapping scans (active batches, products) four times and could show inconsistent states during concurrent writes.

### Decision 2 — Pure helpers in `convex/lib/inventoryHealth.ts`
All four metrics are pure functions of plain arrays:
- `computeVelocity(saleItems, windowDays, nowMs) → units/day per product`
- `classifyAging(batchesWithLastMovement, nowMs, bands) → per-band bucketing`
- `computeValuation(activeBatches) → { totalCostValue, byCategory }`
- `suggestReorder({ stockQty, threshold, velocityPerDay, targetDays }) → qty`

**Why:** Identical rationale to why `allocateFifo`/`weightedAvgCost` live in `lib/fifo.ts` — the math is the riskiest part and must be unit-testable without standing up a Convex test DB. The query layer becomes a thin "fetch + delegate + shape" shell, again mirroring how `sales.createSale` delegates to `allocateFifo`.

### Decision 3 — Dead stock measured by *last ledger movement*, not `batches._creationTime`
A batch's "age" for dead-stock purposes is the time since its **last `inventoryLedger` entry**, fetched as `by_product` + `order("desc")` + `take(1)` per batch.

**Why over `batches._creationTime`:** A batch received 6 months ago that sold steadily until last week is *not* dead stock — but its `_creationTime` would flag it as 180-day dead. The ledger is the source of truth for movement (matches the codebase's own stated philosophy: `products.stockQty` is a cache of the ledger, not vice versa).

**Alternative considered:** A product-level "last sale" via `saleItems` — rejected because it misses stock that was received but never sold at all (a batch can exist with zero sale ledger rows; `stock_in` ledger entries still count as movement for "is it moving at all", and the absence of any *sale*-type ledger row after `stock_in` is itself the dead signal).

### Decision 4 — Velocity from a 30-day lookback over `saleItems`
`units/day = sum(quantity of saleItems for product in last 30d) / 30`. Days-to-stockout = `stockQty / max(velocity, epsilon)`. Reorder suggestion = `max(0, velocity × targetStockDays − stockQty)` where `targetStockDays` defaults to `reorderThreshold / velocity` when velocity is known, else a constant 30-day floor.

**Why 30 days:** Short enough to reflect current demand, long enough to smooth the lumpy, intermittent demand typical of motor parts (a SKU may sell 0 units for a week then 5 in a day). Configurable later; hard-coded constant in v1.

**Why over a per-SKU tuned window:** Adds ML/complexity out of scope for v1. The displayed number is explicitly an *estimate*; owner judgment stays in the loop.

### Decision 5 — Valuation at batch cost, not retail
`computeValuation` sums `qtyRemaining × unitCost` across active batches. Retail value (sell-side) is a secondary metric shown alongside but never conflated with cost value.

**Why:** The owner question being answered is *"how much cash is tied up"*, which is cost-basis. Conflating with retail would overstate the recoverable amount (you don't get retail for dead stock). Showing both — labeled clearly — prevents the false comfort.

### Decision 6 — No new indexes in v1
Reads use existing indexes: `batches.by_product_active`, `inventoryLedger.by_product` (desc, take(1) per batch), `saleItems.by_product`, `products.by_active`. The 5000-sale and 500-batch caps already accepted elsewhere in the codebase bound the worst case.

**Why not add e.g. `saleItems.by_product_creationTime`:** Avoids a schema change (keeps the "purely additive reads, zero migration" property that makes this safe to ship). Flagged as a performance follow-up if the catalog grows beyond ~a few thousand SKUs.

## Risks / Trade-offs

- **[Read amplification on large catalogs]** The snapshot query does, per active batch, one indexed `inventoryLedger` lookup + participates in a per-product `saleItems` scan for velocity. With ~thousands of batches this is fine; at tens of thousands it will strain function limits. → *Mitigation:* reuse the codebase's existing `take(N)` bounding discipline; add a `truncated` flag in the response (like `dashboardAnalytics` does) so the UI can warn. Document the cap. Performance-audit follow-up if real data approaches it.

- **[Velocity noise on intermittent SKUs]** Motor parts demand is lumpy; 30-day velocity can swing wildly for slow sellers. → *Mitigation:* present as an estimate, floor `targetStockDays` at a sane minimum, never auto-act on it (display-only in v1).

- **[No supplier lead time in schema]** `purchases.supplierName` exists but there's no per-supplier lead-time field, so reorder qty can't account for replenishment latency. → *Mitigation:* use a constant `targetStockDays` default (30). Capturing lead time is a clean follow-up change (would modify the `purchases`/products schema — out of scope here precisely because we want zero migration).

- **[Dead stock vs. intentionally slow-moving inventory]** Some parts (rare alternators, specialty items) legitimately sit for months. Flagging them as "dead" could mislead. → *Mitigation:* aging is a *band* (30/90/180) not a verdict; the page presents, the owner decides. No automatic action.

- **[Cost basis drift]** `batches.unitCost` is historical; for old batches it may be wildly stale relative to current replacement cost. → *Mitigation:* show valuation as "at recorded cost" with a label; replacement-cost estimation is a non-goal.

## Migration Plan

**Deploy:** additive only — new files (`convex/inventoryHealth.ts`, `convex/lib/inventoryHealth.ts`, route, components, tests) ship via normal `convex dev`/`next build`. No backfill, no schema diff, no environment variable.

**Rollback:** delete the route + query + components. No data artifacts depend on them; removal is clean and lossless.

## Open Questions

1. **Reorder → purchase draft:** Should clicking "reorder" on a suggestion create a draft `purchases` row pre-filled with supplier + line items? *(Tempting for v1, but it crosses into write-path territory. Propose as a separate follow-up change `add-reorder-to-purchase-draft` to keep this change zero-write-path.)*
2. **Cashier visibility:** Confirm health alerts are admin-only (consistent with `reports.*`). Should the dashboard stat card be hidden for cashiers, or shown read-only? *(Default: hidden for non-admins, matching existing dashboard gating.)*
3. **Aging bands default:** 30 / 90 / 180 days is proposed. Does the owner have a business-specific notion of "too long" for motor parts (e.g. seasonal lines)? *(Start with the industry-standard bands; make them constants so they're trivially tunable.)*
