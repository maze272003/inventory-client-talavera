# Sales & Inventory Management System — Design Spec

**Date:** 2026-06-21
**Client:** Charisma Abon Villamar
**Developers:** AvuemDev — John Michael Jonatas, Kenjie Villamar
**Status:** Approved design, ready for implementation planning

## 1. Overview

A responsive web-based Point-of-Sale (POS) and inventory management system for a
retail shop. It replaces manual processes with automated sales transactions
(with automatic stock deduction), an auditable inventory ledger, and sales
analytics. Built on the existing Next.js 16 + Convex + Tailwind v4 starter.

### Goals

- POS checkout with automatic stock deduction on every sale.
- Every sale is auto-saved as an immutable receipt that can be looked up
  ("back-tracked") later. Physical printing is **optional**.
- Inventory tracking: live on-hand counts, full movement ledger (in/out/
  adjustments), cost/sell prices and margins, low-stock alerts.
- Sales analytics across daily / weekly / monthly intervals plus a custom
  date-range picker.

### Non-goals (explicitly out of scope, YAGNI)

- Discounts (line or cart), tax/VAT, and non-cash tender types. Cash only with
  change calculation.
- Real payment gateway integration.
- Raw ESC/POS printing or PDF receipts — printing is browser print + CSS only.
- Product variants, multi-store/multi-location, supplier management.

## 2. Roles & Access Control

Two roles, login required:

- **Admin** — full access: products, inventory operations, reports, user
  management.
- **Cashier** — run POS checkout, view products, view/re-open saved receipts.

Authorization is always derived server-side from `ctx.auth.getUserIdentity()`
→ look up the `users` row → check `role`. A `requireRole(ctx, role)` helper
guards mutations/queries. Never accept a client-supplied user id for
authorization.

Authentication: **Convex Auth (`@convex-dev/auth`) password provider** —
self-contained, no external service. Admin and cashier accounts are created via
the existing `scripts/seed-auth-users.mjs` seed script.

## 3. Data Model (`convex/schema.ts`)

| Table | Key fields | Notes |
|---|---|---|
| `users` | Convex Auth fields + `role: "admin" \| "cashier"`, `name` | Role drives access control |
| `products` | `name`, `sku` (barcode), `category`, `costPrice`, `sellPrice`, `stockQty`, `reorderThreshold`, `isActive` | `stockQty` is the live denormalized count. Indexes: `by_sku`, `by_category`; search index on `name` |
| `inventoryLedger` | `productId`, `type: "sale"\|"stock_in"\|"adjustment"`, `quantityDelta` (signed), `balanceAfter`, `unitCost?`, `reason?`, `saleId?`, `userId` | **Immutable** audit trail. Indexes: `by_product`, `by_type` |
| `sales` | `receiptNumber`, `total`, `itemCount`, `cashTendered`, `changeGiven`, `cashierId` | One row per completed sale; the saved receipt header |
| `saleItems` | `saleId`, `productId`, `nameSnapshot`, `skuSnapshot`, `unitSellPrice`, `unitCostPrice`, `quantity`, `lineTotal` | Separate table (no unbounded array on `sales`). Name/price/cost are **snapshotted** so a receipt always renders exactly as sold and historical margins stay accurate. Indexes: `by_sale`, `by_product` |
| `counters` | `name`, `value` | Denormalized sequential `receiptNumber` (no `.collect().length` counting) |

### Margins

`margin = sellPrice - costPrice` per unit. Reports compute profit from
`saleItems` using the snapshotted `unitCostPrice`, so changing a product's cost
later never rewrites history.

## 4. Critical Transaction — `createSale`

A single Convex mutation, which is one ACID transaction:

1. Validate each line's product exists, is active, and `stockQty >= quantity`.
2. Compute `total`; validate `cashTendered >= total`; compute `changeGiven`.
3. For each line item: patch `product.stockQty`, insert a `saleItem`, insert a
   `sale`-type `inventoryLedger` row (with `balanceAfter`).
4. Insert the `sale` row.
5. Increment the `receiptNumber` counter.

Either the whole sale commits or none of it does, so stock can never drift and
automatic deduction is inherent. The saved sale + saleItems **is** the receipt
record — auto-save requires no extra step.

## 5. Backend Modules (`convex/`)

- `auth.ts` + `auth.config.ts` — Convex Auth password provider.
- `users.ts` — `currentUser`, `requireRole(ctx, role)` helper, admin user
  management.
- `products.ts` — paginated/searchable list, `getBySku`, create / update /
  deactivate (admin).
- `inventory.ts` — `stockIn`, `adjust` (admin), `ledgerForProduct`, `lowStock`
  queries.
- `sales.ts` — `createSale`, `getSale` (re-view one receipt),
  `listReceipts({ paginationOpts, dateRange?, search? })` (receipt history),
  `recentSales`.
- `reports.ts` — `salesSummary(range)`, `topProducts(range)`,
  `timeseries(granularity, range)` → revenue, profit, units sold, sale count.
- `databaseMaintenance.ts` + `scripts/seed-auth-users.mjs` — master seed/reset
  (already referenced in `package.json`).

## 6. Receipts — save-first, print-optional

- Every completed sale is auto-saved as an immutable receipt (`sales` +
  `saleItems` with snapshotted fields).
- **Back-tracking:** the `/receipts` screen is a searchable, paginated history
  — filter by date range, search by receipt number, click any row to re-open
  the full saved receipt. Available to both admin and cashier.
- A receipt can also be re-opened immediately after checkout.
- **Print is optional:** a Print button renders the same receipt through an
  `@media print` view with a width variable for **58mm / 80mm** rolls, using
  the browser print dialog. No printing is ever required to complete or store a
  sale.

## 7. Frontend (Next.js App Router + Tailwind v4)

Routes:

- `/login` — Convex Auth password login.
- `/dashboard` — KPIs (today's sales, profit) + low-stock alerts.
- `/pos` — scan/search → cart → cash tender + change → complete → option to
  view/print receipt. Primary cashier screen.
- `/products` — product CRUD (admin).
- `/inventory` — stock-in, adjustments, per-product ledger, low-stock list
  (admin).
- `/receipts` — searchable receipt history; open/re-print any saved receipt
  (both roles).
- `/reports` — daily / weekly / monthly toggle + custom date-range picker
  (admin).

Role-gated navigation. Convex's reactive queries make stock counts and the
dashboard update live with no extra wiring. `ConvexClientProvider` is extended
with the Convex Auth provider.

## 8. Testing (`convex-test` + vitest)

Cover the high-risk logic:

- `createSale`: correct stock deduction, insufficient-stock rejection, change
  calculation, receipt-number increment.
- `inventoryLedger` `balanceAfter` integrity across stock-in / sale /
  adjustment sequences.
- `reports` aggregation and margin math over a known fixture.

## 9. Build Order (drives the implementation plan)

1. **Foundation** — schema + Convex Auth + seed script + provider + login +
   role-gated layout.
2. **Products CRUD** (admin).
3. **Inventory** — stock-in, adjustments, ledger, low-stock.
4. **POS checkout** + `createSale` (automatic deduction).
5. **Receipts** — auto-save (inherent) + `/receipts` history/lookup + optional
   58mm/80mm print view.
6. **Reports / analytics** — daily/weekly/monthly + custom range.
7. **Dashboard + responsive Tailwind polish.**
