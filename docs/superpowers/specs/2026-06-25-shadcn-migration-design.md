# shadcn Migration — Design

**Date:** 2026-06-25
**Status:** Approved (design); implementation plan pending

## Summary

Adopt [shadcn/ui](https://ui.shadcn.com) as the component foundation for the
app, themed to the **current** indigo/slate look so there is no visual
regression. This is a **full adoption** done in waves. **Wave 1** (this spec)
covers the foundation plus five surfaces the user named — dashboard, toast
notifications, alerts, validation confirmations, and error-handling messages.
Remaining primitives (Button, Input, Select, Dialog→Sheet, etc.) migrate in
later waves and keep working in the meantime via dual design tokens.

The defining constraint: the existing UI kit is PascalCase
(`components/ui/Card.tsx`, `Skeleton.tsx`, `Dialog.tsx`) with a barrel export at
`components/ui/index.ts`, and Windows has a **case-insensitive filesystem**.
shadcn's CLI generates lowercase files (`card.tsx`, `skeleton.tsx`) that would
collide with the existing files. Therefore we **adapt shadcn source into the
existing PascalCase files, preserving export names and prop shapes** rather than
using the CLI's default lowercase layout. This avoids collisions and keeps the
~30 existing import sites and the barrel intact.

## Goals

- Move the five named surfaces onto shadcn for a more polished, consistent UX.
- Establish the shadcn token system + tooling (`cn`, `components.json`, deps) as
  the foundation for migrating the rest of the kit later.
- **Zero call-site churn** for the named surfaces: `useToast()`, `ConfirmDialog`
  props, `Field` props, and `Card` exports keep their current public APIs.
- No visual regression on un-migrated pages (dual tokens during transition).
- Preserve the existing manual `.dark`-class dark-mode toggle.

## Non-goals (YAGNI)

- Introducing `react-hook-form` / `zod`. Validation stays hand-rolled
  (`validate()` returning a string + `Field error` prop + form-level banners);
  only its *presentation* moves to shadcn.
- Migrating Button / Input / Select / Dialog / Drawer / Badge in Wave 1. They
  remain on the existing custom tokens (kept alive as dual tokens) and migrate
  in a later wave.
- Replacing Recharts. shadcn's chart layer is a theming wrapper over Recharts,
  not a chart library swap.

## Current state (verified)

- **Stack:** Next.js 16, React 19, Tailwind **v4** (`@import "tailwindcss"`,
  `@theme inline`, `@custom-variant dark`). No `components.json`, no shadcn, no
  `clsx`/`tailwind-merge`/`cva`/`sonner`.
- **Tokens:** `app/globals.css` defines a semantic custom token set on `:root`
  with `.dark` overrides — e.g. `--color-bg`, `--color-surface`,
  `--color-text`, `--color-text-muted`, `--color-primary`, `--color-success`,
  `--color-danger`, `--color-ring`, radius/shadow/z-index scales. Exposed to
  utilities as `bg-surface`, `text-text-muted`, `border-success`, etc.
- **`cn`:** `components/ui/cn.ts` is a dependency-free join (no tailwind-merge).
- **Toast:** `components/ui/Toast.tsx` — React context `ToastProvider` +
  `useToast()` returning `{ toast, success, error, info, warning, dismiss }`;
  portal-rendered; `duration` (default 4000, `0` = manual dismiss); variants
  `info | success | warning | danger`. **16 call sites** use `useToast()`.
- **Confirm:** `components/ui/ConfirmDialog.tsx` wraps the custom `Dialog` +
  `Button`; props `{ open, onClose, onConfirm, title, description, confirmLabel,
  cancelLabel, confirmVariant, loading }`; async-confirm with loading state.
  **5 call sites** (audit, purchases, products, receipts, users).
- **Field/validation:** `components/ui/Field.tsx` wires label/hint/error +
  ARIA (`aria-invalid`, `aria-describedby`); error rendered as
  `text-xs text-danger` with `role="alert"`. `ProductForm.tsx` is
  representative: a `validate()` string-returning function, a `useState` error,
  and a form-level `{error && …}` banner.
- **Error boundary:** `components/ui/ErrorBoundary.tsx` — class component with a
  friendly fallback card (custom Icon + Retry button).
- **Dashboard:** `components/dashboard/charts/*` (Recharts via `ChartFrame`,
  `chartTheme.ts`), `StatCard`, `Card`, `PageHeader`, `Skeleton`, `EmptyState`.

## Architecture & approach

### Token bridge (full adoption, no regression)

`globals.css` gains the standard shadcn token names on `:root` and `.dark`,
mapped to the existing palette:

| shadcn token        | maps to (existing)                    |
|---------------------|---------------------------------------|
| `--background`      | `--color-bg`                          |
| `--foreground`      | `--color-text`                        |
| `--card`            | `--color-surface`                     |
| `--card-foreground` | `--color-text`                        |
| `--popover`         | `--color-surface`                     |
| `--primary`         | `--color-primary`                     |
| `--primary-foreground` | `--color-primary-fg`               |
| `--secondary`       | `--color-surface-2`                   |
| `--muted`           | `--color-surface-2`                   |
| `--muted-foreground`| `--color-text-muted`                  |
| `--accent`          | `--color-surface-2`                   |
| `--destructive`     | `--color-danger`                      |
| `--border`          | `--color-border`                      |
| `--input`           | `--color-border`                      |
| `--ring`            | `--color-ring`                        |
| `--radius`          | `--radius-md` (0.5rem)                |
| `--chart-1..5`      | primary / success / warning / info / danger |
| `--sidebar*`        | surface/border/text equivalents       |

Existing `--color-*` tokens and their utilities (`bg-surface`, etc.) **remain**
so un-migrated components keep rendering. Both token sets are registered through
`@theme inline`. Dark values are added to the existing `html.dark` block.

### Tooling foundation

- Add deps: `clsx`, `tailwind-merge`, `class-variance-authority`, `sonner`,
  `tw-animate-css`, and `@radix-ui/react-alert-dialog` (+ any Radix packages the
  Wave-1 components need). `lucide-react` only if a migrated component needs it;
  the existing custom `Icon` stays the default.
- `lib/utils.ts` exports the canonical `cn` (clsx + tailwind-merge).
  `components/ui/cn.ts` is rewritten to **re-export** `cn` from `lib/utils` so
  every current `./cn` importer keeps working unchanged.
- `components.json`: style "new-york", Tailwind v4, RSC true, aliases
  `@/components` and `@/lib/utils`, `cssVariables: true`. Used for config/
  reference; components are hand-placed into PascalCase files (see constraint).
- `tw-animate-css` imported in `globals.css` for Radix enter/exit animations.

### Wave 1 — named surfaces

1. **Toasts → Sonner.** Mount `<Toaster richColors closeButton />` in
   `app/layout.tsx` (replacing `ToastProvider`). Rewrite `useToast()` as a thin
   shim returning the same `{ toast, success, error, info, warning, dismiss }`
   API, implemented over `sonner`:
   - `success/error/info/warning(title, description)` → `toast.success/error/…`
     with `{ description }`.
   - `variant: "danger"` → `toast.error`; map `info/success/warning` accordingly.
   - `duration: 0` → `Infinity`; default stays 4000.
   - `dismiss(id)` → `toast.dismiss(id)`; `toast()` returns the Sonner id.
   All **16 call sites unchanged**. The old portal/context implementation is
   removed from `Toast.tsx`; the file now exports the shim + a no-op/passthrough
   `ToastProvider` (or the provider export is dropped and `layout.tsx` uses
   `<Toaster/>` directly — decided in the plan).

2. **Alerts → shadcn `Alert`.** Add an `Alert`/`AlertTitle`/`AlertDescription`
   implementation (in a PascalCase file, exported from the barrel). Replace
   ad-hoc inline error banners — starting with `ProductForm`'s `{error && …}` —
   with `<Alert variant="destructive">`. Inventory all inline banner sites and
   convert them.

3. **Validation confirmations → `AlertDialog`.** Rebuild `ConfirmDialog` on
   `@radix-ui/react-alert-dialog`, **keeping its exact props** (`open`,
   `onClose`, `onConfirm` async + `loading`, `title`, `description`,
   `confirmLabel`, `cancelLabel`, `confirmVariant`). 5 call sites unchanged.

4. **Field validation messages.** Restyle `Field`'s error/hint text to shadcn
   FormMessage conventions (`text-destructive` / `text-muted-foreground`),
   keeping all ARIA wiring and the `error: string` API.

5. **Error handling → `ErrorBoundary`.** Restyle the fallback with shadcn
   `Alert` + Button + icon, keeping the class-component API
   (`fallback`, `onError`, `reset`). Optionally add an `app/(app)/error.tsx`
   route-level boundary (decided in the plan).

### Wave 1 — dashboard (all options selected)

- **Cards/StatCards.** Rebuild `Card` (+`CardHeader`/`CardContent`/`CardFooter`,
  with `CardBody` kept as an alias for `CardContent`), `StatCard`, `PageHeader`,
  and `ChartFrame`'s shell on shadcn `Card`. Barrel exports unchanged.
- **Chart theming wrapper.** Wrap Recharts charts in shadcn `ChartContainer` +
  `ChartTooltip`/`ChartTooltipContent` + `ChartLegend`, sourcing series colors
  from `--chart-1..5`. Existing chart components keep their data/props.
- **Skeletons & empty states.** `Skeleton` → shadcn Skeleton; `EmptyState`
  restyled to shadcn tokens.

## Data flow & interfaces (isolation)

Public surfaces are frozen so consumers don't change:

- `useToast()` → same return shape (shim over Sonner).
- `ConfirmDialog` → same props.
- `Field` → same props (`label`, `hint`, `error`, `required`).
- `Card` family → same exports (`Card`, `CardHeader`, `CardBody`, `CardFooter`).
- `ErrorBoundary` → same class API.

Internals (Radix/Sonner) are swappable behind these without touching pages.

## Error handling

- Toast: Sonner's own queue; `richColors` for variant color, `closeButton` for
  manual dismiss; `duration: Infinity` preserves the old "sticky" behavior.
- Confirm: Radix AlertDialog blocks dismissal while `loading` (no overlay/Esc
  close mid-action), matching current `dismissable={!loading}`.
- Render errors: `ErrorBoundary` fallback + optional route `error.tsx`.
- Form errors: inline `Field error` + form-level `<Alert variant="destructive">`.

## Testing & verification

- `tsc` typecheck, `eslint`, `next build` all green.
- Existing vitest suites (`csv`, `dateRange`, `parseInvoice`) unaffected.
- Manual visual QA in **light and dark** for each surface: toast variants
  (incl. sticky/`duration:0`), confirm dialog async loading + blocked dismiss,
  form validation (inline + banner), error boundary fallback, dashboard cards /
  charts / skeleton / empty states.

## Risks & mitigations

- **Windows case collisions** — mitigated by adapting shadcn into PascalCase
  files instead of CLI lowercase layout.
- **Two token systems during transition** — intentional and temporary; both
  registered via `@theme inline`; later waves retire the custom set.
- **Tailwind v4 animation** — use `tw-animate-css`, not the v3-era
  `tailwindcss-animate`.
- **Sonner visual match** — tune via `richColors` + `<Toaster>` theming props to
  match the current toast look.
- **`cn` semantics change** — moving to tailwind-merge can alter class
  precedence; smoke-test migrated components for unexpected class wins.

## Rollout

Single Wave-1 branch/PR. Foundation first (deps, `cn`, `components.json`,
tokens), then surfaces, then dashboard, then full verification pass. Later waves
(remaining primitives) are out of scope here and tracked separately.
