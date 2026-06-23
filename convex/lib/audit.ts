import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

export type AuditAction =
  | "create"
  | "update"
  | "archive"
  | "restore"
  | "sale"
  | "stock_in"
  | "adjustment";

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
 * Insert an auditLog row describing a data-changing mutation. Every entry is
 * created with reverted:false. Call this from each mutation that changes data.
 */
export async function recordAudit(
  ctx: MutationCtx,
  args: RecordAuditArgs,
): Promise<Id<"auditLog">> {
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
  });
}
