"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { roleValidator } from "./schema";

const MIN_PASSWORD_LENGTH = 8;

export const createUser = action({
  args: {
    name: v.string(),
    email: v.string(),
    tempPassword: v.string(),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    const { adminId } = await ctx.runQuery(api.users.assertAdminCaller, {});

    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    if (email.length === 0) throw new Error("Email is required");
    if (name.length === 0) throw new Error("Name is required");
    if (args.tempPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error("Password must be at least 8 characters");
    }

    const { user } = await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: args.tempPassword },
      profile: { email },
    });

    await ctx.runMutation(internal.users.createUserProfile, {
      userId: user._id,
      name,
      email,
      role: args.role,
      createdBy: adminId,
    });

    return { userId: user._id };
  },
});

export const resetPassword = action({
  args: { userId: v.id("users"), tempPassword: v.string() },
  handler: async (ctx, args) => {
    await ctx.runQuery(api.users.assertAdminCaller, {});
    if (args.tempPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error("Password must be at least 8 characters");
    }
    const target = await ctx.runQuery(api.users.getEmailForUser, { userId: args.userId });
    if (!target?.email) throw new Error("User has no email on file");

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: target.email, secret: args.tempPassword },
    });
    await ctx.runMutation(internal.users.recordPasswordReset, {
      userId: args.userId,
      targetName: target.name,
    });
    return null;
  },
});
