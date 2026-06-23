/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("schema accepts userProfiles email/disabled/createdBy fields", async () => {
  const t = convexTest(schema, modules);
  const id = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "x@y.com" });
    return await ctx.db.insert("userProfiles", {
      userId,
      name: "X",
      role: "cashier",
      email: "x@y.com",
      disabled: false,
      createdBy: userId,
    });
  });
  const row = await t.run((ctx) => ctx.db.get("userProfiles", id));
  expect(row!.email).toBe("x@y.com");
  expect(row!.disabled).toBe(false);
});

async function makeUser(
  t: ReturnType<typeof convexTest>,
  opts: { name: string; role: "admin" | "cashier"; disabled?: boolean },
) {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email: `${opts.name}@a.com` });
    await ctx.db.insert("userProfiles", {
      userId: id,
      name: opts.name,
      role: opts.role,
      email: `${opts.name}@a.com`,
      disabled: opts.disabled ?? false,
    });
    return id;
  });
  return { userId, as: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

test("a disabled user is rejected by currentUser-protected endpoints", async () => {
  const t = convexTest(schema, modules);
  const { as: disabled } = await makeUser(t, { name: "Ghost", role: "cashier", disabled: true });
  await expect(
    disabled.mutation(api.sales.createSale, { items: [], cashTendered: 0 }),
  ).rejects.toThrow("Account disabled");
});
