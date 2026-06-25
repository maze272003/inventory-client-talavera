import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

export type AuditAction =
  | "create"
  | "update"
  | "archive"
  | "restore"
  | "sale"
  | "stock_in"
  | "adjustment"
  | "password_reset"
  | "return";

export type RecordAuditArgs = {
  entityTable: string;
  entityId: string;
  action: AuditAction;
  summary: string;
  before?: unknown;
  after?: unknown;
  undoable: boolean;
  userId: Id<"users">;
};

/**
 * Insert an auditLog row describing a data-changing mutation. The actor's
 * display name and email are snapshotted at write time so attribution survives
 * later renames or account changes. Every entry is created with reverted:false.
 */
export async function recordAudit(
  ctx: MutationCtx,
  args: RecordAuditArgs,
): Promise<Id<"auditLog">> {
  const profile = await ctx.db
    .query("userProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))
    .unique();
  const user = await ctx.db.get("users", args.userId);
  const actorEmail = profile?.email ?? user?.email ?? undefined;

  return await ctx.db.insert("auditLog", {
    entityTable: args.entityTable,
    entityId: args.entityId,
    action: args.action,
    summary: args.summary,
    before: args.before,
    after: args.after,
    undoable: args.undoable,
    reverted: false,
    userId: args.userId,
    actorName: profile?.name ?? undefined,
    actorEmail,
  });
}
