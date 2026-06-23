# Admin Dashboard Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the admin `/dashboard` into a growth-oriented analytics view — a single date range drives period KPIs (with growth deltas vs the previous period) and six themed, responsive Recharts charts.

**Architecture:** Two new admin-only Convex queries (`dashboardAnalytics`, `cashFlow`) aggregate on-the-fly over existing tables using the `by_creation_time` index. A shared client helper (`lib/dateRange.ts`) resolves presets + bucket granularity; a shared server helper (`convex/lib/buckets.ts`) maps timestamps to local-calendar buckets. Six small Recharts wrappers in `components/dashboard/charts/` render the data, themed via a `useChartColors()` hook that reads the design-system CSS variables.

**Tech Stack:** Convex 1.36 (queries), `recharts` (new dep), Next.js 16 (App Router, client components), Tailwind v4, convex-test + vitest (edge-runtime).

## Global Constraints

- **Production-ready, zero errors:** every backend task ends green on `npm test` + `npm run typecheck:convex`; every frontend task ends green on `npm run typecheck && npm run lint && npm run build`. The feature is not done until all five pass at HEAD.
- **Fully responsive across all breakpoints** (≈320px phone → 768px tablet → 1024px laptop → 1440px+ desktop): no horizontal page overflow at any width; charts use Recharts `ResponsiveContainer` inside fixed-height boxes; grids reflow (KPIs 2-up on phone → 4-up on desktop; charts 1-col → 2-col at `xl`); legends/donut wrap and stay readable.
- **Convex query rule:** never call `.filter()` on a DB query — select with an index, narrow in memory over the returned array (existing project rule).
- **Admin-only:** both new queries call `requireRole(ctx, "admin")` first. The dashboard already gates the admin view with `isAdmin`; cashier dashboard is unchanged.
- **Table-name-first Convex API:** `ctx.db.get("table", id)`, `ctx.db.query("table")`, `.withIndex(...)` (existing project convention).
- **No schema changes, no new indexes.** Use existing tables/indexes only.
- **Archived rows excluded:** sales/purchases with `isArchived === true` are excluded from all aggregates.
- **No silent truncation:** queries cap at `MAX_SALES = 5000` (and `take(200)` per sale's items) and return `truncated: boolean`; the UI shows a note when true.
- **Money formatting:** use `formatPeso` from `lib/format.ts` in chart axes/tooltips.
- **Branch:** all work lands on `feat/dashboard-analytics` (already checked out; base `main`).

---

## File Structure

**Client helper:**
- `lib/dateRange.ts` — presets, range math, granularity derivation, tz offset *(Task 1)*

**Backend (Convex):**
- `convex/lib/buckets.ts` — pure local-calendar bucketing helpers *(Task 2)*
- `convex/reports.ts` — add `dashboardAnalytics` *(Task 3)* and `cashFlow` *(Task 4)*
- `convex/reports.test.ts` — tests for both *(Tasks 3, 4)*

**Frontend (Next.js):**
- `components/dashboard/charts/chartTheme.ts` — `useChartColors()` hook + categorical palette *(Task 5)*
- `components/dashboard/charts/ChartFrame.tsx` — Card wrapper with title/toolbar/loading/empty *(Task 5)*
- `components/dashboard/charts/RevenueProfitTrendChart.tsx`, `AvgTransactionChart.tsx`, `MarginTrendChart.tsx` *(Task 6)*
- `components/dashboard/charts/TopProductsChart.tsx`, `CategoryDonutChart.tsx`, `CashFlowChart.tsx` *(Task 7)*
- `app/(app)/dashboard/page.tsx` — range control, KPI deltas, chart grid, responsive layout *(Task 8)*

Tasks 1–2 are independent foundations. Tasks 3–4 both edit `convex/reports.ts`/`reports.test.ts` (run sequentially). Tasks 5–7 create separate files. Task 8 integrates everything.

---

### Task 1: Client range + granularity helper

**Files:**
- Create: `lib/dateRange.ts`
- Test: `lib/dateRange.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Preset = "today" | "7d" | "30d" | "90d" | "year" | "custom"`
  - `type Granularity = "hour" | "day" | "week" | "month"`
  - `presetRange(preset: Exclude<Preset,"custom">, now?: Date): { startMs: number; endMs: number }`
  - `deriveGranularity(startMs: number, endMs: number): Granularity`
  - `previousPeriod(startMs: number, endMs: number): { startMs: number; endMs: number }`
  - `startOfDay(d: Date): Date`, `endOfDay(d: Date): Date`, `parseLocalDate(s: string): Date | null`, `toDateString(d: Date): string`, `tzOffsetMinutes(now?: Date): number`

- [ ] **Step 1: Write the failing test**

Create `lib/dateRange.test.ts`:

```ts
import { expect, test } from "vitest";
import { deriveGranularity, previousPeriod, presetRange } from "./dateRange";

const DAY = 24 * 60 * 60 * 1000;

test("deriveGranularity picks bucket size by span", () => {
  expect(deriveGranularity(0, DAY)).toBe("hour");          // 1 day
  expect(deriveGranularity(0, 30 * DAY)).toBe("day");       // 30 days
  expect(deriveGranularity(0, 200 * DAY)).toBe("week");     // ~7 months
  expect(deriveGranularity(0, 800 * DAY)).toBe("month");    // >1 year
});

test("previousPeriod is the immediately preceding equal window", () => {
  const r = previousPeriod(1000, 1000 + 30 * DAY);
  expect(r.endMs).toBe(1000);
  expect(r.startMs).toBe(1000 - 30 * DAY);
});

test("presetRange '7d' spans seven local days ending today", () => {
  const now = new Date(2026, 5, 23, 15, 0, 0); // Jun 23 2026, local
  const { startMs, endMs } = presetRange("7d", now);
  expect(endMs).toBeGreaterThan(startMs);
  // start is at 00:00 six days before; end is 23:59:59.999 today
  expect(new Date(startMs).getDate()).toBe(17);
  expect(new Date(endMs).getDate()).toBe(23);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/dateRange.test.ts`
Expected: FAIL — `./dateRange` has no such exports.

- [ ] **Step 3: Implement the helper**

Create `lib/dateRange.ts`:

```ts
export type Preset = "today" | "7d" | "30d" | "90d" | "year" | "custom";
export type Granularity = "hour" | "day" | "week" | "month";

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
export function parseLocalDate(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function presetRange(
  preset: Exclude<Preset, "custom">,
  now: Date = new Date(),
): { startMs: number; endMs: number } {
  const endMs = endOfDay(now).getTime();
  if (preset === "today") {
    return { startMs: startOfDay(now).getTime(), endMs };
  }
  if (preset === "year") {
    return { startMs: startOfDay(new Date(now.getFullYear(), 0, 1)).getTime(), endMs };
  }
  const daysBack = preset === "7d" ? 6 : preset === "30d" ? 29 : 89; // "90d"
  const start = new Date(now);
  start.setDate(now.getDate() - daysBack);
  return { startMs: startOfDay(start).getTime(), endMs };
}

export function deriveGranularity(startMs: number, endMs: number): Granularity {
  const spanDays = (endMs - startMs) / DAY_MS;
  if (spanDays <= 1.5) return "hour";
  if (spanDays <= 60) return "day";
  if (spanDays <= 365) return "week";
  return "month";
}

export function previousPeriod(startMs: number, endMs: number): { startMs: number; endMs: number } {
  const span = endMs - startMs;
  return { startMs: startMs - span, endMs: startMs };
}

export function tzOffsetMinutes(now: Date = new Date()): number {
  return now.getTimezoneOffset();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/dateRange.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/dateRange.ts lib/dateRange.test.ts
git commit -m "feat(dashboard): shared date-range + granularity helper"
```

---

### Task 2: Server bucketing helper

**Files:**
- Create: `convex/lib/buckets.ts`
- Test: `convex/lib/buckets.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Granularity = "hour" | "day" | "week" | "month"`
  - `bucketStartForTs(utcMs: number, granularity: Granularity, tzOffsetMinutes: number): number` — the local-calendar bucket boundary (as a UTC ms) containing `utcMs`.
  - `enumerateBuckets(startMs: number, endMs: number, granularity: Granularity, tzOffsetMinutes: number): number[]` — ordered bucket boundaries covering `[startMs, endMs]`.
  - `bucketLabel(bucketStartMs: number, granularity: Granularity, tzOffsetMinutes: number): string` — display label.

> Note: `getTimezoneOffset()` returns minutes such that `localMs = utcMs - offset*60000`. We shift into "local space," read calendar fields via `getUTC*`, compute the boundary, then shift back.

- [ ] **Step 1: Write the failing test**

Create `convex/lib/buckets.test.ts`:

```ts
import { expect, test } from "vitest";
import { bucketStartForTs, enumerateBuckets, bucketLabel } from "./buckets";

// Philippines is UTC+8 → getTimezoneOffset() === -480
const PH = -480;
const DAY = 24 * 60 * 60 * 1000;

test("bucketStartForTs snaps to the local day start (UTC+8)", () => {
  // 2026-06-23T01:00:00+08:00  ==  2026-06-22T17:00:00Z
  const utc = Date.UTC(2026, 5, 22, 17, 0, 0);
  const bs = bucketStartForTs(utc, "day", PH);
  // local day start = 2026-06-23T00:00+08 = 2026-06-22T16:00Z
  expect(bs).toBe(Date.UTC(2026, 5, 22, 16, 0, 0));
});

test("enumerateBuckets covers the range inclusively by day", () => {
  const start = Date.UTC(2026, 5, 1, 0, 0, 0);
  const end = Date.UTC(2026, 5, 4, 23, 0, 0);
  const buckets = enumerateBuckets(start, end, "day", 0); // UTC
  expect(buckets.length).toBe(4); // Jun 1,2,3,4
  expect(buckets[0]).toBe(Date.UTC(2026, 5, 1));
  expect(buckets[3]).toBe(Date.UTC(2026, 5, 4));
});

test("enumerateBuckets steps months across a year boundary", () => {
  const start = Date.UTC(2025, 10, 15); // Nov 2025
  const end = Date.UTC(2026, 1, 10);    // Feb 2026
  const buckets = enumerateBuckets(start, end, "month", 0);
  expect(buckets.length).toBe(4); // Nov, Dec, Jan, Feb
  expect(buckets[0]).toBe(Date.UTC(2025, 10, 1));
  expect(buckets[3]).toBe(Date.UTC(2026, 1, 1));
});

test("bucketLabel formats by granularity (UTC)", () => {
  expect(bucketLabel(Date.UTC(2026, 5, 3), "day", 0)).toBe("Jun 3");
  expect(bucketLabel(Date.UTC(2026, 5, 1), "month", 0)).toBe("Jun 2026");
  expect(bucketLabel(Date.UTC(2026, 5, 3, 14), "hour", 0)).toBe("2 PM");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lib/buckets.test.ts`
Expected: FAIL — module/exports do not exist.

- [ ] **Step 3: Implement the helper**

Create `convex/lib/buckets.ts`:

```ts
export type Granularity = "hour" | "day" | "week" | "month";

const MIN_MS = 60 * 1000;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Returns a Date whose getUTC* fields read the local wall-clock for utcMs.
function toLocal(utcMs: number, tzOffsetMinutes: number): Date {
  return new Date(utcMs - tzOffsetMinutes * MIN_MS);
}
function fromLocal(localMs: number, tzOffsetMinutes: number): number {
  return localMs + tzOffsetMinutes * MIN_MS;
}

export function bucketStartForTs(
  utcMs: number,
  granularity: Granularity,
  tzOffsetMinutes: number,
): number {
  const d = toLocal(utcMs, tzOffsetMinutes);
  let localStart: number;
  if (granularity === "hour") {
    localStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
  } else if (granularity === "day") {
    localStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  } else if (granularity === "week") {
    const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
    const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    localStart = dayStart - dow * 24 * 60 * MIN_MS;
  } else {
    localStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
  return fromLocal(localStart, tzOffsetMinutes);
}

function nextBucket(bucketStartMs: number, granularity: Granularity, tzOffsetMinutes: number): number {
  const d = toLocal(bucketStartMs, tzOffsetMinutes);
  let localNext: number;
  if (granularity === "hour") {
    localNext = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() + 1);
  } else if (granularity === "day") {
    localNext = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  } else if (granularity === "week") {
    localNext = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 7);
  } else {
    localNext = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  return fromLocal(localNext, tzOffsetMinutes);
}

export function enumerateBuckets(
  startMs: number,
  endMs: number,
  granularity: Granularity,
  tzOffsetMinutes: number,
): number[] {
  const out: number[] = [];
  let cur = bucketStartForTs(startMs, granularity, tzOffsetMinutes);
  let guard = 0;
  while (cur <= endMs && guard < 100000) {
    out.push(cur);
    cur = nextBucket(cur, granularity, tzOffsetMinutes);
    guard++;
  }
  return out;
}

export function bucketLabel(
  bucketStartMs: number,
  granularity: Granularity,
  tzOffsetMinutes: number,
): string {
  const d = toLocal(bucketStartMs, tzOffsetMinutes);
  const mon = MONTHS[d.getUTCMonth()];
  if (granularity === "hour") {
    const h = d.getUTCHours();
    const ampm = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12} ${ampm}`;
  }
  if (granularity === "month") return `${mon} ${d.getUTCFullYear()}`;
  if (granularity === "week") return `Wk ${mon} ${d.getUTCDate()}`;
  return `${mon} ${d.getUTCDate()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lib/buckets.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck the backend**

Run: `npm run typecheck:convex`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add convex/lib/buckets.ts convex/lib/buckets.test.ts
git commit -m "feat(dashboard): local-calendar bucketing helpers"
```

