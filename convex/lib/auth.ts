import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

export async function getCurrentUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users"> | null> {
  return await getAuthUserId(ctx);
}

export async function getProfile(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"userProfiles"> | null> {
  return await ctx.db
    .query("userProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const profile = await getProfile(ctx, userId);
  if (!profile) throw new Error("No profile for user");
  if (profile.disabled === true) throw new Error("Account disabled");
  return { userId, profile };
}

// Role hierarchy: admin (2) outranks cashier (1). Higher rank satisfies lower-rank requirements.
const ROLE_RANK = { cashier: 1, admin: 2 } as const;

export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  role: "admin" | "cashier",
) {
  const { userId, profile } = await requireUser(ctx);
  if (ROLE_RANK[profile.role] < ROLE_RANK[role]) {
    throw new Error(`Requires ${role} access`);
  }
  return { userId, profile };
}
