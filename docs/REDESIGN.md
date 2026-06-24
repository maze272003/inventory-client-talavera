# MotorShop POS — UI/UX Redesign Specification

This document is the single source of truth for the redesigned MotorShop POS
interface. It covers the design system, information architecture, page layouts,
responsive behavior, component spec, roadmap, and POS industry best practices.

> **Guiding principle:** preserve 100% of existing business logic, Convex API
> integrations, and database structure. Only the UI/UX layer changes.

---

## 1. Design direction

A premium, operations-grade POS aesthetic — the feel of Square / Lightspeed /
Shopify POS — not a generic CRUD admin panel. The system serves **motor parts
retail + repair service** workflows, so it must stay fast, high-contrast, and
glanceable during long shifts.

**Four pillars**
1. **Speed first** — every cashier action reachable in ≤ 2 clicks; keyboard-driven POS.
2. **Glanceable** — money/stock figures use tabular numerals; status uses color + icon, never color alone.
3. **Calm density** — generous whitespace on dashboards, compact density on data grids (toggleable).
4. **Consistent system** — one token set, one component library, one motion language.

## 2. Design tokens (the system)

Defined as CSS custom properties in `app/globals.css`, exposed to Tailwind v4 via
`@theme inline` so theme/density toggles apply live.

| Token group | Examples | Notes |
|---|---|---|
| **Color** | `bg`, `surface`, `surface-2/3`, `border`, `border-strong`, `text`, `text-muted`, `text-subtle` | Slate neutral base |
| **Brand/semantic** | `primary` (+ `primary-soft`, `-hover`, `-fg`), `success`, `warning`, `danger`, `info` (each with `-fg`/`-bg`) | Indigo-600 primary |
| **Gradients** | `--gradient-primary`, `--gradient-brand` | Used for brand mark, hero accents, primary CTAs (`bg-brand-gradient`) |
| **Radius** | `sm 4 / md 8 / lg 12 / xl 16` px | |
| **Elevation** | `shadow-xs / sm / md / lg / xl / pop / primary` | Layered, border-first |
| **Layout** | `--topbar-h` (64), `--sidebar-w` (256), `--sidebar-w-collapsed` (76), `--sidebar-w-tablet` (72) | Fixed app shell |
| **Motion** | `--ease-standard`, `--ease-spring`, `--dur-fast/base/slow` | Reduced-motion honored globally |
| **Density** | `[data-density=comfortable|compact]` → row/cell/control heights | Persisted per user |

**Dark mode:** class-based (`.dark` on `<html>`), no-flash script in `<head>`.
**Scrollbars:** thin, themed, auto-hiding.
**Selection:** tinted with primary.

## 3. Component design system

Existing primitives (`components/ui/*`) are retained and extended. **Never**
duplicate a primitive inside a page — always import from `@/components/ui`.

| Primitive | Purpose | Redesign notes |
|---|---|---|
| `Button` | Actions | variants `primary/secondary/ghost/danger`, sizes `sm/md/lg`, `loading`, icons |
| `Card` / `CardHeader` / `CardBody` / `CardFooter` | Surfaces | border-first elevation, `interactive` hover |
| **`StatCard`** *(new)* | KPI tiles | icon chip (tone), label, big tabular value, trend delta badge |
| `PageHeader` | Page title block | now supports `icon`, `eyebrow` (breadcrumb), `actions` |
| `Badge` | Status pills | `neutral/primary/success/warning/danger` |
| `Input` / `Select` / `Textarea` / `Field` / `Label` | Forms | token-styled, `invalid` state |
| `ResponsiveTable` | Data grids | table at `md+`, stacked cards on phone, sticky-ready, row click |
| `Dialog` / `ConfirmDialog` / `Drawer` | Overlays | focus trap, ESC, scroll lock, portaled |
| `EmptyState` | Zero states | icon + title + description + optional action |
| `Skeleton` / `SkeletonText` / `Spinner` | Loading | shimmer placeholders |
| `Toast` (`useToast`) | Notifications | success/error, stacked, auto-dismiss |
| `SegmentedControl` | Toggle groups | date-range presets, metric switches |
| `ConnectionStatus` / `UserMenu` / `Icon` | Chrome | live status, account menu, 90+ icons |

**Iconography:** inline-SVG Lucide-style set (`components/ui/Icon.tsx`),
`currentColor`, no runtime deps. Expanded with commerce + ops icons: `tag,
wallet, credit-card, banknote, percent, scan-line, barcode, store, wrench,
truck, trending-up/down, bell, settings, grid, list, boxes`, etc.

## 4. App shell & layout

`components/layout/AppShell.tsx` — **viewport-locked**, only `<main>` scrolls.

```
┌─────────────┬───────────────────────────────────────┐
│  Sidebar    │  Topbar (fixed, blurred)              │  ← never scroll
│  (fixed)    ├───────────────────────────────────────┤
│             │                                       │
│  Brand      │  <main> … scrollable content … </main>│  ← only this scrolls
│  Nav groups │                                       │
│  User       │                                       │
└─────────────┴───────────────────────────────────────┘
```

