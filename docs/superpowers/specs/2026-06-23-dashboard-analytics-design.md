# Admin Dashboard Analytics — Design Spec

**Date:** 2026-06-23
**Status:** Approved (design) — pending implementation plan
**Branch:** `feat/dashboard-analytics` (base `main`)

## Goal

Turn the admin `/dashboard` from a "today so far" snapshot into a **growth-oriented analytics view**: a single date-range control drives period KPIs (with growth vs the previous period) and six charts that make business results and money health visible at a glance. The cashier dashboard is unchanged. All new data is admin-only.

## Success Criteria

- An admin can pick a date range (Today / 7d / 30d / 90d / This year / Custom) and the whole dashboard reflects it.
- The 4 KPI cards show the period's total **and** a percentage change vs the immediately preceding equal-length period.
- Six charts render: revenue & profit trend, top products, sales by category, average transaction value + count, gross-margin % trend, and cash in vs out.
- Charts are responsive (stack on mobile), themed to the existing design tokens, with loading skeletons and an empty state when the range has no sales.
- New backend queries are admin-gated, index-based (no `.filter()`), and never silently truncate — when a range exceeds the read cap, the UI shows a clear "showing up to N" note.
- `npm test` passes (backend), and `npm run typecheck && lint && build` are clean.

## Non-Goals (YAGNI)

- No materialized rollup table — aggregation is on-the-fly (single-store scale).
- No chart CSV/PDF export (the Reports page already exports tabular data).
- No per-chart date ranges, no forecasting/predictions, no multi-period comparison overlays beyond the single previous-period KPI delta.
- None of the declined "comprehensive" charts: inventory value at cost, busiest-times heatmap, cashier contribution. (`reports.cashierPerformance` and its Reports-page table already exist for cashier data.)
- No schema changes and no new indexes — all queries use existing tables and indexes.
- No changes to the cashier dashboard experience.

## Architecture Overview

```
/dashboard (admin)
  ├─ Range state (preset + custom from/to)  ──► lib/dateRange.ts (shared)
  │                                              presetRange, startOfDay/endOfDay,
  │                                              deriveGranularity, tzOffsetMinutes
  │
  ├─ KPI row (4 cards w/ delta)   ◄── api.reports.dashboardAnalytics(range, granularity, tz)
  ├─ Charts 1–5                   ◄── api.reports.dashboardAnalytics(...)   (same query)
  └─ Chart 6 (cash in vs out)     ◄── api.reports.cashFlow(range, granularity, tz)
```

- **Two backend queries**, both admin-gated, both on-the-fly over existing tables.
  `dashboardAnalytics` does the heavy item-level pass (it powers the KPIs and charts 1–5); `cashFlow` is a separate, lighter concern because it crosses into the `purchases` table and needs no line-item reads.
- **Range + bucketing live client-side** in a shared helper; the client passes resolved `startMs/endMs`, a `granularity`, and its `tzOffsetMinutes` so the server can bucket by the store's local calendar.
- **Chart components** are small, single-purpose wrappers around Recharts in `components/dashboard/charts/`, each independently understandable and testable by its typed props.

## Data Sources (existing schema — no changes)

- `sales`: `total`, `cashierId`, `_creationTime`, `isArchived?` — indexed `by_creation_time` (system), `by_cashier`, `by_archived`.
- `saleItems`: `saleId`, `productId`, `unitSellPrice`, `unitCostPrice`, `quantity`, `lineTotal`, `nameSnapshot` — indexed `by_sale`.
- `products`: `category` (joined for the category-breakdown chart).
- `purchases`: `total`, `purchaseDate`, `isArchived?` — for cash-out (restock spend).

Profit = Σ `(unitSellPrice − unitCostPrice) × quantity`. Revenue = Σ `sales.total`. Units = Σ `saleItems.quantity`. Margin % = profit / revenue (0 when revenue is 0). AOV = revenue / transaction count.

**Archived rows:** sales and purchases marked `isArchived === true` are excluded from all aggregates (consistent with existing soft-archive behavior).

## Shared Range Helper — `lib/dateRange.ts` (new)

Extracts and extends the range logic currently inlined in `app/(app)/reports/page.tsx` so the dashboard does not duplicate it. (Reports page is left as-is for now; it may adopt this helper in a future cleanup — out of scope here.)

