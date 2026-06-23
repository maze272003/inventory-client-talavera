"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { createAccount } from "@convex-dev/auth/server";

const SEED_USERS = [
  { email: "admin@shop.local", password: "admin12345", name: "Store Admin", role: "admin" as const },
  { email: "sanped1914@gmail.com", password: "sanped1914", name: "Store Admin", role: "admin" as const },
  { email: "cashier@shop.local", password: "cashier12345", name: "Store Cashier", role: "cashier" as const },
];

export const seedAuthUsers = internalAction({
  args: {},
  handler: async (ctx) => {
    for (const u of SEED_USERS) {
      const { user } = await createAccount(ctx, {
        provider: "password",
        account: { id: u.email, secret: u.password },
        profile: { email: u.email },
      });
      await ctx.runMutation(internal.users.setProfile, {
        userId: user._id,
        name: u.name,
        role: u.role,
      });
    }
    return SEED_USERS.map((u) => ({ email: u.email, role: u.role }));
  },
});
