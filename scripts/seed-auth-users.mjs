import { execSync } from "node:child_process";

// Run via convex CLI so internal functions are callable.
execSync(
  `npx convex run --push seed:seedAuthUsers "{}"`,
  { stdio: "inherit" },
);
console.log("Seeded admin@shop.local / cashier@shop.local");
