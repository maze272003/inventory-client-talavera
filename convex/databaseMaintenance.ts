import { v } from "convex/values";
import { internalMutation, mutation, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { TableNames } from "./_generated/dataModel";
import { requireRole } from "./lib/auth";

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

export const resetWithMasterSeed = internalMutation({
  args: { confirm: v.string() },
  handler: async (ctx, args) => {
    if (args.confirm !== "RESET_DATABASE") throw new Error("Confirmation required");
    await ctx.runMutation(internal.databaseMaintenance.clearAll, {});
    await ctx.scheduler.runAfter(0, internal.seed.seedAuthUsers, {});
    return "Reset scheduled; users reseeded.";
  },
});
