"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn, Icon } from "@/components/ui";
import { ConnectionStatus, UserMenu } from "@/components/ui";
import { useSidebar } from "./SidebarContext";
import { APP_TITLE, NAV_GROUPS } from "./navConfig";

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
}

function BrandMark({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href="/dashboard"
      aria-label={APP_TITLE}
      className={cn(
        "flex items-center gap-3 h-[var(--topbar-h)] shrink-0 border-b border-border px-4",
        collapsed && "lg:justify-center lg:px-0",
      )}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-primary-fg shadow-primary bg-brand-gradient"
        aria-hidden="true"
      >
        <Icon name="wrench" size={18} />
      </span>
      <div className={cn("min-w-0", collapsed && "lg:hidden")}>
        <p className="truncate text-sm font-bold leading-tight text-text">
          {APP_TITLE}
        </p>
        <p className="truncate text-[11px] leading-tight text-text-muted">
          Motor Parts &amp; Repair
        </p>
      </div>
    </Link>
  );
}

function CollapseToggle() {
  const { collapsed, toggle } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand (»)" : "Collapse («)"}
      className="hidden lg:flex absolute -right-3 top-20 z-20 h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-text-muted shadow-md transition-colors hover:text-primary hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon name={collapsed ? "chevrons-right" : "chevrons-left"} size={14} />
    </button>
  );
}

function NavItem({
  href,
  label,
  icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 min-h-[2.75rem] text-sm font-medium transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        collapsed && "lg:justify-center lg:px-0",
        active
          ? "bg-primary/10 text-primary"
          : "text-text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 hidden -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary lg:block"
        />
      )}
      <Icon
        name={icon}
        size={20}
        className={cn(
          "shrink-0 transition-transform group-hover:scale-105",
          active && "text-primary",
        )}
      />
      <span className={cn("truncate", collapsed && "lg:hidden")}>{label}</span>
    </Link>
  );
}

function NavList({ collapsed }: { collapsed: boolean }) {
  const isActive = useIsActive();
  const currentUser = useQuery(api.users.currentUser);
  const isAdmin = currentUser?.role === "admin";

  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    links: g.links.filter((l) => !l.adminOnly || isAdmin),
  })).filter((g) => g.links.length > 0);

  return (
    <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
      <ul className="space-y-0.5">
        {visibleGroups.map((group, gi) => (
          <li key={group.label}>
            {gi > 0 && <div className="my-3 h-px bg-border lg:mx-0" />}
            <p
              className={cn(
                "mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-text-subtle",
                collapsed && "lg:sr-only",
              )}
            >
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <NavItem
                    href={link.href}
                    label={link.label}
                    icon={link.icon}
                    active={isActive(link.href)}
                    collapsed={collapsed}
                  />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const currentUser = useQuery(api.users.currentUser);
  return (
    <div className="shrink-0 border-t border-border p-3 space-y-2">
      <div className={cn("px-1", collapsed && "lg:flex lg:justify-center lg:px-0")}>
        <ConnectionStatus />
      </div>
      <UserMenu
        name={currentUser?.name}
        role={currentUser?.role}
        placement="top"
      />
    </div>
  );
}

/**
 * Desktop + tablet sidebar. Collapsible on `lg+` via the SidebarContext; the
 * tablet breakpoint always renders as an icon rail. Hidden on phones (the
 * AppShell renders a top bar + drawer there).
 */
export default function Sidebar() {
  const { collapsed } = useSidebar();

  return (
    <aside
      className={cn(
        "relative hidden md:flex flex-col shrink-0 bg-surface border-r border-border overflow-hidden transition-[width] duration-200 ease-standard",
        collapsed
          ? "md:w-[var(--sidebar-w-tablet)] lg:w-[var(--sidebar-w-collapsed)]"
          : "md:w-[var(--sidebar-w-tablet)] lg:w-[var(--sidebar-w)]",
      )}
    >
      <CollapseToggle />
      <BrandMark collapsed={collapsed} />
      <NavList collapsed={collapsed} />
      <SidebarFooter collapsed={collapsed} />
    </aside>
  );
}
