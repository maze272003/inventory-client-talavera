## Context

MotorShop POS records every sale as a `sales` header plus `saleItems` lines, and crucially writes a `saleItemBatches` row for each batch depleted by each line — this is what makes FIFO cost-of-goods and recall support work. The schema also has an immutable `inventoryLedger` (types `sale`/`stock_in`/`adjustment`) and an `auditLog` whose `action` union is the canonical record of "what happened". Stock today can only *leave* through a sale or `adjustment`; there is no path that puts stock back tied to a specific sale.

The gap this change fills: a customer hands back an item from receipt #N. The owner needs to (a) record *which* line(s) and *how many*, (b) hand back cash equal to the line's `unitSellPrice × qty`, (c) put the units back into the *same batches* they came out of (so cost-of-goods and dead-stock math stay correct), and (d) have every existing report (`salesSummary`, `dashboardAnalytics`, `cashFlow`, `topProducts`, `cashierPerformance`) reflect net-of-returns revenue without ad-hoc per-report patches.

Two properties of the existing code constrain the design:

1. **`saleItemBatches` is the ground truth for "where did this sale's units come from"** — it's a complete, immutable per-batch breakdown per saleItem. A return therefore has everything it needs to restore stock to the *correct* batches with no re-FIFO or guesswork.
2. **`products.stockQty` is a cache of the ledger** (per the codebase's own stated invariant). So a return must (i) write a ledger row with positive `quantityDelta`, (ii) update the cache, and (iii) update `batches.qtyRemaining` — exactly the symmetric inverse of `allocateFifo` in `convex/lib/fifo.ts:45`.

## Goals / Non-Goals

**Goals:**
- Process a return (full or partial, single or multi-line) against any non-archived sale in one atomic mutation.
- Restore stock to the exact same batches recorded in `saleItemBatches` (proportional restoration when a line was split across batches), preserving cost-of-goods accuracy.
- Make every existing sales report reflect net-of-returns revenue/profit with no per-report special-case logic beyond a single "subtract returns" pass.
- Keep returns immutable once processed (correction = a new offsetting event, never an in-place edit), matching how `sales` itself works.
- Make restorable-quantity math (sale qty − already-returned qty) a pure, unit-tested helper, mirroring the `lib/fifo.ts` + `lib/inventoryHealth.ts` pattern.

**Non-Goals:**
- **No** store-credit, e-wallet refund, or non-cash refund tender — only cash refunds in v1 (matches the cash-only POS today; multi-tender is a separate change).
- **No** exchange workflow (return item A, ring up item B in one transaction) — the return is its own event; a new sale is rung up separately. (Follow-up.)
- **No** return-against-archived-sale — archived sales are "soft-deleted from reports"; allowing returns against them would re-introduce them into net revenue. Reject.
- **No** RMA/supplier-return workflow (returning defective stock back to the supplier). That's a separate `purchases` extension.
- **No** automatic hold/restock inspection (e.g. "quarantine returned item for 24h before reshelving"). v1 returns stock immediately.
- **No** change to FIFO deduction logic — sales still deplete oldest-first; only the symmetric *restock* path is new.
- **No** undo of a return — returns are immutable. Mistakes are corrected by a new sale at the same price.

## Decisions

### Decision 1 — Returns are first-class documents, not `adjustment` ledger entries
A return creates a `returns` row (one per event) plus N `returnItems` rows (one per affected original saleItem × batch). The ledger gets one positive row per batch touched with `type: "return"` and a new `returnId` foreign key.

**Why over folding into `adjustment`:** The existing `adjustment` type is for *unattributed* corrections ("found 3 broken units during stock-take") with no upstream link. A return is fundamentally *attributed* — it has an original sale, an original saleItem, an original batch, an original price. Stuffing it into `adjustment` would (a) lose the saleId/returnId lineage that reports need to net revenue, (b) break the audit-log's "what kind of thing was this" semantics, and (c) require every report to do a fragile `reason`-string parse to distinguish returns from real adjustments. The codebase already establishes the pattern of one-table-per-business-event (`sales`/`saleItems`, `purchases`/`purchaseItems`-equivalent, `batches`); a return deserves the same.

**Alternative considered:** A single `returns` table with line-items as a JSON blob. Rejected because every existing parent/child pair in this schema (`sales`/`saleItems`, `purchases`/batches via `batches.purchaseId`) uses a real child table for queryability — and we will need to query `returnItems` by `saleItemId` for the "restorable qty" math.

### Decision 2 — Restore stock to the exact batches recorded in `saleItemBatches`, proportionally
For a returned saleItem of quantity Q against an original line of quantity Q0: read all `saleItemBatches` rows for that saleItemId (they sum to Q0), and for each row add `qtyReturned = round((row.quantity / Q0) × Q)` back to `batches.qtyRemaining` for that batch. Re-activate the batch (`isActive = true`) if it had hit zero. Write one `returnItems` row per affected batch carrying the original `unitCost` snapshot.

**Why proportional instead of "FIFO-reverse from oldest remaining":** The original sale depleted specific batches in a specific proportion (the `saleItemBatches` snapshot). Putting stock back into *those same batches* is the only choice that keeps each batch's `qtyRemaining × unitCost` valuation truthful — putting it back into currently-oldest batches would commingle cost bases and silently shift inventory valuation. This also makes the return's effect on dead-stock aging correct: a unit returned to batch B continues to age as batch B, not as a fresh batch.

**Rounding:** With proportional math, `qtyReturned` is rounded to integers per batch with the residual assigned to the largest-contributing batch so the row quantities sum to exactly Q (pure helper `distributeProportionally`). This is the standard proportional-allocation-with-integer-fixup; covered by unit tests.

**Alternative considered:** Force the admin to pick batches manually in the UI. Rejected for v1 — it adds UI complexity for a choice the system can already make correctly, and the 99% case is "return 1 unit, restore 1 unit to the single batch it came from" where there's nothing to pick.

### Decision 3 — `ledgerTypeValidator` widened to include `"return"`; `auditLog.action` widened to `"return"`
The `ledgerTypeValidator` (currently `sale | stock_in | adjustment`) and `auditLog.action` literal union each gain a `"return"` member. The ledger row also gets an optional `returnId: v.id("returns")` field (mirroring the existing optional `saleId`/`purchaseId`/`batchId`).

**Why widening is safe:** Convex validators apply only on *write*. Existing documents predate the new literal, but no existing write path emits the new value, so historical data is unaffected. Existing *readers* (queries that pattern-match on `type`) need to consider whether to handle `"return"` — and the only such reader is `reports.*`, which we are explicitly updating to net out returns. The widening is therefore forward-and-backward compatible at the data layer.

**Why `returnId` on the ledger rather than a `returnIds` array on `sales`:** Mirrors the existing FK pattern (`saleId`, `purchaseId`, `batchId` are all optional single-FKs on ledger rows). Putting an array on `sales` would mutate the immutable `sales` document on every return and force every reader to follow the link; the ledger-FK is local to the movement it describes.

### Decision 4 — Returns are admin-only
`createReturn` calls `requireRole(ctx, "admin")`, matching `sales.archive`, `sales.restore`, `inventory.adjust`, `inventory.stockIn`. Read queries `returns.listForSale` and `returns.byPeriod` are admin-only to match `reports.*`.

**Why not allow cashiers (the original seller) to process returns:** A cash refund is the highest-fraud-risk operation in retail. An admin-gated return is consistent with how the codebase already treats every other money-or-stock mutation. A cashier who needs to handle a return calls an admin.

**Alternative considered:** Cashier can return, admin must approve (two-step). Rejected for v1 — adds workflow state (`pending`/`approved`/`rejected`) for a process that, in a one-or-two-person shop, is identical to "ask the owner". v1 keeps it single-step admin-only; can be promoted to a workflow later if a larger shop needs it.

### Decision 5 — Net revenue in reports via one shared "returns in period" pre-pass
Each affected report (`salesSummary`, `dashboardAnalytics`, `cashFlow`, `topProducts`, `cashierPerformance`) gains a shared helper `loadReturnsInPeriod(ctx, startMs, endMs) → Map<saleId, { refundTotal, lines: Map<saleItemId, {qty, refund}> }>` that scans `returns` by creation time in the window (bounded `take(N)` like every other report scan). Reports then:
- Subtract `refundTotal` per return from the period's revenue (attributing the return to *the period in which the return happened*, not the original sale's period — see Decision 6).
- For `topProducts`/`cashierPerformance`: subtract per-line refund and qty from the product's/cashier's totals.

