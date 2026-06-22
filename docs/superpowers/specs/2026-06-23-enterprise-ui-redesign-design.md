# Enterprise UI Redesign — Talavera POS & Inventory Design Spec

**Date:** 2026-06-23
**Status:** Approved design, ready for implementation planning
**Scope:** Redesign all page modules into a cohesive, responsive, enterprise-grade
UI (phone / tablet / desktop, any resolution) using a Modern-SaaS visual language,
built on a design-token + reusable-primitive layer. Visual + responsive + UX fixes
and cross-cutting enterprise infrastructure. **No new business features.**

## 1. Overview

The app is a Next.js 16 (App Router) + Convex + Tailwind CSS v4 retail POS and
inventory system used by cashiers (phone/tablet) and back-office admins (desktop).
The current UI uses ad-hoc Tailwind utility classes with hardcoded grays/blues,
partial responsiveness, half-wired OS dark mode, no shared component layer, tables
that overflow on phones, `return null` instead of loading states, and a cramped
horizontal-scroll mobile nav.

This redesign introduces a single source of truth for styling (design tokens),
a small reusable UI primitive library, a responsive app shell, and migrates all
9 page modules + 11 shared components onto that foundation — adding loading/empty/
error states, WCAG AA accessibility, toasts & confirmations, and micro-interactions
throughout.

### Goals

- **One visual system.** CSS design tokens (color, radius, shadow, spacing, font,
  z-index, density) drive light + dark themes from one place. No hardcoded
  `text-gray-900` / `bg-blue-600` scattered across pages.
- **Fully responsive, mobile-first.** Every module is usable and polished from a
  small phone to a large desktop at any resolution. Data tables stack into cards
  on phones via a shared `ResponsiveTable`.
- **Enterprise-grade polish as standard.** Skeleton loaders, empty states,
  consistent error displays, toasts, destructive-action confirmations, accessible
  focus management, and tasteful micro-interactions (honoring reduced-motion).
- **Maintainable.** Pages compose a small set of well-bounded primitives so the
  look stays consistent and future changes are local.

### Non-goals (YAGNI)

- **No new business features** — no notifications center, audit-log UI, analytics
  beyond what Reports already shows.
- **No internationalization / multi-locale** — English + PH peso only.
- **No multi-tenant theming / white-label.**
- **No dedicated settings page** — preferences (theme, density) live in the user menu.
- **No backend / Convex schema or function changes** — this is a frontend redesign.
  Page components keep their existing data hooks and mutations; only presentation
  and surrounding states change.
- **Sortable / column-toggle tables — deferred** (not in this effort).

## 2. Visual Language & Design Decisions

| Decision | Choice |
|----------|--------|
| Design language | **Modern SaaS** (Linear/Stripe): neutral palette, generous whitespace, border-first elevation with soft shadows, crisp type |
| Primary accent | **Indigo** — `#4f46e5` (light) / `#6366f1` (dark) |
| Neutrals | **Slate** scale |
| Semantic colors | Emerald (success), Amber (warning), Rose (danger) — each a muted bg + solid fg pair |
| Typography | **Geist Sans**, properly wired (currently falls back to Arial). Tabular numerals for all money/quantity figures |
| Dark mode | **Light + manual toggle**, `.dark` class on `<html>`, persisted to `localStorage`, no-flash inline script. No new dependency |
| Density | **Comfortable / Compact** user preference, persisted; drives spacing + row height |
| Icons | **Inline-SVG icon module** (Lucide-style), hand-bundled — no external requests, no render-blocking deps |

## 3. Architecture — Token + Primitive Layer

### 3.1 Design tokens (`app/globals.css` via Tailwind v4 `@theme`)

A single token set, defined once with light values and overridden under `.dark`:

- **Color:** `--color-bg`, `--color-surface`, `--color-surface-2`, `--color-border`,
  `--color-text`, `--color-text-muted`, `--color-primary`, `--color-primary-hover`,
  `--color-primary-fg`, and semantic pairs (`--color-success`/`-fg`/`-bg`, same for
  warning/danger).
- **Radius:** `--radius-sm/md/lg/xl`.
- **Shadow:** `--shadow-sm/md` (subtle, border-first).
- **Spacing/density:** `--space-row`, `--space-cell` that switch with the density
  preference.
- **Z-index/layering scale:** `--z-dropdown`, `--z-sticky`, `--z-drawer`,
  `--z-modal`, `--z-toast` — so overlays never fight.
