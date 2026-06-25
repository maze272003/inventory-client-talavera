import { v } from "convex/values";
import { internalMutation, mutation, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { TableNames } from "./_generated/dataModel";
import { requireRole } from "./lib/auth";
import { formatBatchNumber, nextBatchSequence } from "./lib/batch";

const TABLES: TableNames[] = [
  "auditLog", "saleItems", "sales", "inventoryLedger", "products", "counters",
  "userProfiles", "authAccounts", "authSessions", "authRefreshTokens",
  "authVerificationCodes", "authVerifiers", "authRateLimits", "users",
];

export const clearAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of TABLES) {
      let batch = await ctx.db.query(table).take(200);
      while (batch.length > 0) {
        for (const row of batch) await ctx.db.delete(row._id);
        batch = await ctx.db.query(table).take(200);
      }
    }
  },
});

/**
 * Idempotently set isArchived:false on any purchases or sales rows that predate
 * the soft-archive feature (where the field is undefined). Rows with the field
 * already set are left untouched. Uses the by_archived index to find only the
 * undefined rows, so re-running once everything is backfilled is a no-op.
 */
async function doBackfillArchiveFlags(ctx: MutationCtx) {
  let purchasesPatched = 0;
  let salesPatched = 0;

  // isArchived === undefined is matched by eq("isArchived", undefined).
  let purchaseBatch = await ctx.db
    .query("purchases")
    .withIndex("by_archived", (q) => q.eq("isArchived", undefined))
    .take(200);
  while (purchaseBatch.length > 0) {
    for (const row of purchaseBatch) {
      await ctx.db.patch("purchases", row._id, { isArchived: false });
      purchasesPatched++;
    }
    purchaseBatch = await ctx.db
      .query("purchases")
      .withIndex("by_archived", (q) => q.eq("isArchived", undefined))
      .take(200);
  }

  let saleBatch = await ctx.db
    .query("sales")
    .withIndex("by_archived", (q) => q.eq("isArchived", undefined))
    .take(200);
  while (saleBatch.length > 0) {
    for (const row of saleBatch) {
      await ctx.db.patch("sales", row._id, { isArchived: false });
      salesPatched++;
    }
    saleBatch = await ctx.db
      .query("sales")
      .withIndex("by_archived", (q) => q.eq("isArchived", undefined))
      .take(200);
  }

  return { purchasesPatched, salesPatched };
}

// Admin-gated, callable from the app (authenticated admin).
export const backfillArchiveFlags = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return doBackfillArchiveFlags(ctx);
  },
});

// CLI-runnable (no auth identity): `npx convex run databaseMaintenance:backfillArchiveFlagsInternal`
export const backfillArchiveFlagsInternal = internalMutation({
  args: {},
  handler: async (ctx) => doBackfillArchiveFlags(ctx),
});

async function doBackfillUserEmails(ctx: MutationCtx) {
  let emailsPatched = 0;
  const profiles = await ctx.db.query("userProfiles").collect();
  for (const profile of profiles) {
    if (profile.email !== undefined) continue;
    const user = await ctx.db.get("users", profile.userId);
    if (user?.email) {
      await ctx.db.patch("userProfiles", profile._id, { email: user.email });
      emailsPatched++;
    }
  }
  return { emailsPatched };
}

export const backfillUserEmails = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return doBackfillUserEmails(ctx);
  },
});

export const backfillUserEmailsInternal = internalMutation({
  args: {},
  handler: async (ctx) => doBackfillUserEmails(ctx),
});

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

/**
 * Kick off the idempotent batches.receivedDate backfill (self-scheduling
 * pagination lives in migrations.ts). Safe to run repeatedly — rows that
 * already have a receivedDate are skipped.
 */
export const startBatchReceivedDateBackfill = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    await ctx.scheduler.runAfter(0, internal.migrations.backfillBatchReceivedDates, {
      cursor: null,
    });
    return "receivedDate backfill scheduled";
  },
});

export const resetWithMasterSeed = internalMutation({
  args: { confirm: v.string() },
  handler: async (ctx, args) => {
    if (args.confirm !== "RESET_DATABASE") throw new Error("Confirmation required");
    await ctx.runMutation(internal.databaseMaintenance.clearAll, {});
    await ctx.scheduler.runAfter(0, internal.seed.seedAuthUsers, {});
    return "Reset scheduled; users reseeded.";
  },
});
