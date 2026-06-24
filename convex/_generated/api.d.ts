/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as batches from "../batches.js";
import type * as databaseMaintenance from "../databaseMaintenance.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as inventory from "../inventory.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_batch from "../lib/batch.js";
import type * as lib_buckets from "../lib/buckets.js";
import type * as lib_fifo from "../lib/fifo.js";
import type * as migrations from "../migrations.js";
import type * as products from "../products.js";
import type * as purchases from "../purchases.js";
import type * as reports from "../reports.js";
import type * as sales from "../sales.js";
import type * as seed from "../seed.js";
import type * as userAccounts from "../userAccounts.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audit: typeof audit;
  auth: typeof auth;
  batches: typeof batches;
  databaseMaintenance: typeof databaseMaintenance;
  files: typeof files;
  http: typeof http;
  inventory: typeof inventory;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/batch": typeof lib_batch;
  "lib/buckets": typeof lib_buckets;
  "lib/fifo": typeof lib_fifo;
  migrations: typeof migrations;
  products: typeof products;
  purchases: typeof purchases;
  reports: typeof reports;
  sales: typeof sales;
  seed: typeof seed;
  userAccounts: typeof userAccounts;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
