import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { TableNames } from "./_generated/dataModel";

const TABLES: TableNames[] = [
  "saleItems", "sales", "inventoryLedger", "products", "counters",
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

export const resetWithMasterSeed = internalMutation({
  args: { confirm: v.string() },
  handler: async (ctx, args) => {
    if (args.confirm !== "RESET_DATABASE") throw new Error("Confirmation required");
    await ctx.runMutation(internal.databaseMaintenance.clearAll, {});
    await ctx.scheduler.runAfter(0, internal.seed.seedAuthUsers, {});
    return "Reset scheduled; users reseeded.";
  },
});
