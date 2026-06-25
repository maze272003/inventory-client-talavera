# shadcn Migration (Wave 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt shadcn/ui as the component foundation — themed to the current indigo/slate look — and migrate toast notifications, alerts, validation confirmations, error-handling messages, and the dashboard onto it, with zero public-API churn.

**Architecture:** A **token bridge** exposes shadcn's standard token names (`bg-background`, `text-muted-foreground`, `bg-destructive`, …) as additive aliases inside the existing Tailwind v4 `@theme inline` block, each pointing at an existing `--color-*` raw variable. Because those raw variables already flip in `html.dark`, shadcn components inherit the current light/dark palette automatically. shadcn component source is **adapted into the existing PascalCase files and barrel** (not the CLI's lowercase layout) to avoid Windows case-insensitive collisions and keep ~30 import sites intact. Public surfaces (`useToast`, `ConfirmDialog`, `Field`, `Card`, `ErrorBoundary`) keep their exact APIs; internals swap to Sonner / Radix / shadcn.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, TypeScript. New deps: `clsx`, `tailwind-merge`, `class-variance-authority`, `sonner`, `tw-animate-css`, `@radix-ui/react-alert-dialog`, `lucide-react`.

## Global Constraints

- **Filesystem is case-insensitive (Windows).** Never create a lowercase file whose name collides with an existing PascalCase one (`card.tsx` vs `Card.tsx`). Adapt shadcn source into the existing PascalCase files; place genuinely new components in PascalCase (`Alert.tsx`, `AlertDialog.tsx`, `Chart.tsx`).
- **Zero public-API churn.** `useToast()` returns `{ toast, success, error, info, warning, dismiss }`. `ConfirmDialog` props, `Field` props, `Card`/`CardHeader`/`CardBody`/`CardFooter` exports, and the `ErrorBoundary` class API are frozen.
- **No visual regression** on un-migrated pages. The existing `--color-*` tokens and their utilities (`bg-surface`, `text-text-muted`, …) stay; shadcn tokens are added alongside.
- **Dark mode is the manual `.dark` class** (via `@/components/ThemeProvider`, `useTheme()` → `{ theme: "light" | "dark" }`). Not next-themes, not `prefers-color-scheme`.
- **No new validation library.** Keep hand-rolled `validate()` + `Field error` + form banners; only restyle.
- **Tailwind v4 animations** come from `tw-animate-css`, never `tailwindcss-animate`.
- **Verification per task:** `npm run typecheck` and `npm run lint` must pass; `npm run test` stays green. Exact versions to pin: `sonner@^2.0.7`, `class-variance-authority@^0.7.1`, `tailwind-merge@^3.6.0`, `clsx@^2.1.1`, `tw-animate-css@^1.4.0`, `@radix-ui/react-alert-dialog@^1.1.17`, `lucide-react@^0.21x` (latest 0.x).
- **Commit after every task** with the message shown in its final step.

---

## File Structure

**Foundation**
- Create `lib/utils.ts` — canonical `cn` (clsx + tailwind-merge).
- Modify `components/ui/cn.ts` — re-export `cn`/`ClassValue` from `lib/utils`.
- Create `components.json` — shadcn config (reference/tooling only).
- Modify `app/globals.css` — `@import "tw-animate-css"` + shadcn token aliases in `@theme inline`.

**Surfaces**
- Modify `components/ui/Toast.tsx` — Sonner-backed `ToastProvider` (renders `<Toaster/>`) + `useToast` shim; extract pure `toToastArgs` mapping.
- Create `lib/toast.ts` + `lib/toast.test.ts` — pure variant→Sonner mapping + unit test.
- Modify `app/layout.tsx` — `ToastProvider` still wraps the app (now mounts the Sonner Toaster).
- Create `components/ui/Alert.tsx` — shadcn Alert (default + destructive).
- Modify banner sites: `components/ProductForm.tsx`, `components/AdjustDialog.tsx`, `components/StockInDialog.tsx`, `app/(app)/pos/page.tsx`, `app/login/page.tsx`, `app/(app)/inventory/import/page.tsx`.
- Create `components/ui/AlertDialog.tsx` — Radix AlertDialog primitives.
- Modify `components/ui/ConfirmDialog.tsx` — rebuilt on AlertDialog, same props.
- Modify `components/ui/Field.tsx` — shadcn message styling.
- Modify `components/ui/ErrorBoundary.tsx` — shadcn Alert + Button fallback.

**Dashboard**
- Modify `components/ui/Card.tsx`, `components/ui/Skeleton.tsx`, `components/ui/EmptyState.tsx`, `components/ui/StatCard.tsx` — shadcn token classes.
- Create `components/dashboard/charts/Chart.tsx` — shadcn chart primitives.
- Modify the 6 chart components + `chartTheme.ts` — shadcn ChartContainer/ChartTooltip/ChartLegend.

**Barrel**
- Modify `components/ui/index.ts` — export `Alert`, `AlertDialog` primitives.

---

## Task 1: Foundation — `cn` utility + dependencies

**Files:**
- Create: `lib/utils.ts`
- Modify: `components/ui/cn.ts`
- Modify: `package.json` (via npm install)

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` from `@/lib/utils` and (re-exported) `@/components/ui/cn`; `ClassValue` type. Behavior change vs old `cn`: conflicting Tailwind classes are now resolved by `tailwind-merge` (last wins).

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install clsx@^2.1.1 tailwind-merge@^3.6.0 class-variance-authority@^0.7.1 sonner@^2.0.7 @radix-ui/react-alert-dialog@^1.1.17 lucide-react
npm install -D tw-animate-css@^1.4.0
```
Expected: installs succeed, `package.json` updated.

