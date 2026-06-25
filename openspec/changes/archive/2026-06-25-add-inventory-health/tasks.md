## 1. Pure derived-metric helpers (foundation, testable in isolation)

- [x] 1.1 Create `convex/lib/inventoryHealth.ts` exporting `computeVelocity(saleItems, windowDays, nowMs)` returning `units/day` per product id (pure, no `ctx`)
- [x] 1.2 Add `classifyAging(batchesWithLastMovement, nowMs, bands)` returning per-band grouping (bands: 30/90/180)
- [x] 1.3 Add `computeValuation(activeBatches, productsById)` returning `{ totalCostValue, totalRetailValue, byCategory }` — cost and retail kept separate
- [x] 1.4 Add `suggestReorder({ stockQty, threshold, velocityPerDay, targetDays })` returning the suggested qty with the threshold-based floor for unknown velocity
- [x] 1.5 Add `daysToStockout(stockQty, velocityPerDay)` helper returning `null` for zero velocity (infinite) and the projection otherwise
- [x] 1.6 Create `convex/lib/inventoryHealth.test.ts` (vitest) covering each helper: velocity smoothing, aging band boundaries (last-movement-based), valuation cost≠retail, reorder floor at zero velocity, days-to-stockout edge cases
- [x] 1.7 Run `npm test` — all helper tests green

## 2. Snapshot query (thin shell over the helpers)

- [x] 2.1 Create `convex/inventoryHealth.ts` with `export const snapshot = query({ args: { nowMs, velocityWindowDays }, ... })` guarded by `requireRole(ctx, "admin")`
- [x] 2.2 Fetch active products (`by_active` index, `take` bounded)
- [x] 2.3 For velocity: scan `saleItems` in the lookback window per product (or bounded bulk scan), delegate to `computeVelocity`
- [x] 2.4 For dead stock: for each active batch, fetch the most recent `inventoryLedger` row via `by_product` + `order("desc")` + `take(1)`; delegate to `classifyAging`
- [x] 2.5 For valuation: gather active batches, delegate to `computeValuation`
- [x] 2.6 For reorder suggestions: filter to `stockoutRisk` products; look up last `purchases` row + last unit cost per product; delegate to `suggestReorder`
- [x] 2.7 Add a `truncated: boolean` flag in the response, set true if any `take(N)` cap is hit
- [x] 2.8 Return the exact shape `{ stockoutRisk, deadStock, valuation, reorderSuggestions, truncated }`
- [x] 2.9 Create `convex/inventoryHealth.test.ts` using `convex-test` to assert: admin succeeds, cashier throws, unauth throws, shape has all four keys, no writes occur on read
- [x] 2.10 Run `npm run typecheck:convex` and `npm test` — green

## 3. Frontend — Inventory Health page

- [x] 3.1 Create route `app/(app)/inventory/health/page.tsx`, admin-gated (mirror existing reports page gating)
- [x] 3.2 Subscribe to `api.inventoryHealth.snapshot` with sensible defaults (`nowMs` = Date.now(), `velocityWindowDays` = 30)
- [x] 3.3 Create `components/inventory/HealthSummary.tsx` — top strip showing valuation (cost + retail), stockout count, dead-stock cash value
- [x] 3.4 Create `components/inventory/StockoutRiskTable.tsx` — sorted by urgency; columns: product, stockQty, threshold, velocity, days-to-stockout
- [x] 3.5 Create `components/inventory/DeadStockTable.tsx` — grouped by aging band; columns: batch, product, qtyRemaining, unitCost, cashValue, last movement
- [x] 3.6 Create `components/inventory/ValuationCard.tsx` — total cost value, total retail value, category breakdown (reuse `ResponsiveTable`/`StatCard` from `components/ui`)
- [x] 3.7 Create `components/inventory/ReorderSuggestions.tsx` — columns: product, suggested qty, last supplier, last unit cost (display-only, no action button)
- [x] 3.8 Render a truncation warning banner when `snapshot.truncated === true`
- [x] 3.9 Render an `EmptyState` when all four datasets are empty (healthy catalog)
- [x] 3.10 Use only existing primitives from `@/components/ui` — no new primitive files, no in-page duplicated components (per `docs/REDESIGN.md` rule)
- [x] 3.11 Run `npm run typecheck` and `npm run lint` — green

## 4. Dashboard hook-in

- [x] 4.1 Read `app/(app)/dashboard/page.tsx` to understand the existing StatCard layout and admin gating
- [x] 4.2 Add a "Health Alerts" stat card (admin-only) showing stockout-risk count and dead-stock cash value, linking to `/inventory/health`
- [x] 4.3 If the dashboard doesn't already subscribe to a lightweight health summary, add a minimal admin-only query (or reuse a trimmed projection) — keep the dashboard subscription cost bounded
- [x] 4.4 Verify the card is hidden for cashiers and visible for admins

## 5. End-to-end verification

- [x] 5.1 `npm run typecheck` — green
- [x] 5.2 `npm run typecheck:convex` — green
- [x] 5.3 `npm run lint` — green
- [x] 5.4 `npm test` — green (helpers + convex-test query tests)
- [ ] 5.5 Manual: log in as admin, navigate to `/inventory/health`, confirm all four sections render against a seeded catalog (use `npm run seed:fresh` if needed)
- [ ] 5.6 Manual: confirm a cashier navigating to `/inventory/health` sees no data (query-denied state)
- [ ] 5.7 Manual: trigger a sale or stock-in elsewhere and confirm the health page updates in real time via the single subscription
- [x] 5.8 Diff check: `git diff convex/schema.ts` is empty (zero schema changes, as promised in the proposal)