- `type Preset = "today" | "7d" | "30d" | "90d" | "year" | "custom"`
- `presetRange(preset): { startMs, endMs }` using local `startOfDay`/`endOfDay`; `"year"` = Jan 1 of the current year → now.
- `startOfDay(d)`, `endOfDay(d)`, `parseLocalDate(s)`, `toDateString(d)` — same semantics as the Reports page helpers.
- `type Granularity = "hour" | "day" | "week" | "month"`
- `deriveGranularity(startMs, endMs): Granularity` — `hour` if span ≤ ~1 day; `day` if ≤ ~60 days; `week` if ≤ ~365 days; else `month`.
- `tzOffsetMinutes(): number` = `new Date().getTimezoneOffset()` (client-only; passed to the server so bucket boundaries follow the store's local calendar).
- `previousPeriod(startMs, endMs): { startMs, endMs }` = the immediately preceding equal-length window (`prevStart = startMs − (endMs − startMs)`, `prevEnd = startMs`).

## Backend — `convex/reports.ts` additions

Both queries: `await requireRole(ctx, "admin")` first; query `sales`/`purchases` via `by_creation_time` range (no `.filter()`); cap `sales` at `MAX_SALES = 5000` and per-sale items at `take(200)`; return a `truncated: boolean` flag set when the cap is hit.

### `dashboardAnalytics`

```
args: {
  startMs: number,
  endMs: number,
  granularity: "hour" | "day" | "week" | "month",
  tzOffsetMinutes: number,
}
returns: {
  kpis: {
    revenue:      { value: number, previous: number, deltaPct: number | null },
    profit:       { value: number, previous: number, deltaPct: number | null },
    units:        { value: number, previous: number, deltaPct: number | null },
    transactions: { value: number, previous: number, deltaPct: number | null },
  },
  timeseries: Array<{
    bucketStart: number,   // ms, local bucket boundary
    label: string,         // e.g. "Jun 3", "Wk of Jun 3", "Jun 2026", "2pm"
    revenue: number,
    profit: number,
    units: number,
    transactions: number,
    marginPct: number,     // profit/revenue, 0 if revenue 0
  }>,
  topProducts: Array<{ productId: string, name: string, units: number, revenue: number }>,
  categoryBreakdown: Array<{ category: string, revenue: number, units: number }>,
  granularity: "hour" | "day" | "week" | "month",
  truncated: boolean,
}
```

Algorithm:
1. Load current-range sales (excluding archived); single pass, reading each sale's items once. Accumulate per-bucket totals (revenue/profit/units/transactions), per-product totals (top products), and per-category totals (join `products.category`, cached per `productId`).
2. Compute current KPI totals from the accumulators.
3. Load the **previous equal period** (`previousPeriod(...)`) and compute only its four KPI totals (a second, parallel pass). `deltaPct = previous === 0 ? null : (value − previous) / previous`.
4. `topProducts` sorted by `units` desc (the chart toggles units/revenue client-side from the same rows — the server returns both metrics, so no second query). Limit to top 10.
5. Bucket boundaries derived from `granularity` + `tzOffsetMinutes` (local calendar). A bucket with no sales is still emitted with zeros so trend lines are continuous.

### `cashFlow`

```
args: { startMs, endMs, granularity, tzOffsetMinutes }
returns: {
  buckets: Array<{ bucketStart: number, label: string, revenue: number, spend: number }>,
  totals: { revenue: number, spend: number },
  truncated: boolean,
}
```

- `revenue` per bucket from `sales.total` (cheap; no item reads), bucketed by `_creationTime`.
- `spend` per bucket from `purchases.total`, bucketed by `purchaseDate`, excluding archived purchases.
- Both bucketed on the same local boundaries as `dashboardAnalytics`.

### Caps & honesty

`MAX_SALES`/`take(200)` match the existing `salesSummary`/`topProducts` pattern. `truncated` is surfaced in the UI as a small note ("Showing the most recent 5,000 sales in this range") rather than silently under-counting. (A materialized rollup table is the documented future path if volume outgrows this.)

## Frontend

### `app/(app)/dashboard/page.tsx` (modified)

- Admin branch gains: range state (`preset` + custom `from`/`to`), the preset `Select` + `DateRangePicker` (reused from `@/components/DateRangePicker`) in the page header area, the KPI row (now period totals + delta), and the chart grid. Cashier branch and the loading skeleton are unchanged in spirit (skeletons extended to cover charts).
- `granularity` and `tzOffsetMinutes` computed from the range via `lib/dateRange.ts` and passed to both queries.
- KPI card extended with an optional delta indicator: `↑ N%` (success color), `↓ N%` (danger color), or a muted "—" / "new" when `deltaPct` is `null`.

### Chart components — `components/dashboard/charts/` (new)

Each is a `"use client"` wrapper around Recharts with a `ResponsiveContainer`, design-token colors, and `formatPeso` in tooltips/axes. One responsibility each:

| Component | Recharts | Props (shape) |
|---|---|---|
| `RevenueProfitTrendChart` | Area/Line (2 series) | `timeseries[]` |
| `TopProductsChart` | Horizontal Bar + Units/Revenue toggle | `topProducts[]` |
| `CategoryDonutChart` | Pie (donut) | `categoryBreakdown[]` |
| `AvgTransactionChart` | Composed: Bar (count) + Line (AOV) dual-axis | `timeseries[]` |
| `MarginTrendChart` | Line | `timeseries[]` |
| `CashFlowChart` | Grouped Bar (revenue vs spend) | `cashFlow.buckets[]` |

- **Theming:** a single `chartTheme` module maps a small palette (primary/positive/negative/category series) to the app's Tailwind tokens, plus shared tooltip/grid/axis styling so all six charts look native to the design system.
- **States:** per-chart loading **Skeleton**; **EmptyState** ("No sales in this range") when the relevant data is empty; charts live in a responsive grid (1 col mobile → 2 col `lg`), donut legend wraps on small screens.

### Recharts dependency

Add `recharts` (latest, React 19-compatible) to `dependencies`. Imported only by the dashboard chart components, so Next.js route-level code-splitting keeps it off other routes.

## Testing & Gates

- **Backend (`convex/reports.test.ts`):** `convex-test` for `dashboardAnalytics` and `cashFlow` — bucketing (hour/day/week/month, empty buckets emitted), margin math, top-product and category aggregation, previous-period delta computation (including `previous === 0 → null`), archived exclusion, and the `truncated` flag. Follow the existing `reports.test.ts` `seedUser` pattern.
- **Frontend:** no component-test harness exists → gate is `npm run typecheck && npm run lint && npm run build` plus a manual checklist (range switching updates everything; deltas show correct direction/color; each chart renders, empty-states, and is responsive; cashier dashboard unchanged; non-admin cannot reach the data). Recharts is not unit-tested.

## Risks & Mitigations

- **Read cap / long ranges:** "This year" on a high-volume store can exceed `MAX_SALES`. Mitigation: `truncated` flag + visible note; rollup table documented as the future path.
- **N+1 item reads:** `dashboardAnalytics` reads each sale's items. Acceptable at single-store scale; the cheap-metric chart (`cashFlow`) deliberately avoids item reads.
- **Timezone bucketing:** server buckets using `tzOffsetMinutes` from the client so day/week/month boundaries match the store's local calendar (Convex runs UTC). Fixed offset is acceptable for a single-location store (no DST-straddling correctness guarantee within a bucket — noted, not solved).
- **Recharts + React 19 / Next 16:** pin a Recharts version verified against React 19; charts are client components (`"use client"`).

## Spec Coverage Map

| Requirement | Where |
|---|---|
| Unified range control + presets incl. 90d/Year | `lib/dateRange.ts`, dashboard page |
| KPI period totals + growth delta | `dashboardAnalytics.kpis`, KPI card |
| Revenue & profit trend | `dashboardAnalytics.timeseries`, `RevenueProfitTrendChart` |
| Top products (units/revenue toggle) | `dashboardAnalytics.topProducts`, `TopProductsChart` |
| Sales by category | `dashboardAnalytics.categoryBreakdown`, `CategoryDonutChart` |
| Avg transaction value + count | `dashboardAnalytics.timeseries`, `AvgTransactionChart` |
| Gross margin % trend | `dashboardAnalytics.timeseries.marginPct`, `MarginTrendChart` |
| Cash in vs out | `cashFlow`, `CashFlowChart` |
| Admin-only, index-based, no silent truncation | both queries (`requireRole`, `by_creation_time`, `truncated`) |
| Recharts, themed, responsive, states | `components/dashboard/charts/*`, `chartTheme` |
