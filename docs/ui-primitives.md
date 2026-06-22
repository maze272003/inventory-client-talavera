# UI Primitives — Contract Reference

The reusable, token-styled, accessible UI library every page composes. Import
everything from the barrel:

```ts
import { Button, Card, Field, Input, ResponsiveTable, useToast } from "@/components/ui";
```

**Rules for page agents**
- Compose these primitives + design tokens only. Do **not** hardcode Tailwind
  colors (`text-gray-900`, `bg-blue-600`). Use token utilities
  (`bg-surface`, `text-text`, `text-text-muted`, `bg-primary`, semantic
  `*-bg`/`*-fg` pairs) and the primitives below.
- Density-aware spacing: `p-cell` / `px-cell` / `py-row` / `h-control`. Money &
  quantity: `tabular-nums` or `.figure-nums`.
- All overlays already manage focus trap, ESC, scrim, body-scroll lock, ARIA, and
  the z-index scale. Don't re-implement.
- Reduced-motion is honored globally; animation utilities used here degrade
  automatically.

`ToastProvider` is already wrapped around the app in `app/layout.tsx` — just call
`useToast()`. `ThemeProvider` and `Icon` are pre-existing (see
`@/components/ThemeProvider`, `@/components/ui/Icon`).

---

## Button
`import { Button } from "@/components/ui"`
- **Props:** `variant?: "primary"|"secondary"|"ghost"|"danger"` (default primary),
  `size?: "sm"|"md"|"lg"` (default md), `loading?: boolean`, `fullWidth?: boolean`,
  `leftIcon?: ReactNode`, `rightIcon?: ReactNode`, plus all `<button>` props.
  `loading` disables + shows a Spinner; `disabled` supported. `type` defaults to `"button"`.
- **Sizes:** md/lg are ≥44px tall (touch); sm (36px) is for dense desktop toolbars.
- `<Button variant="danger" loading={busy} onClick={del}>Delete</Button>`

## Card / CardHeader / CardBody / CardFooter
`import { Card, CardHeader, CardBody, CardFooter } from "@/components/ui"`
- **Card props:** `interactive?: boolean` (hover elevation + focus ring) + `<div>` props.
- Header/Body/Footer are layout slots (`<div>` props). Header & Footer have borders;
  Footer right-aligns its actions.
- `<Card><CardHeader>Title</CardHeader><CardBody>…</CardBody></Card>`

## Input
`import { Input } from "@/components/ui"`
- **Props:** `invalid?: boolean` + all `<input>` props. (Field sets `invalid`/aria for you.)
- `<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />`

## Textarea
`import { Textarea } from "@/components/ui"`
- **Props:** `invalid?: boolean`, `rows` (default 3) + `<textarea>` props.
- `<Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />`

## Select
`import { Select } from "@/components/ui"`
- **Props:** `invalid?: boolean` + `<select>` props. Pass `<option>`s as children;
  a chevron is drawn for you.
- `<Select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All</option></Select>`

## Label
`import { Label } from "@/components/ui"`
- **Props:** `required?: boolean` + `<label>` props. Usually rendered by Field.
- `<Label htmlFor="name" required>Name</Label>`

## Field
`import { Field } from "@/components/ui"`
- Wraps **one** control with label + hint + inline error, ARIA-wired (injects
  `id`, `aria-describedby`, `aria-invalid`, `invalid`).
- **Props:** `label?: string`, `hint?: string`, `error?: string` (shows error &
  flips control to danger state), `required?: boolean`, `className?`, `children`
  (a single Input/Select/Textarea or compatible element).
- `<Field label="SKU" required error={errors.sku}><Input value={sku} onChange={…} /></Field>`

## Badge
`import { Badge } from "@/components/ui"`
- **Props:** `variant?: "neutral"|"primary"|"success"|"warning"|"danger"` (default neutral) + `<span>` props.
- `<Badge variant="success">Paid</Badge>`

