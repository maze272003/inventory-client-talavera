import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";

const TABLES = [
  "saleItems", "sales", "inventoryLedger", "products", "counters",
  "userProfiles", "authAccounts", "authSessions", "authRefreshTokens",
  "authVerificationCodes", "authVerifiers", "authRateLimits", "users",
] as const;

export const clearAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of TABLES) {
      let batch = await ctx.db.query(table as any).take(200);
      while (batch.length > 0) {
        for (const row of batch) await ctx.db.delete(table as any, row._id);
        batch = await ctx.db.query(table as any).take(200);
      }
    }
  },
});

export const resetWithMasterSeed = mutation({
  args: { confirm: v.string() },
  handler: async (ctx, args) => {
    if (args.confirm !== "RESET_DATABASE") throw new Error("Confirmation required");
    await ctx.runMutation(internal.databaseMaintenance.clearAll, {});
    await ctx.scheduler.runAfter(0, internal.seed.seedAuthUsers, {});
    return "Reset scheduled; users reseeded.";
  },
});
