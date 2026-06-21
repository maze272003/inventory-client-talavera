import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { getCurrentUserId, getProfile } from "./lib/auth";
import { roleValidator } from "./schema";

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) return null;
    const profile = await getProfile(ctx, userId);
    if (!profile) return null;
    return { _id: userId, name: profile.name, role: profile.role };
  },
});

export const setProfile = internalMutation({
  args: { userId: v.id("users"), name: v.string(), role: roleValidator },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.patch("userProfiles", existing._id, {
        name: args.name,
        role: args.role,
      });
      return existing._id;
    }
    return await ctx.db.insert("userProfiles", args);
  },
});
