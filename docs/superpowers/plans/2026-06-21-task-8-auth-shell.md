# Task 8: Auth Provider, Login Page, App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `@convex-dev/auth` Next.js providers, protect routes via middleware, build login page, and deliver a role-gated app shell with nav.

**Architecture:** `ConvexAuthNextjsServerProvider` wraps at root layout (server); `ConvexAuthNextjsProvider` in the client provider; middleware redirects unauthenticated → `/login` and authenticated `/login` → `/dashboard`; `/(app)` route group holds authenticated pages behind a shell layout.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, `@convex-dev/auth` 0.0.94, Convex 1.36.

## Global Constraints

- `@convex-dev/auth` version: ^0.0.94
- Next.js version: 16.2.4
- Tailwind v4 (no `@apply` on utility classes in components; use inline className)
- `npm run typecheck` must pass (TypeScript 6)
- `npm run lint` must pass (ESLint 9 + eslint-config-next 16)
- No new Convex backend files; frontend only
- Schema: no `numbers` table (already absent); no `convex/myFunctions.ts` (already absent)

---

### Task 1: Switch ConvexClientProvider to ConvexAuthNextjsProvider

**Files:**
- Modify: `components/ConvexClientProvider.tsx`

**Interfaces:**
- Produces: `ConvexAuthNextjsProvider` wrapping children, used by `app/layout.tsx`

- [ ] **Step 1: Rewrite ConvexClientProvider.tsx**

Replace `ConvexProvider` with `ConvexAuthNextjsProvider` from `@convex-dev/auth/nextjs`:

```tsx
"use client";
import { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>;
}
```

- [ ] **Step 2: Verify typecheck passes for this file**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -30`
Expected: No errors related to ConvexClientProvider.

---

### Task 2: Wrap root layout with ConvexAuthNextjsServerProvider

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `ConvexClientProvider` from Task 1
- Produces: authenticated server context available to all routes; metadata title "Sales & Inventory"

- [ ] **Step 1: Update app/layout.tsx**

Wrap `ConvexClientProvider` with `ConvexAuthNextjsServerProvider` and update metadata:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sales & Inventory",
  description: "Sales & Inventory Management System",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en">
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
```

---

### Task 3: Create middleware.ts for route protection

**Files:**
- Create: `middleware.ts` (project root)

**Interfaces:**
- Consumes: `convexAuthNextjsMiddleware`, `createRouteMatcher`, `nextjsMiddlewareRedirect` from `@convex-dev/auth/nextjs/server`
- Produces: unauthenticated users redirected to `/login`; authenticated users hitting `/login` redirected to `/dashboard`

- [ ] **Step 1: Create middleware.ts**

```ts
import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isPublicRoute = createRouteMatcher(["/login"]);

export default convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    const authed = await convexAuth.isAuthenticated();
    if (!isPublicRoute(request) && !authed) {
      return nextjsMiddlewareRedirect(request, "/login");
    }
    if (isPublicRoute(request) && authed) {
      return nextjsMiddlewareRedirect(request, "/dashboard");
    }
  }
);

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
```

---

### Task 4: Create login page

**Files:**
- Create: `app/login/page.tsx`

**Interfaces:**
- Consumes: `useAuthActions` from `@convex-dev/auth/react`; `useRouter` from `next/navigation`
- Produces: `/login` route with email+password form; on success pushes `/dashboard`

- [ ] **Step 1: Create app/login/page.tsx**

```tsx
"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn("password", { email, password, flow: "signIn" });
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign in failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Sign In</h1>
        <p className="text-sm text-gray-500 mb-6">Sales &amp; Inventory Management</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="admin@shop.local"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

---

### Task 5: Create Nav component

**Files:**
- Create: `components/Nav.tsx`

**Interfaces:**
- Consumes: `api.users.currentUser` → `{ _id, name, role } | null`; `useAuthActions` from `@convex-dev/auth/react`; `useQuery` from `convex/react`; `useRouter` from `next/navigation`
- Produces: sidebar nav with role-gated links; sign out button

- [ ] **Step 1: Create components/Nav.tsx**

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";

const allLinks = [
  { href: "/dashboard", label: "Dashboard", adminOnly: false },
  { href: "/pos", label: "POS", adminOnly: false },
  { href: "/receipts", label: "Receipts", adminOnly: false },
  { href: "/products", label: "Products", adminOnly: true },
  { href: "/inventory", label: "Inventory", adminOnly: true },
  { href: "/reports", label: "Reports", adminOnly: true },
];

export default function Nav() {
  const currentUser = useQuery(api.users.currentUser);
  const { signOut } = useAuthActions();
  const router = useRouter();
  const pathname = usePathname();

  const isAdmin = currentUser?.role === "admin";
  const links = allLinks.filter((l) => !l.adminOnly || isAdmin);

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <nav className="flex flex-col w-56 shrink-0 bg-gray-900 text-white min-h-screen p-4 gap-2">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
          Sales &amp; Inventory
        </p>
        {currentUser && (
          <p className="text-sm text-gray-300 truncate">{currentUser.name}</p>
        )}
      </div>

      <ul className="flex-1 space-y-1">
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <button
        onClick={handleSignOut}
        className="mt-auto rounded-lg px-3 py-2 text-sm font-medium text-gray-400 hover:bg-gray-700 hover:text-white transition-colors text-left"
      >
        Sign Out
      </button>
    </nav>
  );
}
```

