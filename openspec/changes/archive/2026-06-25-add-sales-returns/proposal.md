## Why

The POS can record a sale and (optionally) archive its receipt, but it has no mechanism to *undo* a sale line — return an item from a customer, refund the cash, and put stock back on the shelf. Today the only workaround is a manual `inventory.adjustment`, which (a) skips the audit link back to the original receipt, (b) loses the FIFO batch trace that `saleItemBatches` was specifically built to preserve, and (c) leaves the receipt's totals (revenue, profit) silently wrong in every existing report (`salesSummary`, `dashboardAnalytics`, `cashFlow`, `topProducts`, `cashierPerformance`). For a retail shop this is a daily operation — defective goods, wrong-item pickups, change-of-mind — and the absence of a first-class return means each one corrupts the books. The data needed to do this correctly already exists (`saleItemBatches` for batch-level traceability, `inventoryLedger` for movement history, `auditLog` for undo semantics); only the write path and UI are missing.

## What Changes

- **New first-class "Sales Return" write path** — a `returns.createReturn` mutation that, for a given original `saleId`, accepts a partial set of `{ saleItemId, quantity }` lines (full or partial returns), validates quantities against what was actually sold, refunds cash, restores stock per-batch via the existing `saleItemBatches` trace, and writes a single immutable `returns` record that every report can join against.
- **New `returns` table** — one row per return event, linked to the original `sales` receipt and the cashier/admin who processed it. Return-line details live in a new `returnItems` table that mirrors `saleItems` (snapshots of price/sku/batch at return time).
- **New `inventoryLedger` type** `"return"` — `quantityDelta` is positive (stock comes back), `balanceAfter` updates `products.stockQty`, and the row carries `returnId` so the ledger remains a complete, bidirectional movement log.
- **Per-batch restoration honoring FIFO trace** — for each returned saleItem, the mutation reads `saleItemBatches` for that line, increments `batches.qtyRemaining` on the same batches in the same proportions (re-activating a batch if it hit zero), and writes a `returnItems` row per affected batch. **No** re-FIFO or cost re-derivation — the original `unitCost` snapshot is reused.
- **Net-revenue reports** — `salesSummary`, `dashboardAnalytics`, `cashFlow`, `topProducts`, and `cashierPerformance` deduct returns from gross sales so revenue/profit reflect reality. A separate `returns.byPeriod` query exposes gross returns for transparency.
- **Admin-only processing** — only admins can process returns (high-fraud-risk operation). Cashiers continue to make sales; an admin must approve any refund. Matches the existing `archive`/`restore` permission posture.
- **UI** — a "Return" action on each receipt in `/(app)/receipts` opens a modal where the admin selects qty-per-line and confirms tendered refund; the receipt view shows any linked returns inline.
- **Audit log** — `recordAudit` is called with a new `"return"` action, `undoable: false` (returns are themselves immutable once processed; correction is a new offsetting sale, not an undo).

## Capabilities

### New Capabilities
- `sales-returns`: Process customer returns against an existing sale — partial or full, per-line — with cash refund, per-batch stock restoration via the existing `saleItemBatches` trace, immutable `returns`/`returnItems` records, and audit-log entry. Net-of-returns revenue/profit in all existing reports.

### Modified Capabilities
<!-- No existing specs are archived yet (openspec/specs/ is empty), so there are no
     prior requirement sets to delta. Report behavior changes are captured as new
     requirements inside `sales-returns` since this is the first spec covering them. -->

## Impact

- **Schema (breaking change to validators, non-breaking to data)**: add `ledgerTypeValidator` member `"return"`; add `auditLog.action` literal `"return"`; add new `returns` and `returnItems` tables with indexes (`returns.by_sale`, `returns.by_creation_time`, `returns.by_cashier`, `returnItems.by_return`, `returnItems.by_saleItem`); add optional `returnId` to `inventoryLedger`. Existing rows are unaffected — all new fields are additive/optional. **BREAKING** only in the type-system sense (the `ledgerTypeValidator` union narrows), mitigated by widening the validator (see design).
- **Convex writes**: new file `convex/returns.ts` (`createReturn` mutation, `listForSale` / `byPeriod` queries, `getReturn` query). New `convex/lib/returns.ts` for pure restorable-quantity math.
- **Convex reads (modified)**: `reports.salesSummary`, `dashboardAnalytics`, `cashFlow`, `topProducts`, `cashierPerformance` subtract returns; new `returns.byPeriod` query.
- **Frontend**: new `components/returns/ReturnDialog.tsx`, `components/returns/ReturnReceipt.tsx`; "Return" button on `/(app)/receipts` rows and detail view; inline return history on the receipt detail panel.
- **Permissions**: `createReturn` is admin-only via `requireRole(ctx, "admin")`. Read queries (`returns.listForSale`, `returns.byPeriod`) are admin-only to match `reports.*`.
- **Tests**: new `convex/returns.test.ts` (convex-test: full return, partial return, over-return rejected, archived-sale rejected, stock/restoration math, audit entry); new `convex/lib/returns.test.ts` (pure helpers: restorable qty given prior returns, batch-restoration proportions). Existing report tests augmented to assert net-of-returns behavior.
- **Migration**: zero data backfill — returns simply don't exist historically, so net = gross for all pre-change sales. The `ledgerTypeValidator` and `auditLog.action` widening is forward-and-backward compatible (existing documents predate the literal; the validator accepts the new value going forward).