- **Sidebar** (`Sidebar.tsx`): collapsible (persisted `localStorage`),
  branded header, grouped nav with section dividers, active state = soft tint
  + left accent bar, hover scale, smooth width transition.
- **Topbar** (`Topbar.tsx`): global quick-search (with `/` shortcut),
  "New Sale" primary CTA, low-stock alert bell (admin), theme toggle, density
  toggle, live connection dot.
- **Responsive:** `lg+` full sidebar; `md` icon rail; `<md` top bar +
  slide-in drawer + thumb-reach bottom tab bar (Dashboard / POS / Receipts).

## 5. Information architecture

```
Sell          Dashboard · Point of Sale · Receipts
Manage        Products · Inventory · Import Invoice · Purchases
Insights      Reports · Audit Log
Admin         Users
```

Role gating unchanged: cashier sees **Sell** only; admin sees all. Links are
filtered by `currentUser.role === "admin"`.

## 6. Page layouts (target)

- **Dashboard** — 4 StatCards (Revenue/Profit/Units/Txns with deltas), revenue
  trend (full width), then 2-col grid: Top Products, Category mix, AOV/Volume,
  Margin %, Cash flow. Footer: Low-stock list + Recent receipts. Quick-action
  shortcuts row.
- **POS** — full-height 2-pane: left = scan box + product tile grid (infinite
  scroll, category chips, stock filter); right = sticky cart + payment panel
  (cash tendered, change, complete). Mobile: bottom-sheet payment. Shortcuts
  `/?/Ctrl+Enter/Ctrl+N/?`.
- **Products** — toolbar (search, category, view toggle, export/print/archive/add),
  premium data grid with photo thumbnails, margin coloring, low-stock badges,
  row actions, infinite scroll.
- **Inventory** — low-stock alert banner + product table with Stock In / Adjust /
  Ledger actions; ledger drawer.
- **Reports** — preset segmented control, StatCards, Top Products + Cashier
  Performance tables, CSV/print export.
- **Receipts** — searchable list, clickable rows → receipt detail; archive/restore.
- **Users** — roster grid, role select, enable/disable, reset password.
- **Audit Log** — filterable timeline (user/action/entity), undo latest.
- **Login** — branded centered card on tinted canvas.

## 7. Responsive behavior

| Breakpoint | Sidebar | Topbar | Content |
|---|---|---|---|
| `<md` (phone) | Drawer + bottom tabs | Hamburger + brand + CTA | single column, `pb-24` clears tabs |
| `md–lg` (tablet) | Icon rail (72px) | Full | 2-col where sensible |
| `≥lg` (desktop) | Collapsible 256/76 | Full | multi-column grids |

Touch targets ≥ 44px; tables become stacked cards below `md`.

## 8. UX patterns

- **Loading:** skeletons on first paint, spinners on actions, `aria-busy`.
- **Empty states:** every list has icon + copy + primary CTA.
- **Destructive actions:** always via `ConfirmDialog`.
- **Feedback:** `useToast()` success/error after every mutation.
- **Numbers:** `.tabular-nums` / `.figure-nums` for all money/qty.
- **Accessibility:** focus rings, `aria-current`, semantic tables, ESC/close,
  reduced-motion honored.

## 9. POS industry best practices applied

1. Cashier home = POS; one tap from login to ringing a sale.
2. Global search + barcode scan as primary add-to-cart paths.
3. Persistent cart total + change-due always visible.
4. Keyboard-first POS (`/`, `Ctrl+Enter`, `Ctrl+N`).
5. Low-stock visibility everywhere (dashboard, topbar bell, inventory).
6. Density toggle for cramped counters vs. back-office.
7. Dark mode for low-light repair bays.
8. Optimistic, bounded queries (pagination/infinite scroll) for large catalogs.

## 10. Implementation roadmap

| Phase | Scope | Status |
|---|---|---|
| **0 — Foundation** | Tokens, icon set, AppShell, Sidebar, Topbar, StatCard, PageHeader | ✅ Done |
| **1 — Sell surface** | Dashboard, POS redesign | In progress (agents) |
| **2 — Catalog ops** | Products, Inventory (incl. import/purchases) redesign | In progress (agents) |
| **3 — Insights & admin** | Reports, Receipts, Users, Audit redesign | In progress (agents) |
| **4 — Auth surface** | Login redesign | In progress (agents) |
| **5 — Polish** | Empty states, skeletons sweep, motion pass, a11y audit | Pending |

## 11. Before → after workflow improvements

| Workflow | Before | After |
|---|---|---|
| Start a sale | Dashboard → click POS → search | Topbar "New Sale" + global `/` search, always one tap away |
| Find low stock | Open Inventory, scroll | Topbar bell badge + dashboard alert + inventory banner |
| Collapse sidebar for counter space | Not possible | One-tap collapse, persisted across shifts |
| Switch density/theme | Buried in user menu | Topbar toggles, persisted |
| Glance KPIs | Plain text values | StatCards with icon + trend delta |