---

### Task 3: `dashboardAnalytics` query

**Files:**
- Modify: `convex/reports.ts`
- Test: `convex/reports.test.ts`

**Interfaces:**
- Consumes: `requireRole` (existing), `bucketStartForTs`/`enumerateBuckets`/`bucketLabel` (Task 2).
- Produces: `api.reports.dashboardAnalytics({ startMs, endMs, granularity, tzOffsetMinutes })` →
  ```
  {
    kpis: {
      revenue:      { value, previous, deltaPct: number | null },
      profit:       { value, previous, deltaPct: number | null },
      units:        { value, previous, deltaPct: number | null },
      transactions: { value, previous, deltaPct: number | null },
    },
    timeseries: Array<{ bucketStart, label, revenue, profit, units, transactions, marginPct }>,
    topProducts: Array<{ productId, name, units, revenue }>,   // top 10 by units
    categoryBreakdown: Array<{ category, revenue, units }>,    // by revenue desc
    granularity, truncated,
  }
  ```

- [ ] **Step 1: Write the failing test**

Append to `convex/reports.test.ts`:

```ts
import { bucketStartForTs } from "./lib/buckets"; // used to reason about buckets in assertions

test("dashboardAnalytics returns KPIs, growth deltas, timeseries, top products, categories", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await admin.mutation(api.products.create, {
    name: "Soda", sku: "s1", category: "Drinks",
    costPrice: 2, sellPrice: 5, stockQty: 100, reorderThreshold: 5,
  });
  // Two sales "now"
  await admin.mutation(api.sales.createSale, { items: [{ productId: pid, quantity: 4 }], cashTendered: 100 });
  await admin.mutation(api.sales.createSale, { items: [{ productId: pid, quantity: 2 }], cashTendered: 100 });

  const res = await admin.query(api.reports.dashboardAnalytics, {
    startMs: 0, endMs: 1e15, granularity: "day", tzOffsetMinutes: 0,
  });

  expect(res.kpis.revenue.value).toBe(30);  // (4+2)*5
  expect(res.kpis.profit.value).toBe(18);   // (4+2)*(5-2)
  expect(res.kpis.units.value).toBe(6);
  expect(res.kpis.transactions.value).toBe(2);
  expect(res.kpis.revenue.previous).toBe(0);
  expect(res.kpis.revenue.deltaPct).toBeNull(); // previous 0 → null

  // timeseries non-empty, totals reconcile
  const tsRevenue = res.timeseries.reduce((s, b) => s + b.revenue, 0);
  expect(tsRevenue).toBe(30);

  expect(res.topProducts[0].name).toBe("Soda");
  expect(res.topProducts[0].units).toBe(6);
  expect(res.categoryBreakdown[0].category).toBe("Drinks");
  expect(res.categoryBreakdown[0].revenue).toBe(30);
  expect(res.truncated).toBe(false);
});

test("dashboardAnalytics excludes archived sales and is admin-only", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const cashier = await seed(t, "cashier");
  const pid = await admin.mutation(api.products.create, {
    name: "Chip", sku: "c1", category: "Snacks",
    costPrice: 1, sellPrice: 3, stockQty: 50, reorderThreshold: 5,
  });
  const sale = await admin.mutation(api.sales.createSale, { items: [{ productId: pid, quantity: 1 }], cashTendered: 10 });
  // archive the sale directly
  await t.run(async (ctx) => {
    const s = await ctx.db.query("sales").withIndex("by_receiptNumber").first();
    if (s) await ctx.db.patch("sales", s._id, { isArchived: true });
    void sale;
  });

  const res = await admin.query(api.reports.dashboardAnalytics, {
    startMs: 0, endMs: 1e15, granularity: "day", tzOffsetMinutes: 0,
  });
  expect(res.kpis.revenue.value).toBe(0);
  expect(res.kpis.transactions.value).toBe(0);

  await expect(
    cashier.query(api.reports.dashboardAnalytics, { startMs: 0, endMs: 1e15, granularity: "day", tzOffsetMinutes: 0 }),
  ).rejects.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/reports.test.ts -t "dashboardAnalytics"`