- [ ] **Step 2: Create the canonical `cn`**

Create `lib/utils.ts`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names with clsx semantics, then resolve conflicting Tailwind
 * utilities with tailwind-merge (last value wins). Standard shadcn helper.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type { ClassValue };
```

- [ ] **Step 3: Re-export from the existing `cn` module (no call-site churn)**

Replace the entire contents of `components/ui/cn.ts` with:
```ts
/**
 * Backward-compatible alias. The canonical implementation now lives in
 * `@/lib/utils` (clsx + tailwind-merge). Existing `./cn` importers keep working.
 */
export { cn, type ClassValue } from "@/lib/utils";
```

- [ ] **Step 4: Verify typecheck + lint pass**

Run: `npm run typecheck && npm run lint`
Expected: PASS (no errors). `ClassValue` is now clsx's superset type; all existing `cn("a", cond && "b", className)` calls remain valid.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json lib/utils.ts components/ui/cn.ts
git commit -m "feat(ui): add shadcn deps + clsx/tailwind-merge cn utility"
```

---

## Task 2: Foundation — token bridge + `components.json`

**Files:**
- Create: `components.json`
- Modify: `app/globals.css` (add `@import "tw-animate-css"` after the tailwind import; append shadcn aliases inside the existing `@theme inline { … }` block, before its closing `}` near line 227)

**Interfaces:**
- Produces: shadcn utility classes resolve to the current palette — `bg-background`, `bg-card`, `text-card-foreground`, `bg-popover`, `text-popover-foreground`, `bg-primary`, `text-primary-foreground`, `bg-secondary`, `text-secondary-foreground`, `bg-muted`, `text-muted-foreground`, `bg-accent`, `text-accent-foreground`, `bg-destructive`, `text-destructive`, `text-destructive-foreground`, `border` (existing), `bg-input`, `border-input`, `ring-ring` (existing), `bg-chart-1..5`/`text-chart-1..5`/`stroke`/`fill` via `--color-chart-1..5`.

- [ ] **Step 1: Add the animation import**

In `app/globals.css`, the first line is `@import "tailwindcss";`. Add immediately below it:
```css
@import "tw-animate-css";
```

- [ ] **Step 2: Append shadcn token aliases inside `@theme inline`**

In `app/globals.css`, inside the existing `@theme inline { … }` block (it starts at `@theme inline {` ~line 170 and closes with `}` ~line 227), add the following just before that closing `}` (after the existing `--color-info-bg: …;` lines):
```css
  /* ── shadcn/ui token aliases — map shadcn's standard names onto the
     existing --color-* raw vars. Because those raw vars already flip in
     html.dark, shadcn components inherit light/dark automatically. ── */
  --color-background: var(--color-bg);
  --color-foreground: var(--color-text);
  --color-card: var(--color-surface);
  --color-card-foreground: var(--color-text);
  --color-popover: var(--color-surface);
  --color-popover-foreground: var(--color-text);
  --color-primary-foreground: var(--color-primary-fg);
  --color-secondary: var(--color-surface-2);
  --color-secondary-foreground: var(--color-text);
  --color-muted: var(--color-surface-2);
  --color-muted-foreground: var(--color-text-muted);
  --color-accent: var(--color-surface-2);
  --color-accent-foreground: var(--color-text);
  --color-destructive: var(--color-danger);
  --color-destructive-foreground: var(--color-danger-fg);
  --color-input: var(--color-border);

  /* Chart series — reuse semantic tokens so charts also follow dark mode. */
  --color-chart-1: var(--color-primary);
  --color-chart-2: var(--color-success);
  --color-chart-3: var(--color-warning);
  --color-chart-4: var(--color-info);
  --color-chart-5: var(--color-danger);
```
Note: `--color-primary`, `--color-border`, `--color-ring` already exist in the block and are reused as shadcn `primary`/`border`/`ring` — do not duplicate them.

- [ ] **Step 3: Create `components.json`**

Create `components.json`:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "utils": "@/lib/utils",
    "lib": "@/lib",
    "hooks": "@/lib"
  }
}
```

- [ ] **Step 4: Verify the app builds and renders unchanged**

Run: `npm run build`
Expected: build succeeds. Then `npm run dev:frontend`, open the dashboard, toggle dark mode — existing pages look identical (aliases point at the same values). No console errors.

- [ ] **Step 5: Commit**

```bash
git add components.json app/globals.css
git commit -m "feat(ui): token bridge — shadcn token aliases over existing palette"
```

---

## Task 3: Toasts → Sonner (shim preserves `useToast`)

**Files:**
- Create: `lib/toast.ts`
- Create: `lib/toast.test.ts`
- Modify: `components/ui/Toast.tsx`
- Modify: `app/layout.tsx` (no functional change — confirm `ToastProvider` import still resolves)

**Interfaces:**
- Consumes: `useTheme` from `@/components/ThemeProvider` (`{ theme: "light" | "dark" }`); `toast` from `sonner`.
- Produces: `toToastArgs(opts: ToastOptions): { method: "success"|"error"|"info"|"warning"|"message"; message: string; data: { description?: string; duration?: number } }` (pure, from `lib/toast.ts`). `useToast(): { toast, success, error, info, warning, dismiss }` (shim). `ToastProvider({children})` mounts the Sonner `<Toaster/>`. Same `ToastOptions`/`ToastVariant` types.

- [ ] **Step 1: Write the failing unit test for the pure mapping**

Create `lib/toast.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { toToastArgs } from "./toast";

