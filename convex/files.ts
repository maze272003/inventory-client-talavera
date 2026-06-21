import { mutation } from "./_generated/server";
import { requireRole } from "./lib/auth";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.storage.generateUploadUrl();
  },
});