## Dialog
`import { Dialog } from "@/components/ui"`
- Accessible modal: focus trap, ESC, scrim click, body-scroll lock, `role="dialog"`
  + `aria-modal`, portaled at `z-modal`.
- **Props:** `open: boolean`, `onClose: () => void`, `title?`, `description?`,
  `children?`, `footer?` (action buttons), `size?: "sm"|"md"|"lg"` (default md),
  `hideClose?: boolean`, `dismissable?: boolean` (default true — set false to block
  ESC/scrim during a mutation), `className?`.
- `<Dialog open={open} onClose={close} title="Edit" footer={<Button onClick={save}>Save</Button>}>…</Dialog>`

## ConfirmDialog
`import { ConfirmDialog } from "@/components/ui"`
- Destructive-confirmation wrapper over Dialog.
- **Props:** `open`, `onClose`, `onConfirm: () => void | Promise<void>`, `title: string`,
  `description?`, `confirmLabel?` (default "Confirm"), `cancelLabel?` (default "Cancel"),
  `confirmVariant?: ButtonVariant` (default "danger"), `loading?: boolean`
  (shows on confirm button + blocks dismiss).
- `<ConfirmDialog open={o} onClose={close} onConfirm={archive} title="Archive product?" confirmLabel="Archive" loading={busy} />`

## Drawer
`import { Drawer } from "@/components/ui"`
- Accessible side panel (forms, ledger): focus trap, ESC, scrim, body-scroll lock,
  `role="dialog"`, portaled at `z-drawer`.
- **Props:** `open`, `onClose`, `side?: "left"|"right"` (default right), `title?`,
  `description?`, `children?`, `footer?`, `width?` (CSS, default `min(24rem,100vw)`),
  `dismissable?` (default true), `hideClose?`, `className?`.
- `<Drawer open={open} onClose={close} title="Stock ledger">…</Drawer>`

## Toast / ToastProvider / useToast
`import { useToast } from "@/components/ui"` — provider is already mounted in layout.
- **useToast() returns:** `toast(opts)`, `success(title, desc?)`, `error(title, desc?)`,
  `info(title, desc?)`, `warning(title, desc?)`, `dismiss(id)`.
- **ToastOptions:** `{ title?, description?, variant?: "info"|"success"|"warning"|"danger", duration?: number }`
  — `duration` default 4000ms; `0` = manual dismiss. Rendered at `z-toast` in a polite live region.
- `const { success, error } = useToast(); success("Sale complete", "Receipt #1042 saved");`

## Skeleton / SkeletonText
`import { Skeleton, SkeletonText } from "@/components/ui"`
- Replace every `return null` / "Loading…" with these.
- **Skeleton props:** `width?`, `height?` (string|number), `rounded?: boolean` + `<div>` props.
- **SkeletonText props:** `lines?: number` (default 3), `className?`.
- `<Skeleton height={20} width="60%" />` · `<SkeletonText lines={4} />`

## EmptyState
`import { EmptyState } from "@/components/ui"`
- Use for every empty list/table.
- **Props:** `icon?: IconName` (default "info"), `title: string`, `description?: string`,
  `action?: ReactNode`, `className?`.
- `<EmptyState icon="package" title="No products yet" description="Add your first product." action={<Button>Add</Button>} />`

## PageHeader
`import { PageHeader } from "@/components/ui"`
- **Props:** `title: ReactNode`, `subtitle?: ReactNode`, `actions?: ReactNode`
  (right-aligned, wraps below title on phone), `className?`.
- `<PageHeader title="Products" subtitle="42 items" actions={<Button>Add product</Button>} />`

## SegmentedControl
`import { SegmentedControl } from "@/components/ui"` — **generic over the value type.**
- Tabbed presets (e.g. Reports ranges). Renders a `role="radiogroup"`.
- **Props:** `options: { value: T; label: string }[]`, `value: T`, `onChange: (v: T) => void`,
  `ariaLabel?`, `fullWidth?: boolean`, `size?: "sm"|"md"` (default md), `className?`.