Expected: FAIL — `api.reports.dashboardAnalytics` does not exist.

- [ ] **Step 3: Implement the query**

At the top of `convex/reports.ts`, add to the imports (keep existing). Also ensure `QueryCtx` is imported from `./_generated/server` (add it to the existing `query` import line if not already present):

```ts
import { query, type QueryCtx } from "./_generated/server";
import {
  bucketStartForTs,
  enumerateBuckets,
  bucketLabel,
  type Granularity,
} from "./lib/buckets";
```

Append to `convex/reports.ts`:

```ts
const MAX_SALES = 5000;

const granularityValidator = v.union(
  v.literal("hour"),
  v.literal("day"),
  v.literal("week"),
  v.literal("month"),
);

type RangeTotals = { revenue: number; profit: number; units: number; transactions: number };

// Totals only (used for the previous-period growth deltas).
async function rangeTotals(
  ctx: QueryCtx,
  startMs: number,
  endMs: number,
): Promise<RangeTotals> {
  const sales = await ctx.db
    .query("sales")
    .withIndex("by_creation_time", (q) =>
      q.gte("_creationTime", startMs).lte("_creationTime", endMs),
    )
    .take(MAX_SALES);
  let revenue = 0, profit = 0, units = 0, transactions = 0;
  for (const sale of sales) {
    if (sale.isArchived === true) continue;
    revenue += sale.total;
    transactions += 1;
    const items = await ctx.db
      .query("saleItems")
      .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
      .take(200);
    for (const it of items) {
      profit += (it.unitSellPrice - it.unitCostPrice) * it.quantity;
      units += it.quantity;
    }
  }
  return { revenue, profit, units, transactions };
}

export const dashboardAnalytics = query({
  args: {
    startMs: v.number(),
    endMs: v.number(),
    granularity: granularityValidator,
    tzOffsetMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const tz = args.tzOffsetMinutes;
    const gran = args.granularity as Granularity;

    const raw = await ctx.db
      .query("sales")
      .withIndex("by_creation_time", (q) =>
        q.gte("_creationTime", args.startMs).lte("_creationTime", args.endMs),
      )
      .take(MAX_SALES + 1);
    const truncated = raw.length > MAX_SALES;
    const sales = truncated ? raw.slice(0, MAX_SALES) : raw;

    type Bucket = {
      bucketStart: number; label: string;
      revenue: number; profit: number; units: number; transactions: number; marginPct: number;
    };
    const buckets = new Map<number, Bucket>();
    for (const bs of enumerateBuckets(args.startMs, args.endMs, gran, tz)) {
      buckets.set(bs, {
        bucketStart: bs, label: bucketLabel(bs, gran, tz),
        revenue: 0, profit: 0, units: 0, transactions: 0, marginPct: 0,
      });
    }

    const productAgg = new Map<string, { productId: string; name: string; units: number; revenue: number }>();
    const categoryAgg = new Map<string, { category: string; revenue: number; units: number }>();
    const categoryCache = new Map<string, string>();

    let revenue = 0, profit = 0, units = 0, transactions = 0;
    for (const sale of sales) {
      if (sale.isArchived === true) continue;
      transactions += 1;
      revenue += sale.total;
      const bucket = buckets.get(bucketStartForTs(sale._creationTime, gran, tz));
      if (bucket) { bucket.revenue += sale.total; bucket.transactions += 1; }

      const items = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .take(200);
      for (const it of items) {
        const lineProfit = (it.unitSellPrice - it.unitCostPrice) * it.quantity;
        profit += lineProfit;
        units += it.quantity;
        if (bucket) { bucket.profit += lineProfit; bucket.units += it.quantity; }

        const prod = productAgg.get(it.productId) ?? { productId: it.productId, name: it.nameSnapshot, units: 0, revenue: 0 };
        prod.units += it.quantity;
        prod.revenue += it.lineTotal;
        productAgg.set(it.productId, prod);

        let cat = categoryCache.get(it.productId);
        if (cat === undefined) {
          const p = await ctx.db.get("products", it.productId as Id<"products">);
          cat = p?.category ?? "Uncategorized";
          categoryCache.set(it.productId, cat);
        }
        const c = categoryAgg.get(cat) ?? { category: cat, revenue: 0, units: 0 };
        c.revenue += it.lineTotal;
        c.units += it.quantity;
        categoryAgg.set(cat, c);
      }
    }

    for (const b of buckets.values()) b.marginPct = b.revenue > 0 ? b.profit / b.revenue : 0;

    const span = args.endMs - args.startMs;
    const prev = await rangeTotals(ctx, args.startMs - span, args.startMs);
    const kpi = (value: number, previous: number) => ({
      value, previous, deltaPct: previous === 0 ? null : (value - previous) / previous,
    });

    return {
      kpis: {
        revenue: kpi(revenue, prev.revenue),
        profit: kpi(profit, prev.profit),
        units: kpi(units, prev.units),
        transactions: kpi(transactions, prev.transactions),
      },
      timeseries: [...buckets.values()].sort((a, b) => a.bucketStart - b.bucketStart),
      topProducts: [...productAgg.values()].sort((a, b) => b.units - a.units).slice(0, 10),
      categoryBreakdown: [...categoryAgg.values()].sort((a, b) => b.revenue - a.revenue),
      granularity: gran,
      truncated,
    };
  },
});
```

