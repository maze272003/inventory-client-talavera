# User Management, RBAC & Accountability — Design Spec

**Date:** 2026-06-23
**Status:** Approved (design) — ready for implementation planning
**Area:** Cashier account management, role-based access control, audit attribution, admin analytics

## 1. Purpose & Context

The store admin needs to manage cashier accounts directly from the app, hold
cashiers accountable for the sales and changes they make, and analyze store
movements (who sold what, who changed what, how each cashier is performing).

Today the foundations exist but the management surface does not:

- **RBAC primitive exists:** `userProfiles` (`{ userId, name, role: "admin" | "cashier" }`),
  `requireUser` / `requireRole` with a role-rank hierarchy (`lib/auth.ts`), and
  admin-only nav gating (`Nav.tsx`).
- **Accounts can only be created via `seed.ts`** — a hardcoded Node action. There
  is **no UI or function** for an admin to create, edit, disable, or reset a
  cashier account.
- **Audit log attributes by `userId`** and enriches a live `userName` (no email);
  sales store `cashierId` and enrich `cashierName` live.
- **Analytics** are limited to `salesSummary` + `topProducts`; there is no
  per-cashier breakdown and no way to filter the audit log.

This spec adds the management surface, hardens attribution, and adds the
analytics needed to review store activity.

## 2. Goals

1. An admin can **create a cashier (or admin) account** by entering name, email,
   and a temporary password, then handing the credentials to the user.
2. An admin can **change a user's role**, **disable/reactivate** a user, and
   **reset a user's password**.
3. Disabling a user **immediately blocks all access** while **preserving all
   history** (audit entries, sales attribution).
4. Audit logs, receipts, and reports show the responsible user by **name (primary)
   and email (secondary)**, and audit attribution **survives renames/disables**
   via an event-time snapshot.
5. The admin can analyze store movements via **per-cashier performance**,
   **filterable audit logs**, and a **cashier activity roster**.

## 3. Non-Goals (YAGNI)

- Email-based invitations or set-password links (no email infrastructure wired).
- Self-service signup or approval flows.
- A forced "change password on first login" screen (admin-driven reset only).
- Shift / cash-drawer reconciliation (its own future spec).
- Granular permissions beyond the existing `admin` / `cashier` roles.

## 4. Architectural Decision: Credential ops run in Node actions

Convex Auth's `createAccount` and `modifyAccountCredentials` must run in a **Node
action** (as `seed.ts` already does), not a plain mutation. Therefore:

- **Credential operations** (create user, reset password) are admin-guarded Node
  **actions** that call the Convex Auth helpers, then delegate to **internal
  mutations** for the profile row and audit entry — mirroring the existing
  `seed.ts → internal.users.setProfile` pattern.
- **Non-credential operations** (change role, disable/reactivate, list, analytics)
  remain ordinary **mutations/queries** for full reactivity and transactionality.
- **Disabled enforcement** lives in `requireUser` (a `disabled` profile throws),
  which neuters any held session everywhere instantly. We do **not** fork the
  Password provider.

Rejected alternatives: routing everything through actions (loses reactivity/
transactionality, slower); a custom auth provider that blocks login (heavier and
riskier than the `requireUser` check, which already gates every endpoint).

## 5. Data Model Changes

### `userProfiles` (extend)
| Field | Type | Notes |
| --- | --- | --- |
| `email` | `v.optional(v.string())` | Denormalized snapshot captured at create; powers roster + attribution display. |
| `disabled` | `v.optional(v.boolean())` | Absent/false = active. Set true to revoke access. |
| `createdBy` | `v.optional(v.id("users"))` | Admin who created the account (provenance). |

Existing `by_userId` index is retained. The roster reads all profiles (small N),
so no new index is required for listing.

### `auditLog` (extend)
| Field | Type | Notes |
| --- | --- | --- |
| `actorName` | `v.optional(v.string())` | Snapshot of the actor's display name **at event time**. |
| `actorEmail` | `v.optional(v.string())` | Snapshot of the actor's email **at event time**. |

- Add `password_reset` to the `action` union. User-management events otherwise
  **reuse** existing literals: account create → `create`; role/name change →
  `update`; disable → `archive`; reactivate → `restore`. (Confirmed acceptable.)
- Add a **`by_userId`** index on `auditLog` to support the "what did this user
  change?" filter.

### `sales` (no schema change)
Receipts gain **live** name+email enrichment. Snapshotting cashier identity onto
the sale row is recorded as optional future hardening, not part of this spec.

### Backfill
Existing `userProfiles` rows have no `email`; a maintenance backfill populates it
from the auth `users` table. `disabled` is treated as `false` when absent.
Existing `auditLog` rows have no actor snapshot; they fall back to live lookup,
identical to current behavior.

## 6. Backend Functions

### `convex/users.ts`
- **`createUser`** *(action, admin-only)* — args `{ name, email, tempPassword, role }`.
  Verifies caller is admin (via `runQuery`), validates temp-password min length,
  calls `createAccount` (duplicate email → friendly error), then `runMutation` to
  insert the profile (`disabled: false`, `email`, `createdBy`) and record a
  `create` audit entry on `entityTable: "users"`.
