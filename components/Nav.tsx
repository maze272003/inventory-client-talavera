"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import {
  cn,
  Icon,
  type IconName,
  Drawer,
  UserMenu,
  ConnectionStatus,
} from "@/components/ui";

type NavLink = {
  href: string;
  label: string;
  icon: IconName;
  adminOnly: boolean;
};

type NavGroup = {
  label: string;
  links: NavLink[];
};

/**
 * Navigation is grouped Sell / Manage / Insights. `adminOnly` links are gated
 * on currentUser.role === "admin" (preserved exactly from the original Nav).
 */
const groups: NavGroup[] = [
  {
    label: "Sell",
    links: [
      { href: "/dashboard", label: "Dashboard", icon: "home", adminOnly: false },
      { href: "/pos", label: "POS", icon: "shopping-cart", adminOnly: false },
      { href: "/receipts", label: "Receipts", icon: "receipt", adminOnly: false },
    ],
  },
  {
    label: "Manage",
    links: [
      { href: "/products", label: "Products", icon: "package", adminOnly: true },
      { href: "/inventory", label: "Inventory", icon: "filter", adminOnly: true },
      {
        href: "/inventory/import",
        label: "Import Invoice",
        icon: "download",
        adminOnly: true,
      },
      {
        href: "/inventory/purchases",
        label: "Purchases",
        icon: "printer",
        adminOnly: true,
      },
    ],
  },
  {
    label: "Insights",
    links: [
      { href: "/reports", label: "Reports", icon: "bar-chart", adminOnly: true },
      { href: "/audit", label: "Audit Log", icon: "refresh", adminOnly: true },
    ],
  },
  {
    label: "Admin",
    links: [
      { href: "/users", label: "Users", icon: "user", adminOnly: true },
    ],
  },
];

/** Cashier essentials surfaced in the phone bottom tab bar (thumb-reachable). */
const bottomTabHrefs = ["/dashboard", "/pos", "/receipts"];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
}

export default function Nav() {
  const currentUser = useQuery(api.users.currentUser);
  const { signOut } = useAuthActions();
  const router = useRouter();
  const isActive = useIsActive();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isAdmin = currentUser?.role === "admin";

  const visibleGroups = groups
    .map((g) => ({
      ...g,
      links: g.links.filter((l) => !l.adminOnly || isAdmin),
    }))
    .filter((g) => g.links.length > 0);

  const bottomTabs = groups
    .flatMap((g) => g.links)
    .filter((l) => bottomTabHrefs.includes(l.href) && (!l.adminOnly || isAdmin));

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <>
      {/* ===== Desktop sidebar (lg+) ===== */}
      <nav
        aria-label="Primary"
        className="hidden lg:flex flex-col w-64 shrink-0 bg-surface border-r border-border min-h-screen"
      >
        <div className="px-cell py-row border-b border-border">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
            Sales &amp; Inventory
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <SidebarLink link={link} active={isActive(link.href)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-3 py-3 border-t border-border space-y-2">
          <div className="px-1">
            <ConnectionStatus />
          </div>
          <UserMenu
            name={currentUser?.name}
            role={currentUser?.role}
            onSignOut={() => router.push("/login")}
            placement="top"
          />
        </div>
      </nav>

      {/* ===== Tablet icon rail (md → lg) ===== */}
      <nav
        aria-label="Primary"
        className="hidden md:flex lg:hidden flex-col w-16 shrink-0 bg-surface border-r border-border min-h-screen items-center"
      >
        <div className="h-14 flex items-center justify-center border-b border-border w-full">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-fg"
            aria-hidden="true"
          >
            <Icon name="package" size={18} />
          </span>
        </div>

        <div className="flex-1 overflow-y-auto py-4 flex flex-col items-center gap-1 w-full">
          {visibleGroups.map((group, gi) => (
            <div
              key={group.label}
              className={cn(
                "flex flex-col items-center gap-1 w-full",
                gi > 0 && "mt-2 pt-2 border-t border-border",
              )}
            >
              {group.links.map((link) => (
                <RailLink key={link.href} link={link} active={isActive(link.href)} />
              ))}
            </div>
          ))}
        </div>

        <div className="py-3 flex flex-col items-center gap-2 border-t border-border w-full">
          <ConnectionStatus iconOnly />
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon name="log-out" size={20} />
          </button>
        </div>
      </nav>

      {/* ===== Phone top bar (<md) ===== */}
      <header
        className="md:hidden sticky top-0 flex items-center justify-between gap-2 bg-surface border-b border-border px-cell h-14"
        style={{ zIndex: "var(--z-sticky)" }}
      >
        <button
          type="button"
          aria-label="Open navigation menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
          className="inline-flex h-11 w-11 -ml-2 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name="menu" size={22} />
        </button>
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted truncate">
          Sales &amp; Inventory
        </p>
        <ConnectionStatus iconOnly />
      </header>

      {/* ===== Phone slide-in drawer (full nav, incl. admin-only links) ===== */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        side="left"
        title="Sales & Inventory"
      >
        <nav aria-label="All pages" className="space-y-6">
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <DrawerLink
                      link={link}
                      active={isActive(link.href)}
                      onNavigate={() => setDrawerOpen(false)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-6 pt-4 border-t border-border space-y-3">
          <ConnectionStatus />
          <UserMenu
            name={currentUser?.name}
            role={currentUser?.role}
            onSignOut={() => {
              setDrawerOpen(false);
              router.push("/login");
            }}
            placement="bottom"
          />
        </div>
      </Drawer>

      {/* ===== Phone bottom tab bar (cashier essentials) ===== */}
      <nav
        aria-label="Quick navigation"
        className="md:hidden fixed bottom-0 inset-x-0 bg-surface border-t border-border flex"
        style={{
          zIndex: "var(--z-sticky)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {bottomTabs.map((link) => (
          <BottomTab key={link.href} link={link} active={isActive(link.href)} />
        ))}
      </nav>
    </>
  );
}

/* ---------- link sub-components ---------- */

function SidebarLink({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary text-primary-fg"
          : "text-text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      <Icon name={link.icon} size={18} className="shrink-0" />
      <span className="truncate">{link.label}</span>
    </Link>
  );
}

function RailLink({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <Link
      href={link.href}
      aria-label={link.label}
      title={link.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary text-primary-fg"
          : "text-text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      <Icon name={link.icon} size={20} />
    </Link>
  );
}

function DrawerLink({
  link,
  active,
  onNavigate,
}: {
  link: NavLink;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 min-h-[44px] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary text-primary-fg"
          : "text-text hover:bg-surface-2",
      )}
    >
      <Icon name={link.icon} size={18} className="shrink-0" />
      <span className="truncate">{link.label}</span>
    </Link>
  );
}

function BottomTab({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        active ? "text-primary" : "text-text-muted hover:text-text",
      )}
    >
      <Icon name={link.icon} size={22} />
      <span>{link.label}</span>
    </Link>
  );
}