- `<SegmentedControl ariaLabel="Range" value={range} onChange={setRange} options={[{value:"today",label:"Today"},{value:"week",label:"Week"}]} />`

## Spinner
`import { Spinner } from "@/components/ui"`
- Inherits `currentColor`. **Props:** `size?: number` (default 16), `className?`, `label?` (default "Loading").
- `<Spinner size={20} />`

## ResponsiveTable  ★ the key data primitive
`import { ResponsiveTable } from "@/components/ui"` — **generic over the row type.**
- Real semantic `<table>` at `md+`; stacks into labeled cards below `md`. Use for
  **every** data page (no raw `<table>`).
- **Props:**
  - `columns: Column<Row>[]` — each `Column`: `{ key: string; header: ReactNode;
    cell: (row, i) => ReactNode; align?: "left"|"right"|"center";
    hideLabelOnCard?: boolean; className?: string; headerClassName?: string }`.
  - `rows: Row[]`
  - `rowKey: (row, index) => string`
  - `caption?: string` (sr-only)
  - `onRowClick?: (row, index) => void` (rows/cards become keyboard-interactive)
  - `renderCard?: (row, index) => ReactNode` (custom mobile card; replaces the
    default label/value stack)
  - `empty?: ReactNode` (render an `<EmptyState>` when `rows` is empty)
  - `className?`
- ```tsx
  <ResponsiveTable
    rows={items}
    rowKey={(r) => r._id}
    columns={[
      { key: "name", header: "Name", cell: (r) => r.name },
      { key: "qty",  header: "Qty",  align: "right", cell: (r) => <span className="figure-nums">{r.qty}</span> },
    ]}
    empty={<EmptyState icon="package" title="No items" />}
  />
  ```

## ErrorBoundary
`import { ErrorBoundary } from "@/components/ui"` — **class component.**
- Per-route fallback with retry. **Props:** `children`,
  `fallback?: (error, reset) => ReactNode`, `onError?: (error, info) => void`.
- `<ErrorBoundary><DashboardPage /></ErrorBoundary>`

## ConnectionStatus
`import { ConnectionStatus } from "@/components/ui"`
- Online / reconnecting / offline indicator from Convex WS state + `navigator.onLine`.
- **Props:** `iconOnly?: boolean` (dot only, for an icon rail), `className?`.
- `<ConnectionStatus />` · `<ConnectionStatus iconOnly />`

## UserMenu
`import { UserMenu } from "@/components/ui"`
- Avatar/initials → name, role, theme toggle, density toggle, sign out. Uses
  `useTheme` + `useAuthActions`. Presentation-only: **pass** the current user's
  name/role (no data hook of its own).
- **Props:** `name?: string|null`, `role?: string|null`,
  `onSignOut?: () => void` (e.g. `router.push("/login")`),
  `placement?: "top"|"bottom"` (default top — popup above trigger), `className?`.
- `<UserMenu name={user.name} role={user.role} onSignOut={() => router.push("/login")} />`

---

### Hooks / utilities (advanced, optional)
- `cn(...classes)` — class combiner. `import { cn } from "@/components/ui"`.
- `useFocusTrap(ref, active)` — trap Tab focus (used internally by Dialog/Drawer).
- `useLockBodyScroll(locked)` — lock body scroll (used internally).
- `Icon` / `IconName` — re-exported from the foundation icon module.

### Tokens cheat-sheet (for any bespoke markup)
Surfaces `bg-bg` / `bg-surface` / `bg-surface-2` · text `text-text` / `text-text-muted`
· borders `border-border` · primary `bg-primary` / `hover:bg-primary-hover` /
`text-primary-fg` · semantic `bg-success-bg`+`text-success-fg` (same for
warning/danger) · focus `ring-ring` · radius `rounded-sm/md/lg/xl` · shadow
`shadow-sm/md/subtle` · spacing `p-cell` / `py-row` / `h-control` · numerals
`tabular-nums` / `.figure-nums`.