- **`resetPassword`** *(action, admin-only)* — args `{ userId, newTempPassword }`.
  Calls `modifyAccountCredentials`; records a `password_reset` audit entry.
- **`setRole`** *(mutation, admin-only)* — args `{ userId, role }`. Enforces
  last-admin and self-protection (§7). Records an `update` audit entry.
- **`setDisabled`** *(mutation, admin-only)* — args `{ userId, disabled }`. On
  disable: enforces last-admin/self-protection, sets `disabled: true`, and
  **deletes that user's `authSessions` rows** to force logout. Records `archive`
  (disable) / `restore` (reactivate).
- **`rename`** *(mutation, admin-only)* — args `{ userId, name }`. Records `update`.
- **`list`** *(query, admin-only)* — returns every profile with `name`, `email`,
  `role`, `disabled`, derived `lastActiveAt` (most recent of the user's audit/sale
  activity), and total sales handled. Powers the roster + cashier-activity view.
- **`currentUser`** — unchanged in shape.

### `convex/lib/auth.ts`
- **`requireUser`** now throws (e.g. `"Account disabled"`) when `profile.disabled`
  is true. Because `requireRole` builds on `requireUser`, this blocks disabled
  users from every query and mutation.

### `convex/lib/audit.ts`
- **`recordAudit`** looks up the actor's profile + email at write time and stores
  `actorName` / `actorEmail` on the entry. Call sites already pass `userId`, so
  **no call-site changes** are required.

### `convex/audit.ts`
- **`list`** extended with optional filters `{ userId?, action?, entityTable?,
  startMs?, endMs? }`. When `userId` is present, query the `by_userId` index;
  otherwise newest-first. Remaining dimensions are narrowed in-memory over each
  page (same pattern as `sales.listReceipts`), which is acceptable for a
  load-more audit view. `enrichEntry` prefers the stored snapshot and falls back
  to live lookup, and now also returns `userEmail`.

### `convex/reports.ts`
- **`cashierPerformance`** *(query, admin-only)* — args `{ startMs, endMs }`.
  Aggregates sales in range grouped by `cashierId`: sales count, revenue, profit,
  units sold. Joins each cashier's name + email.

## 7. RBAC & Safety Rules

- Every endpoint in this feature calls `requireRole(ctx, "admin")`.
- **Last-admin protection:** the final remaining active (non-disabled) admin
  cannot be disabled or demoted.
- **Self-protection:** an admin cannot disable or demote themselves (anti-lockout).
- **Email uniqueness:** enforced by `createAccount`; a duplicate surfaces a
  friendly error.
- **Temp password:** minimum-length validation before account creation/reset.
- **Disabled access:** blocked at `requireUser`; active sessions deleted on disable.

## 8. Frontend

- **New `/users` page (admin-only).** Roster table: name, email, role badge,
  status (Active/Disabled), last active, total sales handled. Row actions:
  **Add cashier** (dialog: name, email, temp password with generate, role),
  **Edit role**, **Disable / Reactivate**, **Reset password**. After create, the
  UI surfaces the credentials for the admin to hand off. Built from existing
  `components/ui` primitives (`ResponsiveTable`, `Dialog`, `Badge`, `Button`,
  `ConfirmDialog`, `useToast`).
- **Nav (`Nav.tsx`).** Add a **Users** link in a new **Admin** group, gated by
  `adminOnly`.
- **Reports page.** Add a **Cashier Performance** section/table using the existing
  `DateRangePicker`, backed by `reports.cashierPerformance`.
- **Audit page.** Add filter controls (user dropdown, action, entity type, date
  range); render the actor email under the name.
- **Receipts.** Display the cashier email under the cashier name.

## 9. Testing (convex-test, matching existing `*.test.ts`)

- `createUser` creates both an auth account and a profile with `disabled: false`.
- A disabled user is rejected by `requireUser` (and thus all endpoints).
- Last-admin protection blocks disabling/demoting the final admin.
- Self-protection blocks an admin disabling/demoting themselves.
- `setRole` and `resetPassword` behave and record the correct audit actions.
- `recordAudit` stores `actorName` / `actorEmail` snapshots.
- `audit.list` filters by user / action / entity / date range correctly.
- `cashierPerformance` aggregates count, revenue, profit, and units per cashier.

## 10. Implementation Order (foundation-first, then fan-out)

1. **Schema + `lib/auth` + `lib/audit`** (foundation: fields, indexes, `disabled`
   enforcement, audit snapshot) and the `email`/`disabled` backfill.
2. **Backend functions** — `users.ts` (actions + mutations + `list`),
   `audit.ts` filters, `reports.cashierPerformance` — can fan out once §1 lands.
3. **Frontend** — `/users` page + nav, Reports cashier table, Audit filters,
   receipt email — independent per-surface, fan out across the modules.
4. **Tests** alongside each backend unit.