describe("toToastArgs", () => {
  it("maps danger variant to the error method", () => {
    const r = toToastArgs({ title: "Boom", description: "bad", variant: "danger" });
    expect(r.method).toBe("error");
    expect(r.message).toBe("Boom");
    expect(r.data.description).toBe("bad");
  });

  it("maps success/info/warning variants to matching methods", () => {
    expect(toToastArgs({ title: "a", variant: "success" }).method).toBe("success");
    expect(toToastArgs({ title: "a", variant: "info" }).method).toBe("info");
    expect(toToastArgs({ title: "a", variant: "warning" }).method).toBe("warning");
  });

  it("defaults to info when no variant is given", () => {
    expect(toToastArgs({ title: "a" }).method).toBe("info");
  });

  it("translates duration 0 to Infinity (sticky) and passes other durations through", () => {
    expect(toToastArgs({ title: "a", duration: 0 }).data.duration).toBe(Infinity);
    expect(toToastArgs({ title: "a", duration: 6000 }).data.duration).toBe(6000);
  });

  it("falls back to an empty message when title is absent", () => {
    expect(toToastArgs({ description: "only desc" }).message).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run lib/toast.test.ts`
Expected: FAIL — `Failed to resolve import "./toast"` / `toToastArgs is not a function`.

- [ ] **Step 3: Implement the pure mapping**

Create `lib/toast.ts`:
```ts
/**
 * Pure mapping from the app's ToastOptions to Sonner call arguments.
 * Kept framework-free so it is unit-testable without a DOM.
 */
export type ToastVariant = "info" | "success" | "warning" | "danger";

export type ToastOptions = {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  /** Auto-dismiss after ms. Default 4000 (applied at call site). 0 = sticky. */
  duration?: number;
};

type SonnerMethod = "success" | "error" | "info" | "warning" | "message";

const VARIANT_METHOD: Record<ToastVariant, SonnerMethod> = {
  info: "info",
  success: "success",
  warning: "warning",
  danger: "error",
};

export function toToastArgs(opts: ToastOptions): {
  method: SonnerMethod;
  message: string;
  data: { description?: string; duration?: number };
} {
  const method = VARIANT_METHOD[opts.variant ?? "info"];
  const duration =
    opts.duration === undefined
      ? undefined
      : opts.duration <= 0
        ? Infinity
        : opts.duration;
  return {
    method,
    message: opts.title ?? "",
    data: { description: opts.description, duration },
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run lib/toast.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Rewrite `components/ui/Toast.tsx` as a Sonner-backed shim**

Replace the entire contents of `components/ui/Toast.tsx` with:
```tsx
"use client";

import type { ReactNode } from "react";
import { Toaster as SonnerToaster, toast as sonner } from "sonner";
import { useTheme } from "@/components/ThemeProvider";
import { toToastArgs, type ToastOptions, type ToastVariant } from "@/lib/toast";

export type { ToastOptions, ToastVariant };

type ToastId = string | number;

type ToastApi = {
  toast: (opts: ToastOptions) => ToastId;
  success: (title: string, description?: string) => ToastId;
  error: (title: string, description?: string) => ToastId;
  info: (title: string, description?: string) => ToastId;
  warning: (title: string, description?: string) => ToastId;
  dismiss: (id?: ToastId) => void;
};

function push(opts: ToastOptions): ToastId {
  const { method, message, data } = toToastArgs(opts);
  return sonner[method](message, data);
}

/**
 * Backward-compatible toast API, now backed by Sonner. The hook no longer needs
 * a React context (Sonner is a global singleton), but the signature is frozen
 * so all existing call sites keep working unchanged.
 *
 *   const { success, error } = useToast();
 *   success("Sale complete", "Receipt #1042 saved");
 */
export function useToast(): ToastApi {
  return {
    toast: push,
    success: (title, description) =>
      push({ title, description, variant: "success" }),
    error: (title, description) =>
      push({ title, description, variant: "danger" }),
    info: (title, description) => push({ title, description, variant: "info" }),
    warning: (title, description) =>
      push({ title, description, variant: "warning" }),
    dismiss: (id) => sonner.dismiss(id),
  };
}

/**
 * Mounts the Sonner toaster, themed off the app's manual .dark toggle, with
 * rich colors so success/error/warning render with semantic accents. Kept as
 * `ToastProvider` so app/layout.tsx wiring is unchanged.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <>
      {children}
      <SonnerToaster
        theme={theme}
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{ duration: 4000 }}
      />
    </>
  );
}

export default ToastProvider;
```

- [ ] **Step 6: Confirm layout + barrel still resolve**

`app/layout.tsx` already imports `{ ToastProvider } from "@/components/ui"` and wraps children — no change needed. `components/ui/index.ts` already re-exports `ToastProvider, useToast` and the `ToastOptions`/`ToastVariant` types from `./Toast` — still valid.

- [ ] **Step 7: Verify typecheck, lint, tests, and a manual toast**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: PASS. Then `npm run dev:frontend`: trigger a success toast (e.g. add a product) and an error toast (submit an invalid action) in both light and dark — colors match variant, auto-dismiss after 4s, close button works.

- [ ] **Step 8: Commit**

```bash
git add lib/toast.ts lib/toast.test.ts components/ui/Toast.tsx
git commit -m "feat(ui): back useToast with Sonner (shim, zero call-site churn)"
```

---

## Task 4: Alert component + convert inline banners

**Files:**
- Create: `components/ui/Alert.tsx`
- Modify: `components/ui/index.ts` (export Alert)
- Modify: `components/ProductForm.tsx:342-349`, `components/AdjustDialog.tsx:112-117`, `components/StockInDialog.tsx:161-166`, `app/(app)/pos/page.tsx:222-227`, `app/login/page.tsx:169-175`, `app/(app)/inventory/import/page.tsx` (the `role="alert"` danger banners ~lines 385 and 566)

**Interfaces:**
- Produces: `Alert`, `AlertTitle`, `AlertDescription` from `@/components/ui`. `Alert` props: `React.ComponentProps<"div"> & { variant?: "default" | "destructive" }`.

- [ ] **Step 1: Create the Alert component**

Create `components/ui/Alert.tsx`:
```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive:
          "text-destructive bg-card [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Export from the barrel**

In `components/ui/index.ts`, add after the `ConfirmDialog` export block:
```ts
export { Alert, AlertTitle, AlertDescription } from "./Alert";
```

- [ ] **Step 3: Convert the ProductForm banner**

In `components/ProductForm.tsx`, ensure `Alert`/`AlertTitle`/`AlertDescription` and `Icon` are imported from `@/components/ui` (add to the existing import). Replace the block at lines 342-349:
```tsx
        {error && (
          <p
            role="alert"
            className="text-sm text-danger-fg bg-danger-bg border border-danger-fg/20 rounded-md px-3 py-2"
          >
            {error}
          </p>
        )}
```
with:
```tsx
        {error && (
          <Alert variant="destructive">
            <Icon name="alert-triangle" size={16} />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
```

- [ ] **Step 4: Convert the AdjustDialog banner**

In `components/AdjustDialog.tsx`, add `Alert`, `AlertDescription`, `Icon` to the `@/components/ui` import. Replace the block at lines 112-117 (the `{error && (… className="text-sm text-danger-fg bg-danger-bg rounded-lg px-cell py-2" …)}`) with:
```tsx
        {error && (
          <Alert variant="destructive">
            <Icon name="alert-triangle" size={16} />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
```

- [ ] **Step 5: Convert the StockInDialog banner**

In `components/StockInDialog.tsx`, add `Alert`, `AlertDescription`, `Icon` to the `@/components/ui` import. Replace the block at lines 161-166 (the analogous `{error && (… bg-danger-bg …)}`) with:
```tsx
        {error && (
          <Alert variant="destructive">
            <Icon name="alert-triangle" size={16} />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
```

- [ ] **Step 6: Convert the POS banner**

In `app/(app)/pos/page.tsx`, add `Alert`, `AlertDescription`, `Icon` to the `@/components/ui` import. Replace the block at lines 222-227 (`{error && (<div role="alert" className="… bg-danger-bg …">…</div>)}`) with:
```tsx
      {error && (
        <Alert variant="destructive">
          <Icon name="alert-triangle" size={16} />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
```

- [ ] **Step 7: Convert the login banner**

In `app/login/page.tsx`, add `Alert`, `AlertDescription`, `Icon` to the `@/components/ui` import. Replace the block at lines 169-175 (`{error && (<div role="alert" className="… bg-danger-bg …">…</div>)}`) with:
```tsx
                {error && (
                  <Alert variant="destructive">
                    <Icon name="alert-triangle" size={16} />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
```

- [ ] **Step 8: Convert the two import-page banners**

In `app/(app)/inventory/import/page.tsx`, add `Alert`, `AlertDescription`, `Icon` to the `@/components/ui` import. There are two danger banners using `role="alert"` + `className="… border-danger bg-danger-bg px-3 py-2 text-sm text-danger-fg"` (around lines 385 and 566). For each, replace the `<div role="alert" className="…">{message}</div>` wrapper with:
```tsx
<Alert variant="destructive">
  <Icon name="alert-triangle" size={16} />
  <AlertDescription>{/* keep the existing inner message expression */}</AlertDescription>
</Alert>
```
Preserve whatever message/JSX was inside the original `<div>` as the `AlertDescription` children. Leave the line-423 block as-is if it is not a destructive error banner (only convert the two `bg-danger-bg` error banners).

- [ ] **Step 9: Verify**

Run: `npm run typecheck && npm run lint`
Expected: PASS. Then in `npm run dev:frontend`: trigger a validation error in the Product drawer and a failed login — the banner renders as a shadcn destructive Alert with the triangle icon, in light and dark.

- [ ] **Step 10: Commit**

```bash
git add components/ui/Alert.tsx components/ui/index.ts components/ProductForm.tsx components/AdjustDialog.tsx components/StockInDialog.tsx "app/(app)/pos/page.tsx" app/login/page.tsx "app/(app)/inventory/import/page.tsx"
git commit -m "feat(ui): shadcn Alert + convert inline error banners"
```

---

## Task 5: Validation confirmations → AlertDialog (ConfirmDialog rebuilt)

**Files:**
- Create: `components/ui/AlertDialog.tsx`
- Modify: `components/ui/ConfirmDialog.tsx`
- Modify: `components/ui/index.ts` (export AlertDialog primitives)

**Interfaces:**
- Consumes: `@radix-ui/react-alert-dialog`, existing `Button` from `./Button`, `cn` from `@/lib/utils`.
- Produces: `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogCancel`, `AlertDialogAction`, `AlertDialogOverlay`, `AlertDialogPortal`. `ConfirmDialog` keeps its exact existing props (`open`, `onClose`, `onConfirm`, `title`, `description`, `confirmLabel`, `cancelLabel`, `confirmVariant`, `loading`).

- [ ] **Step 1: Create the AlertDialog primitives**

Create `components/ui/AlertDialog.tsx`:
```tsx
"use client";

import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { cn } from "@/lib/utils";

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.Action;

export function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

export function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-popover text-popover-foreground p-6 shadow-lg sm:max-w-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

export function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

export function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      className={cn("text-lg font-semibold text-text", className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Rebuild ConfirmDialog on AlertDialog (same props, async-safe)**

Replace the entire contents of `components/ui/ConfirmDialog.tsx` with:
```tsx
"use client";

import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "./AlertDialog";
import { Button } from "./Button";
import type { ButtonVariant } from "./Button";

export type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Called when the user confirms. May be async; button shows loading. */
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Confirm button variant. Default "danger" for destructive intent. */
  confirmVariant?: ButtonVariant;
  /** Show loading on the confirm button (caller-controlled). */
  loading?: boolean;
};

/**
 * Destructive-confirmation dialog built on Radix AlertDialog. Dismissal
 * (overlay click / Esc) is blocked while `loading` so an in-flight action is
 * never interrupted. Props are unchanged from the previous implementation.
 *
 * <ConfirmDialog open={open} onClose={close} onConfirm={archive}
 *   title="Archive product?" description="It will be hidden from the catalog."
 *   confirmLabel="Archive" loading={busy} />
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "danger",
  loading = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !loading) onClose();
      }}
    >
      <AlertDialogContent
        onEscapeKeyDown={(e) => {
          if (loading) e.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={() => void onConfirm()}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConfirmDialog;
```
Note: the confirm/cancel buttons are the app's own `Button` (not Radix `AlertDialogAction`/`Cancel`), so clicking confirm does NOT auto-close — the parent closes by flipping `open` after the async work, exactly as today.

- [ ] **Step 3: Export AlertDialog primitives from the barrel**

In `components/ui/index.ts`, add after the new `Alert` export:
```ts
export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "./AlertDialog";
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`
Expected: PASS. Then in `npm run dev:frontend`, exercise each of the 5 ConfirmDialog call sites (audit, purchases, products, receipts, users): confirm fires the action, the button shows loading, overlay/Esc dismissal is blocked while loading, and Cancel closes. Check light and dark.

- [ ] **Step 5: Commit**

```bash
git add components/ui/AlertDialog.tsx components/ui/ConfirmDialog.tsx components/ui/index.ts
git commit -m "feat(ui): rebuild ConfirmDialog on shadcn AlertDialog (same API)"
```

---

## Task 6: Field validation messages → shadcn styling

**Files:**
- Modify: `components/ui/Field.tsx:66-74`

**Interfaces:**
- Consumes: nothing new. Produces: unchanged `Field` API; error text uses `text-destructive`, hint uses `text-muted-foreground`.

- [ ] **Step 1: Restyle the message block**

In `components/ui/Field.tsx`, replace the trailing message block (lines 66-74):
```tsx
      {error ? (
        <p id={errorId} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
```
with:
```tsx
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-xs font-medium text-destructive"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: PASS. In `npm run dev:frontend`, submit the Product drawer with an empty required field — the inline message shows in destructive color; ARIA wiring unchanged. Check dark mode.

- [ ] **Step 3: Commit**

```bash
git add components/ui/Field.tsx
git commit -m "feat(ui): Field messages use shadcn destructive/muted tokens"
```

---

## Task 7: Error handling → shadcn ErrorBoundary fallback

**Files:**
- Modify: `components/ui/ErrorBoundary.tsx:39-66`

**Interfaces:**
- Consumes: existing `Icon` (kept). Produces: unchanged `ErrorBoundary` class API; fallback rendered with shadcn `bg-destructive/10`, `text-destructive`, shadcn button classes.

- [ ] **Step 1: Restyle the default fallback**

In `components/ui/ErrorBoundary.tsx`, replace the default-fallback JSX (the `return (<div className="flex flex-col items-center …">…</div>)` block at lines 43-65) with:
```tsx
      return (
        <div className="flex flex-col items-center justify-center text-center gap-3 px-6 py-12">
          <span className="flex items-center justify-center h-12 w-12 rounded-full bg-destructive/10 text-destructive">
            <Icon name="alert-triangle" size={24} />
          </span>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              Something went wrong
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {error.message || "An unexpected error occurred while rendering."}
            </p>
          </div>
          <button
            type="button"
            onClick={this.reset}
            className="inline-flex items-center gap-2 h-11 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Icon name="refresh" size={16} />
            Try again
          </button>
        </div>
      );
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: PASS. Optionally force a render error in a wrapped route to see the fallback; confirm Retry resets and colors are correct in light and dark.

- [ ] **Step 3: Commit**

```bash
git add components/ui/ErrorBoundary.tsx
git commit -m "feat(ui): ErrorBoundary fallback uses shadcn tokens"
```

---

## Task 8: Dashboard — Card / Skeleton / EmptyState / StatCard on shadcn tokens

**Files:**
- Modify: `components/ui/Card.tsx`
- Modify: `components/ui/Skeleton.tsx:31-35`
- Modify: `components/ui/EmptyState.tsx:37,41,43`
- Modify: `components/ui/StatCard.tsx:85,106,112,117`

**Interfaces:**
- Produces: unchanged exports `Card`, `CardHeader`, `CardBody`, `CardFooter` (+ `CardProps`, `interactive`); unchanged `Skeleton`/`SkeletonText`; unchanged `EmptyState`; unchanged `StatCard`. Only token classes change.

- [ ] **Step 1: Rebuild Card on shadcn tokens (keep all exports + `interactive` + CardBody)**

Replace the entire contents of `components/ui/Card.tsx` with:
```tsx
import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Adds hover elevation + pointer affordance for clickable cards. */
  interactive?: boolean;
};

/**
 * Surface container on shadcn's card tokens. Compose with CardHeader /
 * CardBody / CardFooter, or drop children directly.
 *
 * <Card><CardBody>…</CardBody></Card>
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground border border-border rounded-lg shadow-sm",
        interactive &&
          "transition-shadow hover:shadow-md cursor-pointer focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
      {...rest}
    />
  );
});

export function CardHeader({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "px-cell py-row border-b border-border flex items-center justify-between gap-3",
        className,
      )}
      {...rest}
    />
  );
}

export function CardBody({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot="card-content" className={cn("p-cell", className)} {...rest} />
  );
}

export function CardFooter({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "px-cell py-row border-t border-border flex items-center justify-end gap-2",
        className,
      )}
      {...rest}
    />
  );
}

export default Card;
```
(`bg-surface`→`bg-card`, plus `text-card-foreground` and `data-slot` attributes; spacing/border preserved so layout is identical.)

- [ ] **Step 2: Skeleton on shadcn token**

In `components/ui/Skeleton.tsx`, in the `Skeleton` function's `cn(...)`, change `"animate-pulse bg-surface-2"` to `"animate-pulse bg-accent"`. Leave everything else unchanged.

- [ ] **Step 3: EmptyState on shadcn tokens**

In `components/ui/EmptyState.tsx`: change the icon chip span class `"… bg-surface-2 text-text-muted"` to `"… bg-muted text-muted-foreground"`; change the title `h3` class `text-text` to `text-foreground`; change the description `p` class `text-text-muted` to `text-muted-foreground`.

- [ ] **Step 4: StatCard on shadcn tokens**

In `components/ui/StatCard.tsx`: in the outer container `cn(...)` change `"… border border-border bg-surface …"` to `"… border border-border bg-card …"`; change the label `p` class `text-text-muted` to `text-muted-foreground`; change the value `p` class `text-text` to `text-foreground`; change the hint `p` class `text-text-subtle` to `text-muted-foreground`. Leave the tone chip colors (`bg-success-bg`, etc.) untouched.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint`
Expected: PASS. In `npm run dev:frontend`, open the dashboard: KPI tiles, cards, skeletons (during load), and empty states (e.g. low-stock empty) render identically in light and dark.

- [ ] **Step 6: Commit**

```bash
git add components/ui/Card.tsx components/ui/Skeleton.tsx components/ui/EmptyState.tsx components/ui/StatCard.tsx
git commit -m "feat(dashboard): Card/Skeleton/EmptyState/StatCard on shadcn tokens"
```

---

## Task 9: Dashboard — shadcn chart primitives + migrate the 6 charts

**Files:**
- Create: `components/dashboard/charts/Chart.tsx`
- Modify: `components/dashboard/charts/chartTheme.ts` (add a shared tooltip style helper)
- Modify: `RevenueProfitTrendChart.tsx`, `CategoryDonutChart.tsx`, `TopProductsChart.tsx`, `AvgTransactionChart.tsx`, `MarginTrendChart.tsx`, `CashFlowChart.tsx`

**Rationale (read before implementing):** The existing charts read *resolved* token hex via `useChartColors()` + a `MutationObserver` on the `.dark` class, then pass real colors to Recharts SVG attributes — the original author documented that SVG `fill`/`stroke` do **not** resolve `var()`. We therefore keep that proven color pipeline for series/axis/grid and adopt shadcn's **ChartContainer** (consistent sizing + base Recharts CSS) and a **single shared shadcn-styled tooltip** (replacing six duplicated inline `contentStyle` objects). This is the genuine shadcn chart layer without tripping the documented `var()`-in-SVG landmine.

**Interfaces:**
- Produces: `ChartContainer` from `@/components/dashboard/charts/Chart` — props `{ className?: string; children: React.ReactElement }`, renders a `data-chart` wrapper with shadcn's base chart CSS and a `ResponsiveContainer`. `chartTooltipStyle(c: ChartColors)` from `chartTheme.ts` — returns the shared Recharts `contentStyle` object.

- [ ] **Step 1: Create the ChartContainer primitive**

Create `components/dashboard/charts/Chart.tsx`:
```tsx
"use client";

import * as React from "react";
import { ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

/**
 * shadcn-style chart wrapper: applies the base Recharts CSS resets shadcn ships
 * (muted grid/axis, focus outlines off) and hosts a ResponsiveContainer so each
 * chart component only declares its Recharts tree. Series/axis colors are still
 * supplied as resolved hex by useChartColors (SVG attrs don't resolve var()).
 */
export function ChartContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactElement;
}) {
  return (
    <div
      data-chart
      className={cn(
        "h-full w-full [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/50 [&_.recharts-surface]:outline-none",
        className,
      )}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export default ChartContainer;
```

- [ ] **Step 2: Add the shared tooltip style helper**

In `components/dashboard/charts/chartTheme.ts`, append at the end of the file:
```ts
/**
 * Shared Recharts tooltip contentStyle — shadcn popover look, theme-aware.
 * Replaces the per-chart duplicated inline objects.
 */
export function chartTooltipStyle(c: ChartColors): React.CSSProperties {
  return {
    background: c.surface,
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    color: c.text,
    fontSize: 12,
    boxShadow:
      "0 4px 6px -1px rgb(15 23 42 / 0.07), 0 2px 4px -2px rgb(15 23 42 / 0.05)",
  };
}
```
And add `import type * as React from "react";` is NOT needed (it's a `.ts` file); instead change the return type to `Record<string, string | number>`:
```ts
export function chartTooltipStyle(
  c: ChartColors,
): Record<string, string | number> {
  return {
    background: c.surface,
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    color: c.text,
    fontSize: 12,
    boxShadow:
      "0 4px 6px -1px rgb(15 23 42 / 0.07), 0 2px 4px -2px rgb(15 23 42 / 0.05)",
  };
}
```
(Use only this second version — it avoids importing React types into a plain `.ts` module.)

- [ ] **Step 3: Migrate RevenueProfitTrendChart**

Replace the entire contents of `components/dashboard/charts/RevenueProfitTrendChart.tsx` with:
```tsx
"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { formatPeso } from "@/lib/format";
import { useChartColors, chartTooltipStyle } from "./chartTheme";
import { ChartContainer } from "./Chart";

export type TrendPoint = { label: string; revenue: number; profit: number };

export default function RevenueProfitTrendChart({ data }: { data: TrendPoint[] }) {
  const c = useChartColors();
  return (
    <ChartContainer>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke={c.textMuted} fontSize={12} tickLine={false} minTickGap={24} />
        <YAxis stroke={c.textMuted} fontSize={12} tickLine={false} width={72} tickFormatter={(v) => formatPeso(Number(v))} />
        <Tooltip formatter={(v, name) => [formatPeso(Number(v ?? 0)), name]} contentStyle={chartTooltipStyle(c)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="revenue" name="Revenue" stroke={c.primary} fill={c.primary} fillOpacity={0.15} strokeWidth={2} />
        <Area type="monotone" dataKey="profit" name="Profit" stroke={c.success} fill={c.success} fillOpacity={0.15} strokeWidth={2} />
      </AreaChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 4: Migrate CategoryDonutChart**

Replace the entire contents of `components/dashboard/charts/CategoryDonutChart.tsx` with:
```tsx
"use client";

import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { formatPeso } from "@/lib/format";
import { useChartColors, categoryPalette, chartTooltipStyle } from "./chartTheme";
import { ChartContainer } from "./Chart";

export type CategorySlice = { category: string; revenue: number };

export default function CategoryDonutChart({ data }: { data: CategorySlice[] }) {
  const c = useChartColors();
  return (
    <ChartContainer>
      <PieChart>
        <Pie data={data} dataKey="revenue" nameKey="category" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
          {data.map((entry, i) => (
            <Cell key={entry.category} fill={categoryPalette[i % categoryPalette.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v, name) => [formatPeso(Number(v ?? 0)), name]} contentStyle={chartTooltipStyle(c)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 5: Migrate TopProductsChart**

In `components/dashboard/charts/TopProductsChart.tsx`: change the imports to drop `ResponsiveContainer` from the recharts import and add the new imports; replace the `<div className="min-h-0 flex-1"><ResponsiveContainer …><BarChart …>…</BarChart></ResponsiveContainer></div>` with `<div className="min-h-0 flex-1"><ChartContainer><BarChart …>…</BarChart></ChartContainer></div>`; and swap the Tooltip `contentStyle`. Full file:
```tsx
"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { formatPeso } from "@/lib/format";
import { useChartColors, chartTooltipStyle } from "./chartTheme";
import { ChartContainer } from "./Chart";

export type TopProduct = { name: string; units: number; revenue: number };
export type TopMetric = "units" | "revenue";

export default function TopProductsChart({
  data, metric, onMetricChange,
}: {
  data: TopProduct[];
  metric: TopMetric;
  onMetricChange: (m: TopMetric) => void;
}) {
  const c = useChartColors();
  const fmt = (v: number) => (metric === "revenue" ? formatPeso(v) : String(v));
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex justify-end gap-1">
        {(["units", "revenue"] as TopMetric[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onMetricChange(m)}
            className={`rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors ${
              metric === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <ChartContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={c.border} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" stroke={c.textMuted} fontSize={12} tickLine={false} tickFormatter={fmt} />
            <YAxis type="category" dataKey="name" stroke={c.textMuted} fontSize={12} tickLine={false} width={110} />
            <Tooltip formatter={(v) => [fmt(Number(v ?? 0)), metric === "revenue" ? "Revenue" : "Units"]} contentStyle={chartTooltipStyle(c)} />
            <Bar dataKey={metric} fill={c.primary} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Migrate AvgTransactionChart**

Replace the entire contents of `components/dashboard/charts/AvgTransactionChart.tsx` with:
```tsx
"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { formatPeso } from "@/lib/format";
import { useChartColors, chartTooltipStyle } from "./chartTheme";
import { ChartContainer } from "./Chart";

export type AovPoint = { label: string; transactions: number; avg: number };

export default function AvgTransactionChart({ data }: { data: AovPoint[] }) {
  const c = useChartColors();
  return (
    <ChartContainer>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke={c.textMuted} fontSize={12} tickLine={false} minTickGap={24} />
        <YAxis yAxisId="left" stroke={c.textMuted} fontSize={12} tickLine={false} width={40} allowDecimals={false} />
        <YAxis yAxisId="right" orientation="right" stroke={c.textMuted} fontSize={12} tickLine={false} width={72} tickFormatter={(v) => formatPeso(Number(v))} />
        <Tooltip formatter={(v, name) => (name === "Avg value" ? [formatPeso(Number(v ?? 0)), name] : [String(v ?? ""), name])} contentStyle={chartTooltipStyle(c)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="left" dataKey="transactions" name="Transactions" fill={c.primary} fillOpacity={0.6} radius={[3, 3, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="avg" name="Avg value" stroke={c.warning} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 7: Migrate MarginTrendChart**

Replace the entire contents of `components/dashboard/charts/MarginTrendChart.tsx` with:
```tsx
"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useChartColors, chartTooltipStyle } from "./chartTheme";
import { ChartContainer } from "./Chart";

export type MarginPoint = { label: string; marginPct: number };

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

export default function MarginTrendChart({ data }: { data: MarginPoint[] }) {
  const c = useChartColors();
  return (
    <ChartContainer>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke={c.textMuted} fontSize={12} tickLine={false} minTickGap={24} />
        <YAxis stroke={c.textMuted} fontSize={12} tickLine={false} width={48} domain={[0, "auto"]} tickFormatter={(v) => pct(Number(v))} />
        <Tooltip formatter={(v) => [pct(Number(v ?? 0)), "Gross margin"]} contentStyle={chartTooltipStyle(c)} />
        <Line type="monotone" dataKey="marginPct" name="Gross margin" stroke={c.success} strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 8: Migrate CashFlowChart**

Replace the entire contents of `components/dashboard/charts/CashFlowChart.tsx` with:
```tsx
"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { formatPeso } from "@/lib/format";
import { useChartColors, chartTooltipStyle } from "./chartTheme";
import { ChartContainer } from "./Chart";

export type CashFlowPoint = { label: string; revenue: number; spend: number };

export default function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  const c = useChartColors();
  return (
    <ChartContainer>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke={c.textMuted} fontSize={12} tickLine={false} minTickGap={24} />
        <YAxis stroke={c.textMuted} fontSize={12} tickLine={false} width={72} tickFormatter={(v) => formatPeso(Number(v))} />
        <Tooltip formatter={(v, name) => [formatPeso(Number(v ?? 0)), name]} contentStyle={chartTooltipStyle(c)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" name="Sales in" fill={c.success} radius={[3, 3, 0, 0]} />
        <Bar dataKey="spend" name="Restock out" fill={c.danger} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 9: Verify**

Run: `npm run typecheck && npm run lint`
Expected: PASS. In `npm run dev:frontend`, open the dashboard as admin: all six charts render, resize correctly, tooltips show the shared shadcn popover style, and recolor on dark-mode toggle (MutationObserver still active via `useChartColors`).

- [ ] **Step 10: Commit**

```bash
git add components/dashboard/charts/Chart.tsx components/dashboard/charts/chartTheme.ts components/dashboard/charts/RevenueProfitTrendChart.tsx components/dashboard/charts/CategoryDonutChart.tsx components/dashboard/charts/TopProductsChart.tsx components/dashboard/charts/AvgTransactionChart.tsx components/dashboard/charts/MarginTrendChart.tsx components/dashboard/charts/CashFlowChart.tsx
git commit -m "feat(dashboard): shadcn ChartContainer + shared tooltip across charts"
```

---

## Task 10: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Typecheck, lint, unit tests**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all PASS. Fix any regressions before continuing.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Manual QA checklist (light AND dark, toggle via the topbar theme switch)**

Verify each:
- Toasts: success + error fire with correct color, auto-dismiss at 4s, close button works, a `duration: 0` toast stays until dismissed.
- Alerts: validation-error banners (Product drawer, login, POS, import) render as destructive Alerts.
- ConfirmDialog: all 5 sites confirm; button shows loading; overlay/Esc blocked while loading; Cancel closes.
- Field: inline required-field error in destructive color, screen-reader wiring intact.
- ErrorBoundary: fallback + Retry resets (force a thrown error if feasible).
- Dashboard: KPI tiles, cards, skeletons during load, empty states, and all six charts including dark-mode recolor.

- [ ] **Step 4: Commit (only if QA produced fixes)**

```bash
git add -A
git commit -m "fix(ui): shadcn migration Wave 1 QA fixes"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** token bridge → Task 2; toasts/Sonner shim → Task 3; alerts → Task 4; validation confirmations (AlertDialog) → Task 5; field messages → Task 6; error handling → Task 7; dashboard cards/skeleton/empty/statcard → Task 8; chart theming → Task 9; verification → Task 10. Foundation `cn`/deps → Task 1. All spec sections mapped.
- **Placeholder scan:** none — every code step carries full code; the only "keep the existing inner message expression" note (Task 4 Step 8) is a deliberate preserve-as-is instruction with surrounding code shown.
- **Type consistency:** `toToastArgs` signature identical in Task 3 test and impl; `ChartContainer`/`chartTooltipStyle`/`ChartColors` names consistent across Task 9 steps; `ConfirmDialogProps` unchanged; barrel exports added once.
- **Decision flagged for reviewer:** Task 9 keeps the proven `useChartColors` hex pipeline (rather than a full ChartContainer `var()`-based recolor) because the original code documents that SVG `fill`/`stroke` don't resolve `var()`; rationale is in the task header.