**Why a shared helper rather than per-report inline:** Identical DRY rationale to `lib/buckets.ts` — the same scan is needed by 5 reports; one helper, one set of bounding caps, one truncation convention. Keeps each report's diff to "fetch + subtract".

**Why not a materialized "net sales" view:** Convex has no materialized views; rolling-net would require writing back to `sales` on every return (violates immutability — Decision 1). Compute-on-read is consistent with how every existing report already recomputes from raw rows.

### Decision 6 — Returns attributed to the return's period, not the original sale's period
A return processed on Thursday for a sale made on Monday reduces *Thursday's* revenue, not Monday's. This matches cash reality (cash leaves the till on Thursday) and matches how `cashFlow` must work. It does mean historical-period reports can shift retroactively if a return is processed late — that's correct behavior, and the existing dashboard's "previous period" deltas already recompute on every render.

**Alternative considered:** Two views — "as-reported-at-time" (frozen) and "as-known-now" (restated). Rejected for v1 — adds dual-readpath complexity for a question nobody has asked yet. Single restated view is standard for small-business retail.

### Decision 7 — `returns` and `returnItems` schema shape
```ts
returns: defineTable({
  saleId: v.id("sales"),
  receiptNumber: v.number(),          // snapshot for display without join
  totalRefund: v.number(),            // sum of line refunds
  itemCount: v.number(),              // sum of returned qtys
  cashRefunded: v.number(),           // actual cash handed back (= totalRefund in v1)
  processedBy: v.id("users"),         // admin who ran it
  reason: v.optional(v.string()),     // free-text "defective / wrong item / etc"
})
  .index("by_sale", ["saleId"])
  .index("by_creation_time", ["_creationTime"])  // for period queries
  .index("by_processedBy", ["processedBy"])

returnItems: defineTable({
  returnId: v.id("returns"),
  saleId: v.id("sales"),
  saleItemId: v.id("saleItems"),
  productId: v.id("products"),
  batchId: v.id("batches"),           // the specific batch restocked
  batchNumberSnapshot: v.string(),
  nameSnapshot: v.string(),           // from saleItems.nameSnapshot
  skuSnapshot: v.string(),
  unitSellPrice: v.number(),          // refund-per-unit = original sell price
  unitCostPrice: v.number(),          // for profit-rollback math
  quantity: v.number(),
  lineRefund: v.number(),             // unitSellPrice × quantity
})
  .index("by_return", ["returnId"])
  .index("by_saleItem", ["saleItemId"])   // restorable-qty math
  .index("by_sale", ["saleId"])
  .index("by_product", ["productId"])
```

