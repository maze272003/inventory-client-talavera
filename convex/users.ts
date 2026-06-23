import { v } from "convex/values";
import { query, mutation, internalMutation, MutationCtx, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getCurrentUserId, getProfile, requireRole } from "./lib/auth";
import { recordAudit } from "./lib/audit";
import { roleValidator } from "./schema";

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) return null;
    const profile = await getProfile(ctx, userId);
    if (!profile) return null;
    return { _id: userId, name: profile.name, role: profile.role, email: profile.email ?? null };
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
      await ctx.db.patch("userProfiles", existing._id, { name: args.name, role: args.role });
      return existing._id;
    }
    return await ctx.db.insert("userProfiles", args);
  },
});

async function countActiveAdmins(ctx: QueryCtx | MutationCtx): Promise<number> {
  const profiles = await ctx.db.query("userProfiles").collect();
  return profiles.filter((p) => p.role === "admin" && p.disabled !== true).length;
}

async function getProfileByUserId(ctx: MutationCtx, userId: Id<"users">) {
  const profile = await ctx.db
    .query("userProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!profile) throw new Error("User profile not found");
  return profile;
}

export const setRole = mutation({
  args: { userId: v.id("users"), role: roleValidator },
  handler: async (ctx, args) => {
    const { userId: callerId } = await requireRole(ctx, "admin");
    const target = await getProfileByUserId(ctx, args.userId);
    if (target.role === "admin" && args.role === "cashier" && (await countActiveAdmins(ctx)) <= 1) {
      throw new Error("Cannot demote the last admin");
    }
    if (args.userId === callerId) throw new Error("You cannot change your own role");
    if (target.role === args.role) return null;
    await ctx.db.patch("userProfiles", target._id, { role: args.role });
    await recordAudit(ctx, {
      entityTable: "users",
      entityId: args.userId,
      action: "update",
      summary: `Changed role of ${target.name} from ${target.role} to ${args.role}`,
      before: { role: target.role },
      after: { role: args.role },
      undoable: false,
      userId: callerId,
    });
    return null;
  },
});

export const setDisabled = mutation({
  args: { userId: v.id("users"), disabled: v.boolean() },
  handler: async (ctx, args) => {
    const { userId: callerId } = await requireRole(ctx, "admin");
    const target = await getProfileByUserId(ctx, args.userId);

    if (args.disabled) {
      if (args.userId === callerId) throw new Error("You cannot disable your own account");
      if (target.role === "admin" && (await countActiveAdmins(ctx)) <= 1) {
        throw new Error("Cannot disable the last admin");
      }
    }
    if ((target.disabled ?? false) === args.disabled) return null;

    await ctx.db.patch("userProfiles", target._id, { disabled: args.disabled });

    if (args.disabled) {
      const sessions = await ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", args.userId))
        .collect();
      for (const s of sessions) await ctx.db.delete(s._id);
    }

    await recordAudit(ctx, {
      entityTable: "users",
      entityId: args.userId,
      action: args.disabled ? "archive" : "restore",
      summary: `${args.disabled ? "Disabled" : "Reactivated"} account ${target.name}`,
      before: { disabled: target.disabled ?? false },
      after: { disabled: args.disabled },
      undoable: false,
      userId: callerId,
    });
    return null;
  },
});

export const rename = mutation({
  args: { userId: v.id("users"), name: v.string() },
  handler: async (ctx, args) => {
    const { userId: callerId } = await requireRole(ctx, "admin");
    const trimmed = args.name.trim();
    if (trimmed.length === 0) throw new Error("Name is required");
    const target = await getProfileByUserId(ctx, args.userId);
    if (target.name === trimmed) return null;
    await ctx.db.patch("userProfiles", target._id, { name: trimmed });
    await recordAudit(ctx, {
      entityTable: "users",
      entityId: args.userId,
      action: "update",
      summary: `Renamed ${target.name} to ${trimmed}`,
      before: { name: target.name },
      after: { name: trimmed },
      undoable: false,
      userId: callerId,
    });
    return null;
  },
});

export const assertAdminCaller = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireRole(ctx, "admin");
    return { adminId: userId };
  },
});
