"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn, Icon, Drawer, ConnectionStatus, UserMenu } from "@/components/ui";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { SidebarProvider } from "./SidebarContext";
import {
  APP_TITLE,
  BOTTOM_TAB_HREFS,
  NAV_GROUPS,
  type NavLink,
} from "./navConfig";

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
}

function MobileDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const isActive = useIsActive();
  const currentUser = useQuery(api.users.currentUser);
  const isAdmin = currentUser?.role === "admin";

  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    links: g.links.filter((l) => !l.adminOnly || isAdmin),
  })).filter((g) => g.links.length > 0);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      side="left"
      title={APP_TITLE}
      description="Motor Parts & Repair"
      width="min(20rem, 100vw)"
    >
      <nav aria-label="All pages" className="space-y-5">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-text-subtle">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <MobileNavLink
                    link={link}
                    active={isActive(link.href)}
                    onNavigate={onClose}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-6 space-y-3 border-t border-border pt-4">
        <ConnectionStatus />
        <UserMenu
          name={currentUser?.name}
          role={currentUser?.role}
          onSignOut={() => {
            onClose();
            router.push("/login");
          }}
          placement="bottom"
        />
      </div>
    </Drawer>
  );
}

function MobileNavLink({
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
        "flex items-center gap-3 rounded-lg px-3 min-h-[2.75rem] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary/10 text-primary"
          : "text-text hover:bg-surface-2",
      )}
    >
      <Icon name={link.icon} size={20} className="shrink-0" />
      <span className="truncate">{link.label}</span>
    </Link>
  );
}

function BottomTabBar() {
  const isActive = useIsActive();
  const currentUser = useQuery(api.users.currentUser);
  const isAdmin = currentUser?.role === "admin";

  const bottomTabs = NAV_GROUPS.flatMap((g) => g.links).filter(
    (l) => BOTTOM_TAB_HREFS.includes(l.href) && (!l.adminOnly || isAdmin),
  );

  return (
    <nav
      aria-label="Quick navigation"
      className="fixed bottom-0 inset-x-0 z-30 flex border-t border-border bg-surface/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {bottomTabs.map((link) => (
        <BottomTab key={link.href} link={link} active={isActive(link.href)} />
      ))}
    </nav>
  );
}

function BottomTab({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[3.5rem] text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        active ? "text-primary" : "text-text-muted hover:text-text",
      )}
    >
      <Icon name={link.icon} size={22} />
      <span>{link.label.split(" ")[0]}</span>
    </Link>
  );
}

/**
 * The fixed application shell:
 *  - Sidebar (desktop/tablet) is always visible and never scrolls.
 *  - Topbar is fixed at the top of the content column.
 *  - Only <main> scrolls.
 *  - Phones get a top bar, a slide-in drawer, and a bottom tab bar.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden bg-bg text-text">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onOpenMenu={() => setDrawerOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-6">
            {children}
          </main>
        </div>

        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <BottomTabBar />
      </div>
    </SidebarProvider>
  );
}