**Snapshots everywhere (like `saleItems` itself):** A return freezes name/sku/cost/price at processing time so historical returns stay readable even if the product is later renamed, repriced, or deleted. This is the same defensive pattern `saleItems` already uses.

## Risks / Trade-offs

- **[Proportional-restoration rounding on multi-batch lines]** When an original line split across 3 batches gets a partial return of 1 unit, proportional distribution must assign that 1 unit to exactly one batch. → *Mitigation:* pure helper `distributeProportionally(saleItemBatchesRows, returnQty)` uses largest-remainder rounding; unit-tested for the 1-unit, 2-unit, and "ties" cases. The choice is deterministic and auditable from the `returnItems` rows.

- **[Return of a batch that's been fully drained and deactivated]** A returned batch may have `isActive: false` from being sold out. Restoring must flip it back to `isActive: true`. → *Mitigation:* the restoration patch unconditionally sets `isActive: qtyRemaining > 0` after incrementing, exactly as `stockIn` does today (`inventory.ts:32-36`). No special case.

- **[Return of a batch whose product was since deactivated]** A product could be `isActive: false` by the time a return is processed. → *Mitigation:* allow the return anyway — putting stock back doesn't require the product to be sellable again, and the data is correct either way. The UI may warn but will not block.

- **[Report performance with many returns]** `loadReturnsInPeriod` is a new bounded scan per report. → *Mitigation:* same `take(5000)` discipline as every other report scan; returns volume is bounded above by sales volume. A `truncated` flag is added to reports that gain the helper, consistent with `dashboardAnalytics`'s existing pattern.

- **[Returns against a return (recursive)]** A `returnItems` row cannot itself be "returned" — returns attach to *sales*, not to other returns. → *Mitigation:* `createReturn` validates `saleId` resolves to a `sales` row (not a `returns` row) by table type at the schema level — the `v.id("sales")` validator already enforces this.

- **[Archived-sale return would un-archive implicitly]** Processing a return against an archived sale would make its totals count again (because reports join `returns` → `sales` regardless of archive). → *Mitigation:* `createReturn` rejects archived sales outright with a clear error. Admin must `restore` first if they genuinely want to return against it (and accepting the restore means accepting it back in reports). This is the same posture as the existing archive semantic.

- **[Refund amount ≠ line price if sell price changed since sale]** The refund uses the *sale-time* `saleItems.unitSellPrice` snapshot, not the current product price. This is correct (customer gets back what they paid) but an admin expecting "current price" may be surprised. → *Mitigation:* UI shows the to-be-refunded amount per line explicitly before confirmation, sourced from the snapshot.

- **[No `cashTendered` analog on the refund side]** The admin hands back exact change = `totalRefund`. There's no "customer gave us back more than we owed" scenario for a refund, so no `cashTendered`/`changeGiven` symmetry is needed. Recorded as `cashRefunded` for ledger clarity. (If store-credit is added later, this field becomes "the cash portion" and a separate `creditIssued` appears — out of scope here.)

## Migration Plan

**Deploy:**
1. Schema change ships first via `convex dev` — additive only: new tables, new optional `inventoryLedger.returnId`, widened literal unions. No backfill needed; no historical row references a return.
2. Backend code (`convex/returns.ts`, `convex/lib/returns.ts`, report updates) ships next.
3. Frontend (`ReturnDialog`, receipt-page button) ships last; until then the backend is callable but unused (admin-only, harmless).

**Rollback:**
- Frontend rollback: delete `ReturnDialog` and the receipt-page button. No data impact.
- Backend rollback: delete `convex/returns.ts`, restore prior `reports.ts`. Existing `returns`/`returnItems` rows become orphaned but inert (no readers). Reports revert to gross (pre-change behavior) until cleaned up.
- Schema rollback: drop `returns` and `returnItems` tables, drop `inventoryLedger.returnId`, narrow the unions. **Data loss** for any returns processed — acceptable only if rolled back before any production use. Documented as a one-way door after go-live.

## Open Questions

1. **Reason taxonomy:** Free-text `reason` in v1, or a fixed enum (`defective`/`wrong_item`/`change_of_mind`/`other`) for reporting? *(Propose free-text in v1 for speed; revisit if "returns by reason" becomes a requested report.)*
2. **Receipt reprint:** Should the receipt printer produce a "refund receipt" document (negative-total look) for the customer, or is the on-screen confirmation + audit log enough? *(Default: on-screen only for v1; thermal-printer integration is a separate concern this codebase doesn't have yet.)*
3. **Restock quarantine:** Some shops want returned units held aside, not resalable immediately. *(Default v1: immediate restock. If requested, add a `quarantinedUntil` field on `returnItems` and exclude such units from `stockQty` — a follow-up change.)*
4. **Multi-return-per-sale limit:** Allow unlimited partial returns against the same sale until qty exhausted, or cap at one return event per sale for simplicity? *(Propose unlimited — the restorable-qty math naturally handles it, and a hard cap creates an arbitrary workflow constraint.)*
