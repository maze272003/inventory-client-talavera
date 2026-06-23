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
