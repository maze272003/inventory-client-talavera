"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "./cn";
import { Icon } from "./Icon";

export type UserMenuProps = {
  /** Display name; initials are derived from it. */
  name?: string | null;
  /** Role label shown under the name (e.g. "admin"). */
  role?: string | null;
  /** Called after sign-out completes (e.g. router.push("/login")). */
  onSignOut?: () => void;
  /** Anchor the popup above the trigger (for bottom-of-sidebar placement). */
  placement?: "top" | "bottom";
  className?: string;
};

function initialsOf(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/**
 * Avatar trigger → menu with name, role, theme toggle, density toggle, sign out.
 * Uses useTheme + useAuthActions. Pass the current user's name/role as props
 * (presentation-only; no data hook of its own).
 *
 * <UserMenu name={user.name} role={user.role} onSignOut={() => router.push("/login")} />
 */
export function UserMenu({
  name,
  role,
  onSignOut,
  placement = "top",
  className,
}: UserMenuProps) {
  const { theme, density, toggleTheme, toggleDensity } = useTheme();
  const { signOut } = useAuthActions();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    onSignOut?.();
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="flex items-center gap-2 w-full rounded-md p-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg text-sm font-semibold">
          {initialsOf(name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-text truncate">
            {name ?? "Account"}
          </span>
          {role && (
            <span className="block text-xs text-text-muted capitalize truncate">
              {role}
            </span>
          )}
        </span>
        <Icon
          name={placement === "top" ? "chevron-up" : "chevron-down"}
          size={16}
          className="text-text-muted shrink-0"
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="User menu"
          className={cn(
            "absolute left-0 right-0 bg-surface border border-border rounded-lg shadow-md p-1",
            placement === "top" ? "bottom-full mb-2" : "top-full mt-2",
          )}
          style={{ zIndex: "var(--z-dropdown)" }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={toggleTheme}
            className="flex items-center justify-between gap-3 w-full rounded-md px-3 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-center gap-2">
              <Icon name={theme === "dark" ? "moon" : "sun"} size={16} />
              Theme
            </span>
            <span className="text-xs text-text-muted capitalize">{theme}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={toggleDensity}
            className="flex items-center justify-between gap-3 w-full rounded-md px-3 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-center gap-2">
              <Icon name="bar-chart" size={16} />
              Density
            </span>
            <span className="text-xs text-text-muted capitalize">
              {density}
            </span>
          </button>
          <div className="my-1 border-t border-border" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm text-danger hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon name="log-out" size={16} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default UserMenu;
