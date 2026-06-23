import { v } from "convex/values";
import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { Doc, Id } from "./_generated/dataModel";
import { requireRole, requireUser } from "./lib/auth";

async function enrichEntry(ctx: QueryCtx, entry: Doc<"auditLog">) {
  const profile = await ctx.db
    .query("userProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", entry.userId))
    .unique();
  return { ...entry, userName: profile?.name ?? "Unknown" };
}

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const result = await ctx.db
      .query("auditLog")
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(result.page.map((e) => enrichEntry(ctx, e))),
    };
  },
});

export const latest = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const entry = await ctx.db
      .query("auditLog")
      .withIndex("by_reverted", (q) => q.eq("reverted", false))
      .order("desc")
      .take(1);
    if (entry.length === 0) return null;
    return await enrichEntry(ctx, entry[0]);
  },
});

export const revertLatest = mutation({
  args: { entryId: v.id("auditLog") },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    // Only the single most-recent non-reverted entry may be undone.
    const recent = await ctx.db
      .query("auditLog")
      .withIndex("by_reverted", (q) => q.eq("reverted", false))
      .order("desc")
      .take(1);
    const latestEntry = recent[0] ?? null;
    if (!latestEntry || latestEntry._id !== args.entryId) {
      throw new Error("Only the latest change can be undone");
    }
    if (!latestEntry.undoable) {
      throw new Error("This change cannot be undone");
    }

    await applyInverse(ctx, latestEntry);
    // Mark reverted; do NOT create a new audit entry for the undo itself.
    await ctx.db.patch("auditLog", latestEntry._id, { reverted: true });
    return { reverted: true };
  },
});

async function applyInverse(
  ctx: MutationCtx,
  entry: Doc<"auditLog">,
): Promise<void> {
  const db = ctx.db;

  if (entry.entityTable === "products") {
    const id = entry.entityId as Id<"products">;
    const product = await db.get("products", id);
    if (!product) throw new Error("Product no longer exists");
    switch (entry.action) {
      case "create":
        // Archive-only system: undo a create by archiving the product.
        await db.patch("products", id, { isActive: false });
        return;
      case "update": {
        const before = entry.before as Partial<Doc<"products">> | undefined;
        if (!before) throw new Error("Missing snapshot for update undo");
        await db.patch("products", id, {
          name: before.name,
          sku: before.sku,
          category: before.category,
          model: before.model,
          imageId: before.imageId,
          costPrice: before.costPrice,
          sellPrice: before.sellPrice,
          reorderThreshold: before.reorderThreshold,
        });
        return;
      }
      case "archive":
        await db.patch("products", id, { isActive: true });
        return;
      case "restore":
        await db.patch("products", id, { isActive: false });
        return;
      default:
        throw new Error(`Cannot undo product action ${entry.action}`);
    }
  }

  if (entry.entityTable === "purchases") {
    const id = entry.entityId as Id<"purchases">;
    const purchase = await db.get("purchases", id);
    if (!purchase) throw new Error("Purchase no longer exists");
    switch (entry.action) {
      case "archive":
        await db.patch("purchases", id, { isArchived: false });
        return;
      case "restore":
        await db.patch("purchases", id, { isArchived: true });
        return;
      default:
        throw new Error(`Cannot undo purchase action ${entry.action}`);
    }
  }

  throw new Error(`Cannot undo entity ${entry.entityTable}`);
}
