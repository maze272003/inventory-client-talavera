import { v } from "convex/values";
import { cronJobs } from "convex/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Nightly job: archive every active product whose stock has hit zero, so it can
 * no longer be sold from the register. Runs at 00:00 Philippine time daily.
 *
 * PHT is UTC+8 with no daylight saving, so 00:00 PHT == 16:00 UTC the previous
 * day, expressed as the cron expression "0 16 * * *".
 *
 * Batched + self-rescheduling to stay within a single mutation's transaction
 * limits on large catalogs (see convex/_generated/ai/guidelines.md →
 * "Mutation guidelines"). Each invocation reads one page ordered by
 * `_creationTime`, archives the out-of-stock subset, and schedules the next
 * page until exhausted.
 */

const BATCH_SIZE = 200;
const SYSTEM_ACTOR_NAME = "System · Nightly archive";

export const archiveOutOfStockBatch = internalMutation({
  args: { cursorCreationTime: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cursor = args.cursorCreationTime ?? 0;

    // Attribute archives to an admin account so the audit row's required
    // userId is satisfied; the displayed actor is overridden via actorName.
    const profiles = await ctx.db.query("userProfiles").take(100);
    const adminProfile = profiles.find((p) => p.role === "admin");
    const systemActorId = adminProfile?.userId;

    // Page through ALL products by creation time and filter in memory. There is
    // no index on (isActive, stockQty), so this bounded full scan is the
    // correct way to reach every out-of-stock active product regardless of
    // where it sits in the table. Runs once daily — cost is acceptable.
    const page = await ctx.db
      .query("products")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", cursor))
      .take(BATCH_SIZE);

    const toArchive = page.filter((p) => p.isActive && p.stockQty <= 0);

    for (const p of toArchive) {
      await ctx.db.patch("products", p._id, { isActive: false });
      if (systemActorId) {
        await ctx.db.insert("auditLog", {
          entityTable: "products",
          entityId: p._id,
          action: "archive",
          summary: `Auto-archived out-of-stock product "${p.name}" (qty ${p.stockQty})`,
          before: { isActive: true, stockQty: p.stockQty },
          after: { isActive: false },
          undoable: true,
          reverted: false,
          userId: systemActorId,
          // actorEmail="" makes audit.enrichEntry skip its userId lookup, so
          // the audit list shows "System · Nightly archive" without resolving
          // (and without leaking) the admin's real profile.
          actorName: SYSTEM_ACTOR_NAME,
          actorEmail: "",
        });
      }
    }

    const isDone = page.length < BATCH_SIZE;
    if (!isDone) {
      const nextCursor = page[page.length - 1]._creationTime;
      await ctx.scheduler.runAfter(0, internal.crons.archiveOutOfStockBatch, {
        cursorCreationTime: nextCursor,
      });
    }

    return { archived: toArchive.length, isDone, hadSystemActor: !!systemActorId };
  },
});

const crons = cronJobs();

// 00:00 PHT daily == 16:00 UTC. PHT has no daylight saving, so this is stable.
crons.cron(
  "archive out-of-stock products nightly (00:00 PHT)",
  "0 16 * * *",
  internal.crons.archiveOutOfStockBatch,
  {},
);

export default crons;