- **Font:** `--font-sans` (Geist), `--font-mono`.

Existing print styles in `globals.css` (receipt + report) are preserved.

### 3.2 UI primitives library (`components/ui/`)

Small, single-purpose, independently understandable components. Each: what it does,
how you use it (props), what it depends on (tokens only).

| Primitive | Purpose |
|-----------|---------|
| `Button` | variants: primary / secondary / ghost / danger; sizes sm/md/lg; loading + disabled states |
| `Card` (+ `CardHeader`/`CardBody`/`CardFooter`) | surface container |
| `Input`, `Textarea`, `Select` | token-styled form controls |
| `Field` (+ `Label`) | wraps a control with label, hint, **inline validation/error state**, and feeds an error-summary pattern |
| `Badge` | semantic status pills |
| `Dialog` | accessible modal (focus trap, ESC, ARIA, scrim) |
| `Drawer` | side panel (ledger, forms) — accessible |
| `Toast` (+ `ToastProvider`, `useToast`) | action feedback |
| `Skeleton` | loading placeholders |
| `EmptyState` | icon + message + optional action |
| `PageHeader` | title + subtitle + actions slot |
| `SegmentedControl` | tabbed presets (Reports ranges) |
| `Spinner` | inline busy indicator |
| `ResponsiveTable` | renders a real `<table>` at `md+`, stacks into labeled cards below `md` — the key responsive primitive for every data page |
| `Icon` | inline-SVG icon set |
| `ErrorBoundary` | per-route fallback with retry |
| `ConnectionStatus` | online / offline / reconnecting indicator (driven by Convex connection state + `navigator.onLine`) |
| `UserMenu` | avatar/initials → name, role, theme toggle, density toggle, sign out |
| `ThemeProvider` | theme + density context, localStorage persistence, no-flash script |
| `ConfirmDialog` | thin wrapper over `Dialog` for destructive confirmations |

## 4. App Shell & Navigation (UX fix)

Replaces the current sidebar/horizontal-scroll bar in `components/Nav.tsx` and
`app/(app)/layout.tsx`.

- **Desktop (`lg+`):** refined sidebar; links grouped into **Sell / Manage /
  Insights**; `UserMenu` + `ConnectionStatus` anchored at the bottom.
- **Tablet (`md`):** collapsible icon rail.
- **Phone (`<md`):** top bar with **hamburger → slide-in `Drawer`** for full nav,
  plus a **bottom tab bar** for the three cashier essentials (Dashboard · POS ·
  Receipts) — thumb-reachable. Admin-only links stay in the drawer.

Role gating (`adminOnly`) is preserved exactly as today.

## 5. Per-Module Redesign

All migrate onto primitives + tokens, gain loading/empty/error states, AA
accessibility, and responsive behavior. No flow/feature changes.

| Module | File(s) | Key changes |
|--------|---------|-------------|
| **Login** | `app/login/page.tsx` | Branded centered `Card`, dark-aware, `Field` validation + error banner |
| **Dashboard** | `app/(app)/dashboard/page.tsx` | Token KPI `Card`s, responsive grid, `Skeleton` loaders, `EmptyState` |
| **POS** | `app/(app)/pos/page.tsx`, `Cart`, `ProductSearch`, `ProductGrid`, `Receipt` | Touch-first (≥44px targets); cart becomes a sticky **bottom sheet** on phone; payment panel reflows; **keyboard shortcuts** (focus search, complete sale, new sale) + `?` help sheet; toasts on sale complete/error |
| **Receipts** (list + detail) | `app/(app)/receipts/page.tsx`, `receipts/[id]/page.tsx` | `ResponsiveTable` → cards on mobile; print preserved; skeletons |
| **Products** | `app/(app)/products/page.tsx`, `ProductForm`, `ProductGrid` | Table→cards; create/edit form in `Drawer`; `Field` validation; confirm on archive |
| **Inventory** | `app/(app)/inventory/page.tsx`, `StockInDialog`, `AdjustDialog`, `LedgerDrawer` | Table→cards; restyled low-stock section; dialogs/drawer rebuilt on primitives; toasts |
| **Import Invoice** | `app/(app)/inventory/import/page.tsx`, `PurchaseLineRow` | Responsive multi-step form; clearer OCR/extract states; line rows reflow on mobile |
| **Purchases** | `app/(app)/inventory/purchases/page.tsx` | Table→cards; per-line rows reflow; skeletons |
| **Reports** | `app/(app)/reports/page.tsx`, `DateRangePicker` | Presets as `SegmentedControl`; summary `Card`s; table→cards; CSV export + print preserved |

