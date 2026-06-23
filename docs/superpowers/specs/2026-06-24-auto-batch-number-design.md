# Auto-generated batch numbers for products

**Status:** Approved · **Date:** 2026-06-24

## Problem

New products are created with a manually-entered `sku` but no system-assigned
traceability code. The store wants every newly-entered product to receive an
**auto-generated batch number** — a permanent, read-only, unique code that
records when the product was first entered into the catalog.

## Decision

One auto-generated batch number **per product, assigned once at creation**.

Rejected alternatives and why:

- **One batch per stock-in / lot.** Would force the POS to allocate every sale
  across specific batches (FIFO/expiry). `saleItems` / `createSale` don't track
  batches today, so this is a large change to a working sales flow, and the
  store's goods don't need expiry tracing. A separate, larger feature — YAGNI here.
- **One batch per purchase invoice.** Wouldn't cover products created directly
  with an opening balance (no purchase document) — exactly the path in scope.

## Batch number format

```
BN-YYYYMMDD-NNNN
   │        │
   │        └── global counter, zero-padded to 4 digits (never resets)
   └─────────── entry date, Asia/Manila (UTC+8, no DST)
```

Examples: `BN-20260624-0007`, `BN-20260624-0008`, `BN-20260625-0009`.

- The **suffix is a single global counter** (the same `counters`-table pattern
  as `receiptNumber`). It never resets, so the suffix alone guarantees
  uniqueness; the date is purely for human readability.
- If the suffix ever exceeds 9999 it simply grows to 5+ digits — no overflow,
  no collision.
- **Timezone:** the date is computed in Asia/Manila via a fixed `+8h` offset on
  the creation timestamp (the Philippines observes no DST), so a product entered
  just after midnight local time shows the correct local date rather than the
  previous UTC day. No timezone library needed.

## Data model (`convex/schema.ts`)

Add to the `products` table:

- `batchNumber: v.optional(v.string())` — optional so existing rows (and the
  Convex schema validator) tolerate documents created before this feature; new
  products always populate it.
- `.index("by_batchNumber", ["batchNumber"])` — used to find un-numbered rows
  during backfill (`eq("batchNumber", undefined)`, the same trick the archive
  backfill uses on `by_archived`) and for future lookups by batch number.

Add a `counters` row `{ name: "batchNumber", value: <last sequence> }`,
incremented atomically inside the creating mutation. No schema change needed —
`counters` already exists.

## Generation logic (`convex/lib/batch.ts`, new file)

```ts
import { MutationCtx } from "../_generated/server";

// Philippines is UTC+8 year-round (no daylight saving).
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Format a batch number from a global sequence and a timestamp (ms since epoch). */
export function formatBatchNumber(seq: number, atMs: number): string {
  const d = new Date(atMs + MANILA_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `BN-${y}${m}${day}-${String(seq).padStart(4, "0")}`;
}

/** Atomically increment the global batch counter; returns the next sequence number. */
export async function nextBatchSequence(ctx: MutationCtx): Promise<number> {
  const counter = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", "batchNumber"))
    .unique();
  if (!counter) {
    await ctx.db.insert("counters", { name: "batchNumber", value: 1 });
    return 1;
  }
  const next = counter.value + 1;
  await ctx.db.patch("counters", counter._id, { value: next });
  return next;
}

/** Next formatted batch number for a product entered at `atMs`. */
export async function nextBatchNumber(ctx: MutationCtx, atMs: number): Promise<string> {
  return formatBatchNumber(await nextBatchSequence(ctx), atMs);
}
```

Mirrors `nextReceiptNumber` in `convex/sales.ts:8`. Uses this codebase's
table-name-first `ctx.db` API (`ctx.db.patch("counters", id, {...})`).

## Server mutations (`convex/products.ts`)