---

### Task 6: Create authenticated app shell layout

**Files:**
- Create: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `Nav` from `components/Nav.tsx`
- Produces: layout wrapping all `/(app)/*` pages with sidebar nav

- [ ] **Step 1: Create app/(app)/layout.tsx**

```tsx
import Nav from "@/components/Nav";
import { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Nav />
      <main className="flex-1 p-6 bg-gray-50">{children}</main>
    </div>
  );
}
```

---

### Task 7: Replace app/page.tsx with redirect + create placeholder pages

**Files:**
- Modify: `app/page.tsx`
- Create: `app/(app)/dashboard/page.tsx`
- Create: `app/(app)/pos/page.tsx`
- Create: `app/(app)/receipts/page.tsx`
- Create: `app/(app)/products/page.tsx`
- Create: `app/(app)/inventory/page.tsx`
- Create: `app/(app)/reports/page.tsx`

**Interfaces:**
- Produces: `/` redirects to `/dashboard`; each route renders a placeholder heading; admin-only pages guard at page level

- [ ] **Step 1: Replace app/page.tsx with redirect**

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

- [ ] **Step 2: Create app/(app)/dashboard/page.tsx**

```tsx
export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h1>
      <p className="text-gray-500">Coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 3: Create app/(app)/pos/page.tsx**

```tsx
export default function PosPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Point of Sale</h1>
      <p className="text-gray-500">Coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 4: Create app/(app)/receipts/page.tsx**

```tsx
export default function ReceiptsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Receipts</h1>
      <p className="text-gray-500">Coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 5: Create app/(app)/products/page.tsx (admin-gated)**

```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function ProductsPage() {
  const currentUser = useQuery(api.users.currentUser);

  if (currentUser === undefined) return null;

  if (currentUser?.role !== "admin") {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Products</h1>
        <p className="text-red-600">Admins only.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Products</h1>
      <p className="text-gray-500">Coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 6: Create app/(app)/inventory/page.tsx (admin-gated)**

```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function InventoryPage() {
  const currentUser = useQuery(api.users.currentUser);

  if (currentUser === undefined) return null;

  if (currentUser?.role !== "admin") {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Inventory</h1>
        <p className="text-red-600">Admins only.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Inventory</h1>
      <p className="text-gray-500">Coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 7: Create app/(app)/reports/page.tsx (admin-gated)**

```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function ReportsPage() {
  const currentUser = useQuery(api.users.currentUser);

  if (currentUser === undefined) return null;

  if (currentUser?.role !== "admin") {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Reports</h1>
        <p className="text-red-600">Admins only.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Reports</h1>
      <p className="text-gray-500">Coming soon.</p>
    </div>
  );
}
```

---

### Task 8: Verify and Commit

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors or only pre-existing warnings.

- [ ] **Step 3: Run next build**

Run: `npx next build 2>&1 | tail -30`
Expected: Build completes successfully.

- [ ] **Step 4: Commit**

```bash
git add components/ConvexClientProvider.tsx app/layout.tsx middleware.ts app/login/page.tsx "app/(app)/layout.tsx" components/Nav.tsx app/page.tsx "app/(app)/dashboard/page.tsx" "app/(app)/pos/page.tsx" "app/(app)/receipts/page.tsx" "app/(app)/products/page.tsx" "app/(app)/inventory/page.tsx" "app/(app)/reports/page.tsx"
git commit -m "feat: auth provider, login, role-gated app shell"
```
