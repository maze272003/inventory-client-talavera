import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const roleValidator = v.union(v.literal("admin"), v.literal("cashier"));
export const ledgerTypeValidator = v.union(
  v.literal("sale"),
  v.literal("stock_in"),
  v.literal("adjustment"),
);

export default defineSchema({
  ...authTables,
  // Per-user app profile (role). Keyed to the auth users table.
  userProfiles: defineTable({
    userId: v.id("users"),
    name: v.string(),
    role: roleValidator,
    email: v.optional(v.string()),
    disabled: v.optional(v.boolean()),
    createdBy: v.optional(v.id("users")),
  }).index("by_userId", ["userId"]),

  products: defineTable({
    name: v.string(),
    sku: v.string(),
    category: v.string(),
    model: v.optional(v.string()),
    imageId: v.optional(v.id("_storage")),
    costPrice: v.number(),
    sellPrice: v.number(),
    stockQty: v.number(),
    reorderThreshold: v.number(),
    isActive: v.boolean(),
  })
    .index("by_sku", ["sku"])
    .index("by_category", ["category"])
    .index("by_active", ["isActive"])
    .searchIndex("search_name", { searchField: "name", filterFields: ["isActive"] }),

  inventoryLedger: defineTable({
    productId: v.id("products"),
    type: ledgerTypeValidator,
    quantityDelta: v.number(),
    balanceAfter: v.number(),
    unitCost: v.optional(v.number()),
    reason: v.optional(v.string()),
    saleId: v.optional(v.id("sales")),
    purchaseId: v.optional(v.id("purchases")),
    userId: v.id("users"),
  })
    .index("by_product", ["productId"])
    .index("by_type", ["type"])
    .index("by_purchase", ["purchaseId"]),

  sales: defineTable({
    receiptNumber: v.number(),
    total: v.number(),
    itemCount: v.number(),
    cashTendered: v.number(),
    changeGiven: v.number(),
    cashierId: v.id("users"),
    isArchived: v.optional(v.boolean()),
  })
    .index("by_receiptNumber", ["receiptNumber"])
    .index("by_archived", ["isArchived"])
    .index("by_cashier", ["cashierId"]),

  saleItems: defineTable({
    saleId: v.id("sales"),
    productId: v.id("products"),
    nameSnapshot: v.string(),
    skuSnapshot: v.string(),
    unitSellPrice: v.number(),
    unitCostPrice: v.number(),
    quantity: v.number(),
    lineTotal: v.number(),
  })
    .index("by_sale", ["saleId"])
    .index("by_product", ["productId"]),

  counters: defineTable({
    name: v.string(),
    value: v.number(),
  }).index("by_name", ["name"]),

  purchases: defineTable({
    supplierName: v.string(),
    supplierAddress: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    purchaseDate: v.number(),
    fileId: v.id("_storage"),
    total: v.number(),
    itemCount: v.number(),
    userId: v.id("users"),
    isArchived: v.optional(v.boolean()),
  })
    .index("by_supplier", ["supplierName"])
    .index("by_archived", ["isArchived"]),

  auditLog: defineTable({
    entityTable: v.string(),
    entityId: v.string(),
    action: v.union(
      v.literal("create"),
      v.literal("update"),
      v.literal("archive"),
      v.literal("restore"),
      v.literal("sale"),
      v.literal("stock_in"),
      v.literal("adjustment"),
      v.literal("password_reset"),
    ),
    summary: v.string(),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    undoable: v.boolean(),
    reverted: v.boolean(),
    userId: v.id("users"),
    actorName: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  })
    .index("by_reverted", ["reverted"])
    .index("by_userId", ["userId"]),
});