> `rangeTotals` is typed with `QueryCtx` (imported in Step 3) and uses the project's table-name-first API (`ctx.db.query("sales")`, `ctx.db.get(...)`), matching the existing queries in this file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/reports.test.ts -t "dashboardAnalytics"`
Expected: PASS (2 tests).

- [ ] **Step 5: Full suite + typecheck**

Run: `npm test && npm run typecheck:convex`
Expected: all pass; backend typechecks.

- [ ] **Step 6: Commit**

```bash
git add convex/reports.ts convex/reports.test.ts
git commit -m "feat(reports): dashboardAnalytics — KPIs, growth deltas, timeseries, top products, categories"
```

---

### Task 4: `cashFlow` query

**Files:**
- Modify: `convex/reports.ts`
- Test: `convex/reports.test.ts`

**Interfaces:**
- Consumes: `requireRole`, bucketing helpers (Task 2), `MAX_SALES`/`granularityValidator` (Task 3).
- Produces: `api.reports.cashFlow({ startMs, endMs, granularity, tzOffsetMinutes })` →
  ```
  {
    buckets: Array<{ bucketStart, label, revenue, spend }>,
    totals: { revenue, spend },
    truncated,
  }
  ```
  `revenue` = Σ `sales.total` per bucket (by `_creationTime`); `spend` = Σ `purchases.total` per bucket (by `purchaseDate`); archived excluded.

- [ ] **Step 1: Write the failing test**

Append to `convex/reports.test.ts`:

```ts
test("cashFlow buckets sales revenue against purchase spend", async () => {
  const t = convexTest(schema, modules);
  const admin = await seed(t, "admin");
  const pid = await admin.mutation(api.products.create, {
    name: "Box", sku: "bx1", category: "Supplies",
    costPrice: 5, sellPrice: 12, stockQty: 100, reorderThreshold: 5,
  });
  await admin.mutation(api.sales.createSale, { items: [{ productId: pid, quantity: 2 }], cashTendered: 100 });

  // A purchase whose purchaseDate is "now" (in range)
  await t.run(async (ctx) => {
    const adminId = (await ctx.db.query("userProfiles").first())!.userId;
    const fileId = await ctx.db.insert("_storage" as never, {} as never).catch(() => undefined as never);
    await ctx.db.insert("purchases", {
      supplierName: "Acme", purchaseDate: Date.now(), total: 500, itemCount: 1,
      userId: adminId, fileId: fileId ?? ("x" as never),
    });
  });

  const res = await admin.query(api.reports.cashFlow, {
    startMs: 0, endMs: 1e15, granularity: "day", tzOffsetMinutes: 0,
  });
  expect(res.totals.revenue).toBe(24); // 2*12
  expect(res.totals.spend).toBe(500);
  expect(res.truncated).toBe(false);
  const withRevenue = res.buckets.find((b) => b.revenue > 0);
  expect(withRevenue).toBeDefined();
});
```