**`create`** — server-generates the batch number (the client never sends it, so
it can't be spoofed):

```ts
const { userId } = await requireRole(ctx, "admin");
const batchNumber = await nextBatchNumber(ctx, Date.now());
const id = await ctx.db.insert("products", { ...args, isActive: true, batchNumber });
// ...existing opening-balance ledger insert unchanged...
const after = await ctx.db.get("products", id);
await recordAudit(ctx, {
  entityTable: "products",
  entityId: id,
  action: "create",
  summary: `Created product ${args.name} (batch ${batchNumber})`,
  after,
  undoable: true,
  userId,
});
```

`Date.now()` is valid inside a Convex mutation. The `create` args validator is
**not** changed — `batchNumber` is never a client argument.

**`update`** — unchanged. It does not include `batchNumber` in its `patch`, so
the field is preserved. Batch numbers are **immutable**. Add a one-line comment
noting this so a future edit doesn't accidentally make it editable.

## Backfill (`convex/databaseMaintenance.ts`)

Follows the existing `backfillArchiveFlags` pattern (a shared `doBackfill…`
helper plus an admin-gated public mutation and a CLI-runnable internal mutation).

```ts
import { formatBatchNumber, nextBatchSequence } from "./lib/batch";

async function doBackfillBatchNumbers(ctx: MutationCtx) {
  let patched = 0;
  // eq("batchNumber", undefined) matches un-numbered rows; the index then yields
  // them in ascending _creationTime order, so the oldest product gets the lowest
  // sequence. Patching a row removes it from this set, so the loop terminates.
  let batch = await ctx.db
    .query("products")
    .withIndex("by_batchNumber", (q) => q.eq("batchNumber", undefined))
    .take(200);
  while (batch.length > 0) {
    for (const p of batch) {
      const seq = await nextBatchSequence(ctx);
      // Use each product's own creation time for the date portion, so backfilled
      // codes reflect when the product was actually added.
      await ctx.db.patch("products", p._id, {
        batchNumber: formatBatchNumber(seq, p._creationTime),
      });
      patched++;
    }
    batch = await ctx.db
      .query("products")
      .withIndex("by_batchNumber", (q) => q.eq("batchNumber", undefined))
      .take(200);
  }
  return { patched };
}

export const backfillBatchNumbers = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return doBackfillBatchNumbers(ctx);
  },
});

export const backfillBatchNumbersInternal = internalMutation({
  args: {},
  handler: async (ctx) => doBackfillBatchNumbers(ctx),
});
```

- **Idempotent**: already-numbered rows don't match `eq(undefined)`, so re-running
  is a no-op.
- **Transaction limits**: like `clearAll`, this batches reads at 200. For the
  store's catalog size a single transaction is fine; if the table ever grows
  beyond a single-transaction budget, convert to a self-scheduling mutation
  (`ctx.scheduler.runAfter(0, …)`) per the Convex guidelines.
- Run once after deploy with
  `npx convex run databaseMaintenance:backfillBatchNumbersInternal`.

## UI

**`components/ProductForm.tsx`**
- Add `batchNumber?: string` to the local `ProductDoc` type.
- Add a **read-only** "Batch number" field near SKU:
  - *Edit* mode: a disabled `Input` showing `product.batchNumber` (mono).
  - *Add* mode: a disabled `Input` with placeholder "Auto-generated on save".
- Do **not** add `batchNumber` to the create/update mutation arguments.

**`app/(app)/products/page.tsx`**
- Add `batchNumber?: string` to the local `ProductDoc` type.
- Add a **"Batch"** column (mono text, like SKU), placed after the SKU column.
- Add `batchNumber` to the CSV export: a `{ key: "batchNumber", header: "Batch" }`
  column in `inventoryColumns` and the corresponding field in
  `buildInventoryRows`.
- Add a "Batch" column to the print-only `<table>` (header + cell).

**Not touched:** the POS `ProductGrid` and `Receipt` — cashiers don't need batch
numbers (YAGNI).

The product queries already return the full document via `withImageUrl`, so the
new field flows to the client automatically; only the TS types need updating.

## Tests (`convex/products.test.ts`)

Match the existing convex-test style (see `products.test.ts` / `sales.test.ts`).

1. **Format on create** — creating a product yields a `batchNumber` matching
   `/^BN-\d{8}-\d{4,}$/`.
2. **Sequence increments** — two creates produce suffixes `N` and `N+1`
   (also proves the counter auto-creates on first use).
3. **Immutable on update** — `products.update` leaves `batchNumber` unchanged.
4. **Backfill** — insert a product directly without `batchNumber`
   (`t.run((ctx) => ctx.db.insert("products", {…}))`), run
   `internal.databaseMaintenance.backfillBatchNumbersInternal`, assert the row
   now has a well-formed `batchNumber` and that an already-numbered row is
   untouched; assert `{ patched }` count.

## Verification & rollout (lead-run, after implementation)

1. `npx convex codegen` — regenerate `_generated` (new schema field + new
   internal function reference).
2. `npm run typecheck`, `npm run typecheck:convex`, `npm run lint`, `npm run test`
   — all green; fix any failures.
3. **Reset + remigrate** (explicitly requested): `npm run seed:fresh`
   (`convex run --push databaseMaintenance:resetWithMasterSeed` with the
   `RESET_DATABASE` confirmation). This pushes the new schema, clears all tables,
   and reseeds the auth users. Destructive and intentional.
4. Post-reset the `products` table is empty, so the batch backfill is a no-op;
   new products created through the UI receive batch numbers automatically.

## Out of scope

- Per-lot / per-stock-in batch tracking with FIFO sale allocation or expiry.
- Showing batch numbers in the POS or on customer receipts.
- Editable / regenerate-able batch numbers.