Shared components touched: `Nav`, `Cart`, `ProductSearch`, `ProductGrid`,
`ProductForm`, `Receipt`, `StockInDialog`, `AdjustDialog`, `LedgerDrawer`,
`DateRangePicker`, `PurchaseLineRow`.

## 6. Enterprise Polish (applied as standard)

- **States:** every `return null` / "Loading…" replaced with `Skeleton`;
  every empty list gets an `EmptyState`; errors render a consistent banner/toast.
- **Accessibility (WCAG AA):** semantic HTML, `focus-visible` token rings, ARIA on
  Dialog/Drawer/Toast/menu, full keyboard nav, AA contrast in both themes, and
  **`prefers-reduced-motion`** honored by all transitions/animations.
- **Toasts & confirmations:** toast on every mutation result; `ConfirmDialog` before
  destructive actions (e.g. archive).
- **Micro-interactions:** subtle hover/active/press states and transitions, gated by
  reduced-motion.
- **Resilience:** per-route `ErrorBoundary` with retry; `ConnectionStatus` indicator.

## 7. Responsive Strategy

- **Mobile-first.** Breakpoints `sm 640 / md 768 / lg 1024 / xl 1280`.
- **Tables** always go through `ResponsiveTable` (table at `md+`, cards below).
- **Touch targets ≥44px** on interactive POS/mobile elements.
- **Fluid spacing + container max-widths** so layouts hold at any resolution.
- **POS** reflows from three-column desktop → stacked phone with bottom-sheet cart.

## 8. Optional (Phase 6 — opt-out)

- **Command palette (`Cmd/Ctrl-K`)** — quick-jump to any page or product.
  Recommended, but isolated to its own phase so it can be dropped without affecting
  the redesign.

## 9. Implementation Phasing & Parallelization

Foundation and primitives are **serial prerequisites**; page migrations then **fan
out across ~10 subagents** working independent files in parallel.

1. **Phase 1 — Foundation (serial, 1 agent):** tokens (color/radius/shadow/spacing/
   z-index/density), `ThemeProvider`, Geist font wiring, dark + density toggles,
   `Icon` module, no-flash script. *Blocks everything.*
2. **Phase 2 — Primitives (serial-ish, 1–2 agents):** full `components/ui/` incl.
   `ErrorBoundary`, `Field` validation, `ConnectionStatus`, `UserMenu`,
   `ResponsiveTable`, `Toast`. *Blocks page migration.*
3. **Phase 3 — Shell (1 agent):** layout, sidebar, bottom tab bar, drawer nav,
   user menu, connection indicator.
4. **Phase 4 — Page migration (fan-out, ~10 parallel subagents):** each subagent
   owns one module's page + its specific components (per the §5 table), composing
   primitives only. Independent files → safe to parallelize. Suggested splits:
   Login · Dashboard · POS(+Cart/ProductSearch/ProductGrid/Receipt) · Receipts ·
   Products(+ProductForm) · Inventory(+dialogs/drawer) · Import(+PurchaseLineRow) ·
   Purchases · Reports(+DateRangePicker) · Nav/shared cleanup.
5. **Phase 5 — Polish & QA (serial sweep):** toasts/empty/error states audit,
   error boundaries wired per route, reduced-motion, WCAG AA pass, responsive sweep
   across all breakpoints; `npm run typecheck`, `npm run lint`, `npm run test` green.
6. **Phase 6 — Optional:** command palette.

**Parallelization guardrails:** Phase 4 subagents must not edit `globals.css`,
tokens, or `components/ui/` (owned by Phases 1–2); they import primitives only. Each
subagent touches a disjoint set of files to avoid merge conflicts. The migration is
purely presentational — no subagent changes data hooks, Convex calls, or business logic.

## 10. Verification

No visual-regression infrastructure exists; adding it is out of scope (YAGNI).
Verification is:

- **Per page:** manual responsive check in the dev server at phone / tablet /
  desktop widths, in both light and dark, both densities.
- **Project-wide:** `npm run typecheck`, `npm run lint`, `npm run test` (vitest)
  all green. Existing tests must continue to pass (no logic changes expected).
- **Accessibility:** keyboard-only pass through each page; focus rings visible;
  contrast spot-checks in both themes.