> Note: `purchases.fileId` is a required `v.id("_storage")`. In convex-test you cannot mint a real storage id cheaply; insert a placeholder via `ctx.db.insert` is not valid for `_storage`. If the insert above is awkward, instead create the purchase through the real API: call `api.files.generateUploadUrl` is also awkward in tests — so the simplest robust approach is to store the purchase with a storage id obtained from `ctx.storage.store(new Blob([]))` inside `t.run`. Replace the file-id line with:
> ```ts
> const fileId = await ctx.storage.store(new Blob(["x"]));
> ```
> and pass `fileId` directly. Use this form; drop the `.catch` placeholder.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/reports.test.ts -t "cashFlow"`
Expected: FAIL — `api.reports.cashFlow` does not exist.

- [ ] **Step 3: Implement the query**

Append to `convex/reports.ts`:

```ts
export const cashFlow = query({
  args: {
    startMs: v.number(),
    endMs: v.number(),
    granularity: granularityValidator,
    tzOffsetMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const tz = args.tzOffsetMinutes;
    const gran = args.granularity as Granularity;

    const rawSales = await ctx.db
      .query("sales")
      .withIndex("by_creation_time", (q) =>
        q.gte("_creationTime", args.startMs).lte("_creationTime", args.endMs),
      )
      .take(MAX_SALES + 1);
    const truncated = rawSales.length > MAX_SALES;
    const sales = truncated ? rawSales.slice(0, MAX_SALES) : rawSales;

    // purchases have no purchaseDate index; scan (low volume) and narrow in memory.
    const allPurchases = await ctx.db.query("purchases").take(MAX_SALES + 1);
    const purchases = allPurchases.filter(
      (p) => p.isArchived !== true && p.purchaseDate >= args.startMs && p.purchaseDate <= args.endMs,
    );

    type Bucket = { bucketStart: number; label: string; revenue: number; spend: number };
    const buckets = new Map<number, Bucket>();
    for (const bs of enumerateBuckets(args.startMs, args.endMs, gran, tz)) {
      buckets.set(bs, { bucketStart: bs, label: bucketLabel(bs, gran, tz), revenue: 0, spend: 0 });
    }

    let totalRevenue = 0, totalSpend = 0;
    for (const sale of sales) {
      if (sale.isArchived === true) continue;
      totalRevenue += sale.total;
      const b = buckets.get(bucketStartForTs(sale._creationTime, gran, tz));
      if (b) b.revenue += sale.total;
    }
    for (const p of purchases) {
      totalSpend += p.total;
      const b = buckets.get(bucketStartForTs(p.purchaseDate, gran, tz));
      if (b) b.spend += p.total;
    }

    return {
      buckets: [...buckets.values()].sort((a, b) => a.bucketStart - b.bucketStart),
      totals: { revenue: totalRevenue, spend: totalSpend },
      truncated,
    };
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/reports.test.ts -t "cashFlow"`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck**

Run: `npm test && npm run typecheck:convex`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add convex/reports.ts convex/reports.test.ts
git commit -m "feat(reports): cashFlow — revenue vs purchase spend per bucket"
```

---

### Task 5: Recharts dependency + chart theme + ChartFrame

**Files:**
- Modify: `package.json` (add `recharts`)
- Create: `components/dashboard/charts/chartTheme.ts`
- Create: `components/dashboard/charts/ChartFrame.tsx`

**Interfaces:**
- Consumes: existing `components/ui` (`Card`, `CardHeader`, `CardBody`, `Skeleton`, `EmptyState`).
- Produces:
  - `useChartColors(): { primary, success, danger, warning, text, textMuted, border, surface }` (resolved hex strings, dark-mode aware).
  - `categoryPalette: string[]` (10 distinct hex colors for the category donut).
  - `<ChartFrame title toolbar? loading? empty? emptyLabel? children />`.

- [ ] **Step 1: Install Recharts**

Run: `npm install recharts`
Expected: `recharts` added to `dependencies` in `package.json`; install succeeds.

- [ ] **Step 2: Create the theme hook**

Create `components/dashboard/charts/chartTheme.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

export type ChartColors = {
  primary: string; success: string; danger: string; warning: string;
  text: string; textMuted: string; border: string; surface: string;
};

// Light-mode defaults (match app/globals.css :root) for SSR/first paint.
const DEFAULTS: ChartColors = {
  primary: "#4f46e5", success: "#059669", danger: "#e11d48", warning: "#d97706",
  text: "#0f172a", textMuted: "#64748b", border: "#e2e8f0", surface: "#ffffff",
};

// Distinct categorical colors for the category donut (readable on light + dark).
export const categoryPalette = [
  "#4f46e5", "#059669", "#d97706", "#e11d48", "#0891b2",
  "#7c3aed", "#0d9488", "#db2777", "#65a30d", "#ea580c",
];

function readColors(): ChartColors {
  if (typeof window === "undefined") return DEFAULTS;
  const s = getComputedStyle(document.documentElement);
  const get = (n: string, fallback: string) => s.getPropertyValue(n).trim() || fallback;
  return {
    primary: get("--color-primary", DEFAULTS.primary),
    success: get("--color-success", DEFAULTS.success),
    danger: get("--color-danger", DEFAULTS.danger),
    warning: get("--color-warning", DEFAULTS.warning),
    text: get("--color-text", DEFAULTS.text),
    textMuted: get("--color-text-muted", DEFAULTS.textMuted),
    border: get("--color-border", DEFAULTS.border),
    surface: get("--color-surface", DEFAULTS.surface),
  };
}

// Recharts sets stroke/fill as SVG attributes, which don't resolve CSS var();
// so we read the resolved design-token values and pass real hex to the charts.
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(DEFAULTS);
  useEffect(() => {
    setColors(readColors());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setColors(readColors());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return colors;
}
```

- [ ] **Step 3: Create ChartFrame**

Create `components/dashboard/charts/ChartFrame.tsx`:

```tsx
"use client";

import { ReactNode } from "react";
import { Card, CardHeader, CardBody, Skeleton, EmptyState } from "@/components/ui";

interface ChartFrameProps {
  title: string;
  toolbar?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyLabel?: string;
  className?: string;
  children: ReactNode;
}

export default function ChartFrame({
  title, toolbar, loading, empty, emptyLabel, className, children,
}: ChartFrameProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-text">{title}</h2>
        {toolbar}
      </CardHeader>
      <CardBody>
        {loading ? (
          <Skeleton height={260} />
        ) : empty ? (
          <EmptyState
            icon="bar-chart"
            title="No data"
            description={emptyLabel ?? "No sales in this range."}
          />
        ) : (
          <div className="h-[260px] w-full sm:h-[280px]">{children}</div>
        )}
      </CardBody>
    </Card>
  );
}
```

> Verify `EmptyState` accepts `icon="bar-chart"` — if `"bar-chart"` is not a valid `IconName` in `components/ui/Icon.tsx`, pick an existing chart/analytics icon name. Confirm `Card`/`CardHeader`/`CardBody`/`Skeleton`/`EmptyState` are exported from `@/components/ui` (they are used by the current dashboard).

- [ ] **Step 4: Gate**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean (recharts resolves; theme + frame compile; no unused-import lint errors).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json components/dashboard/charts/chartTheme.ts components/dashboard/charts/ChartFrame.tsx
git commit -m "feat(dashboard): add recharts + chart theme hook and ChartFrame"
```

---

### Task 6: Time-series charts (revenue/profit, AOV+count, margin)

**Files:**
- Create: `components/dashboard/charts/RevenueProfitTrendChart.tsx`
- Create: `components/dashboard/charts/AvgTransactionChart.tsx`
- Create: `components/dashboard/charts/MarginTrendChart.tsx`

**Interfaces:**
- Consumes: `useChartColors` (Task 5), `formatPeso` (`lib/format`), Recharts.
- Produces:
  - `<RevenueProfitTrendChart data={{ label, revenue, profit }[]} />`
  - `<AvgTransactionChart data={{ label, transactions, avg }[]} />`
  - `<MarginTrendChart data={{ label, marginPct }[]} />`

- [ ] **Step 1: Build RevenueProfitTrendChart**

Create `components/dashboard/charts/RevenueProfitTrendChart.tsx`:

```tsx
"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { formatPeso } from "@/lib/format";
import { useChartColors } from "./chartTheme";

export type TrendPoint = { label: string; revenue: number; profit: number };

export default function RevenueProfitTrendChart({ data }: { data: TrendPoint[] }) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke={c.textMuted} fontSize={12} tickLine={false} minTickGap={24} />
        <YAxis stroke={c.textMuted} fontSize={12} tickLine={false} width={72} tickFormatter={(v) => formatPeso(Number(v))} />
        <Tooltip
          formatter={(v: number, name) => [formatPeso(Number(v)), name]}
          contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="revenue" name="Revenue" stroke={c.primary} fill={c.primary} fillOpacity={0.15} strokeWidth={2} />
        <Area type="monotone" dataKey="profit" name="Profit" stroke={c.success} fill={c.success} fillOpacity={0.15} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Build AvgTransactionChart** (dual-axis: bar = count, line = AOV)

Create `components/dashboard/charts/AvgTransactionChart.tsx`:

```tsx
"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { formatPeso } from "@/lib/format";
import { useChartColors } from "./chartTheme";

export type AovPoint = { label: string; transactions: number; avg: number };

export default function AvgTransactionChart({ data }: { data: AovPoint[] }) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke={c.textMuted} fontSize={12} tickLine={false} minTickGap={24} />
        <YAxis yAxisId="left" stroke={c.textMuted} fontSize={12} tickLine={false} width={40} allowDecimals={false} />
        <YAxis yAxisId="right" orientation="right" stroke={c.textMuted} fontSize={12} tickLine={false} width={72} tickFormatter={(v) => formatPeso(Number(v))} />
        <Tooltip
          formatter={(v: number, name) => (name === "Avg value" ? [formatPeso(Number(v)), name] : [String(v), name])}
          contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="left" dataKey="transactions" name="Transactions" fill={c.primary} fillOpacity={0.6} radius={[3, 3, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="avg" name="Avg value" stroke={c.warning} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Build MarginTrendChart**

Create `components/dashboard/charts/MarginTrendChart.tsx`:

```tsx
"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useChartColors } from "./chartTheme";

export type MarginPoint = { label: string; marginPct: number };

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

export default function MarginTrendChart({ data }: { data: MarginPoint[] }) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke={c.textMuted} fontSize={12} tickLine={false} minTickGap={24} />
        <YAxis stroke={c.textMuted} fontSize={12} tickLine={false} width={48} domain={[0, "auto"]} tickFormatter={(v) => pct(Number(v))} />
        <Tooltip
          formatter={(v: number) => [pct(Number(v)), "Gross margin"]}
          contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 12 }}
        />
        <Line type="monotone" dataKey="marginPct" name="Gross margin" stroke={c.success} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Gate**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/charts/RevenueProfitTrendChart.tsx components/dashboard/charts/AvgTransactionChart.tsx components/dashboard/charts/MarginTrendChart.tsx
git commit -m "feat(dashboard): revenue/profit, avg-transaction, and margin trend charts"
```

---

### Task 7: Top products, category donut, cash-flow charts

**Files:**
- Create: `components/dashboard/charts/TopProductsChart.tsx`
- Create: `components/dashboard/charts/CategoryDonutChart.tsx`
- Create: `components/dashboard/charts/CashFlowChart.tsx`

**Interfaces:**
- Consumes: `useChartColors`, `categoryPalette` (Task 5), `formatPeso`, Recharts.
- Produces:
  - `<TopProductsChart data={{ name, units, revenue }[]} metric="units" | "revenue" onMetricChange={(m)=>void} />`
  - `<CategoryDonutChart data={{ category, revenue }[]} />`
  - `<CashFlowChart data={{ label, revenue, spend }[]} />`

- [ ] **Step 1: Build TopProductsChart** (horizontal bars; the units/revenue toggle is a controlled prop so the parent owns the state)

Create `components/dashboard/charts/TopProductsChart.tsx`:

```tsx
"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { formatPeso } from "@/lib/format";
import { useChartColors } from "./chartTheme";

export type TopProduct = { name: string; units: number; revenue: number };
export type TopMetric = "units" | "revenue";

export default function TopProductsChart({
  data, metric, onMetricChange,
}: {
  data: TopProduct[];
  metric: TopMetric;
  onMetricChange: (m: TopMetric) => void;
}) {
  const c = useChartColors();
  const fmt = (v: number) => (metric === "revenue" ? formatPeso(v) : String(v));
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex justify-end gap-1">
        {(["units", "revenue"] as TopMetric[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onMetricChange(m)}
            className={`rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors ${
              metric === m ? "bg-primary text-primary-fg" : "text-text-muted hover:bg-surface-2"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={c.border} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" stroke={c.textMuted} fontSize={12} tickLine={false} tickFormatter={fmt} />
            <YAxis type="category" dataKey="name" stroke={c.textMuted} fontSize={12} tickLine={false} width={110} />
            <Tooltip
              formatter={(v: number) => [fmt(Number(v)), metric === "revenue" ? "Revenue" : "Units"]}
              contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 12 }}
            />
            <Bar dataKey={metric} fill={c.primary} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build CategoryDonutChart**

Create `components/dashboard/charts/CategoryDonutChart.tsx`:

```tsx
"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatPeso } from "@/lib/format";
import { useChartColors, categoryPalette } from "./chartTheme";

export type CategorySlice = { category: string; revenue: number };

export default function CategoryDonutChart({ data }: { data: CategorySlice[] }) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="revenue" nameKey="category" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
          {data.map((entry, i) => (
            <Cell key={entry.category} fill={categoryPalette[i % categoryPalette.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number, name) => [formatPeso(Number(v)), name]}
          contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Build CashFlowChart** (grouped bars: revenue vs spend)

Create `components/dashboard/charts/CashFlowChart.tsx`:

```tsx
"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { formatPeso } from "@/lib/format";
import { useChartColors } from "./chartTheme";

export type CashFlowPoint = { label: string; revenue: number; spend: number };

export default function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke={c.textMuted} fontSize={12} tickLine={false} minTickGap={24} />
        <YAxis stroke={c.textMuted} fontSize={12} tickLine={false} width={72} tickFormatter={(v) => formatPeso(Number(v))} />
        <Tooltip
          formatter={(v: number, name) => [formatPeso(Number(v)), name]}
          contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" name="Sales in" fill={c.success} radius={[3, 3, 0, 0]} />
        <Bar dataKey="spend" name="Restock out" fill={c.danger} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Gate**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean.

> If lint flags `bg-primary`/`text-primary-fg` utility classes as unknown, confirm the Tailwind tokens exist (they are defined in `app/globals.css @theme`); use the same class names already used by existing buttons in `components/ui/Button.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/charts/TopProductsChart.tsx components/dashboard/charts/CategoryDonutChart.tsx components/dashboard/charts/CashFlowChart.tsx
git commit -m "feat(dashboard): top-products, category donut, and cash-flow charts"
```

---

### Task 8: Dashboard page integration (range, KPI deltas, responsive grid)

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `lib/dateRange.ts` (Task 1), `api.reports.dashboardAnalytics`/`cashFlow` (Tasks 3–4), all six chart components (Tasks 6–7), existing `DateRangePicker` and `components/ui`.
- Produces: the integrated admin analytics dashboard. Cashier view unchanged.

- [ ] **Step 1: Add the range control + KPI delta card**

In `app/(app)/dashboard/page.tsx`, replace the imports block and the `todayRange`/`KpiCard` helpers with the following, and keep the rest of the file (cashier branch, low-stock, recent receipts) intact:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatPeso, formatDate } from "@/lib/format";
import {
  type Preset, presetRange, parseLocalDate, startOfDay, endOfDay,
  deriveGranularity, tzOffsetMinutes,
} from "@/lib/dateRange";
import Link from "next/link";
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader,
  Select, Skeleton, SkeletonText,
} from "@/components/ui";
import DateRangePicker from "@/components/DateRangePicker";
import ChartFrame from "@/components/dashboard/charts/ChartFrame";
import RevenueProfitTrendChart from "@/components/dashboard/charts/RevenueProfitTrendChart";
import AvgTransactionChart from "@/components/dashboard/charts/AvgTransactionChart";
import MarginTrendChart from "@/components/dashboard/charts/MarginTrendChart";
import TopProductsChart, { type TopMetric } from "@/components/dashboard/charts/TopProductsChart";
import CategoryDonutChart from "@/components/dashboard/charts/CategoryDonutChart";
import CashFlowChart from "@/components/dashboard/charts/CashFlowChart";

function deltaTone(deltaPct: number | null): { text: string; cls: string } {
  if (deltaPct === null) return { text: "—", cls: "text-text-muted" };
  const pct = `${deltaPct >= 0 ? "↑" : "↓"} ${Math.abs(deltaPct * 100).toFixed(0)}%`;
  return { text: pct, cls: deltaPct >= 0 ? "text-success" : "text-danger" };
}

function KpiCard({
  label, value, deltaPct, loading,
}: { label: string; value: string; deltaPct?: number | null; loading?: boolean }) {
  const tone = deltaPct === undefined ? null : deltaTone(deltaPct);
  return (
    <Card>
      <CardBody className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">{label}</span>
        {loading ? (
          <Skeleton height={32} width="70%" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-text tabular-nums">{value}</span>
            {tone && <span className={`text-xs font-semibold ${tone.cls}`}>{tone.text}</span>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 2: Wire range state + queries inside `DashboardPage`**

Inside the `DashboardPage` component, after `const isAdmin = ...`, replace the old `range`/`summary` with:

```tsx
  const [preset, setPreset] = useState<Preset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [topMetric, setTopMetric] = useState<TopMetric>("units");

  const range = useMemo(() => {
    if (preset === "custom") {
      const from = parseLocalDate(customFrom);
      const to = parseLocalDate(customTo);
      if (from && to) return { startMs: startOfDay(from).getTime(), endMs: endOfDay(to).getTime() };
      return presetRange("30d");
    }
    return presetRange(preset);
  }, [preset, customFrom, customTo]);

  const granularity = useMemo(() => deriveGranularity(range.startMs, range.endMs), [range]);
  const queryArgs = isAdmin
    ? { startMs: range.startMs, endMs: range.endMs, granularity, tzOffsetMinutes: tzOffsetMinutes() }
    : "skip";

  const analytics = useQuery(api.reports.dashboardAnalytics, queryArgs);
  const cash = useQuery(api.reports.cashFlow, queryArgs);

  const presets: { value: Preset; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "90d", label: "Last 90 days" },
    { value: "year", label: "This year" },
    { value: "custom", label: "Custom" },
  ];

  const ts = analytics?.timeseries ?? [];
  const trendData = ts.map((b) => ({ label: b.label, revenue: b.revenue, profit: b.profit }));
  const aovData = ts.map((b) => ({ label: b.label, transactions: b.transactions, avg: b.transactions > 0 ? b.revenue / b.transactions : 0 }));
  const marginData = ts.map((b) => ({ label: b.label, marginPct: b.marginPct }));
```

- [ ] **Step 3: Render the range bar + KPI row + chart grid**

In the admin branch of the returned JSX, replace the old KPI grid with the range bar, KPI cards, the `truncated` note, and the responsive chart grid (place this above the existing Low-Stock / Recent-Receipts grid, which stays):

```tsx
      {isAdmin && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <Select
              value={preset}
              onChange={(e) => setPreset(e.target.value as Preset)}
              options={presets}
              className="w-full sm:w-56"
            />
            {preset === "custom" && (
              <div className="w-full sm:w-auto">
                <DateRangePicker from={customFrom} to={customTo} onFromChange={setCustomFrom} onToChange={setCustomTo} />
              </div>
            )}
          </div>

          {analytics?.truncated && (
            <p className="text-xs text-text-muted">
              Showing the most recent 5,000 sales in this range. Narrow the range for exact totals.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard label="Revenue" value={analytics ? formatPeso(analytics.kpis.revenue.value) : "—"} deltaPct={analytics?.kpis.revenue.deltaPct ?? null} loading={analytics === undefined} />
            <KpiCard label="Profit" value={analytics ? formatPeso(analytics.kpis.profit.value) : "—"} deltaPct={analytics?.kpis.profit.deltaPct ?? null} loading={analytics === undefined} />
            <KpiCard label="Units Sold" value={analytics ? String(analytics.kpis.units.value) : "—"} deltaPct={analytics?.kpis.units.deltaPct ?? null} loading={analytics === undefined} />
            <KpiCard label="Transactions" value={analytics ? String(analytics.kpis.transactions.value) : "—"} deltaPct={analytics?.kpis.transactions.deltaPct ?? null} loading={analytics === undefined} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ChartFrame title="Revenue & Profit" className="xl:col-span-2" loading={analytics === undefined} empty={trendData.length === 0}>
              <RevenueProfitTrendChart data={trendData} />
            </ChartFrame>
            <ChartFrame
              title="Top Products"
              loading={analytics === undefined}
              empty={(analytics?.topProducts.length ?? 0) === 0}
            >
              <TopProductsChart data={analytics?.topProducts ?? []} metric={topMetric} onMetricChange={setTopMetric} />
            </ChartFrame>
            <ChartFrame title="Sales by Category" loading={analytics === undefined} empty={(analytics?.categoryBreakdown.length ?? 0) === 0}>
              <CategoryDonutChart data={analytics?.categoryBreakdown ?? []} />
            </ChartFrame>
            <ChartFrame title="Avg Transaction & Volume" loading={analytics === undefined} empty={aovData.length === 0}>
              <AvgTransactionChart data={aovData} />
            </ChartFrame>
            <ChartFrame title="Gross Margin %" loading={analytics === undefined} empty={marginData.length === 0}>
              <MarginTrendChart data={marginData} />
            </ChartFrame>
            <ChartFrame title="Cash In vs Out" className="xl:col-span-2" loading={cash === undefined} empty={(cash?.buckets.length ?? 0) === 0}>
              <CashFlowChart data={cash?.buckets ?? []} />
            </ChartFrame>
          </div>
        </>
      )}
```

> Confirm `Select` accepts an `options` prop and a `className` (it does on the Reports page: `options={presets}`). Confirm the page subtitle text still makes sense — change the admin subtitle from "today so far" to "business overview".

- [ ] **Step 4: Gate**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 5: Manual responsiveness + behavior checklist** (record results in the commit body)

- As admin on `/dashboard`: range selector defaults to **Last 30 days**; switching presets updates KPIs and all charts; **Custom** shows the from/to pickers and applies.
- KPI deltas: show `↑`/green when up, `↓`/red when down, `—` when previous period had zero.
- All six charts render with data, show a skeleton while loading, and an empty state when the range has no sales.
- **Responsive sweep — no horizontal page scroll at any width:**
  - ~320–375px (phone): KPIs 2-up; charts stack full-width; donut + legend readable; axis labels not overlapping badly.
  - ~768px (tablet): layout comfortable; charts full-width.
  - ~1024px (laptop): KPIs 4-up.
  - ≥1280px (`xl`): charts 2-up; Revenue & Cash-flow span full width.
- Cashier login: dashboard is unchanged (welcome + low stock + recent receipts; no charts, no range bar).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/dashboard/page.tsx"
git commit -m "feat(dashboard): integrate analytics — range control, KPI growth deltas, responsive chart grid"
```

---

## Final Integration Checklist

- [ ] `npm test` — all backend tests pass.
- [ ] `npm run typecheck && npm run typecheck:convex && npm run lint && npm run build` — all clean.
- [ ] Responsive sweep across phone/tablet/laptop/desktop widths — no horizontal overflow; charts and KPIs reflow correctly.
- [ ] Admin sees charts + range control + growth deltas; cashier dashboard unchanged; a non-admin cannot call `dashboardAnalytics`/`cashFlow` (they `requireRole("admin")`).

## Spec Coverage Map

| Spec requirement | Task(s) |
| --- | --- |
| Unified range control + presets incl. 90d/Year | 1, 8 |
| Auto bucket granularity | 1 (derive), 2 (bucket) |
| KPI period totals + growth delta vs previous period | 3, 8 |
| Revenue & profit trend | 3, 6, 8 |
| Top products (units/revenue toggle) | 3, 7, 8 |
| Sales by category (donut) | 3, 7, 8 |
| Avg transaction value + count (dual-axis) | 3, 6, 8 |
| Gross margin % trend | 3, 6, 8 |
| Cash in vs out | 4, 7, 8 |
| Admin-only, index-based, no silent truncation | 3, 4 |
| Recharts themed to design tokens (dark-mode aware) | 5, 6, 7 |
| Responsive across all breakpoints | 5 (ChartFrame), 6, 7, 8 |
| No schema changes; archived excluded | 3, 4 |
```
