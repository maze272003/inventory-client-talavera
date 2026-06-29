"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useTheme } from "@/components/ThemeProvider";
import { cn, Icon, BrandLogo } from "@/components/ui";
import { ConnectionStatus } from "@/components/ui";
import { APP_TITLE } from "./navConfig";

function IconButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Fixed top navigation bar. Holds the global quick-search, primary quick
 * actions, notifications, theme + density toggles, and connection state.
 * Renders a hamburger on phones that opens the AppShell's mobile drawer.
 */
export default function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const router = useRouter();
  const { theme, density, toggleTheme, toggleDensity } = useTheme();
  const [q, setQ] = useState("");
  const currentUser = useQuery(api.users.currentUser);
  const lowStock = useQuery(api.products.lowStock, {});
  const isAdmin = currentUser?.role === "admin";
  const alertCount = lowStock?.length ?? 0;

  function onSubmitSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/pos?search=${encodeURIComponent(term)}` : "/pos");
  }

  return (
    <header
      className="sticky top-0 z-sticky flex h-[var(--topbar-h)] shrink-0 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur-md md:px-6"
    >
      {/* Mobile: open drawer */}
      <IconButton
        label="Open menu"
        onClick={onOpenMenu}
        className="md:hidden -ml-2"
      >
        <Icon name="menu" size={22} />
      </IconButton>

      {/* Mobile brand */}
      <span className="flex items-center gap-2 md:hidden">
        <BrandLogo size={32} alt="" />
        <span className="text-sm font-bold text-text">{APP_TITLE}</span>
      </span>

      {/* Desktop: global quick-search */}
      <form
        onSubmit={onSubmitSearch}
        className="relative hidden md:block w-full max-w-md"
        role="search"
      >
        <Icon
          name="search"
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products, scan barcode…"
          aria-label="Quick search"
          className="h-10 w-full rounded-lg border border-border bg-bg pl-9 pr-16 text-sm text-text placeholder:text-text-subtle transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-text-muted lg:block">
          /
        </kbd>
      </form>

      {/* Right cluster */}
      <div className="ml-auto flex items-center gap-1 md:gap-1.5">
        <ConnectionStatus iconOnly className="hidden sm:inline-flex" />

        {/* New Sale shortcut */}
        <Link
          href="/pos"
          className="hidden items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-fg shadow-primary transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:inline-flex"
        >
          <Icon name="zap" size={16} />
          New Sale
        </Link>

        {/* Low-stock alert bell (admin) */}
        {isAdmin && (
          <Link
            href="/inventory"
            className="relative hidden h-10 w-10 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-2 hover:text-text md:inline-flex"
            aria-label={`${alertCount} low-stock alerts`}
            title="Low-stock alerts"
          >
            <Icon name="bell" size={20} />
            {alertCount > 0 && (
              <span className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-danger-fg">
                {alertCount > 99 ? "99+" : alertCount}
              </span>
            )}
          </Link>
        )}

        <IconButton label="New sale" className="sm:hidden" onClick={() => router.push("/pos")}>
          <Icon name="shopping-cart" size={20} />
        </IconButton>

        <IconButton label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={toggleTheme}>
          <Icon name={theme === "dark" ? "sun" : "moon"} size={20} />
        </IconButton>

        <IconButton
          label={`Density: ${density}. Toggle.`}
          onClick={toggleDensity}
          className="hidden lg:inline-flex"
        >
          <Icon name="sliders" size={20} />
        </IconButton>
      </div>
    </header>
  );
}
