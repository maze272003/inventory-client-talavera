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
